# Monitoramento: health check em `/api/saude`

Um monitor externo chama `https://SEU-DOMINIO/api/saude` a cada 5 minutos e avisa por e-mail,
Telegram ou WhatsApp quando o Sertão sai do ar. Sem isso, quem descobre que o app caiu é o
usuário, na hora de vender.

## O que a rota responde

`GET /api/saude` é pública e não usa sessão. A resposta nunca vai para cache (`Cache-Control: no-store`).

| Situação | HTTP | `status` |
|---|---|---|
| Banco respondeu e está tudo em ordem | 200 | `ok` |
| Banco respondeu, mas falta variável ou há loja sem sincronizar há mais de 26 h | 200 | `degradado` |
| Banco não respondeu (rede, tempo esgotado, Supabase fora) | 503 | `fora` |

Exemplo:

```json
{
  "status": "ok",
  "verificado_em": "2026-10-07T12:00:00.000Z",
  "banco": { "ok": true, "ms": 85 },
  "variaveis": {
    "NEXT_PUBLIC_SUPABASE_URL": true,
    "SUPABASE_SERVICE_ROLE_KEY": true,
    "CRON_SECRET": true,
    "IA_CHAVE_COFRE": true,
    "SHOPEE_PARTNER_ID": true,
    "GEMINI_API_KEY": true
  },
  "sincronizacao": { "mais_antiga_min": 312 },
  "alertas": []
}
```

- **banco**: chama `planos_publicos()` com a chave anônima, a mesma consulta da página inicial. Cada consulta tem até 4 s.
- **variaveis**: só diz se cada variável existe (`true`/`false`). O valor nunca sai na resposta.
- **sincronizacao.mais_antiga_min**: há quantos minutos sincronizou a loja mais atrasada.
  - Entram só lojas conectadas, de contas ativas, das plataformas com credenciais configuradas.
  - Uma loja que nunca sincronizou conta desde a conexão.
  - O valor é `null` quando não há o que medir: sem service key, sem marketplace ligado ou sem loja conectada.
  - O cron roda uma vez por dia (09:00 UTC). Passou de 26 h, o cron falhou pelo menos uma vez: veja **Admin → Erros**, onde ficam as falhas dos crons.
- **alertas**: o motivo do `degradado` ou do `fora`, em português.

Nenhum id, e-mail, nome de loja ou dado de conta sai na resposta.

> A rota precisa estar liberada no middleware (`lib/supabase/middleware.ts`), como as outras
> rotas públicas de `/api`. Sem isso, o monitor recebe o redirecionamento para o login (307)
> em vez do JSON. Teste em uma aba anônima: `https://SEU-DOMINIO/api/saude` tem que mostrar o JSON.

## UptimeRobot (plano grátis)

1. Crie a conta em **uptimerobot.com** e clique em **+ New monitor**.
2. Preencha:
   - **Monitor type:** `HTTP(s)`;
   - **URL:** `https://SEU-DOMINIO/api/saude`;
   - **Monitoring interval:** `5 minutes`.
3. Em **Notifications**, marque o e-mail (e o Telegram, se tiver ligado).
4. Salve. O monitor fica vermelho quando a rota devolve 503 ou não responde.

Para também ser avisado do `degradado` (variável faltando, cron parado), crie um segundo monitor:
- **Monitor type:** `Keyword`, na mesma URL e no mesmo intervalo;
- **Keyword:** `"status":"ok"`;
- **Alert when:** `Keyword not exists`.

## Better Stack (Uptime)

1. Em **betterstack.com → Uptime → Monitors → Create monitor**.
2. Preencha:
   - **Alert us when:** `URL becomes unavailable`;
   - **URL to monitor:** `https://SEU-DOMINIO/api/saude`;
   - **Check frequency:** `5 minutes`;
   - **Request timeout:** `15 seconds`.
3. Em **On-call escalation**, escolha e-mail, SMS ou app.
4. Para o `degradado`, crie outro monitor na mesma URL:
   - **Alert us when:** `URL doesn't contain keyword`;
   - **Keyword:** `"status":"ok"`.

## Dicas

- A rota também atende `HEAD`, com o mesmo código HTTP e sem corpo. Alguns monitores usam `HEAD` por padrão.
- Não aponte o monitor para `/` ou `/login`: elas podem responder 200 com o banco fora, porque a página abre e só a consulta falha.
- Intervalo de 5 min é suficiente: cada chamada faz até três consultas leves.
- Se o alerta vier de `sincronizacao` e o cron estiver em dia, uma loja pode ter perdido a autorização. Veja **Configurações → Canais de venda** e reconecte.
