/**
 * Funciones del servidor MCP separadas para uso HTTP
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const WORKER_URL = process.env.WORKER_API_URL || 'http://localhost:8787';
const AGENT_API_KEY = process.env.AGENT_API_KEY;

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

let auth = null;
let calendar = null;

// Inicializar Google Calendar
try {
  if (GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY) {
    auth = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    calendar = google.calendar({ version: 'v3', auth });
    console.log('[MCP Functions] Google Calendar initialized');
  } else {
    console.warn('[MCP Functions] Google Calendar credentials not configured');
  }
} catch (error) {
  console.error('[MCP Functions] Error initializing Google Calendar:', error);
}

/**
 * Agenda una reunión en Google Calendar
 */
async function agendarReunion(args) {
  const { telefono, nombre_prospecto, email_prospecto, fecha, hora, notas } = args;

  if (!calendar) {
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

  try {
    const startDateTime = `${fecha}T${hora}:00-03:00`;
    const endDateTime = new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString();

    const event = {
      summary: `Reunión de Ventas - ${nombre_prospecto}`,
      description: `Reunión con prospecto: ${nombre_prospecto}${telefono ? `\nTeléfono: ${telefono}` : ''}${email_prospecto ? `\nEmail: ${email_prospecto}` : ''}\n${notas ? `\nNotas: ${notas}` : ''}`,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Santiago',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Santiago',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    // Intentar crear con Google Meet
    let response;
    try {
      event.conferenceData = {
        createRequest: {
          requestId: `renata-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      };

      response = await calendar.events.insert({
        calendarId: GOOGLE_CALENDAR_ID,
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'none',
      });
    } catch (meetError) {
      console.warn('[MCP] No se pudo crear Google Meet, creando evento sin conferencia:', meetError.message);
      // Si falla, crear sin Google Meet
      delete event.conferenceData;
      response = await calendar.events.insert({
        calendarId: GOOGLE_CALENDAR_ID,
        resource: event,
        sendUpdates: 'none',
      });
    }

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
async function validarCodigoActivacion(args) {
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
async function registrarContributor(args) {
  const { codigo_activacion, telefono, rut, nombre, clave_sii, password, telefono_whatsapp } = args;

  try {
    // Primero validar el código
    const validationResponse = await validarCodigoActivacion({ codigo_activacion });
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
    const response = await fetch(`${WORKER_URL}/api/register`, {
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
        telefono_whatsapp, // Teléfono desde el cual se está registrando (para auto-verificar)
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

/**
 * Ejecuta una herramienta por nombre
 */
export async function executeTool(name, args) {
  console.log(`[MCP Functions] Executing tool: ${name}`, args);

  switch (name) {
    case 'agendar_reunion':
      return await agendarReunion(args);
    case 'registrar_contributor':
      return await registrarContributor(args);
    case 'validar_codigo_activacion':
      return await validarCodigoActivacion(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
