'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ArrowRight } from 'lucide-react'

const APP_URL = 'https://app.firebot.shop'

const LINKS = [
  { href: '#recursos', label: 'Recursos' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#depoimentos', label: 'Depoimentos' },
  { href: '#faq', label: 'FAQ' },
]

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen ? 'bg-[#080808]/80 backdrop-blur-xl border-b border-white/[0.06]' : 'bg-transparent'
      }`}
    >
      <div className="container flex items-center justify-between h-16 md:h-20">
        <a href="#top" className="flex items-center shrink-0">
          <Image src="/logo.png" alt="FireBot" width={130} height={26} priority className="h-6 md:h-7 w-auto object-contain" />
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <a href={`${APP_URL}/auth/login`} className="text-sm text-white/70 hover:text-white transition-colors px-3 py-2">
            Entrar
          </a>
          <a
            href={`${APP_URL}/auth/register`}
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark px-4 py-2.5 rounded-[6px] transition-all shadow-[0_0_20px_-6px_rgba(229,9,20,0.6)] hover:shadow-[0_0_28px_-4px_rgba(229,9,20,0.8)]"
          >
            Começar agora
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="md:hidden text-white p-2 -mr-2"
          aria-label="Menu"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="md:hidden overflow-hidden bg-[#080808]/95 backdrop-blur-xl border-b border-white/[0.06]"
          >
            <div className="container py-5 flex flex-col gap-4">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="text-sm text-white/70 hover:text-white transition-colors"
                >
                  {l.label}
                </a>
              ))}
              <div className="flex flex-col gap-3 pt-2 border-t border-white/[0.06]">
                <a href={`${APP_URL}/auth/login`} className="text-sm text-white/70 hover:text-white transition-colors">
                  Entrar
                </a>
                <a
                  href={`${APP_URL}/auth/register`}
                  className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-primary px-4 py-3 rounded-[6px]"
                >
                  Começar agora <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
