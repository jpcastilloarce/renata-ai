import { Hono } from 'hono';

const router = new Hono();

/**
 * GET /api/ventas/resumen?periodo=YYYY-MM
 * Get sales summary for a specific period from local database
 */
router.get('/resumen', async (c) => {
  try {
    const rut = c.get('userRut');
    const periodo = c.req.query('periodo');

    if (!periodo) {
      return c.json({ error: 'Se requiere el parámetro periodo (formato YYYY-MM)' }, 400);
    }

    // Query sales summary from D1
    const { results } = await c.env.DB.prepare(`
      SELECT
        dcvNombreTipoDoc as tipo_doc,
        rsmnTipoDocInteger as codigo_tipo,
        rsmnTotDoc as cantidad_docs,
        rsmnMntNeto as monto_neto,
        rsmnMntIVA as monto_iva,
        rsmnMntTotal as monto_total
      FROM ventas_resumen
      WHERE rut = ? AND periodo = ?
    `).bind(rut, periodo).all();

    return c.json({
      rut,
      periodo,
      ventas_resumen: results
    });
  } catch (error) {
    console.error('Error fetching ventas resumen:', error);
    return c.json({ error: 'Error al obtener resumen de ventas' }, 500);
  }
});

/**
 * GET /api/ventas/detalle?periodo=YYYY-MM&tipo=33
 * Get detailed sales documents for a specific period and document type
 */
router.get('/detalle', async (c) => {
  try {
    const rut = c.get('userRut');
    const periodo = c.req.query('periodo');
    const tipo = c.req.query('tipo'); // Optional filter by document type

    if (!periodo) {
      return c.json({ error: 'Se requiere el parámetro periodo (formato YYYY-MM)' }, 400);
    }

    let query = `
      SELECT
        detNroDoc as folio,
        detFchDoc as fecha,
        detRutDoc as cliente_rut,
        detRznSoc as cliente_nombre,
        detMntNeto as monto_neto,
        detMntIVA as monto_iva,
        detMntTotal as monto_total,
        detTipoDoc as tipo_doc,
        detEventoReceptor as estado_acuse,
        detFecRecepcion as fecha_recepcion_sii
      FROM ventas_detalle
      WHERE rut = ? AND periodo = ?
    `;

    const params = [rut, periodo];

    if (tipo) {
      query += ' AND detTipoDoc = ?';
      params.push(parseInt(tipo));
    }

    const { results } = await c.env.DB.prepare(query).bind(...params).all();

    return c.json({
      rut,
      periodo,
      tipo_doc: tipo ? parseInt(tipo) : 'todos',
      documentos: results
    });
  } catch (error) {
    console.error('Error fetching ventas detalle:', error);
    return c.json({ error: 'Error al obtener detalle de ventas' }, 500);
  }
});

export default router;
