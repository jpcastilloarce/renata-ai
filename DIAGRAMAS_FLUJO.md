# Diagramas de Flujo - Claude + MCP

## 🔄 Flujo Completo: WhatsApp → Claude → MCP → Respuesta

```mermaid
sequenceDiagram
    participant U as Usuario (WhatsApp)
    participant W as WhatsApp Service
    participant CW as Cloudflare Worker
    participant C as Claude (Anthropic)
    participant M as MCP Server
    participant G as Google Calendar
    participant D as D1 Database

    U->>W: Mensaje de audio
    W->>W: Audio → Texto (ElevenLabs)
    W->>CW: POST /api/prospecto-claude/message

    CW->>D: Obtener historial de conversación
    D-->>CW: Últimas 10 conversaciones

    CW->>C: Llamada a Claude con historial + herramientas MCP

    alt Claude decide usar herramienta
        C->>CW: tool_use: agendar_reunion
        CW->>M: POST /mcp/execute (agendar_reunion)
        M->>G: Crear evento en Calendar
        G-->>M: Event ID + Meet Link
        M->>CW: POST /api/internal/scheduled-meetings
        CW->>D: Guardar reunión agendada
        M-->>CW: Resultado exitoso
        CW->>C: tool_result
        C-->>CW: Respuesta final con confirmación
    else Claude solo responde
        C-->>CW: Respuesta de texto
    end

    CW->>D: Guardar mensaje + respuesta
    CW-->>W: JSON con texto de respuesta
    W->>W: Texto → Audio (ElevenLabs)
    W-->>U: Mensaje de audio
```

---

## 📝 Flujo de Registro con Código de Activación

```mermaid
sequenceDiagram
    participant U as Usuario
    participant C as Claude
    participant M as MCP Server
    participant D as D1 Database

    U->>C: "Tengo código DEMO2025"
    C->>M: validar_codigo_activacion("DEMO2025")
    M->>D: SELECT * FROM activation_codes WHERE code = 'DEMO2025'
    D-->>M: { valid: true, plan: "basic" }
    M-->>C: Código válido

    C-->>U: "Código válido. Necesito RUT, nombre, clave SII, password"

    U->>C: "RUT: 76123456-7, Juan Pérez, clave: test123, pass: Renata2025"

    C->>M: registrar_contributor({...todos los datos...})
    M->>D: SELECT FROM contributors WHERE rut = '76123456-7'

    alt Usuario no existe
        D-->>M: NULL
        M->>D: INSERT INTO contributors (...)
        M->>D: UPDATE activation_codes SET used = 1
        M->>D: INSERT INTO otp (...)
        M-->>C: { success: true, rut: "76123456-7" }
        C-->>U: "Registrado! Te enviamos OTP por WhatsApp"
    else Usuario ya existe
        D-->>M: { rut: "76123456-7" }
        M-->>C: { success: false, error: "RUT ya registrado" }
        C-->>U: "Este RUT ya está registrado. ¿Olvidaste tu contraseña?"
    end
```

---

## 📅 Flujo de Agendamiento de Reunión

```mermaid
sequenceDiagram
    participant U as Usuario
    participant C as Claude
    participant M as MCP Server
    participant G as Google Calendar API
    participant D as D1 Database

    U->>C: "Quiero agendar reunión para mañana a las 15:00"

    C->>C: Extraer fecha y hora
    Note over C: fecha: "2025-10-27"<br/>hora: "15:00"

    C->>M: agendar_reunion({ telefono, nombre, fecha, hora, email })

    M->>G: calendar.events.insert({<br/>  summary: "Reunión - Juan Pérez",<br/>  start: "2025-10-27T15:00:00-03:00",<br/>  conferenceData: { hangoutsMeet }<br/>})

    G-->>M: {<br/>  id: "event123",<br/>  hangoutLink: "meet.google.com/xxx"<br/>}

    M->>D: POST /api/internal/scheduled-meetings<br/>INSERT INTO scheduled_meetings (...)

    D-->>M: OK
    M-->>C: {<br/>  success: true,<br/>  google_meet_link: "meet.google.com/xxx"<br/>}

    C-->>U: "¡Agendado! Reunión mañana 27/10 a las 15:00.<br/>Link: meet.google.com/xxx"
```

---

## 🔁 Ciclo de Tool Use en Claude

```
┌──────────────────────────────────────────────────────┐
│  1. Usuario envía mensaje                           │
│     "Quiero agendar reunión mañana 15:00"            │
└─────────────────┬────────────────────────────────────┘
                  │
                  ↓
┌──────────────────────────────────────────────────────┐
│  2. Worker construye mensajes para Claude            │
│     [historial] + [mensaje actual]                   │
└─────────────────┬────────────────────────────────────┘
                  │
                  ↓
┌──────────────────────────────────────────────────────┐
│  3. Llamada a Claude con herramientas MCP            │
│     model: claude-3-5-sonnet-20241022                │
│     tools: [agendar_reunion, registrar_, validar_]   │
└─────────────────┬────────────────────────────────────┘
                  │
                  ↓
          ┌───────┴───────┐
          │               │
    stop_reason:    stop_reason:
     "tool_use"      "end_turn"
          │               │
          ↓               ↓
┌──────────────────┐  ┌─────────────────────────┐
│  4a. Claude      │  │  4b. Claude responde    │
│  quiere usar     │  │  directamente           │
│  herramienta     │  │  (sin herramientas)     │
└────┬─────────────┘  └──────────┬──────────────┘
     │                           │
     ↓                           ↓
┌──────────────────┐       ┌──────────────────┐
│  5. Ejecutar     │       │  FIN             │
│  herramienta MCP │       │  Retornar texto  │
└────┬─────────────┘       └──────────────────┘
     │
     ↓
┌──────────────────────────────────────────────────────┐
│  6. Agregar tool_result al historial                 │
│     { role: "user", content: [{ type: "tool_result", │
│       tool_use_id: "...", content: "{...}" }]}       │
└─────────────────┬────────────────────────────────────┘
                  │
                  ↓
┌──────────────────────────────────────────────────────┐
│  7. Llamar a Claude nuevamente con el resultado      │
│     (Iteración 2, máximo 5 iteraciones)              │
└─────────────────┬────────────────────────────────────┘
                  │
                  ↓
          ┌───────┴───────┐
          │               │
    Otra tool_use?   end_turn
          │               │
          ↓               ↓
    Repetir paso 4    Retornar respuesta final
```

---

## 🎭 Estados de Conversación

```
┌─────────────────────────────────────────────────┐
│          PRIMER MENSAJE (Sin historial)         │
│                                                  │
│  Usuario: "Hola"                                 │
│  Claude: "¿Tienes código o prefieres reunión?"  │
│                                                  │
│  → Estado: IDENTIFICANDO_INTENCION              │
└──────────────────┬──────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
         ↓                   ↓
┌─────────────────┐  ┌──────────────────┐
│ TIENE CÓDIGO    │  │ QUIERE REUNIÓN   │
└────────┬────────┘  └────────┬─────────┘
         │                    │
         ↓                    ↓
┌─────────────────┐  ┌──────────────────┐
│ VALIDAR CÓDIGO  │  │ SOLICITAR FECHA  │
│ (tool: validar_)│  │                  │
└────────┬────────┘  └────────┬─────────┘
         │                    │
         ↓                    ↓
┌─────────────────┐  ┌──────────────────┐
│ SOLICITAR DATOS │  │ CONFIRMAR HORA   │
│ - RUT           │  │                  │
│ - Nombre        │  └────────┬─────────┘
│ - Clave SII     │           │
│ - Password      │           ↓
└────────┬────────┘  ┌──────────────────┐
         │           │ AGENDAR REUNIÓN  │
         │           │ (tool: agendar_) │
         ↓           └────────┬─────────┘
┌─────────────────┐           │
│ REGISTRAR       │           │
│ (tool:          │           │
│  registrar_)    │           │
└────────┬────────┘           │
         │                    │
         └──────────┬─────────┘
                    │
                    ↓
         ┌──────────────────┐
         │   COMPLETADO     │
         │                  │
         │ Guardado en D1   │
         └──────────────────┘
```

---

## 🔐 Flujo de Autenticación de Requests

```
┌─────────────────────────────────────────┐
│  WhatsApp Service                       │
│  POST /api/prospecto-claude/message     │
│  Headers:                               │
│    Authorization: Bearer <API_KEY>      │
└──────────────────┬──────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────┐
│  Middleware de Auth                     │
│  if (apiKey !== AGENT_API_KEY)          │
│    → return 401 Unauthorized            │
└──────────────────┬──────────────────────┘
                   │
                   ↓ (Autorizado)
┌─────────────────────────────────────────┐
│  Procesar mensaje                       │
│  - Historial                            │
│  - Claude + MCP                         │
│  - Guardar respuesta                    │
└──────────────────┬──────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────┐
│  MCP Server (Herramientas)              │
│  POST /api/internal/*                   │
│  Headers:                               │
│    Authorization: Bearer <API_KEY>      │
└──────────────────┬──────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────┐
│  Middleware de Auth (Internal Routes)   │
│  if (apiKey !== AGENT_API_KEY)          │
│    → return 401 Unauthorized            │
└──────────────────┬──────────────────────┘
                   │
                   ↓ (Autorizado)
┌─────────────────────────────────────────┐
│  Ejecutar acción en D1                  │
│  - Validar código                       │
│  - Guardar reunión                      │
└─────────────────────────────────────────┘
```

---

## 📊 Flujo de Datos en D1

```
┌──────────────────────────────────────────────────┐
│  Tablas de Datos                                 │
└──────────────────────────────────────────────────┘

┌───────────────────┐
│ contributors      │  ← Usuario registrado
│ - rut (PK)        │
│ - nombre          │
│ - telefono        │
│ - verified        │
└─────────┬─────────┘
          │
          │ FK: used_by_rut
          │
┌─────────▼─────────┐
│ activation_codes  │  ← Códigos pre-generados
│ - code (PK)       │
│ - empresa_nombre  │
│ - used            │
│ - used_by_rut     │
└───────────────────┘

┌───────────────────┐
│ conversation_     │  ← Historial de prospectos
│    history        │
│ - telefono        │
│ - mensaje_cliente │
│ - respuesta_agent │
│ - timestamp       │
└───────────────────┘

┌───────────────────┐
│ scheduled_        │  ← Reuniones agendadas
│    meetings       │
│ - telefono        │
│ - nombre_prospecto│
│ - fecha           │
│ - google_event_id │
│ - status          │
└───────────────────┘

┌───────────────────┐
│ messages          │  ← Mensajes de clientes
│ - rut             │     (usuarios registrados)
│ - sender          │
│ - content         │
└───────────────────┘
```

---

## 🎯 Decisiones de Claude (Lógica Interna)

```
┌─────────────────────────────────────────────────┐
│  System Prompt de Claude                        │
│                                                  │
│  "Tu objetivo es:                               │
│   1. Si tiene código → registrar                │
│   2. Si no tiene código → agendar reunión"      │
└──────────────────┬──────────────────────────────┘
                   │
                   ↓
         ┌─────────────────────┐
         │  Analizar mensaje   │
         └──────────┬──────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ↓           ↓           ↓
┌─────────────┐ ┌────────┐ ┌──────────┐
│ Menciona    │ │Menciona│ │ General  │
│ "código"    │ │"reunión│ │ consulta │
│ "activación"│ │"cita"  │ │          │
└──────┬──────┘ └───┬────┘ └────┬─────┘
       │            │           │
       ↓            ↓           ↓
┌─────────────┐ ┌────────┐ ┌──────────┐
│ Flujo de    │ │Flujo de│ │ Informar │
│ Registro    │ │Agendar │ │ y ofrecer│
│             │ │        │ │ opciones │
└──────┬──────┘ └───┬────┘ └────┬─────┘
       │            │           │
       └────────────┼───────────┘
                    │
                    ↓
         ┌─────────────────────┐
         │ ¿Tiene datos        │
         │ completos?          │
         └──────────┬──────────┘
                    │
            ┌───────┴───────┐
            │               │
           SÍ              NO
            │               │
            ↓               ↓
    ┌──────────────┐  ┌──────────────┐
    │ Usar         │  │ Solicitar    │
    │ herramienta  │  │ dato faltante│
    │ MCP          │  │              │
    └──────────────┘  └──────────────┘
```

---

## 📱 Transformación de Audio (ElevenLabs)

```
┌──────────────────────────────────────────────────┐
│  Entrada desde WhatsApp                          │
│  Audio OGG                                       │
└──────────────────┬───────────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────┐
│  WhatsApp Service                                │
│  - Convertir OGG → WAV (ffmpeg)                  │
│  - ElevenLabs Speech-to-Text                     │
└──────────────────┬───────────────────────────────┘
                   │
                   ↓ TEXTO
┌──────────────────────────────────────────────────┐
│  Cloudflare Worker                               │
│  - Procesar con Claude + MCP                     │
│  - Generar respuesta en TEXTO                    │
└──────────────────┬───────────────────────────────┘
                   │
                   ↓ TEXTO
┌──────────────────────────────────────────────────┐
│  Response Formatter (formatResponse)             │
│  if (source === "whatsapp")                      │
│    → ElevenLabs Text-to-Speech                   │
│  else                                            │
│    → return texto plano                          │
└──────────────────┬───────────────────────────────┘
                   │
                   ↓ Audio MP3
┌──────────────────────────────────────────────────┐
│  WhatsApp Service                                │
│  - Enviar audio a usuario                        │
└──────────────────────────────────────────────────┘
```

---

## 🔄 Comparación: OpenAI vs Claude

### Antes (OpenAI)
```
Usuario → Worker → OpenAI (2 llamadas)
                   1. Clasificar intención
                   2. Generar respuesta
          → Guardar → Responder
```

### Ahora (Claude + MCP)
```
Usuario → Worker → Claude (1 llamada con tools)
                   - Analiza intención
                   - Usa herramientas si necesita
                   - Genera respuesta
          → MCP Server → Google Calendar / D1
          → Guardar → Responder
```

**Ventajas:**
- ✅ 1 sola llamada al LLM (más eficiente)
- ✅ Claude decide autónomamente cuándo usar tools
- ✅ Acciones ejecutadas en tiempo real (Calendar, DB)
- ✅ Más conversacional y natural

---

## 🎊 Resultado Final

Un sistema completo de ventas conversacional que:
1. Entiende contexto y toma decisiones
2. Ejecuta acciones reales (agendar, registrar)
3. Mantiene historial de conversaciones
4. Funciona con audio (WhatsApp nativo)
5. Se integra con Google Calendar automáticamente

¡Todo funcionando con Claude + MCP! 🚀
