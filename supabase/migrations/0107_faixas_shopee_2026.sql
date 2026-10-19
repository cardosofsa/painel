-- ============================================================
-- 0107 — Faixas de comissão: tabela da Shopee de 01/10/2026, tarifa em % do preço e gravação
-- atômica e validada.
--
-- Por quê:
--  1) A tabela padrão da Shopee estava velha. Desde 01/10/2026 (vendedor CNPJ) a tarifa fixa
--     até R$ 79,99 é R$ 4,50 (era R$ 4,00) e, abaixo de R$ 9, a tarifa fixa é METADE DO PREÇO,
--     além dos 20% de comissão. O preset antigo (0005) cobrava 50% abaixo de R$ 8 e R$ 4 até
--     R$ 79,99: preço sugerido baixo demais e lucro mostrado maior que o real.
--  2) "Metade do preço" não cabia no modelo (tarifa fixa era só valor). Nova coluna
--     `tarifa_fixa_pct`: parte da tarifa cobrada como % do preço. O código soma essa parte na
--     taxa variável (`lib/faixas.ts`).
--  3) Dava para salvar a tabela vazia ou incoerente (buraco, sobreposição, começo fora do zero),
--     e a gravação era DELETE + INSERT separados: uma falha no meio deixava o canal sem faixa, e
--     o cálculo caía na comissão plana do canal (no Shopee, 0% + R$ 0). `salvar_faixas_canal`
--     valida o conjunto inteiro e troca tudo numa transação só.
--
-- Contas existentes: só as tabelas que ainda são EXATAMENTE o preset antigo (as 5 faixas, com os
-- mesmos valores) passam para a regra nova. Tabela que o dono já editou não é tocada.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table faixas_comissao_canal add column if not exists tarifa_fixa_pct numeric not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'faixas_comissao_canal_tarifa_fixa_pct_check') then
    alter table faixas_comissao_canal add constraint faixas_comissao_canal_tarifa_fixa_pct_check check (tarifa_fixa_pct >= 0 and tarifa_fixa_pct <= 100);
  end if;
end $$;

-- 1) Contas existentes com o preset antigo intocado → regra de 01/10/2026.
do $$
declare
  v_canal record;
  v_trocados integer := 0;
begin
  for v_canal in
    select f.canal_id, min(f.user_id::text)::uuid as user_id
      from faixas_comissao_canal f
     group by f.canal_id
    having count(*) = 5
       and bool_and(
             (f.preco_min, coalesce(f.preco_max, -1), f.comissao_pct, f.tarifa_fixa, f.tarifa_fixa_pct) in (
               (0::numeric, 7.99::numeric, 50::numeric, 0::numeric, 0::numeric),
               (8, 79.99, 20, 4, 0),
               (80, 99.99, 14, 16, 0),
               (100, 199.99, 14, 20, 0),
               (200, -1, 14, 26, 0)
             ))
       and count(distinct f.preco_min) = 5
  loop
    delete from faixas_comissao_canal where canal_id = v_canal.canal_id;
    insert into faixas_comissao_canal (user_id, canal_id, ordem, preco_min, preco_max, comissao_pct, tarifa_fixa, tarifa_fixa_pct) values
      (v_canal.user_id, v_canal.canal_id, 1, 0, 8.99, 20, 0, 50),
      (v_canal.user_id, v_canal.canal_id, 2, 9, 79.99, 20, 4.5, 0),
      (v_canal.user_id, v_canal.canal_id, 3, 80, 99.99, 14, 16, 0),
      (v_canal.user_id, v_canal.canal_id, 4, 100, 199.99, 14, 20, 0),
      (v_canal.user_id, v_canal.canal_id, 5, 200, null, 14, 26, 0);
    v_trocados := v_trocados + 1;
  end loop;
  raise notice '0107: % tabela(s) com o preset antigo da Shopee atualizada(s) para a regra de 01/10/2026.', v_trocados;
end $$;

-- 2) Contas novas já nascem com a regra nova (mesmo corpo da 0005, só as faixas mudam).
create or replace function seed_canais_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shopee_id uuid;
begin
  insert into canais (user_id, nome, tipo_taxa, icone, cor, comissao_pct_padrao, taxa_fixa_padrao)
  values (new.id, 'Shopee', 'faixas', 'ShoppingBag', '#EE4D2D', 0, 0)
  returning id into v_shopee_id;

  insert into faixas_comissao_canal (user_id, canal_id, ordem, preco_min, preco_max, comissao_pct, tarifa_fixa, tarifa_fixa_pct) values
    (new.id, v_shopee_id, 1, 0, 8.99, 20, 0, 50),
    (new.id, v_shopee_id, 2, 9, 79.99, 20, 4.5, 0),
    (new.id, v_shopee_id, 3, 80, 99.99, 14, 16, 0),
    (new.id, v_shopee_id, 4, 100, 199.99, 14, 20, 0),
    (new.id, v_shopee_id, 5, 200, null, 14, 26, 0);

  insert into canais (user_id, nome, tipo_taxa, icone, cor, comissao_pct_padrao, taxa_fixa_padrao) values
    (new.id, 'Mercado Livre', 'fixo', 'ShoppingCart', '#FFE600', 0, 0),
    (new.id, 'Loja Física', 'fixo', 'Store', '#64748b', 0, 0),
    (new.id, 'Facebook', 'fixo', 'Facebook', '#1877F2', 0, 0);

  return new;
end;
$$;

-- 3) Gravação validada e atômica. `security invoker`: o RLS da tabela continua valendo; o
--    canal é conferido como da própria conta antes de apagar qualquer coisa. Mesmas regras de
--    `validarFaixas` (lib/faixas.ts).
create or replace function salvar_faixas_canal(p_canal_id uuid, p_faixas jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_n integer;
  v_i integer;
  v_f jsonb;
  v_min numeric;
  v_max numeric;
  v_com numeric;
  v_fixa numeric;
  v_pct numeric;
  v_max_anterior numeric;
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  if not exists (select 1 from canais where id = p_canal_id and user_id = v_user) then
    raise exception 'Canal não encontrado.';
  end if;
  if jsonb_typeof(p_faixas) <> 'array' then
    raise exception 'Faixas inválidas.';
  end if;
  v_n := jsonb_array_length(p_faixas);
  if v_n = 0 then
    raise exception 'Cadastre pelo menos uma faixa: sem faixa nenhuma, o preço sairia sem comissão.';
  end if;
  if v_n > 20 then
    raise exception 'No máximo 20 faixas.';
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_f := p_faixas -> v_i;
    v_min := round((v_f ->> 'preco_min')::numeric, 2);
    v_max := round(nullif(v_f ->> 'preco_max', '')::numeric, 2);
    v_com := coalesce((v_f ->> 'comissao_pct')::numeric, 0);
    v_fixa := coalesce((v_f ->> 'tarifa_fixa')::numeric, 0);
    v_pct := coalesce((v_f ->> 'tarifa_fixa_pct')::numeric, 0);
    if v_min is null or v_com < 0 or v_com > 100 or v_pct < 0 or v_pct > 100 or v_fixa < 0 or v_com + v_pct >= 100 then
      raise exception 'A faixa % tem um valor fora do permitido.', v_i + 1;
    end if;
    if v_i = 0 and v_min <> 0 then
      raise exception 'A primeira faixa precisa começar em R$ 0,00.';
    end if;
    if v_i = v_n - 1 and v_max is not null then
      raise exception 'A última faixa precisa ficar aberta (sem preço máximo).';
    end if;
    if v_i < v_n - 1 and v_max is null then
      raise exception 'Só a última faixa fica sem preço máximo (a faixa % está aberta).', v_i + 1;
    end if;
    if v_max is not null and v_max <= v_min then
      raise exception 'A faixa % termina antes de começar: confira o mínimo e o máximo.', v_i + 1;
    end if;
    if v_i > 0 and v_min <> v_max_anterior + 0.01 then
      raise exception 'A faixa % precisa começar um centavo depois do fim da faixa anterior.', v_i + 1;
    end if;
    v_max_anterior := v_max;
  end loop;

  delete from faixas_comissao_canal where canal_id = p_canal_id and user_id = v_user;
  insert into faixas_comissao_canal (user_id, canal_id, ordem, preco_min, preco_max, comissao_pct, tarifa_fixa, tarifa_fixa_pct)
  select v_user, p_canal_id, (e.ord)::integer,
         round((e.f ->> 'preco_min')::numeric, 2),
         round(nullif(e.f ->> 'preco_max', '')::numeric, 2),
         coalesce((e.f ->> 'comissao_pct')::numeric, 0),
         coalesce((e.f ->> 'tarifa_fixa')::numeric, 0),
         coalesce((e.f ->> 'tarifa_fixa_pct')::numeric, 0)
    from jsonb_array_elements(p_faixas) with ordinality as e(f, ord);
end;
$$;

revoke all on function salvar_faixas_canal(uuid, jsonb) from public, anon;
grant execute on function salvar_faixas_canal(uuid, jsonb) to authenticated;

NOTIFY pgrst, 'reload schema';
