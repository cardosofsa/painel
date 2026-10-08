/** Fechamento mensal (0088): isolamento entre contas, with check, conta suspensa e tipo 'relatorio' da IA. Rode com `npm run test:sql`. */
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
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 110));
  }
};

const a = (await um(`insert into auth.users (email) values ('fa@i.com') returning id`)).id;
const b = (await um(`insert into auth.users (email) values ('fb@i.com') returning id`)).id;
for (const id of [a, b]) await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
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

// A conta grava o próprio mês (é o que a Server Action faz).
await como(a, `insert into fechamentos_mensais (user_id, mes, saldo_inicial, projetado_inicial, projetado_atual, saldo_real) values ($1, '2026-10-01', 1000, 1500, 1500, 1000)`, [a]);
confere("a conta grava o próprio mês", (await como(a, `select * from fechamentos_mensais`)).length === 1);
confere("o user_id vem da sessão por padrão", (await como(a, `insert into fechamentos_mensais (mes) values ('2026-09-01') returning user_id`))[0].user_id === a);
confere("outra conta não enxerga o histórico", (await como(b, `select * from fechamentos_mensais`)).length === 0);
confere("outra conta não altera o histórico alheio", (await como(b, `update fechamentos_mensais set saldo_real = 0 returning id`)).length === 0);
confere("outra conta não apaga o histórico alheio", (await como(b, `delete from fechamentos_mensais returning id`)).length === 0);

await espera("não dá para gravar linha em nome de outra conta", () => como(b, `insert into fechamentos_mensais (user_id, mes) values ($1, '2026-08-01')`, [a]), "row-level security");
await espera("não dá para reatribuir a linha a outra conta", () => como(a, `update fechamentos_mensais set user_id = $1 where mes = '2026-10-01'`, [b]), "row-level security");
await espera("mês tem de ser o primeiro dia", () => como(a, `insert into fechamentos_mensais (mes) values ('2026-07-15')`), "check");
await espera("um mês por conta", () => como(a, `insert into fechamentos_mensais (mes) values ('2026-10-01')`), "duplicate key");

// Relatório da IA guardado no jsonb.
await como(a, `update fechamentos_mensais set relatorio = $1::jsonb where mes = '2026-10-01'`, [JSON.stringify({ resumo: "ok", plano: [] })]);
confere("o relatório fica guardado junto do mês", (await como(a, `select relatorio->>'resumo' as r from fechamentos_mensais where mes = '2026-10-01'`))[0].r === "ok");

await db.exec(`set role anon`);
await espera("anônimo não lê o histórico", () => db.query(`select * from fechamentos_mensais`), "permission denied");
await db.exec(`reset role`);

// IA: o tipo 'relatorio' passa nas três funções e no cache; tipo desconhecido continua recusado.
await q(`update perfis_acesso set papel = 'master' where user_id = $1`, [a]);
const cons = await como(a, `select * from ia_consumir('relatorio', 'sistema')`);
confere("ia_consumir aceita 'relatorio'", cons.length === 1);
await como(a, `select ia_guardar_sugestao('relatorio', 'h1', '{"resumo":"x"}', '{}', null)`);
const achou = await como(a, `select texto from ia_buscar_sugestao('relatorio', 'h1')`);
confere("o cache guarda e devolve o relatório", achou.length === 1 && achou[0].texto.includes("resumo"));
confere("o cache é por conta", (await como(b, `select texto from ia_buscar_sugestao('relatorio', 'h1')`)).length === 0);
await espera("tipo desconhecido segue recusado", () => como(a, `select * from ia_consumir('qualquer', 'sistema')`), "Tipo de geração inválido");

// Conta suspensa não lê nem grava.
await q(`update perfis_acesso set status = 'suspenso' where user_id = $1`, [b]);
await espera("conta suspensa não grava", () => como(b, `insert into fechamentos_mensais (mes) values ('2026-06-01')`), "row-level security");

await db.exec(await lerMigracao("0088_fechamentos_mensais_ia_relatorio.sql"));
confere("0088 roda 2x sem erro e não apaga o histórico", (await q(`select count(*)::int n from fechamentos_mensais`))[0].n === 2);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
