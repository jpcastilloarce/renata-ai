/**
 * Authentication middleware
 * Validates session tokens from KV store
 */
export async function authMiddleware(c, next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'No se proporcionó token de autenticación' }, 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    // Check token in KV store
    const rut = await c.env.SESSIONS_KV.get(token);

    if (!rut) {
      return c.json({ error: 'Token inválido o expirado' }, 401);
    }

    // Attach user RUT to context for use in route handlers
    c.set('userRut', rut);

    await next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return c.json({ error: 'Error de autenticación' }, 500);
  }
}
