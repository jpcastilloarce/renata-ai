/**
 * prospecto-claude.js
 * Maneja conversaciones con prospectos usando Claude + MCP
 *
 * FLUJO:
 * 1. Obtiene historial de conversación desde D1
 * 2. Llama a Claude con herramientas MCP disponibles
 * 3. Claude decide autónomamente si agendar reunión o registrar contributor
 * 4. Guarda mensaje y respuesta en historial D1
 * 5. Convierte respuesta a audio si viene de WhatsApp
 */

import { Hono } from 'hono';
import { callClaude, createMCPClient } from '../utils/claude.js';
import { formatResponse } from '../utils/responseFormatter.js';

const router = new Hono();

// System prompt para Claude
const PROSPECTO_SYSTEM_PROMPT = `Eres un asistente de ventas de Renata, una plataforma de gestión tributaria para empresas chilenas.

TU OBJETIVO PRINCIPAL:
1. Identificar si el prospecto tiene un código de activación
   - Si tiene código → Usar la herramienta 'registrar_contributor' para crear su cuenta
   - Solicitar: RUT, nombre, clave del SII, contraseña para la plataforma, y teléfono de la empresa
   - IMPORTANTE TELÉFONO: Pedir SOLO números, sin símbolos como + o guiones (ejemplo correcto: 56993788826)
   - El teléfono debe ser el mismo desde el cual están escribiendo por WhatsApp

2. Si NO tiene código de activación
   - Ofrecer agendar una reunión con el equipo de ventas
   - Usar la herramienta 'agendar_reunion' cuando el prospecto acepte
   - Solicitar: fecha, hora preferida, y al menos un método de contacto (teléfono o email)
   - El teléfono NO es obligatorio si el prospecto proporciona email

INFORMACIÓN SOBRE RENATA:
- Consulta automática de ventas y compras desde el SII
- Informes tributarios mensuales
- Alertas de vencimientos (F29, F22, etc.)
- Asistente AI experto en normativa tributaria chilena
- Integración directa con el Servicio de Impuestos Internos

ESTILO DE COMUNICACIÓN:
- Profesional pero cercano y amigable
- SIN emojis ni iconos (la respuesta será convertida a audio)
- Respuestas concisas (máximo 3-4 oraciones por mensaje)
- En español de Chile
- Usa un tono consultivo, no agresivo en ventas

FORMATO DE RESPUESTAS (MUY IMPORTANTE):
- TODOS los números deben escribirse en PALABRAS, NO en dígitos
- Ejemplos: "+56977777777" → "más cinco seis nueve siete siete siete siete siete siete siete siete"
- Fechas: "27 de enero" → "veintisiete de enero"
- Horas: "10:00" → "diez horas" o "las diez"
- RUT: "76123456-7" → "siete seis uno dos tres cuatro cinco seis guión siete"
- Esto es CRÍTICO porque el texto se convierte a audio y ElevenLabs necesita palabras, no números

IMPORTANTE:
- Cuando recibas el PRIMER mensaje, SIEMPRE pregunta si tiene código de activación o si prefiere agendar reunión
- Valida códigos de activación antes de solicitar todos los datos (usa 'validar_codigo_activacion')
- Para reuniones, confirma disponibilidad: lunes a viernes, 9:00 a 18:00
- Sé persistente pero respetuoso en guiar hacia una de las dos acciones (código o reunión)
- NO inventes información sobre precios o planes, deriva a ventas

HERRAMIENTAS DISPONIBLES:
- validar_codigo_activacion: Verifica si un código es válido antes de registrar
- registrar_contributor: Registra una nueva empresa con código de activación
- agendar_reunion: Agenda una reunión en Google Calendar con el equipo`;

/**
 * Middleware de autenticación
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
 * Obtiene el historial de conversación desde D1
 */
async function getConversationHistory(db, telefono) {
  try {
    const { results } = await db.prepare(`
      SELECT mensaje_cliente, respuesta_agente, timestamp
      FROM conversation_history
      WHERE telefono = ?
        AND timestamp > datetime('now', '-24 hours')
      ORDER BY timestamp ASC
      LIMIT 10
    `).bind(telefono).all();

    if (!results || results.length === 0) {
      return [];
    }

    const history = [];
    for (const row of results) {
      history.push(
        { role: 'user', content: row.mensaje_cliente },
        { role: 'assistant', content: row.respuesta_agente }
      );
    }

    return history;
  } catch (error) {
    console.error('[PROSPECTO] Error obteniendo historial:', error);
    return [];
  }
}

/**
 * Guarda un intercambio en el historial D1
 */
async function saveToConversationHistory(db, telefono, userMessage, assistantResponse) {
  try {
    await db.prepare(`
      INSERT INTO conversation_history (telefono, mensaje_cliente, respuesta_agente)
      VALUES (?, ?, ?)
    `).bind(telefono, userMessage, assistantResponse).run();

    console.log(`[PROSPECTO] Historial guardado para ${telefono}`);
  } catch (error) {
    console.error('[PROSPECTO] Error guardando historial:', error);
  }
}

/**
 * Formatea la respuesta según el origen
 */
async function formatearRespuestaSegunOrigen(textoRespuesta, source, env) {
  const esWhatsApp = (source === 'whatsapp');

  const respuestaFormateada = await formatResponse({
    texto: textoRespuesta,
    env,
    esWhatsApp
  });

  if (respuestaFormateada.tipo === 'audio') {
    return {
      tipo: 'audio',
      contenido: Array.from(new Uint8Array(respuestaFormateada.contenido)),
      mimeType: respuestaFormateada.mimeType,
      textoOriginal: respuestaFormateada.textoOriginal
    };
  }

  return {
    tipo: 'texto',
    respuesta: textoRespuesta
  };
}

/**
 * POST /api/prospecto/message
 * Endpoint principal para mensajes de prospectos con Claude + MCP
 */
router.post('/message', async (c) => {
  try {
    const { telefono, mensaje, source = 'api' } = await c.req.json();

    console.log(`[PROSPECTO-CLAUDE] === INICIO REQUEST ===`);
    console.log(`[PROSPECTO-CLAUDE] Teléfono: ${telefono}`);
    console.log(`[PROSPECTO-CLAUDE] Mensaje: "${mensaje}"`);
    console.log(`[PROSPECTO-CLAUDE] Source: ${source}`);

    if (!telefono || !mensaje) {
      return c.json({ error: 'Se requiere telefono y mensaje' }, 400);
    }

    // Obtener historial de conversación
    const history = await getConversationHistory(c.env.DB, telefono);
    console.log(`[PROSPECTO-CLAUDE] Historial encontrado: ${history.length} mensajes`);

    // Crear cliente MCP con contexto del teléfono
    let mcpClient = null;
    try {
      const mcpServerUrl = c.env.MCP_SERVER_URL || 'http://localhost:3001/mcp';
      // Pasar el teléfono de WhatsApp como contexto para auto-verificación
      mcpClient = await createMCPClient(mcpServerUrl, { telefono_whatsapp: telefono });
      console.log(`[PROSPECTO-CLAUDE] MCP Client connected with ${mcpClient.tools.length} tools`);
    } catch (error) {
      console.error('[PROSPECTO-CLAUDE] Error connecting to MCP:', error);
      // Continuar sin MCP si falla
    }

    // Construir mensajes para Claude
    const messages = [
      ...history,
      { role: 'user', content: mensaje }
    ];

    // Llamar a Claude con MCP
    const respuestaTexto = await callClaude(
      c.env.ANTHROPIC_API_KEY,
      messages,
      PROSPECTO_SYSTEM_PROMPT,
      mcpClient,
      5 // max iterations
    );

    console.log(`[PROSPECTO-CLAUDE] Respuesta de Claude: "${respuestaTexto.substring(0, 200)}..."`);

    // Guardar en historial
    await saveToConversationHistory(c.env.DB, telefono, mensaje, respuestaTexto);

    // Formatear respuesta según origen (SIEMPRE audio si es WhatsApp)
    const respuestaFormateada = await formatearRespuestaSegunOrigen(
      respuestaTexto,
      source,
      c.env
    );

    console.log(`[PROSPECTO-CLAUDE] Respuesta formateada - Tipo: ${respuestaFormateada.tipo || 'texto'}`);
    if (respuestaFormateada.tipo === 'audio') {
      console.log(`[PROSPECTO-CLAUDE] Audio generado - MimeType: ${respuestaFormateada.mimeType}, Tamaño: ${respuestaFormateada.contenido.length} bytes`);
    }

    return c.json(respuestaFormateada);

  } catch (error) {
    console.error('[PROSPECTO-CLAUDE] ===== ERROR =====');
    console.error('[PROSPECTO-CLAUDE] Error:', error);
    console.error('[PROSPECTO-CLAUDE] Stack:', error.stack);
    console.error('[PROSPECTO-CLAUDE] ==================');

    // Intentar formatear el error
    try {
      const body = await c.req.json();
      const { source = 'api' } = body;

      const mensajeError = 'Lo siento, ocurrió un error al procesar tu mensaje. Por favor intenta nuevamente.';

      const respuestaFormateada = await formatearRespuestaSegunOrigen(
        mensajeError,
        source,
        c.env
      );

      return c.json(respuestaFormateada, 500);
    } catch (formatError) {
      return c.json({ error: 'Error al procesar mensaje' }, 500);
    }
  }
});

export default router;
