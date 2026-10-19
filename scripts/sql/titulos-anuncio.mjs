/** Versões do título × vendas (0104): histórico de título e vendas por período. Rode com `npm run test:sql`. */
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
const novoUsuario = async (email, status = "ativo") => {
  const id = (await um(`insert into auth.users (email) values ($1) returning id`, [email])).id;
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, 'usuario', $3, '{}') on conflict (user_id) do update set status = $3`, [id, email, status]);
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

const u = await novoUsuario("titulos@e.com");
const outro = await novoUsuario("titulos2@e.com");
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Loja A') returning id`, [u, canal])).id;
const produto = (await um(`insert into produtos (user_id, sku, nome) values ($1, 'SKU1', 'Caneca') returning id`, [u])).id;
const anuncio = (await um(`insert into marketplace_anuncios (user_id, loja_id, item_id, produto_id) values ($1, $2, 123, $3) returning id`, [u, loja, produto])).id;

// Histórico de título
await como(u, `insert into marketplace_titulos_historico (anuncio_id, titulo, origem) values ($1, 'Caneca Branca 300ml', 'painel')`, [anuncio]);
confere("grava a versão do título", (await como(u, `select count(*)::int n from marketplace_titulos_historico`))[0].n === 1);
confere("origem padrão é a sincronização", (await como(u, `insert into marketplace_titulos_historico (anuncio_id, titulo) values ($1, 'Caneca 300ml') returning origem`, [anuncio]))[0].origem === "sincronizacao");
confere("outra conta não lê o histórico", (await como(outro, `select count(*)::int n from marketplace_titulos_historico`))[0].n === 0);
await espera("outra conta não grava em anúncio alheio", () => como(outro, `insert into marketplace_titulos_historico (anuncio_id, titulo) values ($1, 'x')`, [anuncio]));
await espera("título vazio é recusado", () => como(u, `insert into marketplace_titulos_historico (anuncio_id, titulo) values ($1, '   ')`, [anuncio]), "violates check");
await espera("origem desconhecida é recusada", () => como(u, `insert into marketplace_titulos_historico (anuncio_id, titulo, origem) values ($1, 'x', 'ia')`, [anuncio]), "violates check");
await q(`delete from marketplace_anuncios where id = $1`, [anuncio]);
confere("apagar o anúncio leva o histórico junto", Number((await um(`select count(*) n from marketplace_titulos_historico`)).n) === 0);

// Vendas por período
const pedido = async (status, dias, qtd, preco) => {
  const id = (await um(`insert into pedidos_marketplace (user_id, loja_id, numero, status, pago_em) values ($1, $2, $3, $4, now() - make_interval(days => $5)) returning id`, [u, loja, `P${Math.random()}`, status, dias])).id;
  await q(`insert into pedidos_marketplace_itens (user_id, pedido_id, produto_id, nome, quantidade, preco_unitario) values ($1, $2, $3, 'Caneca', $4, $5)`, [u, id, produto, qtd, preco]);
};
await pedido("concluido", 3, 2, 50);
await pedido("concluido", 20, 1, 40);
await pedido("cancelado", 4, 5, 50);
await pedido("concluido", 40, 3, 30);
const ult10 = (await como(u, `select * from vendas_por_anuncio_periodo($1, $2, now() - interval '10 days', null)`, [loja, produto]))[0];
confere("últimos 10 dias: 2 unidades, sem o cancelado", Number(ult10.unidades) === 2 && Number(ult10.receita) === 100 && Number(ult10.pedidos) === 1);
const meio = (await como(u, `select * from vendas_por_anuncio_periodo($1, $2, now() - interval '30 days', now() - interval '10 days')`, [loja, produto]))[0];
confere("entre 30 e 10 dias atrás: 1 unidade", Number(meio.unidades) === 1 && Number(meio.receita) === 40);
confere("outra conta não vê as vendas", Number((await como(outro, `select * from vendas_por_anuncio_periodo($1, $2, now() - interval '90 days', null)`, [loja, produto]))[0].unidades) === 0);
await espera("anon não executa a função", async () => {
  await db.exec(`set role anon`);
  try {
    await db.query(`select * from vendas_por_anuncio_periodo($1, $2, now() - interval '1 day', null)`, [loja, produto]);
  } finally {
    await db.exec(`reset role`);
  }
}, "permission denied");

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
