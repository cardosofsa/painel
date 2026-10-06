/** Inventário (0074): aplicar a contagem, armazém, kit, histórico e RLS. Rode com `npm run test:sql`. */
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

const u = (await um(`insert into auth.users (email) values ('inv@i.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('inv2@i.com') returning id`)).id;
for (const id of [u, outro])
  await q(
    `insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`,
    [id],
  );
await db.exec(
  `grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`,
);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};

const a1 = (await um(`insert into armazens (user_id, nome) values ($1, 'Loja') returning id`, [u])).id;
const a2 = (await um(`insert into armazens (user_id, nome) values ($1, 'Depósito') returning id`, [u])).id;
const p1 = (await um(`insert into produtos (user_id, sku, nome, custo_base, armazem_id) values ($1, 'A', 'Caneca', 10, $2) returning id`, [u, a1])).id;
const p2 = (await um(`insert into produtos (user_id, sku, nome, custo_base, armazem_id) values ($1, 'B', 'Copo', 5, $2) returning id`, [u, a1])).id;
const alheio = (await um(`insert into produtos (user_id, sku, nome, custo_base) values ($1, 'X', 'Alheio', 1) returning id`, [outro])).id;
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
await q(`select registrar_movimentacao_estoque($1, 'entrada', 10, 'teste')`, [p1]);
await q(`select registrar_movimentacao_estoque($1, 'entrada', 4, 'teste')`, [p2]);
const saldo = async (p, a) => (await um(`select coalesce(max(quantidade), 0)::int n from estoque_armazem where produto_id = $1 and armazem_id = $2`, [p, a])).n;
const estoque = async (p) => (await um(`select estoque from produtos where id = $1`, [p])).estoque;

// Geral (sem armazém): sobra e falta.
const inv = (
  await como(u, `select aplicar_inventario(null, $1::jsonb, 'Contagem de outubro') as id`, [
    JSON.stringify([
      { produto_id: p1, contado: 12 },
      { produto_id: p2, contado: 1 },
    ]),
  ])
)[0].id;
confere("sobra vira entrada e falta vira saída", (await estoque(p1)) === 12 && (await estoque(p2)) === 1);
confere("custo não muda com sobra de contagem", Number((await um(`select custo_base from produtos where id = $1`, [p1])).custo_base) === 10);
const cab = await um(`select itens, ajustes, observacao from inventarios where id = $1`, [inv]);
confere("histórico guarda itens, ajustes e observação", cab.itens === 2 && cab.ajustes === 2 && cab.observacao === "Contagem de outubro", JSON.stringify(cab));
const it = await um(`select esperado, contado from inventario_itens where inventario_id = $1 and produto_id = $2`, [inv, p1]);
confere("item guarda esperado e contado", it.esperado === 10 && it.contado === 12);
confere(
  "movimentação com motivo Inventário",
  (await um(`select count(*)::int n from estoque_movimentacoes where produto_id = $1 and motivo = 'Inventário'`, [p1])).n === 1,
);

// Por armazém: só mexe no saldo daquele armazém.
await q(`select set_config('app.armazem_mov', $1, false)`, [a2]);
await q(`select registrar_movimentacao_estoque($1, 'entrada', 5, 'teste')`, [p1]);
await q(`select set_config('app.armazem_mov', '', false)`);
confere("antes: Loja 12, Depósito 5", (await saldo(p1, a1)) === 12 && (await saldo(p1, a2)) === 5);
await como(u, `select aplicar_inventario($1, $2::jsonb)`, [a2, JSON.stringify([{ produto_id: p1, contado: 3 }])]);
confere("contagem do Depósito ajusta só o Depósito", (await saldo(p1, a1)) === 12 && (await saldo(p1, a2)) === 3 && (await estoque(p1)) === 15);
await como(u, `select aplicar_inventario($1, $2::jsonb)`, [a2, JSON.stringify([{ produto_id: p2, contado: 2 }])]);
confere("produto sem saldo no armazém: esperado 0, entrada lá", (await saldo(p2, a2)) === 2 && (await estoque(p2)) === 3);
const semDif = (await como(u, `select aplicar_inventario(null, $1::jsonb) as id`, [JSON.stringify([{ produto_id: p2, contado: 3 }])]))[0].id;
confere("contagem igual não gera ajuste", (await um(`select ajustes from inventarios where id = $1`, [semDif])).ajustes === 0);

// Erros.
await espera("lista vazia é recusada", () => como(u, `select aplicar_inventario(null, '[]'::jsonb)`), "pelo menos um");
await espera(
  "contagem negativa é recusada",
  () => como(u, `select aplicar_inventario(null, $1::jsonb)`, [JSON.stringify([{ produto_id: p1, contado: -1 }])]),
  "Contagem inválida",
);
await espera(
  "produto repetido é recusado",
  () =>
    como(u, `select aplicar_inventario(null, $1::jsonb)`, [
      JSON.stringify([
        { produto_id: p1, contado: 1 },
        { produto_id: p1, contado: 2 },
      ]),
    ]),
  "duas vezes",
);
confere("erro no meio desfaz tudo (estoque intacto)", (await estoque(p1)) === 15);
await espera(
  "produto de outra conta é recusado",
  () => como(u, `select aplicar_inventario(null, $1::jsonb)`, [JSON.stringify([{ produto_id: alheio, contado: 1 }])]),
  "não encontrado",
);
await espera(
  "armazém de outra conta é recusado",
  () => como(outro, `select aplicar_inventario($1, $2::jsonb)`, [a1, JSON.stringify([{ produto_id: alheio, contado: 1 }])]),
  "Armazém não encontrado",
);
await q(`update produtos set e_kit = true where id = $1`, [p2]);
await espera("kit não entra", () => como(u, `select aplicar_inventario(null, $1::jsonb)`, [JSON.stringify([{ produto_id: p2, contado: 1 }])]), "kit");
await q(`update produtos set e_kit = false where id = $1`, [p2]);

// RLS: a outra conta não vê o histórico.
confere(
  "outra conta não vê inventários nem itens",
  (await como(outro, `select count(*)::int n from inventarios`))[0].n === 0 && (await como(outro, `select count(*)::int n from inventario_itens`))[0].n === 0,
);
await espera(
  "não dá para gravar item em inventário alheio",
  () => como(outro, `insert into inventario_itens (inventario_id, produto_id, produto_nome, esperado, contado) values ($1, $2, 'x', 0, 1)`, [inv, alheio]),
  "",
);
await q(`update perfis_acesso set status = 'suspenso' where user_id = $1`, [u]);
await espera(
  "conta suspensa não aplica",
  () => como(u, `select aplicar_inventario(null, $1::jsonb)`, [JSON.stringify([{ produto_id: p1, contado: 1 }])]),
  "não está ativa",
);
await q(`update perfis_acesso set status = 'ativo' where user_id = $1`, [u]);
await db.exec(`set role anon`);
await espera("anônimo não aplica", () => db.query(`select aplicar_inventario(null, '[]'::jsonb)`), "permission denied");
await db.exec(`reset role`);

await db.exec(await lerMigracao("0074_inventario.sql"));
confere("0074 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
