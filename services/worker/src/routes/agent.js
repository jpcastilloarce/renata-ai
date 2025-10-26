import { Hono } from 'hono';
import { logEvent } from '../utils/logger.js';
import { callOpenAI } from '../utils/openai.js';

const router = new Hono();

// System prompt del agente AI
const AGENT_SYSTEM_PROMPT = `Eres Renata, un asistente virtual experto en temas tributarios del Servicio de Impuestos Internos (SII) de Chile, especializada en el Registro de Compras y Ventas (RCV).

Tu rol es ayudar a contribuyentes chilenos con:
- Consultas sobre sus ventas y compras registradas en el SII
- Información sobre normativas laborales de la dirección del trabajo y obligaciones tributarias
- Fechas de vencimiento de declaraciones (Formulario 29, F22, etc.)
- Interpretación de documentos tributarios electrónicos (DTE)
- Normativa tributaria chilena vigente

Características de tu personalidad:
- Profesional pero cercana y amigable
- Proactiva en ofrecer información relevante
- Explicas conceptos tributarios de forma clara y simple
- Usas ejemplos concretos cuando es necesario
- Siempre saludas al usuario por su nombre cuando está disponible
- Respondes en español de Chile
- Cuando Pregunten por detalle de Factura se refiere al detalle de Compra, donde está el proveedor

Limitaciones:
- NO puedes realizar trámites directamente en el SII
- NO das asesoría legal específica (recomiendas consultar con un contador)
- NO tienes acceso a información que no esté en tu base de datos

Cuando respondas:
1. Sé concisa pero completa
2. Si no tienes información suficiente, dilo claramente
3. Ofrece información adicional relacionada cuando sea útil
4. Si el usuario pregunta algo fuera de tu expertise, sugiere dónde puede encontrar ayuda`;


/**
 * Agent middleware - validate API key
 */
router.use('/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  const apiKey = authHeader.substring(7);

  if (apiKey !== c.env.AGENT_API_KEY) {
    return c.json({ error: 'API key inválida' }, 401);
  }

  await next();
});

/**
 * POST /api/agent/message
 * Handle incoming message from WhatsApp service
 * This endpoint is called by the Node.js WhatsApp service
 */
router.post('/message', async (c) => {
  try {
    const { telefono, mensaje } = await c.req.json();

    if (!telefono || !mensaje) {
      return c.json({ error: 'Se requiere teléfono y mensaje' }, 400);
    }

    // Get RUT and name from phone number, solo si el usuario está verificado
    const user = await c.env.DB.prepare(
      'SELECT rut, nombre FROM contributors WHERE telefono = ? AND verified = 1'
    ).bind(telefono).first();

    if (!user) {
      return c.json({
        respuesta: 'Usuario no registrado. Por favor regístrate en la plataforma primero.'
      });
    }

    const rut = user.rut;
    const nombre = user.nombre;

    // Detectar todas las intenciones
    const intents = detectIntents(mensaje);
    const questionParts = splitQuestionByIntent(mensaje, intents);
    let respuestas = [];
    let proveedorPrincipal = null;
    let periodoProveedor = null;
    let yearProveedor = null;
    let monthProveedor = null;
    for (let i = 0; i < intents.length; i++) {
      const intent = intents[i];
      const fragments = questionParts[intent] || [mensaje];
      for (const fragment of fragments) {
        if (intent === 'detalle_compras' && /mayor proveedor|proveedor principal|principal proveedor|proveedor más grande|proveedor más importante/i.test(fragment)) {
        // Obtener el mayor proveedor y guardar para la siguiente intención
        const months = {
          'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
          'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
          'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
        };
        let monthNum = null;
        for (const [month, num] of Object.entries(months)) {
          if (fragment.toLowerCase().includes(month)) {
            monthNum = num;
            monthProveedor = monthNum;
            break;
          }
        }
        const yearMatch = fragment.match(/20\d{2}/);
        yearProveedor = yearMatch ? yearMatch[0] : new Date().getFullYear();
        periodoProveedor = monthNum ? `${yearProveedor}-${monthNum}` : null;
        // Buscar detalle de compras para ese periodo
        const { results } = await c.env.DB.prepare(`
          SELECT detRznSoc, SUM(detMntTotal) as total
          FROM compras_detalle
          WHERE rut = ? ${periodoProveedor ? 'AND periodo = ?' : ''}
          GROUP BY detRznSoc
          ORDER BY total DESC
          LIMIT 1
        `).bind(...(periodoProveedor ? [rut, periodoProveedor] : [rut])).all();
        if (results.length > 0) {
          proveedorPrincipal = results[0].detRznSoc;
        }
        // Respuesta normal
        respuestas.push(await handleDetailQuestion(c.env, rut, fragment, intent));
      } else if (intent === 'compras' && proveedorPrincipal && /lista.*compra|muestrame.*compra|detalle.*compra|ver.*compra/i.test(fragment)) {
        // Mostrar lista de compras SOLO de ese proveedor y periodo
        if (periodoProveedor && proveedorPrincipal) {
          const { results } = await c.env.DB.prepare(`
            SELECT detTipoDoc, detNroDoc, detRznSoc, detMntTotal
            FROM compras_detalle
            WHERE rut = ? AND periodo = ? AND detRznSoc = ?
            ORDER BY detMntTotal DESC
            LIMIT 10
          `).bind(rut, periodoProveedor, proveedorPrincipal).all();
          if (results.length > 0) {
            const monthName = Object.keys({
              'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
              'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
              'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
            }).find(key => {
              return {
                'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
                'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
                'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
              }[key] === monthProveedor;
            });
            let detalle = results.map(r => `DTE ${r.detTipoDoc} folio ${r.detNroDoc} - ${r.detRznSoc}: CLP ${Number(r.detMntTotal).toLocaleString('es-CL')}`).join('\n');
            respuestas.push(`Lista de compras a tu principal proveedor (${proveedorPrincipal}) en ${monthName} ${yearProveedor} (máximo 10):\n${detalle}`);
          } else {
            respuestas.push(`No encontré compras a tu principal proveedor (${proveedorPrincipal}) en el periodo consultado.`);
          }
        } else {
          respuestas.push('No se pudo determinar el periodo o proveedor principal para mostrar la lista de compras.');
        }
      } else if (intent === 'iva') {
        respuestas.push(await handleIVAQuestion(c.env, rut, fragment));
      } else if (intent === 'rentabilidad') {
        respuestas.push(await handleRentabilidadQuestion(c.env, rut, fragment));
      } else if (intent === 'clientes') {
        respuestas.push(await handleClientesQuestion(c.env, rut, fragment));
      } else if (intent === 'proveedores') {
        respuestas.push(await handleProveedoresQuestion(c.env, rut, fragment));
      } else if (intent === 'reserva') {
        respuestas.push(await handleReservaQuestion(c.env, rut, fragment));
      } else if (intent === 'ventas' || intent === 'compras') {
        respuestas.push(await handleTaxQuestion(c.env, rut, fragment, intent));
      } else if (intent === 'detalle_ventas' || intent === 'detalle_compras') {
        respuestas.push(await handleDetailQuestion(c.env, rut, fragment, intent));
      } else if (intent === 'contrato') {
        respuestas.push(await handleContractQuestion(c.env, rut, fragment));
      } else if (intent === 'general') {
        // Llamada directa a OpenAI (gpt-4o) para que busque en internet
        const aiFallback = await callOpenAI(c.env.OPENAI_API_KEY, [
          { role: 'user', content: fragment }
        ]);
        if (aiFallback) {
          respuestas.push(aiFallback);
        } else {
          respuestas.push('No pude encontrar información relevante.');
        }
      }
    }
    }
    // Post-procesamiento para insights adicionales
    let answer = respuestas.join('\n\n');
    answer = await postProcessCombinedAnswer({
      respuestas,
      mensaje,
      rut,
      nombre,
      fechaActual: new Date(),
    });

    // Store messages
    await c.env.DB.prepare(
      'INSERT INTO messages (rut, sender, content) VALUES (?, ?, ?)'
    ).bind(rut, 'user', mensaje).run();

    await c.env.DB.prepare(
      'INSERT INTO messages (rut, sender, content) VALUES (?, ?, ?)'
    ).bind(rut, 'agent', answer).run();

    return c.json({ respuesta: answer });
  } catch (error) {
    console.error('Error processing agent message:', error);
    return c.json({ error: 'Error al procesar mensaje' }, 500);
  }
});

// Post-procesamiento de respuestas combinadas para entregar insights adicionales
async function postProcessCombinedAnswer({ respuestas, mensaje, rut, nombre, fechaActual }) {
  let combined = respuestas.join('\n\n');
  // Buscar si hay respuesta de ventas con monto
  const ventaRegex = /(?:vendiste|ventas).*?CLP\s*([\d\.\,]+)/i;
  const matchVenta = combined.match(ventaRegex);
  let iva = null;
  if (matchVenta) {
    // Extraer monto de ventas
    let montoStr = matchVenta[1].replace(/\./g, '').replace(/,/g, '');
    let monto = parseInt(montoStr, 10);
    if (!isNaN(monto) && monto > 0) {
      iva = Math.round(monto * 0.19);
      combined += `\n\n💡 Estimación de IVA: Por tus ventas, deberías declarar un IVA aproximado de CLP ${iva.toLocaleString('es-CL')}.`;
      // Agregar recordatorio de pago si estamos cerca de fin de mes
      const dia = fechaActual.getDate();
      if (dia >= 20 && dia <= 31) {
        combined += '\n🔔 Recuerda: El plazo para declarar y pagar el IVA (F29) vence el día 20 del mes siguiente.';
      }
    }
  }
  // Se puede extender para compras, contratos, etc.
  return combined;
}

// Detecta todas las intenciones presentes en la pregunta
function detectIntents(question) {
  const lower = question.toLowerCase();
  const fragments = question.split(/\s+y\s+|\.\s+|\?\s+/i).map(f => f.trim()).filter(Boolean);
  const intents = [];
  for (const fragment of fragments) {
    const l = fragment.toLowerCase();

    // IVA y cálculos tributarios
    if (l.match(/iva.*pagar|pagar.*iva|iva.*debo|cuánto.*iva|iva.*débito|iva.*crédito|iva.*cobr|saldo.*pagar|saldo.*favor/)) {
      intents.push('iva');
    }
    // Rentabilidad y márgenes
    else if (l.match(/ganancia|pérdida|ganando|margen|rentabilidad|utilidad|quedó.*libre|estoy mejor|estoy peor/)) {
      intents.push('rentabilidad');
    }
    // Clientes principales
    else if (l.match(/principales clientes|mejores clientes|cliente.*más|a quién.*vend/)) {
      intents.push('clientes');
    }
    // Proveedores principales (pero no el mayor proveedor específico)
    else if (l.match(/principales proveedores|proveedores.*más|a quién.*compr/) && !l.match(/mayor proveedor|proveedor principal/)) {
      intents.push('proveedores');
    }
    // Reserva para impuestos
    else if (l.match(/guardar.*impuesto|reservar|debería.*separar|cuánta.*plata.*impuesto/)) {
      intents.push('reserva');
    }
    // Detectar preguntas sobre el mayor proveedor o proveedor principal
    else if (l.match(/mayor proveedor|proveedor principal|principal proveedor|proveedor más grande|proveedor más importante/)) {
      intents.push('detalle_compras');
    }
    else if (l.match(/detalle.*(venta|factur)/) || l.match(/(venta|factur).*detalle/)) intents.push('detalle_ventas');
    else if (l.match(/detalle.*(compra|proveedor)/) || l.match(/(compra|proveedor).*detalle/)) intents.push('detalle_compras');
    else if ((l.includes('vendí') || (l.includes('venta') && !l.includes('detalle')) || l.includes('factur'))) intents.push('ventas');
    else if ((l.includes('compré') || (l.includes('compra') && !l.includes('detalle')))) intents.push('compras');
    else if (l.includes('proveedor')) intents.push('detalle_compras');
    else if (l.includes('contrato') || l.includes('cláusula') || l.includes('vigente') || l.includes('normativa')) intents.push('contrato');
    else intents.push('general');
  }
  return intents;
}

// Asocia fragmentos de la pregunta a cada intención detectada
function splitQuestionByIntent(question, intents) {
  // Separar por " y " o ". " o "? " para preguntas compuestas
  const fragments = question.split(/\s+y\s+|\.\s+|\?\s+/i).map(f => f.trim()).filter(Boolean);
  const mapping = {};
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    if (!mapping[intent]) mapping[intent] = [];
    mapping[intent].push(fragments[i] || question);
  }
  return mapping;
}

// Helper functions (duplicated from contratos.js for modularity)

function categorizeQuestion(question) {
  const lowerQuestion = question.toLowerCase();

  // Detalle de ventas
  if (lowerQuestion.includes('detalle') && (lowerQuestion.includes('venta') || lowerQuestion.includes('factur'))) {
    return 'detalle_ventas';
  }
  // Detalle de compras
  if (lowerQuestion.includes('detalle') && (lowerQuestion.includes('compra') || lowerQuestion.includes('proveedor'))) {
    return 'detalle_compras';
  }
  // Ventas
  if (lowerQuestion.includes('vendí') || (lowerQuestion.includes('venta') && !lowerQuestion.includes('detalle')) || lowerQuestion.includes('factur')) {
    return 'ventas';
  }
  // Compras
  if (lowerQuestion.includes('compré') || (lowerQuestion.includes('compra') && !lowerQuestion.includes('detalle')) || lowerQuestion.includes('proveedor')) {
    return 'compras';
  }
  // Contratos
  if (lowerQuestion.includes('contrato') || lowerQuestion.includes('cláusula') || lowerQuestion.includes('vigente') || lowerQuestion.includes('normativa')) {
    return 'contrato';
  }
  return 'general';
}

// Handler para preguntas de IVA
async function handleIVAQuestion(env, rut, question) {
  const months = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  // Detectar periodo
  let monthNum = null;
  for (const [month, num] of Object.entries(months)) {
    if (question.toLowerCase().includes(month)) {
      monthNum = num;
      break;
    }
  }
  const yearMatch = question.match(/20\d{2}/);
  const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
  const periodo = monthNum ? `${year}-${monthNum}` : null;

  if (!periodo) {
    // Usar el último periodo disponible
    const { results: lastPeriod } = await env.DB.prepare(
      'SELECT periodo FROM ventas_detalle WHERE rut = ? ORDER BY periodo DESC LIMIT 1'
    ).bind(rut).all();

    if (lastPeriod.length === 0) {
      return 'No encontré datos de ventas en tu historial.';
    }

    const [y, m] = lastPeriod[0].periodo.split('-');
    const monthName = Object.keys(months).find(key => months[key] === m);

    const ivaData = await calculateIVA(env, rut, lastPeriod[0].periodo);
    return formatIVAResponse(ivaData, monthName, y);
  }

  const ivaData = await calculateIVA(env, rut, periodo);
  const monthName = Object.keys(months).find(key => months[key] === monthNum);
  return formatIVAResponse(ivaData, monthName, year);
}

async function calculateIVA(env, rut, periodo) {
  // IVA Débito (ventas)
  const { results: ventas } = await env.DB.prepare(`
    SELECT SUM(detMntIVA) as iva_debito, SUM(detMntTotal) as total_ventas, SUM(detMntNeto) as neto_ventas
    FROM ventas_detalle
    WHERE rut = ? AND periodo = ?
  `).bind(rut, periodo).all();

  // IVA Crédito (compras)
  const { results: compras } = await env.DB.prepare(`
    SELECT SUM(detIVARecuperable) as iva_credito, SUM(detMntTotal) as total_compras, SUM(detMntNeto) as neto_compras
    FROM compras_detalle
    WHERE rut = ? AND periodo = ?
  `).bind(rut, periodo).all();

  const ivaDebito = Number(ventas[0]?.iva_debito || 0);
  const ivaCredito = Number(compras[0]?.iva_credito || 0);
  const saldo = ivaDebito - ivaCredito;

  return {
    ivaDebito,
    ivaCredito,
    saldo,
    totalVentas: Number(ventas[0]?.total_ventas || 0),
    totalCompras: Number(compras[0]?.total_compras || 0),
    netoVentas: Number(ventas[0]?.neto_ventas || 0),
    netoCompras: Number(compras[0]?.neto_compras || 0)
  };
}

function formatIVAResponse(data, monthName, year) {
  const tipo = data.saldo > 0 ? 'a pagar' : 'a favor';
  const saldoAbs = Math.abs(data.saldo);

  return `📊 Resumen de IVA para ${monthName} ${year}:

💰 IVA Débito (ventas): CLP ${data.ivaDebito.toLocaleString('es-CL')}
💳 IVA Crédito (compras): CLP ${data.ivaCredito.toLocaleString('es-CL')}
━━━━━━━━━━━━━━━━━
${data.saldo >= 0 ? '🔴' : '🟢'} Saldo ${tipo}: CLP ${saldoAbs.toLocaleString('es-CL')}

📈 Total ventas: CLP ${data.totalVentas.toLocaleString('es-CL')}
📉 Total compras: CLP ${data.totalCompras.toLocaleString('es-CL')}`;
}

// Handler para preguntas de rentabilidad
async function handleRentabilidadQuestion(env, rut, question) {
  const months = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  // Detectar periodo
  let monthNum = null;
  for (const [month, num] of Object.entries(months)) {
    if (question.toLowerCase().includes(month)) {
      monthNum = num;
      break;
    }
  }
  const yearMatch = question.match(/20\d{2}/);
  const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
  const periodo = monthNum ? `${year}-${monthNum}` : null;

  if (!periodo) {
    // Usar último periodo
    const { results: lastPeriod } = await env.DB.prepare(
      'SELECT periodo FROM ventas_detalle WHERE rut = ? ORDER BY periodo DESC LIMIT 1'
    ).bind(rut).all();

    if (lastPeriod.length === 0) {
      return 'No encontré datos para calcular rentabilidad.';
    }

    const [y, m] = lastPeriod[0].periodo.split('-');
    const monthName = Object.keys(months).find(key => months[key] === m);
    const rentabilidad = await calculateRentabilidad(env, rut, lastPeriod[0].periodo);
    return formatRentabilidadResponse(rentabilidad, monthName, y);
  }

  const rentabilidad = await calculateRentabilidad(env, rut, periodo);
  const monthName = Object.keys(months).find(key => months[key] === monthNum);
  return formatRentabilidadResponse(rentabilidad, monthName, year);
}

async function calculateRentabilidad(env, rut, periodo) {
  const { results: ventas } = await env.DB.prepare(`
    SELECT SUM(detMntNeto) as ingresos
    FROM ventas_detalle
    WHERE rut = ? AND periodo = ?
  `).bind(rut, periodo).all();

  const { results: compras } = await env.DB.prepare(`
    SELECT SUM(detMntNeto) as gastos
    FROM compras_detalle
    WHERE rut = ? AND periodo = ?
  `).bind(rut, periodo).all();

  const ingresos = Number(ventas[0]?.ingresos || 0);
  const gastos = Number(compras[0]?.gastos || 0);
  const utilidad = ingresos - gastos;
  const margen = ingresos > 0 ? (utilidad / ingresos * 100) : 0;
  const ivaAPagar = utilidad * 0.19;

  return { ingresos, gastos, utilidad, margen, ivaAPagar };
}

function formatRentabilidadResponse(data, monthName, year) {
  const estado = data.utilidad >= 0 ? '✅ Ganancia' : '❌ Pérdida';
  const utilidadNeta = data.utilidad - data.ivaAPagar;

  return `💼 Análisis de Rentabilidad - ${monthName} ${year}:

📈 Ingresos (neto): CLP ${data.ingresos.toLocaleString('es-CL')}
📉 Gastos (neto): CLP ${data.gastos.toLocaleString('es-CL')}
━━━━━━━━━━━━━━━━━
${estado}: CLP ${Math.abs(data.utilidad).toLocaleString('es-CL')}
📊 Margen: ${data.margen.toFixed(1)}%

💰 Después de IVA (~19%): CLP ${utilidadNeta.toLocaleString('es-CL')}`;
}

// Handler para principales clientes
async function handleClientesQuestion(env, rut, question) {
  const months = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  let monthNum = null;
  for (const [month, num] of Object.entries(months)) {
    if (question.toLowerCase().includes(month)) {
      monthNum = num;
      break;
    }
  }
  const yearMatch = question.match(/20\d{2}/);
  const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
  const periodo = monthNum ? `${year}-${monthNum}` : null;

  const { results } = await env.DB.prepare(`
    SELECT detRznSoc, SUM(detMntTotal) as total, COUNT(*) as cantidad
    FROM ventas_detalle
    WHERE rut = ? ${periodo ? 'AND periodo = ?' : ''}
    GROUP BY detRznSoc
    ORDER BY total DESC
    LIMIT 5
  `).bind(...(periodo ? [rut, periodo] : [rut])).all();

  if (results.length === 0) {
    return 'No encontré clientes en tu historial de ventas.';
  }

  const monthName = monthNum ? Object.keys(months).find(key => months[key] === monthNum) : 'todo el período';
  let respuesta = `👥 Tus principales clientes en ${monthName} ${year}:\n\n`;

  results.forEach((cliente, idx) => {
    respuesta += `${idx + 1}. ${cliente.detRznSoc}\n`;
    respuesta += `   💰 Total: CLP ${Number(cliente.total).toLocaleString('es-CL')} (${cliente.cantidad} documentos)\n\n`;
  });

  return respuesta.trim();
}

// Handler para principales proveedores
async function handleProveedoresQuestion(env, rut, question) {
  const months = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  let monthNum = null;
  for (const [month, num] of Object.entries(months)) {
    if (question.toLowerCase().includes(month)) {
      monthNum = num;
      break;
    }
  }
  const yearMatch = question.match(/20\d{2}/);
  const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
  const periodo = monthNum ? `${year}-${monthNum}` : null;

  const { results } = await env.DB.prepare(`
    SELECT detRznSoc, SUM(detMntTotal) as total, COUNT(*) as cantidad
    FROM compras_detalle
    WHERE rut = ? ${periodo ? 'AND periodo = ?' : ''}
    GROUP BY detRznSoc
    ORDER BY total DESC
    LIMIT 5
  `).bind(...(periodo ? [rut, periodo] : [rut])).all();

  if (results.length === 0) {
    return 'No encontré proveedores en tu historial de compras.';
  }

  const monthName = monthNum ? Object.keys(months).find(key => months[key] === monthNum) : 'todo el período';
  let respuesta = `🏪 Tus principales proveedores en ${monthName} ${year}:\n\n`;

  results.forEach((proveedor, idx) => {
    respuesta += `${idx + 1}. ${proveedor.detRznSoc}\n`;
    respuesta += `   💰 Total: CLP ${Number(proveedor.total).toLocaleString('es-CL')} (${proveedor.cantidad} documentos)\n\n`;
  });

  return respuesta.trim();
}

// Handler para reserva de impuestos
async function handleReservaQuestion(env, rut, question) {
  const months = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  // Usar último periodo
  const { results: lastPeriod } = await env.DB.prepare(
    'SELECT periodo FROM ventas_detalle WHERE rut = ? ORDER BY periodo DESC LIMIT 1'
  ).bind(rut).all();

  if (lastPeriod.length === 0) {
    return 'No encontré datos para calcular la reserva de impuestos.';
  }

  const periodo = lastPeriod[0].periodo;
  const ivaData = await calculateIVA(env, rut, periodo);
  const rentabilidad = await calculateRentabilidad(env, rut, periodo);

  const [y, m] = periodo.split('-');
  const monthName = Object.keys(months).find(key => months[key] === m);

  // Calcular reserva recomendada
  const ivaAPagar = Math.max(0, ivaData.saldo);
  const impuestoRenta = rentabilidad.utilidad > 0 ? rentabilidad.utilidad * 0.25 : 0; // ~25% aprox
  const reservaTotal = ivaAPagar + impuestoRenta;

  return `💰 Reserva Recomendada de Impuestos (basado en ${monthName} ${y}):

🔴 IVA a pagar: CLP ${ivaAPagar.toLocaleString('es-CL')}
🔴 Impuesto a la renta estimado (~25%): CLP ${impuestoRenta.toLocaleString('es-CL')}
━━━━━━━━━━━━━━━━━
💵 Total recomendado a reservar: CLP ${reservaTotal.toLocaleString('es-CL')}

💡 Tip: El plazo para declarar y pagar el IVA (F29) vence el día 20 del mes siguiente.`;
}

async function handleContractQuestion(env, rut, question) {
  try {
    // Usar Vectorize para buscar en los contratos
    const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: question
    });

    const results = await env.CONTRATOS_INDEX.query(embedding.data[0], {
      topK: 3,
      filter: { rut }
    });

    if (results.matches && results.matches.length > 0) {
      // Combinar contextos encontrados
      const contexts = results.matches.map(m => m.metadata?.text || '').filter(Boolean);

      if (contexts.length > 0) {
        // Usar OpenAI para generar respuesta basada en contexto
        const prompt = `Basándote en la siguiente información de contratos, responde la pregunta del usuario de manera concisa:

Contexto:
${contexts.join('\n\n')}

Pregunta: ${question}

Responde de manera clara y concisa en español de Chile.`;

        const aiResponse = await callOpenAI(env.OPENAI_API_KEY, [
          { role: 'user', content: prompt }
        ]);

        return aiResponse || 'No pude generar una respuesta sobre contratos.';
      }
    }

    return 'No encontré información relevante en tus contratos. ¿Podrías reformular tu pregunta?';
  } catch (error) {
    console.error('Error in handleContractQuestion:', error);
    return 'Lo siento, tuve un problema al buscar en tus contratos.';
  }
}

async function handleTaxQuestion(env, rut, question, type) {
  const months = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  // Detectar periodo en la pregunta
  let periodo = null;
  let monthNum = null;
  for (const [month, num] of Object.entries(months)) {
    if (question.toLowerCase().includes(month)) {
      monthNum = num;
      break;
    }
  }
  const yearMatch = question.match(/20\d{2}/);
  const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
  if (monthNum) {
    periodo = `${year}-${monthNum}`;
  }

  // Determinar tabla según tipo
  const table = type === 'ventas' ? 'ventas' : 'compras';
  const label = type === 'ventas' ? 'vendiste' : 'compraste';

  if (!periodo) {
    // Si no hay periodo, buscar el último disponible
    const { results } = await env.DB.prepare(`
      SELECT periodo, SUM(mntTotal) as total
      FROM ${table}
      WHERE rut = ?
      GROUP BY periodo
      ORDER BY periodo DESC
      LIMIT 1
    `).bind(rut).all();
    if (results.length > 0) {
      const [year, month] = results[0].periodo.split('-');
      const monthName = Object.keys(months).find(key => months[key] === month);
      return `Tu último registro de ${type} fue en ${monthName} ${year} con un total de CLP ${Number(results[0].total).toLocaleString('es-CL')}.`;
    }
    return `No encontré registros de ${type} en tu historial.`;
  }

  // Buscar monto para el periodo
  const { results } = await env.DB.prepare(`
    SELECT SUM(mntTotal) as total
    FROM ${table}
    WHERE rut = ? AND periodo = ?
  `).bind(rut, periodo).all();

  if (results.length > 0 && results[0].total) {
    const monthName = Object.keys(months).find(key => months[key] === monthNum);
    return `En ${monthName} ${year} ${label} un total de CLP ${Number(results[0].total).toLocaleString('es-CL')}.`;
  }
  return `No encontré registros de ${type} para ${Object.keys(months).find(key => months[key] === monthNum)} ${year}.`;
}

// Handler para detalle de ventas y compras
async function handleDetailQuestion(env, rut, question, type) {
  const months = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };
  let periodo = null;
  let monthNum = null;
  for (const [month, num] of Object.entries(months)) {
    if (question.toLowerCase().includes(month)) {
      monthNum = num;
      break;
    }
  }
  const yearMatch = question.match(/20\d{2}/);
  const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
  if (monthNum) {
    periodo = `${year}-${monthNum}`;
  }
  // Selección de tabla y campos
  let table, label, selectFields, formatRow;
  const preguntaMayorProveedor = /mayor proveedor|proveedor principal|principal proveedor|proveedor más grande|proveedor más importante/i.test(question);
  if (type === 'detalle_ventas') {
    table = 'ventas_detalle';
    label = 'ventas';
    selectFields = 'detTipoDoc, detNroDoc, detRznSoc, detMntTotal';
    formatRow = r => `DTE ${r.detTipoDoc} folio ${r.detNroDoc} - ${r.detRznSoc}: CLP ${Number(r.detMntTotal).toLocaleString('es-CL')}`;
  } else {
    table = 'compras_detalle';
    label = 'compras';
    selectFields = 'detTipoDoc, detNroDoc, detRznSoc, detMntTotal';
    formatRow = r => `DTE ${r.detTipoDoc} folio ${r.detNroDoc} - ${r.detRznSoc}: CLP ${Number(r.detMntTotal).toLocaleString('es-CL')}`;
  }
  if (!periodo) {
    // Si no hay periodo, buscar el último disponible
    const { results } = await env.DB.prepare(`
      SELECT periodo, COUNT(*) as cantidad
      FROM ${table}
      WHERE rut = ?
      GROUP BY periodo
      ORDER BY periodo DESC
      LIMIT 1
    `).bind(rut).all();
    if (results.length > 0 && results[0].cantidad) {
      const [year, month] = results[0].periodo.split('-');
      const monthName = Object.keys(months).find(key => months[key] === month);
      return `Tu último detalle de ${label} fue en ${monthName} ${year} con ${results[0].cantidad} documentos.`;
    }
    return `No encontré detalles de ${label} en tu historial.`;
  }
  // Buscar detalle para el periodo
  const { results } = await env.DB.prepare(`
    SELECT ${selectFields}
    FROM ${table}
    WHERE rut = ? AND periodo = ?
    ORDER BY detMntTotal DESC
    LIMIT 20
  `).bind(rut, periodo).all();
  if (results.length > 0) {
    const monthName = Object.keys(months).find(key => months[key] === monthNum);
    if (preguntaMayorProveedor && type === 'detalle_compras') {
      // Agrupar por proveedor y sumar montos
      const proveedores = {};
      for (const row of results) {
        if (!proveedores[row.detRznSoc]) proveedores[row.detRznSoc] = 0;
        proveedores[row.detRznSoc] += Number(row.detMntTotal);
      }
      // Encontrar el proveedor con mayor monto
      let mayorProveedor = null;
      let mayorMonto = 0;
      for (const [proveedor, monto] of Object.entries(proveedores)) {
        if (monto > mayorMonto) {
          mayorProveedor = proveedor;
          mayorMonto = monto;
        }
      }
      if (mayorProveedor) {
        return `Tu mayor proveedor en ${monthName} ${year} fue "${mayorProveedor}" con un total de CLP ${mayorMonto.toLocaleString('es-CL')}.`;
      } else {
        return `No encontré información suficiente para determinar el mayor proveedor en ${monthName} ${year}.`;
      }
    } else {
      let detalle = results.map(formatRow).join('\n');
      return `Detalle de ${label} para ${monthName} ${year}:\n${detalle}`;
    }
  }
  return `No encontré detalles de ${label} para ${monthNum ? Object.keys(months).find(key => months[key] === monthNum) : ''} ${year}.`;
}

export default router;
