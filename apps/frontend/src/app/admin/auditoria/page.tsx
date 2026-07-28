'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Loader2, History, ChevronLeft, ChevronRight } from 'lucide-react'

interface AuditEntry {
  id: string
  action: string
  entity: string
  entityId: string | null
  ip: string | null
  createdAt: string
  metadata: Record<string, any> | null
  user: { id: string; name: string; email: string } | null
}

const LIMIT = 50

export default function AdminAuditoriaPage() {
  const [entries,  setEntries]  = useState<AuditEntry[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)

  const load = async (p = page) => {
    setLoading(true)
    try {
      const d = await api.get(`/admin/audit-log?page=${p}&limit=${LIMIT}`)
      setEntries(d.entries)
      setTotal(d.total)
      setPage(p)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load(1) }, [])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <History className="h-6 w-6 text-[#E50914]" /> Auditoria
        </h1>
        <p className="text-sm text-[#555] mt-1">{total} ação{total !== 1 ? 'ões' : ''} registrada{total !== 1 ? 's' : ''} no painel</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-[#E50914]" />
        </div>
      ) : (
        <>
          <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Data', 'Usuário', 'Ação', 'Entidade', 'IP'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-[#444] uppercase tracking-wider px-5 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141414]">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-[#151515] transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="text-xs text-[#666]">{new Date(e.createdAt).toLocaleString('pt-BR')}</span>
                    </td>
                    <td className="px-5 py-4">
                      {e.user ? (
                        <>
                          <p className="text-sm text-white">{e.user.name}</p>
                          <p className="text-xs text-[#444]">{e.user.email}</p>
                        </>
                      ) : (
                        <span className="text-xs text-[#444]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E50914]/10 text-[#E50914] border border-[#E50914]/15">
                        {e.action}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-[#B3B3B3]">{e.entity}</span>
                      {e.entityId && <span className="text-[10px] text-[#444] font-mono ml-1.5">{e.entityId.slice(0, 8)}…</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-[#666] font-mono">{e.ip || '—'}</span>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-[#444] text-sm">
                      Nenhuma ação registrada ainda
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => load(page - 1)}
                disabled={page <= 1}
                className="w-8 h-8 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#666] hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-[#555]">Página {page} de {totalPages}</span>
              <button
                onClick={() => load(page + 1)}
                disabled={page >= totalPages}
                className="w-8 h-8 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#666] hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
