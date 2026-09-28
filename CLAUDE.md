# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O projeto

Painel ("Segundo Cérebro") é um sistema de gestão pessoal para operação de e-commerce
(Shopee e outros marketplaces): precificação com regra de negócio real, catálogo de
produtos, estoque, compras, fornecedores e financeiro. Uso pessoal, um usuário por conta,
com isolamento de dados garantido pelo banco (RLS), não pela aplicação. Toda a comunicação
com o usuário deve ser em pt-BR.

Stack: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript `strict`, Supabase
(Postgres + Auth + Storage, só a chave anônima — **não existe nem deve existir service role
key no projeto**), Tailwind CSS 4, Recharts, sonner (toasts), lucide-react, Zod, Vitest.

## Comandos

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção (roda checagem de tipos)
npm run lint         # ESLint
npm test             # testes unitários (vitest run)
npm run test:watch   # vitest em modo watch
npx tsc --noEmit     # checagem de tipos isolada
```

Rodar um teste único: `npx vitest run lib/pricing.test.ts` (ou passe parte do nome do
arquivo). Antes de dar qualquer tarefa por concluída, rode `npx tsc --noEmit`, `npm run
lint` e `npm test` — os três precisam ficar limpos.

Existe uma conta de teste dedicada a automação (`painel@teste.com` — credenciais na memória
do projeto), separada da conta real; dados criados por ela são descartáveis.

## Banco de dados: convenções obrigatórias

As migrações ficam em `supabase/migrations/`, numeradas em ordem de aplicação
(`0001_init.sql`, `0002_...`, ...). **Elas são aplicadas manualmente pelo usuário** no SQL
Editor do Supabase — este ambiente não tem service role key nem credenciais para aplicar
migrações ou fazer `git push` sozinho. Depois de escrever uma migração nova, ela precisa ser
colada e rodada pelo usuário; não assuma que já está em produção só porque o arquivo existe.

Ao criar uma migração:

- Numere na sequência e descreva no nome o que ela faz.
- **Nunca edite uma migração já aplicada/compartilhada.** Qualquer correção é sempre um
  arquivo novo, numerado depois (ex.: `0017_fix_...sql` corrigindo algo de `0016_...sql`).
- Toda tabela nova precisa de `user_id uuid not null references auth.users on delete cascade
  default auth.uid()`, `enable row level security` e uma policy
  `using (auth.uid() = user_id)`. Tabela filha (sem `user_id` próprio) usa `exists (select 1
  from <tabela_pai> ... where ... user_id = auth.uid())`.
- **Escreva a migração inteira como idempotente.** O SQL Editor do Supabase **não** envolve
  o script numa transação: se ele falha no meio, tudo que veio antes fica commitado e o
  banco fica num estado parcial que você precisa conseguir reexecutar por cima. Use
  `if not exists` / `if exists`, `create or replace`, e proteja DDL condicional com
  `do $$ ... if exists (select 1 from information_schema.columns ...) then ... end if; $$`.
  Cuidado: `drop column IF EXISTS` não salva um `update` que referencia essa coluna — o
  nome é resolvido ao executar o statement, e o erro vem antes (já quebrou a 0021).
- **Termine sempre com `NOTIFY pgrst, 'reload schema';`** — sem isso o PostgREST continua
  servindo o schema antigo e a aplicação quebra com "column not found" mesmo depois da
  migração rodar.
- **`CREATE OR REPLACE FUNCTION` não muda a lista de colunas de retorno de uma função
  `RETURNS TABLE`** — o Postgres ignora/falha silenciosamente e a versão antiga continua
  rodando. Se uma migração precisa mudar o retorno de uma função existente, use `DROP
  FUNCTION IF EXISTS ...` explicitamente antes de recriar (já causou um bug de produção
  real: ver `0017_fix_obter_catalogo_publico_signature.sql`).
- Funções públicas/anônimas (ex.: RPC usada pela vitrine pública do catálogo) usam o padrão
  `language plpgsql security definer set search_path = public` para expor só o necessário
  sem dar SELECT direto nas tabelas via RLS — nunca conceda acesso amplo às tabelas cruas
  para `anon`.
- **Tabela nova precisa de `conta_ativa()` na policy**, no mesmo formato das outras:
  `using (auth.uid() = user_id and conta_ativa())`, com o mesmo predicado no `with check`.
  Sem isso a tabela fica acessível a conta pendente ou suspensa (ver `0021`).
- **`with check` não é opcional.** Sem ele, um usuário pode fazer UPDATE reatribuindo o
  `user_id` da linha para outra conta, ou INSERT com `user_id` alheio, direto pelo
  PostgREST. Várias server actions fazem `insert(dados)` com objeto do cliente e é o
  `with check` que segura.

## Controle de acesso: onde cada trava mora

A regra é: **se a checagem só existe no servidor do app, ela não existe.** A aplicação usa
a chave anônima, então qualquer RPC ou tabela é alcançável pelo console do navegador com a
sessão do usuário. Toda trava que importa tem que estar no banco.

| Trava | Onde vive |
| --- | --- |
| Isolamento entre contas | RLS `auth.uid() = user_id` em todas as tabelas |
| Conta pendente/suspensa/vencida | `conta_ativa()` dentro de cada policy (`0021`) |
| Conta master | `e_master()` dentro de cada RPC `admin_*` (`0020`) |
| PIN de edição de venda | hash bcrypt conferido dentro de `editar_venda` (`0021`) |
| Liberação por aba | middleware — é roteamento, **não** isolamento de dados |

Autenticação tem tradutor próprio: `traduzirErroAuth()` em `lib/erros.ts`. Os códigos da
GoTrue (`invalid_credentials`, `email_not_confirmed`, `otp_expired`…) não são SQLSTATE e não
passam por `traduzirErroSupabase`. Nunca mostre `error.message` de auth direto na tela.

`/recuperar` e `/auth/reset` são públicas no middleware **e não** `isAuthEntryRoute` — o
motivo está comentado no próprio `lib/supabase/middleware.ts` e no README. Mexer nisso
quebra a recuperação de senha de conta suspensa, que é silencioso: continua funcionando para
a conta master.

A regra de senha mora só em `senhaSchema` (`lib/validacao.ts`), usada pelas quatro telas que
pedem senha. Não escreva o mínimo à mão.

O PIN nunca é enviado ao cliente: `perfil_negocio.pin_admin_hash` fica fora de todo
`select` e a tela recebe só um booleano.

**IA (Gemini).** Única chamada externa do projeto e única env sem `NEXT_PUBLIC_`
(`GEMINI_API_KEY`). `lib/ia/gemini.ts` **não pode** ser importado por Client Component — a
chave iria para o bundle. Em `lib/ia/gerar.ts` a ordem é obrigatória: `ia_buscar_sugestao`
(autentica + cache) → `ia_consumir` (cota) → `chamarGemini`. Inverter abre a chave para
conta suspensa ou cobra cota por resposta que já estava no cache. A cota e o cache moram
no banco (0024, tabelas só com policy de SELECT, escrita por `security definer`), pelo
motivo de sempre: checagem só no Node é contornável. Não mexa em `lib/csp.ts` por causa
disso — a chamada não sai do navegador. Detalhes e regras de economia no README.

**CSP.** Cabeçalho fixo mora em `next.config.ts`; a CSP mora em `lib/csp.ts` (nonce por
requisição, aplicada no `proxy.ts`). `script-src` não tem `'unsafe-inline'` nem
`'unsafe-eval'`. Então: todo `<script>` inline precisa do nonce de `headers()`; toda origem
externa nova precisa entrar em `lib/csp.ts` ou o navegador bloqueia em silêncio; e nada de
`eval`/`new Function` no cliente — é por isso que o Zod está com `jitless: true` em
`lib/validacao.ts`. Detalhes no README.

## Arquitetura

```
app/
  (painel)/          rotas autenticadas; cada feature é uma pasta com:
                        page.tsx      Server Component — busca dados com Promise.all
                        XClient.tsx   Client Component — toda a interatividade
                        actions.ts    Server Actions ("use server") — mutações
  vitrine/[slug]/    rota pública (sem auth) — vitrine do catálogo, lê via RPC security definer
  login/ signup/     autenticação
  auth/callback/     troca o código do e-mail de confirmação pela sessão
components/
  ui/                blocos reutilizáveis (Card, Modal, Table, RowMenu, FormField...)
  catalogo/          vitrine pública, pop-up de produto, filtros
  precificacao/      calculadora em massa e o card de resultado compartilhado
  charts/            gráficos (Recharts)
lib/
  pricing.ts         o coração do sistema: resolve preço por margem, lucro, markup ou preço
                     fixo, incluindo faixas de comissão por preço (Shopee) — tem testes em
                     pricing.test.ts, mudanças aqui exigem rodar os testes
  alertas.ts         erosão de margem e previsão de ruptura de estoque (alertas.test.ts)
  acesso.ts          catálogo de abas + regras de acesso usadas pelo middleware
                     (acesso.test.ts — é controle de acesso, mantenha coberto)
  validacao.ts       schemas Zod + helper validar() — toda server action valida entrada aqui
  erros.ts           traduzirErroSupabase()/lancarErroSupabase() — traduz erro do Postgres
                     para pt-BR; o fallback é genérico de propósito, para não vazar nome de
                     tabela/constraint no toast (P0001 passa direto, é mensagem nossa)
  csv.ts             exportação para CSV, com escape (csv.test.ts)
  format.ts          moeda, datas e numeroOuNulo() (format.test.ts)
  hooks/             hooks compartilhados (ex.: useSupabaseUpload para upload no Storage)
  supabase/          clients: client.ts (browser), server.ts (Server Components/Actions),
                     middleware.ts (sessão)
proxy.ts             middleware do Next 16 (`config.matcher`) — protege as rotas autenticadas
app/error.tsx        error boundary global — captura falha de fetch de Server Component e
                     mostra retry amigável em vez de crash cru (pode mascarar o erro real do
                     Postgres — para depurar, chame a RPC/tabela direto via REST se precisar
                     ver a mensagem original)
```

Padrão de dados: `page.tsx` busca tudo em paralelo com `Promise.all` e passa por props para
o `XClient.tsx`; mutações vivem em `actions.ts`, validam entrada com `validar()` +
`lib/validacao.ts`, traduzem erro do Supabase com `lancarErroSupabase()` e terminam com
`revalidatePath`. Não crie chamadas ao Supabase direto de Client Components — sempre via
Server Action.

`react-hooks/set-state-in-effect` está ativo no lint: para resetar o estado local de um
modal/componente quando o item selecionado muda, prefira montar/desmontar via `key`
(`key={`algo-${item?.id ?? "fechado"}`}`) em vez de chamar `setState` de forma síncrona
dentro de um `useEffect`.

**O `key` vai no componente que tem o `useState`, não no `<Modal>` de dentro.** Pôr no
lugar errado não remonta nada: o `useState` continua inicializado com o valor da primeira
montagem, quando o item ainda era `null`. Isso já causou três bugs de perda de dado —
inclusive um em que abrir "Gerenciar acesso" de uma conta ativa mostrava "Pendente" e
salvar rebaixava a conta.

## Armadilhas de dado

- **Data:** coluna `date` chega como `"2026-01-01"` e `new Date()` disso é meia-noite UTC —
  no Brasil, um dia antes. Use `formatarDataIso` e `hojeIsoLocal()` de `lib/format.ts`;
  nunca `toISOString().slice(0,10)`, que vira o dia seguinte depois das 21h.
- **NaN:** `Number("19,90")` é `NaN`, e ele escapa de `??`, de `x <= 0` e vira `null` no
  `JSON.stringify`. Use `numeroOuNulo()` em todo input numérico.
- **CSV:** use `paraCsv`/`matrizParaCsv` de `lib/csv.ts` — eles escapam vírgula, aspas e
  quebra de linha.
- **Somas de dinheiro** de listas grandes vão no banco (`numeric` é exato). Somar em JS o
  array que a página carregou dá o total só do que foi carregado.

## Design

`DESIGN.md` define a paleta, tipografia (Inter para interface, Space Mono para números/SKU/
datas) e os componentes visuais (botões, cards, tabelas, chips) — consulte antes de criar
qualquer componente novo de UI para manter consistência com o "cockpit operacional" que o
sistema busca (denso, sem decoração, sem glow/gradiente/sombra).
