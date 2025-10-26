-- schema.sql: Definición de tablas D1

-- Tabla de contribuyentes (usuarios)
CREATE TABLE contributors (
    rut TEXT PRIMARY KEY,             -- RUT del contribuyente (ej: '76123456-7')
    nombre TEXT NOT NULL,             -- Nombre del usuario para personalización
    password_hash TEXT NOT NULL,      -- Contraseña de nuestra app (hasheada, ej. bcrypt)
    clave_sii TEXT NOT NULL,          -- Clave del SII en texto plano (para uso interno)
    telefono TEXT NOT NULL,           -- Número de teléfono (WhatsApp) del usuario, formato +56XXXX
    verified INTEGER DEFAULT 0,       -- Indicador de teléfono verificado (0/1)
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de códigos OTP pendientes de verificación
CREATE TABLE otp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL,
    code TEXT NOT NULL,               -- código OTP de 6 dígitos
    expires_at INTEGER NOT NULL       -- timestamp Unix de expiración
);

-- Tabla de sesiones (opcional, complementa KV)
CREATE TABLE sessions (
    token TEXT PRIMARY KEY,           -- token de sesión (ej: UUID o aleatorio)
    rut TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- Tabla de logs de eventos
CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT,                         -- rut relacionado al evento (puede ser NULL para eventos globales)
    type TEXT,                        -- tipo de evento (e.g., 'SII_FETCH', 'ERROR', 'CRON')
    message TEXT,                     -- descripción o detalle del evento
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de mensajes (conversación vía WhatsApp)
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL,
    sender TEXT NOT NULL,             -- 'user' o 'agent' indicando quién envió el mensaje
    content TEXT NOT NULL,            -- texto del mensaje
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla Resumen de Ventas (RCV) por período
CREATE TABLE ventas_resumen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL,
    periodo TEXT NOT NULL,            -- período en formato YYYY-MM (ej: '2023-09')
    dcvCodigo INTEGER,
    dcvNombreTipoDoc TEXT,
    dcvOperacion TEXT,
    dcvTipoIngresoDoc TEXT,
    rsmnCodigo INTEGER,
    rsmnEstadoContab TEXT,
    rsmnIVAUsoComun INTEGER,
    rsmnLink INTEGER,                -- boolean 0/1
    rsmnMntExe INTEGER,
    rsmnMntIVA INTEGER,
    rsmnMntIVANoRec INTEGER,
    rsmnMntNeto INTEGER,
    rsmnMntTotal INTEGER,
    rsmnTipoDocInteger INTEGER,
    rsmnTotDoc INTEGER,
    rsmnTotalRutEmisor TEXT
);

-- Tabla Detalle de Ventas (RCV) documentos individuales
CREATE TABLE ventas_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL,
    periodo TEXT NOT NULL,
    cambiarTipoTran INTEGER,         -- boolean 0/1
    dcvCodigo INTEGER,
    dcvEstadoContab TEXT,
    descTipoTransaccion TEXT,
    detAnulado TEXT,
    detCdgSIISucur INTEGER,
    detCodigo INTEGER,
    detCredEc INTEGER,
    detDepEnvase INTEGER,
    detDvDoc TEXT,
    detEmisorNota INTEGER,
    detEventoReceptor TEXT,
    detEventoReceptorLeyenda TEXT,
    detExpNacionalidad TEXT,
    detExpNumId TEXT,
    detFchDoc TEXT,
    detFecAcuse TEXT,
    detFecRecepcion TEXT,
    detFecReclamado TEXT,
    detFolioDocRef TEXT,
    detIVAFueraPlazo INTEGER,
    detIVANoRetenido INTEGER,
    detIVAPropio INTEGER,
    detIVARetParcial INTEGER,
    detIVARetTotal INTEGER,
    detIVATerceros INTEGER,
    detIVAUsoComun TEXT,
    detImpVehiculo TEXT,
    detIndServicio INTEGER,
    detIndSinCosto INTEGER,
    detLey18211 INTEGER,
    detLiqDvEmisor TEXT,
    detLiqRutEmisor INTEGER,
    detLiqValComExe INTEGER,
    detLiqValComIVA INTEGER,
    detLiqValComNeto INTEGER,
    detMntActFijo TEXT,
    detMntCodNoRec TEXT,
    detMntExe INTEGER,
    detMntIVA INTEGER,
    detMntIVAActFijo TEXT,
    detMntIVANoRec TEXT,
    detMntNeto INTEGER,
    detMntNoFact INTEGER,
    detMntPeriodo INTEGER,
    detMntSinCredito TEXT,
    detMntTotal INTEGER,
    detNroDoc INTEGER,
    detNumInt TEXT,
    detPcarga INTEGER,
    detPsjInt INTEGER,
    detPsjNac INTEGER,
    detRutDoc INTEGER,
    detRznSoc TEXT,
    detTabCigarrillos TEXT,
    detTabElaborado TEXT,
    detTabPuros TEXT,
    detTasaImp TEXT,
    detTipoDoc INTEGER,
    detTipoDocRef INTEGER,
    detTipoTransaccion TEXT,
    detTpoImp TEXT,
    dhdrCodigo INTEGER,
    totalDinrMontoIVANoR TEXT,
    totalDtoiMontoImp INTEGER
);

-- Tabla Resumen de Compras (RCV)
CREATE TABLE compras_resumen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL,
    periodo TEXT NOT NULL,
    dcvCodigo INTEGER,
    dcvNombreTipoDoc TEXT,
    dcvOperacion TEXT,
    dcvTipoIngresoDoc TEXT,
    rsmnCodigo INTEGER,
    rsmnEstadoContab TEXT,
    rsmnIVAUsoComun INTEGER,
    rsmnLink INTEGER,
    rsmnMntExe INTEGER,
    rsmnMntIVA INTEGER,
    rsmnMntIVANoRec INTEGER,
    rsmnMntNeto INTEGER,
    rsmnMntTotal INTEGER,
    rsmnTipoDocInteger INTEGER,
    rsmnTotDoc INTEGER,
    rsmnTotalRutEmisor TEXT
);

-- Tabla Detalle de Compras (RCV)
CREATE TABLE compras_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL,
    periodo TEXT NOT NULL,
    cambiarTipoTran INTEGER,
    dcvCodigo INTEGER,
    dcvEstadoContab TEXT,
    descTipoTransaccion TEXT,
    detAnulado TEXT,
    detCdgSIISucur INTEGER,
    detCodigo INTEGER,
    detCredEc INTEGER,
    detDepEnvase INTEGER,
    detDvDoc TEXT,
    detEmisorNota INTEGER,
    detEventoReceptor TEXT,
    detEventoReceptorLeyenda TEXT,
    detExpNacionalidad TEXT,
    detExpNumId TEXT,
    detFchDoc TEXT,
    detFecAcuse TEXT,
    detFecRecepcion TEXT,
    detFecReclamado TEXT,
    detFolioDocRef TEXT,
    detIVAFueraPlazo INTEGER,
    detIVANoRetenido INTEGER,
    detIVAPropio INTEGER,
    detIVARetParcial INTEGER,
    detIVARetTotal INTEGER,
    detIVATerceros INTEGER,
    detIVAUsoComun TEXT,
    detImpVehiculo TEXT,
    detIndServicio INTEGER,
    detIndSinCosto INTEGER,
    detLey18211 INTEGER,
    detLiqDvEmisor TEXT,
    detLiqRutEmisor INTEGER,
    detLiqValComExe INTEGER,
    detLiqValComIVA INTEGER,
    detLiqValComNeto INTEGER,
    detMntActFijo TEXT,
    detMntCodNoRec TEXT,
    detMntExe INTEGER,
    detMntIVA INTEGER,
    detMntIVAActFijo TEXT,
    detMntIVANoRec TEXT,
    detMntNeto INTEGER,
    detMntNoFact INTEGER,
    detMntPeriodo INTEGER,
    detMntSinCredito TEXT,
    detMntTotal INTEGER,
    detNroDoc INTEGER,
    detNumInt TEXT,
    detPcarga INTEGER,
    detPsjInt INTEGER,
    detPsjNac INTEGER,
    detRutDoc INTEGER,
    detRznSoc TEXT,
    detTabCigarrillos TEXT,
    detTabElaborado TEXT,
    detTabPuros TEXT,
    detTasaImp TEXT,
    detTipoDoc INTEGER,
    detTipoDocRef INTEGER,
    detTipoTransaccion TEXT,
    detTpoImp TEXT,
    dhdrCodigo INTEGER,
    totalDinrMontoIVANoR TEXT,
    totalDtoiMontoImp INTEGER
);

-- Tabla de contratos PDF
CREATE TABLE contratos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL,
    file_name TEXT NOT NULL,           -- nombre o identificador del archivo PDF en R2
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de embeddings (fragmentos de texto indexados con AI)
CREATE TABLE embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contrato_id INTEGER NOT NULL,
    content TEXT NOT NULL              -- contenido de texto del fragmento
    -- (el vector no se almacena aquí, está en Vectorize; podríamos almacenar metadata adicional si se requiere)
);

-- Tabla de historial de conversaciones con prospectos
CREATE TABLE conversation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT NOT NULL,            -- Número de teléfono del prospecto
    mensaje_cliente TEXT NOT NULL,     -- Mensaje enviado por el cliente
    respuesta_agente TEXT NOT NULL,    -- Respuesta generada por el agente
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,  -- Fecha y hora del intercambio
    INDEX idx_telefono_timestamp (telefono, timestamp)  -- Índice para búsquedas rápidas por teléfono
);
