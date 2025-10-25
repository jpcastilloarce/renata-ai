# 🎙️ Configuración de ElevenLabs - Variables de Entorno

## 📋 Variables Necesarias

```bash
ELEVENLABS_API_KEY=sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812
ELEVENLABS_VOICE_ID=NAnUaSlB91fcxXqdbhZB
```

---

## 📁 Ubicación de los Archivos `.env`

### **1. WhatsApp Service**
**Archivo:** `services/whatsapp/.env`

```bash
# WhatsApp Service - Variables de Entorno
PORT=3000
WORKER_API_URL=http://localhost:8787
AGENT_API_KEY=tu-api-key-secreta

# ElevenLabs Configuration
ELEVENLABS_API_KEY=sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812
ELEVENLABS_VOICE_ID=NAnUaSlB91fcxXqdbhZB
```

**Usado por:**
- `services/whatsapp/index.js` (línea 16 y 82)
- `services/whatsapp/services/elevenLabs.js`

**Para qué:**
- Convertir audio recibido a texto (Speech-to-Text)

---

### **2. Cloudflare Worker (Local)**
**Archivo:** `services/worker/.env`

```bash
# Worker - Variables de Entorno (Local Development)
AGENT_API_KEY=tu-api-key-secreta

# ElevenLabs Configuration
ELEVENLABS_API_KEY=sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812
ELEVENLABS_VOICE_ID=NAnUaSlB91fcxXqdbhZB
```

**Usado por:**
- `services/worker/src/utils/responseFormatter.js` (línea 32, 35)
- `services/worker/src/services/elevenLabs.js`

**Para qué:**
- Convertir texto de respuesta a audio (Text-to-Speech)

---

### **3. Cloudflare Worker (Producción)**

**Opción A: Usando wrangler CLI (Recomendado)**

```bash
cd services/worker

# Agregar API Key como secret
npx wrangler secret put ELEVENLABS_API_KEY
# Pega: sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812

# Agregar Voice ID como secret (o variable normal)
npx wrangler secret put ELEVENLABS_VOICE_ID
# Pega: NAnUaSlB91fcxXqdbhZB
```

**Opción B: En wrangler.toml (solo Voice ID, no el API Key)**

```toml
# services/worker/wrangler.toml
name = "sii-rcv-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
AGENT_API_KEY = "tu-api-key-secreta"
ELEVENLABS_VOICE_ID = "NAnUaSlB91fcxXqdbhZB"

# ⚠️ ELEVENLABS_API_KEY debe agregarse con wrangler secret (NO aquí)
```

**Opción C: Cloudflare Dashboard**

1. Ve a: Workers & Pages → Tu Worker → Settings → Variables
2. Agregar variable tipo **Secret**:
   - Name: `ELEVENLABS_API_KEY`
   - Value: `sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812`
3. Agregar variable tipo **Text** (o Secret):
   - Name: `ELEVENLABS_VOICE_ID`
   - Value: `NAnUaSlB91fcxXqdbhZB`

---

## 🔍 Cómo se Consumen las Variables

### **En WhatsApp Service (Node.js)**

```javascript
// services/whatsapp/index.js
import dotenv from 'dotenv';
dotenv.config();

// Línea 16
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// Línea 82 - Uso
mensajeTexto = await audioToText(audioInfo.audioBuffer, ELEVENLABS_API_KEY);
```

```javascript
// services/whatsapp/services/elevenLabs.js
export async function audioToText(audioBuffer, apiKey) {
  // apiKey = process.env.ELEVENLABS_API_KEY (pasado como parámetro)
  const response = await fetch(`${ELEVENLABS_API_URL}/speech-to-text`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey  // ← Usa el apiKey aquí
    },
    body: formData
  });
}
```

---

### **En Cloudflare Worker**

```javascript
// services/worker/src/utils/responseFormatter.js
export async function formatResponse({ texto, telefono, env }) {

  // Línea 32 - Leer del env
  const voiceId = env.ELEVENLABS_VOICE_ID || VOCES_ESPANOL.FEMENINA;

  // Línea 35 - Pasar al servicio
  const audioBuffer = await textToAudio(
    env.ELEVENLABS_API_KEY,  // ← Usa env.ELEVENLABS_API_KEY
    texto,
    voiceId,                  // ← Usa env.ELEVENLABS_VOICE_ID
    { voice_settings: VOICE_PRESETS.AMIGABLE }
  );
}
```

```javascript
// services/worker/src/services/elevenLabs.js
export async function textToAudio(apiKey, text, voiceId, options = {}) {
  // apiKey = env.ELEVENLABS_API_KEY (pasado como parámetro)
  // voiceId = env.ELEVENLABS_VOICE_ID (pasado como parámetro)

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,  // ← Usa voiceId
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey  // ← Usa apiKey
      },
      body: JSON.stringify({ text, model_id, voice_settings })
    }
  );
}
```

---

### **En prospecto.js**

```javascript
// services/worker/src/routes/prospecto.js
router.post('/message', async (c) => {
  // ...

  // Línea 77 - formatResponse tiene acceso a c.env
  const respuestaFormateada = await formatResponse({
    texto: respuestaTexto,
    telefono,
    env: c.env  // ← Pasa todo el env, contiene ELEVENLABS_API_KEY y VOICE_ID
  });

  // formatResponse internamente usa:
  // - env.ELEVENLABS_API_KEY
  // - env.ELEVENLABS_VOICE_ID
});
```

---

## 📊 Flujo de Variables

```
┌─────────────────────────────────────────────────────┐
│          WHATSAPP SERVICE (Node.js)                 │
└─────────────────────────────────────────────────────┘
                      │
          Lee: services/whatsapp/.env
                      │
    ┌─────────────────┴──────────────────┐
    │                                    │
    ▼                                    ▼
ELEVENLABS_API_KEY              ELEVENLABS_VOICE_ID
(Conversión Audio→Texto)        (No usado en WhatsApp)
    │
    │ Pasa a: audioToText(buffer, apiKey)
    ▼
ElevenLabs STT API
    │
    ▼
Texto transcrito


┌─────────────────────────────────────────────────────┐
│         CLOUDFLARE WORKER                           │
└─────────────────────────────────────────────────────┘
                      │
    Lee: services/worker/.env (local)
    o    wrangler secrets (producción)
                      │
    ┌─────────────────┴──────────────────┐
    │                                    │
    ▼                                    ▼
ELEVENLABS_API_KEY              ELEVENLABS_VOICE_ID
(Conversión Texto→Audio)        (Selección de Voz)
    │                                    │
    │ Pasa a: textToAudio(apiKey, text, voiceId)
    │                                    │
    └────────────┬───────────────────────┘
                 ▼
         ElevenLabs TTS API
                 │
                 ▼
            Audio generado
```

---

## ✅ Verificación de Configuración

### **Test 1: Variables cargadas en WhatsApp Service**

```bash
cd services/whatsapp

# Verificar variables
node -e "
  require('dotenv').config();
  console.log('✅ ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY ? 'Configurada (sk_...)' : '❌ NO configurada');
  console.log('✅ ELEVENLABS_VOICE_ID:', process.env.ELEVENLABS_VOICE_ID || '❌ NO configurada');
"
```

**Salida esperada:**
```
✅ ELEVENLABS_API_KEY: Configurada (sk_...)
✅ ELEVENLABS_VOICE_ID: NAnUaSlB91fcxXqdbhZB
```

---

### **Test 2: Variables cargadas en Worker (Local)**

```bash
cd services/worker

# Iniciar en modo dev
npx wrangler dev

# Ver en los logs si carga correctamente
```

En el código, agregar temporalmente para debug:
```javascript
// En responseFormatter.js, línea 32
console.log('DEBUG - Voice ID:', env.ELEVENLABS_VOICE_ID);
console.log('DEBUG - API Key:', env.ELEVENLABS_API_KEY ? 'Configurada' : 'NO configurada');
```

---

### **Test 3: Variables en Producción**

```bash
cd services/worker

# Ver secrets configurados
npx wrangler secret list

# Debería mostrar:
# [
#   {
#     "name": "ELEVENLABS_API_KEY",
#     "type": "secret_text"
#   },
#   {
#     "name": "ELEVENLABS_VOICE_ID",
#     "type": "secret_text"
#   }
# ]
```

---

## 🧪 Test Completo End-to-End

### **Opción 1: Con curl**

```bash
# Test del Worker directamente
curl -X POST http://localhost:8787/api/prospecto/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tu-api-key" \
  -d '{
    "telefono": "56999999999",
    "mensaje": "Hola",
    "tipoMensajeOriginal": "audio"
  }'

# Si retorna tipo='audio', las variables están bien configuradas ✅
```

### **Opción 2: Con WhatsApp**

1. Inicia ambos servicios:
   ```bash
   # Terminal 1
   cd services/worker
   npx wrangler dev

   # Terminal 2
   cd services/whatsapp
   npm start
   ```

2. Envía un mensaje de audio por WhatsApp

3. Revisa los logs:
   ```
   [AUDIO] Detectado audio de 56993788826
   [AUDIO→TEXTO] Transcripción: Hola...
   DEBUG - Voice ID: NAnUaSlB91fcxXqdbhZB
   DEBUG - API Key: Configurada
   [PROSPECTO][AUDIO] Respuesta enviada
   ```

---

## 🔒 Seguridad

### ✅ **Buenas Prácticas**

```bash
# ✅ BIEN - Variables en .env (no en git)
ELEVENLABS_API_KEY=sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812

# ✅ BIEN - Sin espacios
ELEVENLABS_API_KEY=sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812

# ✅ BIEN - Sin comillas
ELEVENLABS_API_KEY=sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812
```

### ❌ **Evitar**

```bash
# ❌ MAL - Con espacios
ELEVENLABS_API_KEY = sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812

# ❌ MAL - Con comillas innecesarias
ELEVENLABS_API_KEY="sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812"

# ❌ MAL - En wrangler.toml (visible en git)
[vars]
ELEVENLABS_API_KEY = "sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812"
```

### **Verificar .gitignore**

```bash
# Asegurar que .env está ignorado
cat .gitignore | grep .env

# Si no está, agregarlo:
echo ".env" >> .gitignore
echo "services/whatsapp/.env" >> .gitignore
echo "services/worker/.env" >> .gitignore
```

---

## 📝 Resumen

| Variable | Ubicación | Uso |
|----------|-----------|-----|
| `ELEVENLABS_API_KEY` | `services/whatsapp/.env` | Audio→Texto (STT) |
| `ELEVENLABS_API_KEY` | `services/worker/.env` | Texto→Audio (TTS) |
| `ELEVENLABS_VOICE_ID` | `services/whatsapp/.env` | No usado (opcional) |
| `ELEVENLABS_VOICE_ID` | `services/worker/.env` | Selección de voz |

**Formato:**
```bash
ELEVENLABS_API_KEY=sk_7d3d95a5a4aa73c60c949ba0eeb048d3542737384c2da812
ELEVENLABS_VOICE_ID=NAnUaSlB91fcxXqdbhZB
```

**Sin:**
- ❌ Espacios alrededor del `=`
- ❌ Comillas `"` o `'`
- ❌ Saltos de línea entre valor

---

## 🚀 Listo para Usar

Con estas dos líneas en cada archivo `.env`, el sistema está listo para:

1. ✅ Convertir audio recibido a texto
2. ✅ Convertir respuestas de texto a audio
3. ✅ Usar tu voz personalizada (NAnUaSlB91fcxXqdbhZB)

**Última actualización:** 2025-10-25
