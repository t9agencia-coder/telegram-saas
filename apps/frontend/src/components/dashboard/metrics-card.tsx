'use client'

import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react'

interface MetricsCardProps {
  title: string
  value: string
  change?: number
  changeLabel?: string
  icon: LucideIcon
  iconColor?: string
  suffix?: string
}

export function MetricsCard({ title, value, change, changeLabel, icon: Icon, suffix }: MetricsCardProps) {
  const isPositive = change !== undefined && change >= 0
  const isNegative = change !== undefined && change < 0

  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#141414] p-4 hover:border-white/[0.10] transition-all duration-300 glow-border group card-glow-premium glow-border-gpu">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[#666666] font-medium">{title}</p>
        <div className="w-7 h-7 rounded-[4px] bg-[#1A1A1A] border border-white/[0.06] flex items-center justify-center group-hover:border-[#E50914]/30 transition-colors">
          <Icon className="h-3.5 w-3.5 text-[#B3B3B3]" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-xl font-bold text-white tracking-tight">{value}</p>
        {suffix && <span className="text-xs text-[#666666]">{suffix}</span>}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1.5 mt-2">
          <div
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-[3px]',
              isPositive && 'text-[#22C55E] bg-[#22C55E]/10',
              isNegative && 'text-[#EF4444] bg-[#EF4444]/10'
            )}
          >
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{isPositive ? '+' : ''}{change}%</span>
          </div>
          {changeLabel && <span className="text-xs text-[#666666]">{changeLabel}</span>}
        </div>
      )}
    </div>
  )
}
