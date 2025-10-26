-- Migración 002: Hacer telefono opcional en scheduled_meetings
-- Fecha: 2025-10-26
-- Razón: Permitir agendamiento solo con email, sin requerir teléfono

-- 1. Crear tabla temporal con la nueva estructura
CREATE TABLE scheduled_meetings_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT,                     -- Ahora es opcional (sin NOT NULL)
    nombre_prospecto TEXT,
    email_prospecto TEXT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    google_event_id TEXT,
    google_meet_link TEXT,
    status TEXT DEFAULT 'pending',
    notas TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. Copiar datos existentes (si hay alguno)
INSERT INTO scheduled_meetings_new
SELECT * FROM scheduled_meetings;

-- 3. Eliminar tabla vieja
DROP TABLE scheduled_meetings;

-- 4. Renombrar tabla nueva
ALTER TABLE scheduled_meetings_new RENAME TO scheduled_meetings;

-- 5. Recrear índices
CREATE INDEX IF NOT EXISTS idx_scheduled_meetings_telefono ON scheduled_meetings(telefono);
CREATE INDEX IF NOT EXISTS idx_scheduled_meetings_fecha ON scheduled_meetings(fecha);
CREATE INDEX IF NOT EXISTS idx_scheduled_meetings_status ON scheduled_meetings(status);
