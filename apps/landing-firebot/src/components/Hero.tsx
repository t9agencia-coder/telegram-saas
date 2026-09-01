'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowRight, PlayCircle, Sparkles } from 'lucide-react'

const APP_URL = 'https://app.firebot.shop'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] },
  }),
}

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-36 pb-24 md:pt-48 md:pb-32 hero-glow noise">
      {/* Glow orbs animados no fundo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/20 blur-[120px]"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute top-1/3 right-[8%] w-64 h-64 rounded-full bg-primary/10 blur-[100px] animate-float" />
      </div>

      <div className="container relative flex flex-col items-center text-center">
        <motion.div
          initial="hidden"
          animate="show"
          custom={0}
          variants={fadeUp}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-white/70 mb-8"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Automação de vendas no Telegram
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="show"
          custom={1}
          variants={fadeUp}
          className="text-balance font-black text-white leading-[1.05] tracking-tight"
          style={{ fontSize: 'clamp(2.25rem, 6vw, 4.5rem)' }}
        >
          Transforme conversas do{' '}
          <span className="relative inline-block">
            <span className="relative z-10 text-primary">Telegram</span>
            <span className="absolute inset-x-0 bottom-1 h-3 bg-primary/20 blur-sm rounded-full" />
          </span>{' '}
          em vendas no automático
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="show"
          custom={2}
          variants={fadeUp}
          className="text-balance mt-6 max-w-2xl text-base md:text-lg text-white/60 leading-relaxed"
        >
          Monte fluxos de venda, receba via PIX, recupere carrinho com remarketing e acompanhe tudo em tempo
          real — sem escrever uma linha de código.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="show"
          custom={3}
          variants={fadeUp}
          className="mt-10 flex flex-col sm:flex-row items-center gap-4"
        >
          <a
            href={`${APP_URL}/auth/register`}
            className="group inline-flex items-center gap-2 text-sm md:text-base font-semibold text-white bg-primary hover:bg-primary-dark px-7 py-3.5 rounded-[8px] transition-all shadow-[0_0_30px_-8px_rgba(229,9,20,0.7)] hover:shadow-[0_0_40px_-4px_rgba(229,9,20,0.9)] hover:-translate-y-0.5"
          >
            Começar gratuitamente
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="#como-funciona"
            className="inline-flex items-center gap-2 text-sm md:text-base font-medium text-white/80 hover:text-white px-6 py-3.5 rounded-[8px] border border-white/10 hover:border-white/20 hover:bg-white/[0.03] transition-all"
          >
            <PlayCircle className="h-4 w-4" />
            Ver como funciona
          </a>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="show"
          custom={4}
          variants={fadeUp}
          className="mt-16 flex items-center gap-2 text-xs text-white/40"
        >
          <Image src="/logo.png" alt="" width={16} height={16} className="h-4 w-4 object-contain opacity-70" />
          Sem cartão de crédito • Configuração em minutos
        </motion.div>
      </div>
    </section>
  )
}
