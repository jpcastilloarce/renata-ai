import express from 'express';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WORKER_API_URL = process.env.WORKER_API_URL;
const AGENT_API_KEY = process.env.AGENT_API_KEY;

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

  console.log(`Mensaje recibido de ${from}: ${body}`);

  try {
    // Extract phone number from WhatsApp ID
    const phoneNumber = from.split('@')[0];

    // Format phone number with + prefix
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    // Send question to Worker API (Worker will look up RUT by phone)
    const response = await fetch(`${WORKER_API_URL}/api/agent/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AGENT_API_KEY}`
      },
      body: JSON.stringify({
        telefono: formattedPhone,
        mensaje: body
      })
    });

    if (!response.ok) {
      console.error('Error from Worker API:', await response.text());
      await msg.reply('Ocurrió un error al procesar tu mensaje. Intenta nuevamente.');
      return;
    }

    const data = await response.json();
    const answer = data.respuesta;

    // Send response back to user
    await msg.reply(answer);
    console.log(`Respuesta enviada a ${from}`);

  } catch (error) {
    console.error('Error procesando mensaje:', error);
    await msg.reply('Ocurrió un error. Por favor intenta nuevamente más tarde.');
  }
});

// Initialize WhatsApp client
console.log('Iniciando cliente de WhatsApp...');
whatsappClient.initialize();

/**
 * Helper function to get RUT by phone number
 * This could query the Worker API or D1 directly
 */
async function getRutByPhone(phoneNumber) {
  try {
    // Format phone number (add + prefix if needed)
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    // For now, we'll return the phone as-is since we don't have a direct endpoint
    // In production, you might want to add a /api/agent/get-user endpoint to the Worker
    // For this demo, we'll assume the phone format in DB matches
    return formattedPhone;
  } catch (error) {
    console.error('Error getting RUT by phone:', error);
    return null;
  }
}

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
