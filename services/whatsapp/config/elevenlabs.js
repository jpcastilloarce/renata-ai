/**
 * Configuracion de ElevenLabs para el servicio WhatsApp
 */

const { ElevenLabsClient } = require('elevenlabs');

// Inicializar cliente de ElevenLabs con API key desde variables de entorno
const elevenLabsClient = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

// Configuracion de voz
const VOICE_CONFIG = {
  voiceId: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL', // Voz femenina en español por defecto
  modelId: 'eleven_multilingual_v2', // Modelo multilingüe v2 (mejor para español)
  voiceSettings: {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true
  }
};

module.exports = {
  elevenLabsClient,
  VOICE_CONFIG
};
