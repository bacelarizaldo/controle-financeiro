const { autenticado, loginObrigatorio } = require('./_auth');

module.exports = async function handler(req, res) {
  let usuario = null;
  try { usuario = autenticado(req); } catch (e) { usuario = null; }
  if (!loginObrigatorio()) { res.status(200).json({ ok: true, usuario, livre: true }); return; }
  if (usuario) res.status(200).json({ ok: true, usuario });
  else res.status(401).json({ ok: false });
};
