'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

const APP_URL = 'https://app.firebot.shop'

export default function CTA() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-gradient-to-b from-primary/[0.08] to-transparent p-10 md:p-16 text-center"
        >
          <div className="pointer-events-none absolute -top-1/2 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/20 blur-[120px] animate-glowPulse" />

          <div className="relative">
            <h2 className="text-balance font-black text-white tracking-tight text-3xl md:text-5xl mb-5">
              Pronto pra automatizar suas vendas?
            </h2>
            <p className="text-white/60 text-base md:text-lg max-w-xl mx-auto mb-9">
              Crie sua conta gratuita agora e coloque seu primeiro fluxo no ar em poucos minutos.
            </p>
            <a
              href={`${APP_URL}/auth/register`}
              className="group inline-flex items-center gap-2 text-base font-semibold text-white bg-primary hover:bg-primary-dark px-8 py-4 rounded-[8px] transition-all shadow-[0_0_30px_-8px_rgba(229,9,20,0.7)] hover:shadow-[0_0_40px_-4px_rgba(229,9,20,0.9)] hover:-translate-y-0.5"
            >
              Começar gratuitamente
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
