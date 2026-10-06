/**
 * Banco de teste: Postgres de verdade em WebAssembly (PGlite), com TODAS as migrações
 * aplicadas do zero e um `auth` mínimo do Supabase (auth.uid() lê request.jwt.claim.sub).
 * Usado por `npm run test:sql`. Não toca no Supabase.
 *
 * - 0048 fica de fora: depende de pg_cron, pg_net e Vault, que só existem no Supabase.
 * - Antes da 0016 a função obter_catalogo_publico é dropada, como foi feito à mão em
 *   produção (a própria 0017 documenta o porquê).
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";

const DIR = new URL("../../supabase/migrations/", import.meta.url);
export const PULAR = new Set(["0048_sincronizacao_automatica.sql"]);

const AUTH_MINIMO = `
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$;
  create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
  create or replace function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
`;

export function migracoes() {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function lerMigracao(nome) {
  return fs.readFileSync(new URL(nome, DIR), "utf8");
}

/**
 * Cria o banco e aplica as migrações. Lança no primeiro erro (com o nome do arquivo).
 * Com `antesDe`, para na migração anterior a esse arquivo (usado por
 * scripts/supabase/aplicar-migracao.mjs para testar uma migração por cima das anteriores).
 */
export async function criarBancoDeTeste({ verbose = false, antesDe } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(AUTH_MINIMO);
  let n = 0;
  for (const f of migracoes()) {
    if (antesDe && f >= antesDe) break;
    if (PULAR.has(f)) continue;
    if (f.startsWith("0016")) await db.exec("drop function if exists obter_catalogo_publico(text)");
    try {
      await db.exec(await lerMigracao(f));
      n++;
    } catch (e) {
      throw new Error(`Migração ${f} falhou: ${e.message}`);
    }
  }
  if (verbose) console.log(`${n} migrações aplicadas (0048 fica de fora: pg_cron/Vault).`);
  return db;
}
