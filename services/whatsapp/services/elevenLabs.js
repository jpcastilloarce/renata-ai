/**
 * elevenLabs.js (WhatsApp Service - Node.js)
 * Cliente de ElevenLabs para el servicio de WhatsApp
 *
 * FUNCIONES:
 * - Procesar audio recibido por WhatsApp
 * - Enviar audio generado por WhatsApp
 */

import FormData from 'form-data';
import fetch from 'node-fetch';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * Convierte audio a texto
 * @param {Buffer} audioBuffer - Buffer del audio
 * @param {string} apiKey - ElevenLabs API Key
 * @returns {Promise<string>} Texto transcrito
 */
export async function audioToText(audioBuffer, apiKey) {
  try {
    const formData = new FormData();
    formData.append('audio', audioBuffer, {
      filename: 'audio.ogg',
      contentType: 'audio/ogg; codecs=opus'
    });
    formData.append('model_id', 'whisper-1');

    const response = await fetch(`${ELEVENLABS_API_URL}/speech-to-text`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs STT error:', error);
      throw new Error(`ElevenLabs STT failed: ${response.status}`);
    }

    const data = await response.json();
    return data.text || data.transcript || '';

  } catch (error) {
    console.error('Error en audioToText:', error);
    throw error;
  }
}

/**
 * Obtiene información del mensaje de audio
 * @param {Object} msg - Mensaje de WhatsApp
 * @returns {Promise<Object>} { hasAudio: boolean, audioBuffer?: Buffer, mimeType?: string }
 */
export async function getAudioFromMessage(msg) {
  try {
    // Verificar si el mensaje tiene audio
    if (!msg.hasMedia) {
      return { hasAudio: false };
    }

    const media = await msg.downloadMedia();

    // Verificar si es audio
    if (!media.mimetype.startsWith('audio/')) {
      return { hasAudio: false };
    }

    // Convertir base64 a Buffer
    const audioBuffer = Buffer.from(media.data, 'base64');

    return {
      hasAudio: true,
      audioBuffer,
      mimeType: media.mimetype
    };

  } catch (error) {
    console.error('Error obteniendo audio del mensaje:', error);
    return { hasAudio: false, error: error.message };
  }
}

export default {
  audioToText,
  getAudioFromMessage
};
