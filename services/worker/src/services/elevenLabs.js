/**
 * elevenLabs.js
 * Servicio para integración con ElevenLabs API
 *
 * FUNCIONES PRINCIPALES:
 * 1. audioToText() - Convierte audio a texto (Speech-to-Text)
 * 2. textToAudio() - Convierte texto a audio (Text-to-Speech)
 *
 * USADO POR: Todos los endpoints que manejan respuestas (agent.js, prospecto.js)
 */

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * Convierte audio a texto usando ElevenLabs Speech-to-Text
 * @param {string} apiKey - ElevenLabs API Key
 * @param {ArrayBuffer} audioBuffer - Buffer del audio
 * @param {string} mimeType - Tipo MIME del audio (e.g., 'audio/ogg', 'audio/mpeg')
 * @returns {Promise<string>} Texto transcrito
 */
export async function audioToText(apiKey, audioBuffer, mimeType = 'audio/ogg') {
  try {
    // Crear FormData para el audio
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    formData.append('audio', audioBlob, 'audio.ogg');
    formData.append('model_id', 'whisper-1'); // O el modelo que uses

    const response = await fetch(`${ELEVENLABS_API_URL}/speech-to-text`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs STT error:', error);
      throw new Error(`ElevenLabs STT error: ${response.status}`);
    }

    const data = await response.json();
    return data.text || data.transcript || '';

  } catch (error) {
    console.error('Error en audioToText:', error);
    throw error;
  }
}

/**
 * Convierte texto a audio usando ElevenLabs Text-to-Speech
 * @param {string} apiKey - ElevenLabs API Key
 * @param {string} text - Texto a convertir
 * @param {string} voiceId - ID de la voz (default: voz femenina español)
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<ArrayBuffer>} Buffer del audio generado
 */
export async function textToAudio(
  apiKey,
  text,
  voiceId = 'EXAVITQu4vr4xnSDxMaL', // Voz en español por defecto
  options = {}
) {
  try {
    const {
      model_id = 'eleven_multilingual_v2', // Modelo multilingüe v2
      voice_settings = {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      }
    } = options;

    const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text,
        model_id,
        voice_settings
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs TTS error:', error);
      throw new Error(`ElevenLabs TTS error: ${response.status}`);
    }

    // Retornar el audio como ArrayBuffer
    return await response.arrayBuffer();

  } catch (error) {
    console.error('Error en textToAudio:', error);
    throw error;
  }
}

/**
 * Lista las voces disponibles en ElevenLabs
 * @param {string} apiKey - ElevenLabs API Key
 * @returns {Promise<Array>} Lista de voces disponibles
 */
export async function getVoices(apiKey) {
  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Error al obtener voces: ${response.status}`);
    }

    const data = await response.json();
    return data.voices || [];

  } catch (error) {
    console.error('Error obteniendo voces:', error);
    throw error;
  }
}

