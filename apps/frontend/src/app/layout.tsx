import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FireBot - Plataforma de Automação',
  description: 'Plataforma SaaS para bots Telegram com PIX, tracking e integrações de marketing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
