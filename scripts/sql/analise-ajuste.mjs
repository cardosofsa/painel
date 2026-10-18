/** Análise e Ajuste (0102): tipo de IA, histórico de preço isolado por conta e vendas somadas no banco. Rode com `npm run test:sql`. */
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

const u = await novoUsuario("analise@e.com");
const outro = await novoUsuario("analise2@e.com");
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Loja A') returning id`, [u, canal])).id;
const produto = (await um(`insert into produtos (user_id, sku, nome) values ($1, 'SKU1', 'Caneca') returning id`, [u])).id;
const anuncio = (await um(`insert into marketplace_anuncios (user_id, loja_id, item_id, produto_id) values ($1, $2, 123, $3) returning id`, [u, loja, produto])).id;

// Tipo de IA
confere("ia_guardar_sugestao aceita 'analise_anuncio'", await como(u, `select ia_guardar_sugestao('analise_anuncio', 'h1', '{}', '{}', null)`).then(() => true, () => false));
confere("ia_buscar_sugestao devolve o que foi guardado", (await como(u, `select texto from ia_buscar_sugestao('analise_anuncio', 'h1')`)).length === 1);
await espera("tipo desconhecido continua recusado", () => como(u, `select * from ia_consumir('qualquer', 'sistema')`), "Tipo de geração inválido");

// Histórico de preço
await como(u, `insert into marketplace_precos_historico (anuncio_id, preco) values ($1, 59.9)`, [anuncio]);
confere("grava o histórico de preço", (await como(u, `select count(*)::int n from marketplace_precos_historico`))[0].n === 1);
confere("outra conta não lê o histórico", (await como(outro, `select count(*)::int n from marketplace_precos_historico`))[0].n === 0);
await espera("outra conta não grava em anúncio alheio", () => como(outro, `insert into marketplace_precos_historico (anuncio_id, preco) values ($1, 10)`, [anuncio]));
await espera("preço zero é recusado", () => como(u, `insert into marketplace_precos_historico (anuncio_id, preco) values ($1, 0)`, [anuncio]), "violates check");

// Vendas somadas no banco
const pedido = async (status, dias, qtd, preco) => {
  const id = (await um(`insert into pedidos_marketplace (user_id, loja_id, numero, status, pago_em) values ($1, $2, $3, $4, now() - make_interval(days => $5)) returning id`, [u, loja, `P${Math.random()}`, status, dias])).id;
  await q(`insert into pedidos_marketplace_itens (user_id, pedido_id, produto_id, nome, quantidade, preco_unitario) values ($1, $2, $3, 'Caneca', $4, $5)`, [u, id, produto, qtd, preco]);
};
await pedido("concluido", 3, 2, 50);
await pedido("enviado", 20, 1, 55.5);
await pedido("cancelado", 5, 9, 50);
await pedido("concluido", 60, 4, 45);
const v30 = (await como(u, `select * from vendas_por_anuncio($1, $2, 30)`, [loja, produto]))[0];
confere("30 dias: soma só os pagos e válidos", Number(v30.unidades) === 3 && Number(v30.receita) === 155.5 && Number(v30.pedidos) === 2, JSON.stringify(v30));
confere("preço médio exato", Number(v30.preco_medio) === 51.83);
const v90 = (await como(u, `select * from vendas_por_anuncio($1, $2, 90)`, [loja, produto]))[0];
confere("90 dias inclui o mais antigo", Number(v90.unidades) === 7);
confere("outra conta não vê as vendas", Number((await como(outro, `select * from vendas_por_anuncio($1, $2, 90)`, [loja, produto]))[0].unidades) === 0);
const semanas = await como(u, `select * from vendas_semanais_por_anuncio($1, $2, 12)`, [loja, produto]);
confere("vendas por semana somam o período", semanas.reduce((s, r) => s + Number(r.unidades), 0) === 7);

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
