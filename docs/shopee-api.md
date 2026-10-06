# Shopee — importação e API oficial

## Hoje: planilha (já funciona com a migração 0046)

1. Na Central do Vendedor da loja, vá em **Meus Pedidos → Exportar**. Escolha o período e baixe o `.xlsx`.
2. No Sertão, abra **Vendas → aba Shopee → Importar planilha da Shopee**, escolha a loja e o arquivo.
3. Na prévia, vincule os anúncios cujo SKU não bateu com nenhum produto. O vínculo fica salvo.
4. Clique em **Importar**. O que acontece:
   - Pedidos a enviar, enviados ou concluídos baixam o estoque uma única vez, no armazém que abastece a loja (Configurações → Armazéns → Lojas abastecidas).
   - Pedidos cancelados ou devolvidos depois de baixados estornam o estoque.
   - O repasse previsto vira uma conta a receber pendente no Financeiro, com vencimento 15 dias após o pagamento.
   - O lucro usa as taxas reais da planilha, o custo do produto cadastrado e a alíquota do seu perfil.
5. Para atualizar os status, importe de novo. Os pedidos não duplicam.

Faça isso para cada uma das duas lojas, escolhendo a loja certa no modal.

## Depois: API oficial (sincronização automática)

O código está pronto, mas desligado. Para ligar:

1. Crie uma conta de desenvolvedor em **https://open.shopee.com** com o login da loja principal.
2. Em **App Management**, crie um app do tipo **ERP System / Seller In House System** e aguarde a aprovação da Shopee.
3. No app aprovado, copie o **Partner ID** e a **Partner Key**.
4. Em **Redirect URL Domain**, cadastre o domínio do sistema (ex.: `painel-liard-xi.vercel.app`).
5. Na Vercel (**Settings → Environment Variables**), adicione:

   | Variável | Valor |
   |---|---|
   | `SHOPEE_PARTNER_ID` | o Partner ID (só números) |
   | `SHOPEE_PARTNER_KEY` | a Partner Key (**nunca** cole em chat) |
   | `IA_CHAVE_COFRE` | já existe, se você usa IA própria. Senão, 32 bytes em base64: `openssl rand -base64 32` |
   | `SHOPEE_AMBIENTE` | opcional: `teste` para o Sandbox v2 (`openplatform.sandbox.test-stable.shopee.sg`) |
   | `SHOPEE_HOST` | opcional: troca o endereço da API, se a Shopee mudar de novo (ex.: `https://partner.test-stable.shopeemobile.com`, o sandbox antigo) |

   Para a sincronização diária automática, adicione também:

   | Variável | Valor |
   |---|---|
   | `CRON_SECRET` | um texto aleatório longo |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (**nunca** no navegador nem em chat) |

6. Faça o redeploy. Em **Vendas → Shopee** aparece o quadro **API oficial da Shopee**. Clique em **Conectar** em cada loja e autorize com o login dela.
7. Use **Sincronizar agora** quando quiser. Com `CRON_SECRET` configurado, a Vercel também sincroniza todo dia às 9h UTC (`vercel.json`).

### Segurança

- Os tokens de cada loja são cifrados com AES-256-GCM antes de ir para o banco, com a conta e a loja como dado autenticado.
- A autorização usa um `estado` aleatório em cookie, contra CSRF.
- A rota do cron só roda com `Authorization: Bearer <CRON_SECRET>`.
- Sem as variáveis, o quadro da API não aparece e o cron responde 204 sem fazer nada.

### "Wrong sign" ao clicar em Conectar

A Shopee recusou a assinatura. Confira, nesta ordem:

1. **A chave foi copiada mascarada?** No app, clique no olho ao lado de *Test API Partner Key* antes de copiar. Cole de novo na Vercel, sem espaços.
2. **ID e chave são do mesmo ambiente?** Test Partner_id com Test Key e `SHOPEE_AMBIENTE=teste`. Ou Live Partner_id com Live Key e sem `SHOPEE_AMBIENTE`.
3. **Fez o Redeploy** depois de mudar qualquer variável?
4. Se ainda falhar no sandbox, teste `SHOPEE_HOST=https://partner.test-stable.shopeemobile.com` (o endereço antigo do sandbox) e faça o Redeploy.

## Sincronização automática a cada 15 minutos (Fase 9.6)

O sistema sincroniza sozinho de três jeitos:

1. **Ao abrir Vendas:** se alguma loja conectada estiver há mais de 10 minutos sem sincronizar, puxa em segundo plano.
2. **A cada 15 minutos:** pelo agendador do Supabase (migração `0048`).
3. **Uma vez por dia:** pelo cron da Vercel (`vercel.json`), como reserva.

Para ligar o de 15 minutos:

1. Na Vercel, configure `CRON_SECRET` (um texto aleatório longo) e `SUPABASE_SERVICE_ROLE_KEY`, e faça o Redeploy.
2. No Supabase, em **SQL Editor**, rode uma vez, trocando os valores:

   ```sql
   select vault.create_secret('https://painel-liard-xi.vercel.app/api/cron/shopee', 'sertao_cron_url');
   select vault.create_secret('O-MESMO-CRON_SECRET-DA-VERCEL', 'sertao_cron_secret');
   ```

3. Rode a migração `0048_sincronizacao_automatica.sql`. Se reclamar de `pg_cron` ou `pg_net`, habilite as duas em **Database → Extensions** e rode de novo.
4. Para conferir, use `select * from cron.job;` (o job é `sertao-shopee-sincronizar`) e `select * from cron.job_run_details order by start_time desc limit 5;`.

O segredo fica no Vault do Supabase, nunca no código.

## Estoque do Sertão nos anúncios (Fase 9.7, migração 0049)

- **Permissão:** precisa da permissão **Product** no app da Shopee. Confira em Console → App → Permissões antes do Go-Live.
- **Ligar:** em Configurações → Canais de venda, na loja conectada, clique em **Enviar estoque**. A prévia "Shopee → Sertão" mostra o que muda em cada anúncio. **Confirmar e ligar o automático** envia tudo na hora.
- **Depois de ligado:** cada venda no PDV, pedido baixado, compra recebida ou ajuste marca o anúncio como pendente. O envio acontece na hora (PDV), em toda sincronização e a cada 15 minutos.
- **Saldo enviado:** é o do armazém que tem a loja em "Lojas abastecidas". Sem armazém marcado, vai o total do produto.
- **Casamento anúncio × produto:** é feito pelo SKU, da variação ou do anúncio, ou pelo vínculo feito em Vendas → Vincular anúncios.
- **Desligar:** clique no selo "Estoque automático" da loja.
