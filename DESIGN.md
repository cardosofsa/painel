# DESIGN.md — sistema visual do Painel

A fonte da verdade dos tokens é `app/globals.css`. Este documento diz **o que cada token
significa e quando usar**; se você mudar um valor lá, atualize aqui junto.

Duas regras têm teste automatizado e falham o `npm test` se forem quebradas:
`lib/cores.test.ts` lê o `globals.css` de verdade e confere contraste, rampa de cinza,
elevação e movimento.

## Princípio

Painel de trabalho, não vitrine: denso, legível, sem decoração que não carregue informação.
A cor tem significado — accent marca ação e destaque, verde e vermelho marcam resultado
financeiro. Fora isso, cinza.

**Nada de cor solta em `className`.** Use as utilitárias derivadas dos tokens
(`bg-surface-1`, `text-text-secondary`, `border-border`, `text-accent`). O projeto cumpre
isso: não existe um `text-gray-500` sequer.

## Tema

O claro é o padrão (`:root`). O escuro é opt-in via `html[data-theme="dark"]`, alternado
pelo `ThemeContext` e guardado em `localStorage` sob `painel:tema`. Um script inline no
`<head>` (`app/layout.tsx`, com nonce da CSP) aplica o atributo antes da primeira pintura.

O tema escuro **não é o claro invertido**: sombra, borda e cores de gráfico têm valores
próprios, pelos motivos abaixo.

## Paleta

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--background` | `#fafafa` | `#0a0a0c` | fundo da página |
| `--surface-1` | `#ffffff` | `#18181b` | cards, modais, barras |
| `--surface-2` | `#f4f4f5` | `#232326` | hover de linha, skeleton, cabeçalho de tabela |
| `--surface-3` | `#e4e4e7` | `#2e2e33` | divisória forte |
| `--border` | `#d9d9de` | `#35353c` | contorno padrão |
| `--border-forte` | `#c2c2c9` | `#47474f` | contorno em hover, cursor de gráfico |
| `--text-primary` | `#18181b` | `#f4f4f5` | texto principal, números |
| `--text-secondary` | `#52525b` | `#b4b4bd` | rótulo, apoio, legenda de gráfico |
| `--text-tertiary` | `#6b6b74` | `#8a8a94` | cabeçalho de tabela, eyebrow, estado vazio |
| `--accent` | `#3b4d1f` | `#8fae55` | oliva: ação primária, série única de gráfico |
| `--accent-soft` | `#e8ede0` | `#232b18` | fundo de chip e aba ativa |
| `--positive` | `#15803d` | `#4ade80` | lucro, entrada, status OK |
| `--negative` | `#dc2626` | `#f87171` | prejuízo, saída, vencido |

**Contraste é requisito, não gosto.** `--text-tertiary` já esteve em `#a1a1aa`, que dá
2,56:1 sobre branco — reprovado no WCAG AA até para texto grande — enquanto pintava
cabeçalho de tabela, eyebrow e todos os estados vazios, em cerca de 230 lugares. Hoje toda
combinação de texto e superfície passa 4,5:1, e o teste trava isso.

`--border` **não pode voltar a ser igual a `--surface-3`**: eram o mesmo `#e4e4e7`, e por
isso o contorno do card praticamente não existia sobre o fundo da página.

**Cor nunca é o único sinal.** Todo `StatusChip` carrega texto; o `Chip` de filtro usa
`aria-pressed`; gráfico com duas séries carrega legenda. Quem não distingue verde de
vermelho precisa continuar entendendo a tela.

Para número que pode ser negativo, use `classeValor(n)` de `lib/format.ts` em vez de
escrever `text-positive` fixo — foi esse hardcode que fazia prejuízo aparecer verde em
cinco telas.

### Gráficos

| Token | Uso |
| --- | --- |
| `--accent` | série única (linha, área, barra). É a cor da marca. |
| `--positive` / `--negative` | entrada e saída de caixa. Semântico, não categórico. |
| `--grafico-1..4` | escala **categórica**, em ordem fixa |

A escala categórica serve à composição de preço e **nunca é ciclada**: uma quinta fatia
receberia cor repetida, e duas fatias iguais num donut é leitura errada garantida.

Os quatro passos foram validados por cálculo em cada tema — faixa de luminosidade, piso de
croma, separação sob protanopia e deuteranopia, piso de visão normal e contraste contra a
superfície. **Os do tema escuro são outros valores das mesmas famílias de matiz**, porque
clarear os do claro reprova na faixa de luminosidade. O oliva escuro da marca reprovou como
preenchimento (croma 0,07, lê como cinza), daí o passo mais claro no `--grafico-4`.

Tudo em `components/charts/tema.ts` é `var(--token)`: o Recharts renderiza SVG inline, a
variável resolve contra o tema em vigor e o gráfico acompanha a troca sozinho.

**A tela importa o gráfico de `components/charts/dinamicos.tsx`**, nunca do arquivo dele: lá
cada um é `next/dynamic` (o Recharts sai do JavaScript inicial) com um esqueleto da altura
de `ALTURA_GRAFICO` (`tema.ts`). Gráfico novo entra nos dois lugares;
`lib/importacoes-pesadas.test.ts` reprova import direto.

## Tipografia

- **Interface**: Geist (`--font-sans`), via `next/font/google`.
- **Números, SKU, datas, códigos**: Geist Mono (`--font-mono`), classe `font-mono`.

A monoespaçada não é enfeite: é ela que mantém as colunas de `R$` e SKU alinhadas.
`.font-mono` e `.tabular` também recebem `font-variant-numeric: tabular-nums`.

| Papel | Classe | Componente |
| --- | --- | --- |
| Título de página | `text-2xl font-semibold tracking-tight` | `PageHeader` |
| Métrica | `text-2xl sm:text-3xl font-mono font-semibold` | `HeroMetric` |
| Título de card | `text-base font-semibold tracking-tight` | **`CardTitle`** |
| Corpo, tabela | `text-sm` | — |
| Rótulo, legenda | `text-xs` | `CardEyebrow`, `Th` |

**Use `CardTitle`.** Sem ele o mesmo nível hierárquico aparecia de três jeitos:
`text-base font-semibold` (18×), `font-semibold` sem tamanho (5×) e `text-sm font-medium`
(7×). E não invente tamanho fora da escala: `text-[10px]` e `text-[11px]` só criam um
degrau que ninguém mais usa.

## Forma, elevação e movimento

`--radius: 0.5rem`; `rounded-md` em controles, `rounded-lg` em cards e modais.

| Nível | Token | Onde |
| --- | --- | --- |
| 1 | `shadow-elev-1` | card, botão |
| 2 | `shadow-elev-2` | popover, menu, tooltip de gráfico |
| 3 | `shadow-elev-3` | modal |

**Não use `shadow-sm`/`shadow-lg` do Tailwind.** São pretas translúcidas e, no tema escuro,
não produzem elevação nenhuma sobre fundo preto — o card fica achatado. Os tokens do escuro
usam um halo claro na borda superior no lugar da sombra.

Movimento: `--duracao-rapida` (140ms) para cor e hover, `--duracao-media` (220ms) para
entrada de painel, sempre com `--curva`. `prefers-reduced-motion` desliga **tudo**, não só
uma animação.

## Foco visível

Há uma regra global em `globals.css` que desenha um anel `outline` em toda âncora, botão,
aba, item de menu e campo. Não a remova, e não escreva `outline-none` sem colocar outra
coisa no lugar.

Isto não é detalhe: o projeto passou muito tempo com **zero** `focus-visible`. O `Tabs`
implementa navegação por setas com roving tabindex e ARIA completo, e quem usava as setas
não via nada acontecer.

## Layout e responsividade

- Sidebar de 232px, recolhível para 64px; no celular vira drawer sobre backdrop.
- TopBar de 56px (`h-14`), com `backdrop-blur-sm`.
- Conteúdo em `max-w-[1700px]`, padding `p-4 sm:p-6`.

**Comece por `grid-cols-1` e só então adicione `sm:`/`lg:`.** Um `grid-cols-2` sem prefixo
espreme dois campos em ~150px num modal de celular — isto estava errado em 28 lugares.
Exceção legítima: grade de cartões pequenos (produtos no PDV, botões de forma de pagamento),
onde 2 colunas no celular é melhor uso do espaço.

**Alvo de toque mínimo de 36px no celular** (`max-sm:h-9`). `Button`, `IconButton` e `Chip`
já fazem isso.

Tabela: `Thead` é fixo ao rolar, `Table` desenha sombra quando há conteúdo para o lado, e
`Th`/`Td` aceitam `secundaria` para a coluna sumir no celular. Numa tabela de 9 colunas o
usuário vê 2,5 em 360px — sem esses três, ele não tem como saber disso.

## Componentes

Antes de criar qualquer coisa, veja se já existe em `components/ui/`:

| Componente | Para quê |
| --- | --- |
| `Card` | superfície. `padding="nenhum"` para conter tabela; `elevacao` 0/1/2 |
| `CardHeader`, `CardTitle`, `CardSubtitle`, `CardEyebrow` | cabeçalho padronizado |
| `HeroMetric` | métrica de destaque; passe `valorNumerico` se puder ser negativa |
| `Button` | `primary`/`secondary`/`destructive`/`ghost`, `size` `sm`/`md`, `loading` |
| `IconButton` | botão só com ícone. `aria-label` é obrigatório no tipo |
| `Chip`, `ChipRow` | filtro. Usa `aria-pressed`, não só a cor |
| `Tabs`, `TabPanel` | navegação por aba, com teclado e ARIA |
| `Modal`, `FormField`, `inputClass`, `campoBase` | diálogo e formulário |
| `ConfirmModal` / `useConfirm()` | confirmação antes de ação destrutiva |
| `Table`, `Thead`, `Th`, `Tr`, `Td` | tabela, com cabeçalho fixo |
| `Badge` / `StatusChip` | status com texto |
| `RowMenu` | ações por linha (portal, não é recortado por scroll) |
| `EmptyState` | lista vazia, de preferência com ação de saída |
| `Skeleton`, `CardSkeleton`, `TableSkeleton` | `loading.tsx` de rota |
| `ProductThumb`, `ImagemStorage` | imagem vinda do Supabase Storage |
| `InfoTooltip` | explicar como um número foi calculado |

`inputClass` traz `w-full`; use `campoBase` quando o campo tiver outra largura. Não copie a
string à mão — já esteve duplicada em 17 lugares, todos sem o `transition-colors`.

## Regras que valem sempre

1. **Toda ação destrutiva passa por `useConfirm()`** e diz o que será perdido.
2. **Todo botão de envio recebe `loading={pending}`** — sem isso o clique duplo grava duas
   vezes, o que já aconteceu com movimentação de estoque.
3. **Formulário só é limpo depois do sucesso**, nunca antes do `await`.
4. **Ação de servidor passa por `executarComToast`** (`lib/acao-cliente.ts`). Chamar a
   action solta engole o erro em silêncio, e o TypeScript não reclama.
5. **Moeda por `formatBRL`**; data por `formatarDataIso`/`formatarDataHora`/`dataLocal` de
   `lib/format.ts`. Não formate data à mão: coluna `date` do Postgres com `new Date(iso)`
   cru perde um dia no fuso do Brasil.
6. **Todo `loading.tsx` de rota** usa os skeletons e espelha o layout real.
7. **Estado vazio usa `EmptyState`**, não um `<p>` solto. Lista vazia é o que um usuário
   novo vê primeiro, e `<p>` avulso colapsa o card para 60px ao lado de um de 300px.
8. Formulário dentro de modal que precisa refletir o item selecionado leva `key` **no
   componente que tem o `useState`**, não no `<Modal>` interno.
