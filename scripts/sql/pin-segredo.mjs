/**
 * 0081: hash do PIN fora do PostgREST, troca de PIN pedindo o atual, contagem de tentativas
 * nas RPCs de operador e `conta_ativa()` nas RPCs que escreviam sem conferir. `npm run test:sql`.
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

await db.exec(`
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
`);
// O `grant ... on all tables` acima imita o Supabase, que dá tudo ao authenticated: a 0081
// precisa tirar de novo da tabela do segredo.
await db.exec(`revoke all on pin_admin_segredo from anon, authenticated`);
const como = async (papel, id, sql, p = [], claims = {}) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify(claims)}', false)`);
  await db.exec(`set role ${papel}`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};
const ativar = (id, status = "ativo") =>
  q(
    `insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, 'usuario', $3, '{}') on conflict (user_id) do update set status = excluded.status`,
    [id, `${id}@teste`, status],
  );
const u = (await um(`insert into auth.users (email) values ('p81@s.com') returning id`)).id;
const susp = (await um(`insert into auth.users (email) values ('x81@s.com') returning id`)).id;
await ativar(u);
await ativar(susp);
const tentativas = async () => (await um(`select falhas from pin_admin_tentativas where user_id = $1`, [u]))?.falhas ?? 0;
const zerar = () => q(`delete from pin_admin_tentativas where user_id = $1`, [u]);

// ---------- 1) O hash não sai do banco ----------
const r1 = (await como("authenticated", u, `select definir_pin_admin('1234') r`))[0].r;
confere("primeiro PIN não pede o atual", r1?.ok === true, JSON.stringify(r1));
confere("tem_pin_admin diz que existe", (await como("authenticated", u, `select tem_pin_admin() t`))[0].t === true);
await espera("a tabela do segredo não é legível pela API", () => como("authenticated", u, `select hash from pin_admin_segredo`), "permission denied");
await espera("nem gravável", () => como("authenticated", u, `update pin_admin_segredo set hash = 'x'`), "permission denied");
await como("authenticated", u, `insert into perfil_negocio (user_id, pin_admin_hash) values ($1, 'lixo') on conflict (user_id) do update set pin_admin_hash = 'lixo'`, [u]);
confere("a coluna antiga não guarda nada", (await um(`select pin_admin_hash h from perfil_negocio where user_id = $1`, [u])).h === null);
confere("e o PIN certo continua conferindo", (await como("authenticated", u, `select pin_admin_confere('1234') ok`))[0].ok === true);

// ---------- 2) Trocar pede o atual ----------
const r2 = (await como("authenticated", u, `select definir_pin_admin('5678') r`))[0].r;
confere("trocar sem o atual devolve erro no corpo", r2?.code === "P0001" && /incorreto/.test(r2.message), JSON.stringify(r2));
confere("e a tentativa fica contada", (await tentativas()) === 1);
const r3 = (await como("authenticated", u, `select definir_pin_admin(null, '0000') r`))[0].r;
confere("remover com o atual errado também não", r3?.code === "P0001" && (await tentativas()) === 2);
confere("o PIN antigo continua valendo", (await como("authenticated", u, `select pin_admin_confere('1234') ok`))[0].ok === true);
const r4 = (await como("authenticated", u, `select definir_pin_admin('5678', '1234') r`))[0].r;
confere("com o atual certo, troca", r4?.ok === true && (await como("authenticated", u, `select pin_admin_confere('5678') ok`))[0].ok === true);
const agora = Math.floor(Date.now() / 1000);
const r5 = (await como("authenticated", u, `select definir_pin_admin('4321') r`, [], { amr: [{ method: "password", timestamp: agora - 60 }] }))[0].r;
confere("login de 1 min atrás: troca sem o atual (esqueci o PIN)", r5?.ok === true);
const r6 = (await como("authenticated", u, `select definir_pin_admin('1111') r`, [], { amr: [{ method: "password", timestamp: agora - 3600 }] }))[0].r;
confere("login de 1 h atrás: pede o atual", r6?.code === "P0001");
await zerar();

// ---------- 3) Operador: PIN errado conta e bloqueia ----------
const salvar = (pin) =>
  como("authenticated", u, `select salvar_operador(null, 'Ana', '1234', array['pdv'], 0, 'venda', true, $1) r`, [pin]).then((x) => x[0].r);
for (let i = 0; i < 4; i++) await salvar("0000");
confere("4 PINs errados em salvar_operador ficam contados", (await tentativas()) === 4, String(await tentativas()));
const quinto = await salvar("0000");
const bloq = await um(`select bloqueado_ate from pin_admin_tentativas where user_id = $1`, [u]);
confere("o 5º bloqueia", /bloqueado/.test(quinto?.message ?? "") && bloq.bloqueado_ate !== null, JSON.stringify(quinto));
const bloqueado = (await como("authenticated", u, `select definir_exigir_operador(true, '4321') r`))[0].r;
confere("bloqueado: nem o certo passa em definir_exigir_operador", /bloqueado/.test(bloqueado?.message ?? ""));
await zerar();
const ok = await salvar("4321");
confere("PIN certo cria o operador", typeof ok?.id === "string", JSON.stringify(ok));
confere("definir_exigir_operador com PIN certo", (await como("authenticated", u, `select definir_exigir_operador(true, '4321') r`))[0].r?.ok === true);

// ---------- 4) editar_venda lê o PIN da tabela nova ----------
confere("editar_venda não lê mais a coluna antiga", (await um(`select prosrc ~ 'tem_pin_admin' s, prosrc ~ 'pin_admin_hash' v from pg_proc where proname = 'editar_venda'`)).s === true);

// ---------- 5) conta_ativa nas RPCs ----------
const rpcs = ["remover_pedido_marketplace", "atualizar_envio_marketplace", "revincular_itens_marketplace", "marcar_operador_venda", "entrar_operador"];
const semChecagem = await q(`select proname from pg_proc where proname = any($1) and prosrc !~ 'conta_ativa\\('`, [rpcs]);
confere("as 5 RPCs conferem conta_ativa()", semChecagem.length === 0, semChecagem.map((x) => x.proname).join(", "));
const op = (await um(`select id from operadores where user_id = $1`, [u])).id;
confere("conta ativa entra como operador", (await como("authenticated", u, `select * from entrar_operador($1, '1234')`, [op])).length === 1);
await ativar(u, "suspenso");
await espera("conta suspensa não entra como operador", () => como("authenticated", u, `select * from entrar_operador($1, '1234')`, [op]), "não está ativa");
await espera("nem marca operador em venda", () => como("authenticated", u, `select marcar_operador_venda(gen_random_uuid(), $1)`, [op]), "não está ativa");
await ativar(u);

// ---------- 6) Vitrine de conta suspensa ----------
await q(`insert into catalogos (user_id, nome, slug, formas_pagamento) values ($1, 'S', 'susp-81', array['Pix'])`, [susp]);
confere("catálogo ativo devolve as formas", (await como("anon", null, `select formas_pagamento_catalogo('susp-81') f`))[0].f?.length === 1);
await ativar(susp, "suspenso");
confere("conta suspensa: sem formas", (await como("anon", null, `select formas_pagamento_catalogo('susp-81') f`))[0].f === null);
confere("conta suspensa: pagamento não grava", (await como("anon", null, `select definir_pagamento_pedido_vitrine('susp-81', gen_random_uuid(), 'Pix') r`))[0].r === false);

// ---------- 7) Idempotente ----------
await db.exec(await lerMigracao("0081_pin_segredo_conta_ativa.sql"));
await db.exec(await lerMigracao("0081_pin_segredo_conta_ativa.sql"));
const dupla = await um(`select count(*)::int n from regexp_matches((select prosrc from pg_proc where proname = 'entrar_operador'), 'conta_ativa\\(', 'g')`);
confere("rodar de novo não duplica a checagem", dupla.n === 1, String(dupla.n));
confere("o PIN sobrevive à reexecução", (await como("authenticated", u, `select pin_admin_confere('4321') ok`))[0].ok === true);

// ---------- 8) Texto de função como o de produção (colado no SQL Editor) ----------
// Lá o remendo falhou: o corpo guardado tinha \r\n e não achava "\nbegin\n".
{
  const b = await criarBancoDeTeste({ antesDe: "0081" });
  await b.exec(
    "create or replace function marcar_operador_venda(p_venda_id uuid, p_operador_id uuid) returns void language plpgsql security definer set search_path = public as $$\r\nBEGIN\r\n  update vendas set operador_id = p_operador_id where id = p_venda_id and user_id = auth.uid();\r\nEND;\r\n$$;",
  );
  await b.exec(
    "create or replace function remover_pedido_marketplace(p_pedido_id uuid) returns void language plpgsql security definer set search_path = public as $$ declare v_x int; begin delete from pedidos_marketplace where id = p_pedido_id and user_id = auth.uid(); end; $$;",
  );
  let erro = null;
  try {
    await b.exec(await lerMigracao("0081_pin_segredo_conta_ativa.sql"));
    await b.exec(await lerMigracao("0081_pin_segredo_conta_ativa.sql"));
  } catch (e) {
    erro = e.message;
  }
  confere("0081 aplica com \\r\\n, BEGIN maiúsculo e begin na mesma linha", erro === null, erro ?? "");
  const r = (await b.query(`select proname, (select count(*) from regexp_matches(prosrc, 'conta_ativa\\(', 'g'))::int n from pg_proc where proname in ('marcar_operador_venda', 'remover_pedido_marketplace')`)).rows;
  confere("e as duas recebem a checagem uma vez só", r.length === 2 && r.every((x) => x.n === 1), JSON.stringify(r));
}

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
