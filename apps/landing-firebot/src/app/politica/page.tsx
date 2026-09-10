import type { Metadata } from 'next'
import LegalShell from '@/components/LegalShell'

export const metadata: Metadata = {
  title: 'Política de Privacidade — FireBot',
  description:
    'Como a FireBot coleta, usa, compartilha e protege os dados dos usuários da plataforma, incluindo a integração com o Meta (Facebook) Ads.',
  alternates: { canonical: '/politica' },
}

const UPDATED = '10 de setembro de 2026'

export default function PoliticaPage() {
  return (
    <LegalShell title="Política de Privacidade" updatedAt={UPDATED}>
      <p>
        Esta Política de Privacidade descreve como a <strong>FireBot</strong> trata os dados
        pessoais de seus usuários e visitantes, em conformidade com a Lei nº 13.709/2018 (Lei
        Geral de Proteção de Dados &ndash; LGPD) e com as políticas das plataformas com as quais a
        FireBot se integra, incluindo o Meta (Facebook e Instagram).
      </p>

      <h2>1. Quem é o controlador dos dados</h2>
      <p>
        A plataforma FireBot é operada por <strong>Ana Vitoria Eloi Menezes Barbosa Desenvolvimento
        de Software Ltda</strong>, inscrita no CNPJ sob o nº <strong>67.267.083/0001-50</strong>, com
        sede na Rua Visconde do Rio Branco, 1488, Conj. 909, Andar 09, Cond. Universe Life Square,
        Bloco Com., Centro, Curitiba/PR, CEP 80.420-210 (&ldquo;FireBot&rdquo;, &ldquo;nós&rdquo;).
      </p>
      <p>
        Para qualquer assunto relacionado a esta Política ou ao tratamento dos seus dados, incluindo
        o exercício de direitos, entre em contato pelo e-mail{' '}
        <a href="mailto:suporte@firebot.shop">suporte@firebot.shop</a>.
      </p>

      <h2>2. O que é a FireBot</h2>
      <p>
        A FireBot é uma plataforma de automação de vendas no Telegram. Com ela, o usuário cria bots
        que conduzem fluxos de mensagens automatizados, recebe pagamentos via PIX através de
        adquirentes integrados, faz remarketing e acompanha métricas de desempenho. Opcionalmente, o
        usuário pode conectar suas contas de anúncio do Meta (Facebook) Ads para acompanhar o
        retorno dos investimentos em tráfego.
      </p>

      <h2>3. Dados que coletamos</h2>

      <h3>3.1. Dados de cadastro e conta</h3>
      <ul>
        <li>Nome, e-mail e número de WhatsApp informados no cadastro;</li>
        <li>Senha, armazenada apenas de forma cifrada (hash), nunca em texto puro;</li>
        <li>Dados de autenticação e segurança (data de acesso, tokens de sessão, verificação em duas etapas quando ativada).</li>
      </ul>

      <h3>3.2. Dados de uso da plataforma</h3>
      <ul>
        <li>Bots, fluxos de mensagens, produtos, ofertas e configurações que você cria;</li>
        <li>Registros de operação (logs) necessários para funcionamento, suporte e segurança.</li>
      </ul>

      <h3>3.3. Dados de transações (PIX)</h3>
      <p>
        Quando um bot processa uma venda, tratamos dados da transação &ndash; valor, status, data,
        identificadores de cobrança e, quando fornecidos pelo pagador, nome e documento (CPF/CNPJ). O
        processamento financeiro é feito pelas instituições adquirentes de pagamento contratadas; a
        FireBot atua como intermediária tecnológica.
      </p>

      <h3>3.4. Dados de rastreamento de links e atribuição</h3>
      <p>
        Ao utilizar os links de redirecionamento da FireBot, coletamos, no momento do clique:
        endereço IP, informações do dispositivo/navegador (user-agent), parâmetros de campanha (como
        <em> utm_source</em>, <em>utm_campaign</em>, <em>fbclid</em>, <em>ttclid</em>) e data/hora.
        Esses dados são usados para atribuir cada venda à origem que a gerou, calcular retorno sobre
        investimento e proteger contra fraude e abuso.
      </p>

      <h3>3.5. Dados da integração com o Meta (Facebook) Ads</h3>
      <p>
        A conexão com o Meta é <strong>opcional</strong> e feita pelo próprio usuário, via login
        oficial do Facebook. Quando conectada, com base nas permissões que você concede
        (<em>ads_read</em>, <em>ads_management</em>, <em>business_management</em>), acessamos e
        armazenamos:
      </p>
      <ul>
        <li>Token de acesso do Facebook, armazenado de forma <strong>cifrada</strong>;</li>
        <li>Identificação básica do perfil que autorizou (ID e nome), apenas para exibir qual conta está conectada;</li>
        <li>Lista de contas de anúncio, negócios (Business Manager) e seu status;</li>
        <li>Estrutura das campanhas, conjuntos de anúncios e anúncios (nomes, status, orçamentos);</li>
        <li>Métricas de desempenho dos anúncios (investimento, impressões, cliques, CPC, CPM, CTR);</li>
        <li>Quando você o solicita pelo painel, executamos ações de gerenciamento nas suas campanhas (pausar, ativar, alterar orçamento, duplicar).</li>
      </ul>
      <p>
        <strong>Não</strong> acessamos mensagens privadas, listas de contatos, listas de públicos
        personalizados, dados pessoais de usuários finais do Facebook nem publicamos qualquer
        conteúdo em seu nome. Os dados do Meta são usados exclusivamente para fornecer os relatórios
        e as funções de gestão de anúncios dentro da sua própria conta FireBot.
      </p>

      <h3>3.6. Notificações e cookies</h3>
      <ul>
        <li>
          Se você usa o aplicativo móvel ou ativa notificações no navegador, armazenamos o
          identificador (token) do dispositivo para envio de alertas de vendas;
        </li>
        <li>
          Usamos cookies e armazenamento local estritamente necessários para autenticação e
          preferências do painel. O site institucional não usa cookies de publicidade.
        </li>
      </ul>

      <h2>4. Para que usamos os dados e com que base legal</h2>
      <table>
        <thead>
          <tr>
            <th>Finalidade</th>
            <th>Base legal (LGPD)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Criar e manter sua conta e prestar o serviço contratado</td>
            <td>Execução de contrato (art. 7º, V)</td>
          </tr>
          <tr>
            <td>Processar pagamentos e repasses</td>
            <td>Execução de contrato e obrigação legal/regulatória</td>
          </tr>
          <tr>
            <td>Atribuição de vendas, relatórios e prevenção a fraudes</td>
            <td>Legítimo interesse (art. 7º, IX)</td>
          </tr>
          <tr>
            <td>Integração e exibição de dados do Meta Ads</td>
            <td>Consentimento ao conectar a conta (art. 7º, I) e execução de contrato</td>
          </tr>
          <tr>
            <td>Comunicações operacionais e de suporte</td>
            <td>Execução de contrato e legítimo interesse</td>
          </tr>
          <tr>
            <td>Cumprimento de obrigações legais, fiscais e ordens de autoridades</td>
            <td>Obrigação legal (art. 7º, II)</td>
          </tr>
        </tbody>
      </table>

      <h2>5. Com quem compartilhamos</h2>
      <p>Compartilhamos dados apenas na medida necessária, com:</p>
      <ul>
        <li>
          <strong>Meta Platforms, Inc.</strong> &ndash; quando você conecta o Facebook Ads, para
          leitura de dados e execução das ações que você solicita, por meio da API oficial;
        </li>
        <li>
          <strong>Instituições adquirentes de pagamento</strong> &ndash; para gerar e liquidar
          cobranças PIX;
        </li>
        <li>
          <strong>Telegram</strong> &ndash; para operação dos bots que você cria;
        </li>
        <li>
          <strong>Provedores de infraestrutura e envio de notificações</strong> (hospedagem em nuvem
          e Google Firebase / Apple Push Notification service) &ndash; para operar a plataforma e
          entregar notificações;
        </li>
        <li>
          <strong>Autoridades públicas</strong> &ndash; quando exigido por lei ou ordem judicial.
        </li>
      </ul>
      <p>A FireBot não vende dados pessoais.</p>

      <h2>6. Transferência internacional</h2>
      <p>
        Alguns dos provedores acima (por exemplo, Meta, Google e serviços de nuvem) estão localizados
        fora do Brasil. Nesses casos, a transferência é feita com base nas hipóteses da LGPD e
        mediante salvaguardas contratuais adequadas.
      </p>

      <h2>7. Por quanto tempo guardamos</h2>
      <ul>
        <li>Dados de conta: enquanto a conta estiver ativa;</li>
        <li>Dados do Meta: até você desconectar a integração ou encerrar a conta &ndash; a partir daí são eliminados em até 30 dias;</li>
        <li>Registros de transações financeiras: pelo prazo exigido pela legislação fiscal e regulatória (em regra, 5 anos);</li>
        <li>Logs de segurança: até 12 meses.</li>
      </ul>

      <h2>8. Seus direitos</h2>
      <p>Nos termos da LGPD, você pode a qualquer momento solicitar:</p>
      <ul>
        <li>Confirmação da existência de tratamento e acesso aos dados;</li>
        <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;</li>
        <li>Portabilidade;</li>
        <li>Eliminação dos dados tratados com base no consentimento;</li>
        <li>Informação sobre com quem compartilhamos seus dados;</li>
        <li>Revogação do consentimento.</li>
      </ul>
      <p>
        Para exercer qualquer desses direitos, escreva para{' '}
        <a href="mailto:suporte@firebot.shop">suporte@firebot.shop</a>. Para apagar seus dados, veja
        também a página <a href="/exclusao-de-dados">Exclusão de Dados</a>.
      </p>

      <h2>9. Segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo criptografia
        de senhas e de tokens de terceiros, controle de acesso, segregação de ambientes e
        monitoramento. Nenhum sistema é totalmente imune a incidentes; em caso de incidente de
        segurança relevante, comunicaremos os titulares e a Autoridade Nacional de Proteção de Dados
        (ANPD) conforme a lei.
      </p>

      <h2>10. Alterações desta Política</h2>
      <p>
        Podemos atualizar esta Política periodicamente. A data de &ldquo;Última atualização&rdquo; no
        topo indica a versão vigente. Alterações relevantes serão comunicadas pelos canais da
        plataforma.
      </p>

      <h2>11. Contato e Encarregado (DPO)</h2>
      <p>
        Encarregado pelo Tratamento de Dados Pessoais: Ana Vitoria Eloi Menezes Barbosa.
        <br />
        E-mail: <a href="mailto:suporte@firebot.shop">suporte@firebot.shop</a>
        <br />
        Endereço: Rua Visconde do Rio Branco, 1488, Conj. 909, Centro, Curitiba/PR, CEP 80.420-210.
      </p>
    </LegalShell>
  )
}
