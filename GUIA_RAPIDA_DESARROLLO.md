# 🚀 Guía Rápida de Desarrollo - Renata AI

## 👥 División de Trabajo

### 🟦 **Tu Compañero (Desarrollador A)** - CLIENTES
**Archivo principal:** `services/worker/src/routes/agent.js`

**Responsabilidades:**
- ✅ Clientes registrados y verificados
- ✅ RAG con OpenAI GPT-4o
- ✅ Consultas de ventas y compras
- ✅ Análisis de contratos

**NO TOCAR:** `prospecto.js`, `whatsapp/index.js`

---

### 🟩 **Tú (Desarrollador B)** - PROSPECTOS + WHATSAPP
**Archivos principales:**
- `services/worker/src/routes/prospecto.js`
- `services/whatsapp/index.js`

**Responsabilidades:**
- ✅ Usuarios no registrados (prospectos)
- ✅ Código de activación "SKY"
- ✅ Proceso de registro guiado
- ✅ Integración WhatsApp
- ✅ ElevenLabs (futuro)

**NO TOCAR:** `agent.js` (es de tu compañero)

---

## ⚡ Respuesta Rápida: ¿Cuándo se ejecuta agent.js?

```
Usuario registrado envía mensaje por WhatsApp
    ↓
WhatsApp Service captura mensaje (whatsapp/index.js:54)
    ↓
Llama a /api/router/identify
    ↓
Router identifica: "Es un CLIENTE" (usuario existe en DB + verified=1)
    ↓
WhatsApp envía a /api/agent/message
    ↓
⭐ AGENT.JS SE EJECUTA AQUÍ ⭐ (agent.js:46)
    ↓
Procesa con OpenAI y retorna respuesta
    ↓
WhatsApp envía respuesta al usuario
```

---

## 📋 Archivos Creados (Nuevos)

### Para que puedas trabajar sin conflictos:

1. **`services/worker/src/services/userRouter.js`**
   - Decide si mensaje va a cliente o prospecto
   - Consulta la tabla `contributors`

2. **`services/worker/src/routes/router.js`**
   - Endpoint: `/api/router/identify`
   - Expone el servicio userRouter como API

3. **`services/worker/src/routes/prospecto.js`** ← **TU ZONA**
   - Maneja prospectos
   - Código "SKY"
   - Registro en 4 pasos

4. **`services/whatsapp/index.js`** ← **MODIFICADO PARA TI**
   - Ahora llama primero al router
   - Luego envía a `/agent/message` o `/prospecto/message`

5. **`services/worker/src/index.js`** ← **ACTUALIZADO**
   - Monta las nuevas rutas

---

## 🧪 Cómo Probar tu Código

### Probar identificación de usuarios:
```bash
# Ver si un teléfono es cliente o prospecto
curl -X POST http://localhost:8787/api/router/identify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_API_KEY" \
  -d '{"telefono": "56993788826"}'

# Respuesta: {"type": "cliente"} o {"type": "prospecto"}
```

### Probar flujo de prospectos:
```bash
# Simular mensaje de prospecto
curl -X POST http://localhost:8787/api/prospecto/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_API_KEY" \
  -d '{
    "telefono": "56999999999",
    "mensaje": "Hola"
  }'

# Respuesta: mensaje de bienvenida
```

### Probar código de activación:
```bash
curl -X POST http://localhost:8787/api/prospecto/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_API_KEY" \
  -d '{
    "telefono": "56999999999",
    "mensaje": "SKY"
  }'

# Respuesta: inicia proceso de registro
```

---

## 🔄 Flujo Completo

```
┌──────────────────────┐
│ Usuario WhatsApp     │
│ Envía: "Hola"        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────┐
│ whatsapp/index.js (LÍNEA 54)     │
│ Captura mensaje                  │
└──────────┬───────────────────────┘
           │
           ▼ POST /api/router/identify
┌──────────────────────────────────┐
│ router.js → userRouter.js        │
│ Consulta DB por teléfono         │
│ Retorna: 'cliente' o 'prospecto' │
└──────────┬───────────────────────┘
           │
           ├─── Si es CLIENTE ────────┐
           │                          ▼
           │                   ┌──────────────┐
           │                   │  agent.js    │
           │                   │  (Compañero) │
           │                   └──────────────┘
           │
           └─── Si es PROSPECTO ──────┐
                                      ▼
                              ┌──────────────┐
                              │ prospecto.js │
                              │    (TÚ)      │
                              └──────────────┘
                                      │
                                      ▼
                              ┌──────────────┐
                              │  Respuesta   │
                              └──────────────┘
                                      │
                                      ▼
                              ┌──────────────┐
                              │  WhatsApp    │
                              │  al usuario  │
                              └──────────────┘
```

---

## 📝 Variables de Entorno Necesarias

### Worker (Cloudflare):
```bash
AGENT_API_KEY=tu-api-key-secreta
OPENAI_API_KEY=sk-...                # Para GPT-4o
WHATSAPP_SERVICE_URL=http://localhost:3000
```

### WhatsApp Service (Node.js):
```bash
PORT=3000
WORKER_API_URL=http://localhost:8787
AGENT_API_KEY=tu-api-key-secreta
```

---

## 🎯 Próximos Pasos para TI (Desarrollador B)

### Corto Plazo:
1. ✅ **Probar el routing** - Verificar que identifica cliente vs prospecto
2. ✅ **Probar código SKY** - Enviar "SKY" y verificar inicio de registro
3. ✅ **Completar un registro** - Probar los 4 pasos
4. ✅ **Verificar OTP** - Implementar verificación del código

### Mediano Plazo:
5. 🔄 **Integrar ElevenLabs** - Mensajes de voz
6. 🔄 **Mejorar validaciones** - RUT, email, etc.
7. 🔄 **Agregar métricas** - Tracking de prospectos

---

## ⚠️ Reglas de Oro

### ✅ PUEDES:
- Modificar `prospecto.js` libremente
- Modificar `whatsapp/index.js` libremente
- Modificar `userRouter.js` si necesitas cambiar lógica de routing
- Crear nuevos archivos en `services/whatsapp/`

### ❌ NO PUEDES (sin coordinarte):
- Modificar `agent.js` - Es de tu compañero
- Modificar `contratos.js` - Es de tu compañero
- Modificar lógica de OpenAI - Es de tu compañero
- Cambiar `index.js` sin avisar

---

## 🐛 Debugging

### Ver logs del router:
```javascript
// En userRouter.js, agrega console.log:
export async function identifyUser(db, phoneNumber) {
  const user = await db.prepare(...).first();
  console.log(`📞 Identificando ${phoneNumber}:`, user ? 'CLIENTE' : 'PROSPECTO');
  // ...
}
```

### Ver qué endpoint se está llamando:
```javascript
// En whatsapp/index.js (línea 115):
console.log(`[${type.toUpperCase()}] Respuesta enviada a ${from}`);
// Verás: [CLIENTE] o [PROSPECTO]
```

---

## 📚 Documentación Completa

Para detalles completos, ver: **`ARQUITECTURA_MODULAR.md`**

---

**Última actualización:** 2025-10-25
