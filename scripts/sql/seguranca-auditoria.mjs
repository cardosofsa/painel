/** Correções da auditoria (0070): estorno de IA, funções de kit, admin e vendas_offline. Rode com `npm run test:sql`. */
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

const u = (await um(`insert into auth.users (email) values ('aud@a.com') returning id`)).id;
await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
await db.exec(`grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
const como = async (papel, id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  await db.exec(`set role ${papel}`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};
const usadas = async () => (await um(`select geracoes, estornos from ia_uso where user_id = $1`, [u])) ?? { geracoes: 0, estornos: 0 };

// 1) Estorno: uma vez por geração, só a recente, no máximo 5 por dia.
await como("authenticated", u, `select * from ia_consumir('titulo', 'propria')`);
await como("authenticated", u, `select * from ia_consumir('titulo', 'propria')`);
confere("duas gerações contadas", (await usadas()).geracoes === 2);
await como("authenticated", u, `select ia_estornar('propria')`);
await como("authenticated", u, `select ia_estornar('propria')`);
await como("authenticated", u, `select ia_estornar('propria')`);
confere("três estornos seguidos devolvem só uma vaga", (await usadas()).geracoes === 1, JSON.stringify(await usadas()));
await q(`update ia_uso set ultimo_consumo_em = now() - interval '10 minutes', estornavel = true where user_id = $1`, [u]);
await como("authenticated", u, `select ia_estornar('propria')`);
confere("geração de mais de 2 minutos não é estornada", (await usadas()).geracoes === 1);
for (let i = 0; i < 8; i++) {
  await como("authenticated", u, `select * from ia_consumir('titulo', 'propria')`);
  await como("authenticated", u, `select ia_estornar('propria')`);
}
const fim = await usadas();
confere("no máximo 5 estornos por dia", fim.estornos === 5 && fim.geracoes === 1 + 8 - 4, JSON.stringify(fim));
await espera("anônimo não chama ia_estornar", () => como("anon", null, `select ia_estornar('sistema')`), "permission denied");

// 2) Funções de kit fechadas para fora das triggers.
for (const f of ["recalcular_kits(null, gen_random_uuid())", "estoque_calculado_kit(gen_random_uuid())", "componentes_do_kit(gen_random_uuid())"]) {
  await espera(`anônimo não chama ${f.split("(")[0]}`, () => como("anon", null, `select ${f}`), "permission denied");
  await espera(`usuário não chama ${f.split("(")[0]}`, () => como("authenticated", u, `select ${f}`), "permission denied");
}
// …mas as triggers continuam funcionando: kit recalcula ao mudar o componente.
const comp = (await um(`insert into produtos (user_id, sku, nome, custo_base, estoque) values ($1, 'CAN-1', 'Caneca', 10, 10) returning id`, [u])).id;
const kit = (await um(`insert into produtos (user_id, sku, nome, custo_base, e_kit, insumos) values ($1, 'KIT-1', 'Kit 2 canecas', 0, true, $2) returning id`, [u, JSON.stringify([{ produtoId: comp, nome: "Caneca", quantidade: 2, custoUnitario: 10 }])])).id;
await como("authenticated", u, `update produtos set estoque = 6 where id = $1`, [comp]);
confere("trigger de kit ainda recalcula (6 canecas → 3 kits)", (await um(`select estoque from produtos where id = $1`, [kit])).estoque === 3, String((await um(`select estoque from produtos where id = $1`, [kit])).estoque));

// 3) admin_* sem anon.
const adminAnon = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'admin\\_%' and has_function_privilege('anon', p.oid, 'execute')`);
confere("nenhuma admin_* executável por anon", adminAnon.length === 0, adminAnon.map((r) => r.proname).join(","));

// 4) vendas_offline: conta suspensa não grava.
await q(`update perfis_acesso set status = 'suspenso' where user_id = $1`, [u]);
await espera("conta suspensa não grava venda offline", () => como("authenticated", u, `insert into vendas_offline (chave, user_id) values (gen_random_uuid(), $1)`, [u]), "row-level security");
await q(`update perfis_acesso set status = 'ativo' where user_id = $1`, [u]);

await db.exec(await lerMigracao("0070_seguranca_auditoria.sql"));
confere("0070 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
