/**
 * prospecto.js
 * Maneja todas las interacciones con prospectos (usuarios no registrados)
 *
 * RESPONSABILIDAD:
 * - Mensajes de bienvenida
 * - Validación de código de activación "SKY"
 * - Proceso de registro guiado
 * - Consultas sobre servicios
 *
 * ESTE ARCHIVO ES TU ZONA DE TRABAJO - NO AFECTA agent.js
 */

import { Hono } from 'hono';
import { logEvent } from '../utils/logger.js';
import { formatResponse, actualizarModoSegunInput } from '../utils/responseFormatter.js';

const router = new Hono();

// Código de activación válido
const CODIGO_ACTIVACION = 'SKY';

/**
 * Middleware de autenticación (igual que agent.js)
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
 * POST /api/prospecto/message
 * Endpoint principal para mensajes de prospectos
 */
router.post('/message', async (c) => {
  try {
    const { telefono, mensaje, tipoMensajeOriginal } = await c.req.json();

    if (!telefono || !mensaje) {
      return c.json({ error: 'Se requiere teléfono y mensaje' }, 400);
    }

    // Actualizar preferencia de modo si envió audio
    if (tipoMensajeOriginal === 'audio') {
      await actualizarModoSegunInput(telefono, 'audio', c.env);
    }

    // Verificar si hay una sesión de registro en curso
    const sessionKey = `registro:${telefono}`;
    const session = await c.env.SESSIONS_KV.get(sessionKey, { type: 'json' });

    let respuestaTexto;

    if (session) {
      // Continuar proceso de registro
      respuestaTexto = await handleRegistroFlow(c.env, telefono, mensaje, session);
    } else {
      // Primera interacción o consulta general
      respuestaTexto = await handlePrimerMensaje(c.env, telefono, mensaje);
    }

    // Log del evento
    await logEvent(c.env.DB, null, 'PROSPECTO_MESSAGE', `${telefono}: ${mensaje.substring(0, 50)}...`);

    // ⭐ FORMATEAR RESPUESTA (texto o audio según preferencia del usuario)
    const respuestaFormateada = await formatResponse({
      texto: respuestaTexto,
      telefono,
      env: c.env
    });

    // Retornar en formato unificado
    if (respuestaFormateada.tipo === 'audio') {
      return c.json({
        tipo: 'audio',
        contenido: Array.from(new Uint8Array(respuestaFormateada.contenido)),
        mimeType: respuestaFormateada.mimeType
      });
    } else {
      return c.json({
        tipo: 'texto',
        respuesta: respuestaFormateada.contenido
      });
    }

  } catch (error) {
    console.error('Error en prospecto handler:', error);
    return c.json({ error: 'Error al procesar mensaje' }, 500);
  }
});

/**
 * Maneja el primer mensaje de un prospecto
 */
async function handlePrimerMensaje(env, telefono, mensaje) {
  const mensajeNormalizado = mensaje.trim().toUpperCase();

  // Si envía el código directamente
  if (mensajeNormalizado === CODIGO_ACTIVACION) {
    return await iniciarRegistro(env, telefono);
  }

  // Si consulta sobre servicios
  if (mensajeNormalizado === '1') {
    return getServicioContabilidad();
  }

  if (mensajeNormalizado === '2') {
    return getServicioRenataAI();
  }

  // Mensaje de bienvenida por defecto
  return getMensajeBienvenida();
}

/**
 * Maneja el flujo de registro paso a paso
 */
async function handleRegistroFlow(env, telefono, mensaje, session) {
  const sessionKey = `registro:${telefono}`;
  const { step, data } = session;

  switch (step) {
    case 'solicitar_rut':
      return await handleStepRUT(env, telefono, mensaje, data);

    case 'solicitar_nombre':
      return await handleStepNombre(env, telefono, mensaje, data);

    case 'solicitar_password':
      return await handleStepPassword(env, telefono, mensaje, data);

    case 'solicitar_clave_sii':
      return await handleStepClaveSII(env, telefono, mensaje, data);

    default:
      // Sesión inválida, reiniciar
      await env.SESSIONS_KV.delete(sessionKey);
      return 'Sesión expirada. Por favor envía tu código de activación nuevamente.';
  }
}

// ========== HANDLERS DE CADA PASO DEL REGISTRO ==========

async function handleStepRUT(env, telefono, mensaje, data) {
  const rut = mensaje.trim();

  // Validar formato básico
  const rutRegex = /^\d{7,8}-[\dkK]$/;
  if (!rutRegex.test(rut)) {
    return 'Por favor ingresa un RUT válido en formato: 12345678-9';
  }

  // Verificar si ya existe
  const existente = await env.DB.prepare(
    'SELECT rut FROM contributors WHERE rut = ?'
  ).bind(rut).first();

  if (existente) {
    await env.SESSIONS_KV.delete(`registro:${telefono}`);
    return 'Este RUT ya está registrado. Si olvidaste tu contraseña, contacta a soporte.';
  }

  // Guardar y avanzar
  data.rut = rut;
  await env.SESSIONS_KV.put(
    `registro:${telefono}`,
    JSON.stringify({ step: 'solicitar_nombre', data }),
    { expirationTtl: 900 }
  );

  return '✅ RUT registrado\n\n📋 *Paso 2 de 4*\n¿Cuál es el *nombre de tu empresa o razón social*?';
}

async function handleStepNombre(env, telefono, mensaje, data) {
  const nombre = mensaje.trim();

  if (nombre.length < 3) {
    return 'Por favor ingresa un nombre válido (mínimo 3 caracteres)';
  }

  data.nombre = nombre;
  await env.SESSIONS_KV.put(
    `registro:${telefono}`,
    JSON.stringify({ step: 'solicitar_password', data }),
    { expirationTtl: 900 }
  );

  return '✅ Nombre registrado\n\n📋 *Paso 3 de 4*\nCrea una *contraseña* para tu cuenta (mínimo 6 caracteres):';
}

async function handleStepPassword(env, telefono, mensaje, data) {
  const password = mensaje.trim();

  if (password.length < 6) {
    return 'La contraseña debe tener al menos 6 caracteres. Intenta nuevamente:';
  }

  data.password = password;
  await env.SESSIONS_KV.put(
    `registro:${telefono}`,
    JSON.stringify({ step: 'solicitar_clave_sii', data }),
    { expirationTtl: 900 }
  );

  return '✅ Contraseña creada\n\n📋 *Paso 4 de 4*\nFinalmente, ingresa tu *clave del SII* para acceder a tus datos tributarios:\n\n🔒 Tu información está segura y encriptada.';
}

async function handleStepClaveSII(env, telefono, mensaje, data) {
  const claveSII = mensaje.trim();

  if (claveSII.length < 4) {
    return 'Por favor ingresa tu clave del SII:';
  }

  data.clave_sii = claveSII;

  // Completar registro
  return await completarRegistro(env, telefono, data);
}

// ========== FUNCIONES AUXILIARES ==========

/**
 * Inicia el proceso de registro
 */
async function iniciarRegistro(env, telefono) {
  const sessionData = {
    step: 'solicitar_rut',
    data: { telefono }
  };

  await env.SESSIONS_KV.put(
    `registro:${telefono}`,
    JSON.stringify(sessionData),
    { expirationTtl: 900 } // 15 minutos
  );

  return `✅ ¡Código válido!

Vamos a registrar tu empresa en Renata AI.

📋 *Paso 1 de 4*
Por favor ingresa tu *RUT* en formato: 12345678-9`;
}

/**
 * Completa el registro del prospecto como cliente
 */
async function completarRegistro(env, telefono, data) {
  try {
    // Importar bcrypt para hashear password
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Insertar en tabla contributors
    await env.DB.prepare(`
      INSERT INTO contributors (rut, nombre, password_hash, clave_sii, telefono, verified)
      VALUES (?, ?, ?, ?, ?, 0)
    `).bind(data.rut, data.nombre, passwordHash, data.clave_sii, telefono).run();

    // Generar OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutos

    await env.DB.prepare(`
      INSERT INTO otp (rut, code, expires_at)
      VALUES (?, ?, ?)
    `).bind(data.rut, otpCode, expiresAt).run();

    // Limpiar sesión
    await env.SESSIONS_KV.delete(`registro:${telefono}`);

    // Log
    await logEvent(env.DB, data.rut, 'REGISTRO_PROSPECTO', 'Prospecto completó registro');

    // TODO: Aquí puedes llamar al servicio de WhatsApp para enviar OTP
    // O usar ElevenLabs para mensaje de voz

    return `🎉 ¡Registro exitoso!

*Empresa:* ${data.nombre}
*RUT:* ${data.rut}

Tu código de verificación OTP es: *${otpCode}*

⏱️ Expira en 5 minutos.

Para verificar tu cuenta, responde con: VERIFICAR ${otpCode}`;

  } catch (error) {
    console.error('Error completando registro:', error);
    await env.SESSIONS_KV.delete(`registro:${telefono}`);
    return 'Ocurrió un error al completar tu registro. Por favor contacta a soporte.';
  }
}

/**
 * Mensajes informativos
 */
function getMensajeBienvenida() {
  return `¡Hola! 👋 Bienvenido a *Renata AI*

Veo que aún no tienes una cuenta registrada.

*¿Tienes un código de activación?*
Si ya contrataste nuestros servicios, envía tu código para comenzar el registro de tu empresa.

*¿Aún no eres cliente?*
Conoce nuestros servicios:

📊 *1)* Servicios de Contabilidad
🤖 *2)* Agente IA Renata

Escribe el número para más información.`;
}

function getServicioContabilidad() {
  return `📊 *Servicios de Contabilidad*

Gestión contable completa para tu empresa:

✅ Declaraciones mensuales y anuales
✅ Libro de compras y ventas
✅ Conciliación bancaria
✅ Estados financieros
✅ Asesoría tributaria permanente

💰 Planes desde $150.000/mes

📧 contacto@renata-ai.cl
📱 +56 9 XXXX XXXX

¿Quieres conocer otro servicio? Escribe *2* para Agente IA Renata.`;
}

function getServicioRenataAI() {
  return `🤖 *Agente IA Renata*

Tu asistente tributario inteligente 24/7:

✅ Consultas sobre ventas y compras del SII
✅ Análisis de contratos con IA
✅ Reportes tributarios instantáneos
✅ Acceso por WhatsApp a tus datos
✅ Respuestas en lenguaje natural

💰 Desde $50.000/mes

Requiere código de activación.

📧 contacto@renata-ai.cl
📱 +56 9 XXXX XXXX

¿Quieres conocer otro servicio? Escribe *1* para Contabilidad.`;
}

export default router;
