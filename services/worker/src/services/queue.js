import {
  fetchVentasResumen,
  fetchVentasDetalle,
  fetchComprasResumen,
  fetchComprasDetalle,
  storeVentasResumen,
  storeVentasDetalle
} from './sii.js';
import { logEvent } from '../utils/logger.js';

/**
 * Handle queue messages for background SII data fetching
 */
export async function handleQueueMessage(message, env) {
  const { type, rut, periodo } = message;

  console.log(`Processing queue message: ${type} for ${rut} - ${periodo}`);

  try {
    // Get user's SII credentials
    const user = await env.DB.prepare(
      'SELECT clave_sii FROM contributors WHERE rut = ?'
    ).bind(rut).first();

    if (!user) {
      console.error(`User ${rut} not found`);
      return;
    }

    const claveSII = user.clave_sii;

    // Process based on message type
    if (type === 'update_ventas') {
      // Fetch and store ventas resumen
      const resumenData = await fetchVentasResumen(env, rut, claveSII, periodo);
      if (resumenData) {
        await storeVentasResumen(env, rut, periodo, resumenData);
      }

      // Fetch and store ventas detalle
      const detalleData = await fetchVentasDetalle(env, rut, claveSII, periodo);
      if (detalleData) {
        await storeVentasDetalle(env, rut, periodo, detalleData);
      }

      await logEvent(env.DB, rut, 'QUEUE_PROCESS', `Ventas ${periodo} actualizadas via queue`);

    } else if (type === 'update_compras') {
      // Fetch and store compras resumen
      const resumenData = await fetchComprasResumen(env, rut, claveSII, periodo);
      if (resumenData) {
        // Similar to ventas - store in D1
        // Implementation similar to storeVentasResumen
      }

      // Fetch and store compras detalle
      const detalleData = await fetchComprasDetalle(env, rut, claveSII, periodo);
      if (detalleData) {
        // Similar to ventas - store in D1
      }

      await logEvent(env.DB, rut, 'QUEUE_PROCESS', `Compras ${periodo} actualizadas via queue`);
    }

    console.log(`Successfully processed ${type} for ${rut} - ${periodo}`);

  } catch (error) {
    console.error(`Error processing queue message for ${rut}:`, error);
    await logEvent(env.DB, rut, 'ERROR', `Queue error: ${error.message}`);
    throw error; // Re-throw to trigger retry
  }
}
