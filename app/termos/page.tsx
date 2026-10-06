import type { Metadata } from "next";
import Link from "next/link";
import { PaginaLegal } from "@/components/legal/PaginaLegal";
import { RESPONSAVEL } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermosPage() {
  return (
    <PaginaLegal titulo="Termos de Uso" outra={{ href: "/privacidade", texto: "Política de Privacidade" }}>
      <p className="mt-4">
        Ao criar uma conta ou usar o Sertão, você concorda com estes termos. Se não concordar, não use o sistema.
      </p>

      <h2>1. O que é o Sertão</h2>
      <p>
        Um sistema online de gestão para pequenos negócios: cadastro de produtos, estoque, vendas, precificação, vitrine
        online e recursos opcionais de IA.
      </p>

      <h2>2. Sua conta</h2>
      <ul>
        <li>Você informa dados verdadeiros e mantém sua senha em segurança; o que for feito na conta é de sua responsabilidade.</li>
        <li>Novas contas passam por aprovação, e o acesso pode ser limitado, suspenso ou encerrado em caso de uso indevido.</li>
        <li>Você pode parar de usar e pedir a exclusão da conta a qualquer momento.</li>
      </ul>

      <h2>3. Seus dados e os de seus clientes</h2>
      <p>
        Os dados que você cadastra continuam sendo seus. Você é responsável por ter o direito de cadastrar os dados de
        clientes e fornecedores e por tratá-los conforme a LGPD. Veja a{" "}
        <Link href="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>4. Uso aceitável</h2>
      <ul>
        <li>Não usar o sistema para atividade ilegal, fraude ou para vender o que a lei proíbe.</li>
        <li>Não tentar acessar dados de outras contas, burlar limites ou sobrecarregar o serviço.</li>
        <li>Não publicar na vitrine conteúdo ilegal, ofensivo ou que infrinja direitos de terceiros.</li>
      </ul>

      <h2>5. Recursos de IA</h2>
      <p>
        A IA gera sugestões de texto que podem conter erros; revise antes de publicar. O sistema oferece um teste grátis
        limitado da IA do sistema. Para uso contínuo, você pode cadastrar a sua própria chave de um provedor e pagar
        diretamente a ele o que usar.
      </p>

      <h2>6. Cálculos e valores</h2>
      <p>
        Preços, margens, taxas e comissões calculados pelo sistema dependem das informações que você cadastra e das regras
        de cada plataforma, que mudam. Confira os valores antes de tomar decisões; o Sertão é uma ferramenta de apoio, não
        consultoria contábil ou fiscal.
      </p>

      <h2>7. Disponibilidade e responsabilidade</h2>
      <p>
        Trabalhamos para manter o sistema no ar e seguro, mas ele é fornecido no estado em que se encontra, sem garantia de
        funcionamento ininterrupto. Na extensão permitida em lei, não respondemos por lucros cessantes ou perdas indiretas
        decorrentes do uso ou da indisponibilidade do sistema.
      </p>

      <h2>8. Mudanças e contato</h2>
      <p>
        Podemos atualizar estes termos, e a data no topo indica a versão vigente. Dúvidas:{" "}
        <a href={`mailto:${RESPONSAVEL.email}`}>{RESPONSAVEL.email}</a>. Estes termos seguem a lei brasileira.
      </p>
    </PaginaLegal>
  );
}
