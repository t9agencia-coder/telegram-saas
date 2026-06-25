'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { ptBR } from 'date-fns/locale'
import { format } from 'date-fns'
import { Calendar, ChevronDown } from 'lucide-react'
import 'react-day-picker/dist/style.css'
import { cn } from '@/lib/utils'

export type DateRangeValue = {
  from: Date | undefined
  to: Date | undefined
}

interface Props {
  value: DateRangeValue
  onChange: (range: DateRangeValue) => void
}

export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const displayText = value.from
    ? value.to
      ? `${format(value.from, 'dd/MM')} – ${format(value.to, 'dd/MM')}`
      : `Desde ${format(value.from, 'dd/MM')}`
    : 'Personalizado'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] text-xs font-medium transition-all duration-200 whitespace-nowrap',
          value.from
            ? 'bg-[#E50914]/10 text-[#E50914] border border-[#E50914]/30'
            : 'text-[#666666] hover:text-white bg-[#1A1A1A] border border-white/[0.08]'
        )}
      >
        <Calendar className="h-3.5 w-3.5" />
        {displayText}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 animate-scale-in">
          <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] shadow-2xl p-3 card-glow-premium">
            <style>{`
              .rdp-root {
                margin: 0;
                --rdp-accent-color: #E50914;
                --rdp-accent-background-color: rgba(229,9,20,0.12);
                --rdp-day-width: 36px;
                --rdp-day-height: 36px;
                --rdp-range_middle-background-color: rgba(229,9,20,0.1);
                --rdp-range_start-date-background-color: #E50914;
                --rdp-range_end-date-background-color: #E50914;
                --rdp-today-color: #E50914;
              }
              .rdp-day { border-radius: 4px; font-size: 13px; }
              .rdp-day_button { border-radius: 4px; }
              .rdp-day:hover:not(.rdp-disabled) .rdp-day_button { background: rgba(229,9,20,0.12); }
              .rdp-selected .rdp-day_button { border-color: #E50914; }
              .rdp-range_start .rdp-day_button,
              .rdp-range_end .rdp-day_button { background: #E50914 !important; color: #fff; border-radius: 4px; }
              .rdp-range_middle { background: rgba(229,9,20,0.08); }
              .rdp-range_middle .rdp-day_button { color: #fff; }
              .rdp-today .rdp-day_button { font-weight: 700; color: #E50914; }
              .rdp-disabled { opacity: 0.35; }
              .rdp-nav { height: 32px; }
              .rdp-chevron { fill: #999; }
              .rdp-weekday { color: #666; font-size: 11px; font-weight: 500; padding-bottom: 8px; }
              .rdp-caption_label { color: #fff; font-size: 13px; font-weight: 600; }
              .rdp-button_next, .rdp-button_previous { color: #999; border-radius: 6px; }
              .rdp-button_next:hover, .rdp-button_previous:hover { background: rgba(255,255,255,0.05); }
              .rdp-month { background: transparent; }
              .rdp-root[dir="rtl"] { --rdp-gradient-direction: -90deg; }
            `}</style>
            <DayPicker
              mode="range"
              selected={value.from ? { from: value.from, to: value.to } : undefined}
              onSelect={(range) => {
                if (range?.from) {
                  onChange({ from: range.from, to: range.to })
                  if (range.from && range.to) {
                    setOpen(false)
                  }
                } else {
                  onChange({ from: undefined, to: undefined })
                }
              }}
              locale={ptBR}
              startMonth={new Date(2024, 0)}
              endMonth={new Date()}
            />
            {value.from && (
              <div className="flex items-center justify-between pt-2 border-t border-[#2A2A2A] mt-2">
                <button
                  onClick={() => onChange({ from: undefined, to: undefined })}
                  className="text-xs text-[#666666] hover:text-white transition-colors"
                >
                  Limpar
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs font-medium text-[#E50914] hover:text-white transition-colors"
                >
                  Aplicar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
