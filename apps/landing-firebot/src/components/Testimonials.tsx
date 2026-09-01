'use client'

import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

const TESTIMONIALS = [
  {
    name: 'Rafael M.',
    role: 'Infoprodutor',
    quote:
      'Migrei minhas vendas pro FireBot e o remarketing sozinho já recuperou uma boa parte dos carrinhos abandonados. Configurei uma vez e deixei rodando.',
  },
  {
    name: 'Camila S.',
    role: 'Criadora de conteúdo',
    quote:
      'O que mais gostei foi a facilidade de montar o fluxo — arrastar e soltar mesmo, sem precisar entender nada de código pra colocar no ar.',
  },
  {
    name: 'Diego A.',
    role: 'Gestor de tráfego',
    quote:
      'Os pixels e as métricas em tempo real facilitaram demais otimizar campanha. Consigo ver a origem de cada venda na hora.',
  },
]

export default function Testimonials() {
  return (
    <section id="depoimentos" className="relative py-24 md:py-32">
      <div className="container">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Depoimentos</p>
          <h2 className="text-balance font-black text-white tracking-tight text-3xl md:text-5xl">
            Quem usa, recomenda
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="card-glow rounded-[12px] bg-card border border-white/[0.06] p-6 md:p-7 flex flex-col"
            >
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="h-3.5 w-3.5 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-white/70 text-sm leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-6 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{t.name}</p>
                  <p className="text-white/40 text-xs">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
