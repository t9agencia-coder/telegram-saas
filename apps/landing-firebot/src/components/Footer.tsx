import Image from 'next/image'

const LINKS = [
  { label: 'Recursos', href: '#recursos' },
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Depoimentos', href: '#depoimentos' },
  { label: 'Entrar', href: 'https://app.firebot.shop/auth/login' },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="relative border-t border-white/[0.06] py-12">
      <div className="container flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="FireBot" width={28} height={28} className="rounded-[6px]" />
          <span className="text-white font-bold text-sm">FireBot</span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-white/50 hover:text-white text-sm transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <p className="text-white/30 text-xs">© {year} FireBot. Todos os direitos reservados.</p>
      </div>
    </footer>
  )
}
