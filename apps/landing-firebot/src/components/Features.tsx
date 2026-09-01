'use client'

import { motion } from 'framer-motion'
import {
  Workflow, QrCode, Megaphone, BarChart3, Layers, Globe2,
} from 'lucide-react'

const FEATURES = [
  {
    icon: Workflow,
    title: 'Fluxos automatizados',
    desc: 'Monte a jornada do cliente visualmente — mensagens, mídia, botões e condições, sem código.',
  },
  {
    icon: QrCode,
    title: 'PIX integrado',
    desc: 'Cobrança gerada na hora, aprovação automática e fallback entre adquirentes pra nunca perder venda.',
  },
  {
    icon: Megaphone,
    title: 'Remarketing inteligente',
    desc: 'Recupere quem não pagou com sequências configuráveis, sem precisar levantar um dedo.',
  },
  {
    icon: BarChart3,
    title: 'Métricas em tempo real',
    desc: 'Faturamento, conversão e origem de cada venda — tudo num painel só, atualizado na hora.',
  },
  {
    icon: Layers,
    title: 'Multi-conta e multi-bot',
    desc: 'Gerencie quantos bots quiser, cada um com seus próprios fluxos, pixels e integrações.',
  },
  {
    icon: Globe2,
    title: 'Domínios personalizados',
    desc: 'Use seu próprio domínio nos links de checkout e redirecionamento, com SSL automático.',
  },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
}

export default function Features() {
  return (
    <section id="recursos" className="relative py-24 md:py-32">
      <div className="container">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Recursos</p>
          <h2 className="text-balance font-black text-white tracking-tight text-3xl md:text-5xl">
            Tudo que sua operação de vendas precisa
          </h2>
          <p className="mt-4 text-white/50 text-base md:text-lg">
            Uma plataforma completa, pensada pra quem vende todos os dias — não pra quem só programa.
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={item}
              whileHover={{ y: -4 }}
              className="card-glow group relative rounded-[12px] bg-card border border-white/[0.06] p-6 md:p-7 transition-all duration-300"
            >
              <div className="w-11 h-11 rounded-[10px] bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
