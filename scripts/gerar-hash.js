// Gera o hash bcrypt de uma senha, pra colocar no JSON da variável de
// ambiente APP_USERS (em vez da senha em texto puro).
//
// Uso (no terminal, dentro da pasta do projeto, com as dependências já
// instaladas via `npm install`):
//
//   node scripts/gerar-hash.js
//
// A senha é pedida sem aparecer na tela e não fica no histórico do
// terminal. O hash impresso é só uma string, não guarda a senha original —
// coloque ele no lugar da senha no JSON do APP_USERS.
const bcrypt = require('bcryptjs');

function perguntarSenha(texto) {
  return new Promise(function (resolve) {
    const entrada = process.stdin;
    process.stdout.write(texto);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    let senha = '';
    // Os caracteres podem chegar vários de uma vez (ex.: senha colada),
    // então cada pedaço é lido caractere por caractere.
    entrada.on('data', function aoDigitar(pedaco) {
      for (const ch of pedaco) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.removeListener('data', aoDigitar);
          process.stdout.write('\n');
          resolve(senha);
          return;
        } else if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(1);
        } else if (ch === '\u007f') {
          senha = senha.slice(0, -1);
        } else {
          senha += ch;
        }
      }
    });
  });
}

(async function () {
  const senha = await perguntarSenha('Senha: ');
  if (!senha) {
    console.error('Nenhuma senha digitada.');
    process.exit(1);
  }
  const confirmacao = await perguntarSenha('Repita a senha: ');
  if (senha !== confirmacao) {
    console.error('As senhas não conferem.');
    process.exit(1);
  }
  console.log(await bcrypt.hash(senha, 10));
})();
