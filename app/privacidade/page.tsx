import type { Metadata } from "next";
import { PaginaLegal } from "@/components/legal/PaginaLegal";
import { RESPONSAVEL } from "@/lib/legal";
import { captchaAtivo } from "@/lib/captcha";
import { videoDemoAtivo } from "@/lib/landing";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacidadePage() {
  return (
    <PaginaLegal titulo="Política de Privacidade" outra={{ href: "/termos", texto: "Termos de Uso" }}>
      <p className="mt-4">
        O Sertão é um sistema de gestão para pequenos negócios: produtos, estoque, vendas, precificação e vitrine online.
        Esta página explica quais dados pessoais o sistema guarda, para quê, e como você pode consultá-los ou apagá-los.
      </p>

      <h2>1. Quem é o responsável</h2>
      <p>
        {RESPONSAVEL.nome} responde pelo tratamento dos dados descritos aqui. Contato:{" "}
        <a href={`mailto:${RESPONSAVEL.email}`}>{RESPONSAVEL.email}</a>.
      </p>

      <h2>2. Que dados guardamos</h2>
      <ul>
        <li>
          <strong>Sua conta:</strong> nome e e-mail, informados no cadastro ou vindos do login com Google. Do Google
          recebemos só nome, e-mail e foto de perfil; não acessamos seus contatos, e-mails nem arquivos.
        </li>
        <li>
          <strong>Dados do seu negócio:</strong> produtos, fornecedores, estoque, vendas, compras, valores e as
          configurações que você cadastra.
        </li>
        <li>
          <strong>Dados dos seus clientes:</strong> nome, telefone/WhatsApp, e-mail e endereço que você cadastra ou que o
          próprio comprador informa ao fazer um pedido na vitrine. Quem usa o Sertão é o controlador desses dados; nós os
          guardamos em nome dessa pessoa.
        </li>
        <li>
          <strong>Chaves de IA (opcional):</strong> se você cadastrar a chave de um provedor de IA, ela é guardada
          criptografada e usada só para as gerações que você pedir.
        </li>
        <li>
          <strong>Registros técnicos:</strong> logs de erro e de segurança, sem conteúdo de vendas ou de clientes.
        </li>
      </ul>

      <h2>3. Para que usamos</h2>
      <ul>
        <li>Autenticar você e manter seus dados separados dos de outras contas.</li>
        <li>Executar as funções do sistema: registrar vendas, calcular preços, controlar estoque, exibir a vitrine.</li>
        <li>Avisar sobre estoque baixo e outras notificações dentro do sistema.</li>
        <li>Gerar títulos e descrições quando você pede o uso de IA.</li>
      </ul>
      <p>Não vendemos dados, não os compartilhamos para publicidade e não fazemos perfil comercial de ninguém.</p>

      <h2>4. Com quem os dados passam (subprocessadores)</h2>
      <p>Usamos prestadores para o sistema funcionar. Cada um recebe só o necessário para a sua parte:</p>
      <ul>
        <li>
          <strong>Supabase:</strong> banco de dados, autenticação e armazenamento de arquivos (fotos de produtos e cópias
          de segurança). É onde todos os dados da conta ficam guardados.
        </li>
        <li>
          <strong>Vercel:</strong> hospedagem do sistema e métricas de acesso e desempenho das páginas (Vercel Analytics e
          Speed Insights), agregadas e sem cookies.
        </li>
        <li>
          <strong>Google:</strong> login com Google, quando você escolhe essa opção.
        </li>
        <li>
          <strong>Google Gemini</strong> (IA do sistema) ou, se você cadastrar a sua chave, OpenAI, Anthropic ou
          OpenRouter: só quando você pede uma geração. Enviamos os dados do produto (nome, categoria, características,
          preço e custos), o texto que você digitar no pedido e, na mensagem de cobrança, apenas valores e datas das
          parcelas. Nunca enviamos nome, telefone, e-mail ou endereço de clientes e compradores.
        </li>
        <li>
          <strong>Shopee</strong> e <strong>Mercado Livre:</strong> só se você conectar a sua loja. Trocamos com eles os
          pedidos, anúncios, preços e estoque da sua própria conta no marketplace.
        </li>
        <li>
          <strong>Melhor Envio:</strong> cotação de frete, quando você ou o comprador da vitrine pede (vão os CEPs de
          origem e destino e as medidas e o valor do pacote), e geração de etiqueta, se você usar (vão também nome,
          contato, documento e endereço do remetente e do destinatário, e os itens do pacote).
        </li>
        <li>
          <strong>Focus NFe:</strong> emissão de nota fiscal, só se você ligar a integração. Vão os dados que a nota exige
          (os do seu negócio, os do comprador e os itens vendidos).
        </li>
        {captchaAtivo() && (
          <li>
            <strong>Cloudflare Turnstile:</strong> verificação anti-robô no login e no cadastro, sem pedir que você
            resolva desafios na maioria das vezes.
          </li>
        )}
        {videoDemoAtivo() && (
          <li>
            <strong>YouTube</strong> (modo sem cookies): o vídeo de demonstração da página inicial, carregado só quando
            você clica em assistir.
          </li>
        )}
        <li>ViaCEP: consulta de endereço a partir do CEP digitado, sem identificar a pessoa.</li>
      </ul>
      <p>
        Alguns desses prestadores têm servidores fora do Brasil; nesse caso, o tratamento segue as garantias exigidas pela
        LGPD.
      </p>

      <h2>5. Por quanto tempo guardamos</h2>
      <ul>
        <li>
          <strong>Dados da conta e do negócio:</strong> enquanto a conta existir. Ao excluir a conta, os dados dela são
          apagados, salvo o que a lei obrigue a manter.
        </li>
        <li>
          <strong>Cópias de segurança:</strong> uma por semana, e guardamos só as 4 mais recentes (cerca de 4 semanas);
          as mais antigas são apagadas sozinhas. As cópias internas do provedor de banco de dados seguem o prazo dele.
        </li>
        <li>
          <strong>Registros de erro:</strong> guardamos só os mais recentes (até 4.000 do servidor e 1.000 do navegador);
          os mais antigos são apagados automaticamente. Eles têm a mensagem do erro, a página, a conta logada e o IP
          embaralhado (hash), nunca o IP em si.
        </li>
      </ul>

      <h2>6. Seus direitos</h2>
      <p>
        Pela LGPD, você pode pedir confirmação de que tratamos seus dados, acesso, correção, exportação, anonimização ou
        exclusão, e retirar consentimentos. Se você é cliente de uma loja que usa o Sertão, fale primeiro com a loja; se
        preferir, escreva para o e-mail acima. Respondemos em até 15 dias.
      </p>

      <h2>7. Segurança</h2>
      <p>
        Cada conta só enxerga os próprios dados (controle de acesso no banco), a conexão é criptografada e as chaves de
        provedores de IA ficam cifradas. Nenhum sistema é totalmente livre de riscos; em caso de incidente relevante,
        avisaremos os afetados.
      </p>

      <h2>8. Mudanças</h2>
      <p>Se esta política mudar, a data no topo é atualizada. Mudanças importantes serão avisadas no sistema.</p>
    </PaginaLegal>
  );
}
