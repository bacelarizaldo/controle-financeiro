// Função serverless da Vercel — roda no servidor, nunca no navegador.
// Recebe o conteúdo (imagem/texto) que o app monta no cliente e repassa
// para a API da Anthropic usando a chave guardada em variável de ambiente.
// A chave NUNCA é exposta ao navegador.

module.exports = async function handler(req, res) {
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
    if (!content) {
      res.status(400).json({ error: 'Conteúdo ausente na requisição.' });
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
        max_tokens: 1000,
        messages: [{ role: 'user', content: content }]
      })
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
