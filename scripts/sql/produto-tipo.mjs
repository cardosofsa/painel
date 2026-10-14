/** Tipo do produto (0096): insumo e embalagem fora da vitrine pública, backfill por categoria. Rode com `npm run test:sql`. */
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
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 110));
  }
};
const u = (await um(`insert into auth.users (email) values ('t@t.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('t2@t.com') returning id`)).id;
for (const id of [u, outro]) await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(`grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  await db.exec(id ? `set role authenticated` : `set role anon`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};

const catIns = (await um(`insert into categorias (user_id, nome, tipo) values ($1, 'Caixas', 'embalagem') returning id`, [u])).id;
const catProd = (await um(`insert into categorias (user_id, nome) values ($1, 'Bike') returning id`, [u])).id;

const merc = (await um(`insert into produtos (user_id, sku, nome, preco_venda, estoque, categoria_id) values ($1, 'FITA', 'Fita', 20, 10, $2) returning id`, [u, catProd])).id;
const caixa = (await um(`insert into produtos (user_id, sku, nome, preco_venda, estoque, categoria_id, tipo) values ($1, 'CX-G', 'Caixa G', 0, 50, $2, 'embalagem') returning id`, [u, catIns])).id;
const bolha = (await um(`insert into produtos (user_id, sku, nome, preco_venda, estoque, tipo) values ($1, 'BOLHA', 'Plástico bolha', 0, 30, 'insumo') returning id`, [u])).id;

confere("tipo padrão é 'produto'", (await um(`select tipo from produtos where id = $1`, [merc])).tipo === "produto");
await espera("tipo inválido é recusado", () => q(`update produtos set tipo = 'servico' where id = $1`, [merc]), "check");

// Vitrine pública e "compre junto".
await q(`insert into catalogos (user_id, nome, slug) values ($1, 'Loja', 'loja-tipo')`, [u]);
const vitrine = (await como(null, `select produto_id from obter_catalogo_publico('loja-tipo')`)).map((x) => x.produto_id);
confere("vitrine pública mostra só a mercadoria", vitrine.includes(merc) && !vitrine.includes(caixa) && !vitrine.includes(bolha), `${vitrine.length} item(ns)`);
// Com preço (o RPC recusa "sem preço" antes), só o trigger do tipo barra o item.
await q(`update produtos set preco_venda = 5 where id = $1`, [caixa]);
await espera(
  "pedido da vitrine com insumo é recusado",
  () => q(`select * from criar_pedido_vitrine(p_slug => 'loja-tipo', p_itens => $1::jsonb, p_nome => 'Ana', p_whatsapp => '11999999999', p_observacao => null, p_idempotencia => gen_random_uuid())`, [JSON.stringify([{ produto_id: caixa, quantidade: 1 }])]),
  "saíram do catálogo",
);
const cj = await como(null, `select produto_id, relacionado_id from compre_junto_publico('loja-tipo')`);
confere("compre junto roda sem expor insumo", cj.every((r) => r.produto_id !== caixa && r.relacionado_id !== caixa));

// Backfill: produto que já estava em categoria de embalagem vira embalagem (rodando a migração de novo por cima).
const antigo = (await um(`insert into produtos (user_id, sku, nome, estoque, categoria_id) values ($1, 'FITA-ANTIGA', 'Fita antiga', 5, $2) returning id`, [u, catIns])).id;
confere("antes da migração rodar de novo, o produto da categoria de embalagem ainda é 'produto'", (await um(`select tipo from produtos where id = $1`, [antigo])).tipo === "produto");
await db.exec(await lerMigracao("0096_produto_tipo_insumo_embalagem.sql"));
confere("0096 de novo: quem está em categoria de embalagem migra", (await um(`select tipo from produtos where id = $1`, [antigo])).tipo === "embalagem");
confere("mercadoria de categoria comum não muda", (await um(`select tipo from produtos where id = $1`, [merc])).tipo === "produto");
confere("insumo/embalagem já marcados continuam", (await um(`select tipo from produtos where id = $1`, [caixa])).tipo === "embalagem" && (await um(`select tipo from produtos where id = $1`, [bolha])).tipo === "insumo");

// Estoque e compras continuam enxergando insumo.
confere("o dono ainda lê o insumo (estoque/compras precisam dele)", (await como(u, `select count(*)::int n from produtos where tipo <> 'produto'`))[0].n === 3);
confere("outra conta não enxerga", (await como(outro, `select count(*)::int n from produtos where tipo <> 'produto'`))[0].n === 0);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
