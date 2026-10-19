/** Variações com unidade, quantidade fracionada, embalagem e insumos (0111). Rode com `npm run test:sql`. */
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


const u = await novoUsuario("variacoes@e.com");
const outro = await novoUsuario("variacoes2@e.com");
const anuncio = (await como(u, `insert into anuncios (nome_anuncio) values ('Café a granel') returning id`))[0].id;

const antiga = (await como(u, `insert into anuncio_variacoes (anuncio_id, nome_variacao, multiplicador, custo) values ($1, 'Kit 2', 2, 20) returning multiplicador, unidade, custo_embalagem, custo_insumos`, [anuncio]))[0];
confere("variação como o código antigo grava: un, sem embalagem nem insumos", Number(antiga.multiplicador) === 2 && antiga.unidade === "un" && Number(antiga.custo_embalagem) === 0 && Number(antiga.custo_insumos) === 0);

const meio = (await como(u, `insert into anuncio_variacoes (anuncio_id, nome_variacao, multiplicador, unidade, custo_embalagem, custo_insumos, custo) values ($1, '500 g', 0.5, 'kg', 1.8, 0.35, 22.15) returning multiplicador`, [anuncio]))[0];
confere("quantidade fracionada em kg com embalagem e insumos", Number(meio.multiplicador) === 0.5);
await espera("unidade desconhecida é recusada", () => como(u, `insert into anuncio_variacoes (anuncio_id, nome_variacao, unidade) values ($1, 'x', 'g')`, [anuncio]), "violates check");
await espera("embalagem negativa é recusada", () => como(u, `insert into anuncio_variacoes (anuncio_id, nome_variacao, custo_embalagem) values ($1, 'x', -1)`, [anuncio]), "violates check");

confere("outra conta não vê as variações", (await como(outro, `select count(*)::int n from anuncio_variacoes`))[0].n === 0);
await espera("outra conta não grava variação no anúncio alheio", () => como(outro, `insert into anuncio_variacoes (anuncio_id, nome_variacao, unidade) values ($1, 'x', 'kg')`, [anuncio]), "row-level security");

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
