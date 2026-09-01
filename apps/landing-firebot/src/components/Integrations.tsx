'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

// Traçados verificados via Simple Icons (projeto open-source que mantém os
// ícones de marca sempre atualizados conforme os guidelines oficiais).

const FacebookLogo = () => (
  <div className="w-11 h-11 rounded-[10px] flex items-center justify-center" style={{ background: '#1877F2' }}>
    <svg width={22} height={22} viewBox="0 0 24 24" fill="white">
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  </div>
)

const TIKTOK_PATH =
  'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'

const TikTokLogo = () => (
  <div className="w-11 h-11 rounded-[10px] flex items-center justify-center bg-black">
    <svg width={20} height={20} viewBox="0 0 24 24">
      <path d={TIKTOK_PATH} fill="#25F4EE" transform="translate(-0.9, 0.9)" />
      <path d={TIKTOK_PATH} fill="#FE2C55" transform="translate(0.9, -0.9)" />
      <path d={TIKTOK_PATH} fill="white" />
    </svg>
  </div>
)

const KwaiLogo = () => (
  <div className="w-11 h-11 rounded-[10px] overflow-hidden relative">
    <Image src="/kwai-logo.jpg" alt="Kwai" fill className="object-cover" />
  </div>
)

const GoogleAdsLogo = () => (
  <div className="w-11 h-11 rounded-[10px] flex items-center justify-center bg-white">
    <svg width={22} height={22} viewBox="0 0 24 24" fill="#4285F4">
      <path d="M3.9998 22.9291C1.7908 22.9291 0 21.1383 0 18.9293s1.7908-3.9998 3.9998-3.9998 3.9998 1.7908 3.9998 3.9998-1.7908 3.9998-3.9998 3.9998zm19.4643-6.0004L15.4632 3.072C14.3586 1.1587 11.9121.5028 9.9988 1.6074S7.4295 5.1585 8.5341 7.0718l8.0009 13.8567c1.1046 1.9133 3.5511 2.5679 5.4644 1.4646 1.9134-1.1046 2.568-3.5511 1.4647-5.4644zM7.5137 4.8438L1.5645 15.1484A4.5 4.5 0 0 1 4 14.4297c2.5597-.0075 4.6248 2.1585 4.4941 4.7148l3.2168-5.5723-3.6094-6.25c-.4499-.7793-.6322-1.6394-.5878-2.4784z" />
    </svg>
  </div>
)

// Ícone extraído do wordmark oficial da Taboola: os dois "o" conectados por
// uma curva de sorriso, na cor de marca #054164 (guideline: logo azul em fundo branco).
const TaboolaLogo = () => (
  <div className="w-11 h-11 rounded-[10px] flex items-center justify-center bg-white">
    <svg width={26} height={26} viewBox="0 0 32 32" fill="none">
      <circle cx="11" cy="13" r="6" stroke="#054164" strokeWidth="2.6" />
      <circle cx="22" cy="15" r="4.2" stroke="#054164" strokeWidth="2.4" />
      <path d="M7 21c2 3 16 3 18-1" stroke="#054164" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  </div>
)

const PLATFORMS = [
  { name: 'Facebook Ads', Logo: FacebookLogo },
  { name: 'Kwai Ads', Logo: KwaiLogo },
  { name: 'TikTok Ads', Logo: TikTokLogo },
  { name: 'Google Ads', Logo: GoogleAdsLogo },
  { name: 'Taboola', Logo: TaboolaLogo },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
}

export default function Integrations() {
  return (
    <section id="integracoes" className="relative py-24 md:py-32">
      <div className="container">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Integrações</p>
          <h2 className="text-balance font-black text-white tracking-tight text-3xl md:text-5xl">
            Rastreamento avançado nas principais plataformas de tráfego
          </h2>
          <p className="mt-4 text-white/50 text-base md:text-lg">
            Conectamos direto com quem você já anuncia — pixel, CAPI e marcação de venda automática,
            sem depender só do navegador do cliente.
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4"
        >
          {PLATFORMS.map(({ name, Logo }) => (
            <motion.div
              key={name}
              variants={item}
              whileHover={{ y: -4 }}
              className="card-glow flex flex-col items-center gap-3 rounded-[12px] bg-card border border-white/[0.06] p-6 transition-all duration-300"
            >
              <Logo />
              <span className="text-white/70 text-sm font-medium text-center">{name}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
