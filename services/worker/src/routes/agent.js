import { Hono } from 'hono';
import { logEvent } from '../utils/logger.js';
import { callOpenAI } from '../utils/openai.js';

const router = new Hono();

// System prompt del agente AI
const AGENT_SYSTEM_PROMPT = `Eres Renata, un asistente virtual experto en temas tributarios del Servicio de Impuestos Internos (SII) de Chile, especializada en el Registro de Compras y Ventas (RCV).

Tu rol es ayudar a contribuyentes chilenos con:
- Consultas sobre sus ventas y compras registradas en el SII
- Información sobre contratos y obligaciones tributarias
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

    // Get RUT and name from phone number
    const user = await c.env.DB.prepare(
      'SELECT rut, nombre FROM contributors WHERE telefono = ?'
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
    for (const intent of intents) {
      const fragment = questionParts[intent] || mensaje;
      if (intent === 'ventas' || intent === 'compras') {
        respuestas.push(await handleTaxQuestion(c.env, rut, fragment, intent));
      } else if (intent === 'detalle_ventas' || intent === 'detalle_compras') {
        respuestas.push(await handleDetailQuestion(c.env, rut, fragment, intent));
      } else if (intent === 'contrato') {
        respuestas.push(await handleContractQuestion(c.env, rut, fragment));
      } else if (intent === 'general') {
        if (fragment.toLowerCase().includes('f29') || fragment.toLowerCase().includes('vence')) {
          respuestas.push(`Hola ${nombre}! El Formulario 29 (IVA) vence el día 12 del mes siguiente al período declarado, excepto si cae en fin de semana o festivo.`);
        } else {
          respuestas.push(`Hola ${nombre}! Puedo ayudarte con consultas sobre tus ventas, compras, detalles y contratos. ¿Qué necesitas saber?`);
        }
      }
    }
    // Unir respuestas
    const answer = respuestas.join('\n\n');

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

// Detecta todas las intenciones presentes en la pregunta
function detectIntents(question) {
  const lower = question.toLowerCase();
  const intents = [];
  if (lower.match(/detalle.*(venta|factur)/) || lower.match(/(venta|factur).*detalle/)) intents.push('detalle_ventas');
  if (lower.match(/detalle.*(compra|proveedor)/) || lower.match(/(compra|proveedor).*detalle/)) intents.push('detalle_compras');
  if ((lower.includes('vendí') || (lower.includes('venta') && !lower.includes('detalle')) || lower.includes('factur')) && !intents.includes('ventas')) intents.push('ventas');
  if ((lower.includes('compré') || (lower.includes('compra') && !lower.includes('detalle')) || lower.includes('proveedor')) && !intents.includes('compras')) intents.push('compras');
  if (lower.includes('contrato') || lower.includes('cláusula') || lower.includes('vigente') || lower.includes('normativa')) intents.push('contrato');
  if (intents.length === 0) intents.push('general');
  return intents;
}

// Asocia fragmentos de la pregunta a cada intención detectada
function splitQuestionByIntent(question, intents) {
  // Separar por " y " o ". " o "? " para preguntas compuestas
  const fragments = question.split(/\s+y\s+|\.\s+|\?\s+/i).map(f => f.trim()).filter(Boolean);
  const mapping = {};
  // Heurística simple: asignar fragmento por orden de aparición
  for (let i = 0; i < intents.length; i++) {
    mapping[intents[i]] = fragments[i] || question;
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

async function handleTaxQuestion(env, rut, question, type) {
  const months = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  let periodo = null;
  let monthNum = null;

  // Extract month from question
  for (const [month, num] of Object.entries(months)) {
    if (question.toLowerCase().includes(month)) {
      monthNum = num;
      break;
    }
  }

  // Extract year from question (e.g., "2023", "2024")
  const yearMatch = question.match(/20\d{2}/);
  const year = yearMatch ? yearMatch[0] : new Date().getFullYear();

  if (monthNum) {
    periodo = `${year}-${monthNum}`;
  } else {
    // If no month specified, try to find any data for this RUT
    const table = type === 'ventas' ? 'ventas_resumen' : 'compras_resumen';
    const { results } = await env.DB.prepare(`
      SELECT periodo, SUM(rsmnMntTotal) as total
      FROM ${table}
      WHERE rut = ?
      GROUP BY periodo
      ORDER BY periodo DESC
      LIMIT 1
    `).bind(rut).all();

    if (results.length > 0 && results[0].total) {
      const total = results[0].total;
      const [year, month] = results[0].periodo.split('-');
      const monthName = Object.keys(months).find(key => months[key] === month);
      return `Tu último registro de ${type} fue en ${monthName} ${year} por CLP ${total.toLocaleString('es-CL')}.`;
    }

    return `No encontré datos de ${type} en tu historial.`;
  }

  const table = type === 'ventas' ? 'ventas_resumen' : 'compras_resumen';
  const { results } = await env.DB.prepare(`
    SELECT SUM(rsmnMntTotal) as total
    FROM ${table}
    WHERE rut = ? AND periodo = ?
  `).bind(rut, periodo).all();

  if (results.length > 0 && results[0].total) {
    const total = results[0].total;
    const monthName = Object.keys(months).find(key => months[key] === monthNum);
    return `En ${monthName} de ${year} ${type === 'ventas' ? 'vendiste' : 'compraste'} CLP ${total.toLocaleString('es-CL')}.`;
  }

  return `No encontré datos de ${type} para ${monthNum ? Object.keys(months).find(key => months[key] === monthNum) : ''} ${year}.`;
}

async function handleContractQuestion(env, rut, question) {
  const questionEmbedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: question
  });

  const questionVector = questionEmbedding.data[0];

  // No filter by RUT - contracts are generic SII data accessible to all contributors
  const searchResults = await env.CONTRATOS_INDEX.query(questionVector, {
    topK: 3,
    returnMetadata: true
  });

  if (!searchResults.matches || searchResults.matches.length === 0) {
    return 'No encontré información relevante en los contratos para responder esta pregunta.';
  }

  const fragments = searchResults.matches.map(match => match.metadata.content);
  const context = fragments.join('\n\n');

  const messages = [
    {
      role: 'system',
      content: `Eres un asistente que responde preguntas sobre contratos. Usa el siguiente contexto para responder la pregunta del usuario:\n\n${context}`
    },
    {
      role: 'user',
      content: question
    }
  ];

  const aiResponse = await callOpenAI(env.OPENAI_API_KEY, messages);

  return aiResponse || 'No pude generar una respuesta adecuada.';
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
    LIMIT 5
  `).bind(rut, periodo).all();
  if (results.length > 0) {
    const monthName = Object.keys(months).find(key => months[key] === monthNum);
    let detalle = results.map(formatRow).join('\n');
    return `Detalle de ${label} para ${monthName} ${year}:\n${detalle}`;
  }
  return `No encontré detalles de ${label} para ${monthNum ? Object.keys(months).find(key => months[key] === monthNum) : ''} ${year}.`;
}

export default router;
