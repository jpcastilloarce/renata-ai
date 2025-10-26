# Testing Local - Claude + MCP

## 🎯 Opciones para Probar sin Deploy a Cloudflare

Ya que no podemos deployar a Cloudflare Workers directamente, aquí hay **3 opciones** para validar la implementación localmente.

---

## Opción 1: Testing con Wrangler Dev (Recomendado)

`wrangler dev` emula Cloudflare Workers localmente con acceso a D1, KV, R2, etc.

### Paso 1: Iniciar MCP Server
```bash
cd services/whatsapp
npm run mcp
```

### Paso 2: Iniciar Worker en modo dev
```bash
cd services/worker
npm run dev
```

### Paso 3: Probar con curl o Postman

**Test básico:**
```bash
curl -X POST http://localhost:8787/api/prospecto-claude/message \
  -H "Authorization: Bearer 12a7035a667ae8f91dfdb9c1b2f4f0b2cff813c6e7b55f26bd7cd9e95bc68f17" \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "+56912345678",
    "mensaje": "Hola, quiero información",
    "source": "api"
  }'
```

**Test con intención de agendar reunión:**
```bash
curl -X POST http://localhost:8787/api/prospecto-claude/message \
  -H "Authorization: Bearer 12a7035a667ae8f91dfdb9c1b2f4f0b2cff813c6e7b55f26bd7cd9e95bc68f17" \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "+56912345678",
    "mensaje": "Quiero agendar una reunión para mañana a las 15:00",
    "source": "api"
  }'
```

---

## Opción 2: Miniflare (Simulador Completo de Workers)

Miniflare es un simulador más avanzado que wrangler dev.

### Instalar Miniflare
```bash
npm install -g miniflare
```

### Ejecutar
```bash
cd services/worker
miniflare --wrangler-config wrangler.toml
```

---

## Opción 3: Mock HTTP Server (Testing Unitario)

Crear un servidor HTTP simple que pruebe la lógica sin Cloudflare.

### Archivo: `services/worker/test-server.js`

```javascript
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(express.json());

// Simular env
const env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  MCP_SERVER_URL: 'http://localhost:3001/mcp',
  AGENT_API_KEY: '12a7035a667ae8f91dfdb9c1b2f4f0b2cff813c6e7b55f26bd7cd9e95bc68f17',
};

app.post('/api/prospecto-claude/message', async (req, res) => {
  const { telefono, mensaje } = req.body;

  console.log('Mensaje recibido:', mensaje);

  // Simular llamada a Claude (sin MCP por ahora)
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: mensaje,
      },
    ],
  });

  const respuesta = response.content[0].text;

  res.json({
    tipo: 'texto',
    respuesta,
  });
});

app.listen(8787, () => {
  console.log('Test server running on http://localhost:8787');
});
```

### Ejecutar:
```bash
node services/worker/test-server.js
```

---

## 🧪 Plan de Testing Completo

### Fase 1: Testing Local (Sin Cloudflare)

1. **✅ Servidor MCP Funcional**
   ```bash
   cd services/whatsapp
   npm run mcp
   # Verificar: http://localhost:3001/mcp/health
   ```

2. **✅ Herramientas MCP Disponibles**
   ```bash
   curl http://localhost:3001/mcp/tools | jq '.tools[].name'
   ```

3. **✅ Claude Conecta con MCP**
   - Usar test-server.js
   - Probar mensaje simple
   - Verificar que Claude puede llamar herramientas

### Fase 2: Testing con Wrangler Dev

1. **✅ Worker + D1 Local**
   ```bash
   cd services/worker
   wrangler d1 execute rcv_db --local --file=../../database/migrations/001_add_mcp_tables.sql
   ```

2. **✅ Insertar Código de Prueba**
   ```bash
   wrangler d1 execute rcv_db --local --command="INSERT INTO activation_codes (code, empresa_nombre, plan) VALUES ('TEST123', 'Empresa Test', 'basic')"
   ```

3. **✅ Probar Flujo Completo**
   - Mensaje inicial
   - Validar código
   - Registrar contributor (mock)
   - Agendar reunión (requiere Google Calendar configurado)

### Fase 3: Testing de Integración

1. **✅ Google Calendar**
   - Configurar service account
   - Probar herramienta `agendar_reunion` directamente

2. **✅ Audio (ElevenLabs)**
   - Probar con `source: "whatsapp"`
   - Verificar generación de audio

---

## 🔍 Verificación Paso a Paso

### Check 1: MCP Server Responde
```bash
curl http://localhost:3001/mcp/health

# Esperado:
{
  "status": "ready",
  "tools": 3
}
```

### Check 2: Herramientas Disponibles
```bash
curl http://localhost:3001/mcp/tools | jq '.tools | length'

# Esperado: 3
```

### Check 3: Worker Responde
```bash
curl http://localhost:8787/

# Esperado:
{
  "message": "SII RCV API - Sistema de Integración Tributaria con IA",
  "version": "1.0.0",
  "status": "active"
}
```

### Check 4: Endpoint Prospecto-Claude Existe
```bash
curl -X POST http://localhost:8787/api/prospecto-claude/message \
  -H "Authorization: Bearer 12a7035a667ae8f91dfdb9c1b2f4f0b2cff813c6e7b55f26bd7cd9e95bc68f17" \
  -H "Content-Type: application/json" \
  -d '{"telefono": "+56999999999", "mensaje": "test", "source": "api"}'

# Si NO tienes ANTHROPIC_API_KEY configurado, verás un error claro
# Si funciona, verás una respuesta JSON con el texto de Claude
```

---

## 🐛 Problemas Comunes y Soluciones

### "Cannot find module '@anthropic-ai/sdk'"
```bash
cd services/worker
npm install
```

### "MCP server not ready"
```bash
# En otra terminal:
cd services/whatsapp
npm install
npm run mcp
```

### "D1 database not found"
```bash
# Crear base de datos D1 localmente
cd services/worker
wrangler d1 create rcv_db --local

# Aplicar migraciones
npm run migrate
```

### "ANTHROPIC_API_KEY is not defined"
```bash
# Configurar secret (solo funciona en Cloudflare, no local)
wrangler secret put ANTHROPIC_API_KEY

# Para testing local, usar .dev.vars:
echo "ANTHROPIC_API_KEY=sk-ant-..." > services/worker/.dev.vars
```

---

## 📝 Checklist de Testing

- [ ] MCP Server inicia correctamente (`npm run mcp`)
- [ ] MCP Server expone 3 herramientas
- [ ] Worker inicia con `wrangler dev`
- [ ] D1 database tiene las tablas nuevas
- [ ] Endpoint `/api/prospecto-claude/message` responde
- [ ] Claude puede llamar a herramientas MCP
- [ ] Google Calendar configurado (opcional para testing básico)
- [ ] ElevenLabs genera audio correctamente

---

## 🚀 Próximo Paso: Deploy Real

Una vez validado localmente:

1. Configurar secrets en Cloudflare:
   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   ```

2. Deploy del worker:
   ```bash
   npm run deploy
   ```

3. Deploy del MCP Server (Railway, Render, Fly.io, VPS)

4. Actualizar `MCP_SERVER_URL` en wrangler.toml

---

## ¿Cuál opción prefieres?

1. **Wrangler Dev** - Más cercano a producción, usa D1 real
2. **Miniflare** - Más flexible, mejor para debugging
3. **Mock Server** - Más simple, solo para probar Claude + MCP

Recomiendo empezar con **Wrangler Dev** ya que es lo que ya tienes configurado.
