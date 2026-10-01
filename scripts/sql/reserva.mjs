/**
 * Reserva de estoque e esteira de expedição (0052), de ponta a ponta, num Postgres de
 * verdade (PGlite) com todas as migrações. Rode com `npm run test:sql`.
 */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste({ verbose: true });
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
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 90));
  }
};

// Conta de teste ativa
const u = (await um(`insert into auth.users (email) values ('t@t.com') returning id`)).id;
await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 't@t.com', 'usuario', 'ativo', '{}')
         on conflict (user_id) do update set status = 'ativo'`, [u]);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
const p = (await um(`insert into produtos (user_id, sku, nome, custo, preco_venda, estoque) values ($1, 'FITA-1', 'Fita', 5, 20, 10) returning id`, [u])).id;
const itens = (qtd) => JSON.stringify([{ produto_id: p, quantidade: qtd, preco_unitario: 20 }]);
const venda = async (qtd, reservar, entrega = 0) =>
  um(`select * from registrar_venda(p_itens => $1::jsonb, p_status => 'paga', p_conta_id => $2, p_forma_pagamento => 'Pix', p_valor_entrega => $3, p_reservar => $4)`, [itens(qtd), conta, entrega, reservar]);
const disp = async () => um(`select fisico, reservado, disponivel from estoque_disponivel where produto_id = $1`, [p]);

// 1) Catálogo aprovado: reserva, não baixa
const v1 = await venda(3, true);
let v = await um(`select etapa, estoque_baixado, status_envio from vendas where id = $1`, [v1.venda_id]);
confere("pedido do catálogo entra em Para Enviar, reservado", v.etapa === "enviar" && v.estoque_baixado === false && v.status_envio === "separacao", JSON.stringify(v));
let d = await disp();
confere("físico 10, reservado 3, disponível 7", d.fisico === 10 && d.reservado === 3 && d.disponivel === 7, JSON.stringify(d));

// 2) Balcão respeita o disponível
await espera("balcão não vende o que está reservado (8 > 7)", () => venda(8, false), "Estoque insuficiente");
const v2 = await venda(5, false);
v = await um(`select etapa, status_envio, estoque_baixado from vendas where id = $1`, [v2.venda_id]);
confere("balcão sem entrega entra Concluído e baixa na hora", v.etapa === "concluido" && v.estoque_baixado === true, JSON.stringify(v));
const v2b = await venda(1, false, 10);
v = await um(`select etapa, status_envio from vendas where id = $1`, [v2b.venda_id]);
confere("balcão com entrega entra Enviado", v.etapa === "enviado" && v.status_envio === "enviado", JSON.stringify(v));
d = await disp();
confere("depois do balcão: físico 4, reservado 3, disponível 1", d.fisico === 4 && d.reservado === 3 && d.disponivel === 1, JSON.stringify(d));

// 3) Enviar → Imprimir: a reserva vira baixa
await um(`select avancar_etapa_vendas(array[$1]::uuid[], 'imprimir')`, [v1.venda_id]);
v = await um(`select etapa, estoque_baixado from vendas where id = $1`, [v1.venda_id]);
d = await disp();
confere("Imprimir baixa: físico 1, reservado 0", v.etapa === "imprimir" && v.estoque_baixado && d.fisico === 1 && d.reservado === 0, JSON.stringify({ v, d }));
const mov = await um(`select count(*)::int n from estoque_movimentacoes where motivo like '%(expedição)'`);
confere("movimentação de saída da expedição registrada", mov.n === 1);
await um(`select avancar_etapa_vendas(array[$1]::uuid[], 'retirada')`, [v1.venda_id]);
d = await disp();
confere("avançar de novo não baixa duas vezes", d.fisico === 1, JSON.stringify(d));

// 4) Sem estoque: Para Reservar, e não sai sem estoque
const v3 = await venda(5, true);
v = await um(`select etapa, estoque_baixado from vendas where id = $1`, [v3.venda_id]);
const r3 = await um(`select count(*)::int n from estoque_reservas where venda_id = $1`, [v3.venda_id]);
confere("sem estoque: entra em Para Reservar, sem reserva", v.etapa === "reservar" && r3.n === 0, JSON.stringify(v));
await espera("não sai de Para Reservar sem estoque", () => um(`select avancar_etapa_vendas(array[$1]::uuid[], 'enviar')`, [v3.venda_id]), "Sem estoque disponível");
await q(`update produtos set estoque = 20 where id = $1`, [p]);
await um(`select avancar_etapa_vendas(array[$1]::uuid[], 'enviar')`, [v3.venda_id]);
d = await disp();
confere("com estoque chegando, reserva e sai de Para Reservar", d.reservado === 5, JSON.stringify(d));

// 5) Cancelar pedido só reservado libera (não "devolve")
await um(`select cancelar_venda($1)`, [v3.venda_id]);
d = await disp();
confere("cancelar reservado: físico igual (20), reserva liberada", d.fisico === 20 && d.reservado === 0, JSON.stringify(d));
// Cancelar baixado devolve
await um(`select cancelar_venda($1)`, [v1.venda_id]);
d = await disp();
confere("cancelar já baixado devolve o estoque (20 + 3)", d.fisico === 23, JSON.stringify(d));

// 6) Marketplace: reserva no READY_TO_SHIP, baixa no PROCESSED, estorno no cancelado
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa, icone, cor) values ($1, 'Shopee', 'faixas', 'ShoppingBag', '#EE4D2D') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Loja') returning id`, [u, canal])).id;
const ped = (status, original) =>
  JSON.stringify([{ numero: "MKT1", status, status_original: original, criado_em: new Date().toISOString(), pago_em: null, comprador: "x", cidade: null, uf: "SP", rastreio: null, subtotal: 20, desconto_vendedor: 0, cupom_vendedor: 0, comissao: 2, taxa_servico: 1, taxa_transacao: 0, frete_comprador: 0, repasse: 17, custo: 5, imposto: 0, lucro: 12, custo_incompleto: false, itens: [{ produto_id: p, sku: "FITA-1", sku_principal: null, nome: "Fita", variacao: null, quantidade: 2, preco_unitario: 10, custo_unitario: 5 }] }]);
await um(`select importar_pedidos_marketplace($1, $2::jsonb)`, [loja, ped("a_enviar", "READY_TO_SHIP")]);
d = await disp();
let m = await um(`select estoque_reservado, estoque_baixado from pedidos_marketplace where numero = 'MKT1'`);
confere("Shopee pago esperando envio: reserva 2, físico igual", d.reservado === 2 && d.fisico === 23 && m.estoque_reservado && !m.estoque_baixado, JSON.stringify({ d, m }));
await um(`select importar_pedidos_marketplace($1, $2::jsonb)`, [loja, ped("a_enviar", "READY_TO_SHIP")]);
d = await disp();
confere("reimportar não reserva de novo", d.reservado === 2, JSON.stringify(d));
await um(`select importar_pedidos_marketplace($1, $2::jsonb)`, [loja, ped("a_enviar", "PROCESSED")]);
d = await disp();
m = await um(`select estoque_reservado, estoque_baixado from pedidos_marketplace where numero = 'MKT1'`);
confere("PROCESSED baixa: físico 21, reserva 0", d.fisico === 21 && d.reservado === 0 && m.estoque_baixado && !m.estoque_reservado, JSON.stringify({ d, m }));
await um(`select importar_pedidos_marketplace($1, $2::jsonb)`, [loja, ped("cancelado", "CANCELLED")]);
d = await disp();
confere("cancelado depois de baixado estorna (23)", d.fisico === 23, JSON.stringify(d));

// 7) Rodar a 0052 de novo (idempotência) não mexe nas etapas
const antes = await q(`select id, etapa from vendas order by id`);
await db.exec(await lerMigracao("0052_esteira_reserva_estoque.sql"));
const depois = await q(`select id, etapa from vendas order by id`);
confere("0052 rodada 2x não anda as etapas", JSON.stringify(antes) === JSON.stringify(depois));

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
