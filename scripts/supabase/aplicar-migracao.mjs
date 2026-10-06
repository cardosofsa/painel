/**
 * Aplica UMA migração no Supabase pela Management API, depois de testá-la no PGlite.
 *
 *   node scripts/supabase/aplicar-migracao.mjs --verificar
 *       Consulta inofensiva (somente leitura) para conferir token, projeto e rede.
 *
 *   node scripts/supabase/aplicar-migracao.mjs 0067_algo.sql
 *       Só testa: aplica no PGlite por cima das anteriores, roda de novo (idempotência) e
 *       mostra o que muda no schema. NÃO toca no Supabase.
 *
 *   node scripts/supabase/aplicar-migracao.mjs 0067_algo.sql --aplicar
 *       Faz o mesmo teste e, se passar, aplica no banco de produção.
 *
 * O teste no PGlite não substitui o aviso ao dono do banco: rode sem --aplicar, mostre o
 * resumo, explique o porquê da mudança e só aplique depois do "pode". Ver CLAUDE.md.
 *
 * Variáveis (do ambiente ou do .env.local): SUPABASE_PROJECT_REF e SUPABASE_ACCESS_TOKEN
 * (token pessoal, supabase.com/dashboard/account/tokens). Nenhuma delas é impressa.
 */
import fs from "node:fs";
import { criarBancoDeTeste, lerMigracao, migracoes, PULAR } from "../sql/banco.mjs";

// Antes da 0021 as migrações não são idempotentes (README); 0012 apaga dados.
const PRIMEIRA_IDEMPOTENTE = "0021";
const DESTRUTIVAS = new Set(["0012_limpar_dados_teste.sql"]);

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const arquivo = args.find((a) => !a.startsWith("--"));

function sair(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function credenciais() {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local"); // não sobrescreve o ambiente
  const ref = process.env.SUPABASE_PROJECT_REF?.trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!ref || !token) sair("Defina SUPABASE_PROJECT_REF e SUPABASE_ACCESS_TOKEN (ambiente ou .env.local).");
  if (!/^[a-z0-9]{20}$/.test(ref)) sair("SUPABASE_PROJECT_REF não parece um ref de projeto (20 letras/números).");
  return { ref, token };
}

/** POST /v1/projects/{ref}/database/query. Devolve as linhas; lança com a mensagem da API. */
async function consultar(sql, { somenteLeitura = false } = {}) {
  const { ref, token } = credenciais();
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(somenteLeitura ? { query: sql, read_only: true } : { query: sql }),
  });
  const texto = await resp.text();
  if (!resp.ok) {
    let msg = texto;
    try {
      msg = JSON.parse(texto).message ?? texto;
    } catch {}
    throw new Error(`HTTP ${resp.status}: ${String(msg).replaceAll(token, "***").slice(0, 800)}`);
  }
  return texto ? JSON.parse(texto) : [];
}

// ---------------------------------------------------------------------------------------
// Retrato do schema, para dizer o que a migração muda.

const RETRATO = `
  select 'tabela'::text as tipo, c.relname::text as nome, ''::text as det
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
  union all
  select 'rls', c.relname, c.relrowsecurity::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
  union all
  select 'view', c.relname, md5(pg_get_viewdef(c.oid))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm')
  union all
  select 'coluna', table_name || '.' || column_name,
         data_type || coalesce(' default ' || column_default, '') || case when is_nullable = 'NO' then ' not null' else '' end
    from information_schema.columns where table_schema = 'public'
  union all
  select 'função', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         md5(pg_get_functiondef(p.oid))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
  union all
  select 'policy', schemaname || '.' || tablename || ': ' || policyname,
         md5(coalesce(cmd, '') || coalesce(qual, '') || coalesce(with_check, '') || array_to_string(roles, ','))
    from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'trigger', c.relname || ': ' || t.tgname, md5(pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
  union all
  select 'índice', tablename || ': ' || indexname, md5(indexdef) from pg_indexes where schemaname = 'public'
  union all
  select 'constraint', c.relname || ': ' || k.conname, md5(pg_get_constraintdef(k.oid))
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and k.contype <> 'n'
  union all
  select 'bucket', id, coalesce(file_size_limit::text, '') || ' ' || coalesce(array_to_string(allowed_mime_types, ','), '')
    from storage.buckets
`;

async function retrato(db) {
  const linhas = (await db.query(RETRATO)).rows;
  return new Map(linhas.map((l) => [`${l.tipo}\u0000${l.nome}`, l.det]));
}

function diferenca(antes, depois) {
  const mud = { novo: [], alterado: [], removido: [] };
  for (const [k, v] of depois) {
    if (!antes.has(k)) mud.novo.push(k);
    else if (antes.get(k) !== v) mud.alterado.push(k);
  }
  for (const k of antes.keys()) if (!depois.has(k)) mud.removido.push(k);
  for (const l of Object.values(mud)) l.sort();
  return mud;
}

const rotulo = (k) => k.replace("\u0000", " ");

/** Tabela a que o item pertence (para agrupar o que veio junto com uma tabela nova). */
function tabelaDo(k) {
  const [tipo, nome] = k.split("\u0000");
  if (tipo === "coluna") return nome.split(".")[0];
  if (tipo === "rls" || tipo === "tabela") return nome;
  if (tipo === "policy") return nome.replace(/^public\./, "").split(":")[0];
  if (["trigger", "índice", "constraint"].includes(tipo)) return nome.split(":")[0];
  return null;
}

/** Avisos que o retrato do schema não mostra: o PGlite começa vazio, então não vê dado. */
function avisosDoTexto(sql) {
  const semComentario = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Corpo de função não roda na migração: um UPDATE ali dentro não mexe em nada agora.
  const semCorpo = semComentario.replace(/create\s+(or\s+replace\s+)?function[\s\S]*?(\$\w*\$)[\s\S]*?\2/gi, "");
  const avisos = [];
  const procura = [
    [/\bdrop\s+table\b/i, "DROP TABLE: apaga tabela e os dados dela"],
    [/\bdrop\s+column\b/i, "DROP COLUMN: apaga coluna e os dados dela"],
    [/\btruncate\b/i, "TRUNCATE: esvazia tabela"],
    [/\bdelete\s+from\b/i, "DELETE: apaga linhas existentes"],
    [/^\s*update\s+\w/im, "UPDATE: altera linhas existentes"],
    [/^\s*insert\s+into\b/im, "INSERT: grava dados"],
    [/\bdrop\s+function\b/i, "DROP FUNCTION: confira se o código no ar não chama a versão antiga"],
    [/\bgrant\b[\s\S]{0,200}?\bto\s+anon\b/i, "GRANT para anon: confira se não expõe tabela crua"],
    [/\bdisable\s+row\s+level\s+security\b/i, "DESLIGA RLS"],
    [/\bconcurrently\b/i, "CONCURRENTLY não roda dentro de transação"],
  ];
  for (const [re, msg] of procura) if (re.test(semCorpo)) avisos.push(msg);
  if (!/notify\s+pgrst\s*,\s*'reload schema'\s*;?\s*$/i.test(semComentario.trim()))
    avisos.push("não termina com NOTIFY pgrst, 'reload schema' (convenção obrigatória)");
  return avisos;
}

/** Primeiro bloco de comentário do arquivo: é onde a migração explica o porquê. */
function cabecalho(sql) {
  const linhas = [];
  for (const l of sql.split("\n")) {
    if (/^\s*--/.test(l)) linhas.push(l.replace(/^\s*--\s?/, ""));
    else if (l.trim() === "" && linhas.length === 0) continue;
    else break;
  }
  return linhas.join("\n").trim();
}

async function testarNoPglite(nome, sql) {
  if (PULAR.has(nome)) sair(`${nome} depende de pg_cron/pg_net/Vault e não roda no PGlite. Aplique pelo SQL Editor.`);
  const db = await criarBancoDeTeste({ antesDe: nome });
  const antes = await retrato(db);
  try {
    await db.exec(sql);
  } catch (e) {
    sair(`Falhou no PGlite (1ª execução): ${e.message}`);
  }
  const depois = await retrato(db);
  try {
    await db.exec(sql);
  } catch (e) {
    sair(`Falhou no PGlite ao rodar de novo — não é idempotente: ${e.message}`);
  }
  const deNovo = await retrato(db);
  const mud = diferenca(antes, depois);
  const segunda = diferenca(depois, deNovo);
  const mudouNaSegunda = segunda.novo.length + segunda.alterado.length + segunda.removido.length;
  await db.close();
  return { mud, mudouNaSegunda, segunda, depois };
}

function imprimirResumo(nome, sql, resultado) {
  const { mud, mudouNaSegunda, segunda } = resultado;
  console.log(`\n=== ${nome} ===`);
  const porque = cabecalho(sql);
  if (porque) console.log(`\nPor quê (comentário do arquivo):\n${porque.replace(/^/gm, "  ")}`);
  console.log("\nTeste no PGlite: ✓ aplicou por cima das anteriores e ✓ rodou 2× sem erro.");
  if (mudouNaSegunda) {
    console.log(`⚠ a 2ª execução mudou ${mudouNaSegunda} objeto(s) de novo:`);
    for (const k of [...segunda.novo, ...segunda.alterado, ...segunda.removido]) console.log(`    ${rotulo(k)}`);
  }
  // Tabela nova vira uma linha só, com o essencial (RLS e policies) à mostra.
  const novas = mud.novo.filter((k) => k.startsWith("tabela\u0000")).map((k) => k.split("\u0000")[1]);
  if (novas.length) {
    console.log(`\nTabelas novas (${novas.length}):`);
    for (const t of novas) {
      const dela = mud.novo.filter((k) => tabelaDo(k) === t);
      const conta = (tipo) => dela.filter((k) => k.startsWith(tipo + "\u0000"));
      const rls = resultado.depois.get(`rls\u0000${t}`) === "true";
      const policies = conta("policy").map((k) => k.split(": ").pop());
      console.log(
        `  ${t}: ${conta("coluna").length} colunas, ${rls ? "RLS ligado" : "⚠ RLS DESLIGADO"}, ` +
          `policies: ${policies.join(", ") || "⚠ nenhuma"}` +
          (conta("trigger").length ? `, triggers: ${conta("trigger").map((k) => k.split(": ").pop()).join(", ")}` : ""),
      );
    }
    mud.novo = mud.novo.filter((k) => !novas.includes(tabelaDo(k)));
  }
  const blocos = [
    ["Novo", mud.novo],
    ["Alterado", mud.alterado],
    ["Removido", mud.removido],
  ];
  if (blocos.every(([, l]) => l.length === 0)) console.log("\nO schema não muda (só dados, grants ou nada).");
  for (const [titulo, lista] of blocos) {
    if (!lista.length) continue;
    console.log(`\n${titulo} (${lista.length}):`);
    for (const k of lista) console.log(`  ${rotulo(k)}`);
  }
  const avisos = avisosDoTexto(sql);
  if (avisos.length) {
    console.log("\nAtenção:");
    for (const a of avisos) console.log(`  ⚠ ${a}`);
  }
}

// ---------------------------------------------------------------------------------------

if (flag("--verificar")) {
  try {
    const [l] = await consultar(
      `select current_database() as banco,
              split_part(current_setting('server_version'), ' ', 1) as postgres,
              (select count(*) from pg_tables where schemaname = 'public')::int as tabelas_public,
              (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity)::int as sem_rls`,
      { somenteLeitura: true },
    );
    console.log("✓ Management API respondeu (consulta somente leitura).");
    console.log(`  banco ${l.banco}, Postgres ${l.postgres}, ${l.tabelas_public} tabelas em public, ${l.sem_rls} sem RLS`);
  } catch (e) {
    sair(`A consulta falhou: ${e.message}`);
  }
  process.exit(0);
}

if (!arquivo) sair("Uso: aplicar-migracao.mjs <arquivo.sql> [--aplicar]  |  aplicar-migracao.mjs --verificar");

const nome = arquivo.split(/[\\/]/).pop();
if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(nome)) sair(`Nome inesperado: ${nome}. Esperado algo como 0067_descricao.sql.`);
if (!migracoes().includes(nome)) sair(`${nome} não está em supabase/migrations/.`);
if (DESTRUTIVAS.has(nome)) sair(`${nome} é um script destrutivo, não uma migração. Não aplico.`);
if (nome < PRIMEIRA_IDEMPOTENTE && !flag("--forcar"))
  sair(`${nome} é anterior à ${PRIMEIRA_IDEMPOTENTE} e não é idempotente (README). Reaplicar pode duplicar dados. Use --forcar se tiver certeza.`);

const sql = await lerMigracao(nome);
const resultado = await testarNoPglite(nome, sql);
imprimirResumo(nome, sql, resultado);

if (!flag("--aplicar")) {
  console.log("\nNada foi enviado ao Supabase. Para aplicar: acrescente --aplicar.");
  process.exit(0);
}

console.log("\nAplicando no Supabase…");
try {
  await consultar(sql);
} catch (e) {
  sair(`O Supabase recusou: ${e.message}\nA migração é idempotente: corrija e rode de novo por cima.`);
}
console.log(`✓ ${nome} aplicada.`);
