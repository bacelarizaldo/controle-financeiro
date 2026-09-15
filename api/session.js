const { autenticado } = require('./_auth');

module.exports = async function handler(req, res) {
  const usuario = autenticado(req);
  if (usuario) res.status(200).json({ ok: true, usuario });
  else res.status(401).json({ ok: false });
};
