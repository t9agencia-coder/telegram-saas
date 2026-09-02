'use client'

import { cn } from '@/lib/utils'
import { MarketingPeriod, PERIOD_LABELS } from '@/lib/tracking'

const PRESETS: MarketingPeriod[] = ['today', 'yesterday', 'last7', 'last30', 'this_month', 'prev_month']

interface Props {
  value: MarketingPeriod
  onChange: (p: MarketingPeriod) => void
}

export function PeriodTabs({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            'px-2.5 py-1 rounded-[3px] text-xs font-medium transition-all duration-200 whitespace-nowrap border',
            value === p
              ? 'bg-[#E50914]/10 text-[#E50914] border-[#E50914]/30'
              : 'text-[#666666] hover:text-white bg-[#1A1A1A] border-white/[0.08]',
          )}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  )
}
