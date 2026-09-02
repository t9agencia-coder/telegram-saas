'use client'

import { PageHeader } from '@/components/dashboard/page-header'
import { Clock } from 'lucide-react'

export function ComingSoon({ title, description, phase }: { title: string; description: string; phase: string }) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-10 text-center">
        <Clock className="h-8 w-8 text-[#666] mx-auto mb-3" />
        <p className="text-sm text-white/70">Disponível na {phase}.</p>
        <p className="text-xs text-[#666] mt-1 max-w-md mx-auto">{description}</p>
      </div>
    </div>
  )
}
