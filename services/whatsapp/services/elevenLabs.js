/**
 * elevenLabs.js (WhatsApp Service - Node.js)
 * Servicios de ElevenLabs para conversion de audio/texto
 *
 * FUNCIONES:
 * - convertirAudioATexto: Speech-to-Text (STT)
 * - convertirTextoAAudio: Text-to-Speech (TTS)
 * - getAudioFromMessage: Extrae audio de mensajes de WhatsApp
 */

import fs from 'fs';
import path from 'path';
import { elevenLabsClient, VOICE_CONFIG } from '../config/elevenlabs.js';
import { Blob } from 'buffer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

// Configurar ruta de ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath.path);

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

    // Crear FormData para enviar a la API
    const formData = new FormData();

    // Convertir Buffer a Blob y agregarlo al FormData
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', audioBlob, fileName);
    formData.append('model_id', 'scribe_v1');
    formData.append('language_code', 'spa');
    formData.append('tag_audio_events', 'false'); // No etiquetar eventos de audio (silencios, suspiros, emociones)
    formData.append('diarize', 'false'); // No identificar quién habla

    console.log('[Speech-to-Text] Enviando request a ElevenLabs API...');

    // Llamar directamente a la API REST de ElevenLabs
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log('[Speech-to-Text] Transcripcion completada:', result.text);

    return result.text;

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
 * Convierte un archivo MP3 a OGG (formato requerido por WhatsApp)
 * @param {Buffer} mp3Buffer - Buffer del archivo MP3
 * @returns {Promise<Buffer>} - Buffer del archivo OGG generado
 */
async function convertirMP3aOGG(mp3Buffer) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const tempDir = path.join(process.cwd(), 'temp');

    // Crear directorio temporal si no existe
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const inputPath = path.join(tempDir, `input_${timestamp}.mp3`);
    const outputPath = path.join(tempDir, `output_${timestamp}.ogg`);

    try {
      // Guardar MP3 temporal
      fs.writeFileSync(inputPath, mp3Buffer);

      // Convertir MP3 a OGG con codec Opus
      ffmpeg(inputPath)
        .toFormat('ogg')
        .audioCodec('libopus')
        .audioBitrate('64k')
        .audioFrequency(48000)
        .audioChannels(1) // Mono
        .on('end', () => {
          console.log('[MP3→OGG] Conversión completada');

          // Leer archivo OGG
          const oggBuffer = fs.readFileSync(outputPath);

          // Limpiar archivos temporales
          try {
            fs.unlinkSync(inputPath);
            fs.unlinkSync(outputPath);
          } catch (e) {
            console.warn('[MP3→OGG] Error limpiando archivos temporales:', e.message);
          }

          resolve(oggBuffer);
        })
        .on('error', (err) => {
          console.error('[MP3→OGG] Error en conversión:', err);

          // Limpiar archivos en caso de error
          try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch (e) {
            // Ignorar errores de limpieza
          }

          reject(err);
        })
        .save(outputPath);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Convierte texto a audio en formato OGG (listo para WhatsApp)
 * @param {string} texto - Texto a convertir
 * @returns {Promise<Buffer>} - Buffer del audio en formato OGG
 */
async function convertirTextoAAudioOGG(texto) {
  try {
    console.log('[Text-to-Speech-OGG] Generando audio MP3...');

    // Primero generar MP3 con ElevenLabs
    const mp3Buffer = await convertirTextoAAudio(texto);

    console.log('[Text-to-Speech-OGG] Convirtiendo MP3 a OGG...');

    // Convertir MP3 a OGG
    const oggBuffer = await convertirMP3aOGG(mp3Buffer);

    console.log('[Text-to-Speech-OGG] Audio OGG generado, tamaño:', oggBuffer.length, 'bytes');

    return oggBuffer;
  } catch (error) {
    console.error('[Text-to-Speech-OGG] Error:', error.message);
    throw error;
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

export {
  convertirAudioATexto,
  convertirTextoAAudio,
  convertirTextoAAudioOGG,
  convertirMP3aOGG,
  getAudioFromMessage
};
