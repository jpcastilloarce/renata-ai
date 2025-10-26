import { Hono } from 'hono';
import { hashPassword, comparePassword, generateToken, generateOTP } from '../utils/crypto.js';
import { logEvent } from '../utils/logger.js';

const router = new Hono();

/**
 * Sanitiza un número de teléfono removiendo caracteres no numéricos
 * Ejemplos:
 * - "+56993788826" → "56993788826"
 * - "56-993-788-826" → "56993788826"
 * - "56 9 9378 8826" → "56993788826"
 */
function sanitizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/[^0-9]/g, '');
}

/**
 * POST /api/register
 * Register a new contributor with OTP verification via WhatsApp
 */
router.post('/register', async (c) => {
  try {
    const { rut, nombre, password, clave_sii, telefono, codigo_activacion, telefono_whatsapp } = await c.req.json();

    // Validate input
    if (!rut || !nombre || !password || !clave_sii || !telefono) {
      return c.json({ error: 'Faltan campos requeridos' }, 400);
    }

    // Sanitizar teléfonos (remover +, espacios, guiones, etc)
    const telefonoSanitized = sanitizePhone(telefono);
    const telefonoWhatsappSanitized = sanitizePhone(telefono_whatsapp);

    // Si se registra desde WhatsApp pero el teléfono no coincide
    if (telefonoWhatsappSanitized && telefonoSanitized !== telefonoWhatsappSanitized) {
      return c.json({
        error: 'Por favor regístrate usando el número de WhatsApp de tu empresa. El número proporcionado no coincide con el número desde el cual estás escribiendo.'
      }, 400);
    }

    // Si se proporciona código de activación, validarlo
    if (codigo_activacion) {
      const codeRecord = await c.env.DB.prepare(
        'SELECT code, used, expires_at FROM activation_codes WHERE code = ?'
      ).bind(codigo_activacion).first();

      if (!codeRecord) {
        return c.json({ error: 'Código de activación inválido' }, 400);
      }

      if (codeRecord.used === 1) {
        return c.json({ error: 'Código de activación ya fue utilizado' }, 400);
      }

      if (codeRecord.expires_at) {
        const expirationDate = new Date(codeRecord.expires_at);
        const now = new Date();
        if (now > expirationDate) {
          return c.json({ error: 'Código de activación expirado' }, 400);
        }
      }
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

    // Determinar si auto-verificar: Si viene desde WhatsApp y los teléfonos coinciden
    const autoVerified = telefonoWhatsappSanitized && telefonoSanitized === telefonoWhatsappSanitized ? 1 : 0;

    // Create user (guardando teléfono sanitizado - solo números)
    await c.env.DB.prepare(
      'INSERT INTO contributors (rut, nombre, password_hash, clave_sii, telefono, verified) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(rut, nombre, password_hash, clave_sii, telefonoSanitized, autoVerified).run();

    // Si hay código de activación, marcarlo como usado
    if (codigo_activacion) {
      await c.env.DB.prepare(
        'UPDATE activation_codes SET used = 1, used_by_rut = ? WHERE code = ?'
      ).bind(rut, codigo_activacion).run();
    }

    // Si ya está auto-verificado (registro desde WhatsApp con teléfono coincidente)
    if (autoVerified === 1) {
      await logEvent(c.env.DB, rut, 'REGISTER', 'Usuario registrado y auto-verificado vía WhatsApp');

      return c.json({
        message: 'Usuario registrado exitosamente. Tu cuenta ya está verificada y lista para usar.',
        rut,
        verified: true
      }, 201);
    }

    // Si NO está auto-verificado, generar y enviar OTP
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
          telefono: telefonoSanitized,
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
      rut,
      verified: false
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
