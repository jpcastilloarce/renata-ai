/**
 * userRouter.js
 * Servicio que determina si un mensaje viene de un cliente o prospecto
 * y lo enruta al handler correspondiente
 *
 * RESPONSABILIDAD: Punto de decisión único para routing de mensajes
 * USADO POR: WhatsApp service y cualquier otro canal de mensajería
 */

/**
 * Identifica el tipo de usuario por su teléfono
 * @param {Object} db - D1 Database instance
 * @param {string} phoneNumber - Número sin @c.us (ej: "56993788826")
 * @returns {Promise<Object>} { type: 'cliente'|'prospecto', data: {...} }
 */
export async function identifyUser(db, phoneNumber) {
  try {
    // Buscar en tabla contributors
    const user = await db.prepare(
      'SELECT rut, nombre, verified FROM contributors WHERE telefono = ?'
    ).bind(phoneNumber).first();

    if (user) {
      // Usuario registrado = Cliente
      return {
        type: 'cliente',
        data: {
          rut: user.rut,
          nombre: user.nombre,
          verified: user.verified,
          telefono: phoneNumber
        }
      };
    }

    // Usuario no registrado = Prospecto
    return {
      type: 'prospecto',
      data: {
        telefono: phoneNumber
      }
    };

  } catch (error) {
    console.error('Error identificando usuario:', error);
    throw error;
  }
}

/**
 * Determina si un usuario debe ser tratado como cliente activo
 * @param {Object} userInfo - Resultado de identifyUser()
 * @returns {boolean}
 */
export function isActiveClient(userInfo) {
  return userInfo.type === 'cliente' && userInfo.data.verified === 1;
}

/**
 * Determina si un mensaje debe ir al flujo de clientes o prospectos
 * @param {Object} db - D1 Database
 * @param {string} phoneNumber - Número de teléfono
 * @returns {Promise<'cliente'|'prospecto'>} Tipo de flujo
 */
export async function routeMessage(db, phoneNumber) {
  const userInfo = await identifyUser(db, phoneNumber);

  // Los clientes verificados van al flujo de agent.js
  if (isActiveClient(userInfo)) {
    return 'cliente';
  }

  // Todos los demás van al flujo de prospectos
  return 'prospecto';
}
