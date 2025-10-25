/**
 * router.js
 * Endpoint de routing para identificar tipo de usuario
 *
 * RESPONSABILIDAD: Exponer el servicio userRouter como API REST
 */

import { Hono } from 'hono';
import { identifyUser, routeMessage } from '../services/userRouter.js';

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
 * POST /api/router/identify
 * Identifica si un teléfono es de cliente o prospecto
 */
router.post('/identify', async (c) => {
  try {
    const { telefono } = await c.req.json();

    if (!telefono) {
      return c.json({ error: 'Se requiere teléfono' }, 400);
    }

    const type = await routeMessage(c.env.DB, telefono);

    return c.json({ type });

  } catch (error) {
    console.error('Error en router/identify:', error);
    return c.json({ error: 'Error al identificar usuario' }, 500);
  }
});

/**
 * POST /api/router/info
 * Obtiene información detallada de un usuario
 */
router.post('/info', async (c) => {
  try {
    const { telefono } = await c.req.json();

    if (!telefono) {
      return c.json({ error: 'Se requiere teléfono' }, 400);
    }

    const userInfo = await identifyUser(c.env.DB, telefono);

    return c.json(userInfo);

  } catch (error) {
    console.error('Error en router/info:', error);
    return c.json({ error: 'Error al obtener información' }, 500);
  }
});

export default router;
