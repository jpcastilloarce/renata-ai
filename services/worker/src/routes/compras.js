import { Hono } from 'hono';

const router = new Hono();

/**
 * GET /api/compras/resumen?periodo=YYYY-MM
 * Get purchases summary for a specific period from local database
 */
router.get('/resumen', async (c) => {
  try {
    const rut = c.get('userRut');
    const periodo = c.req.query('periodo');

    if (!periodo) {
      return c.json({ error: 'Se requiere el parámetro periodo (formato YYYY-MM)' }, 400);
    }

    // Query purchases summary from D1
    const { results } = await c.env.DB.prepare(`
      SELECT
        dcvNombreTipoDoc as tipo_documento,
        rsmnTipoDocInteger as codigo_tipo,
        rsmnTotDoc as cantidad_docs,
        rsmnMntNeto as monto_neto,
        rsmnMntIVA as monto_iva,
        rsmnMntTotal as monto_total
      FROM compras_resumen
      WHERE rut = ? AND periodo = ?
    `).bind(rut, periodo).all();

    return c.json({
      rut,
      periodo,
      compras_resumen: results
    });
  } catch (error) {
    console.error('Error fetching compras resumen:', error);
    return c.json({ error: 'Error al obtener resumen de compras' }, 500);
  }
});

/**
 * GET /api/compras/detalle?periodo=YYYY-MM&tipo=33
 * Get detailed purchase documents for a specific period and document type
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
        detRutDoc as proveedor_rut,
        detRznSoc as proveedor_nombre,
        detMntNeto as monto_neto,
        detMntIVA as monto_iva,
        detMntTotal as monto_total,
        detTipoDoc as tipo_doc,
        detEventoReceptor as estado_acuse,
        detFecRecepcion as fecha_recepcion_sii
      FROM compras_detalle
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
    console.error('Error fetching compras detalle:', error);
    return c.json({ error: 'Error al obtener detalle de compras' }, 500);
  }
});

export default router;
