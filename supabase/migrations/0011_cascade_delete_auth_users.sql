-- ============================================================
-- Corrige o erro "Database error deleting user" no Supabase Studio.
--
-- Toda tabela com user_id referencia auth.users sem "on delete cascade" (o
-- padrão do Postgres é RESTRICT). Isso significa que, assim que o usuário
-- tem qualquer linha em qualquer tabela (produtos, precificações, etc.), o
-- Supabase Auth não consegue apagar o registro em auth.users — a FK bloqueia.
--
-- Em vez de listar cada tabela na mão, varremos o catálogo do Postgres
-- (pg_constraint) por toda foreign key do schema public que aponta pra
-- auth.users e trocamos pra "on delete cascade". Cada tabela é corrigida
-- dentro do seu próprio BEGIN/EXCEPTION — se uma falhar, as outras não são
-- desfeitas (ao contrário de um loop simples, onde uma falha no meio reverte
-- tudo porque o DO $$ inteiro é uma única transação). Rode este script e
-- confira as mensagens (aba "Messages" do SQL Editor): cada tabela aparece
-- como OK ou FALHOU.
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select
      cl.relname as table_name,
      con.conname as constraint_name,
      att.attname as column_name
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cl.relnamespace
    join pg_class frel on frel.oid = con.confrelid
    join pg_namespace fnsp on fnsp.oid = frel.relnamespace
    join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
    where con.contype = 'f'
      and nsp.nspname = 'public'
      and fnsp.nspname = 'auth'
      and frel.relname = 'users'
  loop
    begin
      execute format('alter table public.%I drop constraint %I', r.table_name, r.constraint_name);
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete cascade',
        r.table_name, r.constraint_name, r.column_name
      );
      raise notice 'OK: %.% agora é ON DELETE CASCADE', r.table_name, r.constraint_name;
    exception when others then
      raise notice 'FALHOU: %.% -> %', r.table_name, r.constraint_name, sqlerrm;
    end;
  end loop;
end $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verificação: lista toda FK do schema public que aponta pra auth.users e
-- sua regra de exclusão atual. Rode este SELECT depois do bloco acima —
-- "delete_rule" deve aparecer "CASCADE" em toda linha.
-- ============================================================
select
  tc.table_name,
  tc.constraint_name,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and rc.unique_constraint_schema = 'auth'
order by tc.table_name;
