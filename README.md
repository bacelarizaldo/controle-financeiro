# Controle financeiro — deploy na Vercel

## O que muda em relação à versão do Claude.ai

- **Armazenamento**: os dados agora ficam salvos no `localStorage` do
  navegador, não mais no armazenamento do Claude.ai. Isso significa que
  os dados ficam presos àquele navegador/aparelho específico — abrir o
  site no celular não mostra o que você lançou no computador. Não há
  sincronização entre dispositivos nesta versão.
- **Leitura de print/texto**: a chamada para a IA passou a ir por uma
  função própria (`/api/read-receipt`), que roda no servidor da Vercel e
  guarda sua chave de API em uma variável de ambiente — ela nunca fica
  exposta no navegador.

## Atenção: o site fica público

Um deploy comum da Vercel gera uma URL pública. Qualquer pessoa com o
link consegue abrir o app e ver seus dados financeiros — não existe
login nem senha nesta versão. Se isso for um problema, duas opções:

- Ativar a **Proteção por senha** da Vercel (Project Settings → Deployment
  Protection), disponível nos planos pagos.
- Me pedir para adicionar uma tela de senha simples ao próprio app (mais
  trabalhoso, mas funciona em qualquer plano).

## Migrando os dados que você já tem no Claude.ai

1. No chat do Claude.ai, no app atual, clique em **"Baixar backup completo"**
   (fica ao lado de "Baixar em CSV"). Isso baixa um arquivo
   `backup-financas-AAAA-MM.json` com tudo: meses, jobs, financiamentos,
   configurações de cartão.
2. Depois de publicado na Vercel (passo 3 abaixo), abra o site e clique
   em **"Importar backup"**. Escolha o arquivo que você acabou de baixar.
3. A página recarrega sozinha com os dados já lá dentro.

Pode repetir esse processo depois, se quiser levar lançamentos mais
recentes do Claude.ai para o site — mas repare que importar um backup
**sobrescreve** os dados que já existirem no site com o mesmo nome (por
exemplo, se você já tiver lançado gastos de setembro no site e importar
um backup antigo, o setembro do site volta para o que estava no backup).

## Passo a passo

### 1. Criar uma conta na Anthropic Console e gerar uma chave de API
Acesse https://console.anthropic.com, crie uma chave em **API Keys**.
Isso é separado da sua conta do Claude.ai — o uso da API é cobrado à
parte, por token. Guarde essa chave, você vai usá-la no passo 4.

### 2. Subir os arquivos para o GitHub
Crie um repositório novo (pode ser privado) e suba esta pasta inteira:

```
controle-financeiro/
├── index.html
├── package.json
├── README.md
└── api/
    └── read-receipt.js
```

Pelo site do GitHub: crie o repositório, clique em "uploading an existing
file" e arraste os quatro itens acima.

### 3. Conectar o repositório à Vercel
Em https://vercel.com, entre com sua conta do GitHub, clique em **Add
New → Project**, selecione o repositório que você acabou de criar e
clique em **Deploy**. Não precisa mudar nenhuma configuração de build.

### 4. Configurar a chave de API
Depois do primeiro deploy (ele vai falhar ao ler prints até este passo):
**Project Settings → Environment Variables** → adicione uma variável
chamada `ANTHROPIC_API_KEY` com o valor da chave do passo 1. Depois vá
em **Deployments**, abra o menu "⋯" do último deploy e clique em
**Redeploy** para a variável entrar em vigor.

### 5. Pronto
A Vercel te dá uma URL do tipo `controle-financeiro-xxxx.vercel.app`.
Esse link é o app. Salve nos favoritos ou na tela inicial do celular.

## Se quiser sincronizar entre dispositivos no futuro
Isso exigiria trocar o `localStorage` por um banco de dados real (a
própria Vercel tem opções como Vercel KV ou Postgres) e adicionar login.
É uma mudança maior — me avise se quiser seguir por esse caminho.
