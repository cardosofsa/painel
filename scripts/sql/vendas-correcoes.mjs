/**
 * Correções de Vendas (0083): edição, cancelamento depois de devolução, crédito de troca,
 * custo de kit, parcela paga em partes, datas em Brasília, troco, imposto na devolução e
 * vendas.lucro igual ao DRE. Rode com `npm run test:sql`.
 */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const M = "0083_correcoes_vendas.sql";
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};
const n = (x) => Math.round(Number(x) * 100) / 100;

// ---------- 0) Recalculo das vendas existentes (antes x depois da 0083) ----------
{
  const db = await criarBancoDeTeste({ antesDe: M });
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const um = async (sql, p = []) => (await q(sql, p))[0];
  const u = (await um(`insert into auth.users (email) values ('antes@v.com') returning id`)).id;
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
  // Venda antiga: lucro sem a entrega e sem o frete da etiqueta.
  const v = (await um(
    `insert into vendas (user_id, numero, status, subtotal, desconto, valor_entrega, total, custo_total, lucro, imposto_valor, taxa_maquineta_valor, frete_custo, valor_devolvido)
     values ($1, 'V-9', 'paga', 100, 10, 15, 105, 40, 44, 5, 1, 12, 0) returning id`, [u])).id;
  const canc = (await um(`insert into vendas (user_id, numero, status, subtotal, total, custo_total, lucro) values ($1, 'V-8', 'cancelada', 50, 50, 20, 30) returning id`, [u])).id;
  await db.exec(await lerMigracao(M));
  const esperado = 100 - 10 + 15 - 40 - 5 - 1 - 12;
  const l1 = n((await um(`select lucro from vendas where id = $1`, [v])).lucro);
  confere("migração recalcula o lucro das vendas existentes pela conta do DRE", l1 === esperado, `${l1} (esperado ${esperado})`);
  confere("venda cancelada fica como estava", n((await um(`select lucro from vendas where id = $1`, [canc])).lucro) === 30);
  await db.exec(await lerMigracao(M));
  confere("rodar a 0083 de novo não muda o lucro", n((await um(`select lucro from vendas where id = $1`, [v])).lucro) === esperado);
  await db.close();
}

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
const espera = async (nome, fn, trecho) => {
  try {
    await fn();
    confere(nome, false, "devia ter dado erro");
  } catch (e) {
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 120));
  }
};

async function novaConta(email, aliquota = 6) {
  const u = (await um(`insert into auth.users (email) values ($1) returning id`, [email])).id;
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u, email]);
  await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
  await q(`insert into perfil_negocio (user_id, aliquota_das) values ($1, $2) on conflict (user_id) do update set aliquota_das = $2`, [u, aliquota]);
  const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
  await q(
    `insert into formas_pagamento (user_id, nome, tipo) values ($1, 'Crédito', 'cartao_credito'), ($1, 'Pix', 'pix'), ($1, 'Dinheiro', 'dinheiro') on conflict do nothing`,
    [u],
  );
  const prod = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'A', 'Camisa', 20, 50, 500) returning id`, [u])).id;
  const cli = (await um(`insert into clientes (user_id, nome, permite_fiado, limite_fiado) values ($1, 'Ana', true, 100000) returning id`, [u])).id;
  return { u, conta, prod, cli };
}

let ctx = await novaConta("vc@v.com");
const saldo = async () => n((await um(`select saldo from contas where id = $1`, [ctx.conta])).saldo);
const est = async (id = ctx.prod) => (await um(`select estoque from produtos where id = $1`, [id])).estoque;
const venda = (o = {}) =>
  um(
    `select * from registrar_venda(p_itens => $1::jsonb, p_status => $2, p_conta_id => $3, p_forma_pagamento => $4, p_cliente_id => $5, p_desconto => $6, p_valor_entrega => $7,
       p_entrada_valor => $8, p_entrada_forma => $9, p_forma_pagamento_2 => $10, p_taxa_maquineta_pct => $11, p_parcelas_fiado => $12,
       p_credito_troca => $13, p_troca_devolucao_id => $14, p_valor_recebido => $15)`,
    [
      JSON.stringify(o.itens ?? [{ produto_id: ctx.prod, quantidade: o.qtd ?? 2, preco_unitario: 50 }]),
      o.status ?? "paga", o.conta === undefined ? ctx.conta : o.conta, o.forma ?? "Pix", o.cliente ?? null, o.desconto ?? 0, o.entrega ?? 0,
      o.entrada ?? 0, o.entradaForma ?? null, o.forma2 ?? null, o.taxa ?? 0, o.parcelas ?? 1,
      o.credito ?? 0, o.troca ?? null, o.recebido ?? null,
    ],
  );
const V = (id) =>
  um(`select subtotal, desconto, valor_entrega, total, custo_total, lucro, imposto_valor, taxa_maquineta_valor, valor_devolvido, status, credito_troca, valor_recebido, troco, frete_custo from vendas where id = $1`, [id]);
const lucroDre = (v) =>
  n(Number(v.subtotal) - Number(v.desconto) + Number(v.valor_entrega) - Number(v.custo_total) - Number(v.imposto_valor) - Number(v.taxa_maquineta_valor) - Number(v.frete_custo ?? 0) - Number(v.valor_devolvido));
const itemDe = async (vendaId) => (await um(`select id from venda_itens where venda_id = $1`, [vendaId])).id;
const devolver = (vendaId, itemId, qtd, valor, forma, conta = null) =>
  um(`select registrar_devolucao($1, $2::jsonb, $3, $4, $5, null, $6) r`, [
    vendaId, JSON.stringify([{ venda_item_id: itemId, quantidade: qtd, destino: "estoque" }]), valor, forma, conta, forma === "troca" ? "troca" : "devolucao",
  ]);
const editar = (id, o = {}) =>
  um(`select editar_venda($1, $2, $3, null, $4, $5, $6) r`, [id, o.cliente ?? null, o.forma ?? "Pix", o.desconto ?? 0, o.entrega ?? 0, o.pin ?? "1234"]);

await um(`select definir_pin_admin('1234')`);

// ---------- 1) registrar_venda: lucro com a entrega ----------
const s0 = await saldo();
const v1 = await venda({ desconto: 10, entrega: 5, forma: "Crédito", taxa: 3 });
let r = await V(v1.venda_id);
confere("venda: imposto 6% de 90 e taxa 3% de 95", n(r.imposto_valor) === 5.4 && n(r.taxa_maquineta_valor) === 2.85, JSON.stringify(r));
confere("venda: lucro = subtotal − desconto + entrega − custo − imposto − taxa", n(r.lucro) === n(100 - 10 + 5 - 40 - 5.4 - 2.85) && n(v1.venda_lucro) === n(r.lucro), String(r.lucro));
confere("venda: caixa recebe o total", n((await saldo()) - s0) === 95);

// ---------- 2) editar_venda: imposto, taxa e lucro acompanham ----------
const pinErrado = (await editar(v1.venda_id, { desconto: 20, entrega: 5, forma: "Crédito", pin: "0000" })).r;
confere("PIN errado volta no corpo (P0001) e não grava", pinErrado?.code === "P0001" && n((await V(v1.venda_id)).desconto) === 10, JSON.stringify(pinErrado));
await q(`delete from pin_admin_tentativas`);
await editar(v1.venda_id, { desconto: 20, entrega: 5, forma: "Crédito" });
r = await V(v1.venda_id);
confere("editar: imposto 6% de 80 = 4,80", n(r.imposto_valor) === 4.8, String(r.imposto_valor));
confere("editar: taxa 3% de 85 = 2,55", n(r.taxa_maquineta_valor) === 2.55, String(r.taxa_maquineta_valor));
confere("editar: lucro com entrega, imposto e taxa novos", n(r.lucro) === n(100 - 20 + 5 - 40 - 4.8 - 2.55), String(r.lucro));
confere("editar: caixa acompanha o total novo", n((await saldo()) - s0) === 85);

// ---------- 3) editar_venda no crediário com entrada ----------
const v3 = await venda({ status: "fiado", cliente: ctx.cli, entrada: 30, entradaForma: "dinheiro", forma2: "Pix" });
await editar(v3.venda_id, { cliente: ctx.cli, desconto: 10 });
const cpr3 = await q(`select valor, status from contas_a_pagar_receber where referencia_venda_id = $1`, [v3.venda_id]);
confere("crediário com entrada: conta a receber = total novo − entrada (90 − 30)", cpr3.length === 1 && n(cpr3[0].valor) === 60, JSON.stringify(cpr3));
// Recebido e depois mais barato: devolve no recebimento; mais caro: reabre.
const cpr3id = (await um(`select id from contas_a_pagar_receber where referencia_venda_id = $1`, [v3.venda_id])).id;
await q(`select receber_conta($1, 60, null, $2)`, [cpr3id, ctx.conta]);
const s3 = await saldo();
await editar(v3.venda_id, { cliente: ctx.cli, desconto: 20 });
let c3 = await um(`select valor, valor_pago, status from contas_a_pagar_receber where id = $1`, [cpr3id]);
confere("já recebido e mais barato: ajusta o recebimento (caixa −10)", n(c3.valor) === 50 && n(c3.valor_pago) === 50 && c3.status === "recebido" && n((await saldo()) - s3) === -10, JSON.stringify(c3));
await editar(v3.venda_id, { cliente: ctx.cli, desconto: 0 });
c3 = await um(`select valor, valor_pago, status from contas_a_pagar_receber where id = $1`, [cpr3id]);
confere("já recebido e mais caro: a conta reabre com a diferença", n(c3.valor) === 70 && n(c3.valor_pago) === 50 && c3.status === "pendente", JSON.stringify(c3));

const v4 = await venda({ status: "fiado", cliente: ctx.cli, parcelas: 3 });
await espera("crediário parcelado: edição recusada", () => editar(v4.venda_id, { cliente: ctx.cli, desconto: 10 }), "cancele e refaça a venda");

// ---------- 4) devolução: imposto estornado, lucro e edição recusada ----------
const v5 = await venda({ qtd: 3 });
await devolver(v5.venda_id, await itemDe(v5.venda_id), 1, 50, "reembolso", ctx.conta);
r = await V(v5.venda_id);
confere("devolução: imposto cai para 6% de (150 − 50) = 6,00", n(r.imposto_valor) === 6, String(r.imposto_valor));
confere("devolução: lucro = conta do DRE", n(r.lucro) === lucroDre(r) && n(r.lucro) === n(150 + 0 - 40 - 6 - 50), String(r.lucro));
await espera("venda com devolução: edição recusada", () => editar(v5.venda_id, { desconto: 0 }), "cancele e refaça a venda");

// ---------- 5) cancelar depois de devolução parcial ----------
const e6 = await est();
const s6 = await saldo();
const v6 = await venda({ qtd: 3 });
await devolver(v6.venda_id, await itemDe(v6.venda_id), 1, 50, "reembolso", ctx.conta);
await q(`select cancelar_venda($1)`, [v6.venda_id]);
confere("cancelar depois de devolução: estoque volta ao que era", (await est()) === e6, `${(await est()) - e6}`);
confere("cancelar depois de devolução: caixa volta ao que era (só o líquido sai)", n((await saldo()) - s6) === 0, String((await saldo()) - s6));

// ---------- 6) Troca: crédito é pagamento, não desconto ----------
const v7 = await venda({ qtd: 1 });
const dev7 = (await devolver(v7.venda_id, await itemDe(v7.venda_id), 1, 50, "troca")).r;
const s7 = await saldo();
const v7b = await venda({ qtd: 2, credito: 50, troca: dev7.id });
r = await V(v7b.venda_id);
confere("troca: venda nova tem receita e lucro cheios", n(r.total) === 100 && n(r.desconto) === 0 && n(r.lucro) === n(100 - 40 - 6) && n(r.credito_troca) === 50, JSON.stringify(r));
confere("troca: o caixa recebe só o que faltou (100 − 50)", n((await saldo()) - s7) === 50);
confere("troca: forma de pagamento diz 'Crédito de troca'", (await um(`select forma_pagamento f from vendas where id = $1`, [v7b.venda_id])).f.startsWith("Crédito de troca"));
await espera("troca: o mesmo crédito não paga duas vendas", () => venda({ qtd: 1, credito: 50, troca: dev7.id }), "disponível");
const s7c = await saldo();
const v7c = await venda({ qtd: 1, credito: 0 });
await q(`select cancelar_venda($1)`, [v7c.venda_id]);
confere("cancelar venda comum continua tirando o valor do caixa", n((await saldo()) - s7c) === 0);
// Venda inteira no crédito: cancela sem procurar lançamento no caixa.
const v7d = await venda({ qtd: 1 });
const dev7d = (await devolver(v7d.venda_id, await itemDe(v7d.venda_id), 1, 50, "troca")).r;
const v7e = await venda({ qtd: 1, credito: 50, troca: dev7d.id, conta: null });
await q(`select cancelar_venda($1)`, [v7e.venda_id]);
confere("venda toda paga com crédito cancela e devolve o crédito", (await um(`select status from vendas where id = $1`, [v7e.venda_id])).status === "cancelada");
const v7f = await venda({ qtd: 1, credito: 50, troca: dev7d.id, conta: null });
confere("crédito volta a valer depois do cancelamento", !!v7f.venda_id);

// ---------- 7) Troco ----------
const s8 = await saldo();
const v8 = await venda({ qtd: 1, forma: "Dinheiro", recebido: 100 });
r = await V(v8.venda_id);
confere("troco: grava recebido 100 e troco 50; caixa recebe só 50", n(r.valor_recebido) === 100 && n(r.troco) === 50 && n((await saldo()) - s8) === 50, JSON.stringify(r));
const v8b = await venda({ qtd: 2, entrada: 30, entradaForma: "dinheiro", forma: "Crédito", forma2: "Crédito", recebido: 50 });
r = await V(v8b.venda_id);
confere("troco no pagamento dividido vale só para a parte em dinheiro (50 − 30)", n(r.troco) === 20, JSON.stringify(r));
await espera("recebido menor que a parte em dinheiro é recusado", () => venda({ qtd: 1, forma: "Dinheiro", recebido: 40 }), "menor que a parte em dinheiro");
r = await V((await venda({ qtd: 1, forma: "Pix", recebido: 100 })).venda_id);
confere("sem dinheiro no pagamento, o recebido é ignorado", r.valor_recebido === null && n(r.troco) === 0);

// ---------- 8) Parcela paga em partes ----------
const v9 = await venda({ status: "fiado", cliente: ctx.cli, parcelas: 2 });
const p9 = await q(`select id, valor from venda_parcelas where venda_id = $1 order by numero`, [v9.venda_id]);
await q(`select marcar_parcela_paga($1, 10, null, $2)`, [p9[0].id, ctx.conta]);
let pr = await um(`select status, valor_pago from venda_parcelas where id = $1`, [p9[0].id]);
confere("parcela paga em parte segue pendente com o valor pago", pr.status === "pendente" && n(pr.valor_pago) === 10, JSON.stringify(pr));
await q(`select marcar_parcela_paga($1, 40, null, $2)`, [p9[0].id, ctx.conta]);
pr = await um(`select status, valor_pago from venda_parcelas where id = $1`, [p9[0].id]);
confere("completar a parcela a quita", pr.status === "paga" && n(pr.valor_pago) === 50, JSON.stringify(pr));
const pai9 = await um(`select valor_pago, status from contas_a_pagar_receber where referencia_venda_id = $1`, [v9.venda_id]);
confere("conta a receber grava a soma paga (50) e segue pendente", n(pai9.valor_pago) === 50 && pai9.status === "pendente", JSON.stringify(pai9));
confere("fiado em uso desconta o que já foi pago", n((await um(`select fiado_em_uso_cliente($1) x`, [ctx.cli])).x) >= 50);

// ---------- 9) Datas em Brasília ----------
// Fuso de Tóquio: current_date fica um dia à frente do Brasil em boa parte do dia.
await db.exec(`set timezone = 'Asia/Tokyo'`);
const hojeBr = (await um(`select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') d`)).d;
const v10 = await venda({ qtd: 1 });
const d10 = (await um(`select to_char(data_movimentacao, 'YYYY-MM-DD') d from movimentacoes_financeiras where referencia_venda_id = $1`, [v10.venda_id])).d;
confere("registrar_venda lança no dia de Brasília", d10 === hojeBr, `${d10} x ${hojeBr}`);
const v11 = await venda({ status: "fiado", cliente: ctx.cli, parcelas: 2 });
const p11 = (await um(`select id from venda_parcelas where venda_id = $1 order by numero limit 1`, [v11.venda_id])).id;
await q(`select marcar_parcela_paga($1, 50, null, $2)`, [p11, ctx.conta]);
confere("marcar_parcela_paga usa o dia de Brasília", (await um(`select to_char(data_pagamento, 'YYYY-MM-DD') d from venda_parcelas where id = $1`, [p11])).d === hojeBr);
const v12 = await venda({ status: "fiado", cliente: ctx.cli, qtd: 1 });
const c12 = (await um(`select id from contas_a_pagar_receber where referencia_venda_id = $1`, [v12.venda_id])).id;
await q(`select receber_conta($1, 50, null, $2)`, [c12, ctx.conta]);
confere("receber_conta usa o dia de Brasília", (await um(`select to_char(data_pagamento, 'YYYY-MM-DD') d from contas_a_pagar_receber where id = $1`, [c12])).d === hojeBr);
const v13 = await venda({ qtd: 1 });
await devolver(v13.venda_id, await itemDe(v13.venda_id), 1, 50, "reembolso", ctx.conta);
const d13 = (await um(`select to_char(data_movimentacao, 'YYYY-MM-DD') d from movimentacoes_financeiras where categoria = 'Devoluções' order by criado_em desc limit 1`)).d;
confere("registrar_devolucao usa o dia de Brasília", d13 === hojeBr, d13);
await db.exec(`set timezone = 'UTC'`);
// Offline: o caixa fica no dia em que a venda foi feita.
const feita = (await um(`select to_char(now() - interval '3 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') t, to_char(((now() - interval '3 days') at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') d`));
const off = await um(
  `select * from registrar_venda_offline(p_chave => gen_random_uuid(), p_feita_em => $1, p_itens => $2::jsonb, p_status => 'paga', p_conta_id => $3, p_forma_pagamento => 'Dinheiro', p_valor_recebido => 60)`,
  [feita.t, JSON.stringify([{ produto_id: ctx.prod, quantidade: 1, preco_unitario: 50 }]), ctx.conta],
);
const doff = (await um(`select to_char(data_movimentacao, 'YYYY-MM-DD') d from movimentacoes_financeiras where referencia_venda_id = $1`, [off.venda_id])).d;
confere("venda offline lança no dia de Brasília em que foi feita", doff === feita.d, `${doff} x ${feita.d}`);
confere("venda offline guarda o troco", n((await V(off.venda_id)).troco) === 10);

// ---------- 10) Custo de kit pelo custo atual do componente ----------
const comp = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'C', 'Caneca', 10, 30, 50) returning id`, [ctx.u])).id;
const kit = (await um(
  `insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque, insumos, e_kit) values ($1, 'K', 'Kit', 1, 60, 0, $2::jsonb, true) returning id, custo`,
  [ctx.u, JSON.stringify([{ id: "x", nome: "Caneca", quantidade: 2, custoUnitario: 7, produtoId: comp }])],
)).id;
const custo = async (id) => n((await um(`select custo from produtos where id = $1`, [id])).custo);
confere("kit nasce com o custo atual do componente (1 + 2×10)", (await custo(kit)) === 21, String(await custo(kit)));
await q(`update produtos set custo_base = 15 where id = $1`, [comp]);
confere("componente muda de custo: kit recalcula (1 + 2×15)", (await custo(kit)) === 31, String(await custo(kit)));
const kit2 = (await um(
  `insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque, insumos) values ($1, 'K2', 'Kit de kit', 0, 90, 0, $2::jsonb) returning id`,
  [ctx.u, JSON.stringify([{ id: "y", nome: "Kit", quantidade: 1, custoUnitario: 0, produtoId: kit }])],
)).id;
await q(`update produtos set custo_base = 20 where id = $1`, [comp]);
confere("kit dentro de kit propaga em cadeia", (await custo(kit)) === 41 && (await custo(kit2)) === 41, `${await custo(kit)} / ${await custo(kit2)}`);
// Ciclo: A usa B, B usa A. Tem que terminar.
const a = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'CA', 'A', 1, 10, 0) returning id`, [ctx.u])).id;
const b = (await um(
  `insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque, insumos) values ($1, 'CB', 'B', 1, 10, 0, $2::jsonb) returning id`,
  [ctx.u, JSON.stringify([{ id: "a", nome: "A", quantidade: 1, custoUnitario: 0, produtoId: a }])],
)).id;
await q(`update produtos set insumos = $2::jsonb where id = $1`, [a, JSON.stringify([{ id: "b", nome: "B", quantidade: 1, custoUnitario: 0, produtoId: b }])]);
let ciclo = true;
try {
  await q(`update produtos set custo_base = 5 where id = $1`, [a]);
} catch (e) {
  ciclo = false;
  console.log(e.message);
}
confere("ciclo de composição (A usa B que usa A) não trava nem estoura a pilha", ciclo, `A=${await custo(a)} B=${await custo(b)}`);
const insumoAvulso = (await um(
  `insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque, insumos) values ($1, 'IA', 'Com embalagem', 5, 10, 0, $2::jsonb) returning id`,
  [ctx.u, JSON.stringify([{ id: "e", nome: "Embalagem", quantidade: 2, custoUnitario: 1.5 }])],
)).id;
confere("insumo avulso (sem produto) segue o custoUnitario gravado", (await custo(insumoAvulso)) === 8);

// ---------- 11) raio_x_vendas ignora pedido não pago ----------
const canal = (await um(`insert into canais (user_id, nome) values ($1, 'Shopee X') returning id`, [ctx.u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Loja') returning id`, [ctx.u, canal])).id;
const prodRx = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'RX', 'RX', 1, 10, 100) returning id`, [ctx.u])).id;
await q(`select importar_pedidos_marketplace($1, $2::jsonb)`, [loja, JSON.stringify([
  { numero: "S1", status: "concluido", criado_em: new Date(Date.now() - 2 * 864e5).toISOString(), pago_em: new Date(Date.now() - 2 * 864e5).toISOString(), subtotal: 10, repasse: 8, custo: 1, imposto: 0, lucro: 7, itens: [{ produto_id: prodRx, quantidade: 1, preco_unitario: 10, custo_unitario: 1 }] },
  { numero: "S2", status: "nao_pago", criado_em: new Date(Date.now() - 2 * 864e5).toISOString(), pago_em: null, subtotal: 30, repasse: 25, custo: 3, imposto: 0, lucro: 22, itens: [{ produto_id: prodRx, quantidade: 3, preco_unitario: 10, custo_unitario: 1 }] },
])]);
const rx = await q(`select quantidade from raio_x_vendas(30) where produto_id = $1 and loja_id = $2`, [prodRx, loja]);
confere("raio_x_vendas não conta pedido 'nao_pago'", rx.length === 1 && Number(rx[0].quantidade) === 1, JSON.stringify(rx));

// ---------- 12) vendas.lucro = DRE (conta limpa, sem despesas nem juros) ----------
ctx = await novaConta("dre@v.com", 4);
await q(`delete from pin_admin_tentativas`);
await um(`select definir_pin_admin('1234')`);
const d1 = await venda({ qtd: 3, desconto: 15, entrega: 12, forma: "Crédito", taxa: 2.5 });
const d2 = await venda({ qtd: 2, entrega: 8 });
await q(`update vendas set frete_custo = 9.9 where id = $1`, [d2.venda_id]);
r = await V(d2.venda_id);
confere("gravar frete_custo (etiqueta) recalcula o lucro", n(r.lucro) === lucroDre(r) && n(r.lucro) === n(100 + 8 - 40 - 4 - 9.9), String(r.lucro));
await q(`update vendas set lucro = 999999 where id = $1`, [d2.venda_id]);
confere("lucro escrito à mão é ignorado", n((await V(d2.venda_id)).lucro) === lucroDre(r));
const d3 = await venda({ qtd: 4, desconto: 7.77 });
await devolver(d3.venda_id, await itemDe(d3.venda_id), 1, 48.06, "reembolso", ctx.conta);
const d4 = await venda({ status: "fiado", cliente: ctx.cli, qtd: 2, entrada: 20, entradaForma: "pix", forma2: "Pix" });
await editar(d4.venda_id, { cliente: ctx.cli, desconto: 5, entrega: 3 });
const d5 = await venda({ qtd: 1 });
await devolver(d5.venda_id, await itemDe(d5.venda_id), 1, 50, "troca");
const dev5 = await um(`select id from devolucoes where venda_id = $1`, [d5.venda_id]);
await venda({ qtd: 1, credito: 50, troca: dev5.id });
const cancelada = await venda({ qtd: 1 });
await q(`select cancelar_venda($1)`, [cancelada.venda_id]);
for (const v of [d1, d3, d4]) {
  const x = await V(v.venda_id);
  confere(`venda ${v.venda_numero}: lucro gravado = conta do DRE`, n(x.lucro) === lucroDre(x), `${x.lucro} x ${lucroDre(x)}`);
}
const hoje = (await um(`select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') d`)).d;
const dre = await um(`select sum(lucro_liquido) l, sum(devolucoes) dv, sum(impostos) im from dre_mensal(date_trunc('month', $1::date)::date, $1::date)`, [hoje]);
const soma = await um(`select sum(lucro) l, sum(imposto_valor) im from vendas where status <> 'cancelada' and user_id = $1`, [ctx.u]);
confere("DRE do mês = soma de vendas.lucro", n(dre.l) === n(soma.l), `DRE ${dre.l} x vendas ${soma.l}`);
confere("DRE mostra o imposto já estornado pela devolução", n(dre.im) === n(soma.im));

// ---------- 13) Idempotência ----------
await db.exec(await lerMigracao(M));
confere("0083 roda 2× sem erro", true);
confere("e o DRE continua batendo", n((await um(`select sum(lucro_liquido) l from dre_mensal(date_trunc('month', $1::date)::date, $1::date)`, [hoje])).l) === n((await um(`select sum(lucro) l from vendas where status <> 'cancelada' and user_id = $1`, [ctx.u])).l));

await db.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
