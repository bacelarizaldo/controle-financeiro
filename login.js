const { cookieLogin, verificarLogin } = require('./_auth');
const { verificarBloqueio, registrarFalha, registrarSucesso } = require('./_ratelimit');

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

  try {
    const bloqueadoAte = await verificarBloqueio(req, usuario);
    if (bloqueadoAte) {
      const minutos = Math.max(1, Math.ceil((bloqueadoAte.getTime() - Date.now()) / 60000));
      res.status(429).json({ error: 'Muitas tentativas erradas. Tente de novo em ' + minutos + ' minuto(s).' });
      return;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
    return;
  }

  let ok;
  try {
    ok = await verificarLogin(usuario, senha);
  } catch (e) {
    res.status(500).json({ error: e.message });
    return;
  }

  if (!ok) {
    try { await registrarFalha(req, usuario); } catch (e) { /* não deixa o rate limit quebrar a resposta de erro */ }
    res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    return;
  }

  try { await registrarSucesso(req, usuario); } catch (e) { /* login já foi validado, segue mesmo se a limpeza falhar */ }
  res.setHeader('Set-Cookie', cookieLogin(usuario));
  res.status(200).json({ ok: true, usuario });
};
