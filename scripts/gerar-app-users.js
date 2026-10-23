// Monta o valor completo da variável APP_USERS (todos os usuários, cada um
// com o hash bcrypt da senha), pronto para colar na Vercel.
//
// Uso (no terminal, dentro da pasta do projeto, com `npm install` feito):
//
//   node scripts/gerar-app-users.js
//
// Pergunta o usuário (aparece na tela) e a senha (não aparece e não fica no
// histórico do terminal) de cada pessoa. No fim imprime uma linha só, tipo
// {"heloisa":"$2a$10$...","izaldo":"$2a$10$..."}.
const bcrypt = require('bcryptjs');

const entrada = process.stdin;
entrada.setEncoding('utf8');

// Lê uma linha; com `oculto`, o que é digitado não aparece na tela.
function perguntar(texto, oculto) {
  return new Promise(function (resolve) {
    process.stdout.write(texto);
    entrada.setRawMode(true);
    entrada.resume();
    let valor = '';
    entrada.on('data', function aoDigitar(pedaco) {
      for (const ch of pedaco) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.removeListener('data', aoDigitar);
          process.stdout.write('\n');
          resolve(valor);
          return;
        } else if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(1);
        } else if (ch === '\u007f') {
          if (valor && !oculto) process.stdout.write('\b \b');
          valor = valor.slice(0, -1);
        } else {
          valor += ch;
          if (!oculto) process.stdout.write(ch);
        }
      }
    });
  });
}

(async function () {
  const usuarios = {};
  console.log('Digite o usuário e a senha de cada pessoa, do jeito que vocês usam para entrar no app.\n');
  for (;;) {
    const usuario = (await perguntar('Usuário: ', false)).trim();
    if (!usuario) { console.log('Usuário vazio, tente de novo.'); continue; }
    const senha = await perguntar('Senha (não aparece na tela): ', true);
    const confirmacao = await perguntar('Repita a senha: ', true);
    if (!senha || senha !== confirmacao) { console.log('As senhas não conferem. Vamos de novo para "' + usuario + '".\n'); continue; }
    usuarios[usuario] = await bcrypt.hash(senha, 10);
    console.log('OK, "' + usuario + '" anotado.\n');
    const mais = (await perguntar('Adicionar outra pessoa? (s/n): ', false)).trim().toLowerCase();
    if (mais !== 's' && mais !== 'sim') break;
    console.log('');
  }
  console.log('\nCopie a linha abaixo inteira e cole como valor do APP_USERS na Vercel:\n');
  console.log(JSON.stringify(usuarios));
  console.log('');
})();
