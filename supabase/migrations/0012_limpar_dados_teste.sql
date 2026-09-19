-- ============================================================
-- Remove os dados de teste gerados por automação (Playwright) sob a conta
-- painel@teste.com, mantendo a conta em si pra continuar sendo usada em
-- futuros testes. Varre toda tabela do schema public com coluna user_id e
-- apaga só as linhas dessa conta — nenhuma outra conta é tocada.
-- ============================================================

do $$
declare
  v_user_id uuid;
  r record;
begin
  select id into v_user_id from auth.users where email = 'painel@teste.com';

  if v_user_id is null then
    raise notice 'Usuário painel@teste.com não encontrado — nada a limpar.';
    return;
  end if;

  for r in
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'user_id'
  loop
    execute format('delete from public.%I where user_id = %L', r.table_name, v_user_id);
  end loop;
end $$;

-- Contas de signup descartáveis criadas testando o novo fluxo de cadastro
-- (endereços fictícios "teste.pw.<timestamp>@..."), nunca confirmadas por e-mail.
delete from auth.users where email like 'teste.pw.%@%';

NOTIFY pgrst, 'reload schema';
