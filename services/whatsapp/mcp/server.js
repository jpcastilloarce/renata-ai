/**
 * MCP Server para Renata
 * Provee herramientas para:
 * 1. Agendar reuniones en Google Calendar
 * 2. Registrar nuevos contributors con código de activación
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import fetch from 'node-fetch';

// URL del Worker de Cloudflare (debe configurarse en .env)
const WORKER_URL = process.env.WORKER_API_URL || 'http://localhost:8787';
const AGENT_API_KEY = process.env.AGENT_API_KEY;

// Configuración de Google Calendar
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

class RenataMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'renata-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.auth = null;
    this.calendar = null;

    // Inicializar Google Calendar
    this.initializeGoogleCalendar();
  }

  initializeGoogleCalendar() {
    try {
      if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        console.error('[MCP] Google Calendar credentials not configured');
        return;
      }

      this.auth = new google.auth.JWT({
        email: GOOGLE_CLIENT_EMAIL,
        key: GOOGLE_PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });

      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      console.log('[MCP] Google Calendar initialized successfully');
    } catch (error) {
      console.error('[MCP] Error initializing Google Calendar:', error);
    }
  }

  setupToolHandlers() {
    // Handler para listar herramientas disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
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
      ],
    }));

    // Handler para ejecutar herramientas
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.log(`[MCP] Tool called: ${name}`, args);

      try {
        switch (name) {
          case 'agendar_reunion':
            return await this.agendarReunion(args);
          case 'registrar_contributor':
            return await this.registrarContributor(args);
          case 'validar_codigo_activacion':
            return await this.validarCodigoActivacion(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`[MCP] Error executing tool ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message,
              }),
            },
          ],
        };
      }
    });
  }

  /**
   * Agenda una reunión en Google Calendar
   */
  async agendarReunion(args) {
    const { telefono, nombre_prospecto, email_prospecto, fecha, hora, notas } = args;

    if (!this.calendar) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Google Calendar no está configurado',
            }),
          },
        ],
      };
    }

    // Validar que al menos teléfono o email estén presentes
    if (!telefono && !email_prospecto) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Debes proporcionar al menos un teléfono o un email para contactar al prospecto',
            }),
          },
        ],
      };
    }

    try {
      // Construir fecha y hora completa (asumiendo timezone de Chile)
      const startDateTime = `${fecha}T${hora}:00-03:00`;
      const endDateTime = new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString();

      // Crear evento en Google Calendar
      const event = {
        summary: `Reunión de Ventas - ${nombre_prospecto}`,
        description: `Reunión con prospecto: ${nombre_prospecto}\nTeléfono: ${telefono}${email_prospecto ? `\nEmail: ${email_prospecto}` : ''}\n${notas ? `\nNotas: ${notas}` : ''}`,
        start: {
          dateTime: startDateTime,
          timeZone: 'America/Santiago',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Santiago',
        },
        attendees: email_prospecto ? [{ email: email_prospecto }] : [],
        conferenceData: {
          createRequest: {
            requestId: `renata-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      };

      const response = await this.calendar.events.insert({
        calendarId: GOOGLE_CALENDAR_ID,
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
      });

      const googleEventId = response.data.id;
      const googleMeetLink = response.data.hangoutLink || response.data.conferenceData?.entryPoints?.[0]?.uri;

      // Guardar en base de datos D1
      const dbResponse = await fetch(`${WORKER_URL}/api/internal/scheduled-meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AGENT_API_KEY}`,
        },
        body: JSON.stringify({
          telefono,
          nombre_prospecto,
          email_prospecto,
          fecha,
          hora,
          google_event_id: googleEventId,
          google_meet_link: googleMeetLink,
          notas,
        }),
      });

      if (!dbResponse.ok) {
        console.error('[MCP] Error saving to database:', await dbResponse.text());
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Reunión agendada exitosamente para el ${fecha} a las ${hora}`,
              google_event_id: googleEventId,
              google_meet_link: googleMeetLink,
              fecha,
              hora,
            }),
          },
        ],
      };
    } catch (error) {
      console.error('[MCP] Error creating calendar event:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Error al agendar reunión: ${error.message}`,
            }),
          },
        ],
      };
    }
  }

  /**
   * Valida un código de activación
   */
  async validarCodigoActivacion(args) {
    const { codigo_activacion } = args;

    try {
      const response = await fetch(`${WORKER_URL}/api/internal/activation-codes/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AGENT_API_KEY}`,
        },
        body: JSON.stringify({ code: codigo_activacion }),
      });

      const result = await response.json();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
            }),
          },
        ],
      };
    }
  }

  /**
   * Registra un nuevo contributor
   */
  async registrarContributor(args) {
    const { codigo_activacion, telefono, rut, nombre, clave_sii, password } = args;

    try {
      // Primero validar el código
      const validationResponse = await this.validarCodigoActivacion({ codigo_activacion });
      const validation = JSON.parse(validationResponse.content[0].text);

      if (!validation.valid) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: validation.error || 'Código de activación inválido',
              }),
            },
          ],
        };
      }

      // Registrar contributor
      const response = await fetch(`${WORKER_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rut,
          nombre,
          password,
          clave_sii,
          telefono,
          codigo_activacion,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: result.error || 'Error al registrar contributor',
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Contributor registrado exitosamente. RUT: ${rut}`,
              rut,
              nombre,
              telefono,
            }),
          },
        ],
      };
    } catch (error) {
      console.error('[MCP] Error registering contributor:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Error al registrar: ${error.message}`,
            }),
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('[MCP] Renata MCP Server running on stdio');
  }
}

// Iniciar servidor
const server = new RenataMCPServer();
server.run().catch(console.error);
