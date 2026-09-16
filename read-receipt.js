// Função serverless da Vercel — roda no servidor, nunca no navegador.
// Recebe o conteúdo (imagem/texto) que o app monta no cliente e repassa
// para a API da Anthropic usando a chave guardada em variável de ambiente.
// A chave NUNCA é exposta ao navegador.
const { exigirAuth } = require('./_auth');

// ~500 mil caracteres dá folga de sobra pra um print/base64 normal, mas
// barra alguém (ou um cookie vazado) de mandar payloads gigantes e gerar
// custo alto de API sem limite nenhum.
const LIMITE_CARACTERES = 500000;

module.exports = async function handler(req, res) {
  if (!exigirAuth(req, res)) return;
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

    const tamanho = JSON.stringify(content).length;
    if (tamanho > LIMITE_CARACTERES) {
      res.status(413).json({ error: 'Conteúdo muito grande. Envie um print menor ou um texto mais curto.' });
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
