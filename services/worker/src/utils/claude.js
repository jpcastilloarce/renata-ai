/**
 * claude.js
 * Utilidad para llamar a Claude (Anthropic) con soporte para herramientas MCP
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Cliente MCP para conectarse al servidor MCP en el servicio de WhatsApp
 */
class MCPClient {
  constructor(mcpServerUrl, context = {}) {
    this.mcpServerUrl = mcpServerUrl;
    this.tools = [];
    this.context = context; // Contexto adicional (ej: telefono_whatsapp)
  }

  /**
   * Inicializa el cliente y obtiene las herramientas disponibles
   */
  async initialize() {
    try {
      const response = await fetch(`${this.mcpServerUrl}/tools`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('[MCP Client] Failed to fetch tools:', await response.text());
        return;
      }

      const data = await response.json();
      this.tools = data.tools || [];
      console.log(`[MCP Client] Loaded ${this.tools.length} tools from MCP server`);
    } catch (error) {
      console.error('[MCP Client] Error initializing:', error);
    }
  }

  /**
   * Ejecuta una herramienta MCP
   */
  async executeTool(toolName, toolInput) {
    try {
      // Para registrar_contributor, inyectar el telefono_whatsapp del contexto
      const finalInput = toolName === 'registrar_contributor' && this.context.telefono_whatsapp
        ? { ...toolInput, telefono_whatsapp: this.context.telefono_whatsapp }
        : toolInput;

      const response = await fetch(`${this.mcpServerUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: toolName,
          arguments: finalInput,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MCP Client] Tool execution failed: ${errorText}`);
        return {
          success: false,
          error: errorText,
        };
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error(`[MCP Client] Error executing tool ${toolName}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Obtiene las herramientas en formato compatible con Anthropic
   */
  getToolsForAnthropic() {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }
}

/**
 * Llama a Claude con soporte para herramientas MCP
 * @param {string} apiKey - Anthropic API Key
 * @param {Array} messages - Array de mensajes [{ role: 'user'|'assistant', content: string }]
 * @param {string} systemPrompt - System prompt
 * @param {MCPClient} mcpClient - Cliente MCP (opcional)
 * @param {number} maxIterations - Máximo número de iteraciones para tool use
 * @returns {Promise<string>} - Respuesta final de Claude
 */
export async function callClaude(apiKey, messages, systemPrompt, mcpClient = null, maxIterations = 5) {
  const client = new Anthropic({ apiKey });

  let currentMessages = [...messages];
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    const requestParams = {
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages: currentMessages,
    };

    // Si hay MCP client, agregar herramientas
    if (mcpClient && mcpClient.tools.length > 0) {
      requestParams.tools = mcpClient.getToolsForAnthropic();
    }

    console.log(`[Claude] Iteration ${iteration}, messages: ${currentMessages.length}`);

    const response = await client.messages.create(requestParams);

    console.log(`[Claude] Stop reason: ${response.stop_reason}`);

    // Agregar respuesta de Claude al historial
    currentMessages.push({
      role: 'assistant',
      content: response.content,
    });

    // Si Claude no está usando herramientas, retornar respuesta
    if (response.stop_reason === 'end_turn') {
      // Extraer texto de la respuesta
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
      return textContent;
    }

    // Si Claude quiere usar una herramienta
    if (response.stop_reason === 'tool_use') {
      if (!mcpClient) {
        throw new Error('Claude requested tool use but no MCP client available');
      }

      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

      // Ejecutar todas las herramientas solicitadas
      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        console.log(`[Claude] Using tool: ${toolUse.name}`, toolUse.input);

        const result = await mcpClient.executeTool(toolUse.name, toolUse.input);

        // Formatear resultado para Claude
        let toolResultContent;
        if (result.content && Array.isArray(result.content)) {
          // Resultado en formato MCP
          toolResultContent = result.content.map(c => c.text || JSON.stringify(c)).join('\n');
        } else {
          // Resultado simple
          toolResultContent = typeof result === 'string' ? result : JSON.stringify(result);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: toolResultContent,
        });

        console.log(`[Claude] Tool result:`, toolResultContent.substring(0, 200));
      }

      // Agregar resultados de herramientas al historial
      currentMessages.push({
        role: 'user',
        content: toolResults,
      });

      // Continuar el loop para que Claude procese los resultados
      continue;
    }

    // Si llegamos aquí con otro stop_reason, algo inesperado pasó
    console.warn(`[Claude] Unexpected stop reason: ${response.stop_reason}`);
    const textContent = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
    return textContent || 'Lo siento, ocurrió un error inesperado.';
  }

  // Si agotamos las iteraciones
  console.warn(`[Claude] Max iterations (${maxIterations}) reached`);
  return 'Lo siento, la conversación se volvió muy compleja. ¿Podrías reformular tu pregunta?';
}

/**
 * Crea un cliente MCP
 * @param {string} mcpServerUrl - URL del servidor MCP
 * @param {object} context - Contexto adicional (ej: telefono_whatsapp)
 * @returns {Promise<MCPClient>}
 */
export async function createMCPClient(mcpServerUrl, context = {}) {
  const client = new MCPClient(mcpServerUrl, context);
  await client.initialize();
  return client;
}
