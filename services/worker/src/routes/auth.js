import { Hono } from 'hono';
import { hashPassword, comparePassword, generateToken, generateOTP } from '../utils/crypto.js';
import { logEvent } from '../utils/logger.js';

const router = new Hono();

/**
 * POST /api/register
 * Register a new contributor with OTP verification via WhatsApp
 */
router.post('/register', async (c) => {
  try {
    const { rut, nombre, password, clave_sii, telefono } = await c.req.json();

    // Validate input
    if (!rut || !nombre || !password || !clave_sii || !telefono) {
      return c.json({ error: 'Faltan campos requeridos' }, 400);
    }

    // Check if user already exists
    const existing = await c.env.DB.prepare(
      'SELECT rut FROM contributors WHERE rut = ?'
    ).bind(rut).first();

    if (existing) {
      return c.json({ error: 'El RUT ya está registrado' }, 409);
    }

    // Hash password
    const password_hash = await hashPassword(password);

    // Create user
    await c.env.DB.prepare(
      'INSERT INTO contributors (rut, nombre, password_hash, clave_sii, telefono, verified) VALUES (?, ?, ?, ?, ?, 0)'
    ).bind(rut, nombre, password_hash, clave_sii, telefono).run();

    // Generate OTP
    const otp_code = generateOTP();
    const expires_at = Math.floor(Date.now() / 1000) + 300; // 5 minutes

    // Store OTP
    await c.env.DB.prepare(
      'INSERT INTO otp (rut, code, expires_at) VALUES (?, ?, ?)'
    ).bind(rut, otp_code, expires_at).run();

    // Send OTP via WhatsApp service
    try {
      const whatsappResponse = await fetch(`${c.env.WHATSAPP_SERVICE_URL}/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.AGENT_API_KEY}`
        },
        body: JSON.stringify({
          telefono,
          codigo: otp_code
        })
      });

      if (!whatsappResponse.ok) {
        console.error('Failed to send OTP via WhatsApp:', await whatsappResponse.text());
      }
    } catch (error) {
      console.error('Error calling WhatsApp service:', error);
      // Don't fail the registration if WhatsApp fails
    }

    await logEvent(c.env.DB, rut, 'REGISTER', 'Usuario registrado, OTP enviado');

    return c.json({
      message: 'Usuario registrado exitosamente. Código OTP enviado por WhatsApp.',
      rut
    }, 201);
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({ error: 'Error al registrar usuario' }, 500);
  }
});

/**
 * POST /api/verify-otp
 * Verify OTP code and activate user account
 */
router.post('/verify-otp', async (c) => {
  try {
    const { rut, codigo } = await c.req.json();

    if (!rut || !codigo) {
      return c.json({ error: 'Se requiere RUT y código' }, 400);
    }

    // Get OTP from database
    const otpRecord = await c.env.DB.prepare(
      'SELECT code, expires_at FROM otp WHERE rut = ? ORDER BY id DESC LIMIT 1'
    ).bind(rut).first();

    if (!otpRecord) {
      return c.json({ error: 'No se encontró código OTP para este RUT' }, 404);
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (now > otpRecord.expires_at) {
      return c.json({ error: 'El código OTP ha expirado' }, 401);
    }

    // Verify code
    if (otpRecord.code !== codigo) {
      return c.json({ error: 'Código OTP incorrecto' }, 401);
    }

    // Mark user as verified
    await c.env.DB.prepare(
      'UPDATE contributors SET verified = 1 WHERE rut = ?'
    ).bind(rut).run();

    // Delete used OTP
    await c.env.DB.prepare(
      'DELETE FROM otp WHERE rut = ?'
    ).bind(rut).run();

    await logEvent(c.env.DB, rut, 'VERIFY_OTP', 'Teléfono verificado exitosamente');

    return c.json({
      message: 'Teléfono verificado exitosamente. Ya puedes iniciar sesión.'
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return c.json({ error: 'Error al verificar código OTP' }, 500);
  }
});

/**
 * POST /api/login
 * Authenticate user and create session
 */
router.post('/login', async (c) => {
  try {
    const { rut, password } = await c.req.json();

    if (!rut || !password) {
      return c.json({ error: 'Se requiere RUT y contraseña' }, 400);
    }

    // Get user from database
    const user = await c.env.DB.prepare(
      'SELECT rut, password_hash, verified FROM contributors WHERE rut = ?'
    ).bind(rut).first();

    if (!user) {
      return c.json({ error: 'Credenciales inválidas' }, 401);
    }

    // Check if user is verified
    if (!user.verified) {
      return c.json({ error: 'Usuario no verificado. Por favor verifica tu teléfono primero.' }, 401);
    }

    // Verify password
    const passwordValid = await comparePassword(password, user.password_hash);
    if (!passwordValid) {
      return c.json({ error: 'Credenciales inválidas' }, 401);
    }

    // Generate session token
    const token = generateToken();
    const created_at = Math.floor(Date.now() / 1000);
    const expires_at = created_at + 86400; // 24 hours

    // Store session in KV (for fast access)
    await c.env.SESSIONS_KV.put(token, rut, {
      expirationTtl: 86400 // 24 hours
    });

    // Also store in D1 for backup/tracking
    await c.env.DB.prepare(
      'INSERT INTO sessions (token, rut, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(token, rut, created_at, expires_at).run();

    await logEvent(c.env.DB, rut, 'LOGIN', 'Usuario inició sesión');

    return c.json({
      token,
      message: 'Inicio de sesión exitoso'
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Error al iniciar sesión' }, 500);
  }
});

export default router;
