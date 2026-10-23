/** Preço planejado por anúncio (0115). Rode com `npm run test:sql`. */
import { criarBancoDeTeste } from "./banco.mjs";

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
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 110));
  }
};
const novoUsuario = async (email) => {
  const id = (await um(`insert into auth.users (email) values ($1) returning id`, [email])).id;
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id, email]);
  return id;
};
await db.exec(`grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};


const u = await novoUsuario("planejado@e.com");
const outro = await novoUsuario("planejado2@e.com");

const canal = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Loja A') returning id`, [u, canal])).id;
const a1 = (await um(`insert into marketplace_anuncios (user_id, loja_id, item_id, model_id, sku) values ($1, $2, 100, 0, 'CAN') returning id, preco_planejado`, [u, loja]));
confere("anúncio sem preço planejado continua valendo", a1.preco_planejado === null);
await um(`insert into marketplace_anuncios (user_id, loja_id, item_id, model_id, sku) values ($1, $2, 200, 0, 'CAN') returning id`, [u, loja]);

const r = await como(u, `update marketplace_anuncios set preco_planejado = 39.9, margem_planejada = 0.25, preco_planejado_em = now() where item_id in (100, 200) returning preco_planejado`);
confere("dois anúncios do mesmo SKU na mesma loja guardam preço próprio", r.length === 2);
await como(u, `update marketplace_anuncios set preco_planejado = 44.9 where item_id = 200`);
const precos = await como(u, `select item_id, preco_planejado from marketplace_anuncios order by item_id`);
confere("preços diferentes no mesmo SKU", Number(precos[0].preco_planejado) === 39.9 && Number(precos[1].preco_planejado) === 44.9);

await espera("preço zero é recusado", () => como(u, `update marketplace_anuncios set preco_planejado = 0 where item_id = 100`), "violates check");
await espera("margem de 90% é recusada", () => como(u, `update marketplace_anuncios set margem_planejada = 0.9 where item_id = 100`), "violates check");

// A sincronização faz upsert só das colunas dela: o planejado fica.
await como(u, `insert into marketplace_anuncios (loja_id, item_id, model_id, sku, nome, estoque_shopee) values ($1, 100, 0, 'CAN', 'Caneca', 5) on conflict (loja_id, item_id, model_id) do update set nome = excluded.nome, estoque_shopee = excluded.estoque_shopee`, [loja]);
const depois = (await como(u, `select preco_planejado from marketplace_anuncios where item_id = 100`))[0];
confere("upsert da sincronização não apaga o preço planejado", Number(depois.preco_planejado) === 39.9);

const alheio = await como(outro, `update marketplace_anuncios set preco_planejado = 1 where item_id = 100 returning id`);
confere("outra conta não muda o preço alheio", alheio.length === 0);

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
