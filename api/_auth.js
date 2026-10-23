// Verificação de sessão compartilhada entre as funções da API.
// Usa um cookie assinado com HMAC (sem biblioteca externa e sem tabela
// de sessão no banco) — as senhas em si ficam só na variável de
// ambiente APP_USERS (agora como HASH, não texto puro), nunca no cookie.
// O cookie carrega apenas o nome de usuário e a validade, pra dar pra
// saber quem está logado.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE = 'fin_session';
const DIAS_LEMBRAR = 60;   // sessão longa, só quando a pessoa marca "lembrar de mim"
const HORAS_PADRAO = 12;   // sessão curta (padrão): expira sozinha, mesmo sem fechar o app

// Hash "vazio" só pra gastar o mesmo tempo de CPU quando o usuário nem
// existe — evita que alguém descubra quais usuários são válidos medindo
// quanto tempo a resposta demora.
const HASH_FALSO = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO7Kb7B4qHwyu1IKzTC/9K1cPmyPY5.3G';

// Login desligado: o app abre direto, sem senha, para qualquer pessoa com o
// link. Para voltar a exigir login, crie na Vercel a variável de ambiente
// EXIGIR_LOGIN com o valor 1 e faça redeploy — nada no código precisa mudar.
function loginObrigatorio() {
  return process.env.EXIGIR_LOGIN === '1';
}

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
  if (!hashGuardado) return false;
  if (String(hashGuardado).indexOf('$2') !== 0) {
    // Transição: APP_USERS ainda com senha em texto puro (não começa com
    // $2a$/$2b$, formato bcrypt). Aceita por enquanto para ninguém ficar
    // trancado fora, mas avisa no log. Depois de trocar todas as senhas
    // por hashes (scripts/gerar-hash.js), defina SENHA_SO_HASH=1 na Vercel
    // para recusar texto puro de vez.
    if (process.env.SENHA_SO_HASH === '1') {
      throw new Error('APP_USERS contém uma senha que não parece ser um hash bcrypt. Gere o hash com scripts/gerar-hash.js e atualize a variável de ambiente.');
    }
    console.warn('APP_USERS: senha em texto puro para "' + chave + '"; troque pelo hash gerado com scripts/gerar-hash.js.');
    try { await bcrypt.compare(String(senha || ''), HASH_FALSO); } catch (e) {}
    const a = crypto.createHash('sha256').update(String(hashGuardado)).digest();
    const b = crypto.createHash('sha256').update(String(senha || '')).digest();
    return crypto.timingSafeEqual(a, b);
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
  if (!loginObrigatorio()) return true;
  if (!autenticado(req)) {
    res.status(401).json({ error: 'Não autenticado.' });
    return false;
  }
  return true;
}

// lembrar=true: cookie persistente de 60 dias (Max-Age), como antes.
// lembrar=false (padrão): cookie de SESSÃO — sem Max-Age, então o
// navegador o apaga ao fechar de verdade — e o token em si expira em
// 12h mesmo que o navegador/PWA mantenha o cookie vivo além disso. É
// esse o "ciclo de login" pedido: sem marcar lembrar, a sessão não dura
// pra sempre só por manter o app aberto/instalado.
function cookieLogin(usuario, lembrar) {
  const ms = lembrar ? DIAS_LEMBRAR * 24 * 60 * 60 * 1000 : HORAS_PADRAO * 60 * 60 * 1000;
  const exp = Date.now() + ms;
  let cookie = COOKIE + '=' + assinar(exp, usuario) + '; HttpOnly; Secure; SameSite=Lax; Path=/';
  if (lembrar) cookie += '; Max-Age=' + Math.floor(ms / 1000);
  return cookie;
}

function cookieLogout() {
  return COOKIE + '=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/';
}

module.exports = { autenticado, exigirAuth, loginObrigatorio, cookieLogin, cookieLogout, verificarLogin };
