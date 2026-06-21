'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Command,
  LayoutDashboard,
  BarChart3,
  Receipt,
  Users,
  BookOpen,
  Handshake,
  Bot,
  GitBranch,
  Link,
  Megaphone,
  Wrench,
  Plug,
  QrCode,
  Activity,
  CreditCard,
  Webhook,
  Settings,
  Search,
  ArrowRight,
} from 'lucide-react'

const items = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard', category: 'Principal' },
  { icon: BarChart3, label: 'Análises', href: '/dashboard/analytics', category: 'Principal' },
  { icon: Receipt, label: 'Financeiro', href: '/dashboard/financeiro/transacoes', category: 'Financeiro' },
  { icon: Users, label: 'Clientes', href: '/dashboard/clientes/leads', category: 'Clientes' },
  { icon: BookOpen, label: 'Aulas', href: '/dashboard/aulas/tutoriais', category: 'Conteúdo' },
  { icon: Handshake, label: 'Afiliado', href: '/dashboard/afiliado/comissoes', category: 'Afiliado' },
  { icon: Bot, label: 'Meus Robôs', href: '/dashboard/automacoes/robos', category: 'Automações' },
  { icon: GitBranch, label: 'Meus Fluxos', href: '/dashboard/automacoes/fluxos', category: 'Automações' },
  { icon: Link, label: 'Redirecionadores', href: '/dashboard/redirecionadores/links', category: 'Tráfego' },
  { icon: Megaphone, label: 'Remarketing', href: '/dashboard/remarketing/campanhas', category: 'Tráfego' },
  { icon: Wrench, label: 'Utilitários', href: '/dashboard/ferramentas/utilitarios', category: 'Ferramentas' },
  { icon: Plug, label: 'Integrações', href: '/dashboard/ferramentas/integracoes', category: 'Ferramentas' },
  { icon: QrCode, label: 'Pagamentos Pix', href: '/dashboard/ferramentas/pix', category: 'Ferramentas' },
  { icon: Activity, label: 'Trackeamento', href: '/dashboard/ferramentas/tracking', category: 'Ferramentas' },
  { icon: CreditCard, label: 'Checkout', href: '/dashboard/ferramentas/checkout', category: 'Ferramentas' },
  { icon: Webhook, label: 'Webhooks', href: '/dashboard/ferramentas/webhooks', category: 'Ferramentas' },
  { icon: Settings, label: 'Configurações', href: '/settings', category: 'Conta' },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setSelected(0)
    }
  }, [open])

  const filtered = query
    ? items.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : items

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router]
  )

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (s + 1) % filtered.length)
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (s - 1 + filtered.length) % filtered.length)
    }
    if (e.key === 'Enter' && filtered[selected]) {
      handleSelect(filtered[selected].href)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-[#161616] border border-[#2A2A2A] rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-[#2A2A2A]">
          <Search className="h-4 w-4 text-[#666666]" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Pesquisar páginas e ações..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={handleKey}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-[#666666] outline-none"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E1E1E] border border-[#2A2A2A] text-[#666666]">
            ESC
          </kbd>
        </div>
        <div className="max-h-72 overflow-y-auto scrollbar-thin py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[#666666]">
              Nenhum resultado encontrado
            </div>
          )}
          {filtered.map((item, index) => {
            const Icon = item.icon
            return (
              <button
                key={item.href}
                onClick={() => handleSelect(item.href)}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors',
                  selected === index
                    ? 'bg-[#1E1E1E] text-white'
                    : 'text-[#B3B3B3] hover:text-white hover:bg-[#1E1E1E]'
                )}
                onMouseEnter={() => setSelected(index)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] text-[#666666]">{item.category}</span>
                {selected === index && <ArrowRight className="h-3.5 w-3.5 text-[#E50914]" />}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-4 px-4 h-10 border-t border-[#2A2A2A] text-[10px] text-[#666666]">
          <span><kbd className="px-1 py-0.5 rounded bg-[#1E1E1E] border border-[#2A2A2A]">↑↓</kbd> Navegar</span>
          <span><kbd className="px-1 py-0.5 rounded bg-[#1E1E1E] border border-[#2A2A2A]">↵</kbd> Abrir</span>
          <span><kbd className="px-1 py-0.5 rounded bg-[#1E1E1E] border border-[#2A2A2A]">ESC</kbd> Fechar</span>
        </div>
      </div>
    </div>
  )
}
