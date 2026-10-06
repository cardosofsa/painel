/** Plataforma (0076): erros do app, uso de IA por conta e bucket de backups. Rode com `npm run test:sql`. */
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

const u = (await um(`insert into auth.users (email) values ('pl@p.com') returning id`)).id;
const master = (await um(`insert into auth.users (email) values ('m@p.com') returning id`)).id;
await q(
  `insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'pl@p.com', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`,
  [u],
);
await q(
  `insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'm@p.com', 'master', 'ativo', '{}') on conflict (user_id) do update set papel = 'master', status = 'ativo'`,
  [master],
);
await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;`);
const como = async (papel, id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  await db.exec(`set role ${papel}`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};

// 1) Erros
await como("anon", null, `select registrar_erro_app('navegador', $1, '/vitrine/x', 'abc')`, ["x".repeat(900)]);
await como("authenticated", u, `select registrar_erro_app('servidor', 'Falhou o banco', '/dashboard', null)`);
await como("authenticated", u, `select registrar_erro_app('qualquer', 'ignorado', null, null)`);
const erros = await q(`select * from erros_app order by id`);
confere("anônimo e logado registram; tipo inválido é ignorado", erros.length === 2, String(erros.length));
confere("mensagem cortada em 500 e conta registrada", erros[0].mensagem.length === 500 && erros[1].user_id === u);
await espera("a API não lê a tabela crua", () => como("authenticated", u, `select * from erros_app`), "permission denied");
await espera("conta comum não lê os erros", () => como("authenticated", u, `select * from admin_erros_app(10)`), "administrador");
const lista = await como("authenticated", master, `select * from admin_erros_app(10)`);
confere("master lê os erros com o e-mail", lista.length === 2 && lista[0].email === "pl@p.com", JSON.stringify(lista.map((x) => x.email)));
for (let i = 0; i < 70; i++) await como("anon", null, `select registrar_erro_app('navegador', 'loop', null, null)`);
confere("freio de 60 por minuto", (await um(`select count(*)::int n from erros_app`)).n === 60);

// 2) Uso de IA
await q(`insert into ia_uso (user_id, dia, geracoes, cache_hits) values ($1, current_date, 7, 3), ($1, current_date - 40, 50, 0)`, [u]);
await q(`insert into ia_imagens (user_id, tipo, status, criado_em) values ($1, 'livre', 'ok', now()), ($1, 'livre', 'reservada', now())`, [u]);
await espera("conta comum não vê o uso de IA", () => como("authenticated", u, `select * from admin_uso_ia(current_date - 30)`), "administrador");
const uso = await como("authenticated", master, `select * from admin_uso_ia(current_date - 30)`);
confere(
  "master vê gerações do período e só imagens concluídas",
  uso.length === 1 && Number(uso[0].geracoes) === 7 && Number(uso[0].cache_hits) === 3 && Number(uso[0].imagens) === 1,
  JSON.stringify(uso),
);

// 3) Backups
const b = await um(`select public, allowed_mime_types from storage.buckets where id = 'backups'`);
confere("bucket backups privado e só JSON", b && b.public === false && b.allowed_mime_types.join() === "application/json");
confere("policy de leitura da própria pasta", (await um(`select count(*)::int n from pg_policies where policyname = 'backups_select_own'`)).n === 1);

await db.exec(await lerMigracao("0076_plataforma_erros_ia_backups.sql"));
confere("0076 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
