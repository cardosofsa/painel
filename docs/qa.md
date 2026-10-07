# QA: o que cada camada de teste protege

O dinheiro passa por três lugares: a regra de preço (TypeScript), as travas do banco (RPCs,
RLS, triggers) e a tela que junta as duas. Cada camada abaixo cobre um deles, e nenhuma
substitui a outra.

| Camada | Comando | Onde roda | Precisa de segredo? |
| --- | --- | --- | --- |
| Unitários (Vitest) | `npm test` | CI a cada push/PR (2×: UTC e `America/Sao_Paulo`) | Não |
| Banco (PGlite) | `npm run test:sql` | CI a cada push/PR | Não |
| E2E público (Playwright) | `npm run build && npm run test:e2e` | CI a cada PR (job "E2E") | Não |
| Smoke logado (Playwright) | `npx playwright test --project=smoke` | Depois de cada deploy da Vercel (`smoke.yml`) | Sim: conta de teste |

## 1. Unitários: `lib/*.test.ts`

Lógica pura, sem rede nem banco: `pricing.ts` (margem, lucro, markup, faixas de comissão),
`alertas.ts`, `acesso.ts` (controle de acesso por aba), `format.ts` (datas no fuso do Brasil,
`numeroOuNulo`), `csv.ts`, `cores.test.ts` (contraste dos tokens) etc. Rodam duas vezes no CI,
uma em UTC e outra no fuso de Brasília, porque o erro de "um dia antes" só aparece num deles.

## 2. Banco: `scripts/sql/*.mjs`

Postgres de verdade em WebAssembly (PGlite) com **todas** as migrações aplicadas do zero
(`scripts/sql/banco.mjs`; só a 0048 fica de fora, por depender de pg_cron/Vault). Cada script
monta um cenário, chama as RPCs como o app chamaria (inclusive como `anon`) e reaplica a
migração para provar que ela é idempotente. É aqui que se testa o que o app **não** consegue
garantir sozinho: RLS, `conta_ativa()`, `security definer`, triggers de estoque e de custo.

`scripts/sql/vitrine-pedido.mjs` cobre `criar_pedido_vitrine` (0027, refeita na 0033), a única
escrita anônima do sistema:

- pedido válido, devolvendo só número e total;
- preço sempre do banco: o `preco_unitario` mandado pelo navegador é ignorado;
- idempotência (mesma chave = mesmo pedido, sem duplicar nem gastar cota);
- intervalo de 10 s entre pedidos do catálogo e limite de 300 por dia (que zera no dia seguinte);
- recusa sem gastar cota: item sem estoque, inativo, de outra conta, com preço zero
  ("Consultar"), quantidade fora de 1..99, carrinho vazio, nome e WhatsApp inválidos;
- catálogo inativo, slug inexistente e conta suspensa ou vencida respondem com a mesma
  mensagem (não dá para descobrir qual é o caso);
- pedido não mexe no estoque (só a aprovação mexe) e `anon` não lê a tabela crua.

Para acrescentar um script: siga o padrão (`criarBancoDeTeste`, `lerMigracao`, `confere`) e
ponha `&& node scripts/sql/<nome>.mjs` no fim de `test:sql` no `package.json`.

## 3. E2E público: `e2e/publico.spec.ts`

Roda contra o build de produção com um Supabase falso (endereço que recusa conexão): página
inicial, login, redirecionamento de rota protegida para o login, cadastro, recuperar senha,
páginas legais e `robots.txt`. Pega quebra de build, de rota e de CSP sem
precisar de banco nem de segredo.

## 4. Smoke logado: `e2e/smoke.spec.ts`

O caminho do dinheiro numa instalação de verdade, logo depois do deploy:

1. login com a conta de teste (falha avisando se a conta pedir MFA);
2. Dashboard abre sem cair no error boundary;
3. PDV: adiciona o primeiro produto ativo com estoque, paga em **Dinheiro**, vê o comprovante
   (número, valor, botão de envio);
4. Vendas: busca a venda pelo número, abre o detalhe e **cancela** (o cancelamento roda num
   `finally`: se algo falhar depois do registro, a venda não fica valendo);
5. Vendas lista pedidos; Configurações abre;
6. com `SMOKE_VITRINE_SLUG`: abre a vitrine pública, põe no carrinho um produto com preço e
   sem variantes, envia um pedido em nome de "Smoke Test" e o **recusa** no painel.

Ele também falha se aparecer erro de JavaScript na página ou resposta 5xx do próprio app.
Cada passo tem mensagem própria ("PDV: a forma 'Dinheiro' não existe na conta de teste"...),
e em caso de falha ficam print, trace e o relatório HTML no artifact `smoke-relatorio`.

Sem `SMOKE_BASE_URL`, `TESTE_EMAIL` e `TESTE_SENHA` os testes do smoke são **pulados**: o job
"E2E" do CI continua sem depender de segredo.

### O que a conta de teste precisa ter

- pelo menos um produto **ativo com estoque** (o smoke vende 1 unidade e o cancelamento devolve);
- uma forma de pagamento chamada **Dinheiro** (Configurações → Formas de pagamento);
- uma conta financeira para receber (a primeira é escolhida sozinha);
- **sem** app autenticador (MFA) e com acesso às abas PDV, Vendas e Configurações;
- para a vitrine: um catálogo ativo com um produto com preço, estoque e sem variantes.

Nunca use a conta real: o smoke cria e cancela vendas e pedidos de verdade. Cada rodada deixa
uma venda **cancelada** e um pedido **recusado** no histórico da conta de teste.

### Configurar no GitHub

Em **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Obrigatório | O que é |
| --- | --- | --- |
| `TESTE_EMAIL` | sim | e-mail da conta de teste |
| `TESTE_SENHA` | sim | senha da conta de teste |
| `SMOKE_VITRINE_SLUG` | não | slug de um catálogo ativo da conta de teste (o que vem depois de `/vitrine/`) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | não | só se os previews tiverem Deployment Protection: Vercel → Project → Settings → Deployment Protection → Protection Bypass for Automation |

O workflow `.github/workflows/smoke.yml` dispara no evento `deployment_status` que a
integração da Vercel com o GitHub publica a cada deploy; ele só roda quando o estado é
`success` e usa `target_url` (ou `environment_url`) do evento como `SMOKE_BASE_URL`. Também dá
para rodar à mão em **Actions → Smoke → Run workflow**, informando a URL. Como esse caminho
envia a conta de teste para a URL digitada, use só endereços do próprio projeto.

Sem `TESTE_EMAIL`/`TESTE_SENHA` o job emite um aviso ("Smoke desligado") e termina verde.
Dois smokes nunca rodam ao mesmo tempo (`concurrency: smoke`), porque a vitrine recusa um
segundo pedido do mesmo catálogo em menos de 10 s.

O cabeçalho `x-vercel-protection-bypass` vai em toda requisição para o deploy
(`playwright.config.ts`) e é retirado das chamadas para outras origens (Supabase, Turnstile),
que recusariam um cabeçalho fora da lista do CORS.

### Rodar localmente

```bash
# contra um deploy
SMOKE_BASE_URL=https://<deploy> TESTE_EMAIL=... TESTE_SENHA=... npx playwright test --project=smoke

# contra o servidor de desenvolvimento (outra porta que não a 3000)
npx next dev -p 3200   # em outro terminal
SMOKE_BASE_URL=http://localhost:3200 npx playwright test e2e/smoke.spec.ts
```

Variáveis úteis do `playwright.config.ts`: `PW_CHROMIUM_PATH` (usa um Chromium já instalado),
`PW_CHROMIUM_ARGS` (argumentos extras do Chromium, separados por espaço) e `HTTPS_PROXY`/`NO_PROXY`
(repassados ao navegador quando existem). Com `SMOKE_BASE_URL` definido o Playwright não sobe
servidor e o projeto `publico` fica de fora.
