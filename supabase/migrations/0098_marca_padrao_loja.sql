-- ============================================================
-- 0098 — Padrão da loja: perfil de marca, memória e Ficha de Direção de Arte.
--
-- Por quê: o assistente de anúncios (título, capa, imagens) precisa saber COMO a loja quer
-- aparecer, sem regra de nicho escrita no código: quem assina pode vender qualquer coisa, em
-- qualquer marketplace, e pode mudar de nicho. Tudo aqui é dado do usuário, por perfil:
--
--   perfis_marca   um perfil por loja/marca: plataforma (primeira pergunta), nicho (texto
--                  livre, opcional), link da loja, logo, imagens de referência e termos que
--                  ele não quer ver nos textos e nas imagens.
--   marca_memoria  preferências e regras curtas ("capas sem pessoa", "sempre 6 imagens").
--                  Valem para um perfil ou, sem perfil, para a conta toda. A IA só PROPÕE;
--                  nada passa a valer sem o usuário aprovar.
--   marca_fichas   a Ficha de Direção de Arte: campos estruturados do visual (fundo, luz,
--                  paleta, logo...) por tipo de imagem, VERSIONADA. Uma versão ativa por
--                  perfil e tipo; as anteriores ficam para voltar atrás.
--
-- RPCs `security definer` (a versão é calculada e a anterior desativada numa transação só,
-- com o perfil travado, então dois cliques seguidos não geram a mesma versão):
--   salvar_ficha_marca(perfil, tipo, dados, origem, nota)   nova versão ativa
--   ativar_ficha_marca(ficha)                                volta a uma versão anterior
--
-- Arquivos (logo e capas) ficam no bucket `produtos` (público, imagens, até 5 MB), na pasta
-- do próprio usuário; aqui só se guarda o caminho.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists perfis_marca (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade default auth.uid(),
  nome             text not null check (length(btrim(nome)) between 1 and 80),
  plataforma       text not null default 'shopee'
                   check (plataforma in ('shopee', 'mercadolivre', 'amazon', 'shein', 'tiktok', 'magalu', 'outra')),
  loja_id          uuid references lojas_canal(id) on delete set null,
  nicho            text check (nicho is null or length(nicho) <= 120),
  link_loja        text check (link_loja is null or (length(link_loja) <= 300 and link_loja ~* '^https?://')),
  logo_path        text check (logo_path is null or length(logo_path) <= 300),
  referencias      text[] not null default '{}' check (cardinality(referencias) <= 8),
  termos_proibidos text[] not null default '{}' check (cardinality(termos_proibidos) <= 100),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (user_id, nome)
);
create index if not exists perfis_marca_user_idx on perfis_marca (user_id);

alter table perfis_marca enable row level security;
drop policy if exists "dono_perfis_marca" on perfis_marca;
create policy "dono_perfis_marca" on perfis_marca for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_perfil_marca_loja on perfis_marca;
create trigger trg_valida_vinculo_perfil_marca_loja
before insert or update of loja_id on perfis_marca
for each row execute function validar_vinculo_do_dono('loja_id', 'lojas_canal');

create table if not exists marca_memoria (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade default auth.uid(),
  perfil_id uuid references perfis_marca(id) on delete cascade,
  tipo      text not null default 'preferencia' check (tipo in ('preferencia', 'regra', 'aprendizado')),
  texto     text not null check (length(btrim(texto)) between 3 and 240),
  origem    text not null default 'usuario' check (origem in ('usuario', 'ia')),
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists marca_memoria_user_idx on marca_memoria (user_id, perfil_id);

alter table marca_memoria enable row level security;
drop policy if exists "dono_marca_memoria" on marca_memoria;
create policy "dono_marca_memoria" on marca_memoria for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_marca_memoria_perfil on marca_memoria;
create trigger trg_valida_vinculo_marca_memoria_perfil
before insert or update of perfil_id on marca_memoria
for each row execute function validar_vinculo_do_dono('perfil_id', 'perfis_marca');

create table if not exists marca_fichas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  perfil_id   uuid not null references perfis_marca(id) on delete cascade,
  tipo_imagem text not null check (tipo_imagem in ('geral', 'capa_1', 'capa_2', 'detalhe', 'beneficios', 'uso', 'composicao', 'faq')),
  versao      integer not null check (versao >= 1),
  dados       jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and length(dados::text) <= 8000),
  ativa       boolean not null default true,
  origem      text not null default 'usuario' check (origem in ('usuario', 'ia_capas', 'ajuste_ia')),
  nota        text check (nota is null or length(nota) <= 240),
  criado_em   timestamptz not null default now(),
  unique (perfil_id, tipo_imagem, versao)
);
-- No máximo uma versão ativa por perfil e tipo.
create unique index if not exists marca_fichas_ativa_unica on marca_fichas (perfil_id, tipo_imagem) where ativa;
create index if not exists marca_fichas_user_idx on marca_fichas (user_id, perfil_id);

alter table marca_fichas enable row level security;
drop policy if exists "dono_marca_fichas" on marca_fichas;
create policy "dono_marca_fichas" on marca_fichas for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_marca_ficha_perfil on marca_fichas;
create trigger trg_valida_vinculo_marca_ficha_perfil
before insert or update of perfil_id on marca_fichas
for each row execute function validar_vinculo_do_dono('perfil_id', 'perfis_marca');

-- Nova versão ativa da ficha. Trava o perfil para serializar quem salva ao mesmo tempo.
create or replace function salvar_ficha_marca(
  p_perfil_id   uuid,
  p_tipo_imagem text,
  p_dados       jsonb,
  p_origem      text default 'usuario',
  p_nota        text default null
)
returns table (id uuid, versao integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_versao integer;
  v_id     uuid;
begin
  if v_uid is null or not conta_ativa() then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  if not exists (select 1 from perfis_marca where perfis_marca.id = p_perfil_id and perfis_marca.user_id = v_uid) then
    raise exception 'Perfil não encontrado.';
  end if;
  if p_tipo_imagem not in ('geral', 'capa_1', 'capa_2', 'detalhe', 'beneficios', 'uso', 'composicao', 'faq') then
    raise exception 'Tipo de imagem inválido.';
  end if;
  if p_origem not in ('usuario', 'ia_capas', 'ajuste_ia') then
    raise exception 'Origem inválida.';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or length(p_dados::text) > 8000 then
    raise exception 'Ficha inválida.';
  end if;

  -- Serializa por perfil: dois salvamentos simultâneos não calculam a mesma versão.
  perform 1 from perfis_marca where perfis_marca.id = p_perfil_id and perfis_marca.user_id = v_uid for update;

  select coalesce(max(f.versao), 0) + 1 into v_versao
    from marca_fichas f
   where f.perfil_id = p_perfil_id and f.tipo_imagem = p_tipo_imagem;

  update marca_fichas f set ativa = false
   where f.perfil_id = p_perfil_id and f.tipo_imagem = p_tipo_imagem and f.ativa;

  insert into marca_fichas (user_id, perfil_id, tipo_imagem, versao, dados, ativa, origem, nota)
  values (v_uid, p_perfil_id, p_tipo_imagem, v_versao, p_dados, true, p_origem, left(p_nota, 240))
  returning marca_fichas.id into v_id;

  return query select v_id, v_versao;
end;
$$;

-- Volta a uma versão anterior (a atual passa a inativa).
create or replace function ativar_ficha_marca(p_ficha_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_perfil uuid;
  v_tipo   text;
begin
  if v_uid is null or not conta_ativa() then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  select f.perfil_id, f.tipo_imagem into v_perfil, v_tipo
    from marca_fichas f where f.id = p_ficha_id and f.user_id = v_uid;
  if v_perfil is null then
    raise exception 'Ficha não encontrada.';
  end if;

  perform 1 from perfis_marca where perfis_marca.id = v_perfil and perfis_marca.user_id = v_uid for update;
  update marca_fichas f set ativa = false where f.perfil_id = v_perfil and f.tipo_imagem = v_tipo and f.ativa;
  update marca_fichas f set ativa = true where f.id = p_ficha_id and f.user_id = v_uid;
end;
$$;

-- Só quem está logado chama (a função também confere auth.uid()).
revoke execute on function salvar_ficha_marca(uuid, text, jsonb, text, text) from public, anon;
grant execute on function salvar_ficha_marca(uuid, text, jsonb, text, text) to authenticated;
revoke execute on function ativar_ficha_marca(uuid) from public, anon;
grant execute on function ativar_ficha_marca(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
