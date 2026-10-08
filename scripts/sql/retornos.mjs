/** Retornos do marketplace (0090): importação idempotente, isolamento, RLS só de leitura. Rode com `npm run test:sql`. */
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
const novoUsuario = async (email) => {
  const id = (await um(`insert into auth.users (email) values ($1) returning id`, [email])).id;
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id, email]);
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

const u = await novoUsuario("ret@r.com");
const outro = await novoUsuario("ret2@r.com");
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Cardoso e-Shop') returning id`, [u, canal])).id;
const canalO = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [outro])).id;
const lojaO = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Alheia') returning id`, [outro, canalO])).id;

const ret = (sn, status, extra = {}) => ({
  return_sn: sn, numero_pedido: "2610ABC", status, motivo: "Produto com defeito", valor_reembolso: 39.9, comprador: "Maria", rastreio: null,
  itens: [{ nome: "Fita", quantidade: 1 }], criado_em: "2026-10-01T12:00:00Z", atualizado_em: "2026-10-02T12:00:00Z", prazo_resposta: "2026-10-05T12:00:00Z", bruto: { return_sn: sn, status }, ...extra,
});
const importar = (id, lojaId, lista) => como(id, `select importar_retornos_marketplace($1, $2::jsonb) as n`, [lojaId, JSON.stringify(lista)]);

confere("importa os retornos e devolve a quantidade", (await importar(u, loja, [ret("R1", "REQUESTED"), ret("R2", "JUDGING")]))[0].n === 2);
confere("a conta lê os próprios retornos", (await como(u, `select * from retornos_marketplace`)).length === 2);
confere("outra conta não enxerga", (await como(outro, `select * from retornos_marketplace`)).length === 0);

// Idempotente: reimportar atualiza o status em vez de duplicar.
await importar(u, loja, [ret("R1", "ACCEPTED", { rastreio: "BR123" })]);
const r1 = await um(`select status, rastreio, valor_reembolso from retornos_marketplace where return_sn = 'R1'`);
confere("reimportar atualiza sem duplicar", (await q(`select 1 from retornos_marketplace where return_sn = 'R1'`)).length === 1 && r1.status === "ACCEPTED" && r1.rastreio === "BR123" && Number(r1.valor_reembolso) === 39.9);
confere("o payload original fica guardado", (await um(`select bruto->>'status' s from retornos_marketplace where return_sn = 'R1'`)).s === "ACCEPTED");
confere("linha sem número ou sem status é ignorada", (await importar(u, loja, [ret("", "X"), { return_sn: "R9" }]))[0].n === 0);

await espera("loja de outra conta é recusada", () => importar(u, lojaO, [ret("R5", "REQUESTED")]), "Loja não encontrada");
await espera("a conta não escreve direto na tabela", () => como(u, `insert into retornos_marketplace (user_id, loja_id, return_sn, status) values ($1, $2, 'X', 'REQUESTED')`, [u, loja]), "row-level security");
await espera("a conta não apaga retorno (sem policy de escrita)", async () => {
  if ((await como(u, `delete from retornos_marketplace returning id`)).length === 0) throw new Error("nada apagado");
}, "nada apagado");
await db.exec(`set role anon`);
await espera("anônimo não importa", () => db.query(`select importar_retornos_marketplace($1, '[]'::jsonb)`, [loja]), "permission denied");
await db.exec(`reset role`);

// Cron: só service_role executa; usuário comum não.
await espera("usuário logado não chama a variante do cron", () => como(u, `select importar_retornos_marketplace_servico($1, $2, '[]'::jsonb)`, [u, loja]), "permission denied");
confere("a variante do cron importa em nome do dono", (await q(`select importar_retornos_marketplace_servico($1, $2, $3::jsonb) as n`, [u, loja, JSON.stringify([ret("R7", "SELLER_DISPUTE")])]))[0].n === 1);
await espera("a variante do cron confere a loja do dono", () => q(`select importar_retornos_marketplace_servico($1, $2, '[]'::jsonb)`, [u, lojaO]), "Loja não encontrada");

await espera("lista que não é array é recusada", () => como(u, `select importar_retornos_marketplace($1, '{}'::jsonb)`, [loja]), "inválida");
await q(`update perfis_acesso set status = 'suspenso' where user_id = $1`, [outro]);
await espera("conta suspensa não importa", () => como(outro, `select importar_retornos_marketplace($1, '[]'::jsonb)`, [lojaO]), "sem acesso");

await db.exec(await lerMigracao("0090_retornos_marketplace.sql"));
confere("0090 roda 2x sem erro e mantém os retornos", (await q(`select 1 from retornos_marketplace where user_id = $1`, [u])).length === 3);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
