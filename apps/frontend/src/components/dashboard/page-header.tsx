'use client'

import { useRouter, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, Home } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href: string
}

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: BreadcrumbItem[]
  children?: React.ReactNode
}

const breadcrumbMap: Record<string, { label: string; parent?: string; group?: string }> = {
  '/dashboard': { label: 'Dashboard' },
  '/dashboard/analytics': { label: 'Análises', parent: '/dashboard' },
  '/dashboard/financeiro/transacoes': { label: 'Transações', group: 'Financeiro', parent: '/dashboard' },
  '/dashboard/clientes/leads': { label: 'Leads', group: 'Clientes', parent: '/dashboard' },
  '/dashboard/aulas/tutoriais': { label: 'Tutoriais', group: 'Aulas', parent: '/dashboard' },
  '/dashboard/afiliado/comissoes': { label: 'Comissões', group: 'Afiliado', parent: '/dashboard' },
  '/dashboard/automacoes/robos': { label: 'Robôs', group: 'Automações', parent: '/dashboard' },
  '/dashboard/automacoes/fluxos': { label: 'Fluxos', group: 'Automações', parent: '/dashboard' },
  '/dashboard/redirecionadores/links': { label: 'Links', group: 'Redirecionadores', parent: '/dashboard' },
  '/dashboard/remarketing/campanhas': { label: 'Campanhas', group: 'Remarketing', parent: '/dashboard' },
  '/dashboard/ferramentas/utilitarios': { label: 'Utilitários', group: 'Ferramentas', parent: '/dashboard' },
  '/dashboard/ferramentas/integracoes': { label: 'Integrações', group: 'Ferramentas', parent: '/dashboard' },
  '/dashboard/ferramentas/pix': { label: 'PIX', group: 'Ferramentas', parent: '/dashboard' },
  '/dashboard/ferramentas/tracking': { label: 'Tracking', group: 'Ferramentas', parent: '/dashboard' },
  '/dashboard/ferramentas/checkout': { label: 'Checkout', group: 'Ferramentas', parent: '/dashboard' },
  '/dashboard/ferramentas/webhooks': { label: 'Webhooks', group: 'Ferramentas', parent: '/dashboard' },
}

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const info = breadcrumbMap[pathname]
  if (!info) return [{ label: 'Dashboard', href: '/dashboard' }]

  const items: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/dashboard' }]

  if (info.group) {
    items.push({ label: info.group, href: info.parent || '/dashboard' })
  }

  items.push({ label: info.label, href: pathname })

  return items
}

export function getParentPath(pathname: string): string {
  const info = breadcrumbMap[pathname]
  if (info?.parent) return info.parent
  if (pathname === '/dashboard') return '/dashboard'
  const segments = pathname.split('/').filter(Boolean)
  segments.pop()
  return '/' + segments.join('/') || '/dashboard'
}

export function PageHeader({ title, description, breadcrumbs, children }: PageHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()

  const resolvedBreadcrumbs = breadcrumbs || getBreadcrumbs(pathname)

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(getParentPath(pathname))
    }
  }

  return (
    <div className="mb-6 space-y-3">
      <button
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-sm text-[#B3B3B3] hover:text-white transition-colors group"
      >
        <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Voltar
      </button>

      <nav className="flex items-center gap-1.5 text-xs text-[#666666]">
        <Link href="/dashboard" className="hover:text-[#E50914] transition-colors">
          <Home className="h-3.5 w-3.5" />
        </Link>
        {resolvedBreadcrumbs.map((item, index) => {
          const isLast = index === resolvedBreadcrumbs.length - 1
          return (
            <span key={item.href} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3" />
              {isLast ? (
                <span className="text-white font-medium">{item.label}</span>
              ) : (
                <Link href={item.href} className="hover:text-[#E50914] transition-colors">
                  {item.label}
                </Link>
              )}
            </span>
          )
        })}
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          {description && <p className="text-sm text-[#666666] mt-1">{description}</p>}
        </div>
        {children && <div className="flex items-center gap-3 shrink-0">{children}</div>}
      </div>
    </div>
  )
}
