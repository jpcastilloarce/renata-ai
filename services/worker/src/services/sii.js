import { logEvent } from '../utils/logger.js';

/**
 * Fetch sales summary from SII API
 */
export async function fetchVentasResumen(env, rut, claveSII, periodo) {
  const url = `${env.SII_API_BASE}/ventas/resumen/${rut}/${periodo}?formato=json&certificacion=0`;

  const payload = {
    auth: {
      pass: {
        rut: rut,
        clave: claveSII
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SII_API_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    await handleSIIResponse(response, env, rut);

    if (response.ok) {
      const data = await response.json();
      return data;
    }

    return null;
  } catch (error) {
    console.error('Error fetching ventas resumen from SII:', error);
    await logEvent(env.DB, rut, 'ERROR', `SII ventas resumen error: ${error.message}`);
    return null;
  }
}

/**
 * Fetch sales detail from SII API
 */
export async function fetchVentasDetalle(env, rut, claveSII, periodo, dte = 0) {
  const url = `${env.SII_API_BASE}/ventas/detalle/${rut}/${periodo}/${dte}?formato=json&certificacion=0&tipo=rcv_csv`;

  const payload = {
    auth: {
      pass: {
        rut: rut,
        clave: claveSII
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SII_API_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    await handleSIIResponse(response, env, rut);

    if (response.ok) {
      const data = await response.json();
      return data;
    }

    return null;
  } catch (error) {
    console.error('Error fetching ventas detalle from SII:', error);
    await logEvent(env.DB, rut, 'ERROR', `SII ventas detalle error: ${error.message}`);
    return null;
  }
}

/**
 * Fetch purchases summary from SII API
 */
export async function fetchComprasResumen(env, rut, claveSII, periodo, estado = 0) {
  const url = `${env.SII_API_BASE}/compras/resumen/${rut}/${periodo}/${estado}?formato=json&certificacion=0`;

  const payload = {
    auth: {
      pass: {
        rut: rut,
        clave: claveSII
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SII_API_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    await handleSIIResponse(response, env, rut);

    if (response.ok) {
      const data = await response.json();
      return data;
    }

    return null;
  } catch (error) {
    console.error('Error fetching compras resumen from SII:', error);
    await logEvent(env.DB, rut, 'ERROR', `SII compras resumen error: ${error.message}`);
    return null;
  }
}

/**
 * Fetch purchases detail from SII API
 */
export async function fetchComprasDetalle(env, rut, claveSII, periodo, dte = 0) {
  const url = `${env.SII_API_BASE}/compras/detalle/${rut}/${periodo}/${dte}?formato=json&certificacion=0&tipo=rcv_csv`;

  const payload = {
    auth: {
      pass: {
        rut: rut,
        clave: claveSII
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SII_API_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    await handleSIIResponse(response, env, rut);

    if (response.ok) {
      const data = await response.json();
      return data;
    }

    return null;
  } catch (error) {
    console.error('Error fetching compras detalle from SII:', error);
    await logEvent(env.DB, rut, 'ERROR', `SII compras detalle error: ${error.message}`);
    return null;
  }
}

/**
 * Handle SII API response codes (429, 423, 401)
 */
async function handleSIIResponse(response, env, rut) {
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After') || '60';
    await logEvent(env.DB, rut, 'ERROR', `SII 429 Too Many Requests - Retry-After: ${retryAfter}s`);
    console.warn(`SII rate limit hit. Retry after ${retryAfter}s`);
  } else if (response.status === 423) {
    const lockReset = response.headers.get('X-Lock-Reset');
    const resetTime = lockReset ? new Date(parseInt(lockReset) * 1000).toISOString() : 'unknown';
    await logEvent(env.DB, rut, 'ERROR', `SII 423 Locked - X-Lock-Reset: ${resetTime}`);
    console.warn(`SII locked until ${resetTime}`);
  } else if (response.status === 401) {
    await logEvent(env.DB, rut, 'ERROR', 'SII 401 Unauthorized - Credenciales SII inválidas');
    console.error('SII credentials invalid');
  }
}

/**
 * Store ventas resumen data in D1
 */
export async function storeVentasResumen(env, rut, periodo, data) {
  try {
    // Delete existing data for this period
    await env.DB.prepare(
      'DELETE FROM ventas_resumen WHERE rut = ? AND periodo = ?'
    ).bind(rut, periodo).run();

    // Insert new data
    for (const item of data) {
      await env.DB.prepare(`
        INSERT INTO ventas_resumen (
          rut, periodo, dcvCodigo, dcvNombreTipoDoc, dcvOperacion, dcvTipoIngresoDoc,
          rsmnCodigo, rsmnEstadoContab, rsmnIVAUsoComun, rsmnLink, rsmnMntExe, rsmnMntIVA,
          rsmnMntIVANoRec, rsmnMntNeto, rsmnMntTotal, rsmnTipoDocInteger, rsmnTotDoc, rsmnTotalRutEmisor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        rut, periodo,
        item.dcvCodigo, item.dcvNombreTipoDoc, item.dcvOperacion, item.dcvTipoIngresoDoc,
        item.rsmnCodigo, item.rsmnEstadoContab, item.rsmnIVAUsoComun, item.rsmnLink,
        item.rsmnMntExe, item.rsmnMntIVA, item.rsmnMntIVANoRec, item.rsmnMntNeto,
        item.rsmnMntTotal, item.rsmnTipoDocInteger, item.rsmnTotDoc, item.rsmnTotalRutEmisor
      ).run();
    }

    await logEvent(env.DB, rut, 'SII_FETCH', `Ventas resumen ${periodo} actualizado`);
  } catch (error) {
    console.error('Error storing ventas resumen:', error);
    throw error;
  }
}

/**
 * Store ventas detalle data in D1
 */
export async function storeVentasDetalle(env, rut, periodo, data) {
  try {
    // Delete existing data for this period
    await env.DB.prepare(
      'DELETE FROM ventas_detalle WHERE rut = ? AND periodo = ?'
    ).bind(rut, periodo).run();

    // Insert new data (simplified - you would map all fields from the spec)
    for (const item of data) {
      await env.DB.prepare(`
        INSERT INTO ventas_detalle (
          rut, periodo, detNroDoc, detFchDoc, detRutDoc, detRznSoc,
          detMntNeto, detMntIVA, detMntTotal, detTipoDoc, detFecRecepcion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        rut, periodo,
        item.detNroDoc, item.detFchDoc, item.detRutDoc, item.detRznSoc,
        item.detMntNeto, item.detMntIVA, item.detMntTotal, item.detTipoDoc,
        item.detFecRecepcion
      ).run();
    }

    await logEvent(env.DB, rut, 'SII_FETCH', `Ventas detalle ${periodo} actualizado`);
  } catch (error) {
    console.error('Error storing ventas detalle:', error);
    throw error;
  }
}
