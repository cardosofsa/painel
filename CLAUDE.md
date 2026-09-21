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
  pricing.ts         o coração do sistema: resolve preço por margem, lucro ou preço fixo,
                     incluindo faixas de comissão por preço (Shopee) — tem testes em
                     pricing.test.ts, mudanças aqui exigem rodar os testes
  alertas.ts         erosão de margem e previsão de ruptura de estoque (alertas.test.ts)
  validacao.ts       schemas Zod + helper validar() — toda server action valida entrada aqui
  erros.ts           traduzirErroSupabase()/lancarErroSupabase() — traduz erro cru do
                     Postgres (código, constraint) para mensagem em pt-BR antes do toast
  csv.ts             exportação de tabelas para CSV
  format.ts          formatação (moeda, datas)
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

## Design

`DESIGN.md` define a paleta, tipografia (Inter para interface, Space Mono para números/SKU/
datas) e os componentes visuais (botões, cards, tabelas, chips) — consulte antes de criar
qualquer componente novo de UI para manter consistência com o "cockpit operacional" que o
sistema busca (denso, sem decoração, sem glow/gradiente/sombra).
