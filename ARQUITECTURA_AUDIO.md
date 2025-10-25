# 🎙️ Arquitectura de Audio/Texto con ElevenLabs

## 📋 Tabla de Contenidos
1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura General](#arquitectura-general)
3. [Componentes](#componentes)
4. [Flujos Detallados](#flujos-detallados)
5. [Archivos Creados/Modificados](#archivos-creadosmodificados)
6. [Configuración](#configuración)
7. [Testing](#testing)

---

## 🎯 Resumen Ejecutivo

Se implementó una arquitectura **modular y unificada** para manejar mensajes de texto y audio en Renata AI, con las siguientes características:

✅ **Detección Automática:** Identifica si el mensaje es texto o audio
✅ **Conversión Audio→Texto:** ElevenLabs transcribe automáticamente
✅ **Respuesta Inteligente:** Responde en el formato preferido del usuario
✅ **Conversión Texto→Audio:** ElevenLabs genera audio de respuestas
✅ **Punto Único de Salida:** `ResponseFormatter` garantiza consistencia
✅ **Sin Impacto:** El código de negocio (agent.js, prospecto.js) apenas cambia

---

## 🏗️ Arquitectura General

```
┌────────────────────────────────────────────────────────┐
│              USUARIO (WhatsApp)                        │
│         Envía: Texto o Audio                           │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│         WhatsApp Service (Node.js)                     │
│  ┌─────────────────────────────────────────────┐      │
│  │ 1. Detecta tipo de mensaje                  │      │
│  │    - msg.hasMedia                           │      │
│  │    - media.mimetype.startsWith('audio/')    │      │
│  └─────────────────────────────────────────────┘      │
│                     │                                  │
│         ┌───────────┴────────────┐                     │
│         ▼ AUDIO                  ▼ TEXTO               │
│  ┌─────────────────┐      ┌─────────────────┐         │
│  │ getAudioFrom    │      │ Texto directo   │         │
│  │ Message()       │      │ body = msg.body │         │
│  │ → audioBuffer   │      └─────────────────┘         │
│  └────────┬────────┘                │                 │
│           │                          │                 │
│           ▼                          │                 │
│  ┌─────────────────┐                │                 │
│  │ audioToText()   │                │                 │
│  │ (ElevenLabs STT)│                │                 │
│  │ → texto         │                │                 │
│  └────────┬────────┘                │                 │
│           │                          │                 │
│           └──────────┬───────────────┘                 │
│                      ▼                                 │
│           mensajeTexto + tipoMensajeOriginal          │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
        POST /api/router/identify (identificar usuario)
                     │
                     ▼
        POST /api/{agent|prospecto}/message
        {
          telefono: "56993788826",
          mensaje: "texto transcrito",
          tipoMensajeOriginal: "audio|texto"
        }
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│      Worker API (agent.js o prospecto.js)              │
│  ┌─────────────────────────────────────────────┐      │
│  │ 1. Actualizar preferencia si es audio       │      │
│  │    await actualizarModoSegunInput()          │      │
│  └─────────────────────────────────────────────┘      │
│                     │                                  │
│  ┌─────────────────────────────────────────────┐      │
│  │ 2. Procesar mensaje (lógica de negocio)     │      │
│  │    answer = "En octubre vendiste..."         │      │
│  └─────────────────────────────────────────────┘      │
│                     │                                  │
│  ┌─────────────────────────────────────────────┐      │
│  │ 3. Formatear respuesta                       │      │
│  │    formatResponse({ texto, telefono, env })  │      │
│  └────────────────┬────────────────────────────┘      │
│                   │                                    │
│        ┌──────────┴──────────┐                         │
│        ▼ Detecta              ▼ Detecta                │
│    modo='audio'           modo='texto'                 │
│        │                      │                         │
│  ┌─────────────────┐   ┌─────────────────┐            │
│  │ textToAudio()   │   │ Retorna texto   │            │
│  │ (ElevenLabs TTS)│   │ tal cual        │            │
│  │ → ArrayBuffer   │   └─────────────────┘            │
│  └─────────────────┘                                   │
│        │                      │                         │
│        └──────────┬───────────┘                         │
│                   ▼                                    │
│  Return { tipo, contenido, mimeType? }                 │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│         WhatsApp Service (Node.js)                     │
│  ┌─────────────────────────────────────────────┐      │
│  │ if (tipo === 'audio'):                       │      │
│  │   - Convertir a base64                       │      │
│  │   - Crear MessageMedia                       │      │
│  │   - sendMessage(audioMedia)                  │      │
│  │ else:                                        │      │
│  │   - msg.reply(texto)                         │      │
│  └─────────────────────────────────────────────┘      │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│              USUARIO (WhatsApp)                        │
│         Recibe: Texto o Audio                          │
└────────────────────────────────────────────────────────┘
```

---

## 🧩 Componentes

### **1. Servicio ElevenLabs (Worker)**
**Archivo:** `services/worker/src/services/elevenLabs.js`

**Funciones:**
```javascript
// Convierte audio a texto (Speech-to-Text)
audioToText(apiKey, audioBuffer, mimeType)
  → Promise<string>

// Convierte texto a audio (Text-to-Speech)
textToAudio(apiKey, text, voiceId, options)
  → Promise<ArrayBuffer>

// Lista voces disponibles
getVoices(apiKey)
  → Promise<Array>
```

**Constantes:**
```javascript
VOCES_ESPANOL = {
  FEMENINA: 'EXAVITQu4vr4xnSDxMaL',
  MASCULINA: 'pNInz6obpgDQGcFmaJgB',
  NEUTRAL: 'ErXwobaYiN019PkySvjV'
}

VOICE_PRESETS = {
  PROFESIONAL: { stability: 0.7, ... },
  AMIGABLE: { stability: 0.5, ... },
  CLARA: { stability: 0.8, ... }
}
```

---

### **2. ResponseFormatter (Worker)**
**Archivo:** `services/worker/src/utils/responseFormatter.js`

**Función Principal:**
```javascript
formatResponse({ texto, telefono, env, userMode? })
  → Promise<{
      tipo: 'texto' | 'audio',
      contenido: string | ArrayBuffer,
      mimeType?: 'audio/mpeg'
    }>
```

**Flujo Interno:**
1. Detecta modo del usuario (KV: `modo:{telefono}`)
2. Si modo = 'audio' → llama `textToAudio()`
3. Si modo = 'texto' → retorna texto tal cual
4. Si hay error → fallback a texto

**Funciones Auxiliares:**
```javascript
// Guardar preferencia de usuario
setModoUsuario(telefono, modo, env)

// Actualizar preferencia según input
actualizarModoSegunInput(telefono, tipoMensaje, env)
  // Si envía audio → guarda preferencia 'audio'

// Detectar modo guardado
detectarModoUsuario(telefono, env)
  → Promise<'audio' | 'texto'>
```

---

### **3. Servicio ElevenLabs (WhatsApp - Node.js)**
**Archivo:** `services/whatsapp/services/elevenLabs.js`

**Funciones:**
```javascript
// Obtener info de audio del mensaje
getAudioFromMessage(msg)
  → Promise<{
      hasAudio: boolean,
      audioBuffer?: Buffer,
      mimeType?: string
    }>

// Convertir audio a texto
audioToText(audioBuffer, apiKey)
  → Promise<string>
```

---

### **4. WhatsApp Service Actualizado**
**Archivo:** `services/whatsapp/index.js`

**Cambios:**
- Línea 6: Import de ElevenLabs functions
- Línea 16: Nueva env var `ELEVENLABS_API_KEY`
- Líneas 71-89: Detección y conversión de audio
- Líneas 123: Envío de `tipoMensajeOriginal`
- Líneas 136-156: Manejo de respuesta audio/texto

---

### **5. prospecto.js Actualizado**
**Archivo:** `services/worker/src/routes/prospecto.js`

**Cambios:**
- Línea 16: Import de `formatResponse`
- Línea 48: Recepción de `tipoMensajeOriginal`
- Líneas 55-57: Actualización de preferencia
- Líneas 76-95: Formateo y retorno unificado

---

## 🔄 Flujos Detallados

### **Flujo 1: Usuario Envía Audio**

```
1. Usuario graba audio en WhatsApp
   Duración: 5 segundos
   Formato: audio/ogg; codecs=opus

2. WhatsApp Service (index.js:72)
   getAudioFromMessage(msg)
   → { hasAudio: true, audioBuffer: Buffer, mimeType: 'audio/ogg' }

3. WhatsApp Service (index.js:82)
   audioToText(audioBuffer, ELEVENLABS_API_KEY)

   ElevenLabs API:
   POST https://api.elevenlabs.io/v1/speech-to-text
   FormData: { audio: Buffer, model_id: 'whisper-1' }

   ← Respuesta: { text: "Cuánto vendí en octubre" }

4. WhatsApp Service (index.js:123)
   POST /api/prospecto/message {
     telefono: "56993788826",
     mensaje: "Cuánto vendí en octubre",
     tipoMensajeOriginal: "audio"  ← MARCADO COMO AUDIO
   }

5. prospecto.js (línea 55)
   actualizarModoSegunInput("56993788826", "audio", env)

   KV Store:
   PUT "modo:56993788826" → "audio" (TTL: 30 días)

6. prospecto.js (línea 70)
   respuestaTexto = handlePrimerMensaje(...)
   → "¡Hola! Bienvenido a Renata AI..."

7. prospecto.js (línea 77)
   formatResponse({
     texto: "¡Hola! Bienvenido...",
     telefono: "56993788826",
     env
   })

   a) Detecta modo en KV: "audio"
   b) Llama textToAudio()

   ElevenLabs API:
   POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}
   Body: {
     text: "¡Hola! Bienvenido...",
     model_id: "eleven_multilingual_v2",
     voice_settings: { ... }
   }

   ← Respuesta: ArrayBuffer (audio MP3)

   c) Retorna: {
     tipo: 'audio',
     contenido: ArrayBuffer,
     mimeType: 'audio/mpeg'
   }

8. prospecto.js (línea 84-89)
   Return c.json({
     tipo: 'audio',
     contenido: Array.from(new Uint8Array(ArrayBuffer)),
     mimeType: 'audio/mpeg'
   })

9. WhatsApp Service (index.js:136)
   if (data.tipo === 'audio')

   a) Convierte array a Buffer
   b) Convierte Buffer a base64
   c) Crea MessageMedia
   d) Envía audio

10. Usuario recibe AUDIO en WhatsApp
```

---

### **Flujo 2: Usuario Envía Texto (Primera Vez)**

```
1. Usuario escribe: "Hola"

2. WhatsApp Service (index.js:72)
   getAudioFromMessage(msg)
   → { hasAudio: false }

   mensajeTexto = "Hola"
   tipoMensaje = 'texto'

3. WhatsApp Service (index.js:92)
   POST /api/router/identify
   ← { type: 'prospecto' }

4. WhatsApp Service (index.js:123)
   POST /api/prospecto/message {
     telefono: "56999999999",
     mensaje: "Hola",
     tipoMensajeOriginal: "texto"
   }

5. prospecto.js (línea 55)
   tipoMensajeOriginal !== 'audio'
   → NO actualiza preferencia (queda null)

6. prospecto.js (línea 70)
   respuestaTexto = getMensajeBienvenida()

7. prospecto.js (línea 77)
   formatResponse({...})

   a) Detecta modo en KV: null
   b) Default: 'texto'
   c) NO llama ElevenLabs
   d) Retorna: {
     tipo: 'texto',
     contenido: "¡Hola! Bienvenido..."
   }

8. prospecto.js (línea 91)
   Return c.json({
     tipo: 'texto',
     respuesta: "¡Hola! Bienvenido..."
   })

9. WhatsApp Service (index.js:152)
   else: msg.reply(answer)

10. Usuario recibe TEXTO en WhatsApp
```

---

### **Flujo 3: Usuario Cambia de Audio a Texto**

```
Situación: Usuario tiene preferencia 'audio' guardada

1. Usuario envía TEXTO: "SKY"

2. WhatsApp Service
   tipoMensajeOriginal = 'texto'

3. prospecto.js (línea 55)
   tipoMensajeOriginal !== 'audio'
   → NO actualiza preferencia
   → Preferencia sigue siendo 'audio'

4. Genera respuesta
   respuestaTexto = iniciarRegistro()

5. formatResponse()
   a) Lee KV: modo = 'audio'  ← SIGUE EN AUDIO
   b) Convierte respuesta a audio
   c) Usuario recibe AUDIO

¿Cómo cambiar a texto?
Opción 1: Agregar comando "MODO TEXTO"
Opción 2: Solo responder con texto si no hay ElevenLabs API key
Opción 3: Agregar preferencia manual en panel web
```

---

## 📁 Archivos Creados/Modificados

### **✅ Archivos NUEVOS:**

1. **`services/worker/src/services/elevenLabs.js`** (166 líneas)
   - Funciones de integración con ElevenLabs API
   - audioToText(), textToAudio(), getVoices()
   - Constantes de voces y presets

2. **`services/worker/src/utils/responseFormatter.js`** (139 líneas)
   - Módulo unificado de respuestas
   - formatResponse(), setModoUsuario(), actualizarModoSegunInput()
   - Detección automática de preferencias

3. **`services/whatsapp/services/elevenLabs.js`** (83 líneas)
   - Cliente Node.js para ElevenLabs
   - getAudioFromMessage(), audioToText()

4. **`EJEMPLO_AGENT_CON_AUDIO.md`** (Documentación)
   - Guía para integrar en agent.js

5. **`ARQUITECTURA_AUDIO.md`** (Este documento)
   - Documentación completa de la arquitectura

### **✏️ Archivos MODIFICADOS:**

1. **`services/whatsapp/index.js`**
   - Línea 3: Import MessageMedia
   - Línea 6: Import ElevenLabs functions
   - Línea 16: Nueva env var
   - Líneas 56-162: Lógica completa de audio/texto

2. **`services/worker/src/routes/prospecto.js`**
   - Línea 16: Import ResponseFormatter
   - Línea 48: Recepción de tipoMensajeOriginal
   - Líneas 55-95: Formateo unificado de respuestas

---

## ⚙️ Configuración

### **Variables de Entorno**

#### **WhatsApp Service (.env):**
```bash
PORT=3000
WORKER_API_URL=http://localhost:8787
AGENT_API_KEY=tu-api-key-secreta
ELEVENLABS_API_KEY=tu-elevenlabs-api-key  # ← NUEVO
```

#### **Worker (wrangler.toml):**
```toml
[vars]
AGENT_API_KEY = "tu-api-key-secreta"
ELEVENLABS_API_KEY = "tu-elevenlabs-api-key"  # ← NUEVO
```

O en Cloudflare Dashboard:
- Settings → Variables → Environment Variables
- Agregar: `ELEVENLABS_API_KEY`

---

### **Dependencias Node.js**

Agregar a `services/whatsapp/package.json`:
```json
{
  "dependencies": {
    "form-data": "^4.0.0",
    "node-fetch": "^3.3.0"
  }
}
```

Instalar:
```bash
cd services/whatsapp
npm install form-data node-fetch
```

---

## 🧪 Testing

### **1. Probar ElevenLabs directamente**

```javascript
// Test en Worker
import { textToAudio, VOCES_ESPANOL } from './services/elevenLabs.js';

const audioBuffer = await textToAudio(
  'tu-api-key',
  'Hola, esto es una prueba',
  VOCES_ESPANOL.FEMENINA
);

console.log('Audio generado:', audioBuffer.byteLength, 'bytes');
```

### **2. Probar ResponseFormatter**

```bash
curl -X POST http://localhost:8787/api/prospecto/message \
  -H "Authorization: Bearer TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "56999999999",
    "mensaje": "Hola",
    "tipoMensajeOriginal": "audio"
  }'
```

**Respuesta esperada (modo audio):**
```json
{
  "tipo": "audio",
  "contenido": [255, 251, 144, ...],
  "mimeType": "audio/mpeg"
}
```

**Respuesta esperada (modo texto):**
```json
{
  "tipo": "texto",
  "respuesta": "¡Hola! Bienvenido a Renata AI..."
}
```

### **3. Verificar preferencias en KV**

```bash
# En Cloudflare dashboard o wrangler CLI
wrangler kv:key get --namespace-id=<KV_ID> "modo:56993788826"
# Debe retornar: "audio" o "texto"
```

### **4. Probar flujo completo con WhatsApp**

1. Enviar audio por WhatsApp
2. Verificar logs en consola:
   ```
   [AUDIO] Detectado audio de 56993788826
   [AUDIO→TEXTO] Transcripción: Hola...
   [PROSPECTO][AUDIO] Respuesta enviada
   ```
3. Recibir audio de respuesta

---

## 🐛 Troubleshooting

### **Error: ElevenLabs API 401**
- Verificar `ELEVENLABS_API_KEY` está correctamente configurada
- Verificar que la API key es válida en ElevenLabs dashboard

### **Error: Audio no se envía por WhatsApp**
- Verificar que `MessageMedia` está importado
- Verificar formato del base64
- Verificar mimeType es `'audio/mpeg'`

### **Error: Respuesta siempre en texto**
- Verificar preferencia en KV: `modo:{telefono}`
- Verificar que `tipoMensajeOriginal` se está enviando
- Verificar logs de `formatResponse()`

### **Error: Audio no se transcribe**
- Verificar que el audio tiene formato soportado
- Verificar logs de `audioToText()`
- Probar con audio más corto (<30 segundos)

---

## 📊 Costos ElevenLabs

**Speech-to-Text:**
- ~$0.006 por minuto de audio

**Text-to-Speech:**
- ~$0.30 por 1000 caracteres
- Plan Free: 10,000 caracteres/mes

**Estimación mensual (1000 usuarios activos):**
- STT: $180 (30 minutos audio/mes)
- TTS: $300 (1M caracteres/mes)
- **Total: ~$480/mes**

---

## 🎯 Próximas Mejoras

1. **Comando para cambiar modo:**
   ```
   Usuario: "MODO TEXTO"
   → Cambiar preferencia a texto
   ```

2. **Caché de audio:**
   - Guardar respuestas frecuentes en R2
   - Evitar regenerar mismo audio

3. **Voces personalizadas:**
   - Por usuario/empresa
   - Guardar en tabla contributors

4. **Métricas:**
   - Tracking de uso STT/TTS
   - Dashboard de costos

---

**Versión:** 1.0
**Fecha:** 2025-10-25
**Autor:** Equipo Renata AI
