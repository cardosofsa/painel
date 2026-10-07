/** Programa de indicação (0078). Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};
const como = (id) => db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
const erroDe = async (sql, p = []) => {
  try {
    await db.query(sql, p);
    return null;
  } catch (e) {
    return e.message;
  }
};
const MIG = await lerMigracao("0078_indicacoes.sql");
await db.exec(MIG); // 2ª vez por cima da cadeia: idempotente

/** Cadastro como o Supabase faz: auth.users com metadados + perfil ativo (gatilho cria a assinatura de teste). */
async function cadastrar(email, meta = {}) {
  const id = (await um(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify(meta)])).id;
  await db.query(`update perfis_acesso set status = 'ativo' where user_id = $1`, [id]);
  return id;
}
const codigoDe = async (id) => (await um(`select codigo from codigos_indicacao where user_id = $1`, [id]))?.codigo;
const assinatura = (id) => um(`select plano_id, status, teste_ate, periodo_fim from assinaturas where user_id = $1`, [id]);

// Indicador.
const a = await cadastrar("a@a.com");
const codA = await codigoDe(a);
confere("conta nova ganha código de 7 caracteres sem ambíguos", /^[A-HJKMNP-Z2-9]{7}$/.test(codA ?? ""), codA);

// Cadastro com ref válido (minúsculo e com espaço: normaliza).
const b = await cadastrar("b@a.com", { ref: ` ${codA.toLowerCase()} `, utm_source: "instagram", utm_campaign: "lancamento" });
confere("ref válido grava a indicação", (await um(`select count(*)::int n from indicacoes where indicador_id = $1 and indicado_id = $2`, [a, b])).n === 1);

// Inválido, inexistente e lixo: cadastro passa, nada gravado.
const c = await cadastrar("c@a.com", { ref: "ZZZZZZZ" });
const d = await cadastrar("d@a.com", { ref: "'; drop table indicacoes; --" });
const e = await cadastrar("e@a.com", { ref: 12345 });
confere("ref inexistente/inválido não grava e não quebra o cadastro", (await um(`select count(*)::int n from indicacoes where indicado_id in ($1, $2, $3)`, [c, d, e])).n === 0);
confere("contas com ref inválido têm perfil e código", (await um(`select count(*)::int n from codigos_indicacao where user_id in ($1, $2, $3)`, [c, d, e])).n === 3);

// Próprio código: impossível no cadastro (o código nasce no mesmo gatilho), mas a tabela recusa.
const eProprio = await erroDe(`insert into indicacoes (indicador_id, indicado_id) values ($1, $1)`, [c]);
confere("indicação da própria conta é recusada", eProprio !== null, eProprio ?? "passou");

// Falha no meio não derruba o cadastro: com a tabela de códigos travada por um CHECK impossível.
await db.exec(`alter table codigos_indicacao add constraint teste_quebra check (false) not valid`);
const f = await cadastrar("f@a.com", { ref: codA });
await db.exec(`alter table codigos_indicacao drop constraint teste_quebra`);
confere("erro no gatilho de indicação não impede o cadastro", !!f && !!(await um(`select 1 as ok from perfis_acesso where user_id = $1`, [f])));

// RLS: A lê só as próprias; B não lê as de A; ninguém escreve.
// Como no Supabase: authenticated tem os grants de tabela; quem segura é o RLS.
await db.exec(`grant select, insert, update, delete on indicacoes, codigos_indicacao to authenticated`);
await como(a);
await db.exec(`set role authenticated`);
confere("indicador lê as próprias indicações", (await um(`select count(*)::int n from indicacoes`)).n >= 1);
const eIns = await erroDe(`insert into indicacoes (indicador_id, indicado_id) values ($1, $2)`, [a, c]);
confere("indicador não grava indicação pela API", eIns !== null, eIns ?? "passou");
await db.query(`update indicacoes set recompensado_em = now() where indicador_id = $1`, [a]);
confere("indicador não se marca recompensado pela API", (await um(`select count(*)::int n from indicacoes where recompensado_em is not null`)).n === 0);
const eCod = await erroDe(`update codigos_indicacao set codigo = 'AAAAAAA' where user_id = $1`, [a]);
confere("ninguém troca o próprio código pela API", eCod !== null || (await codigoDe(a)) === codA);
await como(b);
confere("outra conta não vê as indicações de A", (await um(`select count(*)::int n from indicacoes where indicador_id = $1`, [a])).n === 0);
confere("outra conta não vê o código de A", (await um(`select count(*)::int n from codigos_indicacao where user_id = $1`, [a])).n === 0);
await db.exec(`reset role`);

// RPC da tela.
await como(a);
const r = (await um(`select minhas_indicacoes() as r`)).r;
confere("minhas_indicacoes: código, link e contagem", r.codigo === codA && r.link === `/signup?ref=${codA}` && Number(r.cadastros) === 1 && Number(r.recompensadas) === 0, JSON.stringify(r));
confere("minhas_indicacoes não expõe e-mail", !JSON.stringify(r).includes("@"));

// Recompensa: B paga (Essencial) → B e A ganham 30 dias, uma vez só.
const antesA = await assinatura(a);
await db.query(`update assinaturas set status = 'ativa', plano_id = 'essencial', periodo_fim = now() + interval '30 days' where user_id = $1`, [b]);
const depoisB = await assinatura(b);
const depoisA = await assinatura(a);
const dias = (x, y) => Math.round((new Date(x) - new Date(y)) / 86400000);
confere("indicado ganha +30 dias no período pago", dias(depoisB.periodo_fim, Date.now()) === 60, JSON.stringify(depoisB));
confere("indicador em teste ganha +30 dias de teste", dias(depoisA.teste_ate, antesA.teste_ate) === 30, JSON.stringify(depoisA));
confere("indicação marcada como recompensada", (await um(`select recompensado_em is not null as ok from indicacoes where indicado_id = $1`, [b])).ok);

// Renovação/reativação não paga de novo.
await db.query(`update assinaturas set status = 'atrasada' where user_id = $1`, [b]);
await db.query(`update assinaturas set status = 'ativa', periodo_fim = now() + interval '30 days' where user_id = $1`, [b]);
const aDeNovo = await assinatura(a);
confere("recompensa só uma vez", dias(aDeNovo.teste_ate, depoisA.teste_ate) === 0 && dias((await assinatura(b)).periodo_fim, Date.now()) === 30);

// Ativa no Grátis não conta.
const g = await cadastrar("g@a.com", { ref: codA });
await db.query(`update assinaturas set status = 'ativa', plano_id = 'gratis' where user_id = $1`, [g]);
confere("ativar no Grátis não recompensa", (await um(`select recompensado_em is null as ok from indicacoes where indicado_id = $1`, [g])).ok);

// Indicador no Grátis (teste vencido) → 30 dias de Pro. E esse bônus não paga o indicador DELE.
const h = await cadastrar("h@a.com", { ref: codA }); // H foi indicado por A
const i = await cadastrar("i@a.com", { ref: await codigoDe(h) }); // I foi indicado por H
await db.query(`update assinaturas set teste_ate = now() - interval '1 day' where user_id = $1`, [h]);
const aAntes = await assinatura(a);
await db.query(`insert into assinaturas (user_id, plano_id, status, periodo_fim) values ($1, 'pro', 'ativa', now() + interval '30 days') on conflict (user_id) do update set plano_id = excluded.plano_id, status = excluded.status, periodo_fim = excluded.periodo_fim`, [i]);
const hDepois = await assinatura(h);
confere("indicador no Grátis ganha 30 dias de Pro", hDepois.plano_id === "pro" && hDepois.status === "ativa" && dias(hDepois.periodo_fim, Date.now()) === 30, JSON.stringify(hDepois));
confere("bônus não é pagamento: quem indicou o indicador não ganha", (await um(`select recompensado_em is null as ok from indicacoes where indicado_id = $1`, [h])).ok && dias((await assinatura(a)).teste_ate, aAntes.teste_ate) === 0);

// Conta sem linha em assinaturas (Pro sem prazo) não é rebaixada.
await db.query(`delete from assinaturas where user_id = $1`, [a]);
const j = await cadastrar("j@a.com", { ref: codA });
await db.query(`update assinaturas set status = 'ativa', plano_id = 'pro', periodo_fim = now() + interval '30 days' where user_id = $1`, [j]);
confere("indicador sem assinatura continua sem linha (Pro sem prazo)", !(await assinatura(a)) && (await um(`select plano_efetivo_id($1) p`, [a])).p === "pro");

// Admin.
await como(b);
const eAdm = await erroDe(`select admin_origem_conta($1)`, [b]);
confere("conta comum não lê a origem", /administrador/.test(eAdm ?? ""), eAdm ?? "passou");
const m = (await um(`insert into auth.users (email) values ('master@a.com') returning id`)).id;
await db.query(`update perfis_acesso set papel = 'master', status = 'ativo' where user_id = $1`, [m]);
await como(m);
const o = (await um(`select admin_origem_conta($1) as o`, [b])).o;
confere("master vê utm e quem indicou", o.utm_source === "instagram" && o.utm_campaign === "lancamento" && o.indicado_por === "a@a.com" && o.recompensado_em, JSON.stringify(o));
const o2 = (await um(`select admin_origem_conta($1) as o`, [c])).o;
confere("conta sem indicação: origem vazia", o2.indicado_por === null && o2.utm_source === null, JSON.stringify(o2));

// anon não executa as RPCs.
await db.exec(`set role anon`);
confere("anon não chama minhas_indicacoes", (await erroDe(`select minhas_indicacoes()`)) !== null);
await db.exec(`reset role`);

await db.exec(MIG);
confere("0078 roda 2x sem erro e mantém os códigos", (await codigoDe(b)) && (await um(`select count(*)::int n from indicacoes`)).n >= 4);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
