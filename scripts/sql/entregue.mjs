/** Etapa Entregue e quem cancelou (0091): vendas do sistema e pedidos de marketplace. Rode com `npm run test:sql`. */
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

const u = await novoUsuario("ent@e.com");
const outro = await novoUsuario("ent2@e.com");
const venda = async (numero, extra = "") =>
  (await um(`insert into vendas (user_id, numero, status, subtotal, total, ${extra ? "etapa," : ""} status_envio) values ($1, $2, 'paga', 10, 10, ${extra ? "'" + extra + "'," : ""} 'enviado') returning id`, [u, numero])).id;

// 1) Vendas do sistema: Enviado → Entregue → Concluído.
const v1 = await venda("V-1", "enviado");
await como(u, `select avancar_etapa_vendas($1::uuid[], 'entregue')`, [[v1]]);
let v = await um(`select etapa, status_envio from vendas where id = $1`, [v1]);
confere("a etapa Entregue é aceita e conta como envio em aberto", v.etapa === "entregue" && v.status_envio === "enviado", JSON.stringify(v));
await como(u, `select avancar_etapa_vendas($1::uuid[], 'concluido')`, [[v1]]);
v = await um(`select etapa, status_envio from vendas where id = $1`, [v1]);
confere("Concluir leva a Concluído (status de envio concluído)", v.etapa === "concluido" && v.status_envio === "concluido", JSON.stringify(v));
await como(u, `select avancar_etapa_vendas($1::uuid[], 'entregue')`, [[v1]]);
confere("dá para voltar de Concluído para Entregue", (await um(`select etapa from vendas where id = $1`, [v1])).etapa === "entregue");
await q(`update vendas set status_envio = 'enviado' where id = $1`, [v1]);
confere("mexer no status de envio não tira a venda de Entregue", (await um(`select etapa from vendas where id = $1`, [v1])).etapa === "entregue");
await espera("etapa inválida segue recusada", () => como(u, `select avancar_etapa_vendas($1::uuid[], 'qualquer')`, [[v1]]), "Etapa inválida");
const vNova = (await um(`insert into vendas (user_id, numero, status, subtotal, total, etapa) values ($1, 'V-2', 'paga', 5, 5, 'entregue') returning id`, [u])).id;
confere("venda criada já como Entregue fica com envio em aberto", (await um(`select status_envio from vendas where id = $1`, [vNova])).status_envio === "enviado");
const vAntiga = await venda("V-3", "concluido");
confere("vendas Concluídas continuam Concluídas", (await um(`select etapa from vendas where id = $1`, [vAntiga])).etapa === "concluido");
const vOutro = (await um(`insert into vendas (user_id, numero, status, subtotal, total, etapa, status_envio) values ($1, 'V-9', 'paga', 5, 5, 'enviado', 'enviado') returning id`, [outro])).id;
await como(u, `select avancar_etapa_vendas($1::uuid[], 'entregue')`, [[vOutro]]);
confere("não avança a venda de outra conta", (await um(`select etapa from vendas where id = $1`, [vOutro])).etapa === "enviado");

// 2) Marketplace: entrega e cancelamento por RPC pequena.
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Cardoso e-Shop') returning id`, [u, canal])).id;
const canalO = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [outro])).id;
const lojaO = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Alheia') returning id`, [outro, canalO])).id;
const ped = (numero, status, lojaId = loja, dono = u) => q(`insert into pedidos_marketplace (user_id, loja_id, numero, status) values ($1, $2, $3, $4)`, [dono, lojaId, numero, status]);
await ped("A1", "enviado");
await ped("A2", "cancelado");
await ped("A3", "enviado");
const sit = (id, lojaId, lista) => como(id, `select atualizar_situacao_marketplace($1, $2::jsonb) as n`, [lojaId, JSON.stringify(lista)]);

const n = (await sit(u, loja, [{ numero: "A1", entregue_em: "2026-10-08T12:00:00Z" }, { numero: "A2", cancelado_por: "sistema", motivo_cancelamento: "Não enviado no prazo" }, { numero: "NAO", cancelado_por: "comprador" }]))[0].n;
confere("grava entrega e cancelamento e conta só os pedidos que existem", n === 2);
const a1 = await um(`select entregue_em, status from pedidos_marketplace where numero = 'A1'`);
confere("A1 segue Enviado, com a data de entrega", a1.status === "enviado" && a1.entregue_em !== null);
const a2 = await um(`select cancelado_por, motivo_cancelamento from pedidos_marketplace where numero = 'A2'`);
confere("A2 guarda quem cancelou e o motivo", a2.cancelado_por === "sistema" && a2.motivo_cancelamento === "Não enviado no prazo");

await sit(u, loja, [{ numero: "A1" }, { numero: "A2", cancelado_por: "alguem", motivo_cancelamento: "" }]);
const a1b = await um(`select entregue_em from pedidos_marketplace where numero = 'A1'`);
const a2b = await um(`select cancelado_por, motivo_cancelamento from pedidos_marketplace where numero = 'A2'`);
confere("campo ausente ou valor inválido não apaga o que já estava gravado", a1b.entregue_em !== null && a2b.cancelado_por === "sistema" && a2b.motivo_cancelamento === "Não enviado no prazo");
await espera("valor fora da lista não passa direto na tabela", () => q(`update pedidos_marketplace set cancelado_por = 'alguem' where numero = 'A2'`), "check");

await espera("loja de outra conta é recusada", () => sit(u, lojaO, [{ numero: "A1" }]), "Loja não encontrada");
await espera("outra conta não atualiza a loja alheia", () => sit(outro, loja, [{ numero: "A1" }]), "Loja não encontrada");
await espera("usuário logado não chama a variante do cron", () => como(u, `select atualizar_situacao_marketplace_servico($1, $2, '[]'::jsonb)`, [u, loja]), "permission denied");
confere("a variante do cron grava em nome do dono", (await q(`select atualizar_situacao_marketplace_servico($1, $2, $3::jsonb) as n`, [u, loja, JSON.stringify([{ numero: "A3", entregue_em: "2026-10-09T10:00:00Z" }])]))[0].n === 1);
await db.exec(`set role anon`);
await espera("anônimo não executa", () => db.query(`select atualizar_situacao_marketplace($1, '[]'::jsonb)`, [loja]), "permission denied");
await db.exec(`reset role`);
await espera("lista que não é array é recusada", () => sit(u, loja, {}), "no máximo");

await db.exec(await lerMigracao("0091_entregue_e_cancelamento.sql"));
confere("0091 roda 2x sem erro e mantém os dados", (await um(`select etapa from vendas where id = $1`, [v1])).etapa === "entregue" && (await um(`select cancelado_por from pedidos_marketplace where numero = 'A2'`)).cancelado_por === "sistema");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
