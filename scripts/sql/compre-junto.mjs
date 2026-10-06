/** "Compre junto" (0075): pares do mesmo pedido, só produtos visíveis, sem mesmo grupo. Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

const u = (await um(`insert into auth.users (email) values ('cj@c.com') returning id`)).id;
await q(
  `insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`,
  [u],
);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
await q(`insert into catalogos (user_id, nome, slug) values ($1, 'Loja', 'loja-cj')`, [u]);

const prod = async (sku, extra = {}) =>
  (
    await um(
      `insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque, ativo, grupo_id) values ($1, $2, $2, 1, 10, $3, $4, $5) returning id`,
      [u, sku, extra.estoque ?? 5, extra.ativo ?? true, extra.grupo ?? null],
    )
  ).id;
const grupo = (await um(`insert into produto_grupos (user_id, nome) values ($1, 'Caneca') returning id`, [u])).id;
const caneca = await prod("CANECA-AZUL", { grupo });
const canecaVerde = await prod("CANECA-VERDE", { grupo });
const colher = await prod("COLHER");
const pires = await prod("PIRES");
const semEstoque = await prod("TAMPA", { estoque: 0 });

// Vendas do PDV: caneca+colher 3 vezes, caneca+pires 1 vez, caneca+caneca verde (mesmo grupo), caneca+tampa (sem estoque).
const venda = async (ids, status = "paga") => {
  const v = (await um(`insert into vendas (user_id, status, total, data_venda) values ($1, $2, 10, now()) returning id`, [u, status])).id;
  for (const id of ids)
    await q(`insert into venda_itens (venda_id, produto_id, produto_nome, quantidade, preco_unitario) values ($1, $2, 'x', 1, 10)`, [v, id]);
};
for (let i = 0; i < 3; i++) await venda([caneca, colher]);
await venda([caneca, pires]);
await venda([caneca, canecaVerde]);
await venda([caneca, semEstoque]);
await venda([caneca, pires, pires], "cancelada");
// Marketplace: caneca+pires mais 3 vezes → pires passa a colher.
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa, icone, cor) values ($1, 'Shopee', 'faixas', 'x', '#000') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'L') returning id`, [u, canal])).id;
if (loja) {
  for (let i = 0; i < 3; i++) {
    const p = (
      await um(
        `insert into pedidos_marketplace (user_id, loja_id, numero, status, criado_em_plataforma) values ($1, $2, $3, 'concluido', now()) returning id`,
        [u, loja, `MP${i}`],
      )
    ).id;
    for (const id of [caneca, pires])
      await q(`insert into pedidos_marketplace_itens (user_id, pedido_id, produto_id, nome, quantidade) values ($1, $2, $3, 'x', 1)`, [u, p, id]);
  }
}

await db.exec(
  `do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if; end $$; grant usage on schema public to anon;`,
);
await db.exec(`set role anon`);
const r = await q(`select * from compre_junto_publico('loja-cj') where produto_id = $1 order by posicao`, [caneca]);
await db.exec(`reset role`);
const ids = r.map((x) => x.relacionado_id);
confere("anônimo consulta pelo slug", r.length > 0);
confere("mesmo grupo, sem estoque e venda cancelada ficam de fora", !ids.includes(canecaVerde) && !ids.includes(semEstoque), JSON.stringify(ids));
if (loja) confere("marketplace conta: pires (4 pedidos) antes de colher (3)", ids[0] === pires && ids[1] === colher, JSON.stringify(r));
else confere("ordem pelo número de pedidos juntos", ids[0] === colher && ids[1] === pires, JSON.stringify(r));
confere("devolve posição, não quantidade", Object.keys(r[0]).sort().join() === "posicao,produto_id,relacionado_id");
confere("slug inexistente não devolve nada", (await q(`select * from compre_junto_publico('nao-existe')`)).length === 0);
await q(`update perfis_acesso set status = 'suspenso' where user_id = $1`, [u]);
confere("conta suspensa não devolve nada", (await q(`select * from compre_junto_publico('loja-cj')`)).length === 0);

await db.exec(await lerMigracao("0075_compre_junto.sql"));
confere("0075 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
