# 🔧 Guía de Configuración de APIs

Esta guía te ayudará a configurar las APIs de **Anthropic (Claude)** y **Google Calendar** paso a paso.

---

## 📘 Parte 1: Configurar API de Anthropic (Claude)

### Paso 1: Crear Cuenta en Anthropic

1. Ve a [https://console.anthropic.com](https://console.anthropic.com)
2. Haz clic en **"Sign Up"** (o "Sign In" si ya tienes cuenta)
3. Crea tu cuenta con email o Google

### Paso 2: Obtener API Key

1. Una vez dentro del console, ve a **"API Keys"** en el menú lateral
   - URL directa: [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

2. Haz clic en **"Create Key"** o **"+ Create API Key"**

3. Dale un nombre descriptivo, por ejemplo:
   ```
   renata-ai-production
   ```

4. Copia la API Key que se genera
   - **IMPORTANTE**: Esta key solo se muestra UNA VEZ
   - Guárdala en un lugar seguro (gestor de contraseñas)
   - Formato: `sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Paso 3: Verificar tu API Key

Prueba que funcione con este comando curl:

```bash
curl https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: TU_API_KEY_AQUI" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Hola, ¿cómo estás?"}
    ]
  }'
```

**Respuesta esperada:**
```json
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "¡Hola! Estoy bien, gracias por preguntar..."
    }
  ],
  ...
}
```

Si ves un error de autenticación, verifica que copiaste la key completa.

### Paso 4: Configurar en tu Proyecto

#### Para Desarrollo Local:

Crea el archivo `.dev.vars` en `services/worker/`:

```bash
cd services/worker
cp .dev.vars.example .dev.vars
```

Edita `.dev.vars`:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Para Producción (Cloudflare Workers):

```bash
cd services/worker

# Configurar el secret
wrangler secret put ANTHROPIC_API_KEY
# Te pedirá que pegues la API key
```

### Paso 5: Verificar Configuración

Inicia el worker en modo dev:
```bash
npm run dev
```

Deberías ver algo como:
```
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

### Paso 6: Verificar Costos y Límites

1. Ve a **"Usage"** en Anthropic Console
   - [https://console.anthropic.com/settings/usage](https://console.anthropic.com/settings/usage)

2. **Precios de Claude 3.5 Sonnet:**
   - Input: $3.00 / million tokens
   - Output: $15.00 / million tokens

3. **Cuota inicial:** $5 de créditos gratis (varía según región)

4. **Agregar método de pago** (si necesitas más):
   - Ve a "Billing" en el console
   - Agrega tarjeta de crédito

---

## 📅 Parte 2: Configurar Google Calendar API

### Paso 1: Crear Proyecto en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)

2. Haz clic en el selector de proyectos (arriba a la izquierda)

3. Clic en **"Nuevo Proyecto"**

4. Completa los datos:
   - **Nombre del proyecto:** `renata-ai-calendar`
   - **Organización:** (opcional, déjalo vacío si no tienes)
   - Clic en **"Crear"**

5. Espera a que se cree (toma ~30 segundos)

### Paso 2: Habilitar Google Calendar API

1. Con el proyecto `renata-ai-calendar` seleccionado, ve a:
   - **"APIs y servicios"** → **"Biblioteca"**
   - URL directa: [https://console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library)

2. Busca: **"Google Calendar API"**

3. Haz clic en **"Google Calendar API"**

4. Clic en **"Habilitar"** (Enable)

5. Espera a que se habilite (~10 segundos)

### Paso 3: Crear Service Account

1. Ve a **"APIs y servicios"** → **"Credenciales"**
   - URL directa: [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)

2. Clic en **"Crear credenciales"** → **"Cuenta de servicio"**

3. Completa los datos:
   - **Nombre:** `renata-calendar-service`
   - **ID:** Se genera automáticamente (`renata-calendar-service@...`)
   - **Descripción:** `Service account para agendar reuniones en Renata`
   - Clic en **"Crear y continuar"**

4. **Paso 2 - Otorgar acceso** (opcional):
   - Puedes saltarlo, clic en **"Continuar"**

5. **Paso 3 - Otorgar acceso a usuarios** (opcional):
   - Puedes saltarlo, clic en **"Listo"**

### Paso 4: Crear y Descargar Clave JSON

1. En la lista de **"Cuentas de servicio"**, haz clic en la que acabas de crear:
   - `renata-calendar-service@renata-ai-calendar.iam.gserviceaccount.com`

2. Ve a la pestaña **"Claves"** (Keys)

3. Clic en **"Agregar clave"** → **"Crear nueva clave"**

4. Selecciona **"JSON"**

5. Clic en **"Crear"**

6. Se descargará automáticamente un archivo JSON como:
   ```
   renata-ai-calendar-xxxxxxxxxxxxx.json
   ```

7. **IMPORTANTE:** Guarda este archivo en un lugar seguro
   - Contiene la clave privada
   - **NUNCA** lo subas a Git
   - Guárdalo en tu gestor de contraseñas o carpeta segura

### Paso 5: Extraer Credenciales del JSON

Abre el archivo JSON descargado. Verás algo como:

```json
{
  "type": "service_account",
  "project_id": "renata-ai-calendar",
  "private_key_id": "xxxxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
  "client_email": "renata-calendar-service@renata-ai-calendar.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

**Necesitas estos 2 valores:**
1. `client_email` → Para `GOOGLE_CLIENT_EMAIL`
2. `private_key` → Para `GOOGLE_PRIVATE_KEY`

### Paso 6: Compartir tu Calendario con la Service Account

1. Ve a [Google Calendar](https://calendar.google.com/)

2. En el panel izquierdo, busca tu calendario (normalmente tu email)

3. Haz clic en los **tres puntos (⋮)** al lado del calendario

4. Selecciona **"Configuración y uso compartido"**

5. Baja hasta **"Compartir con determinadas personas"**

6. Haz clic en **"Agregar personas"**

7. Pega el email de la service account:
   ```
   renata-calendar-service@renata-ai-calendar.iam.gserviceaccount.com
   ```

8. En los permisos, selecciona:
   - **"Hacer cambios en eventos"** (Make changes to events)

9. Clic en **"Enviar"**

### Paso 7: Obtener el Calendar ID

1. En la misma página de **"Configuración y uso compartido"**

2. Baja hasta **"Integrar calendario"**

3. Copia el **"ID del calendario"**
   - Si es tu calendario principal: normalmente es tu email
   - Ejemplo: `tu-email@gmail.com`

4. O simplemente usa: `primary` (para el calendario principal)

### Paso 8: Configurar Variables de Entorno

#### Para el Servicio de WhatsApp (MCP Server):

Crea o edita `services/whatsapp/.env`:

```bash
cd services/whatsapp
cp .env.example .env
nano .env  # o usa tu editor favorito
```

Agrega estas líneas (reemplaza con tus valores):

```bash
# Google Calendar Configuration
GOOGLE_CLIENT_EMAIL=renata-calendar-service@renata-ai-calendar.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=primary

# Worker Configuration
WORKER_URL=http://localhost:8787
AGENT_API_KEY=12a7035a667ae8f91dfdb9c1b2f4f0b2cff813c6e7b55f26bd7cd9e95bc68f17

# MCP Server Port
MCP_PORT=3001
```

**IMPORTANTE sobre GOOGLE_PRIVATE_KEY:**
- Debe estar entre comillas dobles
- Los saltos de línea deben ser `\n` literales
- Copia TODO el contenido desde `-----BEGIN PRIVATE KEY-----` hasta `-----END PRIVATE KEY-----\n`

### Paso 9: Verificar Configuración de Google Calendar

Crea un archivo de prueba `test-calendar.js`:

```bash
cd services/whatsapp
nano test-calendar.js
```

Contenido:

```javascript
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

async function testCalendar() {
  try {
    console.log('🔧 Configurando autenticación...');

    const auth = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    console.log('📅 Probando conexión con Google Calendar...');

    // Listar próximos eventos
    const response = await calendar.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      timeMin: new Date().toISOString(),
      maxResults: 5,
      singleEvents: true,
      orderBy: 'startTime',
    });

    console.log('✅ Conexión exitosa!');
    console.log(`📋 Próximos eventos (${response.data.items.length}):`);

    if (response.data.items.length === 0) {
      console.log('   No hay eventos próximos');
    } else {
      response.data.items.forEach((event) => {
        console.log(`   - ${event.summary} (${event.start.dateTime || event.start.date})`);
      });
    }

    // Crear un evento de prueba
    console.log('\n🎯 Creando evento de prueba...');

    const testEvent = {
      summary: 'TEST - Reunión Renata',
      description: 'Evento de prueba creado automáticamente por MCP',
      start: {
        dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        timeZone: 'America/Santiago',
      },
      end: {
        dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
        timeZone: 'America/Santiago',
      },
      conferenceData: {
        createRequest: {
          requestId: `test-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    const createResponse = await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      resource: testEvent,
      conferenceDataVersion: 1,
    });

    console.log('✅ Evento creado exitosamente!');
    console.log(`   ID: ${createResponse.data.id}`);
    console.log(`   Link: ${createResponse.data.htmlLink}`);
    if (createResponse.data.hangoutLink) {
      console.log(`   Google Meet: ${createResponse.data.hangoutLink}`);
    }

    console.log('\n🎉 ¡Todo configurado correctamente!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Detalles:', error.response.data);
    }
  }
}

testCalendar();
```

Ejecutar el test:

```bash
node test-calendar.js
```

**Resultado esperado:**
```
🔧 Configurando autenticación...
📅 Probando conexión con Google Calendar...
✅ Conexión exitosa!
📋 Próximos eventos (0):
   No hay eventos próximos

🎯 Creando evento de prueba...
✅ Evento creado exitosamente!
   ID: abc123xyz
   Link: https://calendar.google.com/calendar/event?eid=xxx
   Google Meet: https://meet.google.com/xxx-yyyy-zzz

🎉 ¡Todo configurado correctamente!
```

Si ves este mensaje, ¡Google Calendar está configurado correctamente! 🎉

---

## 🧪 Paso 10: Probar Todo Junto

### 1. Iniciar MCP Server

```bash
cd services/whatsapp
npm run mcp
```

Deberías ver:
```
[MCP HTTP] Server listening on port 3001
[MCP HTTP] Loaded 3 tools
[MCP Functions] Google Calendar initialized
```

### 2. Iniciar Worker

En otra terminal:

```bash
cd services/worker
npm run dev
```

Deberías ver:
```
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

### 3. Probar Endpoint

```bash
curl -X POST http://localhost:8787/api/prospecto-claude/message \
  -H "Authorization: Bearer 12a7035a667ae8f91dfdb9c1b2f4f0b2cff813c6e7b55f26bd7cd9e95bc68f17" \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "+56912345678",
    "mensaje": "Hola, quiero información sobre Renata",
    "source": "api"
  }'
```

**Respuesta esperada:**
```json
{
  "tipo": "texto",
  "respuesta": "Hola! Renata es una plataforma de gestión tributaria para empresas chilenas. ¿Tienes un código de activación o prefieres agendar una reunión con nuestro equipo de ventas?"
}
```

---

## 🔍 Troubleshooting

### Error: "invalid_grant" en Google Calendar

**Problema:** La clave privada no es válida.

**Solución:**
1. Verifica que copiaste TODO el `private_key` del JSON
2. Asegúrate de que los `\n` estén correctamente escapados
3. La key debe estar entre comillas dobles en el `.env`

### Error: "unauthorized_client" en Anthropic

**Problema:** API key incorrecta o revocada.

**Solución:**
1. Verifica que copiaste la key completa (empieza con `sk-ant-`)
2. Genera una nueva key si es necesario
3. Verifica que no haya espacios al inicio/final

### Error: "Calendar not found"

**Problema:** El calendario no fue compartido con la service account.

**Solución:**
1. Ve a Google Calendar
2. Compartir calendario con el email de la service account
3. Dale permisos de "Hacer cambios en eventos"

### MCP Server no inicia

**Problema:** Puerto 3001 ya está en uso.

**Solución:**
```bash
# Cambiar puerto en .env
MCP_PORT=3002

# O matar el proceso que usa 3001
lsof -ti:3001 | xargs kill -9
```

---

## ✅ Checklist Final

- [ ] API Key de Anthropic obtenida
- [ ] `.dev.vars` configurado con ANTHROPIC_API_KEY
- [ ] Proyecto creado en Google Cloud
- [ ] Google Calendar API habilitada
- [ ] Service Account creada
- [ ] JSON de credenciales descargado
- [ ] Calendario compartido con service account
- [ ] `.env` configurado con Google credentials
- [ ] Test de Calendar ejecutado exitosamente
- [ ] MCP Server inicia sin errores
- [ ] Worker inicia sin errores
- [ ] Endpoint responde correctamente

---

## 📞 Soporte

Si tienes problemas:

1. Revisa los logs del MCP Server y Worker
2. Verifica que todas las variables estén configuradas
3. Prueba cada API por separado con los tests
4. Consulta la documentación oficial:
   - [Anthropic API Docs](https://docs.anthropic.com/)
   - [Google Calendar API Docs](https://developers.google.com/calendar/api/guides/overview)

¡Listo! Ahora tienes todo configurado para usar Claude + MCP con Google Calendar 🎉
