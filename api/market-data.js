// Dados de mercado para a aba Investimentos.
// - CDI, Selic e IPCA: série mensal direto do Banco Central (SGS),
//   pública, sem chave. CDI = série 4391, Selic = série 4390 (% ao mês
//   acumulado), IPCA = série 433 (% de variação no mês, do IBGE).
// - Tesouro Direto: preço unitário (PU) de compra/resgate do dia, via o
//   dataset público oficial do Tesouro Transparente (CKAN, mantido pelo
//   governo) — gratuito, sem chave, sem plano pago. É o dado de marcação
//   a mercado real (o que você receberia resgatando hoje). O arquivo tem
//   o histórico completo desde 2004 (~13 MB), então baixamos e filtramos
//   só a data mais recente que aparecer nele.
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

// O plano gratuito da brapi.dev só permite 1 ativo por chamada (lote de
// vários juntos só é liberado a partir do plano Startup, pago) — então
// buscamos um ticker de cada vez. Se um ticker falhar (nome errado, por
// exemplo), os outros continuam funcionando normalmente.
async function buscarAcoes(tickers, token) {
  const out = {};
  const falhas = [];
  for (const ticker of tickers) {
    const url = 'https://brapi.dev/api/quote/' + encodeURIComponent(ticker) + (token ? '?token=' + encodeURIComponent(token) : '');
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok || data.error || !(data.results && data.results.length)) {
        falhas.push(ticker + ': ' + ((data && data.message) || ('HTTP ' + resp.status)));
        continue;
      }
      const r = data.results[0];
      out[r.symbol] = {
        preco: r.regularMarketPrice,
        nome: r.shortName || r.longName || r.symbol,
        variacaoPercent: typeof r.regularMarketChangePercent === 'number' ? r.regularMarketChangePercent : null,
        atualizadoEm: new Date().toISOString()
      };
    } catch (e) {
      falhas.push(ticker + ': falha de rede');
    }
  }
  if (!Object.keys(out).length && falhas.length) {
    throw new Error(falhas.join(' · '));
  }
  return out;
}

// Lista de títulos do Tesouro Direto com preço unitário do dia — fonte
// oficial: dataset público do Tesouro Transparente (governo federal).
// O arquivo traz o histórico completo desde 2004; filtramos só as linhas
// da data mais recente presente no arquivo (a "foto" de hoje).
const CSV_TESOURO_URL = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv';

function paraNumeroBR(s) {
  if (s == null || s === '') return null;
  const v = parseFloat(String(s).trim().replace(',', '.'));
  return isNaN(v) ? null : v;
}
// 'dd/mm/aaaa' -> inteiro aaaammdd, pra comparar datas como número
function chaveData(dd_mm_yyyy) {
  const p = String(dd_mm_yyyy || '').trim().split('/');
  if (p.length !== 3) return 0;
  return parseInt(p[2] + p[1].padStart(2, '0') + p[0].padStart(2, '0'), 10);
}
// 'dd/mm/aaaa' -> 'aaaa-mm-dd', pro mesmo formato usado no resto do app
function dataISO(dd_mm_yyyy) {
  const p = String(dd_mm_yyyy || '').trim().split('/');
  return p.length === 3 ? (p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0')) : '';
}

async function buscarTesouroDireto() {
  const resp = await fetch(CSV_TESOURO_URL);
  if (!resp.ok) throw new Error('Tesouro Transparente respondeu ' + resp.status + '.');
  const texto = await resp.text();
  const linhas = texto.split(/\r\n|\n/);

  const parsedas = [];
  let maxChave = 0;
  // linha 0 é cabeçalho (Produto;Vencimento;Data Base;Taxa Compra Manha;
  // Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha)
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!l) continue;
    const c = l.split(';');
    if (c.length < 7) continue;
    const chave = chaveData(c[2]);
    if (chave > maxChave) maxChave = chave;
    parsedas.push({
      produto: (c[0] || '').trim(),
      vencimento: (c[1] || '').trim(),
      chaveData: chave,
      taxaCompra: paraNumeroBR(c[3]),
      taxaVenda: paraNumeroBR(c[4]),
      puCompra: paraNumeroBR(c[5]),
      puVenda: paraNumeroBR(c[6])
    });
  }
  if (!maxChave) throw new Error('Não consegui achar nenhuma linha com data válida no CSV do Tesouro Transparente.');

  return parsedas
    .filter(function (r) { return r.chaveData === maxChave; })
    .map(function (r) {
      return {
        nome: r.produto,
        vencimento: dataISO(r.vencimento),
        precoCompra: r.puCompra,   // preço pra comprar hoje
        precoResgate: r.puVenda,   // preço que você recebe resgatando hoje
        taxaCompra: r.taxaCompra,
        taxaResgate: r.taxaVenda
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

    if (tipo === 'cdi' || tipo === 'selic' || tipo === 'ipca') {
      const codigo = tipo === 'cdi' ? 4391 : (tipo === 'selic' ? 4390 : 433);
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
      const lista = await doCache('tesouro:lista', 12 * 60 * 60 * 1000, buscarTesouroDireto);
      res.status(200).json({ tipo: 'tesouro', titulos: lista });
      return;
    }

    res.status(400).json({ error: 'Parâmetro "tipo" inválido — use cdi, selic, ipca, tesouro ou acao.' });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
