# Lucre Fácil — Precificação Shopee (local)

App local para precificar **anúncios Shopee**: preço efetivo, faixa de comissão,
vitrine vs cupom, ROAS em R$ por pedido, competitividade na busca, promoção de
7 dias, combos e datas 9.9 / 11.11. Tudo roda no navegador — o histórico fica no
`localStorage`.

## Como rodar

Pré-requisito: [Node.js](https://nodejs.org) 18 ou mais recente.

```bash
npm install
npm run dev
```

Abra o endereço do terminal (normalmente `http://localhost:5173`).

```bash
npm run build
npm run preview
```

## O que tem

- **Anúncio**: SKU, categoria, kit, Frete Grátis (custo no seller), campanha
  ligada neste SKU, devoluções/chargebacks, 3 modos de cálculo, veredito com
  faixa aplicada, vitrine vs o que o cliente paga (cupom recalcula a faixa).
- **Ads & busca**: teto de Ads em R$ por pedido, ROAS, comparação com o 1º da
  busca, tabela de margens 10–30%.
- **Promoções**: cadastro + 7 dias com lucro no preço cheio vs promocional,
  meta em unidades/dia, projeção 9.9–12.12, combo por quantidade.
- **Histórico**: atualizar o anúncio aberto (não só duplicar), buscar, exportar
  e importar JSON.
- **Taxas Shopee**: faixas com cortes editáveis, criar/remover faixa, imposto,
  taxa de campanha, CPF > 450 pedidos/90 dias, regra &lt; R$ 8.

## Sobre as taxas padrão

Os valores pré-carregados são referência da tabela anunciada como vigente a
partir de 01/03/2026. A Shopee altera regras com frequência e por categoria —
**confira o painel de vendedor** e ajuste em Taxas Shopee.

## Stack

React + TypeScript + Vite + Tailwind CSS v4 + Zustand + Recharts.
