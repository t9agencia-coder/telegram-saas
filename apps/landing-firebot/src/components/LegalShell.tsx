import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

type Props = {
  title: string
  updatedAt: string
  children: ReactNode
}

/** Layout das páginas institucionais (Política, Termos, Exclusão de dados). */
export default function LegalShell({ title, updatedAt, children }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-white/[0.06]">
        <div className="container flex items-center justify-between h-16 md:h-20">
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/logo.png"
              alt="FireBot"
              width={130}
              height={26}
              priority
              className="h-6 md:h-7 w-auto object-contain"
            />
          </Link>
          <Link
            href="/"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            ← Voltar ao site
          </Link>
        </div>
      </header>

      <main className="container py-14 md:py-20">
        <div className="mx-auto max-w-[720px]">
          <h1 className="text-balance font-black text-white tracking-tight text-3xl md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-white/40">Última atualização: {updatedAt}</p>

          <div className="legal-prose mt-10">{children}</div>

          <div className="mt-16 border-t border-white/[0.06] pt-8 flex flex-wrap gap-x-8 gap-y-2">
            <Link href="/politica" className="text-sm text-white/50 hover:text-white transition-colors">
              Política de Privacidade
            </Link>
            <Link href="/termos" className="text-sm text-white/50 hover:text-white transition-colors">
              Termos de Uso
            </Link>
            <Link
              href="/exclusao-de-dados"
              className="text-sm text-white/50 hover:text-white transition-colors"
            >
              Exclusão de Dados
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
