# 🏗️ Arquitectura Modular - Renata AI

## 📋 Índice
1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Flujo de Mensajes](#flujo-de-mensajes)
3. [Archivos por Desarrollador](#archivos-por-desarrollador)
4. [Momento de Ejecución](#momento-de-ejecución)
5. [Puntos de Integración](#puntos-de-integración)
6. [Guía de Desarrollo](#guía-de-desarrollo)

---

## 🎯 Resumen Ejecutivo

Esta arquitectura permite a **2 desarrolladores** trabajar simultáneamente sin conflictos:

- **Desarrollador A (Tu compañero):** Trabaja en lógica de **clientes** (usuarios registrados)
- **Desarrollador B (Tú):** Trabajas en lógica de **prospectos** + WhatsApp + ElevenLabs

### Separación de Responsabilidades

```
┌─────────────────────────────────────────────────────────────┐
│                    Servicio WhatsApp                        │
│              (Desarrollador B - TÚ)                         │
│  - Captura mensajes de WhatsApp                             │
│  - Integración con ElevenLabs (futuro)                      │
│  - Routing inicial                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼ POST /api/router/identify
┌─────────────────────────────────────────────────────────────┐
│              Router Service (NEUTRAL)                       │
│  - Decide: ¿Cliente o Prospecto?                           │
│  - NO tiene lógica de negocio                               │
└───────┬─────────────────────────────────────────────────┬───┘
        │                                                 │
        ▼ Cliente                                         ▼ Prospecto
┌─────────────────────┐                   ┌─────────────────────────┐
│   agent.js          │                   │   prospecto.js          │
│ (Desarrollador A)   │                   │ (Desarrollador B - TÚ) │
│ - Clientes          │                   │ - Prospectos            │
│ - RAG con contratos │                   │ - Código "SKY"          │
│ - OpenAI GPT-4o     │                   │ - Registro              │
│ - Ventas/Compras    │                   │ - Info servicios        │
└─────────────────────┘                   └─────────────────────────┘
```

---

## 🔄 Flujo de Mensajes Completo

### **1. Usuario envía mensaje por WhatsApp**

```javascript
// services/whatsapp/index.js (Línea 54)
whatsappClient.on('message', async (msg) => {
  const phoneNumber = from.split('@')[0]; // "56993788826"
```

### **2. WhatsApp Service consulta al Router**

```javascript
// services/whatsapp/index.js (Línea 70-77)
const routeResponse = await fetch(`${WORKER_API_URL}/api/router/identify`, {
  method: 'POST',
  body: JSON.stringify({ telefono: phoneNumber })
});

const { type } = await routeResponse.json(); // 'cliente' o 'prospecto'
```

### **3. Router identifica tipo de usuario**

```javascript
// services/worker/src/routes/router.js (Línea 33-46)
router.post('/identify', async (c) => {
  const type = await routeMessage(c.env.DB, telefono);
  return c.json({ type }); // Retorna 'cliente' o 'prospecto'
});

// services/worker/src/services/userRouter.js (Línea 60-72)
export async function routeMessage(db, phoneNumber) {
  const userInfo = await identifyUser(db, phoneNumber);

  if (isActiveClient(userInfo)) {
    return 'cliente';  // Usuario verificado en DB
  }

  return 'prospecto';  // Usuario no registrado
}
```

### **4. WhatsApp envía a la ruta correcta**

```javascript
// services/whatsapp/index.js (Línea 88-102)
const endpoint = type === 'cliente'
  ? '/api/agent/message'      // ← Desarrollador A
  : '/api/prospecto/message'; // ← Desarrollador B (TÚ)

const response = await fetch(`${WORKER_API_URL}${endpoint}`, {
  method: 'POST',
  body: JSON.stringify({ telefono, mensaje })
});
```

### **5A. Flujo de CLIENTES (agent.js)**

```javascript
// services/worker/src/routes/agent.js (Línea 46)
router.post('/message', async (c) => {
  const user = await c.env.DB.prepare(
    'SELECT rut, nombre FROM contributors WHERE telefono = ?'
  ).bind(telefono).first();

  // Categorizar pregunta
  const questionType = categorizeQuestion(mensaje);

  // Procesar según tipo
  if (questionType === 'ventas' || questionType === 'compras') {
    answer = await handleTaxQuestion(...);
  } else if (questionType === 'contrato') {
    answer = await handleContractQuestion(...); // RAG + OpenAI
  }

  return c.json({ respuesta: answer });
});
```

### **5B. Flujo de PROSPECTOS (prospecto.js - TÚ)**

```javascript
// services/worker/src/routes/prospecto.js (Línea 44)
router.post('/message', async (c) => {
  const { telefono, mensaje } = await c.req.json();

  // Verificar sesión de registro
  const session = await c.env.SESSIONS_KV.get(`registro:${telefono}`);

  if (session) {
    // Continuar registro (pasos: RUT, nombre, password, clave SII)
    respuesta = await handleRegistroFlow(...);
  } else {
    // Primera interacción
    if (mensaje === 'SKY') {
      respuesta = await iniciarRegistro(...);
    } else if (mensaje === '1') {
      respuesta = getServicioContabilidad();
    } else if (mensaje === '2') {
      respuesta = getServicioRenataAI();
    } else {
      respuesta = getMensajeBienvenida();
    }
  }

  return c.json({ respuesta });
});
```

### **6. Respuesta vuelve a WhatsApp**

```javascript
// services/whatsapp/index.js (Línea 110-115)
const data = await response.json();
const answer = data.respuesta;

await msg.reply(answer);
console.log(`[${type.toUpperCase()}] Respuesta enviada`);
```

---

## 📁 Archivos por Desarrollador

### **🟦 DESARROLLADOR A (Tu compañero) - CLIENTES**

#### Archivo Principal:
- **`services/worker/src/routes/agent.js`** ✅ SU ZONA EXCLUSIVA
  - Maneja clientes verificados
  - Lógica RAG con contratos
  - Consultas de ventas/compras
  - Integración con OpenAI GPT-4o

#### Archivos Relacionados:
- `services/worker/src/utils/openai.js` - Funciones de OpenAI
- `services/worker/src/routes/contratos.js` - Gestión de contratos PDF
- `services/worker/src/routes/ventas.js` - Endpoints de ventas
- `services/worker/src/routes/compras.js` - Endpoints de compras

---

### **🟩 DESARROLLADOR B (TÚ) - PROSPECTOS + WHATSAPP**

#### Archivos Principales:
- **`services/worker/src/routes/prospecto.js`** ✅ TU ZONA EXCLUSIVA
  - Maneja prospectos (no registrados)
  - Código de activación "SKY"
  - Proceso de registro guiado
  - Información de servicios

- **`services/whatsapp/index.js`** ✅ TU ZONA PRINCIPAL
  - Gateway de WhatsApp
  - Captura mensajes
  - Routing a Worker API
  - Integración futura con ElevenLabs

#### Archivos de Soporte:
- `services/worker/src/services/userRouter.js` - Lógica de identificación
- `services/worker/src/routes/router.js` - Endpoint de routing

#### Futuro - ElevenLabs (TÚ):
- `services/whatsapp/services/elevenLabs.js` (crear)
- `services/worker/src/services/elevenLabs.js` (crear)

---

### **⚪ ARCHIVOS COMPARTIDOS (Ambos)

- **`services/worker/src/index.js`**
  - Solo para agregar rutas nuevas
  - Comunicarse antes de modificar
  - Cada uno agrega sus imports/routes

---

## ⏰ Momento de Ejecución

### ¿Cuándo se ejecuta `agent.js`?

```
1. Usuario registrado envía mensaje por WhatsApp
   ↓
2. services/whatsapp/index.js (Línea 54) captura evento 'message'
   ↓
3. services/whatsapp/index.js (Línea 70) llama a /api/router/identify
   ↓
4. services/worker/src/routes/router.js (Línea 33) identifica: 'cliente'
   ↓
5. services/whatsapp/index.js (Línea 92) llama a /api/agent/message
   ↓
6. services/worker/src/index.js (Línea 47) recibe HTTP request
   ↓
7. services/worker/src/index.js (Línea 37) rutea a agentRoutes
   ↓
8. services/worker/src/routes/agent.js (Línea 46) SE EJECUTA AQUÍ ⭐
   ↓
9. Procesa mensaje y retorna respuesta
   ↓
10. services/whatsapp/index.js (Línea 114) envía respuesta por WhatsApp
```

### ¿Cuándo se ejecuta `prospecto.js`?

```
1. Usuario NO registrado envía mensaje por WhatsApp
   ↓
2. Mismo flujo hasta paso 4
   ↓
4. services/worker/src/routes/router.js identifica: 'prospecto'
   ↓
5. services/whatsapp/index.js llama a /api/prospecto/message
   ↓
6-7. Igual que antes
   ↓
8. services/worker/src/routes/prospecto.js (Línea 44) SE EJECUTA AQUÍ ⭐
```

---

## 🔌 Puntos de Integración

### **1. Router Service (Neutral)**

**Archivo:** `services/worker/src/services/userRouter.js`

**Función principal:**
```javascript
export async function identifyUser(db, phoneNumber) {
  const user = await db.prepare(
    'SELECT rut, nombre, verified FROM contributors WHERE telefono = ?'
  ).bind(phoneNumber).first();

  if (user) {
    return { type: 'cliente', data: { rut, nombre, verified } };
  }

  return { type: 'prospecto', data: { telefono } };
}
```

**Criterio de decisión:**
- Usuario existe en `contributors` + `verified=1` → **Cliente** → `agent.js`
- Cualquier otro caso → **Prospecto** → `prospecto.js`

---

### **2. Formato de Request/Response**

#### Request a `/api/agent/message` (Clientes):
```json
{
  "telefono": "+56993788826",  // Con prefijo +
  "mensaje": "¿Cuánto vendí en octubre?"
}
```

#### Request a `/api/prospecto/message` (Prospectos):
```json
{
  "telefono": "56993788826",   // Sin prefijo +
  "mensaje": "Hola"
}
```

#### Response (Ambos):
```json
{
  "respuesta": "Texto de respuesta para el usuario"
}
```

---

### **3. Contrato de Datos**

#### Tabla `contributors`:
```sql
CREATE TABLE contributors (
    rut TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    clave_sii TEXT NOT NULL,
    telefono TEXT NOT NULL,     -- Formato: "56993788826" (sin +)
    verified INTEGER DEFAULT 0,  -- 0 o 1
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### KV Store para sesiones de registro:
```javascript
// Key: "registro:{telefono}"
// Value: JSON
{
  "step": "solicitar_rut" | "solicitar_nombre" | "solicitar_password" | "solicitar_clave_sii",
  "data": {
    "telefono": "56993788826",
    "rut": "76123456-7",      // Agregado en paso 1
    "nombre": "Mi Empresa",   // Agregado en paso 2
    "password": "abc123"      // Agregado en paso 3
    // clave_sii agregada en paso 4 → completa registro
  }
}
// TTL: 900 segundos (15 minutos)
```

---

## 🛠️ Guía de Desarrollo

### **Para Desarrollador A (Clientes)**

#### Tu archivo principal:
```bash
services/worker/src/routes/agent.js
```

#### Cómo probar tu código sin WhatsApp:
```bash
# Enviar request directamente al endpoint
curl -X POST http://localhost:8787/api/agent/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_API_KEY" \
  -d '{
    "telefono": "+56993788826",
    "mensaje": "¿Cuánto vendí en octubre?"
  }'
```

#### Variables de entorno que usas:
- `OPENAI_API_KEY` - Para GPT-4o
- `AGENT_API_KEY` - Autenticación del endpoint
- `DB` - Base de datos D1
- `AI` - Workers AI para embeddings
- `CONTRATOS_INDEX` - Vectorize para RAG

---

### **Para Desarrollador B (Prospectos - TÚ)**

#### Tus archivos principales:
```bash
services/worker/src/routes/prospecto.js    # Lógica de prospectos
services/whatsapp/index.js                  # Gateway WhatsApp
```

#### Cómo probar tu código:

**Opción 1: Simular mensaje de WhatsApp**
```bash
# Probar endpoint de prospecto directamente
curl -X POST http://localhost:8787/api/prospecto/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_API_KEY" \
  -d '{
    "telefono": "56999999999",
    "mensaje": "Hola"
  }'
```

**Opción 2: Probar router**
```bash
# Verificar que identifica correctamente
curl -X POST http://localhost:8787/api/router/identify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_API_KEY" \
  -d '{"telefono": "56999999999"}'

# Respuesta esperada:
# {"type": "prospecto"}
```

#### Variables de entorno que usas:
- `AGENT_API_KEY` - Autenticación
- `DB` - Base de datos D1
- `SESSIONS_KV` - Almacenamiento de sesiones de registro
- `WHATSAPP_SERVICE_URL` - URL del servicio WhatsApp (Node.js)
- **Futuro:** `ELEVENLABS_API_KEY`

#### Modificar flujo de prospectos:
1. Edita `prospecto.js` - Lógica de negocio
2. NO toques `agent.js` - Es de tu compañero
3. Si necesitas cambiar routing, modifica `userRouter.js`

---

### **Flujo de Trabajo Conjunto**

#### Cambios en `index.js` (Compartido):
1. Comunicarse antes de modificar
2. Cada uno agrega sus rutas:
   ```javascript
   // Desarrollador A
   import agentRoutes from './routes/agent.js';
   app.route('/api/agent', agentRoutes);

   // Desarrollador B
   import prospectoRoutes from './routes/prospecto.js';
   app.route('/api/prospecto', prospectoRoutes);
   ```

#### Git Workflow:
```bash
# Desarrollador A - Branch para clientes
git checkout -b feature/mejoras-clientes
# Modifica agent.js, contratos.js, etc.
git commit -m "Mejoras en lógica RAG para clientes"

# Desarrollador B - Branch para prospectos
git checkout -b feature/prospectos-whatsapp
# Modifica prospecto.js, whatsapp/index.js
git commit -m "Agregar flujo de registro para prospectos"

# Merge independiente - Sin conflictos
```

---

## 🎯 Casos de Uso por Archivo

### **agent.js (Desarrollador A)**

✅ Usuario registrado pregunta: "¿Cuánto vendí en octubre?"
✅ Usuario registrado pregunta: "¿Cuál es la fecha de mi contrato?"
✅ Usuario registrado pregunta sobre compras
✅ Consultas que requieren acceso a datos del SII

### **prospecto.js (Desarrollador B - TÚ)**

✅ Nuevo usuario envía: "Hola"
✅ Nuevo usuario envía código: "SKY"
✅ Usuario en proceso de registro envía su RUT
✅ Usuario consulta: "1" (servicios de contabilidad)
✅ Usuario consulta: "2" (Renata AI)

---

## 📊 Diagrama de Archivos

```
services/
├── worker/src/
│   ├── index.js                    ⚪ COMPARTIDO (coordinación)
│   │
│   ├── routes/
│   │   ├── agent.js                🟦 DESARROLLADOR A (clientes)
│   │   ├── prospecto.js            🟩 DESARROLLADOR B (prospectos)
│   │   ├── router.js               ⚪ NEUTRAL (solo routing)
│   │   ├── auth.js                 ⚪ COMPARTIDO (ambos usan)
│   │   ├── ventas.js               🟦 DESARROLLADOR A
│   │   ├── compras.js              🟦 DESARROLLADOR A
│   │   └── contratos.js            🟦 DESARROLLADOR A
│   │
│   ├── services/
│   │   ├── userRouter.js           🟩 DESARROLLADOR B (creado por ti)
│   │   ├── sii.js                  🟦 DESARROLLADOR A
│   │   ├── queue.js                ⚪ COMPARTIDO
│   │   └── elevenLabs.js           🟩 DESARROLLADOR B (futuro)
│   │
│   ├── utils/
│   │   ├── openai.js               🟦 DESARROLLADOR A
│   │   ├── crypto.js               ⚪ COMPARTIDO
│   │   └── logger.js               ⚪ COMPARTIDO
│   │
│   └── middleware/
│       └── auth.js                 ⚪ COMPARTIDO
│
└── whatsapp/
    ├── index.js                    🟩 DESARROLLADOR B (TU ZONA)
    └── services/
        └── elevenLabs.js           🟩 DESARROLLADOR B (futuro)
```

---

## ✅ Checklist de Integración

### Desarrollador A (Clientes):
- [ ] `agent.js` procesa mensajes de clientes verificados
- [ ] OpenAI GPT-4o funciona correctamente
- [ ] RAG con contratos retorna respuestas relevantes
- [ ] Consultas de ventas/compras funcionan

### Desarrollador B (Prospectos - TÚ):
- [ ] `prospecto.js` maneja mensajes de no registrados
- [ ] Código "SKY" inicia proceso de registro
- [ ] Registro guiado completa 4 pasos
- [ ] WhatsApp service rutea correctamente
- [ ] Router identifica cliente vs prospecto

### Ambos:
- [ ] No hay conflictos en `index.js`
- [ ] Variables de entorno configuradas
- [ ] Tests funcionan independientemente
- [ ] Documentación actualizada

---

## 🚀 Próximos Pasos

### Desarrollador B (TÚ):
1. Integrar ElevenLabs para mensajes de voz
2. Mejorar mensajes de bienvenida
3. Agregar más validaciones en registro
4. Crear dashboard de prospectos

### Desarrollador A:
1. Mejorar RAG con más contexto
2. Optimizar prompts de OpenAI
3. Agregar más tipos de consultas tributarias
4. Mejorar categorización de preguntas

---

**Versión:** 1.0
**Última actualización:** 2025-10-25
**Autores:** Equipo Renata AI
