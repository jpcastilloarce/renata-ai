/**
 * prospecto.js
 * Maneja conversaciones con prospectos (usuarios no registrados)
 *
 * FLUJO:
 * 1. Obtiene historial de conversacion desde D1 (ultimas 24 horas)
 * 2. Primera llamada OpenAI: Clasifica intencion ('registrar' o 'otro')
 * 3. Segunda llamada OpenAI: Genera respuesta contextual segun clasificacion
 * 4. Guarda mensaje y respuesta en historial D1
 * 5. Retorna respuesta segun origen:
 *    - WhatsApp (source='whatsapp'): Convierte texto a audio usando ElevenLabs
 *    - API/Postman (source='api'): Retorna texto plano
 *
 * EJEMPLOS DE USO:
 *
 * DESDE POSTMAN/API (respuesta en texto):
 * POST /api/prospecto/message
 * {
 *   "telefono": "+56912345678",
 *   "mensaje": "Hola, quiero información sobre Renata"
 * }
 * // O explícitamente:
 * {
 *   "telefono": "+56912345678",
 *   "mensaje": "Hola, quiero información sobre Renata",
 *   "source": "api"
 * }
 * Respuesta: { "respuesta": "Hola! Renata es una plataforma..." }
 *
 * DESDE WHATSAPP (respuesta en audio):
 * POST /api/prospecto/message
 * {
 *   "telefono": "+56912345678",
 *   "mensaje": "Hola, quiero información sobre Renata",
 *   "source": "whatsapp"
 * }
 * Respuesta: { "tipo": "audio", "contenido": [...], "mimeType": "audio/mpeg" }
 */

import { Hono } from 'hono';
import { callOpenAI } from '../utils/openai.js';
import { formatResponse } from '../utils/responseFormatter.js';

const router = new Hono();

/**
 * Middleware de autenticacion
 */
router.use('/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  const apiKey = authHeader.substring(7);

  if (apiKey !== c.env.AGENT_API_KEY) {
    return c.json({ error: 'API key invalida' }, 401);
  }

  await next();
});

/**
 * Obtiene el historial de conversacion desde D1
 * @param {Object} db - D1 Database instance
 * @param {string} telefono - Numero de telefono del usuario
 * @returns {Promise<Array>} - Array de objetos {role: 'user'|'assistant', content: string}
 */
async function getConversationHistory(db, telefono) {
  try {
    // Obtener ultimas conversaciones (ultimas 24 horas, maximo 20 mensajes)
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

    // Convertir a formato OpenAI (alternando user/assistant)
    const history = [];
    for (const row of results) {
      history.push(
        { role: 'user', content: row.mensaje_cliente },
        { role: 'assistant', content: row.respuesta_agente }
      );
    }

    return history;
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    return [];
  }
}

/**
 * Guarda un intercambio (mensaje + respuesta) en el historial D1
 * @param {Object} db - D1 Database instance
 * @param {string} telefono - Numero de telefono
 * @param {string} userMessage - Mensaje del usuario
 * @param {string} assistantResponse - Respuesta del asistente
 */
async function saveToConversationHistory(db, telefono, userMessage, assistantResponse) {
  try {
    await db.prepare(`
      INSERT INTO conversation_history (telefono, mensaje_cliente, respuesta_agente)
      VALUES (?, ?, ?)
    `).bind(telefono, userMessage, assistantResponse).run();

    console.log(`Historial guardado para ${telefono}`);
  } catch (error) {
    console.error('Error guardando historial:', error);
  }
}

/**
 * Clasifica la intencion del mensaje usando OpenAI
 * @param {string} apiKey - OpenAI API Key
 * @param {string} mensaje - Mensaje del usuario
 * @param {Array} history - Historial de conversacion
 * @returns {Promise<string>} - 'registrar' o 'otro'
 */
async function clasificarIntencion(apiKey, mensaje, history) {
  const systemPrompt = `Analiza el mensaje del prospecto y segun el contexto del mensaje debes responder SOLAMENTE con 2 opciones:
1) Si el contexto del mensaje esta relacionado en registrar su empresa o quiere saber como registrar su empresa debe responder 'registrar'
2) Cualquier otro tipo de contexto debe responder 'otro'

IMPORTANTE: Responde UNICAMENTE con la palabra 'registrar' o 'otro', sin puntos, sin explicaciones adicionales.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: mensaje }
  ];

  try {
    const response = await callOpenAI(apiKey, messages);
    const clasificacion = response.trim().toLowerCase();

    // Validar respuesta
    if (clasificacion.includes('registrar')) {
      return 'registrar';
    }
    return 'otro';
  } catch (error) {
    console.error('Error clasificando intencion:', error);
    return 'otro'; // Default
  }
}

/**
 * Genera respuesta para flujo de registro
 * @param {string} apiKey - OpenAI API Key
 * @param {string} mensaje - Mensaje del usuario
 * @param {Array} history - Historial de conversacion
 * @returns {Promise<string>} - Respuesta generada
 */
async function generarRespuestaRegistro(apiKey, mensaje, history) {
  const systemPrompt = `Eres un asistente de Renata, una plataforma de gestion tributaria para empresas chilenas.

Tu rol es ayudar a prospectos que quieren registrar su empresa en la plataforma.

INFORMACION CLAVE:
- Para registrarse necesitan: RUT de la empresa, nombre, telefono, y clave del SII
- El registro se hace a traves de nuestra pagina web: https://renata.cl/registro
- El proceso toma aproximadamente 5 minutos
- Una vez registrados, tendran acceso a: consultas de ventas y compras, informes tributarios, y asistencia con el SII

ESTILO DE COMUNICACION:
- Profesional pero cercana
- Sin emoticons
- Respuestas concisas (maximo 3-4 oraciones)
- En español de Chile
- Enfocate en guiar al prospecto hacia el registro

Basandote en el historial de la conversacion y el mensaje actual, proporciona una respuesta util y orientada a facilitar el registro.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: mensaje }
  ];

  try {
    const response = await callOpenAI(apiKey, messages);
    return response.trim();
  } catch (error) {
    console.error('Error generando respuesta de registro:', error);
    return 'Disculpa, estoy teniendo problemas tecnicos. Para registrarte, visita https://renata.cl/registro o escribenos a soporte@renata.cl';
  }
}

/**
 * Genera respuesta para otros temas (informacion general)
 * @param {string} apiKey - OpenAI API Key
 * @param {string} mensaje - Mensaje del usuario
 * @param {Array} history - Historial de conversacion
 * @returns {Promise<string>} - Respuesta generada
 */
async function generarRespuestaOtro(apiKey, mensaje, history) {
  const systemPrompt = `Eres un asistente de Renata, una plataforma de gestion tributaria para empresas chilenas.

Tu rol es proporcionar informacion sobre los servicios de Renata a prospectos.

SERVICIOS QUE OFRECE RENATA:
- Consulta automatica de ventas y compras desde el SII
- Informes tributarios mensuales
- Alertas de vencimientos (F29, F22, etc.)
- Asistente AI experto en normativa tributaria chilena
- Gestion de documentos tributarios electronicos (DTE)

BENEFICIOS:
- Ahorro de tiempo en gestion tributaria
- Informacion actualizada 24/7
- Soporte especializado
- Integracion directa con el SII

ESTILO DE COMUNICACION:
- Profesional pero amigable
- Sin emoticons
- Respuestas concisas (maximo 3-4 oraciones)
- En español de Chile
- Si preguntan por precios o planes, indicar que contacten a ventas@renata.cl

Basandote en el historial de la conversacion y el mensaje actual, responde de manera util sobre nuestros servicios.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: mensaje }
  ];

  try {
    const response = await callOpenAI(apiKey, messages);
    return response.trim();
  } catch (error) {
    console.error('Error generando respuesta informativa:', error);
    return 'Renata es una plataforma que te ayuda a gestionar tus obligaciones tributarias de forma automatica. Para mas informacion, escribenos a contacto@renata.cl';
  }
}

/**
 * Formatea la respuesta según el origen de la solicitud
 * @param {string} textoRespuesta - Texto de la respuesta a formatear
 * @param {string} telefono - Número de teléfono del usuario
 * @param {string} source - Origen: 'whatsapp' | 'api'
 * @param {Object} env - Environment variables
 * @returns {Promise<Object>} - Respuesta formateada según el origen
 */
async function formatearRespuestaSegunOrigen(textoRespuesta, source, env) {
  // Si viene de WhatsApp → SIEMPRE convertir a audio
  const esWhatsApp = (source === 'whatsapp');

  const respuestaFormateada = await formatResponse({
    texto: textoRespuesta,
    env,
    esWhatsApp
  });

  // Formatear respuesta según el tipo
  if (respuestaFormateada.tipo === 'audio') {
    return {
      tipo: 'audio',
      contenido: Array.from(new Uint8Array(respuestaFormateada.contenido)),
      mimeType: respuestaFormateada.mimeType,
      textoOriginal: respuestaFormateada.textoOriginal
    };
  }

  // Texto plano (para API/Postman)
  return {
    tipo: 'texto',
    respuesta: textoRespuesta
  };
}

/**
 * POST /api/prospecto/message
 * Endpoint principal para mensajes de prospectos
 *
 * PARAMETROS:
 * - source: 'whatsapp' | 'api' (opcional, default: 'api')
 *   - 'whatsapp': Respuesta convertida a audio
 *   - 'api': Respuesta en texto plano
 */
router.post('/message', async (c) => {
  try {
    const { telefono, mensaje, source = 'api' } = await c.req.json();

    console.log(`[PROSPECTO] === INICIO REQUEST ===`);
    console.log(`[PROSPECTO] Teléfono: ${telefono}`);
    console.log(`[PROSPECTO] Mensaje: "${mensaje}"`);
    console.log(`[PROSPECTO] Source: ${source}`);

    if (!telefono || !mensaje) {
      return c.json({ error: 'Se requiere telefono y mensaje' }, 400);
    }

    // PASO 1: Obtener historial de conversacion desde D1
    const history = await getConversationHistory(c.env.DB, telefono);
    console.log(`[PROSPECTO] Historial encontrado: ${history.length} mensajes`);

    // PASO 2: Si es el primer mensaje, enviar mensaje de bienvenida
    if (history.length === 0) {
      const mensajeBienvenida = 'Hola, veo que aun no tienes una cuenta creada en nuestro sistema. Tienes un codigo de activacion o necesitas contratar un servicio?';

      console.log(`[PROSPECTO] Primer mensaje - Enviando bienvenida`);
      console.log(`[PROSPECTO] Respuesta generada (texto): "${mensajeBienvenida}"`);

      // Guardar en historial
      await saveToConversationHistory(c.env.DB, telefono, mensaje, mensajeBienvenida);

      // Formatear respuesta según origen (SIEMPRE audio si es WhatsApp)
      const respuestaFormateada = await formatearRespuestaSegunOrigen(
        mensajeBienvenida,
        source,
        c.env
      );

      console.log(`[PROSPECTO] Respuesta formateada - Tipo: ${respuestaFormateada.tipo || 'texto'}`);
      if (respuestaFormateada.tipo === 'audio') {
        console.log(`[PROSPECTO] Audio generado - MimeType: ${respuestaFormateada.mimeType}, Tamaño: ${respuestaFormateada.contenido.length} bytes`);
      }

      return c.json(respuestaFormateada);
    }

    // PASO 3: Clasificar intencion con OpenAI
    const intencion = await clasificarIntencion(c.env.OPENAI_API_KEY, mensaje, history);

    console.log(`Intencion clasificada: ${intencion} para telefono ${telefono}`);

    // PASO 4: Generar respuesta segun clasificacion
    let respuestaTexto;

    if (intencion === 'registrar') {
      respuestaTexto = await generarRespuestaRegistro(c.env.OPENAI_API_KEY, mensaje, history);
    } else {
      respuestaTexto = await generarRespuestaOtro(c.env.OPENAI_API_KEY, mensaje, history);
    }

    // PASO 5: Guardar en historial D1
    await saveToConversationHistory(c.env.DB, telefono, mensaje, respuestaTexto);

    console.log(`[PROSPECTO] Respuesta generada (texto): "${respuestaTexto}"`);
    console.log(`[PROSPECTO] Source: ${source}`);

    // PASO 6: Formatear y retornar respuesta según origen (SIEMPRE audio si es WhatsApp)
    const respuestaFormateada = await formatearRespuestaSegunOrigen(
      respuestaTexto,
      source,
      c.env
    );

    console.log(`[PROSPECTO] Respuesta formateada - Tipo: ${respuestaFormateada.tipo || 'texto'}`);
    if (respuestaFormateada.tipo === 'audio') {
      console.log(`[PROSPECTO] Audio generado - MimeType: ${respuestaFormateada.mimeType}, Tamaño: ${respuestaFormateada.contenido.length} bytes`);
    } else {
      console.log(`[PROSPECTO] Respuesta texto: "${respuestaFormateada.respuesta}"`);
    }

    return c.json(respuestaFormateada);

  } catch (error) {
    console.error('Error procesando mensaje de prospecto:', error);

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
      // Si falla el formateo, devolver error simple
      return c.json({ error: 'Error al procesar mensaje' }, 500);
    }
  }
});

export default router;
