# Painel — Segundo Cérebro

Sistema de gestão para operação de e-commerce (Shopee e outros marketplaces): precificação
com regra de negócio real, catálogo de produtos, estoque, compras, fornecedores e financeiro.
Uso pessoal, um usuário por conta, com isolamento de dados no banco.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** (`strict`)
- **Supabase** — Postgres, Auth e Storage. O app usa apenas a chave anônima; o isolamento
  entre contas é feito por Row Level Security no banco.
- **Tailwind CSS 4**, **Recharts** (gráficos), **sonner** (toasts), **lucide-react** (ícones)

## Como rodar

```bash
npm install
cp .env.local.example .env.local   # preencha com os dados do seu projeto Supabase
npm run dev                        # http://localhost:3000
```

Variáveis de ambiente (em `.env.local`):

| Variável | O que é |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto no Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anônima (`anon public`) do projeto |

Não existe service role key no projeto, e não deve existir: tudo passa pelo RLS.

## Banco de dados

As migrações ficam em `supabase/migrations/`, numeradas em ordem de aplicação
(`0001_init.sql` → `0013_produto_lojas.sql`). **Elas são aplicadas manualmente**: abra o
SQL Editor do Supabase, cole o conteúdo do arquivo e execute, na ordem numérica.

Convenções ao criar uma migração nova:

- Numere na sequência e descreva no nome o que ela faz (`0014_registro_vendas.sql`).
- Comece com um comentário explicando o porquê da mudança.
- Toda tabela nova precisa de `user_id uuid not null references auth.users on delete cascade
  default auth.uid()`, `enable row level security` e uma policy
  `using (auth.uid() = user_id)`. Tabela filha (sem `user_id` próprio) usa `exists` no pai.
- **Termine sempre com `NOTIFY pgrst, 'reload schema';`** — sem isso o PostgREST continua
  servindo o schema antigo e a aplicação quebra com "column not found".

## Estrutura

```
app/
  (painel)/          rotas autenticadas; cada uma tem page.tsx (Server Component),
                     XClient.tsx (interface) e actions.ts (mutações "use server")
  login/ signup/     autenticação
  auth/callback/     troca o código do e-mail de confirmação pela sessão
components/
  ui/                blocos reutilizáveis (Card, Modal, Table, RowMenu...)
  precificacao/      calculadora em massa e o card de resultado compartilhado
  charts/            gráficos (Recharts)
lib/
  pricing.ts         o coração do sistema: resolve preço por margem, lucro ou preço fixo,
                     incluindo faixas de comissão por preço (Shopee)
  alertas.ts         erosão de margem e previsão de ruptura de estoque
  supabase/          clients de browser, server e middleware de sessão
proxy.ts             middleware de sessão do Next 16 (protege as rotas)
supabase/migrations/ schema versionado
```

Padrão de dados: a `page.tsx` busca tudo em paralelo com `Promise.all` e passa por props;
as mutações vivem em `actions.ts` e terminam com `revalidatePath`.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (roda checagem de tipos) |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários (Vitest) |

Antes de dar um trabalho por concluído: `npx tsc --noEmit`, `npm run lint` e `npm test`.

## Conta de teste

Existe uma conta dedicada a testes automatizados (`painel@teste.com`), separada da conta
real de uso. Dados criados por ela são descartáveis.
