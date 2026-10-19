-- ============================================================
-- OPCIONAL, depois da 0101: preenche o preço de cada loja com a ÚLTIMA precificação salva
-- para aquele produto naquela loja. Escreve em dado real — rode só se quiser.
--
-- Só preenche loja que ainda está SEM preço: nunca sobrescreve um preço já definido.
-- Ignora precificações "em massa" (são estimativas da planilha) e as sem produto ou loja.
-- Pode rodar mais de uma vez: a segunda não muda nada.
--
-- Passo 1 (só leitura): quantas lojas seriam preenchidas.
-- ============================================================

select count(*) as lojas_que_ganham_preco
from (
  select distinct on (p.produto_id, p.loja_id) p.produto_id, p.loja_id
  from precificacoes p
  join produtos pr on pr.id = p.produto_id and pr.user_id = p.user_id
  join lojas_canal l on l.id = p.loja_id and l.user_id = p.user_id
  where p.origem = 'individual' and p.preco_calculado > 0
  order by p.produto_id, p.loja_id, p.criado_em desc
) ult
left join produto_lojas pl on pl.produto_id = ult.produto_id and pl.loja_id = ult.loja_id
where pl.preco is null;

-- ============================================================
-- Passo 2 (escreve): descomente e rode.
-- ============================================================

-- insert into produto_lojas (produto_id, loja_id, preco, precificacao_id, preco_atualizado_em)
-- select ult.produto_id, ult.loja_id, round(ult.preco_calculado, 2), ult.id, ult.criado_em
-- from (
--   select distinct on (p.produto_id, p.loja_id) p.id, p.produto_id, p.loja_id, p.preco_calculado, p.criado_em
--   from precificacoes p
--   join produtos pr on pr.id = p.produto_id and pr.user_id = p.user_id
--   join lojas_canal l on l.id = p.loja_id and l.user_id = p.user_id
--   where p.origem = 'individual' and p.preco_calculado > 0
--   order by p.produto_id, p.loja_id, p.criado_em desc
-- ) ult
-- on conflict (produto_id, loja_id) do update
--   set preco = excluded.preco, precificacao_id = excluded.precificacao_id, preco_atualizado_em = excluded.preco_atualizado_em
--   where produto_lojas.preco is null;
