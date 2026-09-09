import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/service-worker-register'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: BRAND.title,
  description: 'Plataforma SaaS para bots Telegram com PIX, tracking e integrações de marketing',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: BRAND.name,
  },
  icons: {
    icon: BRAND.icon,
    apple: BRAND.icon,
  },
}

export const viewport: Viewport = {
  themeColor: BRAND.themeColor,
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" data-brand={BRAND.id} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  )
}
