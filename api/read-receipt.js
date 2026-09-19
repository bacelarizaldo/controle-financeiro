// Função serverless da Vercel — roda no servidor, nunca no navegador.
// Recebe o conteúdo (imagem/texto) que o app monta no cliente e repassa
// para a API da Anthropic usando a chave guardada em variável de ambiente.
// A chave NUNCA é exposta ao navegador.
const { exigirAuth } = require('./_auth');

module.exports = async function handler(req, res) {
  if (!exigirAuth(req, res)) return;
  // A resposta pode conter informação financeira extraída da fatura; não cachear.
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'ANTHROPIC_API_KEY não configurada nas variáveis de ambiente da Vercel.'
    });
    return;
  }

  try {
    const { content } = req.body || {};
    if (!Array.isArray(content) || !content.length) {
      res.status(400).json({ error: 'Conteúdo ausente na requisição.' });
      return;
    }

    // O cliente envia apenas uma imagem já comprimida por vez. A rota não
    // grava arquivo nem base64: o conteúdo existe só nesta requisição.
    const imagens = content.filter((item) => item && item.type === 'image');
    const bytesImagem = imagens.reduce((total, item) => total + String(item.source && item.source.data || '').length, 0);
    if (imagens.length > 1 || bytesImagem > 2200000) {
      res.status(413).json({ error: 'Imagem muito grande. Envie um print por vez.' });
      return;
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: content }]
      })
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
