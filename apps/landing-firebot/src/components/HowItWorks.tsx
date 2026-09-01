'use client'

import { motion } from 'framer-motion'
import { Bot, GitBranch, QrCode, TrendingUp } from 'lucide-react'

const STEPS = [
  { icon: Bot, title: 'Conecte seu bot', desc: 'Cole o token do Telegram e seu bot já está pronto pra receber clientes.' },
  { icon: GitBranch, title: 'Monte o fluxo', desc: 'Arraste blocos de mensagem, mídia e botões pra criar a jornada de venda.' },
  { icon: QrCode, title: 'Configure o PIX', desc: 'Conecte um adquirente e comece a receber pagamentos automaticamente.' },
  { icon: TrendingUp, title: 'Venda no automático', desc: 'Acompanhe métricas em tempo real enquanto o fluxo trabalha por você.' },
]

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="relative py-24 md:py-32 bg-white/[0.015] border-y border-white/[0.06]">
      <div className="container">
        <div className="max-w-2xl mx-auto text-center mb-20">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Como funciona</p>
          <h2 className="text-balance font-black text-white tracking-tight text-3xl md:text-5xl">
            Do zero à primeira venda em minutos
          </h2>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-6">
          {/* Linha conectora (desktop) */}
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: 'easeInOut' }}
            style={{ transformOrigin: 'left' }}
            className="hidden md:block absolute top-7 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-primary/60 via-primary/30 to-transparent"
          />

          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative flex flex-col items-center text-center md:items-start md:text-left"
            >
              <div className="relative z-10 w-14 h-14 rounded-full bg-[#080808] border-2 border-primary/40 flex items-center justify-center mb-5">
                <s.icon className="h-6 w-6 text-primary" />
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
              </div>
              <h3 className="text-white font-bold text-base mb-1.5">{s.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed max-w-[220px]">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
