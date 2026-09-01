import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'FireBot — Automação de vendas no Telegram',
  description:
    'Crie bots de venda no Telegram em minutos: fluxos automatizados, PIX integrado, remarketing e métricas em tempo real. Tudo em uma plataforma só.',
  metadataBase: new URL('https://firebot.shop'),
  openGraph: {
    title: 'FireBot — Automação de vendas no Telegram',
    description:
      'Crie bots de venda no Telegram em minutos: fluxos automatizados, PIX integrado, remarketing e métricas em tempo real.',
    url: 'https://firebot.shop',
    siteName: 'FireBot',
    locale: 'pt_BR',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
