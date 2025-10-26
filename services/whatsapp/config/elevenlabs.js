/**
 * Configuracion de ElevenLabs para el servicio WhatsApp
 */

import { ElevenLabsClient } from 'elevenlabs';

// Cliente lazy initialization
let _elevenLabsClient = null;

function getElevenLabsClient() {
  if (!_elevenLabsClient) {
    _elevenLabsClient = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    });
  }
  return _elevenLabsClient;
}

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

// Export via getter to maintain lazy initialization
const elevenLabsClient = {
  get textToSpeech() {
    return getElevenLabsClient().textToSpeech;
  },
  get speechToText() {
    return getElevenLabsClient().speechToText;
  }
};

export {
  elevenLabsClient,
  VOICE_CONFIG
};
