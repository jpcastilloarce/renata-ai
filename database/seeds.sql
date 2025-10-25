-- seeds.sql: Datos de ejemplo en las tablas

-- 1) Usuario de ejemplo
INSERT INTO contributors (rut, nombre, password_hash, clave_sii, telefono, verified) VALUES
('76123456-7', 'Juan Pérez', '$2a$10$/glBCKZvf5QXnpyUfatfM.UJ3uWUzEcDO3WVSVJYGwkU8ZVfZMS7e', 'claveSII123', '+56911112222', 1);

-- 2) OTP generado para registro (asumir expiración en epoch futuro)
INSERT INTO otp (rut, code, expires_at) VALUES ('76123456-7', '123456', strftime('%s','now','+5 minutes'));

-- 3) Sesión activa (token ficticio)
INSERT INTO sessions (token, rut, created_at, expires_at) VALUES
('SESSION123', '76123456-7', strftime('%s','now'), strftime('%s','now','+1 day'));

-- 4) Logs de eventos
INSERT INTO logs (rut, type, message) VALUES
('76123456-7', 'CRON', 'Actualización diaria: RCV 2023-09 ventas y compras iniciada'),
('76123456-7', 'ERROR', 'SII 429 Too Many Requests – Retry-After: 60s');

-- 5) Mensajes de conversación de ejemplo
INSERT INTO messages (rut, sender, content, timestamp) VALUES
('76123456-7', 'user', '¿Cuánto vendí en septiembre?', '2025-09-15 10:00:00'),
('76123456-7', 'agent', 'En septiembre de 2025 vendiste CLP 5.950.000.', '2025-09-15 10:00:02'),
('76123456-7', 'user', '¿y en octubre?', '2025-09-15 10:01:00'),
('76123456-7', 'agent', 'En octubre de 2025 vendiste CLP 6.120.000.', '2025-09-15 10:01:05');

-- 6) Datos de Resumen de Ventas (septiembre 2023) – 2 tipos de documento
INSERT INTO ventas_resumen (rut, periodo, dcvCodigo, dcvNombreTipoDoc, dcvOperacion, dcvTipoIngresoDoc,
  rsmnCodigo, rsmnEstadoContab, rsmnIVAUsoComun, rsmnLink, rsmnMntExe, rsmnMntIVA, rsmnMntIVANoRec,
  rsmnMntNeto, rsmnMntTotal, rsmnTipoDocInteger, rsmnTotDoc, rsmnTotalRutEmisor)
VALUES
('76123456-7', '2023-09', 1234, 'Factura Electrónica', NULL, 'DET_ELE',
  1234, NULL, 0, 1, 0, 190, 0, 1000, 1190, 33, 1, NULL),
('76123456-7', '2023-09', 1235, 'Nota de Crédito Electrónica', NULL, 'DET_ELE',
  1235, NULL, 0, 1, 0, 19, 0, 100, 119, 61, 1, NULL);

-- 7) Datos de Detalle de Ventas (septiembre 2023) – ejemplo de 1 factura y 1 nota de crédito
INSERT INTO ventas_detalle (rut, periodo, cambiarTipoTran, dcvCodigo, dcvEstadoContab, descTipoTransaccion,
  detAnulado, detCdgSIISucur, detCodigo, detCredEc, detDepEnvase, detDvDoc,
  detEmisorNota, detEventoReceptor, detEventoReceptorLeyenda, detExpNacionalidad, detExpNumId,
  detFchDoc, detFecAcuse, detFecRecepcion, detFecReclamado, detFolioDocRef,
  detIVAFueraPlazo, detIVANoRetenido, detIVAPropio, detIVARetParcial, detIVARetTotal,
  detIVATerceros, detIVAUsoComun, detImpVehiculo, detIndServicio, detIndSinCosto,
  detLey18211, detLiqDvEmisor, detLiqRutEmisor, detLiqValComExe, detLiqValComIVA,
  detLiqValComNeto, detMntActFijo, detMntCodNoRec, detMntExe, detMntIVA,
  detMntIVAActFijo, detMntIVANoRec, detMntNeto, detMntNoFact, detMntPeriodo,
  detMntSinCredito, detMntTotal, detNroDoc, detNumInt, detPcarga,
  detPsjInt, detPsjNac, detRutDoc, detRznSoc, detTabCigarrillos,
  detTabElaborado, detTabPuros, detTasaImp, detTipoDoc, detTipoDocRef,
  detTipoTransaccion, detTpoImp, dhdrCodigo, totalDinrMontoIVANoR, totalDtoiMontoImp)
VALUES
-- Factura Electrónica
('76123456-7', '2023-09', 0, 1234, NULL, 'Del Giro',
  NULL, 0, 1234, 0, 0, '9',
  0, NULL, NULL, NULL, NULL,
  '01/09/2023', NULL, '02/09/2023 10:00:00', NULL, NULL,
  0, 0, 0, 0, 0,
  0, NULL, NULL, 0, 0,
  0, NULL, 0, 0, 0,
  0, NULL, NULL, 0, 190,
  NULL, NULL, 1000, 0, 0,
  NULL, 1190, 100, NULL, 201909,
  0, 0, 22222222, 'Cliente XYZ', NULL,
  NULL, NULL, '19', 33, 0,
  NULL, NULL, 5000, NULL, 0),
-- Nota de Crédito Electrónica
('76123456-7', '2023-09', 0, 1235, NULL, 'Del Giro',
  NULL, 0, 1235, 0, 0, ' ',
  0, NULL, NULL, NULL, NULL,
  '05/09/2023', NULL, '06/09/2023 08:30:00', NULL, NULL,
  0, 0, 0, 0, 0,
  0, NULL, NULL, 0, 0,
  0, NULL, 0, 0, 0,
  0, NULL, NULL, 0, 19,
  NULL, NULL, 100, 0, 0,
  NULL, 119, 50, NULL, 201909,
  0, 0, 22222222, 'Cliente XYZ', NULL,
  NULL, NULL, '19', 61, 0,
  NULL, NULL, 5001, NULL, 0);

-- 8) Resumen de Compras (septiembre 2023) – ejemplo 1 tipo
INSERT INTO compras_resumen (rut, periodo, dcvCodigo, dcvNombreTipoDoc, dcvOperacion, dcvTipoIngresoDoc,
  rsmnCodigo, rsmnEstadoContab, rsmnIVAUsoComun, rsmnLink, rsmnMntExe, rsmnMntIVA,
  rsmnMntIVANoRec, rsmnMntNeto, rsmnMntTotal, rsmnTipoDocInteger, rsmnTotDoc, rsmnTotalRutEmisor)
VALUES
('76123456-7', '2023-09', 2234, 'Factura Electrónica', NULL, 'DET_ELE',
  2234, NULL, 0, 1, 0, 152, 0, 800, 952, 33, 5, NULL);

-- 9) Detalle de Compras (sept 2023) – ejemplo 1 factura de proveedor
INSERT INTO compras_detalle (rut, periodo, cambiarTipoTran, dcvCodigo, dcvEstadoContab, descTipoTransaccion,
  detAnulado, detCdgSIISucur, detCodigo, detCredEc, detDepEnvase, detDvDoc,
  detEmisorNota, detEventoReceptor, detEventoReceptorLeyenda, detExpNacionalidad, detExpNumId,
  detFchDoc, detFecAcuse, detFecRecepcion, detFecReclamado, detFolioDocRef,
  detIVAFueraPlazo, detIVANoRetenido, detIVAPropio, detIVARetParcial, detIVARetTotal,
  detIVATerceros, detIVAUsoComun, detImpVehiculo, detIndServicio, detIndSinCosto,
  detLey18211, detLiqDvEmisor, detLiqRutEmisor, detLiqValComExe, detLiqValComIVA,
  detLiqValComNeto, detMntActFijo, detMntCodNoRec, detMntExe, detMntIVA,
  detMntIVAActFijo, detMntIVANoRec, detMntNeto, detMntNoFact, detMntPeriodo,
  detMntSinCredito, detMntTotal, detNroDoc, detNumInt, detPcarga,
  detPsjInt, detPsjNac, detRutDoc, detRznSoc, detTabCigarrillos,
  detTabElaborado, detTabPuros, detTasaImp, detTipoDoc, detTipoDocRef,
  detTipoTransaccion, detTpoImp, dhdrCodigo, totalDinrMontoIVANoR, totalDtoiMontoImp)
VALUES
('76123456-7', '2023-09', 0, 2234, NULL, 'Del Giro',
  NULL, 0, 2234, 0, 0, 'K',
  0, NULL, NULL, NULL, NULL,
  '10/09/2023', NULL, '11/09/2023 09:00:00', NULL, NULL,
  0, 0, 0, 0, 0,
  0, NULL, NULL, 0, 0,
  0, NULL, 0, 0, 0,
  0, NULL, NULL, 0, 152,
  NULL, NULL, 800, 0, 0,
  NULL, 952, 321, NULL, 201909,
  0, 0, 33444555, 'Proveedor ABC', NULL,
  NULL, NULL, '19', 33, 0,
  NULL, NULL, 6000, NULL, 0);

-- 10) Contrato PDF de ejemplo
INSERT INTO contratos (rut, file_name) VALUES
('76123456-7', 'Contrato_ACME.pdf');

-- 11) Fragmentos embebidos de ejemplo (del contrato anterior)
INSERT INTO embeddings (contrato_id, content) VALUES
(1, 'El contrato estará vigente hasta el 31 de diciembre de 2023.'),
(1, 'Las partes acuerdan que el servicio comenzará el 1 de enero de 2023.');
