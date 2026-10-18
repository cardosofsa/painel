/** Rascunho da Precificação (0100): isolado por conta, vínculo de produto e modo de cálculo. Rode com `npm run test:sql`. */
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

const u = await novoUsuario("prec@e.com");
const outro = await novoUsuario("prec2@e.com");
const suspensa = await novoUsuario("prec3@e.com", "suspenso");
const produto = (await um(`insert into produtos (user_id, sku, nome) values ($1, 'SKU1', 'Caneca') returning id`, [u])).id;
const produtoO = (await um(`insert into produtos (user_id, sku, nome) values ($1, 'SKU9', 'Dele') returning id`, [outro])).id;

const r = (await como(u, `insert into precificacao_rascunhos (visao, produto_id, titulo, dados) values ('individual', $1, 'Caneca · Shopee A', '{"margemPct": 28}'::jsonb) returning id, user_id`, [produto]))[0];
confere("cria o rascunho com user_id da sessão", r.user_id === u);
confere("outra conta não enxerga o rascunho", (await como(outro, `select count(*)::int n from precificacao_rascunhos`))[0].n === 0);
await espera("conta suspensa não grava rascunho", () => como(suspensa, `insert into precificacao_rascunhos (visao) values ('individual')`), "row-level security");
await espera("rascunho com produto de outra conta é recusado", () => como(u, `insert into precificacao_rascunhos (visao, produto_id) values ('individual', $1)`, [produtoO]));
await espera("não cria rascunho em nome de outra conta", () => como(u, `insert into precificacao_rascunhos (user_id, visao) values ($1, 'individual')`, [outro]), "row-level security");
await espera("não reatribui o rascunho para outra conta", () => como(u, `update precificacao_rascunhos set user_id = $1 where id = $2`, [outro, r.id]), "row-level security");
await espera("aba inválida é recusada", () => como(u, `insert into precificacao_rascunhos (visao) values ('raio-x')`), "violates check");
await espera("dados que não são objeto são recusados", () => como(u, `update precificacao_rascunhos set dados = '[1]'::jsonb where id = $1`, [r.id]), "violates check");
await espera("dados grandes demais são recusados", () => como(u, `update precificacao_rascunhos set dados = jsonb_build_object('x', repeat('a', 200001)) where id = $1`, [r.id]), "violates check");
confere("outra conta não apaga o rascunho", (await como(outro, `delete from precificacao_rascunhos where id = $1 returning id`, [r.id])).length === 0);

await q(`delete from produtos where id = $1`, [produto]);
confere("apagar o produto mantém o rascunho, sem produto", (await q(`select produto_id from precificacao_rascunhos where id = $1`, [r.id]))[0].produto_id === null);

// Modo de cálculo em precificacoes
const p = (await como(u, `insert into precificacoes (produto_nome, custo, preco_calculado, lucro, modo_calculo, parametro) values ('X', 10, 20, 5, 'markup', 0.5) returning modo_calculo, parametro`))[0];
confere("precificação guarda modo e parâmetro", p.modo_calculo === "markup" && Number(p.parametro) === 0.5);
confere("linha antiga (sem modo) continua válida", (await como(u, `insert into precificacoes (produto_nome, custo, preco_calculado, lucro) values ('Y', 10, 20, 5) returning modo_calculo`))[0].modo_calculo === null);
await espera("modo desconhecido é recusado", () => como(u, `insert into precificacoes (produto_nome, custo, preco_calculado, lucro, modo_calculo) values ('Z', 10, 20, 5, 'chute')`), "violates check");

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
