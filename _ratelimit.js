// Limite de tentativas de login — evita força bruta na senha.
// Guarda os contadores no mesmo Postgres que o app já usa (tabela nova,
// "login_attempts"), sem precisar de nenhum serviço externo.
const { sql } = require('@vercel/postgres');

const JANELA_MIN = 15;     // janela de tempo considerada, em minutos
const MAX_TENTATIVAS = 5;  // tentativas erradas permitidas dentro da janela
const BLOQUEIO_MIN = 15;   // tempo de bloqueio depois de estourar o limite

let tabelaPronta = false;
async function garantirTabela() {
  if (tabelaPronta) return;
  await sql`CREATE TABLE IF NOT EXISTS login_attempts (
    chave TEXT PRIMARY KEY,
    tentativas INTEGER NOT NULL DEFAULT 0,
    primeira_tentativa TIMESTAMPTZ NOT NULL DEFAULT now(),
    bloqueado_ate TIMESTAMPTZ
  )`;
  tabelaPronta = true;
}

function ipDoPedido(req) {
  const xf = req.headers && req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

function chaveDoPedido(req, usuario) {
  // Combina IP + usuário tentado: barra força bruta num usuário só, sem
  // travar todo mundo se várias pessoas usarem a mesma rede (ex: wifi de
  // escritório) tentando usuários diferentes.
  return ipDoPedido(req) + '|' + String(usuario || '').toLowerCase();
}

// Retorna null se pode tentar logar, ou a Date até quando está bloqueado.
async function verificarBloqueio(req, usuario) {
  await garantirTabela();
  const chave = chaveDoPedido(req, usuario);
  const { rows } = await sql`SELECT * FROM login_attempts WHERE chave = ${chave}`;
  if (!rows.length) return null;
  const row = rows[0];
  if (row.bloqueado_ate && new Date(row.bloqueado_ate) > new Date()) {
    return new Date(row.bloqueado_ate);
  }
  return null;
}

async function registrarFalha(req, usuario) {
  await garantirTabela();
  const chave = chaveDoPedido(req, usuario);
  const agora = new Date();
  const { rows } = await sql`SELECT * FROM login_attempts WHERE chave = ${chave}`;

  if (!rows.length) {
    await sql`INSERT INTO login_attempts (chave, tentativas, primeira_tentativa)
              VALUES (${chave}, 1, ${agora.toISOString()})`;
    return;
  }

  const row = rows[0];
  const janelaExpirou = (agora.getTime() - new Date(row.primeira_tentativa).getTime()) > JANELA_MIN * 60 * 1000;

  if (janelaExpirou) {
    await sql`UPDATE login_attempts
              SET tentativas = 1, primeira_tentativa = ${agora.toISOString()}, bloqueado_ate = NULL
              WHERE chave = ${chave}`;
    return;
  }

  const novasTentativas = row.tentativas + 1;
  if (novasTentativas >= MAX_TENTATIVAS) {
    const bloqueadoAte = new Date(agora.getTime() + BLOQUEIO_MIN * 60 * 1000);
    await sql`UPDATE login_attempts SET tentativas = ${novasTentativas}, bloqueado_ate = ${bloqueadoAte.toISOString()} WHERE chave = ${chave}`;
  } else {
    await sql`UPDATE login_attempts SET tentativas = ${novasTentativas} WHERE chave = ${chave}`;
  }
}

async function registrarSucesso(req, usuario) {
  await garantirTabela();
  const chave = chaveDoPedido(req, usuario);
  await sql`DELETE FROM login_attempts WHERE chave = ${chave}`;
}

module.exports = { verificarBloqueio, registrarFalha, registrarSucesso };
