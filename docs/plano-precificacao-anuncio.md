# Plano: Precificação + Anúncio (correção, integração, IA e redesenho)

Na Fase 0, este arquivo é copiado para `docs/plano-precificacao-anuncio.md`, enviado a você e versionado.

## Contexto

As abas **Precificação** e **Anúncio** são as mais importantes do sistema. O pedido é:

1. corrigir os erros;
2. integrar as duas abas, com preço separado por loja;
3. redesenhar as duas com visual moderno;
4. proteger o trabalho em andamento contra saída acidental, com "Salvar rascunho";
5. criar a **Análise completa do anúncio com IA**, que cobre título, imagens, estratégia e preço;
6. criar o **Ajuste de Preço**: pegar um anúncio seu e ver o preço atual, o mínimo, o máximo, sugestões, estratégias e promoções, de forma interativa.

Tudo até aqui foi **só leitura**: três varreduras gerais, duas focadas nas abas, e conferência manual dos itens marcados com ✔.

---

## 0. Orientações permanentes (valem em todas as fases)

**Comunicação e rotina de trabalho**
- Respostas sempre em pt-BR.
- Branch `claude/laughing-noether-rxrssz`, recriada a partir do `origin/master` atualizado.
- PR só quando você pedir.
- Um commit por fase, com mensagem descritiva.
- Trabalho econômico: comandos diretos, sem subagentes na execução. Durante a fase rodo só os testes do arquivo mexido (`npx vitest run <arquivo>`); a suíte completa roda no fim da fase.

**Banco de dados (CLAUDE.md)**
- Migrações idempotentes:
  - `if not exists` e `create or replace`;
  - `do $$ … $$` para DDL condicional;
  - `drop function` antes de mudar o retorno de uma função;
  - terminam sempre com `NOTIFY pgrst, 'reload schema';`.
- Toda tabela nova precisa de:
  - `user_id uuid not null references auth.users on delete cascade default auth.uid()`;
  - RLS ligada;
  - policy `using (auth.uid() = user_id and conta_ativa())` com o mesmo predicado em `with check`.
- **Nunca aplico migração.** O caminho é sempre o mesmo:
  1. rodo `npm run test:sql`;
  2. rodo `npm run db:migracao -- <arquivo>` **sem** `--aplicar`;
  3. mostro o resumo (o que muda e o que pode quebrar no código que está no ar);
  4. **paro e espero você**. Uma migração por vez; a autorização de uma não vale para a próxima.
- O código continua funcionando **antes e depois** de cada migração (cai no comportamento atual se a coluna ou função ainda não existir).

**Código (CLAUDE.md e DESIGN.md)**
- Server Actions:
  - corpo dentro de `comResultado()` e chamada no cliente por `executarComToast`;
  - validação com `validar()`;
  - erro por `lancarErroSupabase`;
  - terminam com `revalidatePath`.
- Nenhuma chamada ao Supabase direto do cliente.
- Nada de `clienteServico()` em tela ou action.
- IA:
  - ordem **cache → cota → chamada**;
  - a IA **só narra** números calculados no servidor; o navegador manda apenas ids;
  - nenhum dado de cliente final vai para a IA;
  - `lib/ia/gemini.ts` nunca é importado por Client Component.
- Dinheiro:
  - arredondamento por função única;
  - números digitados passam por `numeroOuNulo`;
  - datas por `hojeIsoBrasil`/`formatarDataIso`;
  - somas de listas grandes vão para o banco.
- Design:
  - só tokens (sem cor solta);
  - sombras só `shadow-elev-*`;
  - contraste coberto por `lib/cores.test.ts`;
  - foco visível preservado;
  - grade começa em `grid-cols-1`;
  - no máximo 2 botões no cabeçalho;
  - listas vazias com `EmptyState`;
  - todo envio com `loading`;
  - ação destrutiva passa por `useConfirm`;
  - `key` no componente que tem o `useState`;
  - movimento só funcional, desligado em `prefers-reduced-motion`.

**Testes e entrega**
- Cada fase só termina com `npx tsc --noEmit`, `npm run lint`, `npm test` e `npm run build` limpos (mais `npm run test:sql` quando houver migração).
- Telas conferidas no navegador com Playwright **na conta de teste `painel@teste.com`** (credenciais no ambiente, variáveis `TESTE_EMAIL`/`TESTE_SENHA`), a 360 px e a 1280 px, nos temas claro e escuro, **nunca na conta real**.

**Honestidade sobre o que não testo**
- chamadas reais à Shopee (criar item, ler imagens e métricas);
- geração e análise de imagem com cota de produção;
- aplicação de migração em produção.

Esses pontos ficam com você e estão marcados em cada fase.

**Suas decisões**
1. Preço **por loja**: cada loja aparece com o próprio campo de preço, sem misturar canais.
2. Corrigir e **redesenhar com visual moderno**.
3. Título e descrição com IA **só no Anúncio**; a Precificação ganha "Criar anúncio deste produto".
4. O nome é **"Ajuste de Preço"**.
5. A IA analisa **só a capa**, com confirmação de custo.
6. O rascunho da Precificação fica **no banco**.

---

## 1. Revisão da auditoria (respondendo "foi feita corretamente?")

- **Conferido por mim no código (✔):**
  - P1 (o custo não vem ao escolher o produto);
  - P4 (números com vírgula quebrados);
  - A1 (rascunho errado ao continuar);
  - A4 (o preço do anúncio vem do cadastro);
  - A14 (dois "anúncios" diferentes);
  - a ausência de `beforeunload` (não há proteção de saída);
  - os dados já sincronizados dos anúncios da Shopee (título, capa, link, preço atual, SKU e produto; migrações 0049, 0071 e 0093);
  - o suporte a imagem na IA (`gerarProdutoPelaFotoIA` e `gerarFichaPelasCapasIA` em `lib/ia/gerar.ts`).
- **Vindos só das varreduras (com arquivo:linha, ainda sem conferência minha):** os demais P e A. **Regra:** no início de cada fase, rodo o `grep` do item antes de mexer. Se a evidência não se confirmar, o item sai e eu aviso.
- **Correção de rodada anterior:** o limite de título da Shopee no sistema é **100** (`lib/marketplace/plataformas.ts:31`); o 120 é só o valor de reserva.
- **Lacunas reais da auditoria:**
  - nada foi executado ainda: sem `node_modules`, sem linha de base;
  - não sei quais migrações já estão no banco de produção.
  - Os dois pontos entram na Fase 0. `npm run db:verificar` é uma consulta somente leitura e permitida pelo CLAUDE.md.

---

## 2. Achados: Precificação

| ID | Achado | Sev | Correção |
|---|---|---|---|
| P1 ✔ | Escolher o produto não traz o custo (`lib/precificacao-estado.ts:431-435`) | Alto | Ao escolher: preencher custo, insumos e foto e limpar o que veio do produto anterior |
| P2 | O preço salvo diverge entre abas: Variações (`VariacoesView:167`) e Em Massa (`CalculadoraEmMassa:176`) não arredondam; Kits usa `Math.round` (`KitsView:142`); o "Ideal" do Raio-X não arredonda (`raio-x.ts:77`) | Alto | `fecharPreco()` em `lib/pricing.ts`, usada por todas as abas |
| P3 | O simulador ignora a troca de faixa da Shopee (`resultado-compartilhado:298`) | Alto | Calcular por `resultadoNoPreco` (`raio-x.ts:81`) |
| P4 ✔ | `numeroOuNulo(t.replace(",", "."))` (`RaioXView:168`, `SimuladorPromocao:19`) e `Number(v) \|\| 0` (`estado:240`, `CalculadoraEmMassa:96`) | Alto | `numeroOuNulo` puro e `CampoNumero` |
| P5 | O Raio-X aplica faixas mesmo quando a precificação foi manual (`raio-x.ts:233`) | Médio | Faixas só quando `tipoTaxa === "faixas"` |
| P6 | `margem_pct` gravada com três sentidos diferentes | Médio | Gravar sempre a margem atingida no preço final |
| P7 | Clique duplo em "Adicionar concorrente" (`PainelConcorrentes:53`) e em "Salvar no histórico" do Em Massa (`:306`) | Médio | `loading` nos botões |
| P8 | Em Massa usa imposto fixo de 6% (`precificacao-massa.ts:66`) | Médio | Repassar `aliquotaDasPadrao` |
| P9 | "Aplicar preço" não confere se o custo mudou (`estado:519`) | Médio | Aviso com a opção de recalcular |
| P10 | Duplicar do histórico perde o produto e o modo (`estado:441,453`) | Médio | Manter os dois |
| P11 | Trocar de aba perde o que foi digitado; `?visao=` não fica na URL | Médio | Abas montadas e escondidas, mais `router.replace` |
| P12 | O gráfico esconde o prejuízo (`PainelResultado:261`) | Médio | Barra empilhada que mostra o negativo |
| P13 | A loja é escolhida em dois lugares (`PainelTaxas:56`, `PainelResultado:156`) | Médio | Um seletor só |
| P14 | "Salvar Anúncio" salva uma precificação; margem e markup aparecem misturados | Médio | Termos fixos com `InfoTooltip`; botão "Salvar precificação" |
| P15 | Acessibilidade: `outline-none`, × sem `aria-label`, label sem `htmlFor`, autocomplete sem setas | Médio | Trocar por `Combobox` e corrigir pontualmente |
| P16 | `grid-cols-2/3` sem `grid-cols-1`, `<p>` em vez de `EmptyState`, `text-[10px]`, cor fixa em vez de `classeValor` | Baixo | Resolver no redesenho |
| P17 | `page.tsx`: erro de `categorias` não conferido (`:51`); `iaDisponivelParaConta` fora do `Promise.all` (`:115`) | Baixo | Ajustar |

## 3. Achados: Anúncio

| ID | Achado | Sev | Correção |
|---|---|---|---|
| A1 ✔ | "Continuar" cria um rascunho novo e vazio (`anuncio/page.tsx:85`, `InfinitoClient:85`, `estudio/actions.ts:59-69`); recarregar volta para a etapa Loja | Alto | Link `?rascunho=<id>`, carregado no servidor, mais `router.replace` |
| A2 | O texto de um rascunho aparece em outro (sem `key`; `InfinitoClient:374,397`, `PainelDescricao:98`) | Alto | `key={rascunho.id}` e limpar o estado |
| A3 | Corrida no `gravarEstado` gasta 2 imagens da cota (`lib/estudio/servidor.ts:77-85`) | Alto | Update condicional por `atualizado_em` |
| A4 ✔ | O preço enviado à Shopee é o do cadastro, sem mostrar lucro (`shopee-actions.ts:171`) | Alto | Preço por loja (seção 4) |
| A5 | Estoque e medidas não conferidos antes de criar o item (`shopee-criar-puro.ts:149-167`) | Médio | Entram na lista de pendências |
| A6 | `status` nunca muda; a etapa 6 só fica feita via API | Médio | Gravar `pronto`/`publicado`; botão "Publiquei manualmente" |
| A7 ✔ | Termos proibidos nunca bloqueiam; presets sempre `[]` | Médio | Gravidade e presets por perfil (migração) |
| A8 | Numeração dos painéis difere do trilho; Capa e Descrição liberadas sem título | Médio | Numeração única; `etapas.ts` com teste |
| A9 | Capa sem retorno de carregamento; composição que falha perde a imagem (`PainelCapa:149-152`) | Médio | `loading` certo e "desenhar de novo" sem nova cota |
| A10 | "Gerar outra" descarta a edição; apagar memória não confirma; não há "Descartar rascunho" | Médio | `useConfirm` e ação de descarte |
| A11 | Erro de IA só em toast; a cota só aparece depois de gastar | Médio | Erro fixo com "Tentar de novo" e cota visível antes |
| A12 ✔ | A lista mostra só 6 rascunhos | Baixo | Lista completa com filtro |
| A13 | Ícones sem `aria-hidden`; lista de produtos vazia sem `EmptyState` | Baixo | Ajustar |
| A14 ✔ | `anuncios` (Variações) e `anuncio_rascunhos` (Infinito) são coisas diferentes com o mesmo nome | Médio | Renomear na tela para "Grupo de variações" |

---

## 4. Preço por loja (integração)

- **Migração `0101_preco_por_loja.sql`.** Em `produto_lojas` (0013, que já tem `unique(produto_id, loja_id)`), adicionar:
  - `preco numeric(12,2)`;
  - `precificacao_id uuid references precificacoes on delete set null`;
  - `preco_atualizado_em timestamptz`.
- **Cópia opcional do histórico**, num bloco separado: preenche `preco` com a última precificação de cada loja, via `precos_canal_por_produto()` (0029:484). É escrita em dado real: **mostro a contagem no modo seco e você decide**.
- **Bloco "Preços por loja"** no resultado da Precificação e no produto:
  - uma linha por loja cadastrada;
  - em cada linha: preço, lucro e margem (calculados por `pricing.ts` com as taxas daquela loja), selo "sem preço" e botão "Precificar";
  - **loja nova aparece sozinha**, sem preço.
- **Ao salvar uma precificação com loja**, o preço vai **para aquela loja**. `produtos.preco_venda` passa a ser só o preço do PDV, balcão e catálogo.
- **Anúncio:**
  - o preço vem da loja do perfil (`perfis_marca.loja_id`);
  - a etapa Revisar mostra preço, lucro e margem, com alerta de prejuízo ou zona morta;
  - sem preço na loja, aparece "Precificar agora" (`/precificacao?produto=&loja=`);
  - a confirmação de "Criar na Shopee" exibe o preço que vai ser enviado.
- **Arquivos:**
  - `supabase/migrations/0101_preco_por_loja.sql`;
  - `scripts/sql/preco-por-loja.mjs` (teste no PGlite);
  - `lib/precos-loja.ts` + `.test.ts`;
  - `app/(painel)/precificacao/actions.ts` (`salvarPrecoLoja`);
  - `lib/estudio/servidor.ts` (lê o preço da loja);
  - `components/estudio/PainelPacote.tsx` e `PainelShopee.tsx`.

## 5. IA só no Anúncio

- Sai `GeradorIA` de `components/precificacao/PainelEntradas.tsx` e de `VariacoesView.tsx`.
- Entra o botão "Criar anúncio deste produto", que leva a `/anuncio/infinito?produto=&loja=`. O perfil da loja é escolhido e o rascunho aberto automaticamente.
- `precificacoes.titulo_anuncio` aparece em `components/estudio/PainelTitulos.tsx` como "Títulos que você já usou". Nada é apagado do banco.

## 6. Proteção de saída + "Salvar rascunho"

**Hook** `lib/hooks/useProtegerSaida.ts`, com a lógica pura em `lib/saida.ts` (+ `.test.ts`). Recebe `{ sujo: boolean, salvarRascunho?: () => Promise<boolean> }`:
- **Fechar a aba ou recarregar:** usa `beforeunload`. O navegador só permite o **aviso padrão dele**, sem botões próprios. Por isso existe o salvamento automático abaixo, para não perder nada nesse caso.
- **Clicar num link do sistema** (menu, breadcrumb): um listener de `click` na fase de captura, só para `<a>` da mesma origem, abre o modal próprio.
- **Botão Voltar:** uma entrada de histórico "sentinela" e o evento `popstate` abrem o mesmo modal.
- **O modal** (`components/ui/ModalSaida.tsx`, sobre o `Modal`) diz "Você tem alterações não salvas" e oferece três opções:
  - **Salvar rascunho e sair**;
  - **Sair sem salvar** (estilo `destructive`);
  - **Continuar aqui** (o padrão, com foco nele).
- **"Sujo"** significa: o estado mudou desde o último salvamento. É comparado por `JSON.stringify` do estado relevante.

**Precificação (migração `0100_precificacao_rascunhos.sql`):**
- **Tabela `precificacao_rascunhos`:**
  - `id`;
  - `user_id` (padrão das tabelas novas);
  - `visao` (individual, variações, kits ou massa);
  - `produto_id` (pode ser nulo);
  - `titulo` (gerado: nome do produto + loja);
  - `dados jsonb`;
  - `atualizado_em`.
  - RLS com `conta_ativa()` e `with check`; índice `(user_id, atualizado_em desc)`.
- Botão "Salvar rascunho" ao lado de "Salvar precificação".
- **Salvamento automático** a cada 5 s, só quando há mudança. É silencioso, com o indicador "Rascunho salvo há 3 s".
- Ao abrir a Precificação com rascunho pendente, aparece "Continuar rascunho: Kit Chá · Shopee A (há 2 h)", com as opções "Continuar" e "Descartar".
- O rascunho é apagado quando a precificação é salva.

**Anúncio:** o rascunho já fica no banco. A proteção cobre só o que ainda não foi salvo (descrição editada, título digitado em "Usar o meu"). "Salvar rascunho", ali, salva essa edição.

**Testes:**
- unitários de `lib/saida.ts` (quando bloquear: mesma origem, mesma rota, `target=_blank`, download);
- E2E Playwright na conta de teste: editar → clicar no menu → aparece o modal → "Salvar rascunho" → recarregar → "Continuar rascunho".

## 7. Análise completa do anúncio com IA (nova)

**Origem dos dados:** o anúncio já sincronizado da Shopee (`marketplace_anuncios`: `nome_item`, `imagem_url`, `link`, `preco_atual`, `sku`, `produto_id`, `loja_id`) **ou** um rascunho do Anúncio Infinito.

**Onde aparece:**
- botão "Analisar anúncio" no cabeçalho da Precificação (um seletor de anúncios);
- na lista do Anúncio, nova seção "Meus anúncios na loja";
- dentro do rascunho.

**Rota:** `/anuncio/analise/[id]`. Cinco abas: **Visão geral · Título · Imagens · Preço (Ajuste de Preço) · Estratégia**.

**Números calculados no servidor, sem IA** (`lib/analise-anuncio.ts` + `.test.ts`):
- **Título:**
  - nota local (`avaliarTitulo`, `lib/ia/nota-titulo.ts`);
  - tamanho comparado ao limite da plataforma;
  - conferência de termos;
  - palavras-chave do produto presentes ou ausentes.
- **Imagens:**
  - quantidade e presença de capa (`imagem_url`).
  - A lista completa vem de `get_item_base_info` (`image_url_list`; o código já lê esse campo em `shopee-api.ts:501-504`), chamada sob demanda com o token da sessão. **Não testado contra a loja real.**
- **Vendas:**
  - unidades e receita em 30 e 90 dias por `item_id` (`pedidos_marketplace` + itens), **somadas no banco** via RPC na migração 0102;
  - tendência por `lib/demanda.ts`;
  - veredito do consultor (`lib/consultor/insights.ts`);
  - estoque e risco de ruptura (`lib/alertas.ts`).
- **Preço:** resumo do Ajuste de Preço (seção 8).

**IA (só narra e sugere):**
- **Texto:** uma chamada devolve diagnóstico, 3 sugestões de título (que passam pela conferência de termos) e estratégia priorizada.
  - Novo tipo `analise_anuncio` (migração 0102 amplia o `check` de `ia_sugestoes`, como fez a 0097).
  - Mesmo cache e cota; ordem cache → cota → chamada (`executarEstruturado`).
  - Prompt em `lib/ia/prompts-analise-anuncio.ts` + `.test.ts`. Título sugerido que contenha termo bloqueado é descartado na leitura.
- **Capa:** botão separado "Analisar a capa".
  - Abre confirmação: "usa 1 imagem da sua cota de hoje".
  - Segue o padrão de `gerarProdutoPelaFotoIA`: imagem por hash, guardada em cache.
  - A cota reservada vem de `ia_reservar_imagem`, antes da chamada.
  - Devolve uma lista de pontos: legibilidade, contraste, produto em destaque, texto excessivo e aderência à Ficha de arte, se houver perfil.
- **Ações com aprovação:**
  - "Usar este título no Anúncio Infinito" (abre o rascunho com o título);
  - "Abrir Ajuste de Preço";
  - "Guardar na memória da loja".
  - Nada é aplicado sem clique.

## 8. Ajuste de Preço (nova; o seu "Reprecificar")

**Rota:** `/precificacao/ajuste/[id]`, onde `id` é o anúncio. Também fica disponível como a aba Preço da Análise.

**Entrada:**
- um anúncio sincronizado, com preço atual, loja e produto vinculado;
- ou um produto + loja, para quem ainda não tem anúncio.
- Sem produto vinculado, a tela pede o vínculo primeiro (o mapeamento já existe em `/produtos/mapeamento`).

**Cálculo puro** (`lib/ajuste-preco.ts` + `.test.ts`, todo baseado em `lib/pricing.ts` e `lib/raio-x.ts`):

| Faixa | Como é calculada |
|---|---|
| **Preço mínimo** | Lucro zero (`precoMinimo`, `raio-x.ts:90`) e mínimo com a margem mínima que você define (padrão: 10%) |
| **Preço ideal** | Margem alvo (`precoIdeal`, `raio-x.ts:77`), fechado por `fecharPreco` |
| **Preço máximo de referência** | O menor entre: o último preço antes de mudar para a faixa de comissão seguinte, o maior concorrente cadastrado (`concorrentes_preco`) e o preço psicológico mais próximo. Aparece rotulado como **referência**, não como garantia: não há dado de elasticidade. |
| **Zona morta** | As faixas em que subir o preço reduz o lucro (`pricing.ts`) |
| **Situação de hoje** | Lucro, margem e faixa no preço atual, mais a perda mensal (`perdaMensal`, `raio-x.ts:155`) |

**Na tela (interativo):**
- **Régua horizontal** do mínimo ao máximo, com as faixas da Shopee, a zona morta e três marcadores (atual, ideal, mínimo). Arrastar ou digitar o preço atualiza na hora lucro, margem, faixa e "por venda / por mês" (vendas de 30 dias × lucro).
- **Simulador de promoção**, que reaproveita a lógica de `components/precificacao/SimuladorPromocao.tsx`:
  - desconto %, cupom R$, frete grátis ou taxa extra da loja;
  - mostra o lucro na promoção e o **desconto máximo antes do prejuízo**.
- **Estratégias**, por regra (determinísticas):
  - "subir até R$ X sem mudar de faixa";
  - "sair da zona morta";
  - "preço de entrada para giro" (só com estoque alto e venda caindo);
  - "kit ou combo" (só se houver kit cadastrado).
  - A IA só explica e prioriza, reaproveitando `gerarDiagnosticoPrecoIA` (`lib/ia/gerar.ts:358`, tipo `preco`, que já existe).
- **Aplicar**, sempre com confirmação: grava o preço **na loja** (`produto_lojas.preco`, migração 0101) e registra uma precificação. **Não altera o preço na Shopee.** Mostra "Copiar preço" e o link do anúncio. Enviar o preço pela API da Shopee fica para depois, porque não foi testado.
- **Entrada pelo Raio-X:** cada linha ganha a ação "Ajuste de Preço". Não crio uma 7ª aba.

**Dado que falta, para o futuro:** histórico de preço. Hoje só existe `preco_atual`. A migração 0102 cria `marketplace_precos_historico` (`anuncio_id`, `preco`, `lido_em`, `user_id`, com RLS), gravado pela sincronização **quando o preço muda**. Com ele, depois de algumas semanas, a tela poderá mostrar "preço × vendas" de verdade.

**Migração `0102_analise_e_ajuste.sql`:**
- tipo `analise_anuncio` no `check` de `ia_sugestoes`;
- tabela `marketplace_precos_historico`;
- RPC `vendas_por_anuncio(p_loja, p_item, p_dias)`, `security invoker`, com as somas feitas no banco.

## 9. Redesenho moderno (dentro de DESIGN.md e `globals.css`)

**Precificação, aba Individual**

Antes: 12 cartões; cerca de 9 cliques mais rolagem para salvar. Depois:

```
┌ Produto ──────────────────────────┐ ┌ Resultado (fixo ao rolar) ──────┐
│ [Buscar produto ▾] custo R$ 30 ✓  │ │ R$ 73,90                         │
├ Onde vende ───────────────────────┤ │ Lucro R$ 20,70 · Margem 28%      │
│ (Shopee A)(Shopee B)(ML)(Manual)  │ │ ▓▓▓▓░░ régua de faixas · zona ⚠  │
├ Como quer lucrar ─────────────────┤ │ [custo|taxa|imposto|lucro]       │
│ (Margem)(Lucro R$)(Markup)(Preço) │ │ Preços por loja (3) ▸            │
├ ▸ Mais opções (insumos, concorr., │ │ [Salvar precificação]            │
│   estratégia, ROAS)               │ │ Salvar rascunho · Criar anúncio →│
└───────────────────────────────────┘ └──────────────────────────────────┘
```

- **Celular:** barra fixa no rodapé com "R$ 73,90 · lucro R$ 20,70 · [Salvar]", que abre o resultado completo.
- **Meta:** 4 blocos visíveis e 5 cliques.
- **Movimento:**
  - o valor que mudou pisca o fundo `accent-soft` por 140 ms;
  - "Mais opções" abre em 220 ms (`--duracao-media`).
- Variações, Kits e Em Massa reaproveitam os blocos "Onde vende" e "Como quer lucrar".

**Anúncio**
- **Lista:** todos os rascunhos, com filtro por status, mais a seção "Meus anúncios na loja" com "Analisar" e "Ajuste de Preço".
- **Fluxo:**
  - um card por etapa;
  - concorrentes numa gaveta dentro de Título;
  - cota visível no topo;
  - no celular, "Etapa 3 de 6".
- **Revisar:** primeiro "Pronto para publicar?" (com preço e lucro), depois o Pacote, por último "Criar na Shopee", que fica secundário.

**Protótipo primeiro:** a Individual nova, o Revisar e o Ajuste de Preço, com dados da conta de teste. Capturas a 360 e 1280 px, claro e escuro. **Só sigo para o redesenho completo depois da sua aprovação.**

---

## 10. Fases, com comandos diretos

Toda fase começa conferindo a evidência dos itens dela (`grep -n` nos arquivo:linha citados) e termina com:
```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A && git commit -m "<fase>: <resumo>" && git push -u origin claude/laughing-noether-rxrssz
```

**Fase 0: base**
1. Preparar a branch e copiar o plano:
   ```bash
   git fetch origin master && git checkout -B claude/laughing-noether-rxrssz origin/master
   npm ci
   npx tsc --noEmit; npm run lint; npm test; npm run test:sql; npm run build
   npm run db:verificar
   ```
   `db:verificar` é somente leitura: confirma o acesso ao projeto e quais migrações estão aplicadas.
2. Anotar a linha de base em `docs/plano-precificacao-anuncio.md`, junto com este plano.
3. Commit e envio do arquivo a você.

**Fase 1: bugs de dinheiro da Precificação** (sem migração)
- **Itens:** P1–P10, P12 e P17.
- **Arquivos:**
  - `lib/pricing.ts` (`fecharPreco`);
  - `lib/precificacao-estado.ts`;
  - `components/precificacao/{VariacoesView,CalculadoraEmMassa,KitsView,RaioXView,SimuladorPromocao,PainelConcorrentes,PainelResultado,resultado-compartilhado}.tsx`;
  - `lib/raio-x.ts`;
  - `lib/precificacao-massa.ts`;
  - `app/(painel)/precificacao/page.tsx`.
- **Testes:** `lib/pricing.test.ts` (`fecharPreco`), `lib/raio-x.test.ts` (faixa só em "faixas"), `lib/precificacao-massa.test.ts` (alíquota).

**Fase 2: bugs do Anúncio** (sem migração)
- **Itens:** A1–A3, A5, A6, A8–A11, A13.
- **Arquivos:**
  - `app/(painel)/anuncio/page.tsx`;
  - `app/(painel)/anuncio/infinito/{page,InfinitoClient}.tsx`;
  - `app/(painel)/produtos/estudio/actions.ts` (abrir por id; `descartarRascunho`; status);
  - `lib/estudio/servidor.ts` (update condicional);
  - `lib/anuncio/etapas.ts`;
  - `lib/marketplace/shopee-criar-puro.ts`;
  - `components/estudio/{PainelCapa,PainelDescricao,PainelTitulos}.tsx`.
- **Testes:** `etapas.test.ts`, `shopee-criar-puro.test.ts` (estoque e medidas) e o novo `lib/estudio/servidor.test.ts` (corrida recusada).

**Fase 3: proteção de saída + rascunho da Precificação** (migração 0100)
1. Escrever a 0100 e testar:
   ```bash
   npm run test:sql && npm run db:migracao -- 0100_precificacao_rascunhos.sql
   ```
2. **Parar e mostrar o resumo a você.**
3. Código:
   - `lib/saida.ts` + `.test.ts`;
   - `lib/hooks/useProtegerSaida.ts`;
   - `components/ui/ModalSaida.tsx`;
   - actions de rascunho em `precificacao/actions.ts`;
   - uso do hook em `PrecificacaoClient` e `InfinitoClient`.
4. E2E em `e2e/rascunho.spec.ts`, rodando na conta de teste.
- **Você aplica a 0100.**

**Fase 4: preço por loja + IA só no Anúncio** (migração 0101)
1. Escrever a 0101 e testar:
   ```bash
   npm run test:sql && npm run db:migracao -- 0101_preco_por_loja.sql
   ```
2. **Parar e mostrar o resumo** (inclusive a cópia opcional do histórico).
3. Código da seção 4 e da seção 5.
- **Você aplica a 0101** e decide sobre a cópia do histórico.

**Fase 5: protótipo**
- Individual nova, Revisar e esqueleto do Ajuste de Preço.
- Executo:
  ```bash
  npm run dev
  ```
  e depois o script Playwright em `e2e/prototipo.spec.ts`, com `TESTE_EMAIL`/`TESTE_SENHA`, gerando capturas em `docs/prototipo/`.
- Mando as capturas e **espero sua aprovação**.

**Fase 6: Ajuste de Preço + Análise do anúncio** (migração 0102)
1. Escrever a 0102 e testar:
   ```bash
   npm run test:sql && npm run db:migracao -- 0102_analise_e_ajuste.sql
   ```
2. **Parar e mostrar o resumo.**
3. Código:
   - `lib/ajuste-preco.ts` + `.test.ts`;
   - `lib/analise-anuncio.ts` + `.test.ts`;
   - `lib/ia/prompts-analise-anuncio.ts` + `.test.ts`;
   - rotas `/precificacao/ajuste/[id]` e `/anuncio/analise/[id]`, com `loading.tsx`;
   - actions com `comResultado`;
   - gravação de `marketplace_precos_historico` em `lib/marketplace/sincronizar*.ts`.
- **Você aplica a 0102** e testa com 1 anúncio real (leitura das imagens pela API e a análise da capa).

**Fase 7: redesenho completo da Precificação**
- P11, P13–P16, e os blocos compartilhados em Variações, Kits e Em Massa.
- E2E `e2e/precificacao.spec.ts`: precificar e salvar em 5 cliques.

**Fase 8: redesenho completo do Anúncio + termos que bloqueiam** (migração 0103: presets e gravidade em `perfis_marca`)
1. Escrever a 0103 e testar:
   ```bash
   npm run test:sql && npm run db:migracao -- 0103_termos_perfil.sql
   ```
2. **Parar e mostrar o resumo.**
3. Código: A7, A12, A14 e o redesenho da seção 9.

**Fase 9 (opcional): ciclo de resultado**
- Ao criar o item na Shopee, gravar o vínculo em `marketplace_anuncios`.
- A Análise passa a mostrar as vendas antes e depois de cada versão de título.

## 11. Metas medidas (na conta de teste, antes e depois)

| Medida | Hoje | Meta |
|---|---|---|
| Cliques para precificar e salvar para a Shopee | ~9, mais rolagem | 5 |
| Cartões visíveis na Individual | 12 | 4 |
| Cliques para um anúncio completo | ~14 | ~10 |
| Dados perdidos ao sair sem querer | acontece | 0 (E2E) |
| Rascunho de anúncio duplicado | acontece | 0 (teste) |
| Preço divergente entre tela e banco | acontece | 0 (teste) |
| Tempo do anúncio até o diagnóstico completo | não existe | < 10 s sem a capa (medido) |

## 12. Backlog da auditoria geral (depois destas fases; dinheiro primeiro)

- PDV grava a venda duas vezes (`PdvClient.tsx:237`). Correção: usar o `registrar_venda_offline` com a chave gerada antes.
- NF-e duplicada (`fiscal-actions.ts:85`).
- Etiqueta do Melhor Envio cobrada duas vezes.
- Corrida e erro ignorado na renovação de token (`tokens.ts:44-72`).
- Shopee sem timeout.
- PIN contornável por escrita direta em `vendas`/`perfil_negocio`.
- Somas sobre consultas cortadas em 1000 linhas.
- `error.message` cru no toast.

---

## 13. Linha de base (Fase 0, 18/10/2026)

- **Branch:** `claude/beautiful-goldberg-9lrdbs` (a branch designada para esta sessão; substitui a
  `claude/laughing-noether-rxrssz` citada acima), criada no `origin/master` em `d74ac83`.
- `npm ci`: ok.
- `npx tsc --noEmit`: limpo.
- `npm run lint`: limpo.
- `npm test`: **1542 testes passando**.
- `npm run test:sql`: **46 scripts passando** (208 s).
- `npm run build`: ok.
- `npm run db:verificar`: Management API respondeu; Postgres 17.6, 81 tabelas em `public`, 0 sem RLS.
- **Migrações em produção** (sonda só de schema, somente leitura, sem ler dado de conta):
  todas até a **0099** estão aplicadas (0090–0099 conferidas pelos objetos que cada uma cria;
  o `check` de `ia_sugestoes.tipo` já tem `concorrentes` e `assistente`, da 0099). As novas
  deste plano começam na **0100**.
- Observação: `db:verificar` não lista migrações aplicadas (não há tabela de controle); a
  conferência é feita pelos objetos de cada migração.

## 14. Fase 1 concluída: bugs de dinheiro da Precificação

- **P1** ✔ Escolher o produto traz `custo_base` e insumos do cadastro (`composicaoDoProduto`) e limpa a foto do produto anterior.
- **P2** ✔ `fecharPreco()` em `lib/pricing.ts`: Individual, Variações, Kits, Em Massa e o "Ideal" do Raio-X fecham o preço do mesmo jeito.
- **P3** ✔ "Simular preço diferente" usa a comissão da faixa do preço simulado e mostra qual é.
- **P4** ✔ `numeroOuNulo` sem o `replace(",", ".")` (que fazia "1,500" virar 1500); `numeroDoCampo` no lugar de `Number(v) || 0`; insumos e Em Massa com `CampoNumero`. Mesmo bug corrigido no preço do `AnuncioShopeeModal`.
- **P5** ✔ Raio-X só aplica faixas quando a loja é de faixas **e** a precificação foi feita com elas (comissão gravada = comissão da faixa).
- **P6** ✔ `margem_pct` gravada é sempre a margem atingida no preço final (`margemAtingida`).
- **P7** ◐ "Adicionar concorrente" ganhou `loading`. O "Salvar no histórico" do Em Massa **já tinha** `loading`: item descartado.
- **P8** ✔ Em Massa usa a alíquota do regime.
- **P9** ✔ "Aplicar preço ao produto" avisa se o custo mudou, mostra o lucro com o custo de hoje e oferece "Recalcular".
- **P10** ✔ Duplicar mantém o produto, a loja (só como canal, se a precificação foi manual) e o modo. O banco não guarda o modo: a margem gravada é testada e, se reproduz o preço, volta como margem; senão, preço fixo (exato). Guardar o modo de verdade pode entrar na 0100.
- **P12** ✔ Composição do preço virou barra empilhada; no prejuízo, o trecho depois do preço aparece hachurado como perda.
- **P17** ✔ Erro de `categorias` conferido; `iaDisponivelParaConta` dentro do `Promise.all`.
- Testes: 1557 → todos passando; `tsc`, `lint` e `build` limpos. Conferido no navegador com a conta de teste.
- Observação do ambiente: a `NEXT_PUBLIC_SUPABASE_URL` deste container termina em `/rest/v1/`; para o teste local o build usou só a origem.

## 15. Fase 2 concluída: bugs do Anúncio

- **A1** ✔ "Continuar" abre `?rascunho=<id>`, lido no servidor; abrir um anúncio grava o id na URL (`router.replace`) e as ações relêem pelo id. Conferido no navegador: recarregar volta na mesma etapa.
- **A2** ◐ `key` por rascunho em Títulos e Descrição. Na prática o painel já desmontava ao trocar de produto; ficou como garantia.
- **A3** ✔ Gravação condicional por `atualizado_em` (`gravarEstadoVersionado`) e trava `capaEmGeracao` antes de reservar a imagem: a segunda geração simultânea para sem gastar. Testado em `lib/estudio/servidor.test.ts`.
- **A5** ✔ Antes de criar na Shopee: estoque maior que zero e as três medidas da embalagem.
- **A6** ✔ `status` passa a andar (rascunho → pronto → publicado); botão "Publiquei manualmente"; criar pela API marca publicado. A lista mostra o status real.
- **A8** ✔ Painéis com o número do trilho (`numeroDaEtapa`); Capa e Descrição só liberam com título.
- **A9** ✔ "Gerar a capa" mostra que está gerando; se o desenho do texto falha, aparece "Desenhar de novo (sem custo)".
- **A10** ✔ "Gerar outra" descrição pergunta antes de descartar edição; apagar memória confirma; "Descartar este anúncio" (conferido no navegador).
- **A11** ✔ Erro de IA fica na tela com "Tentar de novo"; saldo da IA de texto e de imagens aparece no topo antes de gastar.
- **A13** ✔ Ícones decorativos com `aria-hidden`; produto sem cadastro mostra `EmptyState`.
- Testes: 1564 passando; `tsc`, `lint` e `build` limpos.
- Não testado: criação real na Shopee e geração de capa com cota (conta de teste sem IA).

## 16. Fase 3 concluída: proteção de saída + rascunho da Precificação

- **Migração 0100** aplicada pelo dono no SQL Editor (conferida: tabela, coluna, RLS e policy). Inclui `precificacoes.modo_calculo`/`parametro`: "Duplicar" passa a reabrir no modo exato.
- `lib/saida.ts` (+ teste): o que a proteção segura (link do sistema para outra tela) e o que deixa passar (externo, nova aba, download, âncora, Ctrl/Cmd).
- `lib/hooks/useProtegerSaida.ts`: `beforeunload`, clique em link na captura e botão Voltar (entrada sentinela). `components/ui/ModalSaida.tsx`: "Salvar rascunho e sair", "Sair sem salvar", "Continuar aqui" (com foco).
- Precificação Individual: salvamento automático a cada 5 s (só quando muda), botão "Salvar rascunho", indicador "Rascunho salvo há X", aviso "Continuar rascunho" com Continuar/Descartar; o rascunho é apagado ao salvar a precificação. Sem a migração, o automático para em silêncio e o modal não oferece salvar.
- Anúncio Infinito: a proteção cobre a descrição editada e o título digitado; "Salvar rascunho e sair" grava os dois.
- E2E `e2e/rascunho.spec.ts` (roda com o smoke, na conta de teste): passou de ponta a ponta. Voltar e menu conferidos à mão.
- Fica para a Fase 7 (redesenho): rascunho das abas Variações, Kits e Em Massa, que hoje guardam o estado dentro de cada componente.

## 17. Fase 4 concluída: preço por loja + IA só no Anúncio

- **Migração 0101** (`produto_lojas.preco`, `precificacao_id`, `preco_atualizado_em`, com check, FK e a trava de vínculo da 0026). Testada no PGlite (2×) e em `scripts/sql/preco-por-loja.mjs`. **Aplicação: pelo dono, no SQL Editor.**
- **Cópia opcional do histórico** em `scripts/supabase/copiar-precos-historico.sql`: passo 1 só conta; passo 2 (comentado) preenche só loja sem preço, nunca sobrescreve, pode rodar 2×.
- Produtos: salvar o produto não apaga mais as linhas `produto_lojas` (levaria o preço junto); só tira as desmarcadas.
- Precificação: salvar com loja grava o preço **naquela loja**; sem a 0101, volta a perguntar se atualiza o cadastro (comportamento antigo). Bloco **Preços por loja** (`lib/precos-loja.ts` + teste): uma linha por loja, lucro e margem com as taxas da loja, selo sem preço / prejuízo / zona morta, botão "Precificar". `?produto=&loja=` abre a calculadora já no produto e na loja.
- Anúncio: o preço vem da loja do perfil (`precoDoAnuncio`); Revisar mostra "Pronto para publicar?" com preço, lucro, margem e alerta, ou "Precificar agora"; o Pacote e a confirmação de "Criar na Shopee" mostram o preço enviado; criar na Shopee recusa loja sem preço.
- IA só no Anúncio: saiu o gerador de título/descrição da Individual e de Variações; entrou "Criar anúncio deste produto", que abre o rascunho sozinho no perfil daquela loja. "Títulos que você já usou" aparece no painel de Títulos.
- Testes: 1570 unitários e 48 scripts SQL passando; `tsc`, `lint`, `build` limpos. Atalho e abertura automática conferidos no navegador. O bloco Preços por loja só aparece depois da 0101.

## 18. Fase 5: protótipo (aguardando aprovação)

A 0101 foi aplicada pelo dono (conferido). Protótipo com dados da conta de teste; capturas em `docs/prototipo/` (360 e 1280 px, claro e escuro), geradas por `e2e/prototipo.spec.ts`.

- **Individual nova** (`components/precificacao/IndividualNova.tsx`; era `?layout=novo` até a fase 7): 4 blocos (Produto, Onde vende, Como quer lucrar, Mais opções recolhido) e o resultado fixo ao rolar: preço, lucro e margem (o valor que muda pisca em `accent-soft` por 140 ms, desligado em reduced-motion), régua de faixas, composição, Salvar precificação, Salvar rascunho, WhatsApp e Preços por loja. No celular, barra fixa no rodapé com preço, lucro e Salvar. A tela antiga continua sendo a padrão até a aprovação.
- **Ajuste de Preço** (`/precificacao/ajuste/novo?produto=&loja=`): régua interativa (arrastar ou digitar), lucro, margem, comissão, mínimo/ideal/máximo de referência com "Pôr na régua", estratégias por regra (`estrategiasDeAjuste`), simulador de promoção com desconto máximo, "Usar este preço" (grava na loja, com confirmação; não mexe na Shopee) e copiar preço. Atalhos em Preços por loja ("Ajustar") e no Raio-X. A entrada por anúncio sincronizado e a IA ficam para a fase 6.
- **Revisar**: "Pronto para publicar?" (preço, lucro, checklist, "Publiquei manualmente") → Pacote → "Criar na Shopee pelo Painel (opcional)", recolhido. No celular, "Etapa X de 6".
- Testes: 1576 passando.

### 18.1 Revisão do visual (pedido do dono)

- Individual: Produto, Onde vende e Como quer lucrar viraram **um cartão com passos numerados**; lojas em cartões de escolha (2 colunas, com a comissão escrita); forma de calcular em seletor segmentado com rótulos curtos. Resultado: preço, loja, três quadros (lucro, margem, markup), "para onde vai o dinheiro", faixas de comissão recolhíveis, Salvar + Salvar rascunho + WhatsApp e o indicador do rascunho dentro do cartão. Preços por loja em linhas alinhadas (loja | preço e selo), ações embaixo.
- Ajuste: mínimo, ideal e máximo num cartão de três colunas (também no celular), com a margem alvo do ideal logo abaixo.
- Migração **0102** escrita, testada e enviada ao dono para aplicar.

## 19. Fase 6 concluída: Ajuste de Preço + Análise do anúncio

- **0102** aplicada pelo dono (conferido).
- **Histórico de preço**: a sincronização da Shopee grava em `marketplace_precos_historico` só quando o preço muda (`lib/marketplace/precos-historico.ts` + teste); sem a tabela, não faz nada.
- **Ajuste de Preço completo** (`/precificacao/ajuste/[id]`, `[id]` = anúncio sincronizado, ou `novo?produto=&loja=`), dados de `lib/ajuste-servidor.ts`: vendas de 30/90 dias e por semana somadas no banco (RPCs da 0102), tendência (`lib/demanda`), "lucro no mês", estoque em dias, regras novas de **giro** (estoque alto e venda caindo) e **kit**, e "Pedir a explicação da IA" (`explicarAjusteIA`: o navegador manda ids e o preço da régua; os números saem do servidor; reaproveita o tipo `preco`). Anúncio sem produto ligado manda para o mapeamento.
- **Análise do anúncio** (`/anuncio/analise/[id]`), abas Visão geral · Título · Imagens · Preço · Estratégia:
  - sem IA (`lib/analise-anuncio.ts` + teste): nota do título, termos, palavras-chave presentes/ausentes, imagens, veredito de vendas pelos limiares do Consultor, ruptura, nota geral e pontos fortes/fracos;
  - com IA (`lib/ia/prompts-analise-anuncio.ts` + teste, tipo `analise_anuncio`, ordem cache → cota → chamada): diagnóstico, 3 títulos (o que passa do limite ou tem termo barrado é descartado) e estratégia priorizada;
  - capa: botão próprio com confirmação; baixada só dos domínios de imagem da Shopee/ML. **Desvio do plano:** usa 1 geração da cota de texto do dia (como a leitura de foto de produto), não a cota de imagens do mês, que é para gerar imagem;
  - lista completa de imagens via `get_item_base_info` (`buscarImagensItem`), sob demanda — **não testado contra a loja real**;
  - ações com clique: "Usar no Anúncio Infinito" (grava o título no rascunho do produto, com conferência de termos), "Abrir Ajuste de Preço", "Guardar na memória da loja".
- Entradas: "Meus anúncios na loja" na página Anúncio, "Analisar anúncio" no cabeçalho da Precificação, link dentro do rascunho (quando o produto tem anúncio na loja) e "Ajuste de Preço" no Raio-X e em Preços por loja.
- **Desvio do plano:** os itens de pedido não guardam o item_id da Shopee; as vendas são por produto + loja.
- Testes: 1588 unitários e 49 scripts SQL; `tsc`, `lint`, `build` limpos. Conferido no navegador com um anúncio fictício na conta de teste (apagado depois). Não testado: IA (a conta de teste não tem), leitura de imagens e preço real da Shopee.

## 20. Fase 7 concluída: redesenho completo da Precificação

- **Individual nova é a padrão** (saiu `?layout=novo` e a tela antiga: `PainelEntradas`, `PainelTaxas`, `PainelModo`, `PainelResultado`). Tudo o que só a antiga tinha foi para a nova: foto, nome e descrição do anúncio, faixa de venda, preço psicológico, comparação com o preço do cadastro, detalhamento, "Simular preço diferente", Copiar/WhatsApp/Imagem, posição frente aos concorrentes, zona morta com "Pedir estratégia à Vixe" e as taxas da loja escolhida.
- **Blocos compartilhados** (`components/precificacao/blocos.tsx`): `Passo`, `OndeVende` (cartões de loja, setas do teclado), `ComoLucrar` (seletor segmentado + campo, termo com `InfoTooltip`) e `Metrica`. Usados na Individual, em **Variações** (passos Anúncio e produto · Onde vende · Como quer lucrar; escolher o produto agora traz o custo), em **Kits** (Onde vende com "Venda direta"; Margem · Desconto · Preço fixo) e em **Em Massa** ("vale para todas as linhas": loja e margem aplicadas a todas e às linhas novas).
- **P11**: abas montadas uma vez continuam montadas (escondidas), e a aba vai para a URL (`?visao=`, via `history.replaceState`, sem ida ao servidor).
- **P13**: um seletor de loja só por aba. **P14**: "Salvar precificação"; margem e markup com o mesmo texto de ajuda em todas as abas; Variações salva com "Salvar variações".
- **P15**: busca de Kits virou `Combobox` (setas, Enter, "+ Adicionar … sem cadastro"); `Combobox` ganhou `ariaLabel`, `limparAoEscolher` e `criar`; ▾/▲/× viraram `IconButton` com `aria-label`; tirado `outline-none` sem foco; rótulos ligados aos campos.
- **P16**: `text-[10px]/[11px]` → `text-xs`, cores fixas → `classeValor`, grades começando em `grid-cols-1`, vazios com `EmptyState`.
- **Rascunho em Variações, Kits e Em Massa** (`useRascunhoDaAba`; mesma tabela 0100, sem migração): salvamento automático, "Salvar rascunho", "Continuar rascunho" por aba, e a proteção de saída cobre as quatro abas juntas. Kits apaga o rascunho ao salvar (pelo servidor); Variações e Em Massa, logo depois de salvar. Leitura defensiva do rascunho em `lib/rascunho-leitura.ts` (+ teste).
- **Corrigido**: o salvamento automático e o botão no mesmo instante criavam dois rascunhos (trava síncrona no hook).
- **E2E** `e2e/precificacao.spec.ts` (smoke, conta de teste): precificar e salvar para uma loja em **4 cliques** (meta 5); trocar de aba mantém o digitado e atualiza a URL; rascunho de Kits guarda, oferece e é descartado. `rascunho.spec.ts` e `prototipo.spec.ts` atualizados e passando.
- Testes: 1591 unitários; `tsc`, `lint`, `build` limpos. Sem migração.


### 20.1 Revisão do visual de Kits e Variações (pedido do dono)

- **Kits**: o mesmo desenho da Individual. À esquerda, um cartão em três passos (O que vai no kit · Onde vende · Como quer lucrar) e "Mais opções" recolhido (imposto e faixa de venda). Item do cadastro numa linha só (nome, custo/avulso, quantidade, custo no kit); item sem cadastro em cartão tracejado. À direita, o resultado fixo ao rolar: preço, lucro, margem, quanto o cliente economiza, barras "kit × separado", para onde vai o dinheiro, salvar, rascunho e compartilhar. No celular, barra no rodapé com preço e Salvar.
- **Variações**: passo 4 "Variações" com um cartão por variação (o que se digita à esquerda, preço/lucro/margem à direita; valor próprio destacado) e o detalhamento ao abrir. À direita, a **escada de preços** fixa: cada variação, o preço por unidade e quanto sai mais barato que a unidade, mais Salvar variações e o rascunho.
- `Combobox`: clicar no campo já focado reabre a lista (antes, depois de escolher um item, era preciso sair e voltar ao campo).
- **Migração 0103** (`perfis_marca.presets`, `presets_gravidade`, `termos_bloqueados`) escrita e testada (`scripts/sql/termos-perfil.mjs`, PGlite 2×), enviada ao dono para aplicar. O código que usa as colunas vem na fase 8.

## 21. Fase 8 concluída: Anúncio redesenhado + termos que bloqueiam

- **0103 aplicada pelo dono** (conferido: o perfil salva e relê presets, gravidade e termos que bloqueiam).
- **A7** (`lib/conformidade/termos.ts` + teste): `TermosDoPerfil` (presets ligados, gravidade dos presets, termos que pedem revisão e termos que bloqueiam), `termosDoPerfil` (leitura defensiva da linha; antes da 0103 as colunas não vêm), `regrasDoPerfil` (o termo que bloqueia vence o mesmo termo em "revisar") e `termosParaEvitar` (o que vai no prompt da IA). Os servidores leem `perfis_marca` com `*`. Bloqueiam: escolher título, salvar descrição, textos da capa, título vindo da Análise e **criar na Shopee** (título e descrição conferidos de novo no servidor). A mensagem diz o trecho e o motivo, em vez de sempre "as plataformas costumam barrar".
- **Perfil**: seção "Termos que você não quer ver" com duas listas (Bloqueiam · Pedem revisão) e os conjuntos prontos como caixas de ligar, com "Pedem revisão / Bloqueiam". Sem a 0103, salvar com esses campos explica que falta a migração; sem eles, salva o resto.
- **A12**: "Seus anúncios" lista todos os rascunhos (até 500), com busca, filtro por status com contagem, barra de progresso das etapas e "Mostrar mais". "Meus anúncios na loja" ganhou busca e "Mostrar mais" (antes, 20 fixos).
- **Redesenho (seção 9)**: a página Anúncio virou lista principal + atalhos (Meu padrão, O que replicar) ao lado. No Infinito, progresso, IA de texto e imagens do mês ficam em três quadros fixos no topo; os concorrentes viraram uma gaveta dentro do cartão do Título (abre sozinha ao pesquisar). "Etapa X de 6" no celular e a ordem do Revisar já vinham da fase 5.
- **Corrigido**: no `Combobox` dentro de um `<label>`, escolher uma opção reabria a lista (o clique é repassado ao campo), cobrindo o botão de baixo.
- **E2E** `e2e/anuncio.spec.ts` (smoke, conta de teste): perfil com termo que bloqueia → rascunho → título com o termo é recusado, sem ele passa → a lista mostra o rascunho e o filtro funciona → descarta e remove o perfil. Precificação e rascunho continuam passando.

## 22. Fase 9: ciclo de resultado (código pronto; falta aplicar a 0104)

- **Migração 0104** (`0104_titulos_anuncio.sql`): tabela `marketplace_titulos_historico` (`anuncio_id`, `titulo`, `origem` sincronizacao|painel, `lido_em`; RLS com `conta_ativa()`, `with check` e a trava de vínculo da 0026) e RPC `vendas_por_anuncio_periodo(p_loja, p_produto, p_de, p_ate)`, `security invoker`, fora de `anon`. Testada no PGlite (2×) e em `scripts/sql/titulos-anuncio.mjs`. **Aplicação: pelo dono.**
- **Vínculo na criação**: ao criar o item na Shopee pelo Painel, ele entra em `marketplace_anuncios` já ligado ao produto (com título e preço), e o título vira a 1ª versão do histórico (`vincularItemCriado`, nunca lança: o item já existe na Shopee).
- **Histórico pela sincronização**: depois de cada leitura dos anúncios, grava o título que mudou em relação à última versão guardada (a 1ª sincronização depois da 0104 registra o título de hoje como ponto de partida).
- **Análise › Título**: "Versões do título × vendas", da mais nova para a mais antiga: período, dias, unidades e receita, **unidades por dia** e a variação contra a versão anterior; "pouco tempo" abaixo de 7 dias. Puro e testado em `lib/marketplace/titulos-historico.ts`.
- Sem a 0104 tudo continua funcionando: a sincronização e a criação seguem, e a Análise diz que o histórico ainda não está ligado (conferido no navegador com um anúncio fictício da conta de teste, apagado depois).
- **Ressalva** (a mesma da 0102): os itens de pedido não guardam o item_id, então as vendas são do produto naquela loja.

## 23. Backlog da auditoria (seção 12) e Ranking de anúncios

- **PDV duplicado** ✔: a venda online vai por `registrar_venda_offline` com uma chave gerada antes de enviar; se a resposta se perde, a fila sem internet reenvia com a mesma chave e o banco devolve a venda que já existe. Com crédito de troca segue pela RPC de sempre (não entra na fila). Smoke do caixa passando.
- **NF-e duplicada** ✔ (+ **0105**): antes de emitir confere nota autorizada (recusa) ou em processamento (consulta a mesma ref); recusa do emissor (422, "nao_encontrado") vira `rejeitada` em vez de ficar `processando`. 0105: índice único de NF-e ativa por venda (se já houver duplicada, só avisa e não cria).
- **Etiqueta cobrada 2×** ✔: reserva atômica da venda antes de comprar, id do envio gravado antes de pagar, retomada no mesmo envio (`concluirEtiqueta` lê o pedido e pula o que já foi feito). Estados em `lib/frete/etiqueta-estado.ts` (+ teste). **Não testado contra o Melhor Envio real.**
- **Token** ✔: `tokenValido` (Shopee e ML) confere a gravação, relê a conexão quando outra renovação gastou o refresh e renova 2 min antes (`tokens.test.ts`). **Timeout**: 30 s por chamada à Shopee (60 s para arquivo), 20 s no token do ML.
- **PIN contornável** ✔ (+ **0106**): o hash já estava protegido desde a 0081; agora escrita direta na tabela pela API (`request.path` fora de `/rpc/`) não muda dinheiro/identidade da venda, não apaga venda e não mexe em itens. Etapa, envio, frete, rastreio, observação interna, tags e operador seguem editáveis; service role, SQL Editor e cascatas passam. Depende do PostgREST preencher `request.path` (o Supabase preenche): conferir depois de aplicar.
- **Somas cortadas em 1000** ✔: `buscarEmLotes` no Dashboard, Valor do estoque, Vixe Insights, Financeiro, comissões, cliente, Radar e resumo diário da Vixe. Ficam para depois (secundários): calendário, sugestões de compra, alertas e exportações CSV.
- **`error.message` cru** ✔: `comResultado` passa toda mensagem por `mensagemParaUsuario` (texto técnico vira genérico, original no log); envio, operador e equipe usam `lancarErroSupabase`.
- **Ranking de anúncios**: busca, período personalizado, situações com contagem (vendendo, parados, em alta, em queda, prejuízo, margem baixa, cancelamentos, custo incompleto), classe, variação contra o período anterior, ordenação pelo cabeçalho, filtros na URL, Analisar/Ajuste de Preço por linha (`ranking-anuncios.ts` + teste).

### 23.1 Migrações 0104, 0105 e 0106 aplicadas pelo dono (conferido)

- Na conta de teste, com a sessão dela: a tabela e a função da 0104 respondem. Uma venda criada pela RPC não teve o total alterado nem foi apagada pela API direta (erro P0001 com a mensagem da 0106); a observação interna seguiu editável e o cancelamento pela RPC funcionou. O smoke do caixa passou com a 0106 no ar.
- O índice da 0105 não foi exercitado (a conta de teste não emite NF-e).
- `e2e/anuncio.spec.ts`: na primeira abertura depois de o servidor ficar parado, o formulário ainda não estava interativo quando o teste digitava; agora ele digita de novo até o botão responder.

## 24. Segurança (auditoria de 19/10/2026)

- **Next.js 16.4.2 e React/React DOM 19.2.9** (eram 16.4.0 e 19.2.8, afetados pelos avisos de 14/10/2026 de RCE em React Server Components e DoS em Server Actions). `eslint-config-next` 16.4.2. Tipos, lint, 1621 testes e build limpos. `npm audit` de produção: sobra só `uuid` dentro do `exceljs` (o aviso é das funções v3/v5/v6 com buffer; o exceljs usa a v4). No desenvolvimento: `braces` via `eslint-config-next` (só o lint). As duas "correções" do audit são rebaixamentos que quebram.
- **Teto real de bytes no corpo** (`lib/corpo-limitado.ts` + teste): lê o fluxo contando bytes e cancela ao passar do limite; `content-length` só como recusa rápida. Em `csp-report`, `vitrine/pedido`, `vitrine/frete`, `mercadolivre/notificacoes` e no webhook do Asaas. Conferido com curl no build: corpo de 300 KB enviado em pedaços (sem content-length) dá 413; requisições normais seguem iguais.
- Fica para a infraestrutura: limite de corpo e rate limiting na borda (Vercel/WAF).
