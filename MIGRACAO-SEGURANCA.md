# Como aplicar as mudanças de segurança

## O que mudou
- `api/_auth.js` — senha agora comparada por hash (bcrypt), não texto puro.
- `api/_ratelimit.js` (novo) — bloqueia login depois de tentativas erradas demais.
- `api/login.js` — passa a checar o bloqueio e usar a verificação assíncrona.
- `api/read-receipt.js` — limite de tamanho no conteúdo enviado pra IA.
- `scripts/gerar-hash.js` (novo) — gera o hash bcrypt de uma senha.
- `package.json` — adicionada a dependência `bcryptjs`.

## Passo a passo

1. **Substitua os arquivos** no seu projeto local pelos que estão aqui (mesmos nomes e caminhos).

2. **Instale a nova dependência:**
   ```
   npm install
   ```

3. **Gere o hash de cada senha atual:**
   ```
   node scripts/gerar-hash.js "senha-do-izaldo"
   node scripts/gerar-hash.js "senha-da-heloisa"
   ```
   Cada comando imprime uma string tipo `$2a$10$...` — é o hash daquela senha.

4. **Atualize a variável `APP_USERS` na Vercel** (Project Settings → Environment
   Variables) trocando as senhas em texto puro pelos hashes gerados:
   ```json
   {"izaldo":"$2a$10$hash-gerado-aqui","heloisa":"$2a$10$outro-hash-aqui"}
   ```

5. **Commit e push** normalmente — a Vercel faz o redeploy sozinha. Se preferir,
   force um redeploy manual em Deployments → "⋯" → Redeploy pra garantir que a
   variável nova entrou em vigor.

6. **Teste o login** com a senha normal (não o hash) — o app continua pedindo a
   senha de sempre, só a forma de guardar/comparar mudou.

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
