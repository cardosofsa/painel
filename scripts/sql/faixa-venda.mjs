/** Faixa de venda (preço mínimo e máximo) e foto do anúncio com variações (0113). Rode com `npm run test:sql`. */
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


const u = await novoUsuario("faixa@e.com");
const outro = await novoUsuario("faixa2@e.com");

// Anúncio com foto e variação com faixa.
const anuncio = (await como(u, `insert into anuncios (nome_anuncio, imagem_url) values ('Café a granel', 'https://x.supabase.co/storage/v1/object/public/produtos/a.jpg') returning id, imagem_url`))[0];
confere("anúncio guarda a foto", anuncio.imagem_url.endsWith("a.jpg"));
const antiga = (await como(u, `insert into anuncio_variacoes (anuncio_id, nome_variacao, multiplicador, custo) values ($1, 'Kit 2', 2, 20) returning preco_minimo, preco_maximo`, [anuncio.id]))[0];
confere("variação sem faixa continua valendo (colunas nulas)", antiga.preco_minimo === null && antiga.preco_maximo === null);
const comFaixa = (await como(u, `insert into anuncio_variacoes (anuncio_id, nome_variacao, multiplicador, custo, preco_minimo, preco_maximo) values ($1, '500 g', 0.5, 22, 39.9, 59.9) returning preco_minimo, preco_maximo`, [anuncio.id]))[0];
confere("variação guarda mínimo e máximo", Number(comFaixa.preco_minimo) === 39.9 && Number(comFaixa.preco_maximo) === 59.9);
const soMin = (await como(u, `insert into anuncio_variacoes (anuncio_id, nome_variacao, preco_minimo) values ($1, 'Só mínimo', 10) returning preco_maximo`, [anuncio.id]))[0];
confere("só o mínimo também vale", soMin.preco_maximo === null);
await espera("mínimo maior que o máximo é recusado (variação)", () => como(u, `insert into anuncio_variacoes (anuncio_id, nome_variacao, preco_minimo, preco_maximo) values ($1, 'x', 60, 50)`, [anuncio.id]), "violates check");
await espera("preço negativo é recusado (variação)", () => como(u, `insert into anuncio_variacoes (anuncio_id, nome_variacao, preco_minimo) values ($1, 'x', -1)`, [anuncio.id]), "violates check");
await espera("foto com endereço gigante é recusada", () => como(u, `insert into anuncios (nome_anuncio, imagem_url) values ('x', $1)`, ["https://a.com/" + "a".repeat(1000)]), "violates check");

// Precificação (Individual e Kits).
const base = `insert into precificacoes (produto_nome, custo, taxa_variavel_pct, taxa_fixa, taxa_adicional_pct, imposto_pct, preco_calculado, lucro, origem, preco_minimo, preco_maximo)`;
const p = (await como(u, `${base} values ('Kit café', 30, 0.2, 4, 0, 0.06, 79.9, 20, 'individual', 69.9, 99.9) returning preco_minimo, preco_maximo`))[0];
confere("precificação guarda a faixa", Number(p.preco_minimo) === 69.9 && Number(p.preco_maximo) === 99.9);
await espera("mínimo maior que o máximo é recusado (precificação)", () => como(u, `${base} values ('x', 30, 0.2, 4, 0, 0.06, 79.9, 20, 'individual', 100, 90)`), "violates check");

// Isolamento: as policies de sempre cobrem as colunas novas.
confere("outra conta não vê o anúncio nem a precificação", (await como(outro, `select (select count(*) from anuncios)::int a, (select count(*) from precificacoes)::int p`))[0].a === 0);
const mudou = await como(outro, `update anuncio_variacoes set preco_minimo = 0 where anuncio_id = $1 returning id`, [anuncio.id]);
confere("outra conta não muda a faixa alheia", mudou.length === 0);

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
