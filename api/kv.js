// Armazenamento chave-valor no Postgres da Vercel — substitui o
// localStorage do navegador. Cada chamada espelha exatamente o que o
// app já esperava de window.storage (get/set/list/delete por chave ou
// prefixo), então o front-end não precisou mudar a lógica, só o
// transporte.
const { sql } = require('@vercel/postgres');
const { exigirAuth } = require('./_auth');

let tabelaPronta = false;
async function garantirTabela() {
  if (tabelaPronta) return;
  await sql`CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  tabelaPronta = true;
}

module.exports = async function handler(req, res) {
  if (!exigirAuth(req, res)) return;
  try {
    await garantirTabela();

    if (req.method === 'GET') {
      if (typeof req.query.prefix === 'string') {
        const prefixo = req.query.prefix.replace(/[\\%_]/g, '\\$&') + '%';
        const { rows } = await sql`SELECT key FROM kv WHERE key LIKE ${prefixo} ORDER BY key`;
        res.status(200).json({ keys: rows.map((r) => r.key) });
        return;
      }
      const key = req.query.key;
      if (!key) {
        res.status(400).json({ error: 'key ausente' });
        return;
      }
      const { rows } = await sql`SELECT value FROM kv WHERE key = ${key}`;
      if (!rows.length) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.status(200).json({ key, value: rows[0].value });
      return;
    }

    if (req.method === 'PUT') {
      const key = req.query.key;
      if (!key) {
        res.status(400).json({ error: 'key ausente' });
        return;
      }
      const valor = req.body && req.body.value;
      if (typeof valor !== 'string') {
        res.status(400).json({ error: 'value precisa ser string' });
        return;
      }
      if (valor.length > 2000000) {
        res.status(413).json({ error: 'Valor grande demais.' });
        return;
      }
      await sql`INSERT INTO kv (key, value, updated_at) VALUES (${key}, ${valor}, now())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const key = req.query.key;
      if (!key) {
        res.status(400).json({ error: 'key ausente' });
        return;
      }
      await sql`DELETE FROM kv WHERE key = ${key}`;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
