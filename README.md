# Proyecto Backend Cloudflare: Integración SII, R2, RAG y WhatsApp

Sistema completo de integración con el SII (Servicio de Impuestos Internos de Chile) que combina Cloudflare Workers, D1, R2, Vectorize, Workers AI y WhatsApp para proporcionar acceso a datos tributarios y análisis de contratos mediante inteligencia artificial.

## Arquitectura General

Este proyecto consta de dos servicios principales:

1. **Servicio Principal (Cloudflare Worker)**: API REST serverless que maneja:
   - Registro y autenticación de usuarios
   - Integración con API del SII
   - Almacenamiento y consulta de datos tributarios
   - Procesamiento de PDFs con IA
   - Sistema RAG para Q&A sobre contratos

2. **Servicio WhatsApp (Node.js)**: Gateway de mensajería que:
   - Envía códigos OTP por WhatsApp
   - Recibe y procesa consultas de usuarios
   - Actúa como puente entre WhatsApp y el Worker

## Características Principales

- ✅ **Capa gratuita**: Todo funciona en el plan gratuito de Cloudflare
- ✅ **Base de datos unificada**: Cloudflare D1 (SQLite serverless)
- ✅ **Almacenamiento de archivos**: Cloudflare R2 (S3-compatible)
- ✅ **IA integrada**: Workers AI para embeddings y LLM
- ✅ **Búsqueda semántica**: Vectorize para RAG
- ✅ **Tareas en segundo plano**: Queues y Cron Triggers
- ✅ **WhatsApp Bot**: Integración completa con whatsapp-web.js

## Estructura del Proyecto

```
hackathon/
├── services/
│   ├── worker/                 # Cloudflare Worker (API principal)
│   │   ├── src/
│   │   │   ├── routes/        # Endpoints de la API
│   │   │   ├── middleware/    # Autenticación y otros
│   │   │   ├── services/      # Lógica de negocio (SII, Queue)
│   │   │   ├── utils/         # Utilidades (crypto, logger)
│   │   │   └── index.js       # Entry point
│   │   ├── wrangler.toml      # Configuración Cloudflare
│   │   └── package.json
│   │
│   └── whatsapp/              # Servicio WhatsApp (Node.js)
│       ├── index.js           # Servidor Express + whatsapp-web.js
│       ├── package.json
│       └── .env.example
│
├── database/
│   ├── schema.sql             # Esquema de base de datos D1
│   └── seeds.sql              # Datos de ejemplo
│
├── postman/
│   └── SII-RCV-API.postman_collection.json
│
└── README.md
```

## Requisitos Previos

- Node.js 18+ y npm
- Cuenta de Cloudflare (plan gratuito)
- Cloudflare CLI (Wrangler)
- Cuenta de WhatsApp para el bot
- Git (opcional)

## Instalación y Configuración

### 1. Configuración de Cloudflare

#### a) Instalar Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

#### b) Crear Base de Datos D1

```bash
# Crear la base de datos
wrangler d1 create rcv_db

# Copiar el database_id que se genera y actualizar wrangler.toml
# Luego aplicar el esquema
wrangler d1 execute rcv_db --file=database/schema.sql

# (Opcional) Cargar datos de ejemplo
wrangler d1 execute rcv_db --file=database/seeds.sql
```

#### c) Crear KV Namespace para Sesiones

```bash
wrangler kv:namespace create SESSIONS_KV

# Copiar el ID generado y actualizar wrangler.toml
```

#### d) Crear Bucket R2 para Contratos

```bash
wrangler r2 bucket create contratos-bucket
```

#### e) Crear Índice Vectorize

```bash
wrangler vectorize create contract_index --dimensions=768 --metric=cosine
```

#### f) Crear Cola (Queue)

```bash
wrangler queues create sii-tasks
```

### 2. Configuración del Worker

#### a) Instalar dependencias

```bash
cd services/worker
npm install
```

#### b) Configurar wrangler.toml

Editar `services/worker/wrangler.toml` y reemplazar:

- `YOUR_D1_DATABASE_ID` con el ID de tu base D1
- `YOUR_KV_NAMESPACE_ID` con el ID de tu namespace KV
- `YOUR_SECRET_API_KEY` con una clave secreta generada
- `WHATSAPP_SERVICE_URL` con la URL de tu servicio WhatsApp

#### c) Desplegar Worker en desarrollo

```bash
npm run dev
# El Worker estará disponible en http://localhost:8787
```

#### d) Desplegar a producción

```bash
npm run deploy
# Obtendrás una URL como https://sii-rcv-api.your-subdomain.workers.dev
```

### 3. Configuración del Servicio WhatsApp

#### a) Instalar dependencias

```bash
cd services/whatsapp
npm install
```

#### b) Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env`:

```env
PORT=3000
WORKER_API_URL=https://sii-rcv-api.your-subdomain.workers.dev
AGENT_API_KEY=YOUR_SECRET_API_KEY
```

#### c) Iniciar servicio

```bash
npm start
```

Al iniciar por primera vez, aparecerá un código QR en la consola. Escanéalo con WhatsApp para vincular la cuenta del bot.

### 4. Probar la API

#### Opción 1: Usando cURL

```bash
# Registrar usuario
curl -X POST https://your-worker.workers.dev/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "rut": "76123456-7",
    "password": "miclave123",
    "clave_sii": "claveSII123",
    "telefono": "+56911112222"
  }'

# Verificar OTP (usar el código recibido por WhatsApp)
curl -X POST https://your-worker.workers.dev/api/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "rut": "76123456-7",
    "codigo": "123456"
  }'

# Login
curl -X POST https://your-worker.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "rut": "76123456-7",
    "password": "miclave123"
  }'

# Consultar ventas (usar el token obtenido en login)
curl -X GET "https://your-worker.workers.dev/api/ventas/resumen?periodo=2023-09" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Opción 2: Usando Postman

1. Importar la colección desde `postman/SII-RCV-API.postman_collection.json`
2. Configurar la variable `base_url` con tu URL del Worker
3. Ejecutar las peticiones en orden: Register → Verify OTP → Login → Queries

## Endpoints de la API

### Autenticación

- `POST /api/register` - Registrar nuevo contribuyente
- `POST /api/verify-otp` - Verificar código OTP
- `POST /api/login` - Iniciar sesión

### Consultas Tributarias

- `GET /api/ventas/resumen?periodo=YYYY-MM` - Resumen de ventas
- `GET /api/ventas/detalle?periodo=YYYY-MM&tipo=33` - Detalle de ventas
- `GET /api/compras/resumen?periodo=YYYY-MM` - Resumen de compras
- `GET /api/compras/detalle?periodo=YYYY-MM` - Detalle de compras

### Contratos y RAG

- `POST /api/contratos` - Subir contrato PDF (multipart/form-data)
- `POST /api/contratos/ask` - Hacer pregunta sobre contratos o datos

### WhatsApp Agent

- `POST /api/agent/message` - Procesar mensaje de WhatsApp (requiere API key)

## Uso del Bot de WhatsApp

Una vez configurado el servicio WhatsApp:

1. Envía un mensaje al número del bot
2. El bot identificará tu usuario por teléfono
3. Puedes hacer preguntas como:
   - "¿Cuánto vendí en septiembre?"
   - "¿Cuándo vence el F29?"
   - "¿Mi contrato con ACME sigue vigente?"

## Actualización Automática de Datos SII

El Worker incluye un Cron Trigger que se ejecuta diariamente a las 2 AM para:

1. Actualizar automáticamente ventas y compras del mes actual
2. Procesar las actualizaciones mediante colas (evitando límites de la API SII)
3. Manejar errores 429/423 con reintentos inteligentes

## Estructura de Base de Datos

### Tablas principales:

- `contributors` - Usuarios registrados
- `otp` - Códigos de verificación
- `sessions` - Sesiones activas
- `ventas_resumen` / `ventas_detalle` - Datos de ventas del SII
- `compras_resumen` / `compras_detalle` - Datos de compras del SII
- `contratos` - Metadatos de contratos PDF
- `embeddings` - Fragmentos de texto indexados
- `messages` - Historial de conversaciones
- `logs` - Eventos del sistema

## Tecnologías Utilizadas

### Cloudflare Stack:
- **Workers**: Serverless compute
- **D1**: SQLite serverless database
- **KV**: Key-value store (sesiones)
- **R2**: Object storage (PDFs)
- **Workers AI**: LLM y embeddings
- **Vectorize**: Vector database
- **Queues**: Tareas asíncronas
- **Cron Triggers**: Tareas programadas

### Node.js Stack:
- **Express**: Web server
- **whatsapp-web.js**: Cliente WhatsApp
- **qrcode-terminal**: Generación de QR

## Costos y Límites

Todo el proyecto funciona en la **capa gratuita** de Cloudflare:

- Workers: 100,000 requests/día gratis
- D1: Gratis en beta (hasta 5GB)
- KV: 100,000 lecturas/día gratis
- R2: 10GB almacenamiento gratis
- Vectorize: Beta gratuita
- Workers AI: Primeros tokens gratis, luego ~$0.067/1M tokens

## Desarrollo

### Scripts disponibles

#### Worker:
```bash
npm run dev      # Desarrollo local
npm run deploy   # Desplegar a producción
npm run migrate  # Aplicar migraciones D1
npm run seed     # Cargar datos de ejemplo
```

#### WhatsApp:
```bash
npm start        # Iniciar servicio
npm run dev      # Desarrollo con nodemon
```

## Troubleshooting

### El Worker no se conecta a D1

Verificar que el `database_id` en `wrangler.toml` sea correcto:

```bash
wrangler d1 list
```

### WhatsApp no envía mensajes

1. Verificar que el servicio Node esté corriendo
2. Verificar que el QR haya sido escaneado
3. Revisar logs en consola

### Errores de autenticación SII

Verificar que las credenciales SII (`clave_sii`) sean correctas en la base de datos.

### Vectorize no encuentra resultados

Asegurarse de que los embeddings se hayan generado correctamente al subir el PDF.

## Seguridad

- ✅ Contraseñas hasheadas con bcrypt
- ✅ Tokens de sesión en KV con expiración
- ✅ API key para comunicación Worker-WhatsApp
- ✅ Clave SII almacenada cifrada (considerar encriptación adicional)
- ⚠️  No exponer el endpoint `/api/agent/message` públicamente

## Próximos Pasos

- [ ] Implementar encriptación para `clave_sii`
- [ ] Agregar más modelos de IA para análisis avanzado
- [ ] Dashboard web para visualización de datos
- [ ] Notificaciones proactivas de vencimientos
- [ ] Soporte multi-tenancy
- [ ] Tests unitarios e integración

## Contribuir

Este es un proyecto de hackathon. Siéntete libre de:

1. Hacer fork del repositorio
2. Crear una rama para tu feature
3. Enviar un Pull Request

## Licencia

MIT License - Ver archivo LICENSE para más detalles.

## Referencias

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Database](https://developers.cloudflare.com/d1/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Vectorize](https://developers.cloudflare.com/vectorize/)
- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- [API SII Chile](https://apigateway.sii.cl/)

## Soporte

Para preguntas o issues, crear un issue en el repositorio de GitHub.

---

**Desarrollado con ❤️ usando Cloudflare y Node.js**
