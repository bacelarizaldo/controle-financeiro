// Verificação de sessão compartilhada entre as funções da API.
// Usa um cookie assinado com HMAC (sem biblioteca externa e sem tabela
// de sessão no banco) — as senhas em si ficam só na variável de
// ambiente APP_USERS, nunca no cookie. O cookie carrega apenas o nome
// de usuário e a validade, pra dar pra saber quem está logado.
const crypto = require('crypto');

const COOKIE = 'fin_session';
const DIAS = 60;

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
    throw new Error('APP_USERS precisa ser um JSON válido, tipo {"izaldo":"senha1","heloisa":"senha2"}.');
  }
}

function verificarLogin(usuario, senha) {
  const mapa = usuarios();
  const chave = Object.keys(mapa).filter(function (u) { return u.toLowerCase() === String(usuario || '').toLowerCase(); })[0];
  if (!chave) return false;
  return mapa[chave] === senha;
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
