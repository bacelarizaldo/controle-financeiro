// Gera o hash bcrypt de uma senha, pra colocar no JSON da variável de
// ambiente APP_USERS (em vez da senha em texto puro).
//
// Uso (no terminal, dentro da pasta do projeto, com as dependências já
// instaladas via `npm install`):
//
//   node scripts/gerar-hash.js "minha-senha-aqui"
//
// O hash impresso é só uma string, não guarda a senha original — coloque
// ele no lugar da senha no JSON do APP_USERS.
const bcrypt = require('bcryptjs');

const senha = process.argv[2];
if (!senha) {
  console.error('Uso: node scripts/gerar-hash.js "sua-senha"');
  process.exit(1);
}

bcrypt.hash(senha, 10).then(function (hash) {
  console.log(hash);
});
