const { cookieLogin } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }
  const senhaEsperada = process.env.APP_PASSWORD;
  if (!senhaEsperada) {
    res.status(500).json({ error: 'APP_PASSWORD não configurada nas variáveis de ambiente da Vercel.' });
    return;
  }
  const senha = (req.body && req.body.senha) || '';
  if (senha !== senhaEsperada) {
    res.status(401).json({ error: 'Senha incorreta.' });
    return;
  }
  res.setHeader('Set-Cookie', cookieLogin());
  res.status(200).json({ ok: true });
};
