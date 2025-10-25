# 🎙️ Ejemplo: Cómo Actualizar agent.js para Soporte de Audio

## Para: Desarrollador A (Tu compañero)

Este documento explica cómo integrar el soporte de audio/texto en `agent.js` usando el módulo `ResponseFormatter`.

---

## 📋 Cambios Necesarios en agent.js

### **1. Importar ResponseFormatter**

```javascript
// En la parte superior de agent.js
import { formatResponse, actualizarModoSegunInput } from '../utils/responseFormatter.js';
```

### **2. Modificar el Endpoint POST /message**

**ANTES:**
```javascript
router.post('/message', async (c) => {
  try {
    const { telefono, mensaje } = await c.req.json();

    // ... tu lógica actual ...

    let answer = '';
    if (questionType === 'ventas' || questionType === 'compras') {
      answer = await handleTaxQuestion(c.env, rut, mensaje, questionType);
    } else if (questionType === 'contrato' || questionType === 'general') {
      answer = await handleContractQuestion(c.env, rut, mensaje);
    }

    // Guardar mensajes
    // ...

    return c.json({ respuesta: answer });
  }
});
```

**DESPUÉS:**
```javascript
router.post('/message', async (c) => {
  try {
    const { telefono, mensaje, tipoMensajeOriginal } = await c.req.json();

    // ⭐ NUEVO: Actualizar preferencia si envió audio
    if (tipoMensajeOriginal === 'audio') {
      await actualizarModoSegunInput(telefono, 'audio', c.env);
    }

    // ... tu lógica actual (sin cambios) ...

    let answer = '';
    if (questionType === 'ventas' || questionType === 'compras') {
      answer = await handleTaxQuestion(c.env, rut, mensaje, questionType);
    } else if (questionType === 'contrato' || questionType === 'general') {
      answer = await handleContractQuestion(c.env, rut, mensaje);
    }

    // Guardar mensajes
    // ...

    // ⭐ NUEVO: Formatear respuesta (texto o audio)
    const respuestaFormateada = await formatResponse({
      texto: answer,
      telefono,
      env: c.env
    });

    // ⭐ NUEVO: Retornar en formato unificado
    if (respuestaFormateada.tipo === 'audio') {
      return c.json({
        tipo: 'audio',
        contenido: Array.from(new Uint8Array(respuestaFormateada.contenido)),
        mimeType: respuestaFormateada.mimeType
      });
    } else {
      return c.json({
        tipo: 'texto',
        respuesta: respuestaFormateada.contenido
      });
    }
  }
});
```

---

## 🎯 ¿Qué Hace Esto?

### **1. Recibe tipoMensajeOriginal**
```javascript
const { telefono, mensaje, tipoMensajeOriginal } = await c.req.json();
```
- WhatsApp service envía `tipoMensajeOriginal: 'audio'` o `'texto'`
- Si el usuario envió audio, ya viene convertido a texto en `mensaje`

### **2. Actualiza Preferencia del Usuario**
```javascript
if (tipoMensajeOriginal === 'audio') {
  await actualizarModoSegunInput(telefono, 'audio', c.env);
}
```
- Guarda en KV que este usuario prefiere audio
- La próxima vez, automáticamente le responderá con audio

### **3. Tu Lógica NO Cambia**
```javascript
// Todo esto sigue igual
let answer = '';
if (questionType === 'ventas' || questionType === 'compras') {
  answer = await handleTaxQuestion(...);
}
```
- Procesas el mensaje como siempre (ya viene en texto)
- Generas tu respuesta en texto como siempre

### **4. ResponseFormatter Hace la Magia**
```javascript
const respuestaFormateada = await formatResponse({
  texto: answer,
  telefono,
  env: c.env
});
```
- Detecta la preferencia del usuario en KV
- Si prefiere audio → convierte tu texto a audio con ElevenLabs
- Si prefiere texto → retorna el texto tal cual

### **5. Retorno Unificado**
```javascript
if (respuestaFormateada.tipo === 'audio') {
  return c.json({
    tipo: 'audio',
    contenido: Array.from(...),
    mimeType: 'audio/mpeg'
  });
} else {
  return c.json({
    tipo: 'texto',
    respuesta: respuestaFormateada.contenido
  });
}
```
- WhatsApp service detecta el tipo
- Envía audio o texto según corresponda

---

## 🔄 Flujo Completo

```
Usuario envía AUDIO por WhatsApp
    ↓
WhatsApp service: audioToText() → "¿Cuánto vendí en octubre?"
    ↓
POST /api/agent/message {
  telefono: "56993788826",
  mensaje: "¿Cuánto vendí en octubre?",
  tipoMensajeOriginal: "audio"  ← Indica que era audio
}
    ↓
agent.js recibe mensaje (YA EN TEXTO)
    ↓
Guarda preferencia: modo = 'audio'
    ↓
Tu lógica procesa (igual que siempre)
answer = "En octubre vendiste CLP 6.120.000"
    ↓
formatResponse() detecta modo = 'audio'
    ↓
Llama a ElevenLabs: textToAudio()
    ↓
Retorna: { tipo: 'audio', contenido: ArrayBuffer }
    ↓
WhatsApp service envía AUDIO al usuario
```

---

## 🎛️ Configuración

### **Variables de Entorno Necesarias**

Agregar a `wrangler.toml`:
```toml
[vars]
ELEVENLABS_API_KEY = "tu-api-key-de-elevenlabs"
```

O en Cloudflare Dashboard:
- Settings → Variables → Environment Variables
- Agregar: `ELEVENLABS_API_KEY`

---

## 🧪 Testing

### **Probar sin WhatsApp (curl)**

**Simular mensaje de audio:**
```bash
curl -X POST http://localhost:8787/api/agent/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_API_KEY" \
  -d '{
    "telefono": "+56993788826",
    "mensaje": "Cuánto vendí en octubre",
    "tipoMensajeOriginal": "audio"
  }'
```

**Simular mensaje de texto:**
```bash
curl -X POST http://localhost:8787/api/agent/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_API_KEY" \
  -d '{
    "telefono": "+56993788826",
    "mensaje": "Cuánto vendí en octubre",
    "tipoMensajeOriginal": "texto"
  }'
```

### **Forzar Modo Texto (sin ElevenLabs)**

Si quieres desactivar audio temporalmente:

```javascript
// En formatResponse, pasar userMode explícitamente
const respuestaFormateada = await formatResponse({
  texto: answer,
  telefono,
  env: c.env,
  userMode: 'texto'  // ← Fuerza modo texto
});
```

---

## ⚠️ Manejo de Errores

El módulo `ResponseFormatter` maneja errores automáticamente:

```javascript
// Si ElevenLabs falla
try {
  const respuestaFormateada = await formatResponse({
    texto: answer,
    telefono,
    env: c.env
  });
  // ...
} catch (error) {
  console.error('Error formateando respuesta:', error);
  // Fallback automático a texto
  return c.json({
    tipo: 'texto',
    respuesta: answer
  });
}
```

---

## 📊 Persistencia de Preferencias

Las preferencias se guardan en KV:

```
Key: "modo:{telefono}"
Value: "audio" o "texto"
TTL: 30 días
```

**Ver preferencia de un usuario:**
```javascript
const modo = await c.env.SESSIONS_KV.get('modo:56993788826');
console.log(modo); // "audio" o null
```

**Cambiar preferencia manualmente:**
```javascript
import { setModoUsuario } from '../utils/responseFormatter.js';

// Cambiar a texto
await setModoUsuario('56993788826', 'texto', c.env);

// Cambiar a audio
await setModoUsuario('56993788826', 'audio', c.env);
```

---

## 🎨 Personalizar Voz

En `responseFormatter.js`, puedes cambiar la voz:

```javascript
// Voz femenina (default)
VOCES_ESPANOL.FEMENINA

// Voz masculina
VOCES_ESPANOL.MASCULINA

// Voz neutral
VOCES_ESPANOL.NEUTRAL
```

Para cambiar globalmente, edita línea 28 de `responseFormatter.js`:
```javascript
const audioBuffer = await textToAudio(
  env.ELEVENLABS_API_KEY,
  texto,
  VOCES_ESPANOL.MASCULINA,  // ← Cambiar aquí
  { voice_settings: VOICE_PRESETS.PROFESIONAL }
);
```

---

## 📝 Resumen de Cambios

✅ **3 líneas para importar:**
```javascript
import { formatResponse, actualizarModoSegunInput } from '../utils/responseFormatter.js';
```

✅ **2 líneas para actualizar preferencia:**
```javascript
if (tipoMensajeOriginal === 'audio') {
  await actualizarModoSegunInput(telefono, 'audio', c.env);
}
```

✅ **5 líneas para formatear respuesta:**
```javascript
const respuestaFormateada = await formatResponse({
  texto: answer,
  telefono,
  env: c.env
});
```

✅ **10 líneas para retorno unificado:**
```javascript
if (respuestaFormateada.tipo === 'audio') {
  return c.json({
    tipo: 'audio',
    contenido: Array.from(new Uint8Array(respuestaFormateada.contenido)),
    mimeType: respuestaFormateada.mimeType
  });
} else {
  return c.json({
    tipo: 'texto',
    respuesta: respuestaFormateada.contenido
  });
}
```

**Total:** ~20 líneas de código para soporte completo de audio 🎙️

---

## 🤝 Coordinación

- ✅ **Tu zona (Desarrollador A):** `agent.js` - Implementar estos cambios
- ✅ **Zona del otro dev:** `prospecto.js` - Ya tiene estos cambios implementados
- ✅ **Zona compartida:** `responseFormatter.js` - NO modificar sin coordinar

---

¿Preguntas? Revisa `ARQUITECTURA_AUDIO.md` para detalles técnicos completos.
