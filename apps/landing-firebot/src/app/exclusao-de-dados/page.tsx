import type { Metadata } from 'next'
import LegalShell from '@/components/LegalShell'

export const metadata: Metadata = {
  title: 'Exclusão de Dados — FireBot',
  description:
    'Como solicitar a exclusão dos seus dados da FireBot, incluindo os dados obtidos pela integração com o Meta (Facebook).',
  alternates: { canonical: '/exclusao-de-dados' },
}

const UPDATED = '10 de setembro de 2026'

export default function ExclusaoDeDadosPage() {
  return (
    <LegalShell title="Exclusão de Dados" updatedAt={UPDATED}>
      <p>
        Você pode solicitar a exclusão dos seus dados pessoais tratados pela <strong>FireBot</strong>{' '}
        a qualquer momento. Esta página explica como fazer isso, o que é apagado e em quanto tempo.
      </p>

      <h2>1. Como solicitar</h2>
      <p>Escolha uma das opções:</p>
      <ul>
        <li>
          <strong>Pelo painel:</strong> acesse as configurações da sua conta em{' '}
          <a href="https://app.firebot.shop">app.firebot.shop</a> e utilize a opção de encerramento
          de conta; ou
        </li>
        <li>
          <strong>Por e-mail:</strong> envie uma mensagem para{' '}
          <a href="mailto:suporte@firebot.shop">suporte@firebot.shop</a> a partir do e-mail
          cadastrado, com o assunto <em>&ldquo;Exclusão de dados&rdquo;</em>, informando o e-mail da
          conta.
        </li>
      </ul>
      <p>
        Podemos solicitar informações adicionais para confirmar sua identidade antes de concluir a
        exclusão.
      </p>

      <h2>2. Dados obtidos pelo Meta (Facebook)</h2>
      <p>
        Se você conectou sua conta do Meta (Facebook) Ads à FireBot, pode remover esse acesso de duas
        formas, com o mesmo efeito:
      </p>
      <ul>
        <li>
          Na FireBot, abra <em>Tracking → Integrações</em> e clique em <strong>Desconectar</strong>{' '}
          no perfil desejado; ou
        </li>
        <li>
          No Facebook, acesse{' '}
          <a
            href="https://www.facebook.com/settings?tab=business_tools"
            target="_blank"
            rel="noopener noreferrer"
          >
            Configurações → Integrações de empresas
          </a>{' '}
          e remova o aplicativo <strong>FireBot</strong>.
        </li>
      </ul>
      <p>
        Ao desconectar, o token de acesso é revogado e destruído imediatamente, e os dados de
        anúncios espelhados (campanhas, métricas, status) vinculados àquela conexão são eliminados em
        até <strong>30 dias</strong>.
      </p>

      <h2>3. O que é excluído ao encerrar a conta</h2>
      <ul>
        <li>Dados de cadastro (nome, e-mail, WhatsApp) e credenciais;</li>
        <li>Bots, fluxos, produtos e configurações;</li>
        <li>Tokens de dispositivos para notificação;</li>
        <li>Tokens e dados espelhados de integrações de terceiros, incluindo o Meta;</li>
        <li>Dados de rastreamento de links associados à sua conta.</li>
      </ul>

      <h2>4. O que pode ser retido</h2>
      <p>
        Alguns registros são mantidos, de forma minimizada, pelo prazo exigido por lei &ndash;
        principalmente registros de transações financeiras (obrigações fiscais e regulatórias, em
        regra 5 anos) e registros mínimos necessários para defesa em processos. Esses dados não são
        usados para nenhuma outra finalidade e são eliminados ao fim do prazo legal.
      </p>

      <h2>5. Prazo</h2>
      <p>
        Confirmada a identidade, concluímos a exclusão em até <strong>30 dias</strong> e enviamos uma
        confirmação para o e-mail cadastrado.
      </p>

      <h2>6. Contato</h2>
      <p>
        <a href="mailto:suporte@firebot.shop">suporte@firebot.shop</a> &nbsp;·&nbsp; Ana Vitoria Eloi
        Menezes Barbosa Desenvolvimento de Software Ltda &ndash; CNPJ 67.267.083/0001-50 &ndash; Rua
        Visconde do Rio Branco, 1488, Conj. 909, Centro, Curitiba/PR, CEP 80.420-210.
      </p>
    </LegalShell>
  )
}
