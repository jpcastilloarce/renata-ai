# Guía de Inicio Rápido

Esta guía te ayudará a tener el proyecto funcionando en menos de 15 minutos.

## Prerequisitos

```bash
# Verificar versiones
node --version    # Debe ser v18 o superior
npm --version     # Debe ser v8 o superior
```

## Paso 1: Instalar Wrangler y Autenticarse

```bash
npm install -g wrangler
wrangler login
```

## Paso 2: Crear Recursos en Cloudflare

Ejecuta estos comandos y **guarda los IDs generados**:

```bash
# 1. Base de datos D1
wrangler d1 create rcv_db
# ✅ Copiar el database_id

# 2. KV Namespace
wrangler kv:namespace create SESSIONS_KV
# ✅ Copiar el id

# 3. R2 Bucket
wrangler r2 bucket create contratos-bucket
# ✅ Solo confirmar que se creó

# 4. Vectorize Index
wrangler vectorize create contract_index --dimensions=768 --metric=cosine
# ✅ Confirmar creación

# 5. Queue
wrangler queues create sii-tasks
# ✅ Confirmar creación
```

## Paso 3: Configurar el Worker

```bash
cd services/worker

# Editar wrangler.toml y reemplazar:
# - YOUR_D1_DATABASE_ID -> ID de la base D1
# - YOUR_KV_NAMESPACE_ID -> ID del namespace KV
# - YOUR_SECRET_API_KEY -> Una clave secreta (ej: "mi-clave-super-secreta-123")

# Instalar dependencias
npm install

# Aplicar esquema de base de datos
wrangler d1 execute rcv_db --file=../../database/schema.sql

# (Opcional) Cargar datos de ejemplo
wrangler d1 execute rcv_db --file=../../database/seeds.sql
```

## Paso 4: Desplegar Worker

```bash
# Desde services/worker/
npm run deploy
```

✅ **Anota la URL generada** (ej: `https://sii-rcv-api.tu-subdomain.workers.dev`)

## Paso 5: Configurar Servicio WhatsApp

```bash
cd ../whatsapp

# Instalar dependencias
npm install

# Crear archivo .env
cp .env.example .env

# Editar .env y configurar:
# - WORKER_API_URL=https://sii-rcv-api.tu-subdomain.workers.dev
# - AGENT_API_KEY=mi-clave-super-secreta-123
```

## Paso 6: Iniciar WhatsApp Service

```bash
# Desde services/whatsapp/
npm start
```

📱 **Escanea el código QR** que aparece en la consola con WhatsApp

## Paso 7: Probar la API

### Opción A: Con cURL

```bash
# Registrar usuario
curl -X POST https://sii-rcv-api.tu-subdomain.workers.dev/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "rut": "12345678-9",
    "password": "mipassword123",
    "clave_sii": "claveSII123",
    "telefono": "+56912345678"
  }'

# Revisar WhatsApp para el código OTP

# Verificar OTP
curl -X POST https://sii-rcv-api.tu-subdomain.workers.dev/api/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "rut": "12345678-9",
    "codigo": "123456"
  }'

# Login
curl -X POST https://sii-rcv-api.tu-subdomain.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "rut": "12345678-9",
    "password": "mipassword123"
  }'
```

### Opción B: Con Postman

1. Importar `postman/SII-RCV-API.postman_collection.json`
2. Configurar variable `base_url` con tu URL del Worker
3. Ejecutar peticiones

## Paso 8: Probar WhatsApp

Envía un mensaje de WhatsApp al número del bot:

```
Hola
```

```
¿Cuánto vendí en septiembre?
```

## Comandos Útiles

```bash
# Ver logs del Worker en tiempo real
wrangler tail

# Consultar datos en D1
wrangler d1 execute rcv_db --command "SELECT * FROM contributors"

# Listar archivos en R2
wrangler r2 object list contratos-bucket

# Reiniciar servicio WhatsApp
# Ctrl+C y luego npm start
```

## Problemas Comunes

### "Database not found"

```bash
# Verificar que el database_id en wrangler.toml sea correcto
wrangler d1 list
```

### "KV namespace not found"

```bash
# Verificar ID del namespace
wrangler kv:namespace list
```

### WhatsApp no conecta

1. Asegúrate de que el servicio Node esté corriendo
2. Verifica que hayas escaneado el QR
3. Revisa que no haya errores en la consola

### "SII credentials invalid"

Las credenciales del SII son de ejemplo. Para producción necesitas credenciales reales de la API del SII.

## Siguiente Paso

Revisa el README.md completo para entender la arquitectura y todas las funcionalidades disponibles.

## Recursos

- [Documentación Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Documentación D1](https://developers.cloudflare.com/d1/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)

---

¿Necesitas ayuda? Crea un issue en el repositorio.
