# Auditoria do Sertão: outubro/2026 (Fase 0)

Feita com consultas **só de leitura** no banco de produção (catálogo do Postgres, nenhum dado
de conta), varredura do código e teste da precificação no navegador com a conta de teste.

## Resumo

| Área | Situação |
| --- | --- |
| Tabelas sem RLS | ✅ nenhuma |
| `security definer` sem `search_path` fixo | ✅ nenhuma |
| Policies de escrita sem `with check` | ✅ nenhuma |
| Tabelas filhas sem `conta_ativa()` | ✅ ok: herdam pelo `exists` no pai (ver 0021) |
| **Cota de IA contornável pelo console** | ❌ corrigido na **0070** |
| **Funções de kit abertas a qualquer um** | ❌ corrigido na **0070** |
| Funções `admin_*` executáveis por `anon` | ⚠️ protegidas por `e_master()`; `anon` removido na **0070** |
| `vendas_offline` grava com conta suspensa | ⚠️ corrigido na **0070** |
| Chaves estrangeiras sem índice (27) | ⚠️ índices na **0070** |
| Datas em UTC (`toISOString().slice(0,10)`) | ⚠️ 2 casos errados corrigidos; os demais são aritmética UTC correta |
| Painel de vendas contava o dia em UTC | ❌ corrigido na PR #9 |
| Precificação (4 modos, Shopee, zona morta) | ✅ números conferem com a conta à mão |

## 1. Segurança no banco

### 1.1 Cota de IA ilimitada (grave, corrigido)
`ia_estornar()` devolve uma vaga da cota de IA quando a chamada à IA falha por motivo de
infraestrutura. Ela é chamada pelo servidor com a sessão do usuário, então também pode ser
chamada pelo **console do navegador**: bastava chamar depois de cada geração para nunca
gastar a cota. Na IA do sistema, o custo do Gemini fica com o dono do sistema.

**Correção (0070):** o estorno agora só vale:
- para a geração mais recente (até 2 minutos);
- uma vez por geração;
- no máximo 5 por dia.

A marca de "estornável" é posta por um trigger quando `ia_consumir` soma uma geração.
Teste: `scripts/sql/seguranca-auditoria.mjs`.

### 1.2 Funções de kit abertas (média, corrigido)
`recalcular_kits`, `estoque_calculado_kit` e `componentes_do_kit` são `security definer` e
estavam com EXECUTE para todo mundo, **inclusive sem login**. Com isso dava para:
- regravar o estoque calculado de kits de outra conta;
- ler o estoque de produtos alheios pelo id.

Só os triggers usam essas funções, e eles rodam como dono. **Correção (0070):** EXECUTE
revogado de `public`, `anon` e `authenticated`. O teste confirma que o kit continua
recalculando.

### 1.3 Funções `admin_*` (baixa)
Todas conferem `e_master()` por dentro, e é isso que segura. **0070:** tira o EXECUTE de
`anon` como segunda camada.

### 1.4 `vendas_offline` (baixa)
O INSERT não exigia conta ativa. **0070:** passa a exigir.

### 1.5 Conferido e ok
- **Tabelas filhas** (`venda_itens`, `produto_imagens`, `anuncio_variacoes`…): a policy faz
  `exists` no pai, e o pai já tem `conta_ativa()`.
- **`pedidos_vitrine_cota`:** RLS sem policy, fechada de propósito. Só a função da vitrine
  escreve nela.
- **`definir_pagamento_pedido_vitrine`:** exige o código de idempotência do pedido e vale só
  por 1 hora.
- **Buckets:** limite de tamanho e tipos de arquivo definidos. As notas fiscais ficam privadas.

## 2. Desempenho
- **27 chaves estrangeiras sem índice:** joins e o `on delete` das tabelas pai faziam
  varredura. **0070** cria os índices, parciais quando a coluna é opcional.

## 3. Código
- **Datas:** dois lugares usavam a data em UTC e trocavam de dia depois das 21h. Ambos
  corrigidos para o horário de Brasília (`hojeIsoBrasil`):
  - o "comprar até" da sugestão de compras (`lib/compras.ts`);
  - o nome do arquivo de etiquetas.
- **Server Actions:** quase todas passam por `executar`/`executarComToast` ou conferem
  `r.ok`. Restam chamadas "melhor esforço" que ignoram o resultado de propósito: marcar
  alerta lido ao navegar e sair do modo operador. Não perdem dado.
- **Cores soltas:** só em sobreposições (`bg-black/40` atrás de modal), no verde oficial do
  WhatsApp na vitrine e no fundo branco do QR code. Todos têm motivo.
- **`clienteServico()`:** usado só nas rotas sem sessão permitidas (vitrine, webhooks).

## 4. Precificação: retorno (item 8)
Conta de teste: custo R$ 30, taxa fixa R$ 4, comissão 20%, imposto 6%.

| Modo | Sistema | Conta à mão |
| --- | --- | --- |
| Margem 28% | R$ 73,91, lucro R$ 20,70 | 34 / 0,46 = 73,91 ✅ |
| Markup 50% | R$ 66,22, lucro R$ 15,00 | 49 / 0,74 = 66,22 ✅ |
| Lucro R$ 20 | R$ 72,97 | 54 / 0,74 = 72,97 ✅ |
| Preço R$ 85 | lucro R$ 28,90 | 85 × 0,74 − 34 = 28,90 ✅ |
| Shopee, R$ 85 (14% + R$ 16) | lucro R$ 22,00 | 85 × 0,80 − 46 = 22,00 ✅ |
| Zona morta | R$ 80,00 a R$ 88,36 | 0,8P − 46 = 25,19 → P = 88,36 ✅ |

**O que está bom:**
- A faixa de comissão é escolhida pelo preço resultante.
- A zona morta avisa com o valor exato e oferece "Usar R$ 79,99".
- A sugestão de preço psicológico (R$ 46,90).

**Sugestões:**
1. **"Margem sobre custo"** no resultado era, na verdade, o markup. **Renomeado** para
   "Markup sobre o custo", para não confundir com a margem líquida.
2. **Comparar com o preço que você usa hoje:** é o Raio-X (Fase 1).
3. **Frete grátis/subsídio do marketplace** como linha própria, em vez de embutido na
   "taxa adicional".
4. **Histórico de custo:** avisar quando o custo do produto mudou desde a precificação
   salva. Entra no Raio-X.
