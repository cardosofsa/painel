/** Pendências da cobrança automática (0082). Rode com `npm run test:sql`. */
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
const MIG = await lerMigracao("0082_cobranca_pendencias.sql");
await db.exec(MIG); // 2ª vez por cima da cadeia: idempotente

async function cadastrar(email, meta = {}) {
  const id = (await um(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify(meta)])).id;
  await db.query(`update perfis_acesso set status = 'ativo' where user_id = $1`, [id]);
  return id;
}
const assinatura = (id) => um(`select * from assinaturas where user_id = $1`, [id]);
const dias = (x, y) => Math.round((new Date(x) - new Date(y)) / 86400000);

const cols = (await db.query(`select column_name from information_schema.columns where table_name = 'assinaturas'`)).rows.map((r) => r.column_name);
confere(
  "assinaturas tem as colunas novas",
  ["periodo_fim_provedor", "dias_bonus", "provedor_refs_encerradas", "provedor_pagamentos_estornados", "ultimo_pagamento_ref", "cancelamento_agendado"].every((c) => cols.includes(c)),
);
const nova = await cadastrar("nova@a.com");
const n = await assinatura(nova);
confere("conta nova: defaults vazios", n.dias_bonus === 0 && Array.isArray(n.provedor_refs_encerradas) && n.provedor_refs_encerradas.length === 0 && n.cancelamento_agendado === false);

// Indicação: A indica B; B paga pelo provedor (como o webhook grava).
const a = await cadastrar("a@a.com");
const codA = (await um(`select codigo from codigos_indicacao where user_id = $1`, [a])).codigo;
const b = await cadastrar("b@a.com", { ref: codA });
await db.query(`update assinaturas set status = 'ativa', plano_id = 'pro', teste_ate = null where user_id = $1`, [a]);
await db.query(`update assinaturas set periodo_fim = now() + interval '20 days', periodo_fim_provedor = now() + interval '20 days', provedor = 'asaas', provedor_ref = 'sub_A' where user_id = $1`, [a]);
const fimProv = (await um(`select (now() + interval '30 days') as t`)).t;
await db.query(
  `update assinaturas set status = 'ativa', plano_id = 'essencial', periodo_fim = $2, periodo_fim_provedor = $2, provedor = 'asaas', provedor_ref = 'sub_B', ultimo_pagamento_ref = 'pay_1' where user_id = $1`,
  [b, fimProv],
);
const bPago = await assinatura(b);
const aBonus = await assinatura(a);
confere("indicado: bônus vai para dias_bonus e para o período efetivo", bPago.dias_bonus === 30 && dias(bPago.periodo_fim, bPago.periodo_fim_provedor) === 30, JSON.stringify(bPago));
confere("indicador pagante: dias_bonus = 30", aBonus.dias_bonus === 30 && dias(aBonus.periodo_fim, aBonus.periodo_fim_provedor) === 30);
confere("indicação guarda o pagamento que a gerou", (await um(`select pagamento_ref from indicacoes where indicado_id = $1`, [b])).pagamento_ref === "pay_1");

// Renovação do provedor (webhook grava provedor + dias_bonus): o bônus continua.
await db.query(`update assinaturas set periodo_fim_provedor = periodo_fim_provedor + interval '30 days', periodo_fim = periodo_fim_provedor + interval '30 days' + make_interval(days => dias_bonus) where user_id = $1`, [b]);
const bRenov = await assinatura(b);
confere("renovação mantém o bônus", dias(bRenov.periodo_fim, bRenov.periodo_fim_provedor) === 30);

// Estorno de outro pagamento: nada. Do que gerou: tira 30 dias das duas, uma vez só.
await db.exec(`set role service_role`);
const outro = (await um(`select desfazer_bonus_indicacao($1, 'pay_2') as r`, [b])).r;
confere("estorno de outro pagamento não mexe no bônus", outro === false);
const r1 = (await um(`select desfazer_bonus_indicacao($1, 'pay_1') as r`, [b])).r;
const r2 = (await um(`select desfazer_bonus_indicacao($1, 'pay_1') as r`, [b])).r;
await db.exec(`reset role`);
const bEst = await assinatura(b);
const aEst = await assinatura(a);
confere("estorno desfaz o bônus do indicado", r1 === true && bEst.dias_bonus === 0 && dias(bEst.periodo_fim, bRenov.periodo_fim) === -30, JSON.stringify(bEst));
confere("estorno desfaz o bônus do indicador", aEst.dias_bonus === 0 && dias(aEst.periodo_fim, aBonus.periodo_fim) === -30);
confere("estorno repetido não desfaz de novo", r2 === false && dias((await assinatura(b)).periodo_fim, bEst.periodo_fim) === 0);
confere("indicação estornada não paga de novo na reativação", await (async () => {
  await db.query(`update assinaturas set status = 'atrasada' where user_id = $1`, [b]);
  await db.query(`update assinaturas set status = 'ativa' where user_id = $1`, [b]);
  return (await assinatura(b)).dias_bonus === 0;
})());

// Permissões: a conta não desfaz bônus; agenda só o próprio cancelamento.
await db.exec(`grant select, insert, update, delete on assinaturas to authenticated`);
await como(b);
await db.exec(`set role authenticated`);
const eDesf = await erroDe(`select desfazer_bonus_indicacao($1, 'pay_1')`, [a]);
confere("conta comum não chama desfazer_bonus_indicacao", eDesf !== null, eDesf ?? "passou");
const eUpd = await erroDe(`update assinaturas set dias_bonus = 999, provedor_refs_encerradas = '{}' where user_id = $1`, [b]);
const bDepoisUpd = await um(`select dias_bonus from assinaturas where user_id = $1`, [b]);
confere("conta não escreve na própria assinatura pela API", eUpd !== null || bDepoisUpd.dias_bonus === 0);
await db.query(`select agendar_cancelamento_assinatura(true)`);
await db.exec(`reset role`);
const bAg = await assinatura(b);
confere("agendar marca só a própria conta e só a marca", bAg.cancelamento_agendado === true && bAg.status === "ativa" && bAg.plano_id === "essencial" && (await assinatura(a)).cancelamento_agendado === false);
await como(b);
await db.exec(`set role authenticated`);
await db.query(`select agendar_cancelamento_assinatura(false)`);
await db.exec(`reset role`);
confere("desmarcar volta ao normal", (await assinatura(b)).cancelamento_agendado === false);
await db.exec(`set role anon`);
confere("anon não agenda cancelamento", (await erroDe(`select agendar_cancelamento_assinatura(true)`)) !== null);
await db.exec(`reset role`);

// Conta no Grátis com plano vencido (status ativa, período no passado) vale grátis.
await db.query(`update assinaturas set cancelamento_agendado = true, periodo_fim = now() - interval '1 minute' where user_id = $1`, [b]);
confere("período agendado vencido cai no Grátis", (await um(`select plano_efetivo_id($1) p`, [b])).p === "gratis");

await db.exec(MIG);
confere("0082 roda 2x sem erro e mantém os dados", (await um(`select count(*)::int n from indicacoes where pagamento_ref = 'pay_1' and estornado_em is not null`)).n === 1);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
