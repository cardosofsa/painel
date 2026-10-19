-- ============================================================
-- 0105 — Uma NF-e ativa por venda.
--
-- Por quê: emitir a NF-e duas vezes (dois cliques, duas abas, ou tentar de novo enquanto a
-- primeira ainda estava "processando" na Sefaz) criava duas notas para a mesma venda. O código
-- agora confere antes de emitir; este índice é a trava no banco para o caso das duas tentativas
-- chegarem no mesmo instante (a segunda recebe 23505 e a tela explica).
--
-- Vale só para nota ATIVA (processando ou autorizada): rejeitada e cancelada não contam, então
-- emitir de novo depois de uma rejeição continua possível.
--
-- Se o banco já tiver duas notas ativas para a mesma venda, o índice não pode ser criado: o
-- script avisa (NOTICE) com a quantidade, não apaga nada, e pode ser rodado de novo depois de
-- resolver (cancelar a nota duplicada no emissor). Idempotente. Termina com NOTIFY.
-- ============================================================

do $$
declare
  v_dup integer;
begin
  if exists (select 1 from pg_indexes where indexname = 'notas_fiscais_nfe_ativa_unica') then
    return;
  end if;
  select count(*) into v_dup from (
    select venda_id from notas_fiscais
     where tipo = 'nfe' and status in ('processando', 'autorizada')
     group by venda_id having count(*) > 1
  ) d;
  if v_dup > 0 then
    raise notice '0105: % venda(s) já têm mais de uma NF-e ativa; o índice NÃO foi criado. Resolva e rode de novo.', v_dup;
    return;
  end if;
  create unique index notas_fiscais_nfe_ativa_unica on notas_fiscais (venda_id)
    where tipo = 'nfe' and status in ('processando', 'autorizada');
end $$;

NOTIFY pgrst, 'reload schema';
