# Painel — Sertão

Sistema de gestão para operação de e-commerce (Shopee e outros marketplaces): precificação
com regra de negócio real, catálogo de produtos, estoque, compras, fornecedores e financeiro.
Uso pessoal, um usuário por conta, com isolamento de dados no banco.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** (`strict`)
- **Supabase** — Postgres, Auth e Storage. Telas e ações usam a chave anônima; o isolamento
  entre contas é feito por Row Level Security no banco. A service role key só é usada por
  rotas de servidor sem usuário logado (cron, webhooks, vitrine pública).
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
| `NEXT_PUBLIC_SITE_URL` | Opcional em dev, **recomendada em produção**: base dos links enviados por e-mail |
| `GEMINI_API_KEY` | Opcional. Liga a geração de texto por IA. **Sem prefixo `NEXT_PUBLIC_`** — ver [Geração por IA](#geração-por-ia) |
| `GEMINI_MODEL` | Opcional. Padrão `gemini-3.5-flash-lite` |
| `IA_CHAVE_COFRE` | Chave-mestra (32 bytes em base64) do cofre que guarda chaves de IA, frete e NF-e de cada conta |
| `ACESSO_SEGREDO` | Opcional. Assina o cookie de acesso do middleware (sem ela, usa `IA_CHAVE_COFRE`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Só servidor. Cron, webhooks e vitrine pública (frete e pedido). Sem ela, esses recursos ficam desligados |
| `CRON_SECRET` | Protege `/api/cron/shopee` (sincronização automática) |
| `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_AMBIENTE`, `SHOPEE_HOST` | API da Shopee (ver `docs/shopee-api.md`) |
| `ML_CLIENT_ID`, `ML_CLIENT_SECRET` | API do Mercado Livre (ver `docs/mercadolivre-api.md`) |

A service role key ignora o RLS: só `lib/supabase/servico.ts` a lê, e só rotas sem usuário
logado a usam, sempre filtrando `user_id` explícito. Tela e Server Action nunca.

## Autenticação

| Rota | Para quê |
| --- | --- |
| `/login` | Entrar. Oferece reenvio da confirmação quando o e-mail ainda não foi confirmado |
| `/signup` | Criar conta. O cadastro nasce `pendente` e passa por aprovação do master |
| `/recuperar` | Pedir o link de redefinição de senha |
| `/auth/reset` | Definir a nova senha (tela terminal, chega-se nela pelo link do e-mail) |
| `/auth/callback` | Recebe todo link de e-mail: confirmação, recuperação, convite |

Três coisas que não são óbvias e é melhor não desfazer sem pensar:

- **`/recuperar` responde igual exista ou não a conta.** Diferenciar transformaria a tela num
  verificador de quem tem cadastro no sistema. A única exceção tratada é o limite de envio.
- **`/recuperar` e `/auth/reset` são rotas públicas no middleware, mas não são
  `isAuthEntryRoute`.** Se fossem, a regra `user && isAuthEntryRoute → /dashboard` expulsaria
  quem acabou de ganhar sessão pelo link, e a redefinição ficaria inalcançável. E se não
  fossem públicas, conta `suspensa` ou `pendente` seria mandada para `/aguardando` e **nunca
  conseguiria trocar a senha** — justamente o caso em que trocar mais importa.
- **Erro de autenticação passa por `traduzirErroAuth`** (`lib/erros.ts`), não por
  `traduzirErroSupabase`, que só conhece código do Postgres.

### Configuração obrigatória no painel do Supabase

O código não alcança nada disto, e sem isto o fluxo falha em produção:

1. **Authentication → URL Configuration** — *Site URL* com o domínio de produção e, em
   *Redirect URLs*, `https://SEU-DOMINIO/auth/callback` **e** `https://SEU-DOMINIO/auth/reset`.
   Sem isso a GoTrue troca o destino pelo Site URL em silêncio e o link "não funciona".
2. **Authentication → Email Templates** — trocar os dois templates abaixo. É o que faz o
   link funcionar quando a pessoa se cadastra no computador e abre o e-mail no celular: o
   formato padrão (`{{ .ConfirmationURL }}`) usa PKCE, cujo verificador fica guardado só no
   navegador de origem.

   *Confirm signup*:
   ```html
   <p>Confirme seu cadastro no Sertão:</p>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">Confirmar minha conta</a></p>
   ```

   *Reset password*:
   ```html
   <p>Recebemos um pedido para redefinir sua senha:</p>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Definir nova senha</a></p>
   <p>Se não foi você, ignore este e-mail.</p>
   ```
3. **Authentication → Providers → Email** — ligar **Confirm email** e **Secure password
   change**. O segundo é o que realmente exige a senha atual: a re-autenticação feita em
   Configurações é o que satisfaz a exigência de "sessão recente", mas sozinha ela não
   impede uma chamada direta à API.
4. **Authentication → Policies** — mínimo de 8 caracteres (igual ao `senhaSchema`) e
   **Leaked password protection** (HaveIBeenPwned).
5. **Authentication → Attack Protection** — captcha. Não há bloqueio por tentativas na
   aplicação; o limite é o da GoTrue, que é por IP.
6. **SMTP próprio.** O SMTP embutido entrega poucos e-mails por hora — com cadastro e
   recuperação por e-mail, isso inviabiliza o uso real.

## Banco de dados

As migrações ficam em `supabase/migrations/`, numeradas em ordem de aplicação
(`0001_init.sql` → a mais recente; confira a pasta). Aplique uma por vez, na ordem
numérica, de um destes jeitos:

- **SQL Editor do Supabase:** cole o conteúdo do arquivo e execute.
- **Script, pela Management API:** com `SUPABASE_PROJECT_REF` e `SUPABASE_ACCESS_TOKEN`
  (token pessoal, em *Account → Access Tokens*) no ambiente ou no `.env.local`:

  ```bash
  npm run db:verificar                             # consulta somente leitura
  npm run db:migracao -- 0067_algo.sql             # testa no PGlite e mostra o que muda
  npm run db:migracao -- 0067_algo.sql --aplicar   # aplica
  ```

  Sem `--aplicar`, nada vai ao Supabase: a migração roda no PGlite por cima das anteriores,
  duas vezes (idempotência), e o script lista o que muda no schema. Ele recusa as anteriores
  à 0021, a 0012 e a 0048 (esta depende de pg_cron/Vault e vai pelo SQL Editor).

> ⚠️ **As migrações 0001-0020 não são replayáveis num banco novo sem edição.** Catorze delas
> não são idempotentes, e duas *duplicam dados* se rodarem duas vezes: `0004` insere 4 canais
> por usuário de novo, `0005` insere 5 faixas por canal de novo. Num banco em produção isso
> nunca aconteceu porque cada uma rodou uma vez só — o problema aparece no dia em que você
> precisar recriar o ambiente do zero. A disciplina mudou a partir da `0021`; da 0021 em
> diante todas são idempotentes e podem ser re-executadas à vontade.

> `0012_limpar_dados_teste.sql` não é migração: é um script destrutivo pontual que apaga
> dados da conta de teste. Não execute num banco de produção.

Convenções ao criar uma migração nova:

- Numere na sequência e descreva no nome o que ela faz (`0014_registro_vendas.sql`).
- Comece com um comentário explicando o porquê da mudança.
- Toda tabela nova precisa de `user_id uuid not null references auth.users on delete cascade
  default auth.uid()`, `enable row level security` e uma policy
  `using (auth.uid() = user_id)`. Tabela filha (sem `user_id` próprio) usa `exists` no pai.
- **Termine sempre com `NOTIFY pgrst, 'reload schema';`** — sem isso o PostgREST continua
  servindo o schema antigo e a aplicação quebra com "column not found".

## Contas e controle de acesso

Cada conta é um negócio isolado: todas as tabelas são separadas por `user_id` com RLS, então
duas contas nunca enxergam os dados uma da outra. Acima disso existe a **conta master**, que
vê todos os cadastros em `/admin`, aprova quem entra e decide quais abas cada conta usa.

- Quem se cadastra entra como `pendente` e cai em `/aguardando` até o master liberar.
- **A suspensão vale no banco, não só na tela.** Todas as policies exigem `conta_ativa()`
  (migração `0021`), então uma conta pendente, suspensa ou vencida não lê nem escreve nada
  — nem pelo navegador, nem chamando o PostgREST direto com a chave anônima. Antes da 0021
  a barreira existia só no middleware e suspender uma conta apenas escondia o menu.
- **A suspensão derruba a vitrine junto** (migração `0026`). `obter_catalogo_publico` é
  `security definer` e ignora RLS por natureza, então até a 0026 suspender alguém tirava o
  painel mas deixava o link do WhatsApp servindo produtos, preços e o telefone do negócio.
  Agora ela consulta `conta_ativa_de(dono)` e responde como se o link não existisse.
- **Conta suspensa também não sobe nem apaga arquivo** — as policies de Storage passaram a
  exigir `conta_ativa()` na mesma migração.
- A liberação **por aba** continua sendo enforcement de rota, no middleware
  (`lib/supabase/middleware.ts`), não no menu — esconder o link não impediria ninguém de
  digitar a URL. Ela é controle de navegação e de licenciamento, não de isolamento de
  dados: o que garante isolamento é o RLS por `user_id`.
- O catálogo de abas fica em `lib/acesso.ts` (com testes em `lib/acesso.test.ts`), e
  `perfis_acesso` não tem policy de escrita: toda alteração passa por RPC
  `security definer` que confere `e_master()`.
- O PIN de administração é guardado como hash bcrypt e **nunca volta para o navegador** —
  a tela só recebe um booleano "tem PIN?". Quem confere o PIN é a RPC `editar_venda`, no
  banco; uma checagem só na Server Action seria contornável chamando a RPC pelo console.

Para promover a primeira conta a master, rode o `update` documentado no cabeçalho de
`supabase/migrations/0020_perfis_acesso_admin.sql` — sem isso `/admin` fica inacessível.

> ⚠️ A `0021` exige que a `0020` já tenha rodado (ela aborta com mensagem clara se não
> tiver). Depois de aplicá-la, rode as duas consultas de conferência do rodapé do arquivo:
> as duas precisam voltar vazias. Uma conta sem linha em `perfis_acesso` perde acesso aos
> próprios dados.

## Geração por IA

Dois botões, ambos opcionais: **título de anúncio** (precificação, abas Individual e
Variações) e **descrição de produto** (modal de cadastro). Cada geração devolve também
palavras-chave de busca e, quando há concorrente cadastrado, uma frase de posicionamento.

Sem `GEMINI_API_KEY` configurada o app funciona igual e **os botões não aparecem** — é
também o jeito de desligar o recurso sem deploy.

**Nada é gravado sem você aprovar.** A sugestão abre num painel com "Usar este / Gerar
outro / Descartar", e o texto só vira dado quando você salva o formulário. Isso importa
porque `produtos.descricao` é exibida na vitrine pública: revise antes de publicar.

**A IA não toca em número.** Preço, margem, comissão e faixa continuam 100% no
`lib/pricing.ts`, determinístico e testado. O prompt proíbe explicitamente citar preço,
desconto ou percentual.

### Cota e custo

A chave é uma só, do sistema, então cada conta tem uma **cota diária** (`perfis_acesso.
ia_limite_diario`, padrão 20) que o master ajusta por conta. O limite mora no banco
(migração 0024): contagem feita só no servidor do app seria contornável, e a PK
`(user_id, dia)` é o que arbitra dois cliques simultâneos.

Cinco decisões de economia, que valem lembrar antes de mexer:

1. **Raciocínio no mínimo** (`thinking_level`). O modelo cobra o raciocínio como token de
   saída; para escrever título ele não agrega e chega a dobrar a conta.
2. **Cache por impressão digital do contexto.** Gerar de novo sem mudar nada devolve na
   hora, sem chamar a API e **sem consumir cota**.
3. **Uma chamada devolve tudo** — texto, palavras-chave e posicionamento. Um botão por
   coisa custaria 3×.
4. **Prompt enxuto**: campo vazio não vira linha, cada campo é truncado, no máximo 4
   concorrentes, e foto nunca entra (multimodal custa muito mais).
5. **Sem retry automático.** Retry multiplica custo; retentar é clique seu.

### Ao mexer no código

- A chamada sai do **servidor**. `lib/ia/gemini.ts` nunca pode ser importado por Client
  Component, senão a chave vai para o bundle.
- Por isso `lib/csp.ts` **não** é alterado: a CSP vale para o navegador, e esta requisição
  não sai de lá.
- `lib/ia/gerar.ts` tem uma ordem obrigatória: autentica e consulta o cache → só então
  consome cota → só então chama a API. Inverter abriria a chave para conta suspensa, ou
  cobraria cota por resposta que já estava no banco.
- O que sai para o Google: nome, SKU, categoria, fornecedor, custo e preço do produto.
  **Nenhum dado de cliente final** — nunca inclua `clientes` nem `vendas` no contexto.

## Storage

Três buckets: `produtos` e `canais-logos` (públicos, servem a vitrine) e `notas-fiscais`
(privado). O caminho sempre começa com o `user_id`, e é isso que as policies conferem.

Tipo e tamanho são limitados **no servidor**, em `storage.buckets` (migração 0026): 5 MB e
3 MB para imagem, 10 MB para NF. A validação de `lib/hooks/useSupabaseUpload.ts` é conforto
de interface, não barreira — ela roda no navegador e o upload vai direto para o Supabase,
então dá para contorná-la pelo console.

**SVG não está na lista de tipos aceitos, de propósito.** SVG é imagem e carrega script;
num bucket público ele responderia no domínio do projeto e o script rodaria com aquela
origem. Não acrescente `image/svg+xml` sem pensar nisso.

## Cabeçalhos de segurança

Os cabeçalhos fixos (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS,
`Permissions-Policy`) ficam em `next.config.ts`.

Violações de CSP em produção são reportadas para `/api/csp-report` e aparecem no log com o
prefixo `[csp]` — sem isso, uma política quebrada seria silenciosa: o recurso some da tela
e ninguém fica sabendo. Em desenvolvimento não reporta, porque o console do navegador já
mostra.

O **Content-Security-Policy** é montado por requisição em `lib/csp.ts` e aplicado no
`proxy.ts`, porque carrega um nonce novo a cada carregamento. O `script-src` não tem
`'unsafe-inline'` nem `'unsafe-eval'`: script só roda se trouxer o nonce da requisição, que
é o que impede um XSS de executar depois que o dado já entrou no HTML.

Três consequências práticas ao mexer no app:

- **`<script>` inline precisa do nonce**, lido de `headers().get("x-nonce")`. Hoje existe um
  só, o anti-flash de tema em `app/layout.tsx`.
- **Recurso de terceiro (CDN, fonte, imagem, API) precisa ser liberado em `lib/csp.ts`.** Sem
  isso o navegador bloqueia calado — e em desenvolvimento pode passar despercebido. Hoje as
  únicas origens externas liberadas são as do Supabase.
- **Nada de `eval`/`new Function` no cliente.** É por isso que o Zod roda com
  `jitless: true` em `lib/validacao.ts`.

Ler `headers()` no layout raiz torna todas as rotas dinâmicas — de propósito, e sem custo
real: toda requisição já passava pelo proxy, que consulta a sessão antes de responder.

## Deploy

O app é um Next.js comum; o banco continua sendo o Supabase que já existe.

1. **Vercel** — importe o repositório e configure as variáveis de ambiente da tabela de
   [Como rodar](#como-rodar). O mínimo é `NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`; as demais ligam IA, marketplaces, cron e vitrine.
   A chave anônima é pública por natureza; quem protege os dados é o RLS.
2. **Supabase → Authentication → URL Configuration** — ponha o domínio de produção em
   *Site URL* e em *Redirect URLs* (`https://SEU-DOMINIO/auth/callback`). Sem isso o link de
   confirmação de e-mail continua apontando para `localhost` e ninguém consegue ativar a conta.
3. **Supabase → Authentication → Providers → Email** — mantenha a confirmação de e-mail
   ligada, para não entrar conta com e-mail inventado.
4. Aplique todas as migrações pendentes, em ordem (SQL Editor ou `npm run db:migracao`).

Antes de abrir para terceiros, rode as duas conferências abaixo no SQL Editor.

**1. Nenhuma tabela sem RLS** — uma tabela sem RLS é acessível por qualquer conta logada:

```sql
select tablename from pg_tables
 where schemaname = 'public'
   and tablename not in (select tablename from pg_tables t
                          join pg_class c on c.relname = t.tablename
                         where c.relrowsecurity and t.schemaname = 'public');
```

**2. Ninguém pode criar objeto no schema `public`** — as 16 funções `security definer` usam
`set search_path = public`, o que é seguro **enquanto** `authenticated` e `anon` não puderem
criar tabela lá. Se puderem, alguém planta uma `perfis_acesso` sombra e sequestra o
`e_master()`:

```sql
select has_schema_privilege('authenticated','public','CREATE') as auth_cria,
       has_schema_privilege('anon','public','CREATE')          as anon_cria;
```

As duas consultas precisam voltar vazia e `false, false`, respectivamente.

## Estrutura

```
app/
  (painel)/          rotas autenticadas; cada uma tem page.tsx (Server Component),
                     XClient.tsx (interface) e actions.ts (mutações "use server")
  login/ signup/     autenticação
  auth/callback/     troca o código do e-mail de confirmação pela sessão
components/
  ui/                blocos reutilizáveis (Card, Modal, Table, Chip, RowMenu...)
  precificacao/      calculadora em massa e o card de resultado compartilhado
  configuracoes/     modais de canal, loja, faixa, conta, forma de pagamento e armazém
  financeiro/        modais de lançamento, despesa, título e limpeza por período
  compras/           formulário de pedido de compra
  charts/            gráficos (Recharts) — `tema.ts` centraliza cor, tooltip e eixo
lib/
  pricing.ts         o coração do sistema: resolve preço por margem, lucro, markup ou preço
                     fixo, incluindo faixas de comissão por preço (Shopee)
  acao.ts            contrato `Resultado` das Server Actions (servidor)
  acao-cliente.ts    `executarComToast` — como o cliente chama qualquer action
  alertas.ts         erosão de margem e previsão de ruptura de estoque
  acesso.ts          catálogo de abas e regras de quem enxerga o quê (usado pelo middleware)
  format.ts          moeda, datas e parsing de número — ver aviso de fuso abaixo
  cores.ts           contraste WCAG, usado pelo teste que guarda os tokens
  csv.ts             exportação com escape correto de vírgula, aspas e quebra de linha
  pdv.ts / produtos.ts  agrupamento de SKU em card e rótulo de variante
  supabase/          clients de browser, server e middleware de sessão
proxy.ts             middleware de sessão do Next 16 (protege as rotas)
supabase/migrations/ schema versionado
```

Padrão de dados: a `page.tsx` busca tudo em paralelo com `Promise.all` e passa por props;
as mutações vivem em `actions.ts` e terminam com `revalidatePath`.

**Toda action devolve `Resultado`, nunca lança.** O Next redige exceção de Server Action em
produção: o servidor loga a mensagem real e o navegador recebe um genérico, então toda a
tradução de `lib/erros.ts` ficava invisível justamente onde importa. O servidor embrulha com
`comResultado`; o cliente chama com `executarComToast(acao(...), { sucesso, erro })`, que
mostra o toast certo e devolve o `Resultado` para quem chamou decidir o resto.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (roda checagem de tipos) |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários (Vitest) |

Antes de dar um trabalho por concluído: `npx tsc --noEmit`, `npm run lint` e `npm test`.

## Armadilhas conhecidas

**Datas.** As colunas `date` do Postgres chegam como `"2026-01-01"`, e `new Date("2026-01-01")`
é meia-noite **UTC** — que no Brasil (UTC-3) renderiza 31/12/2025. Use sempre
`formatarDataIso` para exibir e `hojeIsoLocal()` para montar filtro de período;
`toISOString().slice(0,10)` devolve o dia seguinte depois das 21h.

**Números digitados.** `Number("19,90")` é `NaN`, e `NaN` escapa de quase tudo: `??` não o
pega, `NaN <= 0` é `false` e `JSON.stringify(NaN)` vira `null`. Use `numeroOuNulo()` de
`lib/format.ts` em qualquer input numérico.

**CSV.** Exporte por `paraCsv`/`matrizParaCsv` de `lib/csv.ts`. Um nome como `Silva, João`
sem escape desloca todas as colunas a partir daquela linha.

## Conta de teste

Existe uma conta dedicada a testes automatizados (`painel@teste.com`), separada da conta
real de uso. Dados criados por ela são descartáveis.
