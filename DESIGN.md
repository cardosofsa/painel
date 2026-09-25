# DESIGN.md — sistema visual do Painel

Este documento descreve **o que o código realmente faz**. Ele foi reescrito a partir de
`app/globals.css` e dos componentes de `components/ui/`; a versão anterior descrevia um
sistema diferente (cockpit escuro, cobre, Space Mono) que nunca chegou a ser implementado.
Se você mudar um token, atualize aqui junto.

A fonte da verdade dos tokens é `app/globals.css`. Nada de cor solta em `className`: use
sempre as classes utilitárias derivadas dos tokens (`bg-surface-1`, `text-text-secondary`,
`border-border`, `text-accent`…).

## Princípio

Painel de trabalho, não vitrine: denso, legível, sem decoração que não carregue informação.
A cor tem significado — accent marca o que é ação ou destaque, verde e vermelho marcam
resultado financeiro. Fora isso, cinza.

## Tema

O tema **claro é o padrão** (`:root`). O escuro é opt-in via `html[data-theme="dark"]`,
alternado pelo `ThemeContext` e persistido em `localStorage` sob a chave `painel:tema`. Um
script inline no `<head>` (`app/layout.tsx`) aplica o atributo antes da primeira pintura,
para não haver flash de tema branco em quem escolheu o escuro.

## Paleta

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--background` | `#fafafa` | `#0a0a0c` | fundo da página |
| `--surface-1` | `#ffffff` | `#18181b` | cards, modais, barras |
| `--surface-2` | `#f4f4f5` | `#232326` | hover de linha, skeleton |
| `--surface-3` | `#e4e4e7` | `#313134` | divisórias fortes |
| `--border` | `#e4e4e7` | `#2c2c30` | contorno padrão |
| `--text-primary` | `#18181b` | `#f4f4f5` | texto principal, números |
| `--text-secondary` | `#71717a` | `#a1a1aa` | rótulos, apoio |
| `--text-tertiary` | `#a1a1aa` | `#71717a` | legendas, estado vazio |
| `--accent` | `#3b4d1f` | `#8fae55` | oliva: ação primária, valor em destaque |
| `--accent-soft` | `#e8ede0` | `#232b18` | fundo de chip/aba ativa |
| `--positive` | `#16a34a` | — | lucro, entrada, status OK |
| `--negative` | `#dc2626` | — | prejuízo, saída, vencido |

**Cor nunca é o único sinal.** Todo `StatusChip` carrega texto; alertas de vencimento
carregam a palavra "Vencido" ao lado do ícone. Um usuário que não distingue as duas cores
precisa continuar entendendo a tela.

Para número que pode ser negativo, use `classeValor(n)` de `lib/format.ts` em vez de
escrever `text-positive` fixo — foi exatamente esse hardcode que fazia prejuízo aparecer
como lucro verde em cinco telas.

## Tipografia

- **Interface**: Geist (`--font-sans`), via `next/font/google`.
- **Números, SKU, datas, códigos**: Geist Mono (`--font-mono`), classe `font-mono`.

A monoespaçada não é enfeite: é ela que mantém as colunas de `R$` e SKU alinhadas nas
tabelas. `.font-mono` e `.tabular` também recebem `font-variant-numeric: tabular-nums`.

Escala usual: `text-xs` (legenda), `text-sm` (corpo e tabela), `text-base` (título de
card), `text-lg`/`text-2xl` (métrica). `HeroMetric` cuida do número grande dos cards.

## Forma e elevação

`--radius: 0.5rem` (8px) é o raio base; `rounded-md` em controles, `rounded-lg` em cards e
modais. Botões e cards usam `shadow-sm`, modais `shadow-lg`, popovers (`RowMenu`,
`InfoTooltip`) `shadow-lg`. O contorno (`border-border`) é o que separa superfícies; a
sombra é discreta e só reforça sobreposição.

## Layout

- Sidebar de 232px, recolhível para 64px (`md:w-16`); no celular vira drawer sobre backdrop.
- TopBar de 56px (`h-14`), com `backdrop-blur-sm`.
- Conteúdo em `max-w-[1700px]`, padding `p-4 sm:p-6`.

Grade responsiva: comece por `grid-cols-1` e só então adicione `sm:`/`lg:`. Um
`grid-cols-2` sem prefixo espreme dois campos em ~140px num celular de 360px.

## Componentes

Antes de criar qualquer coisa nova, veja se já existe em `components/ui/`:

| Componente | Para quê |
| --- | --- |
| `Card`, `CardEyebrow`, `HeroMetric` | superfície e métrica de destaque |
| `Button` | `primary` / `secondary` / `destructive`; `loading` já desabilita |
| `Modal`, `FormField`, `inputClass` | diálogo e formulário |
| `ConfirmModal` / `useConfirm()` | confirmação antes de ação destrutiva |
| `Table`, `Thead`, `Th`, `Tr`, `Td` | tabela (já vem com `overflow-x-auto`) |
| `Badge` / `StatusChip` | status com texto |
| `RowMenu` | ações por linha (usa portal, não é recortado por scroll) |
| `EmptyState` | lista vazia, de preferência com ação de saída |
| `Skeleton`, `CardSkeleton`, `TableSkeleton` | `loading.tsx` de rota |
| `ProductThumb` | miniatura de produto com fallback |
| `InfoTooltip` | explicar como um número foi calculado |

## Regras que valem sempre

1. **Toda ação destrutiva passa por `useConfirm()`** e diz o que será perdido.
2. **Todo botão de envio recebe `loading={pending}`** — sem isso o clique duplo grava duas
   vezes, o que já aconteceu com movimentação de estoque.
3. **Formulário só é limpo depois do sucesso**, nunca antes do `await`.
4. **Moeda sempre por `formatBRL`**; data sempre por `formatarDataIso` / `formatarDataHora`
   / `formatarDataCurta` de `lib/format.ts`. Não formate data à mão: coluna `date` do
   Postgres lida com `new Date(iso)` cru perde um dia no fuso do Brasil.
5. **Todo `loading.tsx` de rota** usa os skeletons, para a navegação não parecer travada.
6. Formulário dentro de modal que precisa refletir o item selecionado leva `key` **no
   componente que tem o `useState`**, não no `<Modal>` interno.
