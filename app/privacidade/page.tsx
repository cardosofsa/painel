import type { Metadata } from "next";
import { PaginaLegal } from "@/components/legal/PaginaLegal";
import { RESPONSAVEL } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de Privacidade · SERTÃO" };

export default function PrivacidadePage() {
  return (
    <PaginaLegal titulo="Política de Privacidade" outra={{ href: "/termos", texto: "Termos de Uso" }}>
      <p className="mt-4">
        O SERTÃO é um sistema de gestão para pequenos negócios: produtos, estoque, vendas, precificação e vitrine online.
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
          próprio comprador informa ao fazer um pedido na vitrine. Quem usa o SERTÃO é o controlador desses dados; nós os
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

      <h2>4. Com quem os dados passam</h2>
      <p>Usamos prestadores para o sistema funcionar:</p>
      <ul>
        <li>Supabase: banco de dados e autenticação.</li>
        <li>Vercel: hospedagem do sistema.</li>
        <li>Google: login com Google, quando você escolhe essa opção.</li>
        <li>
          Provedor de IA (Google Gemini, OpenAI, Anthropic ou OpenRouter): só ao gerar texto. Enviamos apenas os dados do
          produto, como nome, categoria e características. Nunca enviamos dados de clientes, compradores ou vendas.
        </li>
        <li>ViaCEP: consulta de endereço a partir do CEP digitado, sem identificar a pessoa.</li>
      </ul>
      <p>
        Alguns desses prestadores têm servidores fora do Brasil; nesse caso, o tratamento segue as garantias exigidas pela
        LGPD.
      </p>

      <h2>5. Por quanto tempo guardamos</h2>
      <p>
        Enquanto a conta existir. Ao excluir a conta, os dados dela são apagados, salvo o que a lei obrigue a manter. Cópias
        de segurança do provedor de banco de dados podem levar algum tempo para desaparecer.
      </p>

      <h2>6. Seus direitos</h2>
      <p>
        Pela LGPD, você pode pedir confirmação de que tratamos seus dados, acesso, correção, exportação, anonimização ou
        exclusão, e retirar consentimentos. Se você é cliente de uma loja que usa o SERTÃO, fale primeiro com a loja; se
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
