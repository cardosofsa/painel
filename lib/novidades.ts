/**
 * Novidades do sistema, para a aba "Novidades" do painel do master. Cada entrega nova
 * acrescenta uma entrada no TOPO — é a regra do plano: toda fase atualiza o admin.
 * `migracao`: a que precisa estar aplicada no banco para a novidade funcionar.
 */
export interface Novidade {
  /** yyyy-mm-dd */
  data: string;
  titulo: string;
  itens: string[];
  migracao?: string;
  pr?: number;
}

export const NOVIDADES: Novidade[] = [
  {
    data: "2026-10-06",
    titulo: "Dinheiro: promoção, preço defasado, demanda e repasses",
    itens: [
      "Precificação → Promoção: desconto, cupom e comissão extra de campanha; mostra se compensa e quanto precisa vender a mais",
      "Desconto máximo sem prejuízo e mantendo 10% de margem; avisa quando o desconto muda a faixa de comissão",
      "Vixe avisa preço defasado: custo de hoje acima do usado na última precificação, ou precificação com mais de 120 dias",
      "Vixe avisa repasse da Shopee/ML diferente do esperado ou atrasado",
      "Sugestão de compras com previsão por semana (12 semanas), seguindo a tendência de venda",
    ],
  },
  {
    data: "2026-10-06",
    titulo: "Inventário do estoque",
    itens: [
      "Estoque → Inventário: bipe o código de barras (ou digite o SKU) e conte por armazém ou o estoque geral",
      "Diferenças destacadas, com sobra e falta em unidades e em valor de custo",
      'Aplicar lança entradas e saídas com o motivo "Inventário" e guarda o histórico',
      "A contagem fica salva no navegador até aplicar",
    ],
    migracao: "0074",
  },
  {
    data: "2026-10-06",
    titulo: "Limite de usuários do plano",
    itens: [
      "O limite de usuários do plano passa a valer: você + operadores ativos (Grátis 1, Essencial 2, Pro 5), editável no admin",
      "Configurações → Plano mostra o uso de usuários e de imagens com IA do mês",
      "Desativar operador continua sempre liberado",
    ],
    migracao: "0073",
  },
  {
    data: "2026-10-06",
    titulo: "Estúdio de IA e anúncio para a Shopee",
    itens: [
      "Imagens do produto com IA (Gemini): fundo branco, ambiente, capa com selo, outra cor, medidas e pedido livre",
      "Cota de imagens por plano (Grátis 5, Essencial 50, Pro 300 por mês), editável no admin",
      '"Montar anúncio Shopee": título e descrição com IA, preço, fotos na ordem, hashtags e checklist',
      "Defina GEMINI_API_KEY (e, se quiser, GEMINI_IMAGE_MODEL) na Vercel para ligar as imagens",
    ],
    migracao: "0072",
  },
  {
    data: "2026-10-06",
    titulo: "Raio-X da precificação",
    itens: [
      "Compara o preço que você usa em cada anúncio com o preço ideal da sua regra",
      "Preço praticado digitado, média dos pedidos dos últimos 30 dias ou o preço no ar na Shopee/Mercado Livre",
      "Quanto ganha ou perde por venda e por mês, nota de 0 a 100 e situação (prejuízo, zona morta…)",
      "Dicas automáticas e exportação para Excel",
    ],
    migracao: "0071",
  },
  {
    data: "2026-10-06",
    titulo: "Auditoria de segurança e desempenho",
    itens: [
      "Cota de IA não pode mais ser zerada pelo console do navegador",
      "Funções de estoque de kit fechadas para fora do banco",
      "27 índices novos nas chaves estrangeiras",
      "Datas de compras e etiquetas no horário de Brasília",
      "Relatório completo em docs/auditoria-2026-10.md",
    ],
    migracao: "0070",
  },
  {
    data: "2026-10-06",
    titulo: "Vixe → Mensagens: modelos próprios, recompra e campanhas",
    itens: [
      "Cada conta escreve o próprio texto de cada aviso, com variáveis e prévia",
      'Filtros por tipo e "Enviar a próxima" para percorrer a fila',
      "Recompra: clientes na hora de comprar de novo e clientes sumidos",
      "Campanha da próxima data do comércio para os clientes",
      "Histórico do que foi enviado, com reenviar",
    ],
    migracao: "0069",
  },
  {
    data: "2026-10-06",
    titulo: "Login e cadastro no modo noturno, página inicial e título da aba",
    itens: [
      "Faixa da marca escura nos dois temas",
      "Mostrar/ocultar senha e regra da senha ao vivo",
      "Página inicial com capturas nos dois temas, animações e SEO",
      "A aba mostra só o nome da tela",
    ],
    pr: 8,
  },
  {
    data: "2026-10-06",
    titulo: "Dívidas antigas, calendário com feriados e página inicial nova",
    itens: [
      "Dívida antiga de fornecedor e crediário antigo de cliente",
      "Calendário no Home com feriados do estado e da cidade e datas do comércio",
      "Planos e preços na página inicial",
    ],
    migracao: "0067 e 0068",
    pr: 7,
  },
  {
    data: "2026-10-06",
    titulo: "Marca Sertão, botão Home, Configurações e exportação",
    itens: ["Configurações revisadas", "Exportar várias precificações para Excel/Planilhas", "CSV que abre certo no Excel em português"],
    pr: 6,
  },
];
