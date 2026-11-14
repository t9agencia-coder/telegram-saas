'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Shield, Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
  AlertTriangle, CheckCircle, Loader2, Flame, X, Ban, PowerOff, Link2,
} from 'lucide-react'

// ─── Tipos (espelham GET /workspaces/:id/contencao) ───────────────────────────

type BotDaFila = {
  slotId: string | null
  botId: string | null
  username: string | null
  ordem: number
  servindo: boolean
  caido: boolean
  motivo: string | null
  caidoDesde: string | null
  bloqueado: boolean
  desativado: boolean
  prontoParaAquecer: boolean
  /** false = é o bot do fluxo aparecendo, mas ainda fora da fila de contenção. */
  naFila: boolean
}

type FluxoComFila = {
  flowId: string
  nome: string
  ativo: boolean
  servindo: string | null
  botDoFluxo: { botId: string; username: string; caido: boolean } | null
  temFila: boolean
  bots: BotDaFila[]
}

type SaudeSonda = {
  ultimaChecagem: string | null
  minutosDesdeUltimaChecagem: number | null
  sondaViva: boolean
}

type BotDisponivel = {
  botId: string
  username: string
  status: string
  ativo: boolean
  bloqueado: boolean
  desativado: boolean
  caido: boolean
  motivo: string | null
  emUsoEm: { id: string; nome: string } | null
  prontoParaAquecer: boolean
  impedimento: 'desativado' | 'bloqueado' | 'caido' | 'em_uso' | null
  podeEntrar: boolean
}

// ─── Etiqueta ─────────────────────────────────────────────────────────────────

type Tom = 'ok' | 'ruim' | 'aviso' | 'neutro'

const TONS: Record<Tom, string> = {
  ok:     'bg-primary/15 text-primary',
  ruim:   'bg-red-500/15 text-red-400',
  aviso:  'bg-amber-500/15 text-amber-400',
  neutro: 'bg-white/[0.07] text-white/45',
}

function Tag({ tom, icone: Icone, children }: { tom: Tom; icone?: any; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${TONS[tom]}`}>
      {Icone && <Icone className="w-3 h-3" />}
      {children}
    </span>
  )
}

/** As etiquetas de estado de um bot, na ordem em que importam. */
function tagsDoBot(b: { servindo?: boolean; caido: boolean; bloqueado: boolean; desativado: boolean; prontoParaAquecer: boolean }) {
  const tags: Array<{ tom: Tom; icone: any; texto: string }> = []
  if (b.servindo && !b.caido)  tags.push({ tom: 'ok',    icone: CheckCircle,   texto: 'atendendo' })
  if (b.desativado)            tags.push({ tom: 'neutro', icone: PowerOff,     texto: 'desativado' })
  if (b.bloqueado)             tags.push({ tom: 'ruim',  icone: Ban,           texto: 'bloqueado' })
  if (b.caido)                 tags.push({ tom: 'ruim',  icone: AlertTriangle, texto: 'banido' })
  if (!b.caido && !b.bloqueado && !b.desativado && !b.prontoParaAquecer) {
    tags.push({ tom: 'aviso', icone: Flame, texto: 'falta aquecer' })
  }
  if (tags.length === 0)       tags.push({ tom: 'neutro', icone: CheckCircle,  texto: 'ativo' })
  return tags
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function FilaSkeleton({ delay }: { delay: number }) {
  return (
    <div
      className="bg-[#141414] rounded-[4px] border border-white/[0.06] p-5 animate-fade-in"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}
    >
      <Skeleton className="h-4 w-48 mb-4" />
      <div className="space-y-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  )
}

// ─── Linha de um bot na fila ──────────────────────────────────────────────────

function LinhaBot({
  bot, posicao, total, arrastavel, onMover, onRemover, onArrastarInicio, onArrastarSobre, onSoltar,
}: {
  bot: BotDaFila
  posicao: number
  total: number
  arrastavel: boolean
  onMover: (de: number, para: number) => void
  onRemover: () => void
  onArrastarInicio: () => void
  onArrastarSobre: (e: React.DragEvent) => void
  onSoltar: () => void
}) {
  // O bot do fluxo que ainda não entrou na fila é informativo: não tem posição,
  // não arrasta e não se remove daqui.
  const podeMexer = bot.naFila
  const primeiro = posicao === 0
  const ultimo = posicao === total - 1
  const ruim = bot.caido || bot.bloqueado

  return (
    <div
      draggable={arrastavel && podeMexer}
      onDragStart={onArrastarInicio}
      onDragOver={onArrastarSobre}
      onDrop={onSoltar}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-[4px] border transition-colors ${
        ruim
          ? 'bg-red-500/[0.04] border-red-500/20'
          : bot.servindo
            ? 'bg-primary/[0.06] border-primary/30'
            : podeMexer
              ? 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
              : 'bg-white/[0.02] border-dashed border-white/[0.10]'
      }`}
    >
      <GripVertical
        className={`w-4 h-4 shrink-0 ${
          arrastavel && podeMexer ? 'text-white/25 cursor-grab active:cursor-grabbing' : 'text-white/10'
        }`}
      />

      <span
        className={`w-6 h-6 shrink-0 rounded-[3px] grid place-items-center text-[11px] font-semibold tabular-nums ${
          ruim ? 'bg-red-500/15 text-red-400' : podeMexer ? 'bg-white/[0.06] text-white/60' : 'bg-transparent text-white/20'
        }`}
      >
        {podeMexer ? bot.ordem : '—'}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[13px] truncate ${ruim ? 'text-white/40 line-through' : 'text-white/90'}`}>
            @{bot.username ?? '—'}
          </span>
          {tagsDoBot(bot).map((t) => (
            <Tag key={t.texto} tom={t.tom} icone={t.icone}>{t.texto}</Tag>
          ))}
          {!podeMexer && <Tag tom="neutro">fora da fila</Tag>}
        </div>

        {ruim && bot.motivo && (
          <p className="text-[11px] text-red-400/60 mt-0.5 truncate">{bot.motivo}</p>
        )}

        {!podeMexer && (
          <p className="text-[11px] text-white/35 mt-0.5">
            É o bot deste fluxo. Adicione um reserva abaixo e ele entra na fila como 1º automaticamente.
          </p>
        )}

        {podeMexer && !ruim && !bot.prontoParaAquecer && (
          <p className="text-[11px] text-amber-400/60 mt-0.5">
            Abra esse bot no Telegram e envie <code className="text-amber-400/90">/aquecimento</code> — sem isso a
            mídia não fica pronta antes da troca.
          </p>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => onMover(posicao, posicao - 1)}
          disabled={primeiro || !podeMexer}
          title="Subir"
          className="p-1.5 rounded-[3px] text-white/40 hover:text-white/80 hover:bg-white/[0.06] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMover(posicao, posicao + 1)}
          disabled={ultimo || !podeMexer}
          title="Descer"
          className="p-1.5 rounded-[3px] text-white/40 hover:text-white/80 hover:bg-white/[0.06] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          onClick={onRemover}
          disabled={bot.servindo || !podeMexer}
          title={bot.servindo ? 'Esse bot está atendendo agora — promova outro antes de tirá-lo' : 'Tirar da fila'}
          className="p-1.5 rounded-[3px] text-white/40 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-white/40 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Linha do seletor de bot ──────────────────────────────────────────────────

const MOTIVO_IMPEDIMENTO: Record<string, string> = {
  desativado: 'desativado na aba Bots',
  bloqueado:  'marcado como bloqueado',
  caido:      'banido pelo Telegram',
  em_uso:     'já em uso',
}

function OpcaoBot({ bot, onEscolher }: { bot: BotDisponivel; onEscolher: () => void }) {
  return (
    <button
      onClick={onEscolher}
      disabled={!bot.podeEntrar}
      title={bot.podeEntrar ? `Adicionar @${bot.username} à fila` : MOTIVO_IMPEDIMENTO[bot.impedimento!] ?? ''}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[3px] bg-white/[0.02] enabled:hover:bg-white/[0.05] border border-transparent enabled:hover:border-white/[0.08] disabled:opacity-45 disabled:cursor-not-allowed transition-colors text-left"
    >
      <div className="min-w-0 flex items-center gap-2 flex-wrap">
        <span className={`text-[13px] truncate ${bot.podeEntrar ? 'text-white/85' : 'text-white/45'}`}>
          @{bot.username}
        </span>
        {tagsDoBot(bot).map((t) => (
          <Tag key={t.texto} tom={t.tom} icone={t.icone}>{t.texto}</Tag>
        ))}
        {bot.emUsoEm && (
          <Tag tom="neutro" icone={Link2}>em “{bot.emUsoEm.nome}”</Tag>
        )}
      </div>
    </button>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ContencaoPage() {
  const { workspaceId } = useAuthStore()

  const [fluxos, setFluxos] = useState<FluxoComFila[]>([])
  const [bots, setBots] = useState<BotDisponivel[]>([])
  const [sonda, setSonda] = useState<SaudeSonda | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [adicionandoEm, setAdicionandoEm] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<{ flowId: string; de: number } | null>(null)

  const carregar = useCallback(async () => {
    if (!workspaceId) return
    try {
      const [fila, todos, saude] = await Promise.all([
        api.get<FluxoComFila[]>(`/workspaces/${workspaceId}/contencao`),
        api.get<BotDisponivel[]>(`/workspaces/${workspaceId}/contencao/bots-disponiveis`),
        api.get<SaudeSonda>(`/workspaces/${workspaceId}/contencao/saude-da-sonda`).catch(() => null),
      ])
      setFluxos(fila || [])
      setBots(todos || [])
      setSonda(saude)
      setErro(null)
    } catch (e: any) {
      setErro(e?.message || 'Não consegui carregar a contenção.')
    } finally {
      setCarregando(false)
    }
  }, [workspaceId])

  useEffect(() => { carregar() }, [carregar])

  /**
   * Reordena na tela na hora e manda a ordem inteira pro servidor. Se o servidor
   * recusar, recarrega — a tela nunca fica mostrando uma ordem que o banco não tem.
   */
  const reordenar = async (flowId: string, de: number, para: number) => {
    const fluxo = fluxos.find((f) => f.flowId === flowId)
    if (!fluxo) return

    const naFila = fluxo.bots.filter((b) => b.naFila)
    if (para < 0 || para >= naFila.length || de === para) return

    const nova = [...naFila]
    const [movido] = nova.splice(de, 1)
    nova.splice(para, 0, movido)
    const comOrdemNova = nova.map((b, i) => ({ ...b, ordem: i + 1 }))

    setFluxos((atual) => atual.map((f) => (f.flowId === flowId ? { ...f, bots: comOrdemNova } : f)))

    setSalvando(flowId)
    try {
      await api.patch(`/workspaces/${workspaceId}/contencao/flows/${flowId}`, {
        ordem: comOrdemNova.map((b) => b.botId),
      })
      setErro(null)
    } catch (e: any) {
      setErro(e?.message || 'Não consegui salvar a nova ordem.')
      await carregar()
    } finally {
      setSalvando(null)
    }
  }

  const adicionar = async (flowId: string, botId: string) => {
    setSalvando(flowId)
    try {
      await api.post(`/workspaces/${workspaceId}/contencao/flows/${flowId}`, { botId })
      setAdicionandoEm(null)
      setErro(null)
      await carregar()
    } catch (e: any) {
      setErro(e?.message || 'Não consegui adicionar esse bot.')
    } finally {
      setSalvando(null)
    }
  }

  const remover = async (flowId: string, botId: string) => {
    setSalvando(flowId)
    try {
      await api.delete(`/workspaces/${workspaceId}/contencao/flows/${flowId}/${botId}`)
      setErro(null)
      await carregar()
    } catch (e: any) {
      setErro(e?.message || 'Não consegui remover esse bot.')
    } finally {
      setSalvando(null)
    }
  }

  // ─── Resumo do topo ─────────────────────────────────────────────────────────

  const fluxosSemRede = fluxos.filter((f) => f.ativo && f.bots.filter((b) => b.naFila && !b.caido && !b.bloqueado).length <= 1).length
  const botsBanidos = bots.filter((b) => b.caido).length
  const livres = bots.filter((b) => b.podeEntrar).length

  if (carregando) {
    return (
      <div className="space-y-6">
        <PageHeader title="Contenção" description="Bots reserva que assumem o fluxo se o principal cair." />
        <div className="space-y-4">{[0, 1].map((i) => <FilaSkeleton key={i} delay={i * 60} />)}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contenção"
        description="Bots reserva que assumem o fluxo se o principal for banido. A ordem é a fila: quem está em 1º atende."
      />

      {erro && (
        <div className="flex items-start gap-3 bg-red-500/[0.06] border border-red-500/20 rounded-[4px] px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[13px] text-red-400/90 flex-1">{erro}</p>
          <button onClick={() => setErro(null)} className="text-red-400/60 hover:text-red-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* A contenção inteira depende da sonda. Se ela parar, nada assume — e
          antes isso acontecia sem ninguém ficar sabendo. */}
      {sonda && !sonda.sondaViva && (
        <div className="flex items-start gap-3 bg-red-500/[0.08] border border-red-500/30 rounded-[4px] px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13px] text-red-400 font-medium">A detecção de quedas está parada.</p>
            <p className="text-[12px] text-red-400/70 mt-0.5">
              {sonda.minutosDesdeUltimaChecagem === null
                ? 'Nenhum bot foi verificado ainda.'
                : `A última verificação foi há ${sonda.minutosDesdeUltimaChecagem} minuto(s).`}{' '}
              Enquanto isso, um bot que cair não vai ser substituído automaticamente. Avise o suporte.
            </p>
          </div>
        </div>
      )}

      {/* Números que valem uma olhada antes de mexer em qualquer coisa. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { valor: fluxosSemRede, rotulo: 'fluxos ativos sem reserva', ruim: fluxosSemRede > 0 },
          { valor: botsBanidos,   rotulo: 'bots banidos pelo Telegram', ruim: botsBanidos > 0 },
          { valor: livres,        rotulo: 'bots livres para virar reserva', ruim: false },
        ].map((c) => (
          <div key={c.rotulo} className="bg-[#141414] rounded-[4px] border border-white/[0.06] px-4 py-3">
            <p className={`text-[22px] font-semibold tabular-nums leading-none ${c.ruim ? 'text-red-400' : 'text-white/85'}`}>
              {c.valor}
            </p>
            <p className="text-[11.5px] text-white/40 mt-1.5">{c.rotulo}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-3 bg-white/[0.02] border border-white/[0.06] rounded-[4px] px-4 py-3">
        <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-white/50 leading-relaxed">
          Quando o Telegram bane um bot, a queda é detectada e o próximo da fila assume — o link do anúncio
          continua o mesmo e já aponta para ele no clique seguinte. Banimento não é revertido, então a fila só
          anda para frente: o bot caído fica na posição dele para você ver o que houve.
        </p>
      </div>

      {fluxos.length === 0 && (
        <div className="bg-[#141414] rounded-[4px] border border-white/[0.06] p-10 text-center">
          <Shield className="w-7 h-7 text-white/15 mx-auto mb-3" />
          <p className="text-[13px] text-white/50">Nenhum fluxo ainda. Crie um fluxo para montar a fila de contenção dele.</p>
        </div>
      )}

      <div className="space-y-4">
        {fluxos.map((fluxo) => {
          const naFila = fluxo.bots.filter((b) => b.naFila)
          const cheia = naFila.length >= 10
          const podeAdicionar = !cheia

          return (
            <div key={fluxo.flowId} className="bg-[#141414] rounded-[4px] border border-white/[0.06] p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[14px] font-medium text-white/90 truncate">{fluxo.nome}</h3>
                    {!fluxo.ativo && <Tag tom="neutro">inativo</Tag>}
                    {salvando === fluxo.flowId && <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />}
                  </div>
                  <p className="text-[11.5px] text-white/35 mt-1">
                    {fluxo.botDoFluxo
                      ? <>bot do fluxo: <span className={fluxo.botDoFluxo.caido ? 'text-red-400/80' : 'text-white/55'}>@{fluxo.botDoFluxo.username}</span></>
                      : 'nenhum bot conectado a este fluxo'}
                  </p>
                </div>
                <span className="text-[11px] text-white/30 tabular-nums shrink-0">{naFila.length}/10</span>
              </div>

              {fluxo.bots.length === 0 ? (
                <p className="text-[12.5px] text-white/35 mb-4">
                  Sem bot e sem fila. Conecte um bot a este fluxo antes de montar a contenção.
                </p>
              ) : (
                <div className="space-y-1.5 mb-4">
                  {fluxo.bots.map((bot, i) => {
                    const idxNaFila = naFila.findIndex((b) => b.botId === bot.botId)
                    return (
                      <LinhaBot
                        key={bot.slotId ?? `fora-${bot.botId}`}
                        bot={bot}
                        posicao={idxNaFila}
                        total={naFila.length}
                        arrastavel={naFila.length > 1}
                        onMover={(de, para) => reordenar(fluxo.flowId, de, para)}
                        onRemover={() => bot.botId && remover(fluxo.flowId, bot.botId)}
                        onArrastarInicio={() => setArrastando({ flowId: fluxo.flowId, de: idxNaFila })}
                        onArrastarSobre={(e) => e.preventDefault()}
                        onSoltar={() => {
                          if (arrastando && arrastando.flowId === fluxo.flowId && idxNaFila >= 0) {
                            reordenar(fluxo.flowId, arrastando.de, idxNaFila)
                          }
                          setArrastando(null)
                        }}
                      />
                    )
                  })}
                </div>
              )}

              {naFila.length <= 1 && fluxo.ativo && (
                <p className="text-[12px] text-amber-400/70 mb-3 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Sem rede. Se esse bot cair, o fluxo para — e o tráfego do anúncio vai para um bot morto até
                  você trocar à mão.
                </p>
              )}

              {adicionandoEm === fluxo.flowId ? (
                <div className="border border-white/[0.08] rounded-[4px] p-3 space-y-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] uppercase tracking-wide text-white/40">
                      Bots do workspace ({bots.filter((b) => b.podeEntrar).length} disponíveis)
                    </span>
                    <button onClick={() => setAdicionandoEm(null)} className="text-white/30 hover:text-white/70">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {bots.length === 0 && (
                    <p className="text-[12.5px] text-white/35 px-1 py-2">Nenhum bot cadastrado neste workspace.</p>
                  )}
                  {[...bots]
                    .sort((a, b) => Number(b.podeEntrar) - Number(a.podeEntrar))
                    .map((b) => (
                      <OpcaoBot key={b.botId} bot={b} onEscolher={() => adicionar(fluxo.flowId, b.botId)} />
                    ))}
                </div>
              ) : (
                <button
                  onClick={() => setAdicionandoEm(fluxo.flowId)}
                  disabled={!podeAdicionar}
                  className="inline-flex items-center gap-2 text-[12.5px] text-white/50 hover:text-white/90 disabled:opacity-30 disabled:hover:text-white/50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {cheia ? 'Fila cheia (10 bots)' : 'Adicionar bot à fila'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
