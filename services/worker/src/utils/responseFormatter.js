/**
 * responseFormatter.js
 * Módulo unificado para formatear respuestas (texto o audio)
 *
 * RESPONSABILIDAD:
 * - Punto único de salida para todas las respuestas
 * - Si es para WhatsApp → SIEMPRE convierte a audio (MP3, luego se convierte a OGG en WhatsApp service)
 * - Si es API directa (Postman) → Retorna texto plano
 * - SIEMPRE usa la misma voz: Rachel (21m00Tcm4TlvDq8ikWAM)
 *
 * USADO POR: agent.js, prospecto.js
 */

import { textToAudio } from '../services/elevenLabs.js';

// Configuración única de voz para TODAS las respuestas
const VOICE_CONFIG = {
  voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel - voz femenina en español
  modelId: 'eleven_multilingual_v2', // Modelo multilingüe v2 (mejor para español)
  voiceSettings: {
    stability: 0.5,           // 0-1: Mayor = más consistente, Menor = más variado
    similarity_boost: 0.75,   // 0-1: Qué tan similar al original
    style: 0.2,               // 0-1: Exageración del estilo (solo algunas voces)
    use_speaker_boost: true   // Mejora la calidad para voces clonadas
  }
};

/**
 * Formatea una respuesta según el origen (WhatsApp o API)
 * @param {Object} params - Parámetros de formateo
 * @param {string} params.texto - Texto de la respuesta
 * @param {Object} params.env - Environment variables (Cloudflare)
 * @param {boolean} params.esWhatsApp - true si es para WhatsApp, false si es API directa
 * @returns {Promise<Object>} { tipo: 'texto'|'audio', contenido: string|ArrayBuffer, mimeType?: string, textoOriginal?: string }
 */
export async function formatResponse({ texto, env, esWhatsApp = true }) {
  try {
    // Si es para WhatsApp → SIEMPRE convertir a audio
    if (esWhatsApp) {
      console.log('[ResponseFormatter] Convirtiendo texto a audio para WhatsApp...');

      // Usar ELEVENLABS_VOICE_ID del env o voz por defecto Rachel
      const voiceId = env.ELEVENLABS_VOICE_ID || VOICE_CONFIG.voiceId;

      // Convertir texto a audio usando ElevenLabs (retorna MP3)
      const audioBuffer = await textToAudio(
        env.ELEVENLABS_API_KEY,
        texto,
        voiceId,
        {
          model_id: VOICE_CONFIG.modelId,
          voice_settings: VOICE_CONFIG.voiceSettings
        }
      );

      console.log('[ResponseFormatter] Audio MP3 generado, tamaño:', audioBuffer.byteLength, 'bytes');
      console.log('[ResponseFormatter] Se convertirá a OGG en WhatsApp service');

      // IMPORTANTE: El Worker retorna MP3, el servicio WhatsApp lo convertirá a OGG
      return {
        tipo: 'audio',
        contenido: audioBuffer,
        mimeType: 'audio/mpeg', // MP3 (se convertirá a OGG en WhatsApp service)
        textoOriginal: texto // Para fallback si falla conversión a OGG
      };
    }

    // Si es API directa (Postman) → Retornar texto plano
    console.log('[ResponseFormatter] Retornando texto plano para API directa');
    return {
      tipo: 'texto',
      contenido: texto
    };

  } catch (error) {
    console.error('[ResponseFormatter] Error formateando respuesta:', error);

    // Fallback: siempre retornar texto si hay error
    return {
      tipo: 'texto',
      contenido: texto,
      error: error.message
    };
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
 * Útil para testing o respuestas de API
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
  WHATSAPP: 'whatsapp',
  API: 'api'
};
