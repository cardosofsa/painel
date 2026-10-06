/** Calendário (datas próprias, preferências) e planos públicos (0068). Rode com `npm run test:sql`. */
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

const u = (await um(`insert into auth.users (email) values ('cal@c.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('cal2@c.com') returning id`)).id;
for (const id of [u, outro]) await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(`grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
const entrar = (id) => db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
const comoPapel = async (papel, fn) => {
  await db.exec(`set role ${papel}`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
  }
};

// 1) Datas próprias: cada conta vê só as suas (RLS de verdade, papel authenticated).
await entrar(u);
await comoPapel("authenticated", () => q(`insert into datas_calendario (titulo, data, tipo) values ('Aniversário de Feira de Santana', '2026-09-18', 'municipal')`));
await entrar(outro);
await comoPapel("authenticated", () => q(`insert into datas_calendario (titulo, data, tipo, repete_todo_ano) values ('Promoção da loja', '2026-11-03', 'promocao', false)`));
const vistas = await comoPapel("authenticated", () => q(`select titulo from datas_calendario`));
confere("outra conta vê só a própria data", vistas.length === 1 && vistas[0].titulo === "Promoção da loja");
await entrar(u);
const minhas = await comoPapel("authenticated", () => q(`select titulo, repete_todo_ano from datas_calendario`));
confere("repete todo ano por padrão", minhas.length === 1 && minhas[0].repete_todo_ano === true);
await espera("título vazio recusado", () => q(`insert into datas_calendario (user_id, titulo, data) values ($1, '  ', '2026-01-01')`, [u]), "check");
await espera("tipo inválido recusado", () => q(`insert into datas_calendario (user_id, titulo, data, tipo) values ($1, 'x', '2026-01-01', 'feriado')`, [u]), "check");
await espera(
  "with check: não grava data em nome de outra conta",
  () => comoPapel("authenticated", () => q(`insert into datas_calendario (user_id, titulo, data) values ($1, 'x', '2026-01-01')`, [outro])),
  "row-level security",
);

// 2) Preferências no perfil.
await q(`insert into perfil_negocio (user_id, nome_negocio, uf) values ($1, 'Loja', 'BA') on conflict (user_id) do update set uf = 'BA'`, [u]);
await q(`update perfil_negocio set calendario_uf = 'SP', calendario_camadas = '["feriado","comercial"]' where user_id = $1`, [u]);
const perfil = await um(`select calendario_uf, calendario_camadas from perfil_negocio where user_id = $1`, [u]);
confere("guarda UF e camadas", perfil.calendario_uf === "SP" && Array.isArray(perfil.calendario_camadas) && perfil.calendario_camadas.length === 2);
await espera("UF inválida recusada", () => q(`update perfil_negocio set calendario_uf = 'Bahia' where user_id = $1`, [u]), "calendario_uf");
await espera("camadas que não são lista recusadas", () => q(`update perfil_negocio set calendario_camadas = '{"a":1}' where user_id = $1`, [u]), "calendario_camadas");

// 3) Planos públicos: anônimo lê só os ativos, sem tocar na tabela.
await q(`update planos set ativo = false where id = 'essencial'`);
await entrar("");
const pub = await comoPapel("anon", () => q(`select * from planos_publicos()`));
confere("anônimo vê os planos ativos em ordem", pub.map((p) => p.id).join() === "gratis,pro", pub.map((p) => p.id).join());
confere("só colunas públicas", pub[0] && !("ativo" in pub[0]) && !("atualizado_em" in pub[0]));
await espera("anônimo não lê a tabela crua", () => comoPapel("anon", () => q(`select * from planos`)), "permission denied");
await q(`update planos set ativo = true where id = 'essencial'`);

await db.exec(await lerMigracao("0068_calendario_planos_publicos.sql"));
confere("0068 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
