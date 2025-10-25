# Arquitectura del Sistema

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USUARIOS                                   │
│                                                                      │
│  📱 WhatsApp            💻 API Clients            🌐 Web App        │
└────────┬──────────────────────┬──────────────────────┬──────────────┘
         │                      │                      │
         │                      │                      │
         v                      v                      v
┌────────────────────┐  ┌──────────────────────────────────────┐
│  WhatsApp Service  │  │      Cloudflare Worker (API)          │
│    (Node.js)       │  │                                       │
│                    │  │  ┌─────────────────────────────────┐  │
│  ┌──────────────┐  │  │  │         Router (Hono)           │  │
│  │ whatsapp-    │  │  │  └─────────────────────────────────┘  │
│  │ web.js       │  │  │                                       │
│  └──────────────┘  │  │  ┌──────┐ ┌──────┐ ┌────────────┐   │
│                    │  │  │Auth  │ │Ventas│ │Contratos   │   │
│  ┌──────────────┐  │  │  │Routes│ │Routes│ │Routes+RAG  │   │
│  │   Express    │  │  │  └──────┘ └──────┘ └────────────┘   │
│  │   Server     │  │  │                                       │
│  └──────────────┘  │  │  ┌────────┐ ┌────────┐              │
│                    │◄─┼──┤Compras │ │Agent   │              │
│  Endpoints:        │  │  │Routes  │ │Routes  │              │
│  - /send-otp       │  │  └────────┘ └────────┘              │
│  - /health         │  │                                       │
└─────────┬──────────┘  └───────────┬───────────────────────────┘
          │                         │
          │ WhatsApp Messages       │ HTTP Requests
          │                         │
          └─────────────────────────┘
                     │
                     │
        ┌────────────┴─────────────────────────────────────┐
        │                                                   │
        v                                                   v
┌──────────────────┐                            ┌─────────────────────┐
│  Cloudflare KV   │                            │   Cloudflare D1     │
│                  │                            │   (SQLite)          │
│  ┌────────────┐  │                            │                     │
│  │  Sessions  │  │                            │  11 Tables:         │
│  │  (tokens)  │  │                            │  - contributors     │
│  └────────────┘  │                            │  - otp              │
│                  │                            │  - sessions         │
│  Fast global     │                            │  - logs             │
│  read access     │                            │  - messages         │
└──────────────────┘                            │  - ventas_resumen   │
                                                │  - ventas_detalle   │
                                                │  - compras_resumen  │
                                                │  - compras_detalle  │
                                                │  - contratos        │
                                                │  - embeddings       │
                                                └─────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Services Layer                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Cloudflare   │  │ Cloudflare   │  │  Cloudflare Workers AI  │  │
│  │      R2      │  │  Vectorize   │  │                         │  │
│  │              │  │              │  │  ┌──────────────────┐   │  │
│  │  ┌────────┐  │  │  ┌────────┐  │  │  │ BGE Embeddings  │   │  │
│  │  │  PDFs  │  │  │  │Vectors │  │  │  │   (768D)        │   │  │
│  │  │        │  │  │  │(768D)  │  │  │  └──────────────────┘   │  │
│  │  └────────┘  │  │  └────────┘  │  │                         │  │
│  │              │  │              │  │  ┌──────────────────┐   │  │
│  │  Object      │  │  Semantic    │  │  │  Llama 3 8B     │   │  │
│  │  Storage     │  │  Search      │  │  │  Instruct       │   │  │
│  └──────────────┘  └──────────────┘  │  └──────────────────┘   │  │
│                                       └─────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐   │
│  │   Cloudflare Queues          │  │   Cron Triggers          │   │
│  │                              │  │                          │   │
│  │  ┌────────────────────────┐  │  │  Daily at 2 AM           │   │
│  │  │  sii-tasks queue       │  │  │  ┌────────────────────┐  │   │
│  │  │                        │  │  │  │ Enqueue updates    │  │   │
│  │  │  - update_ventas       │  │  │  │ for all users      │  │   │
│  │  │  - update_compras      │  │  │  └────────────────────┘  │   │
│  │  │                        │  │  │                          │   │
│  │  │  Consumer processes    │  │  │  Triggers queue          │   │
│  │  │  messages with retry   │  │  │  processing              │   │
│  │  └────────────────────────┘  │  └──────────────────────────┘   │
│  └──────────────────────────────┘                                 │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                    External Services                                │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │               SII API Gateway (Chile)                        │  │
│  │                                                              │  │
│  │  https://apigateway.sii.cl/api/v1/sii/rcv/                  │  │
│  │                                                              │  │
│  │  Endpoints:                                                  │  │
│  │  - /ventas/resumen/{rut}/{periodo}                          │  │
│  │  - /ventas/detalle/{rut}/{periodo}/{dte}                    │  │
│  │  - /compras/resumen/{rut}/{periodo}/{estado}                │  │
│  │  - /compras/detalle/{rut}/{periodo}/{dte}                   │  │
│  │                                                              │  │
│  │  Rate Limiting:                                              │  │
│  │  - 429 Too Many Requests (Retry-After header)               │  │
│  │  - 423 Locked (X-Lock-Reset header)                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

## Flujos de Datos Principales

### 1. Flujo de Registro y Autenticación

```
Usuario → POST /api/register → Worker
                                  ↓
                        Crear usuario en D1
                                  ↓
                        Generar OTP (6 dígitos)
                                  ↓
                        Guardar OTP en D1
                                  ↓
                    POST /send-otp → WhatsApp Service
                                  ↓
                        Enviar mensaje WhatsApp
                                  ↓
Usuario recibe OTP ← WhatsApp ← whatsapp-web.js
        ↓
POST /api/verify-otp → Worker → Verificar en D1
                                  ↓
                            Marcar verificado
                                  ↓
POST /api/login → Worker → Validar credenciales
                                  ↓
                        Generar token (UUID)
                                  ↓
                        Guardar en KV + D1
                                  ↓
                    Retornar token ← Cliente
```

### 2. Flujo de Consulta de Datos Tributarios

```
Cliente → GET /api/ventas/resumen?periodo=2023-09
              + Authorization: Bearer token
                        ↓
                Middleware de Auth
                        ↓
            Validar token en KV
                        ↓
            Obtener RUT del usuario
                        ↓
        SELECT * FROM ventas_resumen
        WHERE rut = ? AND periodo = ?
                        ↓
        Retornar JSON con datos
```

### 3. Flujo de Actualización en Segundo Plano (SII)

```
        Cron Trigger (2 AM diario)
                ↓
    Worker.scheduled() ejecutado
                ↓
    SELECT todos los usuarios verificados de D1
                ↓
    Para cada usuario:
        ↓
    Enviar mensaje a Queue
    {
        type: 'update_ventas',
        rut: '76123456-7',
        periodo: '2023-09'
    }
                ↓
    Queue Consumer (Worker.queue())
                ↓
    Procesar mensaje:
        ↓
    Obtener clave_sii del usuario
        ↓
    POST https://apigateway.sii.cl/... (con credenciales)
        ↓
    Verificar response:
        - 200 OK → Guardar en D1
        - 429 → Retry después de X segundos
        - 423 → Esperar hasta X-Lock-Reset
        - 401 → Log error credenciales
        ↓
    INSERT/UPDATE en ventas_resumen y ventas_detalle
        ↓
    Log evento en tabla logs
```

### 4. Flujo RAG (Retrieval-Augmented Generation)

```
Cliente → POST /api/contratos/ask
          {
              "question": "¿Mi contrato con ACME sigue vigente?"
          }
              ↓
    Categorizar pregunta
    (ventas/compras/contrato/general)
              ↓
    Si es pregunta de CONTRATO:
              ↓
    1. Generar embedding de la pregunta
       Workers AI: @cf/baai/bge-base-en-v1.5
              ↓
       Vector (768 dimensions)
              ↓
    2. Buscar en Vectorize
       Query con topK=3 y filter={rut: userRut}
              ↓
       Obtener 3 fragmentos más similares
              ↓
    3. Recuperar texto de embeddings
       SELECT content FROM embeddings WHERE id IN (...)
              ↓
       Construir contexto:
       "Fragment 1...\n\nFragment 2...\n\nFragment 3..."
              ↓
    4. Generar respuesta con LLM
       Workers AI: @cf/meta/llama-3-8b-instruct
       Prompt: System context + User question
              ↓
       Respuesta generada
              ↓
    5. Guardar en messages (user + agent)
              ↓
    Retornar { "respuesta": "..." }
```

### 5. Flujo de Subida de PDF

```
Cliente → POST /api/contratos (multipart/form-data)
          file: contract.pdf
              ↓
    Validar archivo (tipo PDF)
              ↓
    Generar nombre único: {rut}/contrato-{timestamp}.pdf
              ↓
    1. Upload a R2
       env.CONTRACTS_BUCKET.put(fileName, stream)
              ↓
    2. Guardar metadata en D1
       INSERT INTO contratos (rut, file_name)
       → Obtener contrato_id
              ↓
    3. Extraer texto del PDF
       (pdf-parse o similar - actualmente simulado)
       → texto completo
              ↓
    4. Dividir en chunks
       splitTextIntoChunks(texto, 500 chars)
       → Array de fragmentos
              ↓
    5. Para cada fragmento:
       ↓
       a) Generar embedding
          Workers AI: bge-base-en-v1.5
          → vector[768]
          ↓
       b) Guardar fragmento en D1
          INSERT INTO embeddings (contrato_id, content)
          → embedding_id
          ↓
       c) Indexar en Vectorize
          env.CONTRATOS_INDEX.upsert([{
              id: embedding_id,
              values: vector,
              metadata: { rut, contratoId, content }
          }])
              ↓
    6. Log evento
       INSERT INTO logs (...)
              ↓
    Retornar { "contrato_id": X, "chunks_processed": Y }
```

### 6. Flujo de WhatsApp Bot

```
Usuario WhatsApp envía mensaje
              ↓
    whatsapp-web.js recibe evento 'message'
              ↓
    Extraer from (número) y body (texto)
              ↓
    Obtener RUT por teléfono
    (consulta a D1 o cache interno)
              ↓
    POST {WORKER_URL}/api/agent/message
    Headers: Authorization: Bearer {AGENT_API_KEY}
    Body: { "rut": "...", "mensaje": "..." }
              ↓
    Worker valida API key
              ↓
    Procesar mensaje (igual que /api/contratos/ask)
              ↓
    Generar respuesta
              ↓
    Guardar en messages (user + agent)
              ↓
    Retornar { "respuesta": "..." }
              ↓
    WhatsApp Service recibe respuesta
              ↓
    whatsappClient.sendMessage(from, respuesta)
              ↓
    Usuario recibe respuesta en WhatsApp
```

## Características de Seguridad

### 1. Autenticación Multi-Capa
```
Capa 1: Password hashing (bcrypt, 10 rounds)
Capa 2: Token de sesión (UUID aleatorio)
Capa 3: KV storage con TTL (24h)
Capa 4: API key para servicios internos
```

### 2. Validación de Datos
```
- Validación de entrada en todos los endpoints
- Sanitización de RUT y teléfono
- Verificación de tipos de archivo (PDF)
- Límites de tamaño de archivos
```

### 3. Rate Limiting
```
- Manejo de 429 Too Many Requests del SII
- Retry con backoff exponencial
- Respeto de headers Retry-After y X-Lock-Reset
```

### 4. Aislamiento de Datos
```
- Filtrado por RUT en todas las queries
- Vectorize filter por metadata.rut
- Sesiones aisladas por usuario
```

## Escalabilidad

### Horizontal Scaling (automático con Workers)
- Workers se replican globalmente
- KV distribuido en edge locations
- D1 con réplicas read-only (próximamente)

### Vertical Scaling (configuración)
- Aumentar límites de Workers (paid plan)
- Más almacenamiento en R2
- Más vectores en Vectorize

### Performance Optimizations
```
1. KV para sesiones (ultra-rápido)
2. D1 para datos estructurados
3. R2 sin costo de egress a Workers
4. Vectorize con búsqueda sub-100ms
5. Workers AI en el edge
6. Queues para operaciones pesadas
```

## Monitoring y Logging

### Logs en D1 (tabla logs)
```sql
CREATE TABLE logs (
    id INTEGER PRIMARY KEY,
    rut TEXT,
    type TEXT,        -- 'SII_FETCH', 'ERROR', 'CRON', etc.
    message TEXT,
    created_at TEXT
);
```

### Eventos Logueados
- Registro de usuarios
- Login/logout
- Fetch de datos SII
- Errores de rate limiting
- Procesamiento de colas
- Subida de contratos
- Consultas RAG

### Cloudflare Analytics (incluido)
- Request counts
- Error rates
- Latency metrics
- Geographic distribution

## Disaster Recovery

### Backup Automático
- D1: Snapshots automáticos (Cloudflare)
- R2: Durabilidad 99.999999999%
- KV: Replicación multi-región

### Recovery Procedures
1. Restaurar D1 desde snapshot
2. Re-indexar embeddings si es necesario
3. Regenerar tokens de sesión
4. Reconectar WhatsApp (escanear QR)

---

**Arquitectura diseñada para máxima confiabilidad y mínimo costo**
