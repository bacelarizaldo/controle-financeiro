const { cookieLogin, verificarLogin } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }
  const usuario = (req.body && req.body.usuario) || '';
  const senha = (req.body && req.body.senha) || '';
  if (!usuario || !senha) {
    res.status(400).json({ error: 'Preencha usuário e senha.' });
    return;
  }
  let ok;
  try {
    ok = verificarLogin(usuario, senha);
  } catch (e) {
    res.status(500).json({ error: e.message });
    return;
  }
  if (!ok) {
    res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    return;
  }
  res.setHeader('Set-Cookie', cookieLogin(usuario));
  res.status(200).json({ ok: true, usuario });
};
