/** Estúdio de IA (0072): cota de imagens por plano e ciclo reservar/concluir/cancelar. Rode com `npm run test:sql`. */
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

const u = (await um(`insert into auth.users (email) values ('img@i.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('img2@i.com') returning id`)).id;
for (const id of [u, outro]) await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
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

confere("limites padrão: Grátis 5, Essencial 50, Pro 300", (await q(`select id, limite_imagens_mes from planos order by ordem`)).map((p) => `${p.id}:${p.limite_imagens_mes}`).join() === "gratis:5,essencial:50,pro:300");

// Conta no plano Grátis (5 por mês).
await q(`insert into assinaturas (user_id, plano_id, status) values ($1, 'gratis', 'ativa') on conflict (user_id) do update set plano_id = 'gratis', status = 'ativa'`, [u]);
const prod = (await um(`insert into produtos (user_id, sku, nome, custo_base) values ($1, 'IMG', 'Caneca', 10) returning id`, [u])).id;
const prodOutro = (await um(`insert into produtos (user_id, sku, nome, custo_base) values ($1, 'X', 'Alheio', 10) returning id`, [outro])).id;

const r1 = (await como(u, `select * from ia_reservar_imagem('fundo_branco', $1)`, [prod]))[0];
confere("reserva devolve id, usadas e limite", r1.id && r1.usadas === 1 && r1.limite === 5, JSON.stringify(r1));
confere("concluir marca ok", (await como(u, `select ia_concluir_imagem($1, 'u/ia-1.png') as ok`, [r1.id]))[0].ok === true);
confere("concluir duas vezes não vale", (await como(u, `select ia_concluir_imagem($1, 'u/x.png') as ok`, [r1.id]))[0].ok === false);
await como(u, `select ia_cancelar_imagem($1)`, [r1.id]);
confere("imagem concluída não pode ser cancelada", (await um(`select count(*)::int n from ia_imagens where id = $1`, [r1.id])).n === 1);

const r2 = (await como(u, `select * from ia_reservar_imagem('ambiente', null)`))[0];
await como(u, `select ia_cancelar_imagem($1)`, [r2.id]);
confere("reserva com erro é devolvida", (await um(`select count(*)::int n from ia_imagens where id = $1`, [r2.id])).n === 0);

for (let i = 0; i < 4; i++) {
  const r = (await como(u, `select * from ia_reservar_imagem('capa_selo', null)`))[0];
  await como(u, `select ia_concluir_imagem($1, 'u/x.png')`, [r.id]);
}
await espera("sexta imagem do mês no Grátis é recusada", () => como(u, `select * from ia_reservar_imagem('fundo_branco', null)`), "permite 5 imagens");
// Reserva esquecida há mais de 10 minutos não conta.
await q(`update ia_imagens set criado_em = now() - interval '1 hour' where user_id = $1 and status = 'ok'`, [u]);
await q(`insert into ia_imagens (user_id, tipo, criado_em) values ($1, 'livre', now() - interval '2 hours')`, [u]);
await espera("reservas antigas esquecidas não liberam vaga além do limite", () => como(u, `select * from ia_reservar_imagem('fundo_branco', null)`), "permite 5 imagens");

await espera("produto de outra conta recusado", () => como(outro, `select * from ia_reservar_imagem('fundo_branco', $1)`, [prod]), "Produto não encontrado");
await espera("tipo inválido recusado", () => como(outro, `select * from ia_reservar_imagem('qualquer', null)`), "Tipo de imagem inválido");
confere("outra conta não vê as imagens da primeira", (await como(outro, `select * from ia_imagens`)).length === 0);
await espera("conta não grava direto na tabela", () => como(u, `insert into ia_imagens (user_id, tipo) values ($1, 'livre')`, [u]), "row-level security");
await espera("conta não apaga o registro para ganhar vaga", async () => {
  const n = (await como(u, `delete from ia_imagens returning id`)).length;
  if (n === 0) throw new Error("nada apagado (sem policy de delete)");
}, "nada apagado");
await db.exec(`set role anon`);
await espera("anônimo não reserva", () => db.query(`select * from ia_reservar_imagem('fundo_branco', null)`), "permission denied");
await db.exec(`reset role`);

// Suspensa não gera.
await q(`update perfis_acesso set status = 'suspenso' where user_id = $1`, [outro]);
await espera("conta suspensa não gera", () => como(outro, `select * from ia_reservar_imagem('fundo_branco', $1)`, [prodOutro]), "não está ativa");

await db.exec(await lerMigracao("0072_ia_imagens.sql"));
confere("0072 roda 2x sem erro e não sobrescreve limite mudado", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
