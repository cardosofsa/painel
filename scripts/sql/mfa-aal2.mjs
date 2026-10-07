/**
 * MFA no banco (0080): conta_ativa() e e_master() exigem `aal2` de quem tem fator verificado.
 * O `auth.mfa_factors` e o `auth.jwt()` (lê request.jwt.claims) de mentira vêm de banco.mjs.
 * Rode com `npm run test:sql`.
 */
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
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 120));
  }
};

// A 0080 já entrou pela cadeia; roda de novo duas vezes por cima para provar idempotência.
const sql0080 = await lerMigracao("0080_mfa_aal2.sql");
await db.exec(sql0080);
await db.exec(sql0080);
confere("0080 roda de novo por cima sem erro", true);

await db.exec(`
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated;
`);

/** Executa como `authenticated`, com o `sub` e o `aal` do JWT simulados. */
const como = async (id, aal, sql, p = []) => {
  const claims = JSON.stringify({ sub: id, role: "authenticated", ...(aal ? { aal } : {}) });
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [id, claims]);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
    await db.exec(`select set_config('request.jwt.claims', '', false)`);
  }
};
const ativar = (id, papel = "usuario") =>
  q(
    `insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, $3, 'ativo', '{}') on conflict (user_id) do update set status = 'ativo', papel = excluded.papel`,
    [id, `${id}@teste`, papel],
  );
const novoUsuario = async (email, papel) => {
  const id = (await um(`insert into auth.users (email) values ($1) returning id`, [email])).id;
  await ativar(id, papel);
  await q(`insert into produtos (user_id, sku, nome) values ($1, $2, 'Produto de teste')`, [id, `SKU-${email}`]);
  return id;
};

const semFator = await novoUsuario("sem@mfa.com");
const comFator = await novoUsuario("com@mfa.com");
const naoVerificado = await novoUsuario("pendente@mfa.com");
const master = await novoUsuario("master@mfa.com", "master");
await q(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified'), ($2, 'unverified'), ($3, 'verified')`, [comFator, naoVerificado, master]);

const produtos = async (id, aal) => (await como(id, aal, `select count(*)::int n from produtos`))[0].n;
const ativa = async (id, aal) => (await como(id, aal, `select conta_ativa() ok`))[0].ok;
const eMaster = async (id, aal) => (await como(id, aal, `select e_master() ok`))[0].ok;
const anotar = (id, aal) => como(id, aal, `select anotar_pedidos_marketplace('{}'::uuid[], null, null, null) n`);

// ---------- Sem fator: nada muda ----------
confere("sem fator, aal1: conta_ativa()", (await ativa(semFator, "aal1")) === true);
confere("sem fator, sem claim aal: conta_ativa()", (await ativa(semFator, null)) === true);
confere("sem fator, aal1: lê os próprios produtos", (await produtos(semFator, "aal1")) === 1);
confere("sem fator, aal1: RPC com conta_ativa() responde", (await anotar(semFator, "aal1"))[0].n === 0);

// ---------- Fator verificado + aal1: bloqueado ----------
confere("fator verificado, aal1: conta_ativa() é falso", (await ativa(comFator, "aal1")) === false);
confere("fator verificado, sem claim aal: conta_ativa() é falso", (await ativa(comFator, null)) === false);
confere("fator verificado, aal1: produtos some (RLS)", (await produtos(comFator, "aal1")) === 0);
await espera(
  "fator verificado, aal1: INSERT em produtos é recusado",
  () => como(comFator, "aal1", `insert into produtos (sku, nome) values ('X-aal1', 'Invasor')`),
  "row-level security",
);
confere(
  "fator verificado, aal1: UPDATE não alcança linha nenhuma",
  (await como(comFator, "aal1", `update produtos set nome = 'mexido' returning id`)).length === 0 &&
    (await um(`select nome from produtos where user_id = $1`, [comFator])).nome === "Produto de teste",
);
await espera("fator verificado, aal1: RPC com conta_ativa() recusa", () => anotar(comFator, "aal1"), "Sessão expirada");
confere(
  "fator verificado, aal1: ainda lê o próprio perfis_acesso (middleware e /aguardando)",
  (await como(comFator, "aal1", `select status from perfis_acesso where user_id = auth.uid()`))[0]?.status === "ativo",
);

// ---------- aal2: liberado ----------
confere("fator verificado, aal2: conta_ativa()", (await ativa(comFator, "aal2")) === true);
confere("fator verificado, aal2: lê os próprios produtos", (await produtos(comFator, "aal2")) === 1);
confere("fator verificado, aal2: RPC com conta_ativa() responde", (await anotar(comFator, "aal2"))[0].n === 0);
await como(comFator, "aal2", `insert into produtos (sku, nome) values ('X-aal2', 'Novo')`);
confere("fator verificado, aal2: grava", (await um(`select count(*)::int n from produtos where user_id = $1`, [comFator])).n === 2);

// ---------- Fator só cadastrado (unverified): nada muda ----------
confere("fator não verificado, aal1: conta_ativa()", (await ativa(naoVerificado, "aal1")) === true);
confere("fator não verificado, aal1: lê os próprios produtos", (await produtos(naoVerificado, "aal1")) === 1);

// ---------- Isolamento continua: aal2 não abre a conta dos outros ----------
confere("aal2 não lê produto de outra conta", (await como(comFator, "aal2", `select count(*)::int n from produtos where user_id <> auth.uid()`))[0].n === 0);

// ---------- e_master() ----------
confere("master com fator, aal1: e_master() é falso", (await eMaster(master, "aal1")) === false);
confere("master com fator, aal2: e_master()", (await eMaster(master, "aal2")) === true);
confere("master com fator, aal1: não lê o perfil dos outros", (await como(master, "aal1", `select count(*)::int n from perfis_acesso`))[0].n === 1);
confere("master com fator, aal2: lê o perfil de todos", (await como(master, "aal2", `select count(*)::int n from perfis_acesso`))[0].n >= 4);
await q(`delete from auth.mfa_factors where user_id = $1`, [master]);
confere("master sem fator, aal1: e_master() como antes", (await eMaster(master, "aal1")) === true);
confere("usuário comum, aal2: e_master() continua falso", (await eMaster(comFator, "aal2")) === false);

// ---------- Fator removido (perdeu o celular, docs/seguranca-login.md) ----------
await q(`delete from auth.mfa_factors where user_id = $1`, [comFator]);
{
  // Cron/webhooks: RPC *_servico com JWT da service role e só o sub trocado para a conta.
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [comFator, JSON.stringify({ role: "service_role" })]);
  const r = (await q(`select conta_ativa() as ok`))[0].ok;
  await db.exec(`select set_config('request.jwt.claims', '', false)`);
  confere("service role (cron/webhook) em conta com fator: conta_ativa() continua verdadeira", r === true);
}
confere("fator removido pelo dono do projeto: aal1 volta a ter acesso", (await produtos(comFator, "aal1")) === 2);

console.log(falhas ? `\n${falhas} falha(s).` : "\nMFA aal2 (0080): tudo certo.");
process.exit(falhas ? 1 : 0);
