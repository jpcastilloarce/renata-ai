import express from 'express';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';
import { convertirAudioATexto, convertirTextoAAudioOGG, getAudioFromMessage } from './services/elevenLabs.js';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WORKER_API_URL = process.env.WORKER_API_URL;
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Initialize WhatsApp client with session persistence
const whatsappClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// WhatsApp client event handlers
whatsappClient.on('qr', (qr) => {
  console.log('');
  console.log('='.repeat(50));
  console.log('Escanea este código QR con WhatsApp:');
  console.log('='.repeat(50));
  qrcode.generate(qr, { small: true });
  console.log('='.repeat(50));
});

whatsappClient.on('ready', () => {
  console.log('');
  console.log('Cliente de WhatsApp listo y conectado!');
  console.log('');
});

whatsappClient.on('authenticated', () => {
  console.log('Autenticación exitosa');
});

whatsappClient.on('auth_failure', (msg) => {
  console.error('Error de autenticación:', msg);
});

whatsappClient.on('disconnected', (reason) => {
  console.log('Cliente desconectado:', reason);
});

// Handle incoming messages
whatsappClient.on('message', async (msg) => {
  const from = msg.from; // e.g., "56911111111@c.us"
  const body = msg.body;

  // Ignore messages from self
  if (msg.fromMe) {
    return;
  }

  console.log(`Mensaje recibido de ${from}`);

  try {
    // Extract phone number from WhatsApp ID (sin @c.us)
    const phoneNumber = from.split('@')[0]; // "56993788826"

    console.log(`\n[WHATSAPP] === MENSAJE RECIBIDO ===`);
    console.log(`[WHATSAPP] From (original): ${from}`);
    console.log(`[WHATSAPP] Teléfono extraído: "${phoneNumber}"`);
    console.log(`[WHATSAPP] Cuerpo mensaje: "${body}"`);

    // PASO 1: Detectar tipo de mensaje (texto o audio)
    const audioInfo = await getAudioFromMessage(msg);
    let mensajeTexto = body;

    if (audioInfo.hasAudio) {
      console.log(`[AUDIO] Detectado audio de ${phoneNumber}`);

      // Convertir audio a texto usando ElevenLabs
      try {
        mensajeTexto = await convertirAudioATexto(audioInfo.audioBuffer, 'audio.ogg');
        console.log(`[AUDIO→TEXTO] Transcripción: ${mensajeTexto.substring(0, 100)}...`);
      } catch (error) {
        console.error('Error convirtiendo audio a texto:', error);
        await msg.reply('No pude procesar tu mensaje de audio. Por favor intenta nuevamente o envía un mensaje de texto.');
        return;
      }
    }

    // PASO 2: Determinar si es cliente o prospecto
    const routeResponse = await fetch(`${WORKER_API_URL}/api/router/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AGENT_API_KEY}`
      },
      body: JSON.stringify({ telefono: phoneNumber })
    });

    if (!routeResponse.ok) {
      console.error('Error en router:', await routeResponse.text());
      await msg.reply('Ocurrió un error al procesar tu mensaje. Intenta nuevamente.');
      return;
    }

    const { type } = await routeResponse.json(); // 'cliente' o 'prospecto'

    console.log(`[WHATSAPP] Tipo de usuario identificado: ${type}`);

    // PASO 3: Enviar a la ruta correspondiente
    const endpoint = type === 'cliente'
      ? '/api/agent/message'      // Tu compañero trabaja aquí
      : '/api/prospecto-claude/message';  // Nueva ruta con Claude + MCP

    console.log(`[WHATSAPP] Endpoint a llamar: ${endpoint}`);
    console.log(`[WHATSAPP] Teléfono a enviar: "${phoneNumber}"`);

    const response = await fetch(`${WORKER_API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AGENT_API_KEY}`
      },
      body: JSON.stringify({
        telefono: phoneNumber,
        mensaje: mensajeTexto,
        source: 'whatsapp' // Indica que viene de WhatsApp para respuesta en audio
      })
    });

    if (!response.ok) {
      console.error('Error from Worker API:', await response.text());
      await msg.reply('Ocurrió un error al procesar tu mensaje. Intenta nuevamente.');
      return;
    }

    const data = await response.json();

    console.log(`[WHATSAPP] Respuesta recibida del Worker:`, JSON.stringify(data).substring(0, 200));

    // PASO 4: Manejar respuesta (texto o audio)
    if (data.tipo === 'audio' && data.contenido) {
      // Respuesta en formato audio
      console.log(`[WHATSAPP][AUDIO] Procesando respuesta de audio...`);

      try {
        // El Worker envía el audio MP3, necesitamos convertirlo a OGG
        const mp3Buffer = Buffer.from(data.contenido);
        console.log(`[WHATSAPP][AUDIO] Tamaño del MP3: ${mp3Buffer.length} bytes`);
        console.log(`[WHATSAPP][AUDIO] Convirtiendo MP3 a OGG para WhatsApp...`);

        // Importar la función de conversión
        const { convertirMP3aOGG } = await import('./services/elevenLabs.js');
        const oggBuffer = await convertirMP3aOGG(mp3Buffer);

        console.log(`[WHATSAPP][AUDIO] OGG generado, tamaño: ${oggBuffer.length} bytes`);

        // Convertir OGG a base64
        const audioBase64 = oggBuffer.toString('base64');
        const audioMedia = new MessageMedia(
          'audio/ogg; codecs=opus',
          audioBase64,
          'respuesta.ogg'
        );

        // Responder al mensaje original (reply) en lugar de sendMessage
        await msg.reply(audioMedia);
        console.log(`[${type.toUpperCase()}][AUDIO-OGG] Respuesta de audio enviada como reply a ${from}`);
      } catch (error) {
        console.error('[WHATSAPP][AUDIO] Error procesando audio:', error);
        // Fallback: enviar como texto
        const textoFallback = data.textoOriginal || 'Hubo un error al generar el audio.';
        await msg.reply(textoFallback);
      }

    } else {
      // Respuesta en formato texto
      const answer = data.respuesta || data.contenido;
      console.log(`[WHATSAPP][TEXTO] Enviando respuesta de texto: "${answer.substring(0, 50)}..."`);
      await msg.reply(answer);
      console.log(`[${type.toUpperCase()}][TEXTO] Respuesta enviada como reply a ${from}`);
    }

  } catch (error) {
    console.error('Error procesando mensaje:', error);
    await msg.reply('Ocurrió un error. Por favor intenta nuevamente más tarde.');
  }
});

// Initialize WhatsApp client
console.log('Iniciando cliente de WhatsApp...');
whatsappClient.initialize();


// REST API Endpoints

/**
 * POST /send-otp
 * Send OTP code via WhatsApp
 * Called by the Cloudflare Worker during registration
 */
app.post('/send-otp', async (req, res) => {
  try {
    const { telefono, codigo } = req.body;

    if (!telefono || !codigo) {
      return res.status(400).json({ error: 'Faltan parámetros' });
    }

    // Format WhatsApp chat ID
    // Remove + and @ symbols, ensure it ends with @c.us
    const chatId = telefono.replace(/[+\s]/g, '') + '@c.us';

    const message = `Tu código de verificación OTP es: ${codigo}\n\nEste código expira en 5 minutos.`;

    await whatsappClient.sendMessage(chatId, message);

    console.log(`OTP enviado a ${telefono}`);

    res.json({ status: 'enviado' });
  } catch (error) {
    console.error('Error enviando OTP:', error);
    res.status(500).json({ error: error.toString() });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const status = whatsappClient.info ? 'connected' : 'disconnected';
  res.json({
    status,
    service: 'whatsapp-gateway',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /
 * Welcome endpoint
 */
app.get('/', (req, res) => {
  res.json({
    message: 'WhatsApp Gateway Service for SII RCV Integration',
    version: '1.0.0',
    status: 'active'
  });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Servidor HTTP escuchando en puerto ${PORT}`);
  console.log(`Endpoints disponibles:`);
  console.log(`   - POST http://localhost:${PORT}/send-otp`);
  console.log(`   - GET  http://localhost:${PORT}/health`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️  Cerrando cliente de WhatsApp...');
  await whatsappClient.destroy();
  process.exit(0);
});
