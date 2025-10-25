-- Datos de prueba para RUT 76123456-7
-- Ventas y Compras: Julio, Agosto, Septiembre 2025

-- ============================================================
-- VENTAS RESUMEN - Julio 2025
-- ============================================================
INSERT INTO ventas_resumen (rut, periodo, dcvCodigo, dcvNombreTipoDoc, dcvOperacion, dcvTipoIngresoDoc,
  rsmnCodigo, rsmnEstadoContab, rsmnIVAUsoComun, rsmnLink, rsmnMntExe, rsmnMntIVA, rsmnMntIVANoRec,
  rsmnMntNeto, rsmnMntTotal, rsmnTipoDocInteger, rsmnTotDoc, rsmnTotalRutEmisor)
VALUES
('76123456-7', '2025-07', 1234, 'Factura Electrónica', NULL, 'DET_ELE',
  1234, NULL, 0, 1, 0, 380000, 0, 2000000, 2380000, 33, 15, NULL),
('76123456-7', '2025-07', 1235, 'Nota de Crédito Electrónica', NULL, 'DET_ELE',
  1235, NULL, 0, 1, 0, 19000, 0, 100000, 119000, 61, 2, NULL);

-- ============================================================
-- VENTAS RESUMEN - Agosto 2025
-- ============================================================
INSERT INTO ventas_resumen (rut, periodo, dcvCodigo, dcvNombreTipoDoc, dcvOperacion, dcvTipoIngresoDoc,
  rsmnCodigo, rsmnEstadoContab, rsmnIVAUsoComun, rsmnLink, rsmnMntExe, rsmnMntIVA, rsmnMntIVANoRec,
  rsmnMntNeto, rsmnMntTotal, rsmnTipoDocInteger, rsmnTotDoc, rsmnTotalRutEmisor)
VALUES
('76123456-7', '2025-08', 1234, 'Factura Electrónica', NULL, 'DET_ELE',
  1234, NULL, 0, 1, 0, 456000, 0, 2400000, 2856000, 33, 18, NULL),
('76123456-7', '2025-08', 1235, 'Nota de Crédito Electrónica', NULL, 'DET_ELE',
  1235, NULL, 0, 1, 0, 28500, 0, 150000, 178500, 61, 1, NULL);

-- ============================================================
-- VENTAS RESUMEN - Septiembre 2025
-- ============================================================
INSERT INTO ventas_resumen (rut, periodo, dcvCodigo, dcvNombreTipoDoc, dcvOperacion, dcvTipoIngresoDoc,
  rsmnCodigo, rsmnEstadoContab, rsmnIVAUsoComun, rsmnLink, rsmnMntExe, rsmnMntIVA, rsmnMntIVANoRec,
  rsmnMntNeto, rsmnMntTotal, rsmnTipoDocInteger, rsmnTotDoc, rsmnTotalRutEmisor)
VALUES
('76123456-7', '2025-09', 1234, 'Factura Electrónica', NULL, 'DET_ELE',
  1234, NULL, 0, 1, 0, 532000, 0, 2800000, 3332000, 33, 20, NULL),
('76123456-7', '2025-09', 1235, 'Nota de Crédito Electrónica', NULL, 'DET_ELE',
  1235, NULL, 0, 1, 0, 38000, 0, 200000, 238000, 61, 3, NULL);

-- ============================================================
-- COMPRAS RESUMEN - Julio 2025
-- ============================================================
INSERT INTO compras_resumen (rut, periodo, dcvCodigo, dcvNombreTipoDoc, dcvOperacion, dcvTipoIngresoDoc,
  rsmnCodigo, rsmnEstadoContab, rsmnIVAUsoComun, rsmnLink, rsmnMntExe, rsmnMntIVA, rsmnMntIVANoRec,
  rsmnMntNeto, rsmnMntTotal, rsmnTipoDocInteger, rsmnTotDoc, rsmnTotalRutEmisor)
VALUES
('76123456-7', '2025-07', 1234, 'Factura Electrónica', NULL, 'DET_ELE',
  1234, NULL, 0, 1, 0, 190000, 0, 1000000, 1190000, 33, 8, NULL),
('76123456-7', '2025-07', 1235, 'Factura No Electrónica', NULL, 'DET_MAN',
  1235, NULL, 0, 1, 0, 57000, 0, 300000, 357000, 30, 3, NULL);

-- ============================================================
-- COMPRAS RESUMEN - Agosto 2025
-- ============================================================
INSERT INTO compras_resumen (rut, periodo, dcvCodigo, dcvNombreTipoDoc, dcvOperacion, dcvTipoIngresoDoc,
  rsmnCodigo, rsmnEstadoContab, rsmnIVAUsoComun, rsmnLink, rsmnMntExe, rsmnMntIVA, rsmnMntIVANoRec,
  rsmnMntNeto, rsmnMntTotal, rsmnTipoDocInteger, rsmnTotDoc, rsmnTotalRutEmisor)
VALUES
('76123456-7', '2025-08', 1234, 'Factura Electrónica', NULL, 'DET_ELE',
  1234, NULL, 0, 1, 0, 228000, 0, 1200000, 1428000, 33, 10, NULL),
('76123456-7', '2025-08', 1235, 'Factura No Electrónica', NULL, 'DET_MAN',
  1235, NULL, 0, 1, 0, 76000, 0, 400000, 476000, 30, 4, NULL);

-- ============================================================
-- COMPRAS RESUMEN - Septiembre 2025
-- ============================================================
INSERT INTO compras_resumen (rut, periodo, dcvCodigo, dcvNombreTipoDoc, dcvOperacion, dcvTipoIngresoDoc,
  rsmnCodigo, rsmnEstadoContab, rsmnIVAUsoComun, rsmnLink, rsmnMntExe, rsmnMntIVA, rsmnMntIVANoRec,
  rsmnMntNeto, rsmnMntTotal, rsmnTipoDocInteger, rsmnTotDoc, rsmnTotalRutEmisor)
VALUES
('76123456-7', '2025-09', 1234, 'Factura Electrónica', NULL, 'DET_ELE',
  1234, NULL, 0, 1, 0, 266000, 0, 1400000, 1666000, 33, 12, NULL),
('76123456-7', '2025-09', 1235, 'Factura No Electrónica', NULL, 'DET_MAN',
  1235, NULL, 0, 1, 0, 95000, 0, 500000, 595000, 30, 5, NULL);
