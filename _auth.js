// Verificação de sessão compartilhada entre as funções da API.
// Usa um cookie assinado com HMAC (sem biblioteca externa e sem tabela
// de sessão no banco) — as senhas em si ficam só na variável de
// ambiente APP_USERS (agora como HASH, não texto puro), nunca no cookie.
// O cookie carrega apenas o nome de usuário e a validade, pra dar pra
// saber quem está logado.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE = 'fin_session';
const DIAS = 60;

// Hash "vazio" só pra gastar o mesmo tempo de CPU quando o usuário nem
// existe — evita que alguém descubra quais usuários são válidos medindo
// quanto tempo a resposta demora.
const HASH_FALSO = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO7Kb7B4qHwyu1IKzTC/9K1cPmyPY5.3G';

function segredo() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET não configurada nas variáveis de ambiente da Vercel.');
  return s;
}

function usuarios() {
  const raw = process.env.APP_USERS;
  if (!raw) throw new Error('APP_USERS não configurada nas variáveis de ambiente da Vercel.');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('APP_USERS precisa ser um JSON válido, tipo {"izaldo":"$2a$10$...","heloisa":"$2a$10$..."} (hashes gerados com scripts/gerar-hash.js, não a senha em texto puro).');
  }
}

// Agora é assíncrona: bcrypt.compare precisa recalcular o hash da senha
// digitada e comparar com o hash guardado.
async function verificarLogin(usuario, senha) {
  const mapa = usuarios();
  const chave = Object.keys(mapa).filter(function (u) { return u.toLowerCase() === String(usuario || '').toLowerCase(); })[0];
  if (!chave) {
    // usuário não existe: ainda assim roda um bcrypt.compare contra um
    // hash falso, pra gastar tempo parecido com o caso de usuário válido
    try { await bcrypt.compare(String(senha || ''), HASH_FALSO); } catch (e) {}
    return false;
  }
  const hashGuardado = mapa[chave];
  if (!hashGuardado || hashGuardado.indexOf('$2') !== 0) {
    // Proteção extra: se por engano ainda houver senha em texto puro no
    // APP_USERS (não começa com $2a$/$2b$, formato de hash bcrypt),
    // recusa o login em vez de comparar texto puro.
    throw new Error('APP_USERS contém uma senha que não parece ser um hash bcrypt. Gere o hash com scripts/gerar-hash.js e atualize a variável de ambiente.');
  }
  return bcrypt.compare(String(senha || ''), hashGuardado);
}

function assinar(exp, usuario) {
  const payload = exp + '|' + encodeURIComponent(usuario);
  const h = crypto.createHmac('sha256', segredo()).update(payload).digest('hex');
  return payload + '.' + h;
}

function valido(token) {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const assinatura = token.slice(i + 1);
  let esperado;
  try {
    esperado = crypto.createHmac('sha256', segredo()).update(payload).digest('hex');
  } catch (e) {
    return null;
  }
  if (assinatura.length !== esperado.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado))) return null;
  const partes = payload.split('|');
  const exp = parseInt(partes[0], 10);
  if (!exp || Date.now() >= exp) return null;
  return decodeURIComponent(partes.slice(1).join('|'));
}

function parseCookies(req) {
  if (req.cookies) return req.cookies;
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(function (p) {
    const idx = p.indexOf('=');
    if (idx < 0) return;
    out[p.slice(0, idx).trim()] = decodeURIComponent(p.slice(idx + 1).trim());
  });
  return out;
}

// Retorna o nome do usuário logado, ou null se não autenticado.
function autenticado(req) {
  return valido(parseCookies(req)[COOKIE]);
}

function exigirAuth(req, res) {
  if (!autenticado(req)) {
    res.status(401).json({ error: 'Não autenticado.' });
    return false;
  }
  return true;
}

function cookieLogin(usuario) {
  const exp = Date.now() + DIAS * 24 * 60 * 60 * 1000;
  const maxAge = DIAS * 24 * 60 * 60;
  return COOKIE + '=' + assinar(exp, usuario) + '; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge + '; Path=/';
}

function cookieLogout() {
  return COOKIE + '=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';
}

module.exports = { autenticado, exigirAuth, cookieLogin, cookieLogout, verificarLogin };
