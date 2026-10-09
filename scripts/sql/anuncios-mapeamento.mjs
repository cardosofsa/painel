/** Colunas de mapeamento de anúncio (0093): gravação, isolamento e idempotência. Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};
const novoUsuario = async (email) => {
  const id = (await um(`insert into auth.users (email) values ($1) returning id`, [email])).id;
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id, email]);
  return id;
};
await db.exec(`grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};

const u = await novoUsuario("anuncio@s.com");
const outro = await novoUsuario("outro@s.com");
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Cardoso') returning id`, [u, canal])).id;

await q(
  `insert into marketplace_anuncios (user_id, loja_id, item_id, model_id, sku, nome, imagem_url, link, sku_modelo, sku_principal, variacao, nome_item)
   values ($1, $2, 58217726569, 189626529132, 'BCOP-MISTA-KIT2', 'Bainha · preta + café,2 unidades', 'https://img/x.jpg', 'https://shopee/x', 'BCOP-MISTA-KIT2', 'BCOP', 'preta + café,2 unidades', 'Bainha de Couro')`,
  [u, loja],
);
const l = await um(`select * from marketplace_anuncios where user_id = $1`, [u]);
confere("grava foto, link, SKU da variação, SKU do pai, variação e título", l.imagem_url === "https://img/x.jpg" && l.sku_modelo === "BCOP-MISTA-KIT2" && l.sku_principal === "BCOP" && l.variacao.startsWith("preta") && l.nome_item === "Bainha de Couro" && l.link === "https://shopee/x");
confere("o dono enxerga o anúncio", (await como(u, `select count(*)::int n from marketplace_anuncios`))[0].n === 1);
confere("outra conta não enxerga", (await como(outro, `select count(*)::int n from marketplace_anuncios`))[0].n === 0);
confere("anúncio antigo (sem as colunas novas) continua válido", (await q(`insert into marketplace_anuncios (user_id, loja_id, item_id, model_id) values ($1, $2, 1, 0) returning id`, [u, loja])).length === 1);

await db.exec(await lerMigracao("0093_anuncios_para_mapeamento.sql"));
confere("0093 roda 2x e mantém os dados", (await um(`select count(*)::int n from marketplace_anuncios where imagem_url is not null`)).n === 1);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
