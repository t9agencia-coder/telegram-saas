'use client'

import { useState, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  RefreshCw, Loader2, XCircle, AlertTriangle,
  Database, Server, Bot, Layout, CreditCard,
  Activity, Zap,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, unit = '') {
  if (n == null) return '—'
  return `${n}${unit}`
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-400' : 'bg-red-500'}`} />
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#141414] border border-white/[0.06] rounded-[4px] p-5 ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-4 w-4 text-[#E50914]" />
      <p className="text-sm font-semibold text-white">{label}</p>
    </div>
  )
}

function Row({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-[#555]">{label}</span>
      <span className={`text-xs font-medium ${warn ? 'text-amber-400' : 'text-white'}`}>{value}</span>
    </div>
  )
}

function Bar({ percent, warn }: { percent: number; warn?: boolean }) {
  return (
    <div className="w-full h-1.5 bg-[#222] rounded-full overflow-hidden mt-1">
      <div
        className={`h-full rounded-full transition-all ${warn ? 'bg-amber-400' : percent > 80 ? 'bg-red-500' : 'bg-green-400'}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  )
}

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function QueueBadge({ counts }: { counts: any }) {
  const failed  = counts?.failed  ?? 0
  const waiting = counts?.waiting ?? 0
  const active  = counts?.active  ?? 0
  const delayed = counts?.delayed ?? 0
  const hasFail = failed > 0
  return (
    <div className="flex items-center gap-3 text-[11px]">
      {active  > 0 && <span className="text-blue-400">{active} ativo{active !== 1 ? 's' : ''}</span>}
      {waiting > 0 && <span className="text-[#888]">{waiting} aguardando</span>}
      {delayed > 0 && <span className="text-[#666]">{delayed} agendado{delayed !== 1 ? 's' : ''}</span>}
      {failed  > 0 && <span className="text-red-400 font-semibold">{failed} falha{failed !== 1 ? 's' : ''}</span>}
      {!hasFail && active === 0 && waiting === 0 && delayed === 0 && (
        <span className="text-[#444]">vazia</span>
      )}
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function MetricasPage() {
  const [data,        setData]        = useState<any>(null)
  const [loading,     setLoading]     = useState(false)
  const [lastFetch,   setLastFetch]   = useState<Date | null>(null)
  const [error,       setError]       = useState('')
  const [clearing,    setClearing]    = useState<Record<string, boolean>>({})
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/admin/metrics')
      setData(res)
      setLastFetch(new Date())
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar métricas')
    } finally {
      setLoading(false)
    }
  }, [])

  const clearFailed = useCallback(async (queueName: string) => {
    setClearing(prev => ({ ...prev, [queueName]: true }))
    try {
      await api.delete(`/admin/queues/${encodeURIComponent(queueName)}/failed`)
      // Atualiza contagem local imediatamente sem precisar recarregar tudo
      setData((prev: any) => {
        if (!prev) return prev
        return {
          ...prev,
          queues: {
            ...prev.queues,
            [queueName]: { ...prev.queues[queueName], failed: 0 },
          },
        }
      })
    } catch (e: any) {
      setError(e.message || `Erro ao limpar falhas de ${queueName}`)
    } finally {
      setClearing(prev => ({ ...prev, [queueName]: false }))
    }
  }, [])

  const m = data

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Métricas do Sistema</h1>
          <p className="text-xs text-[#555] mt-0.5">
            Consulta sob demanda — sem impacto contínuo
            {lastFetch && (
              <span className="ml-2 text-[#444]">
                Última atualização: {lastFetch.toLocaleTimeString('pt-BR')}
                {m?.collectionMs != null && ` (${m.collectionMs}ms)`}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="h-9 px-4 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] text-white text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? 'Coletando...' : 'Atualizar'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-[4px] bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* empty state */}
      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Activity className="h-12 w-12 text-[#333] mb-4" />
          <p className="text-sm text-[#555] mb-6">Clique em "Atualizar" para coletar as métricas do sistema</p>
          <button
            onClick={load}
            className="h-10 px-6 rounded-[4px] bg-[#E50914] hover:bg-[#FF1F2D] text-white text-sm font-medium transition-all flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Coletar Métricas
          </button>
        </div>
      )}

      {m && (
        <div className="space-y-6">
          {/* row 1: sistema + redis + db */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Sistema */}
            <Card>
              <SectionTitle icon={Server} label="VPS / Processo" />
              <Row label="Plataforma"    value={m.system.platform} />
              <Row label="Node.js"       value={m.system.nodeVersion} />
              <Row
                label="Uptime processo"
                value={fmtUptime(m.system.processUptime)}
              />
              <Row
                label="Uptime sistema"
                value={fmtUptime(m.system.systemUptime)}
              />
              <div className="mt-3 pt-3 border-t border-white/[0.04]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#555]">RAM do sistema</span>
                  <span className={`text-xs font-medium ${m.system.memUsedPercent > 85 ? 'text-red-400' : m.system.memUsedPercent > 70 ? 'text-amber-400' : 'text-white'}`}>
                    {m.system.memUsedPercent}% — {m.system.memUsedMb} / {m.system.memTotalMb} MB
                  </span>
                </div>
                <Bar percent={m.system.memUsedPercent} warn={m.system.memUsedPercent > 85} />
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#555]">Heap Node.js</span>
                  <span className="text-xs font-medium text-white">
                    {m.system.heapUsedMb} / {m.system.heapTotalMb} MB
                  </span>
                </div>
                <Bar
                  percent={Math.round((m.system.heapUsedMb / m.system.heapTotalMb) * 100)}
                  warn={(m.system.heapUsedMb / m.system.heapTotalMb) > 0.85}
                />
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#555]">Load avg (1m / 5m / 15m)</span>
                </div>
                <p className={`text-xs font-semibold ${m.system.loadAvg1m > m.system.cpuCores ? 'text-red-400' : m.system.loadAvg1m > m.system.cpuCores * 0.7 ? 'text-amber-400' : 'text-green-400'}`}>
                  {m.system.loadAvg1m} / {m.system.loadAvg5m} / {m.system.loadAvg15m}
                  <span className="text-[#444] font-normal ml-1">({m.system.cpuCores} cores)</span>
                </p>
              </div>
            </Card>

            {/* Redis */}
            <Card>
              <SectionTitle icon={Zap} label="Redis" />
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <StatusDot ok={m.redis.status === 'ok'} />
                  <span className={`text-sm font-semibold ${m.redis.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                    {m.redis.status === 'ok' ? 'Conectado' : 'Erro de Conexão'}
                  </span>
                </div>
                {m.redis.version && (
                  <span className="text-[10px] text-[#444] font-mono">v{m.redis.version}</span>
                )}
              </div>
              {m.redis.status === 'ok' ? (
                <>
                  <Row label="Latência"  value={`${m.redis.latencyMs}ms`} warn={m.redis.latencyMs > 50} />
                  <Row label="Uptime"    value={m.redis.uptimeSecs != null ? fmtUptime(m.redis.uptimeSecs) : '—'} />

                  <div className="mt-3 pt-3 border-t border-white/[0.04]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#555]">Memória usada</span>
                      <span className="text-xs font-medium text-white">
                        {m.redis.usedMemoryMb != null ? `${m.redis.usedMemoryMb} MB` : '—'}
                        {m.redis.maxMemoryMb > 0 && ` / ${m.redis.maxMemoryMb} MB`}
                      </span>
                    </div>
                    {m.redis.maxMemoryMb > 0 && m.redis.usedMemoryMb != null && (
                      <Bar
                        percent={Math.round((m.redis.usedMemoryMb / m.redis.maxMemoryMb) * 100)}
                        warn={(m.redis.usedMemoryMb / m.redis.maxMemoryMb) > 0.80}
                      />
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/[0.04]">
                    <Row
                      label="Conexões ativas"
                      value={m.redis.maxClients ? `${fmt(m.redis.connectedClients)} / ${m.redis.maxClients}` : fmt(m.redis.connectedClients)}
                      warn={(m.redis.connectedClients ?? 0) > (m.redis.maxClients ?? Infinity) * 0.8}
                    />
                    <Row label="Bloqueadas"       value={fmt(m.redis.blockedClients)}           warn={(m.redis.blockedClients ?? 0) > 0} />
                    <Row label="Total recebidas"  value={fmt(m.redis.totalConnectionsReceived)} />
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/[0.04]">
                    <Row label="Ops/seg (atual)"      value={fmt(m.redis.opsPerSec)} />
                    <Row label="Cmds processados"     value={m.redis.totalCommandsProcessed != null ? m.redis.totalCommandsProcessed.toLocaleString('pt-BR') : '—'} />
                    {(m.redis.keyspaceHits != null || m.redis.keyspaceMisses != null) && (() => {
                      const hits   = m.redis.keyspaceHits   ?? 0
                      const misses = m.redis.keyspaceMisses ?? 0
                      const total  = hits + misses
                      const rate   = total > 0 ? Math.round((hits / total) * 100) : null
                      return (
                        <Row
                          label="Hit rate cache"
                          value={rate != null ? `${rate}% (${hits.toLocaleString('pt-BR')} hits)` : '—'}
                          warn={rate != null && rate < 80}
                        />
                      )
                    })()}
                  </div>
                </>
              ) : (
                <p className="text-xs text-red-400 mt-2">{m.redis.error}</p>
              )}
            </Card>

            {/* Database */}
            <Card>
              <SectionTitle icon={Database} label="Banco de Dados" />
              <div className="flex items-center gap-2 mb-4">
                <StatusDot ok={m.database.status === 'ok'} />
                <span className={`text-sm font-semibold ${m.database.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                  {m.database.status === 'ok' ? 'Conectado' : 'Erro de Conexão'}
                </span>
              </div>
              {m.database.status === 'ok' ? (
                <>
                  <Row
                    label="Latência (ping)"
                    value={`${m.database.latencyMs}ms`}
                    warn={m.database.latencyMs > 100}
                  />
                  <Row label="Usuários"  value={fmt(m.users?.total)} />
                  <Row label="Leads"     value={fmt(m.leads?.total)} />
                </>
              ) : (
                <p className="text-xs text-red-400 mt-2">{m.database.error}</p>
              )}
            </Card>
          </div>

          {/* row 2: fluxos + bots + payments */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Fluxos */}
            <Card>
              <SectionTitle icon={Layout} label="Fluxos" />
              <div className="text-3xl font-bold text-white mb-1">{m.flows.total}</div>
              <p className="text-xs text-[#555] mb-4">fluxos cadastrados</p>
              <Row
                label="Ativos"
                value={<span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />{m.flows.active}</span>}
              />
              <Row
                label="Inativos"
                value={<span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#444] inline-block" />{m.flows.inactive}</span>}
              />
            </Card>

            {/* Bots */}
            <Card>
              <SectionTitle icon={Bot} label="Bots" />
              <div className="text-3xl font-bold text-white mb-1">{m.bots.total}</div>
              <p className="text-xs text-[#555] mb-4">bots cadastrados</p>
              <Row label="Ativos"          value={m.bots.active} />
              <Row label="Pendente review" value={m.bots.pendingReview} warn={m.bots.pendingReview > 0} />
              <Row label="Bloqueados"      value={m.bots.blocked}       warn={m.bots.blocked > 0} />
              <Row label="Com erro"        value={m.bots.error}         warn={m.bots.error > 0} />
            </Card>

            {/* Pagamentos */}
            <Card>
              <SectionTitle icon={CreditCard} label="Pagamentos" />
              <div className="text-3xl font-bold text-white mb-1">{m.payments.approvedToday}</div>
              <p className="text-xs text-[#555] mb-4">aprovados hoje</p>
              <Row
                label="PIX pendentes"
                value={m.payments.pending}
                warn={m.payments.pending > 50}
              />
              {m.payments.pending > 100 && (
                <div className="flex items-start gap-2 mt-3 p-2.5 rounded-[3px] bg-amber-500/8 border border-amber-500/15">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-400">Muitos PIX pendentes — verifique webhooks</p>
                </div>
              )}
            </Card>
          </div>

          {/* row 3: filas BullMQ */}
          <Card>
            <SectionTitle icon={Activity} label="Filas BullMQ" />
            <div className="space-y-3">
              {Object.entries(m.queues).map(([name, counts]: [string, any]) => {
                const failed    = counts?.failed ?? 0
                const isClearing = clearing[name]
                return (
                  <div key={name} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-2">
                      <StatusDot ok={failed === 0} />
                      <span className="text-xs text-white font-mono">{name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <QueueBadge counts={counts} />
                      {failed > 0 && (
                        <button
                          onClick={() => clearFailed(name)}
                          disabled={isClearing}
                          className="text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 rounded-[3px] px-2 py-0.5 transition-colors disabled:opacity-40 shrink-0"
                        >
                          {isClearing ? 'limpando…' : 'Limpar'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
