/**
 * responseFormatter.js
 * Módulo unificado para formatear respuestas (texto o audio)
 *
 * RESPONSABILIDAD:
 * - Punto único de salida para todas las respuestas
 * - Decide si convertir a audio según preferencia del usuario
 * - Garantiza que todas las respuestas pasen por ElevenLabs si es necesario
 *
 * USADO POR: agent.js, prospecto.js, y cualquier handler de mensajes
 */

import { textToAudio, VOCES_ESPANOL, VOICE_PRESETS } from '../services/elevenLabs.js';

/**
 * Formatea una respuesta según las preferencias del usuario
 * @param {Object} params - Parámetros de formateo
 * @param {string} params.texto - Texto de la respuesta
 * @param {string} params.telefono - Número de teléfono del usuario
 * @param {Object} params.env - Environment variables (Cloudflare)
 * @param {string} params.userMode - Modo del usuario: 'audio' | 'texto' (opcional, default: detectar)
 * @returns {Promise<Object>} { tipo: 'texto'|'audio', contenido: string|ArrayBuffer }
 */
export async function formatResponse({ texto, telefono, env, userMode = null }) {
  try {
    // Determinar modo del usuario
    const modo = userMode || await detectarModoUsuario(telefono, env);

    if (modo === 'audio') {
      // Convertir texto a audio usando ElevenLabs
      const audioBuffer = await textToAudio(
        env.ELEVENLABS_API_KEY,
        texto,
        VOCES_ESPANOL.FEMENINA, // Voz por defecto
        { voice_settings: VOICE_PRESETS.AMIGABLE }
      );

      return {
        tipo: 'audio',
        contenido: audioBuffer,
        mimeType: 'audio/mpeg'
      };
    }

    // Modo texto (default)
    return {
      tipo: 'texto',
      contenido: texto
    };

  } catch (error) {
    console.error('Error formateando respuesta:', error);

    // Fallback: siempre retornar texto si hay error
    return {
      tipo: 'texto',
      contenido: texto,
      error: error.message
    };
  }
}

/**
 * Detecta el modo de comunicación preferido del usuario
 * @param {string} telefono - Número de teléfono
 * @param {Object} env - Environment variables
 * @returns {Promise<string>} 'audio' o 'texto'
 */
async function detectarModoUsuario(telefono, env) {
  try {
    // Buscar en KV Store si el usuario tiene preferencia guardada
    const preference = await env.SESSIONS_KV.get(`modo:${telefono}`);

    if (preference) {
      return preference; // 'audio' o 'texto'
    }

    // Default: texto
    return 'texto';

  } catch (error) {
    console.error('Error detectando modo usuario:', error);
    return 'texto'; // Fallback
  }
}

/**
 * Guarda la preferencia de modo del usuario
 * @param {string} telefono - Número de teléfono
 * @param {string} modo - 'audio' o 'texto'
 * @param {Object} env - Environment variables
 */
export async function setModoUsuario(telefono, modo, env) {
  try {
    await env.SESSIONS_KV.put(`modo:${telefono}`, modo, {
      expirationTtl: 86400 * 30 // 30 días
    });
  } catch (error) {
    console.error('Error guardando modo usuario:', error);
  }
}

/**
 * Detecta automáticamente el modo basado en el tipo de mensaje recibido
 * Si el usuario envía audio, se cambia su preferencia a audio
 * @param {string} telefono - Número de teléfono
 * @param {string} tipoMensaje - 'texto' o 'audio'
 * @param {Object} env - Environment variables
 */
export async function actualizarModoSegunInput(telefono, tipoMensaje, env) {
  try {
    if (tipoMensaje === 'audio') {
      await setModoUsuario(telefono, 'audio', env);
    }
    // No cambiamos a texto automáticamente, solo si el usuario lo pide explícitamente
  } catch (error) {
    console.error('Error actualizando modo:', error);
  }
}

/**
 * Formatea error de forma amigable
 * @param {string} mensaje - Mensaje de error
 * @returns {string} Texto formateado del error
 */
export function formatError(mensaje) {
  return `Lo siento, ocurrió un error: ${mensaje}. Por favor intenta nuevamente.`;
}

/**
 * Helper para crear respuesta de texto simple (sin audio)
 * Útil para testing o forzar modo texto
 */
export function createTextResponse(texto) {
  return {
    tipo: 'texto',
    contenido: texto
  };
}

/**
 * Constantes de configuración
 */
export const MODOS = {
  AUDIO: 'audio',
  TEXTO: 'texto'
};
