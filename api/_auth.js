// Verificação de sessão compartilhada entre as funções da API.
// Usa um cookie assinado com HMAC (sem biblioteca externa e sem tabela
// de sessão no banco) — a senha em si fica só na variável de ambiente
// APP_PASSWORD, nunca no cookie.
const crypto = require('crypto');

const COOKIE = 'fin_session';
const DIAS = 60;

function segredo() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET não configurada nas variáveis de ambiente da Vercel.');
  return s;
}

function assinar(exp) {
  const payload = String(exp);
  const h = crypto.createHmac('sha256', segredo()).update(payload).digest('hex');
  return payload + '.' + h;
}

function valido(token) {
  if (!token) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const assinatura = token.slice(i + 1);
  let esperado;
  try {
    esperado = crypto.createHmac('sha256', segredo()).update(payload).digest('hex');
  } catch (e) {
    return false;
  }
  if (assinatura.length !== esperado.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado))) return false;
  const exp = parseInt(payload, 10);
  return !!exp && Date.now() < exp;
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

function cookieLogin() {
  const exp = Date.now() + DIAS * 24 * 60 * 60 * 1000;
  const maxAge = DIAS * 24 * 60 * 60;
  return COOKIE + '=' + assinar(exp) + '; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge + '; Path=/';
}

function cookieLogout() {
  return COOKIE + '=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';
}

module.exports = { autenticado, exigirAuth, cookieLogin, cookieLogout };
