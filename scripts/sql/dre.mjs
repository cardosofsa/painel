/** Resultado do mês, anúncios e conciliação de repasses (0066). Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};
const espera = async (nome, fn, trecho) => {
  try {
    await fn();
    confere(nome, false, "devia ter dado erro");
  } catch (e) {
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 100));
  }
};

const u = (await um(`insert into auth.users (email) values ('dre@d.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('o2@d.com') returning id`)).id;
for (const id of [u, outro]) await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;`);
const entrar = (id) => db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
await entrar(u);

const caixa = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Banco', 0) returning id`, [u])).id;
const canal = (await um(`insert into canais (user_id, nome) values ($1, 'Mercado Livre') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Loja ML') returning id`, [u, canal])).id;

// Venda do PDV em outubro: subtotal 100, desconto 10, entrega 5, custo 40, imposto 6, maquininha 3, frete pago 4.
await q(
  `insert into vendas (user_id, numero, data_venda, status, subtotal, desconto, valor_entrega, total, custo_total, lucro, imposto_valor, taxa_maquineta_valor, frete_custo, forma_pagamento)
   values ($1, 'V-9001', '2026-10-10 15:00-03', 'paga', 100, 10, 5, 95, 40, 41, 6, 3, 4, 'Pix')`,
  [u],
);
// Venda cancelada não conta.
await q(`insert into vendas (user_id, numero, data_venda, status, subtotal, desconto, total, custo_total, lucro) values ($1, 'V-9002', '2026-10-11 10:00-03', 'cancelada', 500, 0, 500, 100, 400)`, [u]);
// Pedido do marketplace: 200 de venda, 30 de taxas, 10 cupom, 12 imposto, 80 custo; repasse esperado 160.
const conta = (await um(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento, status) values ($1, 'receber', 'Repasse Shopee Loja ML — pedido 555', 160, '2026-10-20', 'pendente') returning id, descricao`, [u]));
confere("descrição do repasse sem 'Shopee' fixo", conta.descricao === "Repasse Loja ML — pedido 555", conta.descricao);
await q(
  `insert into pedidos_marketplace (user_id, loja_id, plataforma, numero, status, criado_em_plataforma, pago_em, subtotal, cupom_vendedor, comissao, taxa_servico, taxa_transacao, imposto, custo, repasse, conta_receber_id)
   values ($1, $2, 'mercadolivre', '555', 'concluido', '2026-10-05 10:00-03', '2026-10-05 10:00-03', 200, 10, 20, 8, 2, 12, 80, 160, $3)`,
  [u, loja, conta.id],
);
// Anúncio de 16/09 a 15/10 (30 dias, R$ 300): metade cai em outubro.
await q(`insert into gastos_anuncios (user_id, periodo_inicio, periodo_fim, canal, campanha, valor, origem) values ($1, '2026-09-16', '2026-10-15', 'Shopee', 'Geral', 300, 'shopee_ads')`, [u]);
await espera(
  "reimportar o mesmo período não duplica",
  () => q(`insert into gastos_anuncios (user_id, periodo_inicio, periodo_fim, canal, campanha, valor, origem) values ($1, '2026-09-16', '2026-10-15', 'Shopee', 'Geral', 300, 'shopee_ads')`, [u]),
  "gastos_anuncios_unico",
);
// Despesa fixa de outubro (50) e compra de mercadoria (fora: já é CMV).
await q(`insert into movimentacoes_financeiras (user_id, tipo, valor, descricao, categoria, conta_id, afeta_lucro, data_movimentacao) values ($1, 'saida', -50, 'Aluguel', 'Despesas fixas', $2, true, '2026-10-05')`, [u, caixa]);
await q(`insert into movimentacoes_financeiras (user_id, tipo, valor, descricao, categoria, conta_id, afeta_lucro, data_movimentacao) values ($1, 'saida', -999, 'Compra', 'Compra de mercadoria', $2, true, '2026-10-05')`, [u, caixa]);
await q(`insert into movimentacoes_financeiras (user_id, tipo, valor, descricao, categoria, conta_id, afeta_lucro, data_movimentacao) values ($1, 'entrada', 7, 'Juros', 'Juros e multa de crediário', $2, true, '2026-10-06')`, [u, caixa]);

const out = await um(`select * from dre_mensal('2026-10-01', '2026-10-31')`);
const n = (k) => Number(out[k]);
confere("receita bruta = 100 + 5 (entrega) + 200", n("receita_bruta") === 305, JSON.stringify(out));
confere("descontos = 10 + 10 (cupom)", n("descontos") === 20);
confere("taxas do marketplace = 30; maquininha 3; frete 4", n("taxas_marketplace") === 30 && n("taxa_maquininha") === 3 && n("frete") === 4);
confere("CMV = 40 + 80 (cancelada fora)", n("cmv") === 120);
confere("anúncio rateado: 15 de 30 dias em outubro = 150", n("anuncios") === 150);
confere("despesas = 50 (compra de mercadoria fora)", n("despesas") === 50);
// 305 − 20 − 0 − 18 − 30 − 3 − 4 − 120 − 150 − 50 + 7 = −83
confere("lucro líquido", n("lucro_liquido") === -83, String(out.lucro_liquido));
confere("2 pedidos", Number(out.pedidos) === 2);

// Conciliação.
const r = (await um(`select conciliar_repasses($1::jsonb, $2) as r`, [JSON.stringify([{ numero: "555", valor: 158.5, data: "2026-10-21" }, { numero: "999", valor: 10, data: "2026-10-21" }]), caixa])).r;
confere("divergente quando o recebido difere do esperado", r[0].status === "divergente" && r[1].status === "nao_encontrado", JSON.stringify(r));
const cpr = await um(`select status, valor_pago from contas_a_pagar_receber where id = $1`, [conta.id]);
confere("baixa a conta a receber com o valor real", cpr.status === "recebido" && Number(cpr.valor_pago) === 158.5);
confere("dinheiro entra na conta", Number((await um(`select saldo from contas where id = $1`, [caixa])).saldo) === 158.5);
const r2 = (await um(`select conciliar_repasses($1::jsonb, $2) as r`, [JSON.stringify([{ numero: "555", valor: 158.5 }]), caixa])).r;
confere("não concilia duas vezes", r2[0].status === "ja_conciliado");

// Isolamento.
await entrar(outro);
await db.exec(`set role authenticated`);
try {
  confere("outra conta não vê os anúncios", (await q(`select * from gastos_anuncios`)).length === 0);
  await espera("outra conta não concilia com conta alheia", () => q(`select conciliar_repasses('[]'::jsonb, $1)`, [caixa]), "Escolha a conta");
} finally {
  await db.exec(`reset role`);
}
await entrar(u);

await db.exec(await lerMigracao("0066_dre_anuncios_repasses.sql"));
confere("0066 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
