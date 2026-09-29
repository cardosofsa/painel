-- ============================================================
-- 0034 — Alertas de estoque mínimo.
--
-- Quando um produto ativo chega (ou passa) do estoque mínimo, nasce UM alerta "novo".
-- O dono pode marcar como lido (ignora) ou abrir um pedido de compra. Voltou acima do
-- mínimo (compra recebida, cancelamento de venda, ajuste) → o alerta é "resolvido" sozinho,
-- e o próximo cruzamento gera um alerta novo.
--
-- Fica num gatilho em `produtos` (e não no código da venda) porque estoque muda por vários
-- caminhos — PDV, cancelamento, entrada, pedido recebido, ajuste manual, edição do produto —
-- e um gatilho cobre todos, inclusive os que ainda não existem.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists alertas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  tipo       text not null check (tipo in ('estoque_minimo')),
  produto_id uuid references produtos(id) on delete cascade,
  mensagem   text not null,
  status     text not null default 'novo' check (status in ('novo', 'lido', 'resolvido')),
  criado_em  timestamptz not null default now(),
  lido_em    timestamptz
);

create index if not exists alertas_user_status_idx on alertas (user_id, status, criado_em desc);
create index if not exists alertas_produto_idx on alertas (produto_id);

alter table alertas enable row level security;

drop policy if exists "own_rows_alertas" on alertas;
create policy "own_rows_alertas" on alertas for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_alertas on alertas;
create trigger trg_valida_vinculo_alertas
before insert or update of produto_id on alertas
for each row execute function validar_vinculo_do_dono('produto_id', 'produtos');

-- ------------------------------------------------------------
-- Gatilho
--
-- security definer porque o estoque pode mudar por uma função que não é do dono da linha
-- de alerta (ex.: rotinas administrativas); o `user_id` do alerta vem sempre do PRODUTO,
-- nunca de auth.uid(), então não dá para gerar alerta na conta dos outros.
--
-- A regra "não existe alerta pendente (novo ou lido) para este produto" faz o papel de
-- detectar o cruzamento sem olhar OLD: um produto que continua abaixo do mínimo depois de
-- mais vendas não gera alerta repetido, e um alerta marcado como lido continua contando
-- como pendente até o estoque voltar ao normal.
-- ------------------------------------------------------------
create or replace function alertar_estoque_minimo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ativo and new.estoque_minimo > 0 and new.estoque <= new.estoque_minimo then
    insert into alertas (user_id, tipo, produto_id, mensagem)
    select new.user_id,
           'estoque_minimo',
           new.id,
           format(
             'O produto %s chegou ao estoque mínimo de %s unidades (estoque atual: %s).',
             new.nome || coalesce(' — ' || new.variante_nome, ''),
             new.estoque_minimo,
             new.estoque
           )
    where not exists (
      select 1 from alertas a
       where a.produto_id = new.id and a.tipo = 'estoque_minimo' and a.status in ('novo', 'lido')
    );
  else
    update alertas
       set status = 'resolvido'
     where produto_id = new.id and tipo = 'estoque_minimo' and status in ('novo', 'lido');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_alertar_estoque_minimo on produtos;
create trigger trg_alertar_estoque_minimo
after insert or update of estoque, estoque_minimo, ativo on produtos
for each row execute function alertar_estoque_minimo();

-- ------------------------------------------------------------
-- Alertas dos produtos que JÁ estão no mínimo hoje (uma vez só: a condição
-- `not exists` impede duplicar se a migração rodar de novo).
-- ------------------------------------------------------------
insert into alertas (user_id, tipo, produto_id, mensagem)
select p.user_id,
       'estoque_minimo',
       p.id,
       format(
         'O produto %s chegou ao estoque mínimo de %s unidades (estoque atual: %s).',
         p.nome || coalesce(' — ' || p.variante_nome, ''),
         p.estoque_minimo,
         p.estoque
       )
  from produtos p
 where p.ativo and p.estoque_minimo > 0 and p.estoque <= p.estoque_minimo
   and not exists (
     select 1 from alertas a
      where a.produto_id = p.id and a.tipo = 'estoque_minimo' and a.status in ('novo', 'lido')
   );

NOTIFY pgrst, 'reload schema';
