import type { Metadata } from 'next'
import LegalShell from '@/components/LegalShell'

export const metadata: Metadata = {
  title: 'Termos de Uso — FireBot',
  description:
    'Termos e condições de uso da plataforma FireBot de automação de vendas no Telegram.',
  alternates: { canonical: '/termos' },
}

const UPDATED = '10 de setembro de 2026'

export default function TermosPage() {
  return (
    <LegalShell title="Termos de Uso" updatedAt={UPDATED}>
      <p>
        Estes Termos de Uso (&ldquo;Termos&rdquo;) regem o acesso e a utilização da plataforma
        <strong> FireBot</strong>, operada por <strong>Ana Vitoria Eloi Menezes Barbosa
        Desenvolvimento de Software Ltda</strong>, CNPJ <strong>67.267.083/0001-50</strong>, com sede
        na Rua Visconde do Rio Branco, 1488, Conj. 909, Centro, Curitiba/PR, CEP 80.420-210
        (&ldquo;FireBot&rdquo;, &ldquo;nós&rdquo;). Ao criar uma conta ou usar a plataforma, você
        declara ter lido e concordado com estes Termos e com a{' '}
        <a href="/politica">Política de Privacidade</a>.
      </p>

      <h2>1. Descrição do serviço</h2>
      <p>
        A FireBot é uma plataforma de software como serviço (SaaS) que permite criar e operar bots de
        vendas no Telegram, com fluxos de mensagens automatizados, recebimento de pagamentos via PIX
        por meio de adquirentes integrados, remarketing, encurtamento e redirecionamento de links,
        relatórios de desempenho e, opcionalmente, integração com contas de anúncio do Meta
        (Facebook) Ads para acompanhamento e gestão de campanhas.
      </p>

      <h2>2. Cadastro e conta</h2>
      <ul>
        <li>Você deve ser maior de 18 anos e fornecer informações verdadeiras e atualizadas;</li>
        <li>Você é responsável por manter a confidencialidade das suas credenciais e por toda atividade realizada na sua conta;</li>
        <li>Uma conta é pessoal e intransferível. Avise-nos imediatamente em caso de uso não autorizado.</li>
      </ul>

      <h2>3. Planos, cobrança e reembolso</h2>
      <ul>
        <li>
          O uso de recursos pagos está sujeito ao plano contratado e aos preços vigentes exibidos na
          plataforma;
        </li>
        <li>
          Salvo disposição em contrário, as assinaturas são renovadas automaticamente pelo mesmo
          período, podendo ser canceladas a qualquer momento, com efeito ao fim do ciclo já pago;
        </li>
        <li>
          O direito de arrependimento para compras realizadas fora do estabelecimento comercial
          observa o art. 49 do Código de Defesa do Consumidor (7 dias);
        </li>
        <li>
          Valores de vendas processadas em favor do usuário são repassados conforme as regras de
          liquidação e prazos da adquirente e do plano.
        </li>
      </ul>

      <h2>4. Uso aceitável</h2>
      <p>Ao usar a FireBot, você concorda em não:</p>
      <ul>
        <li>Violar leis, direitos de terceiros ou os termos do Telegram, do Meta ou das adquirentes de pagamento;</li>
        <li>Comercializar produtos ou conteúdos ilícitos, enganosos, falsificados, ou que violem propriedade intelectual;</li>
        <li>Praticar spam, phishing, fraude, lavagem de dinheiro ou uso indevido de dados de terceiros;</li>
        <li>Enviar mensagens em massa sem base legal ou consentimento adequado;</li>
        <li>Tentar burlar limites técnicos, realizar engenharia reversa, sobrecarregar ou comprometer a segurança da plataforma;</li>
        <li>Usar a plataforma para conteúdo que explore, sexualize ou coloque em risco menores de idade.</li>
      </ul>
      <p>
        O descumprimento pode levar à suspensão ou ao encerramento imediato da conta, sem prejuízo
        das medidas legais cabíveis.
      </p>

      <h2>5. Conteúdo e responsabilidade do usuário</h2>
      <p>
        Você é o único responsável pelos bots, mensagens, produtos, ofertas, campanhas e demais
        conteúdos que cria e veicula por meio da FireBot, bem como pelo cumprimento das obrigações
        fiscais, consumeristas e publicitárias aplicáveis ao seu negócio. A FireBot não revisa
        previamente o conteúdo dos usuários e não é responsável por ele.
      </p>

      <h2>6. Integrações de terceiros</h2>
      <p>
        A plataforma se integra a serviços de terceiros (Telegram, Meta, adquirentes de pagamento,
        provedores de nuvem e notificação). O uso desses serviços está sujeito aos termos e políticas
        próprios de cada um. A FireBot não responde por indisponibilidades, alterações de API,
        bloqueios ou decisões desses terceiros. A conexão com o Meta Ads é opcional e pode ser
        revogada por você a qualquer momento.
      </p>

      <h2>7. Propriedade intelectual</h2>
      <p>
        O software, a marca, o layout e a documentação da FireBot são de titularidade da FireBot ou
        de seus licenciantes. Estes Termos não transferem qualquer direito de propriedade
        intelectual, apenas concedem uma licença limitada, não exclusiva e revogável de uso da
        plataforma enquanto vigente a contratação. O conteúdo que você cria permanece seu.
      </p>

      <h2>8. Isenção de garantias</h2>
      <p>
        A plataforma é fornecida &ldquo;no estado em que se encontra&rdquo;. Empregamos esforços
        razoáveis para manter o serviço disponível e seguro, mas não garantimos operação
        ininterrupta, ausência de erros ou resultados comerciais específicos.
      </p>

      <h2>9. Limitação de responsabilidade</h2>
      <p>
        Na máxima extensão permitida pela lei, a responsabilidade da FireBot por danos relacionados
        ao uso da plataforma fica limitada ao valor pago por você nos 12 meses anteriores ao evento.
        A FireBot não responde por lucros cessantes, perda de dados decorrente de fatores fora do seu
        controle, ou por atos de terceiros. Nada nestes Termos exclui responsabilidades que não podem
        ser afastadas por lei, especialmente em relações de consumo.
      </p>

      <h2>10. Suspensão e encerramento</h2>
      <p>
        Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar o acesso em
        caso de violação destes Termos, risco à segurança, exigência legal ou inadimplência. Após o
        encerramento, os dados são tratados conforme a{' '}
        <a href="/politica">Política de Privacidade</a> e a página de{' '}
        <a href="/exclusao-de-dados">Exclusão de Dados</a>.
      </p>

      <h2>11. Alterações dos Termos</h2>
      <p>
        Podemos alterar estes Termos. Alterações relevantes serão comunicadas com antecedência
        razoável pelos canais da plataforma. O uso continuado após a vigência da nova versão implica
        concordância.
      </p>

      <h2>12. Lei aplicável e foro</h2>
      <p>
        Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca de Curitiba/PR
        para dirimir controvérsias, ressalvado o direito do consumidor de propor ação no foro de seu
        domicílio.
      </p>

      <h2>13. Contato</h2>
      <p>
        Dúvidas sobre estes Termos: <a href="mailto:suporte@firebot.shop">suporte@firebot.shop</a>.
      </p>
    </LegalShell>
  )
}
