/** Faixas de comissão (0107): regra Shopee de 01/10/2026, tarifa em % do preço e gravação validada. Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const M = "0107_faixas_shopee_2026.sql";
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

// ---------- Contas que já existiam antes da 0107 ----------
{
  const db = await criarBancoDeTeste({ antesDe: M });
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const um = async (sql, p = []) => (await q(sql, p))[0];
  const conta = async (email) => (await um(`insert into auth.users (email) values ($1) returning id`, [email])).id;
  const intocada = await conta("antes1@f.com");
  const editada = await conta("antes2@f.com");
  const canal = async (u) => (await um(`select id from canais where user_id = $1 and tipo_taxa = 'faixas'`, [u])).id;
  // A conta "editada" mudou a comissão da última faixa.
  await q(`update faixas_comissao_canal set comissao_pct = 15 where canal_id = $1 and preco_min = 200`, [await canal(editada)]);
  await db.exec(await lerMigracao(M));
  const faixas = async (u) => q(`select preco_min, preco_max, comissao_pct, tarifa_fixa, tarifa_fixa_pct from faixas_comissao_canal where canal_id = $1 order by ordem`, [await canal(u)]);
  const a = await faixas(intocada);
  confere("preset antigo intocado vira a regra de 01/10/2026", Number(a[0].preco_max) === 8.99 && Number(a[0].tarifa_fixa_pct) === 50 && Number(a[1].preco_min) === 9 && Number(a[1].tarifa_fixa) === 4.5);
  const b = await faixas(editada);
  confere("tabela que o dono editou não é tocada", Number(b[0].comissao_pct) === 50 && Number(b[4].comissao_pct) === 15);
  await db.exec(await lerMigracao(M));
  confere("rodar de novo não mexe", (await faixas(intocada)).length === 5 && Number((await faixas(editada))[0].comissao_pct) === 50);
  await db.close();
}

// ---------- Conta nova e a gravação validada ----------
const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
const espera = async (nome, fn, trecho) => {
  try {
    await fn();
    confere(nome, false, "devia ter dado erro");
  } catch (e) {
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 110));
  }
};
const novo = async (email) => {
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

const u = await novo("faixas@f.com");
const outro = await novo("faixas2@f.com");
const canal = (await um(`select id from canais where user_id = $1 and tipo_taxa = 'faixas'`, [u])).id;
const lista = async () => q(`select preco_min, preco_max, comissao_pct, tarifa_fixa, tarifa_fixa_pct from faixas_comissao_canal where canal_id = $1 order by ordem`, [canal]);
const nova = await lista();
confere("conta nova nasce com a regra de 01/10/2026", nova.length === 5 && Number(nova[0].tarifa_fixa_pct) === 50 && Number(nova[1].tarifa_fixa) === 4.5);

const salvar = (id, faixas) => como(id, `select salvar_faixas_canal($1, $2::jsonb)`, [canal, JSON.stringify(faixas)]);
await salvar(u, [
  { preco_min: 0, preco_max: 49.99, comissao_pct: 18, tarifa_fixa: 3, tarifa_fixa_pct: 0 },
  { preco_min: 50, preco_max: null, comissao_pct: 12, tarifa_fixa: 5 },
]);
confere("grava um conjunto válido", (await lista()).length === 2);
await espera("recusa tabela vazia", () => salvar(u, []), "pelo menos uma faixa");
await espera("recusa buraco entre faixas", () => salvar(u, [{ preco_min: 0, preco_max: 9.99, comissao_pct: 10, tarifa_fixa: 0 }, { preco_min: 12, preco_max: null, comissao_pct: 10, tarifa_fixa: 0 }]), "um centavo depois");
await espera("recusa a última fechada", () => salvar(u, [{ preco_min: 0, preco_max: 9.99, comissao_pct: 10, tarifa_fixa: 0 }]), "última faixa precisa ficar aberta");
await espera("recusa começo fora do zero", () => salvar(u, [{ preco_min: 5, preco_max: null, comissao_pct: 10, tarifa_fixa: 0 }]), "começar em R$ 0,00");
await espera("recusa comissão + % do preço ≥ 100%", () => salvar(u, [{ preco_min: 0, preco_max: null, comissao_pct: 60, tarifa_fixa: 0, tarifa_fixa_pct: 40 }]), "fora do permitido");
confere("conjunto inválido não apaga o que estava salvo", (await lista()).length === 2);
await espera("outra conta não grava no canal alheio", () => salvar(outro, [{ preco_min: 0, preco_max: null, comissao_pct: 1, tarifa_fixa: 0 }]), "Canal não encontrado");
await espera("% do preço acima de 100 é recusado pela coluna", () => q(`update faixas_comissao_canal set tarifa_fixa_pct = 120 where canal_id = $1`, [canal]), "violates check");

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
