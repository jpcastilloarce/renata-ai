import { Hono } from 'hono';
import { logEvent } from '../utils/logger.js';
import { callOpenAI } from '../utils/openai.js';

const router = new Hono();

/**
 * POST /api/contratos
 * Upload a PDF contract, store in R2, extract text and generate embeddings
 */
router.post('/', async (c) => {
  try {
    const rut = c.get('userRut');

    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'Se requiere un archivo (PDF o TXT)' }, 400);
    }

    // Generate unique file name
    const timestamp = Date.now();
    const fileName = `${rut}/contrato-${timestamp}.${file.type.includes('pdf') ? 'pdf' : 'txt'}`;

    // Upload to R2
    await c.env.CONTRACTS_BUCKET.put(fileName, file.stream());

    // Store metadata in D1
    const result = await c.env.DB.prepare(
      'INSERT INTO contratos (rut, file_name) VALUES (?, ?)'
    ).bind(rut, fileName).run();

    const contratoId = result.meta.last_row_id;

    // Extract text from file
    const fileText = await extractTextFromFile(file);

    // Split text into chunks for embedding
    const chunks = splitTextIntoChunks(fileText, 500); // 500 chars per chunk

    // Generate embeddings for each chunk
    for (const chunk of chunks) {
      // Generate embedding using Workers AI
      const embeddingResponse = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: chunk
      });

      const vector = embeddingResponse.data[0];

      // Store chunk in D1
      const embeddingResult = await c.env.DB.prepare(
        'INSERT INTO embeddings (contrato_id, content) VALUES (?, ?)'
      ).bind(contratoId, chunk).run();

      const embeddingId = embeddingResult.meta.last_row_id;

      // Store vector in Vectorize
      await c.env.CONTRATOS_INDEX.upsert([{
        id: `${embeddingId}`,
        values: vector,
        metadata: {
          rut,
          contratoId: contratoId.toString(),
          content: chunk
        }
      }]);
    }

    await logEvent(c.env.DB, rut, 'CONTRATO_UPLOAD', `Contrato ${fileName} procesado`);

    return c.json({
      contrato_id: contratoId,
      message: 'Contrato almacenado y procesado exitosamente.',
      chunks_processed: chunks.length
    }, 201);
  } catch (error) {
    console.error('Error uploading contract:', error);
    return c.json({ error: 'Error al procesar contrato' }, 500);
  }
});

/**
 * POST /api/ask
 * Ask a question using RAG over user's data (contracts and tax data)
 */
router.post('/ask', async (c) => {
  try {
    const rut = c.get('userRut');
    const { question } = await c.req.json();

    if (!question) {
      return c.json({ error: 'Se requiere una pregunta' }, 400);
    }

    // Determine question type and route accordingly
    const questionType = categorizeQuestion(question);

    let answer = '';

    if (questionType === 'ventas' || questionType === 'compras') {
      // Handle tax data questions
      answer = await handleTaxQuestion(c.env, rut, question, questionType);
    } else if (questionType === 'contrato' || questionType === 'general') {
      // Handle contract questions using RAG
      answer = await handleContractQuestion(c.env, rut, question);
    } else {
      answer = 'No pude determinar el tipo de pregunta. Por favor reformula tu consulta.';
    }

    // Store message in database
    await c.env.DB.prepare(
      'INSERT INTO messages (rut, sender, content) VALUES (?, ?, ?)'
    ).bind(rut, 'user', question).run();

    await c.env.DB.prepare(
      'INSERT INTO messages (rut, sender, content) VALUES (?, ?, ?)'
    ).bind(rut, 'agent', answer).run();

    return c.json({ respuesta: answer });
  } catch (error) {
    console.error('Error processing question:', error);
    return c.json({ error: 'Error al procesar pregunta' }, 500);
  }
});

// Helper functions

/**
 * Extract text from file (TXT or PDF)
 * For PDFs, this is simplified - in production use pdf.js or similar
 */
async function extractTextFromFile(file) {
  try {
    // Get file as text
    const text = await file.text();

    // If it's a text file or readable text, return it
    if (text && text.trim().length > 0) {
      return text;
    }

    // If we couldn't extract text, return error message
    return 'Error: No se pudo extraer texto del archivo. Por favor sube un archivo de texto o PDF con texto seleccionable.';
  } catch (error) {
    console.error('Error extracting text from file:', error);
    return 'Error: No se pudo extraer texto del archivo.';
  }
}

/**
 * Split text into chunks
 */
function splitTextIntoChunks(text, chunkSize = 500) {
  const chunks = [];
  const sentences = text.split(/[.!?]\s+/);

  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? '. ' : '') + sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());

  return chunks;
}

/**
 * Categorize question type
 */
function categorizeQuestion(question) {
  const lowerQuestion = question.toLowerCase();

  if (lowerQuestion.includes('vendí') || lowerQuestion.includes('venta') || lowerQuestion.includes('factur')) {
    return 'ventas';
  } else if (lowerQuestion.includes('compré') || lowerQuestion.includes('compra') || lowerQuestion.includes('proveedor')) {
    return 'compras';
  } else if (lowerQuestion.includes('contrato') || lowerQuestion.includes('cláusula') || lowerQuestion.includes('vigente')) {
    return 'contrato';
  }

  return 'general';
}

/**
 * Handle tax-related questions
 */
async function handleTaxQuestion(env, rut, question, type) {
  // Extract period from question (simplified)
  const months = {
    'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
    'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
    'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
  };

  let periodo = null;
  for (const [month, num] of Object.entries(months)) {
    if (question.toLowerCase().includes(month)) {
      const year = new Date().getFullYear();
      periodo = `${year}-${num}`;
      break;
    }
  }

  if (!periodo) {
    periodo = new Date().toISOString().slice(0, 7); // Current period
  }

  // Query database
  const table = type === 'ventas' ? 'ventas_resumen' : 'compras_resumen';
  const { results } = await env.DB.prepare(`
    SELECT SUM(rsmnMntTotal) as total
    FROM ${table}
    WHERE rut = ? AND periodo = ?
  `).bind(rut, periodo).all();

  if (results.length > 0 && results[0].total) {
    const total = results[0].total;
    const monthName = Object.keys(months).find(key => months[key] === periodo.split('-')[1]);
    return `En ${monthName} de ${periodo.split('-')[0]} ${type === 'ventas' ? 'vendiste' : 'compraste'} CLP ${total.toLocaleString('es-CL')}.`;
  }

  return `No encontré datos de ${type} para el período consultado.`;
}

/**
 * Handle contract-related questions using RAG
 */
async function handleContractQuestion(env, rut, question) {
  // Generate embedding for the question
  const questionEmbedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: question
  });

  const questionVector = questionEmbedding.data[0];

  // Search in Vectorize
  // No filter by RUT - contracts are generic SII data accessible to all contributors
  const searchResults = await env.CONTRATOS_INDEX.query(questionVector, {
    topK: 3,
    returnMetadata: true
  });

  if (!searchResults.matches || searchResults.matches.length === 0) {
    return 'No encontré información relevante en tus contratos para responder esta pregunta.';
  }

  // Get the text fragments
  const fragments = searchResults.matches.map(match => match.metadata.content);
  const context = fragments.join('\n\n');

  // Generate response using OpenAI
  const messages = [
    {
      role: 'system',
      content: `Eres un asistente que responde preguntas sobre contratos. Usa el siguiente contexto para responder la pregunta del usuario:\n\n${context}`
    },
    {
      role: 'user',
      content: question
    }
  ];

  const aiResponse = await callOpenAI(env.OPENAI_API_KEY, messages);

  return aiResponse || 'No pude generar una respuesta adecuada.';
}

export default router;
