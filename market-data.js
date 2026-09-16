// Dados de mercado para a aba Investimentos.
// - CDI e Selic: série mensal acumulada direto do Banco Central (SGS),
//   pública, sem chave. CDI = série 4391, Selic = série 4390 (% ao mês).
// - Tesouro Direto: preço unitário (PU) de compra/resgate do dia, via o
//   próprio JSON público que o site tesourodireto.com.br usa — gratuito,
//   sem chave, sem precisar de plano pago. É o dado de marcação a mercado
//   real (o que você receberia resgatando hoje).
// - Ações: cotação via brapi.dev. PETR4/MGLU3/VALE3/ITUB4 funcionam sem
//   token; qualquer outro ticker precisa da variável BRAPI_TOKEN.
// Tudo fica em cache no mesmo Postgres do app, pra não bater na API
// externa a cada clique.
const { sql } = require('@vercel/postgres');
const { exigirAuth } = require('./_auth');

let tabelaPronta = false;
async function garantirTabela() {
  if (tabelaPronta) return;
  await sql`CREATE TABLE IF NOT EXISTS market_cache (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  tabelaPronta = true;
}

async function doCache(chave, ttlMs, buscar) {
  await garantirTabela();
  const { rows } = await sql`SELECT valor, atualizado_em FROM market_cache WHERE chave = ${chave}`;
  if (rows.length) {
    const idade = Date.now() - new Date(rows[0].atualizado_em).getTime();
    if (idade < ttlMs) return JSON.parse(rows[0].valor);
  }
  const dado = await buscar();
  const json = JSON.stringify(dado);
  await sql`INSERT INTO market_cache (chave, valor, atualizado_em) VALUES (${chave}, ${json}, now())
            ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`;
  return dado;
}

// Série mensal acumulada (% a.m.) do BCB SGS. codigo: 4391 = CDI, 4390 = Selic.
async function buscarSerieBCB(codigo, desde) {
  let url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + codigo + '/dados?formato=json';
  if (desde) {
    const p = String(desde).split('-'); // desde = 'AAAA-MM-DD'
    if (p.length === 3) url += '&dataInicial=' + p[2] + '/' + p[1] + '/' + p[0];
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Banco Central respondeu ' + resp.status + ' ao consultar a série ' + codigo + '.');
  const dados = await resp.json();
  return dados.map(function (d) {
    const partes = String(d.data).split('/'); // 'dd/mm/aaaa'
    return { mes: partes[2] + '-' + partes[1], taxa: parseFloat(String(d.valor).replace(',', '.')) };
  });
}

async function buscarAcoes(tickers, token) {
  const url = 'https://brapi.dev/api/quote/' + tickers.join(',') + (token ? '?token=' + encodeURIComponent(token) : '');
  const resp = await fetch(url);
  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error((data && data.message) || ('brapi.dev respondeu ' + resp.status + '. Tickers fora de PETR4/MGLU3/VALE3/ITUB4 exigem BRAPI_TOKEN configurado na Vercel.'));
  }
  const out = {};
  (data.results || []).forEach(function (r) {
    out[r.symbol] = {
      preco: r.regularMarketPrice,
      nome: r.shortName || r.longName || r.symbol,
      variacaoPercent: typeof r.regularMarketChangePercent === 'number' ? r.regularMarketChangePercent : null,
      atualizadoEm: new Date().toISOString()
    };
  });
  return out;
}

// Lista de títulos do Tesouro Direto com preço unitário do dia — fonte
// oficial pública, mesmo JSON que o site tesourodireto.com.br consome.
async function buscarTesouroDireto() {
  const resp = await fetch('https://www.tesourodireto.com.br/json/br/com/b3/tesourodireto/service/api/treasurybondsinfo.json');
  if (!resp.ok) throw new Error('Tesouro Direto respondeu ' + resp.status + '.');
  const data = await resp.json();
  const lista = (data.response && data.response.TrsrBdTradgList) || [];
  return lista.map(function (item) {
    const b = item.TrsrBd || {};
    return {
      nome: b.nm || '',
      vencimento: String(b.mtrtyDt || '').slice(0, 10),
      precoCompra: b.untrInvstmtVal,
      precoResgate: b.untrRedVal,
      taxaCompra: b.anulInvstmtRate,
      taxaResgate: b.anulRedRate
    };
  });
}

module.exports = async function handler(req, res) {
  if (!exigirAuth(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  try {
    const tipo = req.query.tipo;

    if (tipo === 'cdi' || tipo === 'selic') {
      const codigo = tipo === 'cdi' ? 4391 : 4390;
      const desde = req.query.desde || null;
      const chave = 'sgs:' + codigo + ':' + (desde || 'full');
      const serie = await doCache(chave, 12 * 60 * 60 * 1000, function () { return buscarSerieBCB(codigo, desde); });
      res.status(200).json({ tipo: tipo, serie: serie });
      return;
    }

    if (tipo === 'acao') {
      const lista = String(req.query.ticker || '')
        .split(',').map(function (t) { return t.trim().toUpperCase(); }).filter(Boolean);
      if (!lista.length) {
        res.status(400).json({ error: 'Informe pelo menos um ticker.' });
        return;
      }
      const token = process.env.BRAPI_TOKEN;
      const chave = 'acoes:' + lista.slice().sort().join(',');
      const cotacoes = await doCache(chave, 30 * 60 * 1000, function () { return buscarAcoes(lista, token); });
      res.status(200).json({ tipo: 'acao', cotacoes: cotacoes });
      return;
    }

    if (tipo === 'tesouro') {
      const lista = await doCache('tesouro:lista', 60 * 60 * 1000, buscarTesouroDireto);
      res.status(200).json({ tipo: 'tesouro', titulos: lista });
      return;
    }

    res.status(400).json({ error: 'Parâmetro "tipo" inválido — use cdi, selic, tesouro ou acao.' });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
