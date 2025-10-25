# Lista de Verificación para Despliegue

## ☑️ Pre-requisitos

- [ ] Node.js 18+ instalado
- [ ] npm instalado
- [ ] Cuenta de Cloudflare creada (plan gratuito)
- [ ] Cuenta de WhatsApp disponible para el bot
- [ ] Git instalado (opcional)

## ☑️ Fase 1: Instalación de Herramientas

```bash
# 1. Instalar Wrangler CLI globalmente
npm install -g wrangler

# 2. Verificar instalación
wrangler --version

# 3. Autenticarse en Cloudflare
wrangler login
```

**Estado:** [ ] Completado

## ☑️ Fase 2: Crear Recursos en Cloudflare

### 2.1 Base de Datos D1

```bash
wrangler d1 create rcv_db
```

**Guardar:**
- [ ] `database_id`: ___________________________________
- [ ] `database_name`: rcv_db

### 2.2 KV Namespace

```bash
wrangler kv:namespace create SESSIONS_KV
```

**Guardar:**
- [ ] `id`: ___________________________________
- [ ] `title`: SESSIONS_KV

### 2.3 R2 Bucket

```bash
wrangler r2 bucket create contratos-bucket
```

**Verificar:**
- [ ] Bucket creado exitosamente

### 2.4 Vectorize Index

```bash
wrangler vectorize create contract_index --dimensions=768 --metric=cosine
```

**Verificar:**
- [ ] Índice creado con 768 dimensiones
- [ ] Métrica: cosine

### 2.5 Queue

```bash
wrangler queues create sii-tasks
```

**Verificar:**
- [ ] Cola "sii-tasks" creada

## ☑️ Fase 3: Configurar Worker

### 3.1 Actualizar wrangler.toml

Editar: `services/worker/wrangler.toml`

```toml
[[d1_databases]]
binding = "DB"
database_name = "rcv_db"
database_id = "PEGAR_DATABASE_ID_AQUÍ"  # ← Actualizar

[[kv_namespaces]]
binding = "SESSIONS_KV"
id = "PEGAR_KV_ID_AQUÍ"  # ← Actualizar

[vars]
SII_API_BASE = "https://apigateway.sii.cl/api/v1/sii/rcv"
WHATSAPP_SERVICE_URL = "http://localhost:3000"  # ← Actualizar después
AGENT_API_KEY = "GENERAR_CLAVE_SECRETA"  # ← Actualizar
```

**Checklist:**
- [ ] database_id actualizado
- [ ] kv id actualizado
- [ ] AGENT_API_KEY generada (mín. 32 caracteres aleatorios)

### 3.2 Instalar Dependencias

```bash
cd services/worker
npm install
```

**Verificar:**
- [ ] node_modules/ creado
- [ ] Sin errores de instalación

### 3.3 Aplicar Schema de Base de Datos

```bash
wrangler d1 execute rcv_db --file=../../database/schema.sql
```

**Verificar:**
- [ ] 11 tablas creadas sin errores

### 3.4 (Opcional) Cargar Datos de Prueba

```bash
wrangler d1 execute rcv_db --file=../../database/seeds.sql
```

**Verificar:**
- [ ] Datos insertados correctamente
- [ ] Usuario de prueba creado (76123456-7)

### 3.5 Probar en Desarrollo

```bash
npm run dev
```

**Verificar:**
- [ ] Worker corre en http://localhost:8787
- [ ] GET http://localhost:8787 responde con JSON

### 3.6 Desplegar a Producción

```bash
npm run deploy
```

**Guardar:**
- [ ] Worker URL: ___________________________________
- [ ] Deployment exitoso

## ☑️ Fase 4: Configurar Servicio WhatsApp

### 4.1 Crear archivo .env

```bash
cd ../whatsapp
cp .env.example .env
```

### 4.2 Editar .env

```env
PORT=3000
WORKER_API_URL=https://tu-worker-url.workers.dev  # ← URL del Worker
AGENT_API_KEY=tu-clave-secreta-aquí  # ← Misma del wrangler.toml
```

**Checklist:**
- [ ] WORKER_API_URL actualizada con URL real del Worker
- [ ] AGENT_API_KEY coincide con wrangler.toml

### 4.3 Instalar Dependencias

```bash
npm install
```

**Verificar:**
- [ ] node_modules/ creado
- [ ] whatsapp-web.js instalado

### 4.4 Iniciar Servicio

```bash
npm start
```

**Verificar:**
- [ ] Servidor corriendo en puerto 3000
- [ ] QR code mostrado en consola

### 4.5 Vincular WhatsApp

**Acción:**
1. Abrir WhatsApp en tu teléfono
2. Ir a Configuración > Dispositivos Vinculados
3. Escanear el QR code en la consola

**Verificar:**
- [ ] "Client is ready!" aparece en consola
- [ ] WhatsApp conectado

### 4.6 Actualizar URL del Worker

Si el servicio WhatsApp está en un servidor con IP pública:

**Actualizar en wrangler.toml:**
```toml
WHATSAPP_SERVICE_URL = "http://tu-ip-o-dominio:3000"
```

**Volver a desplegar:**
```bash
cd ../worker
npm run deploy
```

**Checklist:**
- [ ] URL actualizada
- [ ] Worker re-desplegado

## ☑️ Fase 5: Testing

### 5.1 Test de Health Check

```bash
curl https://tu-worker-url.workers.dev/
```

**Esperado:**
```json
{
  "message": "SII RCV API - Sistema de Integración Tributaria con IA",
  "version": "1.0.0",
  "status": "active"
}
```

**Verificar:**
- [ ] Respuesta 200 OK
- [ ] JSON correcto

### 5.2 Test de Registro

```bash
curl -X POST https://tu-worker-url.workers.dev/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "rut": "11111111-1",
    "password": "test123",
    "clave_sii": "claveSII",
    "telefono": "+56912345678"
  }'
```

**Verificar:**
- [ ] Respuesta 201 Created
- [ ] Mensaje de OTP enviado
- [ ] OTP recibido en WhatsApp

### 5.3 Test de Verificación OTP

```bash
curl -X POST https://tu-worker-url.workers.dev/api/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "rut": "11111111-1",
    "codigo": "CODIGO_RECIBIDO"
  }'
```

**Verificar:**
- [ ] Respuesta 200 OK
- [ ] Usuario verificado

### 5.4 Test de Login

```bash
curl -X POST https://tu-worker-url.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "rut": "11111111-1",
    "password": "test123"
  }'
```

**Guardar:**
- [ ] Token recibido: ___________________________________

### 5.5 Test de Consulta con Token

```bash
curl -X GET "https://tu-worker-url.workers.dev/api/ventas/resumen?periodo=2023-09" \
  -H "Authorization: Bearer TU_TOKEN_AQUI"
```

**Verificar:**
- [ ] Respuesta 200 OK
- [ ] Datos de ventas retornados

### 5.6 Test de WhatsApp Bot

**Acción:** Enviar mensaje de WhatsApp al número del bot:
```
Hola
```

**Verificar:**
- [ ] Bot responde automáticamente
- [ ] Mensaje registrado en D1

**Acción:** Enviar pregunta:
```
¿Cuánto vendí en septiembre?
```

**Verificar:**
- [ ] Bot responde con datos
- [ ] Respuesta coherente

## ☑️ Fase 6: Postman (Opcional)

### 6.1 Importar Colección

1. Abrir Postman
2. Import → Upload Files
3. Seleccionar: `postman/SII-RCV-API.postman_collection.json`

**Verificar:**
- [ ] Colección importada
- [ ] 10+ requests visibles

### 6.2 Configurar Variables

En Postman, Variables de Colección:
- `base_url`: https://tu-worker-url.workers.dev
- `test_rut`: 11111111-1

**Verificar:**
- [ ] Variables configuradas

### 6.3 Ejecutar Tests

Ejecutar en orden:
1. [ ] Register User
2. [ ] Verify OTP (usar código real)
3. [ ] Login (guarda token automáticamente)
4. [ ] Get Sales Summary
5. [ ] Get Sales Detail
6. [ ] Upload Contract PDF (opcional)
7. [ ] Ask Question

**Verificar:**
- [ ] Todos los tests pasan (excepto SII real)

## ☑️ Fase 7: Verificación de Cron y Queues

### 7.1 Verificar Cron Configurado

```bash
cd services/worker
wrangler deployments list
```

**Verificar:**
- [ ] Cron trigger visible: "0 2 * * *"

### 7.2 Test Manual de Queue

```bash
# En D1, insertar usuario si no existe
wrangler d1 execute rcv_db --command \
  "INSERT INTO contributors (rut, password_hash, clave_sii, telefono, verified)
   VALUES ('99999999-9', 'hash', 'test', '+56900000000', 1)"
```

**Nota:** El cron se ejecutará automáticamente cada día a las 2 AM.

**Para testing inmediato:** Modificar el cron en wrangler.toml:
```toml
crons = ["*/5 * * * *"]  # Cada 5 minutos (solo para testing)
```

**Verificar:**
- [ ] Mensajes aparecen en la cola
- [ ] Consumer procesa mensajes
- [ ] Logs en tabla `logs`

**Revertir:** Cambiar de vuelta a `"0 2 * * *"` después del test.

## ☑️ Fase 8: Monitoreo

### 8.1 Cloudflare Dashboard

1. Ir a https://dash.cloudflare.com
2. Workers & Pages → tu-worker

**Verificar:**
- [ ] Requests visibles en gráficas
- [ ] Sin errores críticos

### 8.2 Logs en Tiempo Real

```bash
wrangler tail
```

**Verificar:**
- [ ] Logs aparecen en tiempo real
- [ ] Requests se muestran correctamente

### 8.3 Revisar Logs en D1

```bash
wrangler d1 execute rcv_db --command "SELECT * FROM logs ORDER BY id DESC LIMIT 10"
```

**Verificar:**
- [ ] Eventos logueados correctamente

## ☑️ Fase 9: Documentación

### 9.1 Actualizar README con URLs Reales

Editar `README.md` y reemplazar:
- `https://your-worker.workers.dev` → URL real

**Verificar:**
- [ ] URLs actualizadas

### 9.2 Guardar Credenciales de Forma Segura

**Documentar en archivo privado (.env o similar):**
- [ ] Worker URL
- [ ] AGENT_API_KEY
- [ ] Database IDs
- [ ] KV Namespace ID

**NO COMMITEAR:** .env a git

## ☑️ Fase 10: Producción

### 10.1 Seguridad

- [ ] Cambiar AGENT_API_KEY a valor más seguro
- [ ] Configurar CORS si es necesario
- [ ] Revisar permisos de R2
- [ ] Habilitar rate limiting adicional (si es necesario)

### 10.2 Optimización

- [ ] Revisar límites de Workers (actualizar plan si es necesario)
- [ ] Configurar alertas en Cloudflare
- [ ] Documentar procedures de backup

### 10.3 Mantenimiento

- [ ] Configurar calendario para revisar logs semanalmente
- [ ] Monitorear uso de cuota gratuita
- [ ] Planear escalado si es necesario

## ✅ Checklist Final

- [ ] Worker desplegado y funcionando
- [ ] D1 con datos cargados
- [ ] KV configurado para sesiones
- [ ] R2 listo para PDFs
- [ ] Vectorize indexando correctamente
- [ ] Queue procesando mensajes
- [ ] Cron ejecutándose diariamente
- [ ] WhatsApp bot conectado y respondiendo
- [ ] Todos los endpoints probados
- [ ] Postman collection funcionando
- [ ] Documentación actualizada
- [ ] Credenciales guardadas de forma segura

## 🎉 Proyecto Desplegado

**Fecha de despliegue:** ___________________

**URLs importantes:**
- Worker: ___________________________________
- WhatsApp Service: _________________________

**Próximos pasos:**
1. Monitorear logs durante las primeras 24 horas
2. Ajustar configuración según necesidades
3. Agregar más usuarios para testing
4. Planear features adicionales

## 📞 Troubleshooting

### Problema: Worker no responde

**Solución:**
```bash
wrangler tail  # Ver logs en tiempo real
wrangler deployments list  # Ver deployments
```

### Problema: D1 no encuentra tablas

**Solución:**
```bash
wrangler d1 execute rcv_db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

### Problema: WhatsApp no conecta

**Solución:**
1. Eliminar carpeta `.wwebjs_auth/`
2. Reiniciar servicio
3. Escanear nuevo QR

### Problema: KV no guarda sesiones

**Solución:**
```bash
wrangler kv:namespace list  # Verificar ID
# Actualizar en wrangler.toml
npm run deploy  # Re-desplegar
```

---

**¡Deployment completado! Sistema listo para producción.**
