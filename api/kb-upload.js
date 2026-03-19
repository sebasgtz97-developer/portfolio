const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Extract text from PDF using Claude vision
async function extractPdfText(base64Content, filename) {
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Content,
            },
            title: filename,
          },
          {
            type: 'text',
            text: 'Extrae TODO el texto de este documento de forma fiel y completa. Mantén la estructura del documento lo mejor posible (títulos, listas, tablas). Devuelve SOLO el texto extraído, sin comentarios adicionales.',
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { filename, content, mimeType } = req.body || {};

  if (!filename || !content) {
    return res.status(400).json({ error: 'Missing filename or content' });
  }

  // Validate size (base64 of 20MB file ≈ 27MB string)
  if (content.length > 28 * 1024 * 1024) {
    return res.status(413).json({ error: 'File too large' });
  }

  try {
    let text = '';

    if (mimeType === 'application/pdf') {
      text = await extractPdfText(content, filename);
    } else {
      // For text files sent as base64 (fallback), decode them
      try {
        text = Buffer.from(content, 'base64').toString('utf-8');
      } catch {
        text = content;
      }
    }

    if (!text.trim()) {
      return res.status(422).json({ error: 'No se pudo extraer texto del documento' });
    }

    res.status(200).json({ text, filename });
  } catch (err) {
    console.error('[kb-upload]', err.message);

    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Demasiadas solicitudes, intenta de nuevo en un momento' });
    }

    res.status(500).json({ error: 'Error al procesar el documento: ' + err.message });
  }
};
