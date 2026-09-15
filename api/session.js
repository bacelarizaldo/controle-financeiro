const { autenticado } = require('./_auth');

module.exports = async function handler(req, res) {
  if (autenticado(req)) res.status(200).json({ ok: true });
  else res.status(401).json({ ok: false });
};
