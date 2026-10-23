// Função serverless da Vercel — roda no servidor, nunca no navegador.
// Recebe UM print (imagem em base64) e o mês aberto no app, monta aqui a
// instrução de leitura e repassa para a API da Anthropic usando a chave
// guardada em variável de ambiente. A chave NUNCA é exposta ao navegador.
//
// O texto enviado ao modelo é sempre o deste arquivo: o navegador não manda
// texto livre. Assim, mesmo que a rota fique exposta, ninguém consegue usar a
// chave para conversar com o modelo sobre outra coisa.
const { exigirAuth } = require('./_auth');

// Mantenha igual à lista CATEGORIAS do index.html.
const CATEGORIAS = ['Moradia', 'Transporte', 'Combustível', 'Saúde', 'Alimentação', 'Mercado', 'Pessoal', 'Impostos', 'Serviços', 'Assinaturas', 'Lazer', 'Educação', 'Cursos', 'Vestuário', 'Compras', 'Pets', 'Outros'];
const TIPOS_IMAGEM = ['image/jpeg', 'image/png'];
const LIMITE_BASE64 = 2200000; // ~1,6 MB de imagem; o app já comprime antes de enviar
const RX_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const RX_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function promptExtracao(mes) {
  return 'Você está lendo um extrato de cartão de crédito ou de conta bancária brasileira, enviado como imagem (print).\n'+
    'Em imagens de aplicativo bancário, cada linha com nome de estabelecimento e valor em R$ é uma compra. Extraia TODAS as compras visíveis, mesmo quando a data vier apenas no cabeçalho acima delas. Por exemplo, "ontem, 17 de maio" vale para todas as linhas seguintes até aparecer outro cabeçalho de data. Textos como "apple pay", "cartão físico" e ícones são apenas detalhes do meio de pagamento, não são compras separadas.\n'+
    'Extraia três tipos de linha e informe o campo tipo em cada uma:\n'+
    '- tipo "compra": gastos/débitos comuns (inclui juros, IOF, anuidade e tarifas).\n'+
    '- tipo "estorno": dinheiro devolvido de uma compra — estorno, devolução, reembolso, cancelamento, crédito na fatura, cashback, ou QUALQUER valor negativo/com sinal de menos (ex.: "-R$ 200,00", "R$ -200,00", "- 200,00") ou marcado em verde como crédito que não seja pagamento. Na descricao use o nome do estabelecimento, como na compra original.\n'+
    '- tipo "pagamento": pagamento da fatura do cartão — "pagamento antecipado", "pagamento recebido", "pagamento de fatura", "pag fatura", "obrigado pelo pagamento", "pagto". Na descricao escreva "Pagamento antecipado da fatura".\n'+
    'Em todos os tipos, valor é SEMPRE um número positivo (sem o sinal de menos). Ignore saldos, limites disponíveis, totais/resumos da fatura e linhas que não sejam lançamentos.\n'+
    'Para cada gasto devolva: data (formato AAAA-MM-DD; se a imagem não trouxer o ano, use '+mes.split('-')[0]+'; se não trouxer nem o mês, use '+mes+'), descricao (nome do estabelecimento, limpo e curto, sem incluir a categoria e SEM o número da parcela), valor (número positivo com ponto decimal) e categoria (exatamente uma de: '+CATEGORIAS.join(', ')+' — escolha a que melhor descreve o gasto pelo nome do estabelecimento).\n'+
    'COMPRAS PARCELADAS — atenção máxima, nunca deixe passar: procure em cada compra qualquer sinal de parcelamento, como "1/2", "01/02", "1 de 2", "Parcela 1 de 2", "Parc. 1/2", "2x", "em 2x", "x2", "parcelado". Quando houver, inclua também os campos parcela_atual (número da parcela desta compra; se só aparecer algo como "em 3x" sem dizer qual parcela é, use 1) e parcela_total (quantidade total de parcelas). '+
    'Nesse caso informe os valores assim: valor_parcela = valor de UMA parcela, quando a imagem mostrar esse valor (ex.: "3x de R$ 50,00" ou um valor marcado como parcela); valor_total = valor total da compra, quando a imagem mostrar (ex.: "R$ 150,00 em 3x" ou um valor marcado como total). '+
    'Se aparecer só um valor junto do parcelamento e não estiver claro se é a parcela ou o total, considere que é o VALOR TOTAL da compra e coloque em valor_total. Em compras à vista, não inclua parcela_atual, parcela_total, valor_parcela nem valor_total.\n'+
    'Responda APENAS com um array JSON, sem texto antes ou depois, sem markdown, sem crase. Exemplo: [{"data":"2026-08-12","tipo":"compra","descricao":"Posto Shell","valor":180.5,"categoria":"Transporte"},{"data":"2026-08-13","tipo":"estorno","descricao":"Renner","valor":200,"categoria":"Vestuário"},{"data":"2026-08-15","tipo":"pagamento","descricao":"Pagamento antecipado da fatura","valor":1000,"categoria":"Outros"},{"data":"2026-08-14","descricao":"Magazine Luiza","valor":399,"valor_total":399,"parcela_atual":1,"parcela_total":2,"categoria":"Casa","tipo":"compra"}]';
}

module.exports = async function handler(req, res) {
  if (!exigirAuth(req, res)) return;
  // A resposta pode conter informação financeira extraída da fatura; não cachear.
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'ANTHROPIC_API_KEY não configurada nas variáveis de ambiente da Vercel.'
    });
    return;
  }

  try {
    // Só estes três campos são lidos; qualquer outro é ignorado.
    const { imagem, tipo, mes } = req.body || {};
    if (typeof imagem !== 'string' || !imagem || !TIPOS_IMAGEM.includes(tipo) || typeof mes !== 'string' || !RX_MES.test(mes)) {
      res.status(400).json({ error: 'Envie um print (JPEG ou PNG) por vez.' });
      return;
    }
    if (imagem.length > LIMITE_BASE64) {
      res.status(413).json({ error: 'Imagem muito grande. Envie um print por vez.' });
      return;
    }
    if (!RX_BASE64.test(imagem)) {
      res.status(400).json({ error: 'Imagem inválida.' });
      return;
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: tipo, data: imagem } },
            { type: 'text', text: promptExtracao(mes) }
          ]
        }]
      })
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      const motivo = data && data.error && data.error.message;
      res.status(upstream.status).json({ error: motivo || ('A API da Anthropic respondeu erro ' + upstream.status + '.') });
      return;
    }
    // Devolve só o texto da resposta, que é o que o app usa.
    const content = (data.content || []).filter((b) => b.type === 'text').map((b) => ({ type: 'text', text: b.text }));
    res.status(200).json({ content });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
};
