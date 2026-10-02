/** Kit com estoque dos componentes (0058), de ponta a ponta. Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

const u = (await um(`insert into auth.users (email) values ('k@k.com') returning id`)).id;
await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'k@k.com', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
const novo = async (sku, estoque) => (await um(`insert into produtos (user_id, sku, nome, custo, preco_venda, estoque) values ($1, $2, $2, 5, 20, $3) returning id`, [u, sku, estoque])).id;
const caneca = await novo("CANECA", 10);
const pires = await novo("PIRES", 5);
const insumos = JSON.stringify([
  { id: caneca, nome: "Caneca", quantidade: 2, custoUnitario: 5, produtoId: caneca },
  { id: pires, nome: "Pires", quantidade: 1, custoUnitario: 5, produtoId: pires },
  { id: "emb", nome: "Caixa", quantidade: 1, custoUnitario: 2 },
]);
const kit = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque, insumos, e_kit) values ($1, 'KIT', 'Kit café', 0, 50, 0, $2::jsonb, true) returning id`, [u, insumos])).id;
const est = async () => {
  const r = await q(`select sku, estoque from produtos where id = any($1::uuid[])`, [[caneca, pires, kit]]);
  return Object.fromEntries(r.map((x) => [x.sku, x.estoque]));
};
const venda = (qtd, reservar) =>
  um(`select * from registrar_venda(p_itens => $1::jsonb, p_status => 'paga', p_conta_id => $2, p_forma_pagamento => 'Pix', p_valor_entrega => 0, p_reservar => $3)`, [
    JSON.stringify([{ produto_id: kit, quantidade: qtd, preco_unitario: 50 }]),
    conta,
    reservar,
  ]);

let e = await est();
confere("estoque do kit = quantos dá para montar (10/2 e 5/1 → 5)", e.KIT === 5, JSON.stringify(e));

const v1 = await venda(2, false);
e = await est();
confere("venda no balcão baixa os componentes (caneca 6, pires 3, kit 3)", e.CANECA === 6 && e.PIRES === 3 && e.KIT === 3, JSON.stringify(e));
const movs = await q(`select produto_nome, tipo, quantidade from estoque_movimentacoes where motivo like 'Kit %' order by produto_nome`);
confere("movimentação registrada em cada componente", movs.length === 2 && movs[0].quantidade === 4 && movs[1].quantidade === 2, JSON.stringify(movs));

const v2 = await venda(1, true);
const res = await q(`select produto_id, quantidade from estoque_reservas where venda_id = $1`, [v2.venda_id]);
e = await est();
confere("reservar o kit reserva os componentes (sem reserva do kit)", res.length === 2 && !res.some((r) => r.produto_id === kit), JSON.stringify(res));
confere("kit cai pelo disponível (caneca 6−2=4 → 2; pires 3−1=2 → 2)", e.KIT === 2 && e.CANECA === 6, JSON.stringify(e));

await um(`select avancar_etapa_vendas(array[$1]::uuid[], 'imprimir')`, [v2.venda_id]);
e = await est();
const resDepois = (await um(`select count(*)::int n from estoque_reservas where venda_id = $1`, [v2.venda_id])).n;
confere("Enviar → Imprimir: reserva vira baixa dos componentes, sem baixar duas vezes", resDepois === 0 && e.CANECA === 4 && e.PIRES === 2 && e.KIT === 2, JSON.stringify(e));

await um(`select cancelar_venda($1)`, [v1.venda_id]);
e = await est();
confere("cancelar devolve aos componentes (caneca 8, pires 4, kit 4)", e.CANECA === 8 && e.PIRES === 4 && e.KIT === 4, JSON.stringify(e));

await q(`select registrar_movimentacao_estoque($1, 'saida', 3, 'venda avulsa')`, [pires]);
e = await est();
confere("vender o componente avulso derruba o kit (pires 1 → kit 1)", e.PIRES === 1 && e.KIT === 1, JSON.stringify(e));

const arm = (await um(`select count(*)::int n from estoque_armazem where produto_id = $1 and quantidade > 0`, [kit])).n;
confere("kit não ocupa saldo em armazém", arm === 0, `linhas: ${arm}`);

await q(`update produtos set insumos = $2::jsonb where id = $1`, [kit, JSON.stringify([{ id: caneca, nome: "Caneca", quantidade: 4, custoUnitario: 5, produtoId: caneca }])]);
confere("mudar a composição recalcula (8/4 → 2)", (await est()).KIT === 2);

await db.exec(await lerMigracao("0058_kits_componentes.sql"));
confere("0058 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
