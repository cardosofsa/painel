-- ============================================================
-- 0032 — Endereço completo do cliente, garantia por item e dados da empresa.
--
-- Tudo aditivo e idempotente (`if not exists`): rodar duas vezes não muda nada.
-- ============================================================

-- 1) Cliente: número, bairro e complemento. `cep`, `endereco` (logradouro), `cidade` e
--    `uf` já existiam desde a 0001.
alter table clientes
  add column if not exists numero text,
  add column if not exists bairro text,
  add column if not exists complemento text;

-- 2) Garantia. null = sem garantia. O produto guarda o padrão; a venda congela o valor
--    usado em cada item (`venda_itens.garantia_dias`), editável na hora da venda.
alter table produtos
  add column if not exists garantia_dias integer
    check (garantia_dias is null or garantia_dias between 1 and 3650);

alter table venda_itens
  add column if not exists garantia_dias integer
    check (garantia_dias is null or garantia_dias between 1 and 3650);

-- 3) Dados da empresa, para o cabeçalho do comprovante. `nome_negocio`, `cnpj` e
--    `whatsapp` já existiam.
alter table perfil_negocio
  add column if not exists logo_url text,
  add column if not exists telefone text,
  add column if not exists email text,
  add column if not exists cep text,
  add column if not exists endereco text,
  add column if not exists numero text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists instagram text;

NOTIFY pgrst, 'reload schema';
