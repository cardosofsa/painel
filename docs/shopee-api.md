# Shopee — importação e API oficial

## Hoje: planilha (já funciona com a migração 0046)

1. Na Central do Vendedor da loja, vá em **Meus Pedidos → Exportar**. Escolha o período e baixe o `.xlsx`.
2. No SERTÃO, abra **Vendas → aba Shopee → Importar planilha da Shopee**, escolha a loja e o arquivo.
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
   | `SHOPEE_AMBIENTE` | opcional: `teste` para o sandbox |

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
