'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useMotionValue, useSpring } from 'framer-motion'

interface Stat {
  value: number
  suffix: string
  label: string
}

const STATS: Stat[] = [
  { value: 12000, suffix: '+', label: 'Bots automatizados' },
  { value: 4200000, suffix: '+', label: 'Mensagens enviadas por mês' },
  { value: 98, suffix: '%', label: 'Uptime da plataforma' },
  { value: 24, suffix: '/7', label: 'Suporte disponível' },
]

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { duration: 1500, bounce: 0 })
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    if (inView) motionValue.set(value)
  }, [inView, value, motionValue])

  useEffect(() => {
    const unsub = spring.on('change', (v) => setDisplay(formatNumber(Math.floor(v))))
    return unsub
  }, [spring])

  return <span ref={ref}>{display}</span>
}

export default function Stats() {
  return (
    <section className="relative border-y border-white/[0.06] bg-white/[0.015]">
      <div className="container py-14 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">
        {STATS.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="text-center"
          >
            <div className="text-3xl md:text-4xl font-black text-white tracking-tight">
              <Counter value={s.value} />
              <span className="text-primary">{s.suffix}</span>
            </div>
            <p className="mt-1.5 text-xs md:text-sm text-white/50">{s.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
