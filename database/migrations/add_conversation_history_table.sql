-- Migration: Crear tabla conversation_history para historial de conversaciones con prospectos
-- Fecha: 2025-10-25
-- Descripción: Almacena el historial completo de conversaciones con prospectos
--              para mantener contexto en conversaciones con OpenAI

CREATE TABLE IF NOT EXISTS conversation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT NOT NULL,            -- Número de teléfono del prospecto
    mensaje_cliente TEXT NOT NULL,     -- Mensaje enviado por el cliente
    respuesta_agente TEXT NOT NULL,    -- Respuesta generada por el agente
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP  -- Fecha y hora del intercambio
);

-- Crear índice para búsquedas rápidas por teléfono ordenadas por timestamp
CREATE INDEX IF NOT EXISTS idx_telefono_timestamp ON conversation_history(telefono, timestamp);

-- Nota: Para limpiar conversaciones antiguas (más de 24 horas), ejecutar periódicamente:
-- DELETE FROM conversation_history WHERE timestamp < datetime('now', '-24 hours');
