-- ============================================================
-- 0070 — Correções da auditoria de outubro/2026 (Fase 0).
--
-- 1) Cota de IA: `ia_estornar` podia ser chamada pelo console do navegador quantas vezes
--    a pessoa quisesse, devolvendo vagas que ela de fato usou — cota de IA do sistema
--    ilimitada, paga pelo dono do sistema. Agora o estorno só vale para a geração mais
--    recente (até 2 minutos), uma vez por geração e no máximo 5 por dia. A marca de
--    "estornável" é posta por trigger quando `ia_consumir` soma uma geração, sem mexer
--    em `ia_consumir`.
-- 2) Kits: `recalcular_kits`, `estoque_calculado_kit` e `componentes_do_kit` são security
--    definer e estavam executáveis por qualquer um (inclusive sem login): dava para
--    regravar o estoque de kits de outra conta e ler estoque alheio pelo id. Só as
--    triggers usam essas funções (também security definer, rodando como dono), então
--    o EXECUTE sai de public/anon/authenticated.
-- 3) Funções `admin_*`: já conferem `e_master()` por dentro; tiramos o EXECUTE de anon
--    como segunda camada.
-- 4) `vendas_offline`: o INSERT passa a exigir conta ativa, como as outras tabelas.
--    (As tabelas filhas — venda_itens, produto_imagens… — já herdam a trava pelo `exists`
--    no pai, ver 0021.)
-- 5) Índices nas chaves estrangeiras que não tinham: deixam rápidos os joins e o
--    `on delete` das tabelas pai.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Estorno de IA
alter table ia_uso add column if not exists estornos integer not null default 0;
alter table ia_uso add column if not exists ultimo_consumo_em timestamptz;
alter table ia_uso add column if not exists estornavel boolean not null default false;

create or replace function ia_uso_marcar_consumo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.geracoes > old.geracoes then
    new.ultimo_consumo_em := now();
    new.estornavel := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ia_uso_marcar_consumo on ia_uso;
create trigger trg_ia_uso_marcar_consumo before insert or update of geracoes on ia_uso
  for each row execute function ia_uso_marcar_consumo();

create or replace function ia_estornar(p_origem text default 'sistema')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update ia_uso
     set geracoes = greatest(geracoes - 1, 0),
         geracoes_sistema = case when p_origem = 'sistema' then greatest(geracoes_sistema - 1, 0) else geracoes_sistema end,
         geracoes_propria = case when p_origem = 'propria' then greatest(geracoes_propria - 1, 0) else geracoes_propria end,
         estornos = estornos + 1,
         estornavel = false,
         atualizado_em = now()
   where user_id = auth.uid()
     and dia = (now() at time zone 'America/Sao_Paulo')::date
     and estornavel
     and ultimo_consumo_em > now() - interval '2 minutes'
     and estornos < 5;
end;
$$;

revoke execute on function ia_estornar(text) from public, anon;
grant execute on function ia_estornar(text) to authenticated;

-- 2) Funções de kit: só as triggers usam.
revoke execute on function recalcular_kits(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function estoque_calculado_kit(uuid) from public, anon, authenticated;
revoke execute on function componentes_do_kit(uuid) from public, anon, authenticated;

-- 3) admin_*: sem anon (e_master() continua sendo a trava de verdade).
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- 4) vendas_offline: INSERT só com conta ativa.
drop policy if exists "dono_vendas_offline_insert" on vendas_offline;
create policy "dono_vendas_offline_insert" on vendas_offline for insert
  with check (auth.uid() = user_id and conta_ativa());

-- 5) Índices de chave estrangeira
create index if not exists idx_fk_assinaturas_plano_id on assinaturas (plano_id) where plano_id is not null;
create index if not exists idx_fk_assinaturas_plano_solicitado on assinaturas (plano_solicitado) where plano_solicitado is not null;
create index if not exists idx_fk_clientes_possivel_duplicado_de on clientes (possivel_duplicado_de) where possivel_duplicado_de is not null;
create index if not exists idx_fk_devolucao_itens_devolucao_id on devolucao_itens (devolucao_id) where devolucao_id is not null;
create index if not exists idx_fk_devolucao_itens_produto_id on devolucao_itens (produto_id) where produto_id is not null;
create index if not exists idx_fk_devolucoes_conta_id on devolucoes (conta_id) where conta_id is not null;
create index if not exists idx_fk_estoque_movimentacoes_armazem_destino_id on estoque_movimentacoes (armazem_destino_id) where armazem_destino_id is not null;
create index if not exists idx_fk_estoque_reservas_user_id on estoque_reservas (user_id);
create index if not exists idx_fk_gastos_anuncios_loja_id on gastos_anuncios (loja_id) where loja_id is not null;
create index if not exists idx_fk_gastos_anuncios_produto_id on gastos_anuncios (produto_id) where produto_id is not null;
create index if not exists idx_fk_marketplace_anuncios_user_id on marketplace_anuncios (user_id);
create index if not exists idx_fk_marketplace_conexoes_loja_id on marketplace_conexoes (loja_id) where loja_id is not null;
create index if not exists idx_fk_marketplace_vinculos_loja_id on marketplace_vinculos (loja_id) where loja_id is not null;
create index if not exists idx_fk_marketplace_vinculos_produto_id on marketplace_vinculos (produto_id) where produto_id is not null;
create index if not exists idx_fk_notas_fiscais_user_id on notas_fiscais (user_id);
create index if not exists idx_fk_pagamentos_conta_conta_id on pagamentos_conta (conta_id) where conta_id is not null;
create index if not exists idx_fk_pagamentos_conta_movimentacao_id on pagamentos_conta (movimentacao_id) where movimentacao_id is not null;
create index if not exists idx_fk_pedidos_marketplace_conta_receber_id on pedidos_marketplace (conta_receber_id) where conta_receber_id is not null;
create index if not exists idx_fk_pedidos_marketplace_loja_id on pedidos_marketplace (loja_id) where loja_id is not null;
create index if not exists idx_fk_pedidos_marketplace_itens_user_id on pedidos_marketplace_itens (user_id);
create index if not exists idx_fk_pedidos_vitrine_cliente_id on pedidos_vitrine (cliente_id) where cliente_id is not null;
create index if not exists idx_fk_pedidos_vitrine_venda_id on pedidos_vitrine (venda_id) where venda_id is not null;
create index if not exists idx_fk_pedidos_vitrine_itens_produto_id on pedidos_vitrine_itens (produto_id) where produto_id is not null;
create index if not exists idx_fk_precificacoes_loja_id on precificacoes (loja_id) where loja_id is not null;
create index if not exists idx_fk_venda_parcelas_conta_id on venda_parcelas (conta_id) where conta_id is not null;
create index if not exists idx_fk_vendas_offline_user_id on vendas_offline (user_id);
create index if not exists idx_fk_vendas_offline_venda_id on vendas_offline (venda_id) where venda_id is not null;

NOTIFY pgrst, 'reload schema';
