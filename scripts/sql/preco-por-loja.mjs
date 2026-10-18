/** Preço por loja (0101) e a cópia opcional do histórico. Rode com `npm run test:sql`. */
import fs from "node:fs";
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


const u = await novoUsuario("loja@e.com");
const outro = await novoUsuario("loja2@e.com");
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [u])).id;
const lojaA = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Loja A') returning id`, [u, canal])).id;
const lojaB = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Loja B') returning id`, [u, canal])).id;
const produto = (await um(`insert into produtos (user_id, sku, nome) values ($1, 'SKU1', 'Caneca') returning id`, [u])).id;
const precOutro = (await um(`insert into precificacoes (user_id, produto_nome, custo, preco_calculado, lucro) values ($1, 'Dele', 10, 20, 5) returning id`, [outro])).id;

const prec = (await como(u, `insert into precificacoes (produto_id, loja_id, produto_nome, custo, preco_calculado, lucro) values ($1, $2, 'Caneca', 30, 73.92, 20.7) returning id`, [produto, lojaA]))[0].id;
await como(u, `insert into produto_lojas (produto_id, loja_id, preco, precificacao_id, preco_atualizado_em) values ($1, $2, 73.92, $3, now())`, [produto, lojaA, prec]);
confere("grava o preço da loja", Number((await como(u, `select preco from produto_lojas where loja_id = $1`, [lojaA]))[0].preco) === 73.92);
confere("outra conta não vê o preço", (await como(outro, `select count(*)::int n from produto_lojas`))[0].n === 0);
await espera("preço zero é recusado", () => como(u, `update produto_lojas set preco = 0 where loja_id = $1`, [lojaA]), "violates check");
await espera("precificação de outra conta não pode ser ligada", () => como(u, `update produto_lojas set precificacao_id = $1 where loja_id = $2`, [precOutro, lojaA]), "não existe ou não pertence");
await como(u, `delete from precificacoes where id = $1`, [prec]);
confere("apagar a precificação mantém o preço e solta o vínculo", (await como(u, `select preco, precificacao_id from produto_lojas where loja_id = $1`, [lojaA])).every((r) => Number(r.preco) === 73.92 && r.precificacao_id === null));

// Cópia opcional do histórico: só preenche loja sem preço, nunca sobrescreve.
await como(u, `insert into precificacoes (produto_id, loja_id, produto_nome, custo, preco_calculado, lucro, criado_em) values ($1, $2, 'Caneca', 30, 60, 5, now() - interval '2 days')`, [produto, lojaB]);
await como(u, `insert into precificacoes (produto_id, loja_id, produto_nome, custo, preco_calculado, lucro) values ($1, $2, 'Caneca', 30, 65.5, 8)`, [produto, lojaB]);
await como(u, `insert into precificacoes (produto_id, loja_id, produto_nome, custo, preco_calculado, lucro) values ($1, $2, 'Caneca', 30, 99, 8)`, [produto, lojaA]);
const script = fs.readFileSync(new URL("../supabase/copiar-precos-historico.sql", import.meta.url), "utf8");
const [contagem, escrita] = script.split(/-- Passo 2[^\n]*\n/);
confere("passo 1 conta só a loja sem preço", Number((await q(contagem.replace(/--.*$/gm, "")))[0]?.lojas_que_ganham_preco) === 1);
const insert = escrita.split("\n").filter((l) => l.startsWith("-- ") && !l.startsWith("-- =")).map((l) => l.slice(3)).join("\n");
await db.exec(insert);
await db.exec(insert);
const linhas = await q(`select loja_id, preco from produto_lojas where produto_id = $1 order by preco`, [produto]);
confere("a cópia pega a precificação mais recente da loja sem preço", linhas.some((l) => l.loja_id === lojaB && Number(l.preco) === 65.5));
confere("a cópia não sobrescreve o preço já definido", linhas.some((l) => l.loja_id === lojaA && Number(l.preco) === 73.92));
confere("rodar de novo não duplica", linhas.length === 2);

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
