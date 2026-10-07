/**
 * Segurança (0077): cota do frete da vitrine, erros do app, vendas_offline, storage, EXECUTE
 * por papel, índice e PIN de administrador. Rode com `npm run test:sql`.
 */
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
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 120));
  }
};

await db.exec(`
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  grant usage on schema storage to anon, authenticated;
`);
const como = async (papel, id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  await db.exec(`set role ${papel}`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};
const ativar = (id, status = "ativo") =>
  q(
    `insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, 'usuario', $3, '{}') on conflict (user_id) do update set status = excluded.status`,
    [id, `${id}@teste`, status],
  );

const u = (await um(`insert into auth.users (email) values ('s77@s.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('o77@s.com') returning id`)).id;
const susp = (await um(`insert into auth.users (email) values ('x77@s.com') returning id`)).id;
await ativar(u);
await ativar(outro);
await ativar(susp, "suspenso");
await q(`insert into catalogos (user_id, nome, slug) values ($1, 'Loja', 'loja-77'), ($1, 'Fechada', 'fechada-77')`, [u]);
await q(`update catalogos set ativo = false where slug = 'fechada-77'`);
await q(`insert into catalogos (user_id, nome, slug) values ($1, 'Suspensa', 'susp-77')`, [susp]);
const catId = (await um(`select id from catalogos where slug = 'loja-77'`)).id;

const frete = async (slug, ip) => (await como("service_role", null, `select vitrine_frete_permitido($1, $2) as ok`, [slug, ip]))[0].ok;

// ---------- 1) Cota do frete ----------
await espera("anon não chama a cota do frete", () => como("anon", null, `select vitrine_frete_permitido('loja-77', 'ip')`), "permission denied");
await espera("logado não chama a cota do frete", () => como("authenticated", u, `select vitrine_frete_permitido('loja-77', 'ip')`), "permission denied");
confere("catálogo inexistente, inativo ou de conta suspensa: recusa", !(await frete("nao-existe", "a")) && !(await frete("fechada-77", "a")) && !(await frete("susp-77", "a")));
let seguidas = 0;
for (let i = 0; i < 20; i++) if (await frete("loja-77", "ip-a")) seguidas++;
confere("20 cotações em 10 min pela mesma origem passam", seguidas === 20, String(seguidas));
confere("a 21ª da mesma origem é recusada", (await frete("loja-77", "ip-a")) === false);
confere("outra origem continua cotando", (await frete("loja-77", "ip-b")) === true);
confere("origem vazia vira um balde só, e '*' não invade o total do dia", (await frete("loja-77", "")) === true && (await frete("loja-77", "*")) === true);
await q(`update vitrine_frete_cota set janela_inicio = now() - interval '11 minutes' where ip_hash = 'ip-a'`);
confere("janela de 10 min vencida: a origem volta a cotar", (await frete("loja-77", "ip-a")) === true);
await q(`update vitrine_frete_cota set janela_inicio = now() - interval '11 minutes' where ip_hash = 'ip-b'`);
await frete("loja-77", "ip-c");
confere(
  "faxina apaga as origens vencidas do catálogo",
  (await um(`select count(*)::int n from vitrine_frete_cota where ip_hash = 'ip-b'`)).n === 0,
);
await q(`update vitrine_frete_cota set contagem = 400 where catalogo_id = $1 and ip_hash = '*'`, [catId]);
confere("400 no dia por catálogo: a próxima é recusada, de qualquer origem", (await frete("loja-77", "ip-novo")) === false);
await q(`update vitrine_frete_cota set janela_inicio = janela_inicio - interval '1 day' where catalogo_id = $1 and ip_hash = '*'`, [catId]);
confere("virou o dia: o total recomeça", (await frete("loja-77", "ip-outro-dia")) === true);
confere("contagem do dia recomeçou em 1", (await um(`select contagem from vitrine_frete_cota where catalogo_id = $1 and ip_hash = '*'`, [catId])).contagem === 1);
await espera("a API não lê a tabela de cota", () => como("authenticated", u, `select * from vitrine_frete_cota`), "permission denied");

// ---------- 2) Erros do app ----------
const erro = (onde, msg, ip = null) => como("service_role", null, `select registrar_erro_app($1, $2, '/x', null, $3)`, [onde, msg, ip]);
const contar = async (onde) => (await um(`select count(*)::int n from erros_app where onde = $1`, [onde])).n;
confere(
  "só a versão nova (5 parâmetros) existe",
  (await um(`select count(*)::int n, max(pronargs)::int a from pg_proc where proname = 'registrar_erro_app'`)).n === 1 &&
    (await um(`select pronargs::int a from pg_proc where proname = 'registrar_erro_app'`)).a === 5,
);
await espera("anon não registra mais erro direto", () => como("anon", null, `select registrar_erro_app('navegador', 'x', null, null, null)`), "permission denied");
await espera("logado também não", () => como("authenticated", u, `select registrar_erro_app('navegador', 'x')`), "permission denied");
await erro("servidor", "Falhou", "hash-1");
const r = await um(`select * from erros_app order by id desc limit 1`);
confere("service role registra, com o hash da origem", r && r.onde === "servidor" && r.ip_hash === "hash-1");
await q(`delete from erros_app`);
for (let i = 0; i < 15; i++) await erro("navegador", "loop", "hash-flood");
confere("10 por minuto por origem", (await contar("navegador")) === 10, String(await contar("navegador")));
for (let i = 0; i < 70; i++) await erro("navegador", "loop", `h-${i}`);
confere("freio de 60/min do navegador mesmo trocando de origem", (await contar("navegador")) === 60, String(await contar("navegador")));
await erro("servidor", "do servidor", null);
confere("enxurrada do navegador não cala o servidor", (await contar("servidor")) === 1);
await q(`delete from erros_app`);
await q(`insert into erros_app (onde, mensagem, criado_em) select 'servidor', 'velho', now() - interval '1 hour' from generate_series(1, 4100)`);
await q(`insert into erros_app (onde, mensagem, criado_em) select 'navegador', 'velho', now() - interval '1 hour' from generate_series(1, 1100)`);
await erro("navegador", "novo", "hash-r");
confere("retenção do navegador: 1.000, sem tocar no servidor", (await contar("navegador")) === 1000 && (await contar("servidor")) === 4100, `${await contar("navegador")}/${await contar("servidor")}`);
await erro("servidor", "novo", null);
confere("retenção do servidor: 4.000", (await contar("servidor")) === 4000 && (await contar("navegador")) === 1000);
confere("o mais novo fica", (await um(`select count(*)::int n from erros_app where mensagem = 'novo'`)).n === 2);

// ---------- 3) vendas_offline ----------
await db.exec(`grant select, insert on vendas_offline to authenticated`);
await q(`insert into vendas_offline (chave, user_id) values (gen_random_uuid(), $1)`, [u]);
confere("conta ativa lê a própria vendas_offline", (await como("authenticated", u, `select * from vendas_offline`)).length === 1);
await ativar(u, "suspenso");
confere("conta suspensa não lê", (await como("authenticated", u, `select * from vendas_offline`)).length === 0);
await espera(
  "conta suspensa não grava",
  () => como("authenticated", u, `insert into vendas_offline (chave, user_id) values (gen_random_uuid(), $1)`, [u]),
  "row-level security",
);
await ativar(u);

// ---------- 4) Storage ----------
const pol = async (nome) => (await um(`select count(*)::int n from pg_policies where schemaname = 'storage' and policyname = $1`, [nome])).n;
confere("SELECT público de produtos e canais-logos removido", (await pol("produtos_bucket_select_public")) === 0 && (await pol("canais_logos_select_public")) === 0);
confere("SELECT da própria pasta nos quatro buckets", (await pol("produtos_select_own")) + (await pol("canais_logos_select_own")) + (await pol("notas_fiscais_select_own")) + (await pol("backups_select_own")) === 4);
await db.exec(`alter table storage.objects enable row level security; grant select on storage.objects to anon, authenticated;`);
for (const [b, dono, nome] of [
  ["produtos", u, "a.png"],
  ["produtos", outro, "b.png"],
  ["canais-logos", outro, "c.png"],
  ["notas-fiscais", u, "nf.pdf"],
  ["backups", u, "2026-10-01.json"],
])
  await q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [b, `${dono}/${nome}`]);
confere("anon não lista arquivo nenhum (nem dos buckets públicos)", (await como("anon", null, `select name from storage.objects`)).length === 0);
const meus = await como("authenticated", u, `select bucket_id, name from storage.objects order by bucket_id`);
confere(
  "logado lista só a própria pasta",
  meus.length === 3 && meus.every((o) => o.name.startsWith(`${u}/`)),
  meus.map((o) => o.bucket_id).join(","),
);
await ativar(u, "suspenso");
confere("conta suspensa não lê notas fiscais nem backups", (await como("authenticated", u, `select name from storage.objects`)).length === 0);
await ativar(u);

// ---------- 5) EXECUTE por papel ----------
const revogadas = [
  "admin_listar_contas",
  "admin_erros_app",
  "editar_venda",
  "definir_pin_admin",
  "pin_admin_confere",
  "pin_admin_checar",
  "registrar_venda",
  "registrar_venda_offline",
  "cancelar_venda",
  "resumo_financeiro",
  "registrar_movimentacao_financeira",
  "registrar_movimentacao_estoque",
  "limpar_financeiro",
  "tocar_ultimo_acesso",
  "ia_consumir",
  "mesclar_clientes",
];
const priv = async (nome) =>
  await q(
    `select pg_get_function_identity_arguments(p.oid) a, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') logado
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
    [nome],
  );
let ruins = [];
for (const f of revogadas) {
  const linhas = await priv(f);
  if (!linhas.length || linhas.some((l) => l.anon || !l.logado)) ruins.push(f);
}
const todosAdmin = await q(
  `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'admin\\_%' and has_function_privilege('anon', p.oid, 'execute')`,
);
confere("funções de usuário logado: anon fora, authenticated dentro", ruins.length === 0 && todosAdmin.length === 0, [...ruins, ...todosAdmin.map((x) => x.proname)].join(", "));
await espera("anon não chama editar_venda", () => como("anon", null, `select editar_venda(gen_random_uuid(), null, null, null, 0, 0, '1234')`), "permission denied");
await espera("anon não chama resumo_financeiro", () => como("anon", null, `select * from resumo_financeiro(current_date, current_date)`), "permission denied");
await espera("anon não chama admin_listar_contas", () => como("anon", null, `select * from admin_listar_contas()`), "permission denied");

const publicas = [
  ["obter_catalogo_publico", `select * from obter_catalogo_publico('loja-77')`],
  ["obter_aparencia_catalogo", `select * from obter_aparencia_catalogo('loja-77')`],
  ["obter_empresa_catalogo", `select * from obter_empresa_catalogo('loja-77')`],
  ["formas_pagamento_catalogo", `select formas_pagamento_catalogo('loja-77')`],
  ["vitrine_tem_frete", `select vitrine_tem_frete('loja-77')`],
  ["compre_junto_publico", `select * from compre_junto_publico('loja-77')`],
  ["registrar_visita_catalogo", `select registrar_visita_catalogo('loja-77')`],
  ["planos_publicos", `select * from planos_publicos()`],
  ["conta_ativa_de", `select conta_ativa_de(gen_random_uuid())`],
];
const quebradas = [];
for (const [nome, sql] of publicas) {
  try {
    await como("anon", null, sql);
  } catch (e) {
    quebradas.push(`${nome}: ${e.message.slice(0, 60)}`);
  }
}
confere("anon continua chamando as funções da vitrine e da landing", quebradas.length === 0, quebradas.join(" | "));
try {
  await como("anon", null, `select * from criar_pedido_vitrine(p_slug => 'nao-existe', p_itens => '[]'::jsonb, p_nome => 'x', p_whatsapp => '1', p_observacao => null, p_idempotencia => gen_random_uuid())`);
  confere("anon chega na regra de negócio de criar_pedido_vitrine", true);
} catch (e) {
  confere("anon chega na regra de negócio de criar_pedido_vitrine (erro dela, não de permissão)", !e.message.includes("permission denied"), e.message.slice(0, 80));
}

// ---------- 6) Índice ----------
confere("índice pedidos_marketplace (user_id, pago_em)", (await um(`select count(*)::int n from pg_indexes where indexname = 'pedidos_marketplace_user_pago_idx'`)).n === 1);

// ---------- 7) PIN de administrador ----------
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
await q(`select definir_pin_admin('1234')`);
const conferePin = async (pin) => (await como("authenticated", u, `select pin_admin_confere($1) as ok`, [pin]))[0].ok;
const tentativas = async () => await um(`select falhas, bloqueado_ate from pin_admin_tentativas where user_id = $1`, [u]);
confere("PIN certo confere", (await conferePin("1234")) === true);
const t0 = Date.now();
confere("PIN errado não confere", (await conferePin("0000")) === false);
confere("errar custa ~0,8 s", Date.now() - t0 >= 750, `${Date.now() - t0} ms`);
for (let i = 0; i < 3; i++) await conferePin("0000");
confere("4 erros seguidos ficam gravados (sem bloquear)", (await tentativas()).falhas === 4 && (await tentativas()).bloqueado_ate === null, JSON.stringify(await tentativas()));
confere("o 5º erro também devolve false", (await conferePin("9999")) === false);
const bloq = await tentativas();
confere("5 erros seguidos: bloqueado por 15 min", bloq.bloqueado_ate && new Date(bloq.bloqueado_ate).getTime() - Date.now() > 14 * 60_000, JSON.stringify(bloq));
await espera("bloqueado: nem o PIN certo passa, e a mensagem diz por quê", () => conferePin("1234"), "bloqueado");
await espera("a conta não zera o próprio contador pela API", () => como("authenticated", u, `update pin_admin_tentativas set bloqueado_ate = null`), "permission denied");
await espera("nem apaga a linha", () => como("authenticated", u, `delete from pin_admin_tentativas`), "permission denied");
confere("mas lê a própria linha", (await como("authenticated", u, `select * from pin_admin_tentativas`)).length === 1);
confere("e não lê a de outra conta", (await como("authenticated", outro, `select * from pin_admin_tentativas`)).length === 0);
await q(`update pin_admin_tentativas set bloqueado_ate = now() - interval '1 second' where user_id = $1`, [u]);
confere("bloqueio vencido: PIN certo volta a conferir", (await conferePin("1234")) === true);
confere("acerto zera a contagem", (await tentativas()).falhas === 0 && (await tentativas()).bloqueado_ate === null);
await conferePin("0000");
confere("depois do acerto, a contagem recomeça do 1", (await tentativas()).falhas === 1);
await q(`update pin_admin_tentativas set falhas = 0, bloqueado_ate = now() - interval '1 second' where user_id = $1`, [u]);
await conferePin("0000");
confere("bloqueio vencido sem acerto: o erro seguinte conta 1, não bloqueia de novo", (await tentativas()).falhas === 1 && (await tentativas()).bloqueado_ate === null);
await conferePin("1234");

// editar_venda: PIN errado volta no corpo (status 400) e a tentativa fica contada.
const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
const prod = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'P77', 'Pulseira', 3, 10, 20) returning id`, [u])).id;
const venda = (
  await um(`select * from registrar_venda(p_itens => $1::jsonb, p_status => 'paga', p_conta_id => $2, p_forma_pagamento => 'Dinheiro')`, [
    JSON.stringify([{ produto_id: prod, quantidade: 1, preco_unitario: 10 }]),
    conta,
  ])
).venda_id;
confere("editar_venda tem uma versão só, que devolve jsonb", (await um(`select count(*)::int n, max(prorettype::regtype::text) t from pg_proc where proname = 'editar_venda'`)).t === "jsonb");
const editar = (pin) => um(`select editar_venda($1, null, 'Pix', 'editada', 0, 0, $2) as r`, [venda, pin]);
await db.exec("begin");
const errado = (await editar("4321")).r;
const status = (await um(`select current_setting('response.status', true) s`)).s;
await db.exec("commit");
confere("PIN errado: corpo no formato de erro do PostgREST e status 400", errado?.code === "P0001" && errado?.message === "PIN incorreto." && status === "400", JSON.stringify(errado));
confere("…e a tentativa ficou contada (transação confirmada)", (await tentativas()).falhas === 1);
confere("…sem editar a venda", (await um(`select observacao from vendas where id = $1`, [venda])).observacao !== "editada");
const certo = (await editar("1234")).r;
confere("PIN certo edita e zera a contagem", certo === null && (await um(`select observacao from vendas where id = $1`, [venda])).observacao === "editada" && (await tentativas()).falhas === 0);
for (let i = 0; i < 4; i++) await editar("4321");
const quinto = (await editar("4321")).r;
confere("5º erro pelo editar_venda avisa o bloqueio", quinto?.message?.includes("bloqueado por 15 minutos"), quinto?.message);
await espera("bloqueado: editar_venda recusa com a mensagem", () => editar("1234"), "bloqueado");
await q(`update pin_admin_tentativas set bloqueado_ate = null, falhas = 0 where user_id = $1`, [u]);

// ---------- Idempotência ----------
await db.exec(await lerMigracao("0077_seguranca_rotas.sql"));
await db.exec(await lerMigracao("0077_seguranca_rotas.sql"));
confere("0077 roda 2x sem erro", true);
confere(
  "depois de reaplicar, continua tudo fechado",
  !(await priv("registrar_erro_app"))[0].anon && !(await priv("editar_venda"))[0].anon && (await pol("produtos_bucket_select_public")) === 0,
);
confere("e o PIN continua conferindo", (await conferePin("1234")) === true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
