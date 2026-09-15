# Controle financeiro — deploy na Vercel

## Arquitetura

- **Armazenamento**: os dados ficam num banco **Postgres** (Vercel
  Postgres / Neon), acessado por uma API própria (`/api/kv`). Isso
  substitui a versão anterior, que guardava tudo no `localStorage` do
  navegador — agora os dados sincronizam entre celular e computador,
  porque o servidor é a fonte única de verdade.
- **Login**: como os dados agora vivem num servidor de verdade (e não
  presos ao seu navegador), o app pede uma senha antes de abrir
  (`/api/login`). A sessão fica guardada num cookie por 60 dias.
- **Leitura de print/texto**: a chamada para a IA vai por uma função
  própria (`/api/read-receipt`), que roda no servidor da Vercel e guarda
  sua chave de API em uma variável de ambiente — ela nunca fica exposta
  no navegador. Essa rota também exige login.

## Migrando os dados que você já tinha no navegador

Se você já usava a versão com `localStorage`, não precisa fazer nada na
mão: na primeira vez que abrir o site novo (depois de configurar tudo
abaixo) **naquele mesmo navegador**, o app detecta os dados antigos
sozinho e sobe tudo pro banco automaticamente, apagando a cópia local
em seguida. Só funciona uma vez e só no navegador onde os dados
estavam — se você usa o site em mais de um aparelho, faça isso primeiro
no que tem os dados mais completos/recentes.

Se preferir fazer isso na mão (ou vier direto do Claude.ai), use os
mesmos botões de sempre: **"Baixar backup completo"** no aparelho de
origem e **"Importar backup"** no site novo — a importação agora grava
direto no banco.

## Passo a passo

### 1. Criar uma conta na Anthropic Console e gerar uma chave de API
Acesse https://console.anthropic.com, crie uma chave em **API Keys**.
Isso é separado da sua conta do Claude.ai — o uso da API é cobrado à
parte, por token. Guarde essa chave, você vai usá-la no passo 5.

### 2. Subir os arquivos para o GitHub
Crie um repositório novo (pode ser privado) e suba esta pasta inteira:

```
controle-financeiro/
├── index.html
├── package.json
├── README.md
├── .gitignore
└── api/
    ├── _auth.js
    ├── kv.js
    ├── login.js
    ├── logout.js
    ├── session.js
    └── read-receipt.js
```

Pelo site do GitHub: crie o repositório, clique em "uploading an
existing file" e arraste os itens acima (a pasta `api` inteira).

### 3. Conectar o repositório à Vercel
Em https://vercel.com, entre com sua conta do GitHub, clique em **Add
New → Project**, selecione o repositório que você acabou de criar e
clique em **Deploy**. Não precisa mudar nenhuma configuração de build
— a Vercel instala a dependência (`@vercel/postgres`) sozinha.

O primeiro deploy vai subir, mas o app ainda não vai funcionar (falta o
banco e as senhas dos passos seguintes).

### 4. Criar o banco de dados
No painel do projeto na Vercel, vá em **Storage → Create Database →
Postgres** (ou "Neon", é a mesma oferta). Siga o assistente e conecte o
banco a este projeto — a Vercel mesma já configura as variáveis de
ambiente do banco (`POSTGRES_URL` e afins) sozinha. A tabela usada pelo
app (`kv`) é criada automaticamente na primeira chamada à API, não
precisa rodar nada manualmente.

### 5. Configurar as variáveis de ambiente
Em **Project Settings → Environment Variables**, adicione:

- `ANTHROPIC_API_KEY` — a chave do passo 1 (pra leitura de print/texto).
- `APP_PASSWORD` — a senha que você (e quem mais usar o app) vai digitar
  pra entrar. Escolha algo só seu, não precisa ser complexo.
- `SESSION_SECRET` — uma string aleatória qualquer, só pra assinar o
  cookie de sessão (por exemplo, gere uma em
  https://1password.com/password-generator ou rode `openssl rand -hex 32`
  no terminal). Não precisa decorar nem reusar em outro lugar.

Depois de salvar as três, vá em **Deployments**, abra o menu "⋯" do
último deploy e clique em **Redeploy** para elas entrarem em vigor.

### 6. Pronto
A Vercel te dá uma URL do tipo `controle-financeiro-xxxx.vercel.app`.
Abra, digite a senha do `APP_PASSWORD` e o app carrega — migrando os
dados antigos do navegador automaticamente, se houver (veja a seção
acima). Salve o link nos favoritos ou na tela inicial do celular.

## Se mais de uma pessoa vai usar
Hoje é uma senha única compartilhada (dá pra você e a Heloísa usarem o
mesmo login, por exemplo). Se no futuro quiser contas separadas por
pessoa, é uma mudança maior — me avise se quiser seguir por esse
caminho.
