/** Modelos de mensagem, histórico de enviadas e compras por cliente (0069). Rode com `npm run test:sql`. */
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
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 100));
  }
};

const u = (await um(`insert into auth.users (email) values ('mm@m.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('mn@n.com') returning id`)).id;
for (const id of [u, outro]) await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};

// 1) Modelos: um por assunto, isolados por conta.
await como(u, `insert into mensagens_modelos (assunto, texto) values ('fiado_vence', 'Oi {cliente}, vence {vencimento}: {valor}. {pix}')`);
await como(u, `insert into mensagens_modelos (assunto, texto) values ('fiado_vence', 'Novo texto {cliente}') on conflict (user_id, assunto) do update set texto = excluded.texto`);
const meus = await como(u, `select assunto, texto from mensagens_modelos`);
confere("upsert troca o texto sem duplicar", meus.length === 1 && meus[0].texto === "Novo texto {cliente}");
confere("outra conta não vê o modelo", (await como(outro, `select * from mensagens_modelos`)).length === 0);
await espera("assunto inválido recusado", () => como(u, `insert into mensagens_modelos (assunto, texto) values ('spam', 'x')`), "check");
await espera("texto vazio recusado", () => como(u, `insert into mensagens_modelos (assunto, texto) values ('pedido', '   ')`), "check");
await espera(
  "with check: não grava modelo em nome de outra conta",
  () => como(u, `insert into mensagens_modelos (user_id, assunto, texto) values ($1, 'pedido', 'x')`, [outro]),
  "row-level security",
);

// 2) Enviadas com detalhes; as antigas (só chave) continuam valendo.
await como(u, `insert into mensagens_enviadas (user_id, chave) values ($1, 'enviado:antiga')`, [u]);
await como(u, `insert into mensagens_enviadas (user_id, chave, assunto, cliente, referencia, whatsapp, texto) values ($1, 'fiado:p1:vence', 'fiado', 'Ana', 'V-0001', '75999990000', 'Oi Ana')`, [u]);
const env = await como(u, `select chave, assunto, pulada from mensagens_enviadas order by chave`);
confere("enviada guarda os detalhes; antiga fica só com a chave", env.length === 2 && env.find((e) => e.chave === "fiado:p1:vence").assunto === "fiado" && env.every((e) => e.pulada === false));
await espera("texto longo demais recusado", () => como(u, `insert into mensagens_enviadas (user_id, chave, texto) values ($1, 'x:1', repeat('a', 2001))`, [u]), "mensagens_enviadas_detalhes_tamanho");

// 3) Histórico de compras por cliente.
const cli = (await um(`insert into clientes (user_id, nome) values ($1, 'Ana') returning id`, [u])).id;
const cliOutro = (await um(`insert into clientes (user_id, nome) values ($1, 'Bia') returning id`, [outro])).id;
for (const [dia, st] of [["2026-06-01", "paga"], ["2026-07-01", "paga"], ["2026-08-01", "cancelada"], ["2026-08-15", "paga"]])
  await q(`insert into vendas (user_id, cliente_id, numero, total, data_venda, status) values ($1, $2, $3, 50, $4, $5)`, [u, cli, `V-${dia}`, `${dia}T12:00:00Z`, st]);
await q(`insert into vendas (user_id, cliente_id, numero, total, data_venda, status) values ($1, $2, 'V-X', 99, now(), 'paga')`, [outro, cliOutro]);
const hist = await como(u, `select * from historico_compras_clientes()`);
confere(
  "conta 3 compras (sem a cancelada), primeira e última",
  hist.length === 1 && Number(hist[0].compras) === 3 && new Date(hist[0].primeira).toISOString().startsWith("2026-06-01") && new Date(hist[0].ultima).toISOString().startsWith("2026-08-15") && Number(hist[0].total) === 150,
  JSON.stringify(hist[0] ?? null),
);

await db.exec(await lerMigracao("0069_mensagens_modelos.sql"));
confere("0069 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
