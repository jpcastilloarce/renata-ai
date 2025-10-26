# Implementación de Claude + MCP para Flujo de Prospectos

## 📋 Resumen

Esta implementación reemplaza OpenAI por Claude (Anthropic) en el flujo de prospectos, agregando capacidades MCP (Model Context Protocol) para:

1. **Agendar reuniones** con el equipo de ventas en Google Calendar
2. **Registrar nuevos contributors** con códigos de activación

El sistema mantiene **intacto el flujo de audio** (ElevenLabs) y el historial de conversaciones.

---

## 🏗️ Arquitectura

```
WhatsApp (Audio) → Worker → Claude + MCP → [Herramientas] → Respuesta → Audio → WhatsApp
                                ↓
                         Servidor MCP (Node.js)
                         ├── Google Calendar API
                         └── D1 Database (vía Worker API)
```

### Componentes Nuevos

1. **Servidor MCP HTTP** (`services/whatsapp/mcp/http-server.js`)
   - Expone herramientas MCP vía HTTP
   - Puerto: 3001 (configurable)

2. **Cliente Claude** (`services/worker/src/utils/claude.js`)
   - Wrapper de Anthropic SDK con soporte para tool use
   - Maneja iteraciones automáticas de herramientas

3. **Ruta Prospecto-Claude** (`services/worker/src/routes/prospecto-claude.js`)
   - Nueva ruta: `/api/prospecto-claude/message`
   - Sistema inteligente de ventas con Claude

4. **Rutas Internas** (`services/worker/src/routes/internal.js`)
   - `/api/internal/scheduled-meetings` - Guardar reuniones
   - `/api/internal/activation-codes/validate` - Validar códigos

5. **Tablas SQL Nuevas**
   - `activation_codes` - Códigos de activación
   - `scheduled_meetings` - Reuniones agendadas

---

## 🚀 Instalación y Configuración

### 1. Instalar Dependencias

```bash
# En el worker
cd services/worker
npm install

# En el servicio de WhatsApp
cd ../whatsapp
npm install
```

### 2. Configurar Google Calendar

#### a) Crear Service Account en Google Cloud

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un nuevo proyecto o seleccionar uno existente
3. Habilitar **Google Calendar API**
4. Ir a "Credenciales" → "Crear credenciales" → "Cuenta de servicio"
5. Descargar la clave JSON

#### b) Compartir el Calendario

1. En Google Calendar, ir a "Configuración y uso compartido"
2. Agregar el email de la service account con permisos de "Hacer cambios en eventos"

#### c) Configurar Variables de Entorno

En `services/whatsapp/.env`:

```bash
# Google Calendar
GOOGLE_CLIENT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=primary
```

### 3. Configurar Anthropic API Key

```bash
cd services/worker

# Configurar secret en Cloudflare
wrangler secret put ANTHROPIC_API_KEY
# Pegar tu API key de Anthropic cuando lo solicite
```

### 4. Migrar Base de Datos

```bash
cd services/worker

# Aplicar las nuevas tablas
npm run migrate
```

### 5. Insertar Códigos de Activación (Opcional)

```sql
INSERT INTO activation_codes (code, empresa_nombre, plan, expires_at)
VALUES
  ('DEMO2025', 'Empresa Demo', 'basic', '2025-12-31'),
  ('PROMO123', 'Promoción Especial', 'pro', NULL);
```

Ejecutar con:
```bash
wrangler d1 execute rcv_db --command="INSERT INTO activation_codes..."
```

---

## 🎮 Uso

### Iniciar Servicios

#### Terminal 1: Worker de Cloudflare
```bash
cd services/worker
npm run dev
```

#### Terminal 2: Servidor MCP
```bash
cd services/whatsapp
npm run mcp
```

#### Terminal 3: Servicio de WhatsApp (opcional)
```bash
cd services/whatsapp
npm start
```

### Endpoints Disponibles

#### Flujo de Prospectos con Claude + MCP
```bash
POST http://localhost:8787/api/prospecto-claude/message
Authorization: Bearer 12a7035a667ae8f91dfdb9c1b2f4f0b2cff813c6e7b55f26bd7cd9e95bc68f17

{
  "telefono": "+56912345678",
  "mensaje": "Hola, quiero información sobre Renata",
  "source": "api"  // o "whatsapp" para audio
}
```

#### Flujo Original con OpenAI (sigue disponible)
```bash
POST http://localhost:8787/api/prospecto/message
```

---

## 🧪 Ejemplos de Conversación

### Ejemplo 1: Prospecto con Código de Activación

```
Usuario: "Hola, tengo un código de activación"

Claude: "¡Perfecto! Necesito que me proporciones los siguientes datos para
registrar tu empresa:
1. Código de activación
2. RUT de la empresa
3. Tu nombre completo
4. Clave del SII
5. Contraseña para la plataforma Renata"

Usuario: "El código es DEMO2025, mi RUT es 76123456-7, me llamo Juan Pérez"

Claude: "Gracias Juan. Ahora necesito la clave del SII de tu empresa y
la contraseña que quieres usar en Renata."

Usuario: "Clave SII es miclavetest123, y quiero usar la contraseña Renata2025"

Claude: [Usa herramienta registrar_contributor]
"¡Excelente Juan! He registrado tu empresa exitosamente. Te enviaremos
un código OTP por WhatsApp para verificar tu cuenta."
```

### Ejemplo 2: Prospecto que Quiere Reunión

```
Usuario: "Hola, quisiera saber más sobre Renata"

Claude: "Hola! Renata es una plataforma de gestión tributaria que te ayuda
con consultas al SII, informes automáticos y alertas de vencimiento.
¿Tienes un código de activación o prefieres agendar una reunión con
nuestro equipo de ventas?"

Usuario: "Prefiero una reunión"

Claude: "Perfecto. ¿Qué día y hora te acomoda? Tenemos disponibilidad
de lunes a viernes de 9:00 a 18:00."

Usuario: "Mañana a las 15:00"

Claude: [Usa herramienta agendar_reunion]
"¡Listo! He agendado tu reunión para mañana 27 de octubre a las 15:00.
Te llegará una confirmación con el link de Google Meet."
```

---

## 🔧 Herramientas MCP Disponibles

### 1. `validar_codigo_activacion`
Verifica si un código existe y está disponible.

**Input:**
```json
{
  "codigo_activacion": "DEMO2025"
}
```

**Output:**
```json
{
  "valid": true,
  "code": "DEMO2025",
  "empresa_nombre": "Empresa Demo",
  "plan": "basic"
}
```

### 2. `registrar_contributor`
Registra un nuevo usuario con código de activación.

**Input:**
```json
{
  "codigo_activacion": "DEMO2025",
  "telefono": "+56912345678",
  "rut": "76123456-7",
  "nombre": "Juan Pérez",
  "clave_sii": "miclavetest",
  "password": "password123"
}
```

**Output:**
```json
{
  "success": true,
  "message": "Contributor registrado exitosamente. RUT: 76123456-7",
  "rut": "76123456-7"
}
```

### 3. `agendar_reunion`
Agenda una reunión en Google Calendar.

**Input:**
```json
{
  "telefono": "+56912345678",
  "nombre_prospecto": "Juan Pérez",
  "email_prospecto": "juan@empresa.cl",
  "fecha": "2025-10-27",
  "hora": "15:00",
  "notas": "Interesado en plan Pro"
}
```

**Output:**
```json
{
  "success": true,
  "message": "Reunión agendada exitosamente...",
  "google_event_id": "abc123",
  "google_meet_link": "https://meet.google.com/xxx-yyyy-zzz",
  "fecha": "2025-10-27",
  "hora": "15:00"
}
```

---

## 🔐 Variables de Entorno

### Worker (Cloudflare)

En `wrangler.toml`:
```toml
[vars]
MCP_SERVER_URL = "http://localhost:3001/mcp"  # Desarrollo
# En producción: "https://your-mcp-server.com/mcp"
```

Secrets (configurar con `wrangler secret put`):
- `ANTHROPIC_API_KEY` - API key de Anthropic (Claude)
- `OPENAI_API_KEY` - API key de OpenAI (para agente de clientes)
- `ELEVENLABS_API_KEY` - API key de ElevenLabs
- `ELEVENLABS_VOICE_ID` - ID de voz de ElevenLabs

### Servicio WhatsApp

En `services/whatsapp/.env`:
```bash
WORKER_URL=http://localhost:8787
AGENT_API_KEY=12a7035a667ae8f91dfdb9c1b2f4f0b2cff813c6e7b55f26bd7cd9e95bc68f17
MCP_PORT=3001

GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=primary

ELEVENLABS_API_KEY=your_elevenlabs_key
```

---

## 📊 Monitoreo

### Logs del MCP Server
```bash
cd services/whatsapp
npm run dev:mcp
```

Verás:
```
[MCP HTTP] Server listening on port 3001
[MCP HTTP] Loaded 3 tools
[MCP HTTP] Executing tool: agendar_reunion { telefono: '+56912345678', ... }
[MCP HTTP] Tool result: { success: true, ... }
```

### Logs del Worker
```bash
cd services/worker
npm run dev
```

Verás:
```
[PROSPECTO-CLAUDE] Teléfono: +56912345678
[PROSPECTO-CLAUDE] MCP Client connected with 3 tools
[Claude] Using tool: agendar_reunion
[Claude] Tool result: {"success":true,...}
```

---

## 🚢 Deployment

### 1. Servidor MCP en Producción

Opciones:
- **Railway/Render**: Deploy del servicio WhatsApp completo
- **Fly.io**: Específico para el servidor MCP
- **VPS**: Tu propio servidor

Actualizar `wrangler.toml`:
```toml
MCP_SERVER_URL = "https://your-mcp-server.com/mcp"
```

### 2. Worker de Cloudflare

```bash
cd services/worker

# Configurar secrets en producción
wrangler secret put ANTHROPIC_API_KEY --env production

# Deploy
npm run deploy
```

---

## 🔄 Migración desde OpenAI

El flujo original de prospectos con OpenAI sigue disponible en `/api/prospecto/message`.

Para migrar completamente a Claude:

1. Probar el nuevo endpoint: `/api/prospecto-claude/message`
2. Actualizar el servicio de WhatsApp para usar el nuevo endpoint
3. Opcional: Deprecar el endpoint antiguo

---

## 🐛 Troubleshooting

### Error: "MCP server not ready"
- Verificar que el servidor MCP esté corriendo: `npm run mcp`
- Verificar URL en `wrangler.toml`: `MCP_SERVER_URL`

### Error: "Google Calendar no está configurado"
- Verificar `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY` en `.env`
- Verificar que el calendario esté compartido con la service account

### Error: "Código de activación inválido"
- Verificar que el código existe en la tabla `activation_codes`
- Verificar que `used = 0` y no está expirado

### Audio no se genera
- Verificar `ELEVENLABS_API_KEY` en secrets
- Verificar que `source: "whatsapp"` esté en la request

---

## 📚 Próximos Pasos

1. ✅ Implementar validación de horarios disponibles
2. ✅ Agregar notificaciones de recordatorio
3. ✅ Dashboard para ver reuniones agendadas
4. ✅ Analytics de conversiones (código vs reunión)
5. ✅ Integración con CRM

---

## 🤝 Soporte

Para dudas o problemas:
- Revisar logs del MCP server
- Revisar logs del worker
- Verificar configuración de Google Calendar

¡Listo para usar Claude + MCP en producción! 🚀
