'use client'

// Fase 4b (v4.36.0) — modal "Revisar envio": dispara os e-mails de fatura em LOTE, em blocos
// orquestrados pelo cliente (~2,1s entre chamadas → ≤30/min por construção). Reusa a action da 4a
// (enviarEmailFatura) com override do snapshot EFÊMERO (destinatários editados só p/ este disparo,
// RE-VALIDADOS no servidor). Estado por linha recomputado AO VIVO conforme edição / "só boleto".
// Idempotência por modo (email_existentes) → reabrir o modal re-monta "Enviado" (resume). A dupla
// trava do modo real é construída aqui (texto ENVIAR) mas não acionável (EMAIL_MODO segue teste).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertTriangle, PencilLine, ExternalLink } from 'lucide-react'
import ModalCentral from '@/components/shared/modal-central'
import Badge from '@/components/ui/badge'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import { splitDestinatarios, emailValido } from '@/lib/email/destinatarios'
import { prepararEnvioEmails, enviarEmailFatura, type LinhaEnvioEmail } from '@/app/financeiro/faturamento-corp/actions'

type Estado = 'pronto' | 'atencao' | 'enviado'
type Filtro = 'todos' | 'atencao' | 'prontos' | 'enviados'
interface ResultadoLinha { fase: 'enviando' | 'enviado' | 'ja' | 'erro'; erro?: string; registroFalhou?: boolean }

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const INTERVALO_MS = 2100 // throttle no cliente: ~30/min por construção (independe do maxDuration)

interface Props {
  refs:      string[]
  emailModo: 'teste' | 'real'
  onClose:   () => void
}

export default function RevisarEnvioModal({ refs, emailModo, onClose }: Props) {
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga]   = useState<string | null>(null)
  const [linhas, setLinhas]         = useState<LinhaEnvioEmail[]>([])

  // Estado EFÊMERO por ref (vale só para este disparo — sem write-back no cadastro).
  const [draft, setDraft]         = useState<Record<string, string>>({})
  const [editado, setEditado]     = useState<Record<string, boolean>>({})
  const [soBoleto, setSoBoleto]   = useState<Record<string, boolean>>({})
  const [reenviar, setReenviar]   = useState<Record<string, boolean>>({})
  const [resultado, setResultado] = useState<Record<string, ResultadoLinha>>({})
  const [editando, setEditando]   = useState<string | null>(null)

  const [filtro, setFiltro]           = useState<Filtro>('todos')
  const [disparando, setDisparando]   = useState(false)
  const [progresso, setProgresso]     = useState<{ feito: number; total: number } | null>(null)
  const [confirmReal, setConfirmReal] = useState('')
  const [modoServidor, setModoServidor] = useState<'teste' | 'real' | null>(null) // modo apurado no SERVIDOR (fresh)
  const canceladoRef = useRef(false) // fechar o modal no meio do disparo interrompe o laço

  // Carga inicial (uma vez — `carregando` já nasce true, sem setState síncrono no efeito).
  useEffect(() => {
    let vivo = true
    prepararEnvioEmails(refs)
      .then(res => {
        if (!vivo) return
        setModoServidor(res.modo)
        setLinhas(res.linhas)
        const d: Record<string, string> = {}
        for (const l of res.linhas) d[l.ref] = l.destinatarios
        setDraft(d)
        setCarregando(false)
      })
      .catch(() => { if (vivo) { setErroCarga('Não foi possível preparar o envio (sessão ou permissão).'); setCarregando(false) } })
    return () => { vivo = false }
  }, [refs])

  // Fechar/desmontar o modal no meio do disparo interrompe o laço (não deixa e-mails saindo em 2º plano).
  useEffect(() => () => { canceladoRef.current = true }, [])

  // Estado AO VIVO de cada linha (recomputa conforme edição/só-boleto/reenvio/resultado).
  const estadoDe = useCallback((l: LinhaEnvioEmail): Estado => {
    const r = resultado[l.ref]
    if (r?.fase === 'enviado' || r?.fase === 'ja') return 'enviado'
    if (r?.fase === 'erro') return 'atencao'
    if (l.jaEnviado && !reenviar[l.ref]) return 'enviado'
    const validos = splitDestinatarios(draft[l.ref] ?? '').validos
    const notaBloq = l.notaPendente && !soBoleto[l.ref]
    const cadastroBloq = (l.noCadastro || !l.ativo) && !editado[l.ref]
    return validos.length > 0 && !notaBloq && !cadastroBloq ? 'pronto' : 'atencao'
  }, [resultado, reenviar, draft, soBoleto, editado])

  const motivoDe = useCallback((l: LinhaEnvioEmail): string | undefined => {
    const r = resultado[l.ref]
    if (r?.fase === 'erro') return r.erro || 'Falha no envio'
    if (estadoDe(l) !== 'atencao') return undefined
    const { validos, invalidos } = splitDestinatarios(draft[l.ref] ?? '')
    if (l.notaPendente && !soBoleto[l.ref]) return 'Nota fiscal pendente'
    if (validos.length === 0) return invalidos.length ? 'Destinatário inválido' : 'Sem destinatário'
    if ((l.noCadastro || !l.ativo) && !editado[l.ref]) return l.noCadastro ? 'Fora do Cadastro — confirme os destinatários' : 'Cliente inativo — confirme os destinatários'
    return 'Revisar'
  }, [resultado, estadoDe, draft, soBoleto, editado])

  const contagens = useMemo(() => {
    const c = { todos: linhas.length, atencao: 0, prontos: 0, enviados: 0 }
    for (const l of linhas) {
      const e = estadoDe(l)
      if (e === 'atencao') c.atencao++
      else if (e === 'pronto') c.prontos++
      else c.enviados++
    }
    return c
  }, [linhas, estadoDe])

  const visiveis = useMemo(() => linhas.filter(l => {
    if (filtro === 'todos') return true
    const e = estadoDe(l)
    return (filtro === 'atencao' && e === 'atencao') || (filtro === 'prontos' && e === 'pronto') || (filtro === 'enviados' && e === 'enviado')
  }), [linhas, filtro, estadoDe])

  // Modo EFETIVO = o apurado no servidor (fresh); a prop de SSR pode estar obsoleta na virada.
  const modoEfetivo = modoServidor ?? emailModo
  const confirmadoReal = modoEfetivo === 'real' ? confirmReal.trim().toUpperCase() === 'ENVIAR' : true

  // Disparo em blocos: snapshot congelado dos PRONTOS → 1 por vez, ~2,1s entre chamadas.
  const enviarLote = useCallback(async () => {
    if (disparando || !confirmadoReal) return
    const alvos = linhas.filter(l => estadoDe(l) === 'pronto').map(l => ({
      ref: l.ref,
      destinatariosOverride: splitDestinatarios(draft[l.ref] ?? '').validos,
      soBoleto: !!soBoleto[l.ref],
      forcarReenvio: !!reenviar[l.ref],
    }))
    if (alvos.length === 0) return
    setDisparando(true)
    setProgresso({ feito: 0, total: alvos.length })
    for (let i = 0; i < alvos.length; i++) {
      if (canceladoRef.current) break // modal fechado no meio → interrompe o disparo
      const a = alvos[i]
      setResultado(p => ({ ...p, [a.ref]: { fase: 'enviando' } }))
      try {
        const res = await enviarEmailFatura(a.ref, {
          destinatariosOverride: a.destinatariosOverride,
          soBoleto: a.soBoleto,
          forcarReenvio: a.forcarReenvio,
          confirmacaoReal: confirmadoReal,
        })
        setResultado(p => ({ ...p, [a.ref]: res.resultado === 'enviado' ? { fase: 'enviado', registroFalhou: res.registroFalhou } : res.resultado === 'ja_enviado' ? { fase: 'ja' } : { fase: 'erro', erro: res.erro } }))
      } catch {
        setResultado(p => ({ ...p, [a.ref]: { fase: 'erro', erro: 'Não foi possível enviar (sessão ou permissão).' } }))
      }
      setProgresso(p => (p ? { ...p, feito: p.feito + 1 } : p))
      if (i < alvos.length - 1) await delay(INTERVALO_MS)
    }
    setDisparando(false)
  }, [disparando, confirmadoReal, linhas, estadoDe, draft, soBoleto, reenviar])

  const resumo = useMemo(() => {
    const vals = Object.values(resultado)
    return {
      enviados: vals.filter(r => r.fase === 'enviado').length,
      falharam: vals.filter(r => r.fase === 'erro').length,
      pulados:  vals.filter(r => r.fase === 'ja').length,
    }
  }, [resultado])

  const badgeModo = (
    <span className={modoEfetivo === 'real'
      ? 'inline-flex items-center rounded-full border border-danger px-2 py-0.5 text-2xs font-semibold text-danger'
      : 'inline-flex items-center rounded-full border border-gestao bg-gestao-soft px-2 py-0.5 text-2xs font-semibold text-gestao-fg'}>
      {modoEfetivo === 'real' ? 'MODO REAL' : 'modo teste'}
    </span>
  )

  const PILLS: [Filtro, string, number][] = [
    ['todos', 'Todos', contagens.todos],
    ['atencao', 'Atenção', contagens.atencao],
    ['prontos', 'Prontos', contagens.prontos],
    ['enviados', 'Enviados', contagens.enviados],
  ]

  function celulaDestinatarios(l: LinhaEnvioEmail) {
    const val = draft[l.ref] ?? ''
    const { validos, invalidos } = splitDestinatarios(val)
    if (editando === l.ref) {
      return (
        <div>
          <textarea
            autoFocus
            value={val}
            onChange={e => { const v = e.target.value; setDraft(p => ({ ...p, [l.ref]: v })); setEditado(p => ({ ...p, [l.ref]: true })) }}
            onBlur={() => setEditando(null)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditando(null) }
              if (e.key === 'Escape') setEditando(null)
            }}
            rows={2}
            placeholder="email1@x.com; email2@y.com"
            className="w-full text-xs rounded border border-zinc-300 px-2 py-1 focus:border-zinc-400 foco-neutro resize-y"
          />
          <p className="text-3xs text-zinc-400 mt-0.5">separe por ponto e vírgula · Enter para concluir</p>
        </div>
      )
    }
    const partes = val.split(';').map(s => s.trim()).filter(Boolean)
    return (
      <button
        type="button"
        onClick={() => setEditando(l.ref)}
        disabled={disparando}
        className="group text-left w-full rounded px-1 py-0.5 hover:bg-zinc-50 disabled:hover:bg-transparent transition-colors"
      >
        {partes.length === 0
          ? <span className="text-xs text-zinc-400 italic">adicionar destinatário…</span>
          : <span className="text-xs break-all">{partes.map((p, i) => (
              <span key={i} className={emailValido(p) ? 'text-zinc-700' : 'text-danger'}>{i > 0 ? '; ' : ''}{p}</span>
            ))}</span>}
        <PencilLine size={11} className="inline ml-1 align-baseline text-zinc-300 group-hover:text-zinc-500" />
        {invalidos.length > 0 && (
          <span className="block text-3xs text-danger mt-0.5">{invalidos.length} inválido(s) — corrija</span>
        )}
        {validos.length > 0 && invalidos.length === 0 && val.trim() && (
          <span className="block text-3xs text-zinc-400 mt-0.5">{validos.length} destinatário(s)</span>
        )}
      </button>
    )
  }

  function celulaStatus(l: LinhaEnvioEmail) {
    const r = resultado[l.ref]
    if (r?.fase === 'enviando') {
      return <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Loader2 size={12} className="animate-spin" /> Enviando…</span>
    }
    const e = estadoDe(l)
    const badge = e === 'pronto'
      ? <Badge variant="success">Pronto</Badge>
      : e === 'enviado'
        ? <Badge variant="neutro">Enviado</Badge>
        : <Badge variant="warning">Atenção</Badge>
    const mot = motivoDe(l)
    return (
      <div className="flex flex-col gap-1 items-start">
        {badge}
        {mot && <span className="text-2xs text-zinc-500">{mot}</span>}
        {r?.fase === 'enviado' && r.registroFalhou && <span className="text-2xs text-warning">⚠ registro local falhou</span>}
        {e !== 'atencao' && (l.noCadastro || !l.ativo) && <span className="text-2xs text-warning">{l.noCadastro ? 'fora do cadastro — envio avulso' : 'cliente inativo — envio avulso'}</span>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs">
          {l.boletoUrl && (
            <a href={l.boletoUrl} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-800 inline-flex items-center gap-0.5"><ExternalLink size={10} />ver boleto</a>
          )}
          {l.notaPendente && !soBoleto[l.ref] && e !== 'enviado' && !disparando && (
            <button type="button" onClick={() => setSoBoleto(p => ({ ...p, [l.ref]: true }))} className="text-zinc-600 hover:text-zinc-900 hover:underline underline-offset-2">enviar só o boleto</button>
          )}
          {e === 'enviado' && !disparando && (
            <button type="button" onClick={() => { setReenviar(p => ({ ...p, [l.ref]: true })); setResultado(p => { const n = { ...p }; delete n[l.ref]; return n }) }} className="text-zinc-600 hover:text-zinc-900 hover:underline underline-offset-2">reenviar</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <ModalCentral titulo="Revisar envio" tituloAcessorio={badgeModo} largura="5xl" onClose={onClose}>
      {carregando ? (
        <div className="py-16 flex items-center justify-center text-zinc-400 text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Preparando o envio…</div>
      ) : erroCarga ? (
        <div className="py-12 flex flex-col items-center gap-2 text-center"><AlertTriangle size={22} className="text-warning" /><p className="text-sm text-zinc-600">{erroCarga}</p></div>
      ) : linhas.length === 0 ? (
        <div className="py-12 text-center text-sm text-zinc-500">Nenhuma fatura com boleto emitido para enviar.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Pills de filtro */}
          <div className="flex flex-wrap gap-2">
            {PILLS.map(([k, label, n]) => {
              const ativo = filtro === k
              return (
                <button key={k} type="button" onClick={() => setFiltro(k)}
                  className={[PILL_FILTRO, ativo ? '' : PILL_FILTRO_INATIVO].join(' ')}
                  style={ativo ? PILL_FILTRO_ATIVO_STYLE : undefined}>
                  {label} ({n})
                </button>
              )
            })}
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-2xs font-medium text-zinc-400 [&>th]:py-1.5 [&>th]:px-2 [&>th]:border-b [&>th]:border-zinc-100">
                  <th>Pessoa</th>
                  <th className="w-16">Nº</th>
                  <th className="w-40">Anexos</th>
                  <th className="w-[38%]">Destinatários</th>
                  <th className="w-44">Status</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr key={l.ref} className="align-top [&>td]:py-2 [&>td]:px-2 [&>td]:border-b [&>td]:border-zinc-50">
                    <td className="text-xs text-zinc-800">{l.pessoa || '—'}</td>
                    <td className="text-xs text-zinc-500 tabular-nums">{l.ref}</td>
                    <td className="text-2xs text-zinc-500">{soBoleto[l.ref] ? 'boleto (só boleto)' : l.anexosLabel}</td>
                    <td>{celulaDestinatarios(l)}</td>
                    <td>{celulaStatus(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Progresso / resumo */}
          {progresso && (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-zinc-600">
                <span>{disparando ? 'Enviando…' : 'Concluído'} — {progresso.feito} de {progresso.total}</span>
                <span className="text-2xs text-zinc-500">{resumo.enviados} enviados · {resumo.falharam} falharam · {resumo.pulados} pulados</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-200 overflow-hidden">
                <div className="h-full bg-success transition-[width] duration-300" style={{ width: `${progresso.total ? (progresso.feito / progresso.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rodapé fixo */}
      {!carregando && !erroCarga && linhas.length > 0 && (
        <div className="mt-5 pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-2xs text-zinc-400 max-w-md">As correções valem só para este envio — o permanente é no Cadastro de Clientes.</p>
          <div className="flex items-center gap-3">
            {modoEfetivo === 'real' && (
              <input
                value={confirmReal}
                onChange={e => setConfirmReal(e.target.value)}
                disabled={disparando}
                placeholder="digite ENVIAR"
                className="w-32 text-xs rounded border border-danger px-2 py-1.5 foco-neutro disabled:opacity-50"
              />
            )}
            <button
              type="button"
              onClick={() => void enviarLote()}
              disabled={disparando || contagens.prontos === 0 || !confirmadoReal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {disparando && <Loader2 size={14} className="animate-spin" />}
              Enviar {contagens.prontos} {contagens.prontos === 1 ? 'e-mail' : 'e-mails'}
            </button>
          </div>
        </div>
      )}
    </ModalCentral>
  )
}
