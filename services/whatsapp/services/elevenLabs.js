/**
 * elevenLabs.js (WhatsApp Service - Node.js)
 * Servicios de ElevenLabs para conversion de audio/texto
 *
 * FUNCIONES:
 * - convertirAudioATexto: Speech-to-Text (STT)
 * - convertirTextoAAudio: Text-to-Speech (TTS)
 * - getAudioFromMessage: Extrae audio de mensajes de WhatsApp
 */

const fs = require('fs');
const { elevenLabsClient, VOICE_CONFIG } = require('../config/elevenlabs');
const { Blob } = require('buffer');

/**
 * Convierte un archivo de audio a texto usando ElevenLabs Speech-to-Text
 * @param {Buffer|string} audioInput - Buffer del audio o path al archivo
 * @param {string} fileName - Nombre del archivo de audio (para determinar MIME type)
 * @returns {Promise<string>} - Texto transcrito
 */
async function convertirAudioATexto(audioInput, fileName = 'audio.ogg') {
  try {
    console.log('[Speech-to-Text] Iniciando conversion de audio a texto...');

    let audioBuffer;

    // Si es un path, leer el archivo
    if (typeof audioInput === 'string') {
      audioBuffer = fs.readFileSync(audioInput);
    } else {
      audioBuffer = audioInput;
    }

    console.log('[Speech-to-Text] Tamaño del audio:', audioBuffer.length, 'bytes');

    // Determinar el tipo MIME segun la extension del archivo
    let mimeType = 'audio/ogg';
    if (fileName.endsWith('.mp3')) mimeType = 'audio/mp3';
    else if (fileName.endsWith('.wav')) mimeType = 'audio/wav';
    else if (fileName.endsWith('.ogg')) mimeType = 'audio/ogg';

    // Convertir Buffer a Blob (segun documentacion de ElevenLabs)
    const audioBlob = new Blob([audioBuffer], { type: mimeType });

    console.log('[Speech-to-Text] Blob creado, tipo:', mimeType);

    // Llamar a ElevenLabs Speech-to-Text API segun documentacion oficial
    const transcription = await elevenLabsClient.speechToText.convert({
      file: audioBlob,
      modelId: 'scribe_v1', // Modelo de transcripcion
      languageCode: 'spa', // Español
      tagAudioEvents: false, // No necesitamos etiquetar eventos de audio
      diarize: false // No necesitamos identificar quien habla
    });

    console.log('[Speech-to-Text] Transcripcion completada:', transcription.text);

    return transcription.text;

  } catch (error) {
    console.error('[Speech-to-Text] Error al convertir audio a texto:', error.message);
    console.error('[Speech-to-Text] Error completo:', error);
    throw new Error(`Error en conversion de audio a texto: ${error.message}`);
  }
}

/**
 * Convierte texto a audio usando ElevenLabs Text-to-Speech
 * @param {string} texto - Texto a convertir en audio
 * @returns {Promise<Buffer>} - Buffer del audio generado en formato MP3
 */
async function convertirTextoAAudio(texto) {
  try {
    console.log('[Text-to-Speech] Iniciando conversion de texto a audio...');
    console.log('[Text-to-Speech] Texto a convertir:', texto.substring(0, 100) + '...');

    // Generar audio usando ElevenLabs
    const audioStream = await elevenLabsClient.textToSpeech.convert(
      VOICE_CONFIG.voiceId,
      {
        text: texto,
        model_id: VOICE_CONFIG.modelId,
        voice_settings: VOICE_CONFIG.voiceSettings
      }
    );

    // Convertir stream a buffer
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    console.log('[Text-to-Speech] Audio generado, tamaño:', audioBuffer.length, 'bytes');

    return audioBuffer;

  } catch (error) {
    console.error('[Text-to-Speech] Error al convertir texto a audio:', error.message);
    console.error('[Text-to-Speech] Error completo:', error);
    throw new Error(`Error en conversion de texto a audio: ${error.message}`);
  }
}

/**
 * Obtiene informacion del mensaje de audio de WhatsApp
 * @param {Object} msg - Mensaje de WhatsApp
 * @returns {Promise<Object>} { hasAudio: boolean, audioBuffer?: Buffer, mimeType?: string }
 */
async function getAudioFromMessage(msg) {
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
    console.error('[WhatsApp] Error obteniendo audio del mensaje:', error);
    return { hasAudio: false, error: error.message };
  }
}

module.exports = {
  convertirAudioATexto,
  convertirTextoAAudio,
  getAudioFromMessage
};
