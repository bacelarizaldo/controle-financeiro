# Como aplicar as mudanças de segurança

## O que mudou
- `api/_auth.js` — senha agora comparada por hash (bcrypt), não texto puro.
- `api/_ratelimit.js` (novo) — bloqueia login depois de tentativas erradas demais.
- `api/login.js` — passa a checar o bloqueio e usar a verificação assíncrona.
- `api/read-receipt.js` — limite de tamanho no conteúdo enviado pra IA.
- `scripts/gerar-hash.js` (novo) — gera o hash bcrypt de uma senha.
- `package.json` — adicionada a dependência `bcryptjs`.

## Passo a passo

O código já está aplicado (pasta `api/`). Falta só trocar as senhas por hashes:

1. **Instale as dependências** (uma vez): `npm install`

2. **Gere o hash de cada senha atual**, no terminal, dentro da pasta do projeto:
   ```
   node scripts/gerar-hash.js
   ```
   Rode uma vez por pessoa. A senha é pedida sem aparecer na tela, e o comando imprime uma string tipo `$2a$10$...` — é o hash daquela senha.

3. **Atualize a variável `APP_USERS` na Vercel** (Settings → Environment
   Variables) trocando as senhas em texto puro pelos hashes gerados:
   ```json
   {"izaldo":"$2a$10$hash-gerado-aqui","heloisa":"$2a$10$outro-hash-aqui"}
   ```

4. **Crie a variável `SENHA_SO_HASH` com valor `1`** — a partir daí senha em
   texto puro no `APP_USERS` é recusada. Sem ela, o login ainda aceita texto
   puro (modo de transição, com aviso no log).

5. **Redeploy** (Deployments → "⋯" → Redeploy) e **teste o login** com a senha
   normal (não o hash).

## Sobre o bloqueio de tentativas
Depois de 5 tentativas erradas na mesma combinação IP+usuário em 15 minutos, o
login fica bloqueado por 15 minutos (`api/_ratelimit.js`, constantes
`MAX_TENTATIVAS`, `JANELA_MIN`, `BLOQUEIO_MIN` — ajuste se quiser outro
número). A tabela `login_attempts` é criada sozinha no primeiro login, igual
já acontece com a tabela `kv`.

## Nada muda para quem usa o app
Login, senha e uso do dia a dia continuam iguais — as mudanças são só
internas, no jeito como a senha é guardada e verificada, e no limite de
tentativas.
