-- ============================================================
-- 0054 — Envio do marketplace pelo SERTÃO (Fase 10.5).
--
-- O SERTÃO programa o envio na Shopee (`ship_order`) e baixa a etiqueta. pedidos_marketplace
-- guarda o estado disso:
--   envio_programado_em  — ship_order aceito (até a Shopee marcar PROCESSED: "Programando");
--   envio_erro           — última falha ao programar ("Falha", com o motivo);
--   rastreio             — código de rastreio (a coluna já vem da 0046; o add é só por garantia);
--   etiqueta_impressa_em — etiqueta baixada; pedido PROCESSED + impressa = Para Retirada.
-- A tabela só tem leitura para o dono, então a escrita é por `registrar_envio_marketplace`.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table pedidos_marketplace add column if not exists envio_programado_em timestamptz;
alter table pedidos_marketplace add column if not exists envio_erro text;
alter table pedidos_marketplace add column if not exists rastreio text;
alter table pedidos_marketplace add column if not exists etiqueta_impressa_em timestamptz;

-- p_envios: [{ "id": uuid, "programado"?: bool, "erro"?: text|null, "rastreio"?: text, "impressa"?: bool }]
-- Chave ausente = não mexe. "erro": null limpa a falha.
create or replace function registrar_envio_marketplace(p_envios jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_e    jsonb;
  v_n    integer := 0;
  v_k    integer;
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if jsonb_typeof(p_envios) <> 'array' or jsonb_array_length(p_envios) > 500 then
    raise exception 'Lista de envios inválida.';
  end if;
  for v_e in select * from jsonb_array_elements(p_envios) loop
    update pedidos_marketplace set
      envio_programado_em = case when not (v_e ? 'programado') then envio_programado_em
                                 when (v_e->>'programado')::boolean then coalesce(envio_programado_em, now()) else null end,
      envio_erro = case when v_e ? 'erro' then nullif(left(v_e->>'erro', 300), '') else envio_erro end,
      rastreio = case when v_e ? 'rastreio' then nullif(left(v_e->>'rastreio', 60), '') else rastreio end,
      etiqueta_impressa_em = case when not (v_e ? 'impressa') then etiqueta_impressa_em
                                  when (v_e->>'impressa')::boolean then coalesce(etiqueta_impressa_em, now()) else null end,
      atualizado_em = now()
    where user_id = v_user and id = (v_e->>'id')::uuid;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end;
$$;

revoke execute on function registrar_envio_marketplace(jsonb) from public, anon;
grant execute on function registrar_envio_marketplace(jsonb) to authenticated;

NOTIFY pgrst, 'reload schema';
