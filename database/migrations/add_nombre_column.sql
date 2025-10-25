-- Migración: Agregar columna nombre a tabla contributors
-- Fecha: 2025-10-25

-- Agregar columna nombre (primero como nullable, luego actualizar, luego hacer NOT NULL)
ALTER TABLE contributors ADD COLUMN nombre TEXT;

-- Actualizar registros existentes con un nombre por defecto
UPDATE contributors SET nombre = 'Usuario' WHERE nombre IS NULL;
