# Cobrança automática das assinaturas (Asaas)

Sem configuração, o painel funciona como sempre: em **Configurações → Plano**, "Assinar"
registra um pedido e o master ativa em **Admin → conta → Plano**. Com as variáveis do Asaas,
"Assinar" leva o cliente para a fatura do Asaas, e o plano ativa sozinho quando o pagamento
é confirmado.

Código: `lib/cobranca/asaas.ts` (provedor), `lib/cobranca/mesclar.ts` (regra do webhook),
`app/api/cobranca/webhook/route.ts` (rota). Usa as colunas `provedor` e `provedor_ref` de
`assinaturas` (0057) e precisa da **0082** (`0082_cobranca_pendencias.sql`) aplicada antes de
ligar o provedor: período do provedor separado do bônus, refs encerradas, estornos e
cancelamento agendado.

## 1. Conta e chave da API

1. Crie a conta em [asaas.com](https://www.asaas.com) e conclua a aprovação cadastral (sem ela,
   a conta de produção não recebe).
2. Para testar antes, crie também uma conta em [sandbox.asaas.com](https://sandbox.asaas.com):
   é outro cadastro, com outra chave.
3. Em **Integrações → Chaves de API** (menu do usuário), gere a chave. Ela começa com
   `$aact_` e só aparece uma vez: copie na hora.

## 2. Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Valor |
| --- | --- |
| `ASAAS_API_KEY` | A chave da API (`$aact_...`). Só servidor, **sem** `NEXT_PUBLIC_` |
| `ASAAS_WEBHOOK_TOKEN` | Um segredo seu, longo e aleatório (ex.: `openssl rand -hex 32`). O mesmo vai no webhook do Asaas |
| `ASAAS_AMBIENTE` | Opcional. `sandbox` usa `https://api-sandbox.asaas.com/v3`; qualquer outra coisa (ou vazio) usa produção, `https://api.asaas.com/v3` |
| `SUPABASE_SERVICE_ROLE_KEY` | Já existente. Sem ela o webhook responde 404 e nada é gravado |

O provedor só liga com **as duas** primeiras. Faltando uma, volta o fluxo de pedido manual.
Depois de salvar as variáveis, faça um novo deploy.

> Chave de sandbox não vale em produção e vice-versa: o Asaas responde 401 e a tela mostra
> "Chave da API do Asaas inválida".

## 3. Webhook

No Asaas: **Integrações → Webhooks → Adicionar** (um para cobranças e assinaturas):

- **URL:** `https://painel-liard-xi.vercel.app/api/cobranca/webhook`
- **Token de autenticação:** o mesmo valor de `ASAAS_WEBHOOK_TOKEN`. O Asaas manda no header
  `asaas-access-token`, e a rota compara em tempo constante; diferente → 401.
- **Versão da API:** v3. **Tipo de envio:** sequencial. **Fila:** ativada.
- **Eventos:** `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
  `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_DELETED`,
  `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED` e `SUBSCRIPTION_UPDATED`. Os outros
  são ignorados (respondem 200).

O que cada evento faz com a assinatura da conta:

| Evento | Efeito |
| --- | --- |
| `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | `ativa` no plano do `externalReference`, com período do provedor (`periodo_fim_provedor`) até vencimento + 1 mês (fim do dia, Brasília). Nunca encurta o período já gravado. O período efetivo (`periodo_fim`) é esse + `dias_bonus` (bônus de indicação) |
| `PAYMENT_OVERDUE` | `atrasada` (o período continua; o plano vale mais 7 dias depois do fim, regra da 0057) |
| `PAYMENT_REFUNDED` / `PAYMENT_CHARGEBACK_REQUESTED` / `PAYMENT_DELETED` (este só se a cobrança estava paga) | Tira do período a duração daquela cobrança (nunca antes do vencimento dela), uma vez só (`provedor_pagamentos_estornados`). Se foi o pagamento que gerou a recompensa de indicação, os 30 dias saem das duas contas (`desfazer_bonus_indicacao`) |
| `SUBSCRIPTION_DELETED` / `SUBSCRIPTION_INACTIVATED` / `SUBSCRIPTION_UPDATED` com status `INACTIVE` | `cancelada`: a conta passa a valer o plano grátis. Se a conta pediu o Grátis (`cancelamento_agendado`), não rebaixa: o plano pago vale até `periodo_fim` |

Garantias da rota:

- **Idempotente.** Evento repetido (o Asaas reenvia; `CONFIRMED` e `RECEIVED` chegam os dois
  no cartão) não muda nada. Evento fora de ordem também não: "vencida" de uma fatura que o
  período já cobre é descartada.
- **Só a assinatura gravada rebaixa.** "Vencida"/"cancelada" de outra assinatura (a antiga de
  uma troca de plano, ou a primeira fatura nunca paga de quem está no teste) é ignorada.
- **Troca de plano.** A assinatura nova, quando paga, assume; a antiga é cancelada no Asaas
  pela própria rota e entra em `provedor_refs_encerradas`: qualquer evento dela depois (o
  "cancelada", ou uma fatura pendente paga atrasada) é ignorado.
- **Pagamento estornado não volta a valer**: um "pago" reenviado da mesma cobrança é ignorado.
- **Grava com a service key filtrando `user_id`** que veio no `externalReference`
  (`user_id:plano_id`) do evento autenticado.
- Falha passageira (rede, banco) → 500 e o Asaas reenvia. Erro que reenvio não resolve
  (plano ou conta que não existem) → 200 com log, porque o Asaas **pausa a fila inteira**
  depois de várias falhas seguidas. Se a fila pausar mesmo assim, reative em
  Integrações → Webhooks depois de corrigir a causa.

## 4. Como o cliente paga

1. Configurações → Plano → **Assinar**: o painel pede o CPF/CNPJ de quem paga (o Asaas exige
   para emitir a cobrança; não fica gravado no painel, só no cadastro do Asaas).
2. O servidor acha o cliente no Asaas pelo `externalReference = user_id` (ou cria), cria a
   assinatura (ciclo `MONTHLY`, `billingType = UNDEFINED`: Pix, boleto ou cartão à escolha do
   cliente, primeira cobrança vencendo hoje) e devolve a `invoiceUrl` da primeira fatura.
   Assinar de novo o mesmo plano reaproveita a fatura em aberto, sem duplicar.
3. O navegador vai para a fatura do Asaas. Pago, o webhook ativa o plano (Pix e cartão em
   segundos; boleto em até 3 dias úteis).
4. **Mudar para o Grátis** marca `cancelamento_agendado` (RPC `agendar_cancelamento_assinatura`)
   e cancela a assinatura no Asaas (as cobranças param). O plano pago continua valendo até
   `periodo_fim` e só então a conta cai para o grátis. Se o cancelamento no Asaas falhar, a
   marca é desfeita.

As renovações mensais são automáticas: cada pagamento estende o período em um mês.

## 5. Teste ponta a ponta (sandbox)

1. Configure `ASAAS_AMBIENTE=sandbox` e a chave do sandbox num deploy de **preview** (não
   no de produção) e cadastre o webhook no sandbox apontando para a URL do preview.
2. Entre com a conta de teste (`painel@teste.com`), Configurações → Plano → Assinar o
   Essencial, CPF de teste válido (ex.: `529.982.247-25`).
3. Na fatura do sandbox, pague com Pix ou, no painel do sandbox, abra a cobrança e use
   **Confirmar pagamento** / **Receber em dinheiro**.
4. Em Integrações → Webhooks → **Logs**, confira a entrega com status 200. Recarregue a aba
   Plano: deve mostrar Essencial ativo com "pago até" daqui a um mês.
5. No sandbox, exclua a assinatura: o log mostra `SUBSCRIPTION_DELETED` com 200 e a conta
   volta para o Grátis.
6. Reenvie um evento pelo log do Asaas: a resposta continua 200 e nada muda (idempotência).

Sem o webhook (variáveis ausentes ou 404), o master ainda pode ativar à mão em Admin, como
antes.

## Antes de ligar em produção

1. Aplique a `0082_cobranca_pendencias.sql` (depois da 0078), seguindo o fluxo do CLAUDE.md.
2. Inclua os eventos de estorno no webhook do Asaas (lista da seção 3).

Limitações conhecidas (sem efeito enquanto `ASAAS_API_KEY` não existe):

- Bônus de indicação recebido no **teste** ou no **Grátis** (que vira 30 dias de Pro) não
  passa para a assinatura paga contratada depois: só o bônus aplicado durante um período
  pago fica em `dias_bonus`.
- Estorno de uma indicação já recompensada não paga a recompensa de novo se a conta voltar a
  pagar (a indicação conta uma vez só).
- A tela Plano ainda não mostra "cancelamento agendado"; mostra o plano pago com o
  "pago até".
