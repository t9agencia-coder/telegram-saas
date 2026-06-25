'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  Loader2, Users, ShieldCheck, ShieldOff, UserCheck, UserX,
  KeyRound, Copy, Check, X, Clock,
} from 'lucide-react'

interface UserRow {
  id: string
  name: string
  email: string
  role: 'USER' | 'ADMIN'
  isActive: boolean
  createdAt: string
  _count: { workspaces: number }
}

interface ImpersonateData {
  token: string
  expiresAt: string
  userName: string
  userEmail: string
}

function RoleBadge({ role }: { role: string }) {
  return role === 'ADMIN'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E50914]/12 text-[#E50914] border border-[#E50914]/20">
        <ShieldCheck className="h-3 w-3" /> ADMIN
      </span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1E1E1E] text-[#555] border border-white/[0.06]">
        USER
      </span>
}

export default function AdminUsuariosPage() {
  const [users,    setUsers]    = useState<UserRow[]>([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [acting,   setActing]   = useState<string | null>(null)
  const [impData,  setImpData]  = useState<ImpersonateData | null>(null)
  const [copied,   setCopied]   = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const d = await api.get('/admin/users?limit=50')
      setUsers(d.users)
      setTotal(d.total)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const toggleActive = async (id: string) => {
    setActing(id)
    try {
      await api.patch(`/admin/users/${id}/toggle-active`, {})
      await load()
    } finally { setActing(null) }
  }

  const toggleRole = async (id: string, current: string) => {
    setActing(id)
    try {
      await api.patch(`/admin/users/${id}/role`, { role: current === 'ADMIN' ? 'USER' : 'ADMIN' })
      await load()
    } finally { setActing(null) }
  }

  const generateImpersonateLink = async (id: string) => {
    setActing(id)
    try {
      const d: ImpersonateData = await api.post(`/admin/users/${id}/impersonate`, {})
      setImpData(d)
      setCopied(false)
    } finally { setActing(null) }
  }

  const impersonateUrl = impData
    ? `${window.location.origin}/auth/impersonate?token=${impData.token}`
    : ''

  const copyLink = async () => {
    if (!impersonateUrl) return
    await navigator.clipboard.writeText(impersonateUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Users className="h-6 w-6 text-[#3B82F6]" /> Usuários
          </h1>
          <p className="text-sm text-[#555] mt-1">{total} usuário{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-[#E50914]" />
        </div>
      ) : (
        <div className="bg-[#141414] border border-white/[0.06] rounded-[4px] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Usuário', 'Role', 'Workspaces', 'Cadastro', 'Status', 'Ações'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-[#444] uppercase tracking-wider px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-[#151515] transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-[3px] bg-[#3B82F6]/10 flex items-center justify-center shrink-0">
                        <span className="text-[#3B82F6] text-xs font-bold">{u.name[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{u.name}</p>
                        <p className="text-xs text-[#444]">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-4">
                    <span className="text-sm text-[#666]">{u._count.workspaces}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs text-[#444]">{new Date(u.createdAt).toLocaleDateString('pt-BR')}</span>
                  </td>
                  <td className="px-5 py-4">
                    {u.isActive
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/15">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Ativo
                        </span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1A1A1A] text-[#555] border border-white/[0.06]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#3A3A3A]" /> Inativo
                        </span>
                    }
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => toggleActive(u.id)}
                        disabled={acting === u.id}
                        title={u.isActive ? 'Desativar' : 'Ativar'}
                        className="w-7 h-7 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#444] hover:text-white hover:bg-[#1E1E1E] transition-colors disabled:opacity-50"
                      >
                        {acting === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : u.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => toggleRole(u.id, u.role)}
                        disabled={acting === u.id}
                        title={u.role === 'ADMIN' ? 'Remover Admin' : 'Tornar Admin'}
                        className="w-7 h-7 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#444] hover:text-[#E50914] hover:border-[#E50914]/25 transition-colors disabled:opacity-50"
                      >
                        {u.role === 'ADMIN' ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => generateImpersonateLink(u.id)}
                        disabled={acting === u.id}
                        title="Gerar link de acesso (auditoria)"
                        className="w-7 h-7 rounded-[3px] border border-white/[0.06] flex items-center justify-center text-[#444] hover:text-[#3B82F6] hover:border-[#3B82F6]/25 transition-colors disabled:opacity-50"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Impersonate Modal ── */}
      {impData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#141414] border border-white/[0.08] rounded-[4px] w-full max-w-lg p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[3px] bg-[#3B82F6]/15 flex items-center justify-center shrink-0">
                  <KeyRound className="h-5 w-5 text-[#3B82F6]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Link de Acesso Gerado</h3>
                  <p className="text-xs text-[#555] mt-0.5">{impData.userName} · {impData.userEmail}</p>
                </div>
              </div>
              <button onClick={() => setImpData(null)} className="text-[#444] hover:text-white transition-colors mt-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-[3px] p-3 space-y-1">
              <p className="text-[10px] font-bold text-[#444] uppercase tracking-wider">Link de acesso (uso único)</p>
              <p className="text-xs text-[#888] break-all font-mono leading-relaxed">{impersonateUrl}</p>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#555]">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                Expira em {new Date(impData.expiresAt).toLocaleString('pt-BR')} · Uso único — expira após o primeiro acesso
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setImpData(null)}
                className="flex-1 px-4 py-2 text-xs text-[#555] border border-white/[0.06] hover:text-white hover:border-white/15 rounded-[3px] transition-all"
              >
                Fechar
              </button>
              <button
                onClick={copyLink}
                className={`flex-1 px-4 py-2 text-xs font-bold rounded-[3px] transition-all flex items-center justify-center gap-2 ${
                  copied
                    ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                    : 'bg-[#3B82F6] hover:bg-[#2563EB] text-white'
                }`}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado!' : 'Copiar Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
