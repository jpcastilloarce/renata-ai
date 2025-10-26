/**
 * internal.js
 * Rutas internas para uso del servidor MCP
 * Estas rutas solo son accesibles con AGENT_API_KEY
 */

import { Hono } from 'hono';

const router = new Hono();

/**
 * Middleware de autenticación
 */
router.use('/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  const apiKey = authHeader.substring(7);

  if (apiKey !== c.env.AGENT_API_KEY) {
    return c.json({ error: 'API key inválida' }, 401);
  }

  await next();
});

/**
 * POST /api/internal/scheduled-meetings
 * Guarda una reunión agendada en D1
 */
router.post('/scheduled-meetings', async (c) => {
  try {
    const {
      telefono,
      nombre_prospecto,
      email_prospecto,
      fecha,
      hora,
      google_event_id,
      google_meet_link,
      notas,
    } = await c.req.json();

    // Requiere nombre, fecha, hora y al menos un método de contacto
    if (!nombre_prospecto || !fecha || !hora) {
      return c.json({ error: 'Faltan campos requeridos: nombre_prospecto, fecha, hora' }, 400);
    }

    if (!telefono && !email_prospecto) {
      return c.json({ error: 'Se requiere al menos teléfono o email' }, 400);
    }

    await c.env.DB.prepare(`
      INSERT INTO scheduled_meetings
      (telefono, nombre_prospecto, email_prospecto, fecha, hora, google_event_id, google_meet_link, notas, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      telefono || null,
      nombre_prospecto,
      email_prospecto || null,
      fecha,
      hora,
      google_event_id || null,
      google_meet_link || null,
      notas || null
    ).run();

    return c.json({
      success: true,
      message: 'Reunión guardada en base de datos',
    });
  } catch (error) {
    console.error('[INTERNAL] Error saving meeting:', error);
    return c.json({ error: 'Error al guardar reunión' }, 500);
  }
});

/**
 * POST /api/internal/activation-codes/validate
 * Valida un código de activación
 */
router.post('/activation-codes/validate', async (c) => {
  try {
    const { code } = await c.req.json();

    if (!code) {
      return c.json({ valid: false, error: 'Código no proporcionado' }, 400);
    }

    const result = await c.env.DB.prepare(`
      SELECT code, empresa_nombre, plan, used, expires_at
      FROM activation_codes
      WHERE code = ?
    `).bind(code).first();

    if (!result) {
      return c.json({
        valid: false,
        error: 'Código de activación no existe',
      });
    }

    if (result.used === 1) {
      return c.json({
        valid: false,
        error: 'Código de activación ya fue utilizado',
      });
    }

    if (result.expires_at) {
      const expirationDate = new Date(result.expires_at);
      const now = new Date();
      if (now > expirationDate) {
        return c.json({
          valid: false,
          error: 'Código de activación expirado',
        });
      }
    }

    return c.json({
      valid: true,
      code: result.code,
      empresa_nombre: result.empresa_nombre,
      plan: result.plan,
    });
  } catch (error) {
    console.error('[INTERNAL] Error validating code:', error);
    return c.json({ valid: false, error: 'Error al validar código' }, 500);
  }
});

/**
 * GET /api/internal/scheduled-meetings/:telefono
 * Obtiene reuniones agendadas por teléfono
 */
router.get('/scheduled-meetings/:telefono', async (c) => {
  try {
    const telefono = c.req.param('telefono');

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM scheduled_meetings
      WHERE telefono = ?
      ORDER BY fecha DESC, hora DESC
      LIMIT 10
    `).bind(telefono).all();

    return c.json({
      success: true,
      meetings: results,
    });
  } catch (error) {
    console.error('[INTERNAL] Error fetching meetings:', error);
    return c.json({ error: 'Error al obtener reuniones' }, 500);
  }
});

export default router;
