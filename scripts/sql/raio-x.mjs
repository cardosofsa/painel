/** Raio-X (0071): preços praticados, preço do anúncio e vendas recentes. Rode com `npm run test:sql`. */
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

const u = (await um(`insert into auth.users (email) values ('rx@r.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('rx2@r.com') returning id`)).id;
for (const id of [u, outro]) await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};

const canal = (await um(`insert into canais (user_id, nome, tipo_taxa, icone, cor) values ($1, 'Shopee', 'faixas', 'x', '#000') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Minha Shopee') returning id`, [u, canal])).id;
const prod = (await um(`insert into produtos (user_id, sku, nome, custo_base, estoque) values ($1, 'CAN', 'Caneca', 10, 50) returning id`, [u])).id;
const prodOutro = (await um(`insert into produtos (user_id, sku, nome, custo_base, estoque) values ($1, 'X', 'Alheio', 10, 5) returning id`, [outro])).id;

// 1) Preço praticado
await como(u, `insert into precos_praticados (chave, produto_id, loja_id, preco) values ('caneca|${loja}', $1, $2, 39.90)`, [prod, loja]);
confere("outra conta não vê o preço", (await como(outro, `select * from precos_praticados`)).length === 0);
await espera("preço zero recusado", () => como(u, `insert into precos_praticados (chave, preco) values ('x', 0)`), "check");
await espera("produto de outra conta recusado", () => como(u, `insert into precos_praticados (chave, produto_id, preco) values ('x', $1, 10)`, [prodOutro]), "não pertence");
await espera("with check: não grava em nome de outra conta", () => como(u, `insert into precos_praticados (user_id, chave, preco) values ($1, 'x', 10)`, [outro]), "row-level security");

// 2) Coluna de preço do anúncio
await q(`insert into marketplace_anuncios (user_id, loja_id, item_id, model_id, produto_id, preco_atual) values ($1, $2, 1, 0, $3, 42.5)`, [u, loja, prod]);
confere("marketplace_anuncios guarda o preço atual", Number((await um(`select preco_atual from marketplace_anuncios`)).preco_atual) === 42.5);

// 3) Vendas recentes
const ped = async (status, dias, qtd, preco) => {
  const p = (await um(`insert into pedidos_marketplace (user_id, loja_id, numero, status, pago_em) values ($1, $2, gen_random_uuid()::text, $3, now() - make_interval(days => $4)) returning id`, [u, loja, status, dias])).id;
  await q(`insert into pedidos_marketplace_itens (user_id, pedido_id, produto_id, nome, quantidade, preco_unitario) values ($1, $2, $3, 'Caneca', $4, $5)`, [u, p, prod, qtd, preco]);
};
await ped("concluido", 3, 2, 40);
await ped("enviado", 10, 1, 37);
await ped("cancelado", 5, 9, 1);
await ped("concluido", 60, 5, 99);
const v = (await um(`insert into vendas (user_id, numero, total, data_venda, status) values ($1, 'V-1', 60, now() - interval '2 days', 'paga') returning id`, [u])).id;
await q(`insert into venda_itens (venda_id, produto_id, produto_nome, quantidade, preco_unitario) values ($1, $2, 'Caneca', 2, 30)`, [v, prod]);
const r = await como(u, `select * from raio_x_vendas(30) order by loja_id nulls last`);
const daLoja = r.find((x) => x.loja_id === loja);
const proprias = r.find((x) => x.loja_id === null);
confere("marketplace: 3 unidades a R$ 39,00 (sem cancelado nem antigo)", daLoja && Number(daLoja.quantidade) === 3 && Number(daLoja.preco_medio) === 39, JSON.stringify(daLoja));
confere("PDV/catálogo separado (loja nula)", proprias && Number(proprias.quantidade) === 2 && Number(proprias.preco_medio) === 30, JSON.stringify(proprias));
confere("outra conta não vê as vendas", (await como(outro, `select * from raio_x_vendas(30)`)).length === 0);

await db.exec(await lerMigracao("0071_raio_x_precos.sql"));
confere("0071 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
