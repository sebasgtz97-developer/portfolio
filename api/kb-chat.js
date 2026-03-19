const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Static knowledge base from env var (admin can set this in Vercel dashboard)
const STATIC_KB = process.env.KNOWLEDGE_BASE_CONTENT || '';

const SYSTEM_PROMPT = `Eres un asistente de conocimiento interno para los trabajadores de la empresa.
Tu función es responder preguntas de manera clara, precisa y útil, basándote SIEMPRE en los documentos proporcionados.

Reglas importantes:
- Responde ÚNICAMENTE con información que esté en los documentos disponibles
- Si la información no está en los documentos, dilo claramente: "No encontré información sobre eso en los documentos disponibles"
- Sé conciso y directo, pero completo
- Usa un tono profesional y amigable
- Si hay procedimientos o pasos, preséntanos de forma ordenada
- Responde siempre en español

${STATIC_KB ? `\n## Base de conocimiento de la empresa:\n${STATIC_KB}` : ''}`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history = [], docsContext = '' } = req.body || {};

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing message' });
  }

  // Build system prompt with documents
  let systemPrompt = SYSTEM_PROMPT;
  if (docsContext && docsContext.trim()) {
    systemPrompt += `\n\n## Documentos subidos en esta sesión:\n${docsContext}`;
  }

  // Build messages array
  const messages = [];

  // Add conversation history (last 10 turns)
  for (const turn of history.slice(-10)) {
    if (turn.role === 'user' || turn.role === 'assistant') {
      messages.push({ role: turn.role, content: String(turn.content) });
    }
  }

  // If the last message in history is already the current one, don't add it again
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== message) {
    messages.push({ role: 'user', content: message });
  }

  // Set streaming headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        const delta = event.delta.text;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[kb-chat]', err.message);

    if (err instanceof Anthropic.RateLimitError) {
      res.write(`data: ${JSON.stringify({ delta: 'Demasiadas solicitudes. Por favor espera un momento e intenta de nuevo.' })}\n\n`);
    } else if (err instanceof Anthropic.AuthenticationError) {
      res.write(`data: ${JSON.stringify({ delta: 'Error de configuración del servidor. Contacta al administrador.' })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ delta: 'Ocurrió un error inesperado. Por favor intenta de nuevo.' })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  }
};
