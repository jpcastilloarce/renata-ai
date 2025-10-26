-- Migración: Agregar tablas para soporte de MCP (Claude)
-- Fecha: 2025-10-26
-- Descripción: Tablas para códigos de activación y reuniones agendadas

-- Tabla de códigos de activación
CREATE TABLE IF NOT EXISTS activation_codes (
    code TEXT PRIMARY KEY,             -- Código de activación único (ej: 'ABC123XYZ')
    empresa_nombre TEXT,               -- Nombre de la empresa asociada al código
    plan TEXT DEFAULT 'basic',         -- Plan contratado (basic, pro, enterprise)
    used INTEGER DEFAULT 0,            -- Indicador si fue usado (0/1)
    used_by_rut TEXT,                  -- RUT del contributor que usó el código
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,                   -- Fecha de expiración del código (NULL = sin expiración)
    FOREIGN KEY (used_by_rut) REFERENCES contributors(rut)
);

-- Tabla de reuniones agendadas
CREATE TABLE IF NOT EXISTS scheduled_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT NOT NULL,            -- Número de teléfono del prospecto
    nombre_prospecto TEXT,             -- Nombre del prospecto
    email_prospecto TEXT,              -- Email del prospecto (opcional)
    fecha TEXT NOT NULL,               -- Fecha de la reunión (YYYY-MM-DD)
    hora TEXT NOT NULL,                -- Hora de la reunión (HH:MM)
    google_event_id TEXT,              -- ID del evento en Google Calendar
    google_meet_link TEXT,             -- Link de Google Meet generado
    status TEXT DEFAULT 'pending',     -- Estado: pending, confirmed, cancelled, completed
    notas TEXT,                        -- Notas adicionales sobre la reunión
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_scheduled_meetings_telefono ON scheduled_meetings(telefono);
CREATE INDEX IF NOT EXISTS idx_scheduled_meetings_fecha ON scheduled_meetings(fecha);
CREATE INDEX IF NOT EXISTS idx_scheduled_meetings_status ON scheduled_meetings(status);

-- Insertar códigos de activación de ejemplo (opcional)
-- Descomentar las siguientes líneas para agregar códigos de prueba

-- INSERT INTO activation_codes (code, empresa_nombre, plan, expires_at)
-- VALUES
--   ('DEMO2025', 'Empresa Demo', 'basic', '2025-12-31'),
--   ('PROMO123', 'Promoción Especial', 'pro', NULL),
--   ('TRIAL2025', 'Trial Gratuito', 'basic', '2025-03-31');
