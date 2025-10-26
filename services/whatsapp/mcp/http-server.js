/**
 * HTTP Server para MCP
 * Expone el servidor MCP vía HTTP para que el Worker de Cloudflare pueda acceder
 */

import express from 'express';

const app = express();
app.use(express.json());

// Cache de herramientas
let toolsCache = [];
let mcpReady = false;

// Inicializar herramientas
async function initializeTools() {
  toolsCache = [
    {
      name: 'agendar_reunion',
      description: 'Agenda una reunión con el equipo de ventas de Renata en Google Calendar. Crea un evento con Google Meet incluido. Requiere al menos un método de contacto (teléfono o email).',
      inputSchema: {
        type: 'object',
        properties: {
          telefono: {
            type: 'string',
            description: 'Número de teléfono del prospecto (formato: +56912345678). Requerido si no se proporciona email.',
          },
          nombre_prospecto: {
            type: 'string',
            description: 'Nombre completo del prospecto',
          },
          email_prospecto: {
            type: 'string',
            description: 'Email del prospecto. Requerido si no se proporciona teléfono.',
          },
          fecha: {
            type: 'string',
            description: 'Fecha de la reunión en formato YYYY-MM-DD',
          },
          hora: {
            type: 'string',
            description: 'Hora de la reunión en formato HH:MM (24 horas)',
          },
          notas: {
            type: 'string',
            description: 'Notas adicionales sobre la reunión (opcional)',
          },
        },
        required: ['nombre_prospecto', 'fecha', 'hora'],
      },
    },
    {
      name: 'registrar_contributor',
      description: 'Registra un nuevo contributor en el sistema usando un código de activación. Valida el código y crea la cuenta.',
      inputSchema: {
        type: 'object',
        properties: {
          codigo_activacion: {
            type: 'string',
            description: 'Código de activación proporcionado por el prospecto',
          },
          telefono: {
            type: 'string',
            description: 'Número de teléfono del prospecto',
          },
          rut: {
            type: 'string',
            description: 'RUT de la empresa (formato: 76123456-7)',
          },
          nombre: {
            type: 'string',
            description: 'Nombre completo del representante',
          },
          clave_sii: {
            type: 'string',
            description: 'Clave del SII de la empresa',
          },
          password: {
            type: 'string',
            description: 'Contraseña para la plataforma Renata',
          },
        },
        required: ['codigo_activacion', 'telefono', 'rut', 'nombre', 'clave_sii', 'password'],
      },
    },
    {
      name: 'validar_codigo_activacion',
      description: 'Valida si un código de activación existe y está disponible para uso. No consume el código.',
      inputSchema: {
        type: 'object',
        properties: {
          codigo_activacion: {
            type: 'string',
            description: 'Código de activación a validar',
          },
        },
        required: ['codigo_activacion'],
      },
    },
  ];

  mcpReady = true;
  console.log(`[MCP HTTP] Loaded ${toolsCache.length} tools - Server ready`);
}

/**
 * GET /mcp/tools
 * Lista las herramientas disponibles
 */
app.get('/mcp/tools', (req, res) => {
  res.json({ tools: toolsCache });
});

/**
 * POST /mcp/execute
 * Ejecuta una herramienta MCP
 */
app.post('/mcp/execute', async (req, res) => {
  const { name, arguments: args } = req.body;

  console.log(`[MCP HTTP] Executing tool: ${name}`, args);

  if (!mcpReady) {
    return res.status(503).json({
      success: false,
      error: 'MCP server not ready',
    });
  }

  try {
    // Importar directamente las funciones del servidor
    // En lugar de usar stdio, usamos HTTP directo
    const { executeTool } = await import('./server-functions.js');

    const result = await executeTool(name, args);

    console.log(`[MCP HTTP] Tool result:`, result);
    res.json(result);
  } catch (error) {
    console.error(`[MCP HTTP] Error executing tool:`, error);
    res.status(500).json({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
          }),
        },
      ],
    });
  }
});

/**
 * Health check
 */
app.get('/mcp/health', (req, res) => {
  res.json({
    status: mcpReady ? 'ready' : 'not_ready',
    tools: toolsCache.length,
  });
});

const PORT = process.env.MCP_PORT || 3001;

app.listen(PORT, () => {
  console.log(`[MCP HTTP] Server listening on port ${PORT}`);
  console.log(`[MCP HTTP] Tools endpoint: http://localhost:${PORT}/mcp/tools`);
  console.log(`[MCP HTTP] Execute endpoint: http://localhost:${PORT}/mcp/execute`);
  initializeTools();
});
