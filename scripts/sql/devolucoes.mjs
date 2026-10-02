/** Devolução e troca com estorno parcial (0059). Rode com `npm run test:sql`. */
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

const u = (await um(`insert into auth.users (email) values ('d@d.com') returning id`)).id;
await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'd@d.com', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
const camisa = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'CAM', 'Camisa', 20, 50, 10) returning id`, [u])).id;
const cliente = (await um(`insert into clientes (user_id, nome, permite_fiado, limite_fiado) values ($1, 'Ana', true, 1000) returning id`, [u])).id;

const venda = async (qtd, extra = {}) =>
  um(`select * from registrar_venda(p_itens => $1::jsonb, p_status => $2, p_conta_id => $3, p_forma_pagamento => 'Pix', p_cliente_id => $4, p_parcelas_fiado => $5)`, [
    JSON.stringify([{ produto_id: camisa, quantidade: qtd, preco_unitario: 50 }]),
    extra.status ?? "paga",
    conta,
    extra.cliente ?? null,
    extra.parcelas ?? null,
  ]);
const itemDe = async (vendaId) => (await um(`select id from venda_itens where venda_id = $1`, [vendaId])).id;
const dev = (vendaId, itens, valor, forma, extra = {}) =>
  um(`select registrar_devolucao($1, $2::jsonb, $3, $4, $5, $6, $7) as r`, [vendaId, JSON.stringify(itens), valor, forma, extra.conta ?? null, extra.motivo ?? null, extra.tipo ?? "devolucao"]);
const estoque = async () => (await um(`select estoque from produtos where id = $1`, [camisa])).estoque;
const saldo = async () => Number((await um(`select saldo from contas where id = $1`, [conta])).saldo);

// 1) Venda paga de 3 camisas (R$ 150) → devolve 1 com reembolso.
const v1 = await venda(3);
const i1 = await itemDe(v1.venda_id);
const saldoAntes = await saldo();
const r1 = (await dev(v1.venda_id, [{ venda_item_id: i1, quantidade: 1, destino: "estoque" }], 50, "reembolso", { conta, motivo: "Tamanho errado" })).r;
const v1d = await um(`select total, lucro, custo_total, valor_devolvido from vendas where id = $1`, [v1.venda_id]);
confere("devolução parcial: número D-0001 e estoque de volta (10−3+1 = 8)", r1.numero === "D-0001" && (await estoque()) === 8, JSON.stringify(r1));
confere("reembolso sai do caixa", Math.abs((await saldo()) - (saldoAntes - 50)) < 0.01, `${saldoAntes} → ${await saldo()}`);
confere("venda ajustada (total 100, custo 40, lucro −50+20)", Number(v1d.total) === 100 && Number(v1d.custo_total) === 40 && Number(v1d.valor_devolvido) === 50, JSON.stringify(v1d));

// 2) Avaria: devolve 1, não volta ao estoque.
await dev(v1.venda_id, [{ venda_item_id: i1, quantidade: 1, destino: "avaria" }], 50, "reembolso", { conta });
confere("avaria não volta ao estoque", (await estoque()) === 8);

// 3) Não devolve mais do que vendeu.
await espera("limite por item (só resta 1)", () => dev(v1.venda_id, [{ venda_item_id: i1, quantidade: 2, destino: "estoque" }], 0, "nenhum"), "só restam 1");
await espera("estorno acima do que resta na venda", () => dev(v1.venda_id, [{ venda_item_id: i1, quantidade: 1, destino: "estoque" }], 999, "nenhum"), "não pode passar");

// 4) Fiado parcelado em 2× → devolve 1 abatendo do que está em aberto.
const v2 = await venda(2, { status: "fiado", cliente, parcelas: 2 });
const i2 = await itemDe(v2.venda_id);
const aberto = async () => ({
  parcelas: Number((await um(`select coalesce(sum(valor),0) s from venda_parcelas where venda_id = $1 and status = 'pendente'`, [v2.venda_id])).s),
  receber: Number((await um(`select coalesce(sum(valor),0) s from contas_a_pagar_receber where referencia_venda_id = $1 and status = 'pendente'`, [v2.venda_id])).s),
});
const antes = await aberto();
await dev(v2.venda_id, [{ venda_item_id: i2, quantidade: 1, destino: "estoque" }], 50, "abater");
const depois = await aberto();
confere(
  "abater: parcelas e conta a receber caem os mesmos R$ 50 (são o mesmo dinheiro)",
  Math.abs(antes.parcelas - depois.parcelas - 50) < 0.01 && Math.abs(antes.receber - depois.receber - 50) < 0.01,
  `${JSON.stringify(antes)} → ${JSON.stringify(depois)}`,
);

// 5) Troca: sem dinheiro agora, vira crédito.
const v3 = await venda(1);
const r3 = (await dev(v3.venda_id, [{ venda_item_id: await itemDe(v3.venda_id), quantidade: 1, destino: "estoque" }], 50, "troca", { tipo: "troca" })).r;
confere("troca registra o crédito sem mexer no caixa", Number(r3.estorno) === 50);

// 6) Pedido ainda reservado (esteira): devolver libera a reserva.
const v4 = await um(`select * from registrar_venda(p_itens => $1::jsonb, p_status => 'paga', p_conta_id => $2, p_forma_pagamento => 'Pix', p_reservar => true)`, [
  JSON.stringify([{ produto_id: camisa, quantidade: 2, preco_unitario: 50 }]),
  conta,
]);
const fis = await estoque();
await dev(v4.venda_id, [{ venda_item_id: await itemDe(v4.venda_id), quantidade: 1, destino: "estoque" }], 50, "reembolso", { conta });
const res = Number((await um(`select coalesce(sum(quantidade),0) s from estoque_reservas where venda_id = $1`, [v4.venda_id])).s);
confere("reservado: libera 1 da reserva sem dar entrada no estoque", res === 1 && (await estoque()) === fis, `reserva ${res}, físico ${await estoque()}`);

await db.exec(await lerMigracao("0059_devolucoes.sql"));
confere("0059 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
