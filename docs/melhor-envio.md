# Frete com Melhor Envio

O Sertão cota frete e compra etiquetas pela conta do lojista no Melhor Envio (Fase 10.6).

## Ligar

1. Aplique a migração `0055_frete.sql` no Supabase (duas vezes).
2. Confira as variáveis de ambiente:
   - `IA_CHAVE_COFRE` (já usada pela IA): cifra o token e assina as cotações da vitrine;
   - `SUPABASE_SERVICE_ROLE_KEY` (já usada pelo cron): a vitrine pública lê as regras de frete do dono do catálogo.
3. Gere o token no Melhor Envio:
   1. Abra `melhorenvio.com.br` (ou `sandbox.melhorenvio.com.br` para testar).
   2. Vá em **Configurações → Permissões de acesso → Gerar novo token**.
   3. Marque estas permissões:
      - `shipping-calculate`
      - `cart-read` e `cart-write`
      - `shipping-checkout`
      - `shipping-generate`
      - `shipping-print`
      - `orders-read`
      - `balance-read`
4. Cole o token **só** em **Sertão → Configurações → Frete**. Ali também ficam:
   - o ambiente (sandbox ou produção);
   - o CEP de origem;
   - o acréscimo por envio;
   - o valor a partir do qual o frete é grátis;
   - "Cotar frete no checkout da vitrine".

   Nunca cole o token em conversas ou e-mails.
5. Em **Testar cotação**, cote um CEP e marque os serviços aceitos. Nenhum marcado = todos.

## Onde aparece

- **Vitrine:** no checkout, com o CEP preenchido, o cliente calcula e escolhe o frete.
  - O servidor assina a opção escolhida, então o valor não pode ser alterado pelo navegador.
  - O frete entra no pedido e vira o valor da entrega ao aprovar.
- **PDV:** em Entrega → informar o CEP → Cotar → escolher a opção. O valor vai para a entrega.
- **Vendas:** no menu da linha, **Comprar etiqueta (Melhor Envio)**.
  - Cobra do **saldo** da conta do Melhor Envio.
  - Grava o rastreio e abre a etiqueta para imprimir.
  - O remetente é o endereço da empresa (Configurações → Conta). O destinatário é o cadastro do cliente ou, se não houver, o endereço do pedido da vitrine.

## Pacote

- O peso e as medidas vêm do cadastro do produto (Produtos → Envio).
- No pacote:
  - os itens são empilhados, então as alturas se somam;
  - a base é a maior largura e o maior comprimento;
  - os pesos se somam.
- Produto sem medida usa uma caixinha padrão (300 g, 16×11×4 cm), e a tela avisa.

## Outro provedor

`lib/frete/tipos.ts` define `ProvedorFrete`. O SuperFrete entra implementando a mesma interface ao lado de `melhor-envio.ts`, sem mexer nas telas.
