/** Termos do perfil de marca (0103): presets, gravidade e termos que bloqueiam. Rode com `npm run test:sql`. */
import { criarBancoDeTeste } from "./banco.mjs";

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

const u = await novoUsuario("marca@e.com");
const outro = await novoUsuario("marca2@e.com");
const perfil = (await como(u, `insert into perfis_marca (nome) values ('Loja Chá') returning id, presets, presets_gravidade, termos_bloqueados`))[0];
confere("perfil novo nasce sem presets, revisando e sem bloqueio", perfil.presets.length === 0 && perfil.presets_gravidade === "revisar" && perfil.termos_bloqueados.length === 0);

await como(u, `update perfis_marca set presets = '{saude}', presets_gravidade = 'bloquear', termos_bloqueados = '{"cura","detox"}' where id = $1`, [perfil.id]);
const lido = (await como(u, `select presets, presets_gravidade, termos_bloqueados from perfis_marca where id = $1`, [perfil.id]))[0];
confere("grava presets, gravidade e termos que bloqueiam", lido.presets[0] === "saude" && lido.presets_gravidade === "bloquear" && lido.termos_bloqueados.length === 2);
await espera("gravidade desconhecida é recusada", () => como(u, `update perfis_marca set presets_gravidade = 'talvez' where id = $1`, [perfil.id]), "violates check");
await espera("id de preset com caractere estranho é recusado", () => como(u, `update perfis_marca set presets = '{"Saúde!"}' where id = $1`, [perfil.id]), "violates check");
await espera("mais de 100 termos bloqueados é recusado", () => como(u, `update perfis_marca set termos_bloqueados = (select array_agg('t' || g) from generate_series(1, 101) g) where id = $1`, [perfil.id]), "violates check");
confere("outra conta não vê o perfil", (await como(outro, `select count(*)::int n from perfis_marca`))[0].n === 0);
await como(outro, `update perfis_marca set termos_bloqueados = '{}' where id = $1`, [perfil.id]);
confere("outra conta não altera os termos", (await como(u, `select cardinality(termos_bloqueados) n from perfis_marca where id = $1`, [perfil.id]))[0].n === 2);

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
