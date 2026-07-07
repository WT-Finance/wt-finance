'use client'

// Fase 4b (v4.36.0) — modal "Revisar envio": dispara os e-mails de fatura em LOTE, em blocos
// orquestrados pelo cliente (~2,1s entre chamadas → ≤30/min por construção). Reusa a action da 4a
// (enviarEmailFatura) com override do snapshot EFÊMERO (destinatários editados só p/ este disparo,
// RE-VALIDADOS no servidor). Idempotência por modo (email_existentes) → reabrir o modal re-monta
// "Já enviado" (resume). A dupla trava do modo real é construída aqui (texto ENVIAR) mas não
// acionável (EMAIL_MODO segue teste).
//
// v4.38.0 — a coluna Status vira MENSAGEM PURA em 4 cores (Pronto/Sem destinatário/Nota fiscal
// pendente/Já enviado) e ganha uma coluna ENVIAR (checkbox) à direita, com semântica exata:
//   • Pronto (verde) → marcado por default.
//   • Nota fiscal pendente (amarelo) → desmarcado, marcável: marcar = enviar SÓ o boleto (soBoleto).
//   • Já enviado (cinza) → desmarcado, marcável: marcar = REENVIO (forcarReenvio).
//   • Sem destinatário (vermelho) → checkbox DESABILITADO até corrigir a célula (corrigiu → Pronto,
//     marcado). O checkbox do CABEÇALHO marca/desmarca SÓ os Pronto (nunca pendente/enviado em massa).
// Cor/status reflete a SITUAÇÃO (independe do checkbox); a decisão de envio vive no gesto, sem links
// nem sublabels no status. Cabeçalho e rodapé fixos (a tabela rola por dentro — receita DS §7).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertTriangle, PencilLine, ExternalLink, Paperclip, X } from 'lucide-react'
import ModalCentral from '@/components/shared/modal-central'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import { splitDestinatarios, emailValido } from '@/lib/email/destinatarios'
import { prepararEnvioEmails, enviarEmailFatura, type LinhaEnvioEmail } from '@/app/financeiro/faturamento-corp/actions'

// Situação (steady) de cada linha — a cor pura do Status. As fases de disparo (enviando/enviado/erro)
// vêm do resultado e são tratadas antes destas no render.
type Situacao = 'pronto' | 'sem_dest' | 'nota_pendente' | 'ja_enviado'
type Filtro = 'todos' | 'atencao' | 'prontos' | 'enviados'
interface ResultadoLinha { fase: 'enviando' | 'enviado' | 'ja' | 'erro'; erro?: string; registroFalhou?: boolean }

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const INTERVALO_MS = 2100 // throttle no cliente: ~30/min por construção (independe do maxDuration)

// Anexo "Outros" (v4.38.0): arquivo local do operador anexado a UM e-mail, além de boleto/nota.
// Viaja em base64 no payload da action (bodySizeLimit 25mb; 1 fatura por chamada). Limite defensivo
// por arquivo — o corte final e a regra "anexo-falha = envio-falha" vivem na camada src/lib/email.
interface AnexoExtra { nome: string; tipo: string; base64: string }
const LIM_ANEXO_MB = 10

/** File → base64 puro (sem o prefixo data:...;base64,). Usado no upload por-linha de "Outros". */
function fileParaBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)) }
    r.onerror = () => reject(new Error('não foi possível ler o arquivo'))
    r.readAsDataURL(f)
  })
}

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
  const [draft, setDraft]           = useState<Record<string, string>>({})
  const [soBoleto, setSoBoleto]     = useState<Record<string, boolean>>({})   // marcar "nota pendente" → só boleto
  const [reenviar, setReenviar]     = useState<Record<string, boolean>>({})   // marcar "já enviado" → reenvio
  const [desmarcado, setDesmarcado] = useState<Record<string, boolean>>({})   // desmarcar um Pronto (default = marcado)
  const [anexosExtra, setAnexosExtra] = useState<Record<string, AnexoExtra[]>>({}) // "Outros" por-linha
  const [avisoAnexo, setAvisoAnexo]   = useState<Record<string, string>>({})       // arquivo rejeitado (grande/ilegível)
  const [resultado, setResultado]   = useState<Record<string, ResultadoLinha>>({})
  const [editando, setEditando]     = useState<string | null>(null)

  const [filtro, setFiltro]           = useState<Filtro>('todos')
  const [rolado, setRolado]           = useState(false)
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

  const validosDe = useCallback((ref: string) => splitDestinatarios(draft[ref] ?? '').validos, [draft])

  // Situação STEADY (cor pura do Status). Independe de soBoleto/reenviar — a decisão de envio é o
  // checkbox; a cor mostra a realidade (nota pendente continua amarela mesmo marcada como "só boleto").
  const situacaoDe = useCallback((l: LinhaEnvioEmail): Situacao => {
    if (l.jaEnviado) return 'ja_enviado'
    if (validosDe(l.ref).length === 0) return 'sem_dest'
    if (l.notaPendente) return 'nota_pendente'
    return 'pronto'
  }, [validosDe])

  // Checkbox DESABILITADO: em disparo, já concluído, ou sem destinatário válido (corrige a célula 1º).
  const checkboxDesabilitado = useCallback((l: LinhaEnvioEmail): boolean => {
    const r = resultado[l.ref]
    if (r?.fase === 'enviando' || r?.fase === 'enviado' || r?.fase === 'ja') return true
    return validosDe(l.ref).length === 0
  }, [resultado, validosDe])

  // MARCADO (= entra no disparo). Pronto → default marcado; pendente → só se "só boleto"; já enviado →
  // só se "reenvio"; sem destinatário / concluído → nunca.
  const marcadoDe = useCallback((l: LinhaEnvioEmail): boolean => {
    const r = resultado[l.ref]
    if (r?.fase === 'enviando') return true
    if (r?.fase === 'enviado' || r?.fase === 'ja') return false
    if (validosDe(l.ref).length === 0) return false
    if (l.jaEnviado) return !!reenviar[l.ref]
    if (l.notaPendente) return !!soBoleto[l.ref]
    return !desmarcado[l.ref]
  }, [resultado, validosDe, reenviar, soBoleto, desmarcado])

  // Alterna o checkbox de UMA linha — o gesto carrega a semântica (só boleto / reenvio / des/marcar).
  function alternar(l: LinhaEnvioEmail, marcar: boolean) {
    if (checkboxDesabilitado(l)) return
    if (l.jaEnviado)        setReenviar(p => ({ ...p, [l.ref]: marcar }))
    else if (l.notaPendente) setSoBoleto(p => ({ ...p, [l.ref]: marcar }))
    else                     setDesmarcado(p => ({ ...p, [l.ref]: !marcar }))
  }

  // Prontos AINDA em jogo (exclui os que já saíram/estão saindo neste disparo) — o checkbox do
  // cabeçalho e sua contagem só falam dos que dá para (des)marcar agora; senão o header ficaria
  // "marcado" após um lote enquanto o rodapé já mostra 0 marcados.
  const prontos = useMemo(() => linhas.filter(l => {
    const f = resultado[l.ref]?.fase
    return f !== 'enviando' && f !== 'enviado' && f !== 'ja' && situacaoDe(l) === 'pronto'
  }), [linhas, situacaoDe, resultado])
  const prontosMarcados = useMemo(() => prontos.filter(l => !desmarcado[l.ref]).length, [prontos, desmarcado])

  // Anexos "Outros" por-linha: lê os arquivos como base64, aplica o limite por arquivo e acumula.
  // Arquivo grande/ilegível é IGNORADO com um aviso na célula (nunca falha o modal).
  async function adicionarAnexos(ref: string, files: FileList | null) {
    if (!files || files.length === 0) return
    const novos: AnexoExtra[] = []
    let rejeitados = 0
    for (const f of Array.from(files)) {
      if (f.size > LIM_ANEXO_MB * 1024 * 1024) { rejeitados++; continue }
      try { novos.push({ nome: f.name, tipo: f.type || 'application/octet-stream', base64: await fileParaBase64(f) }) }
      catch { rejeitados++ }
    }
    if (novos.length) setAnexosExtra(p => ({ ...p, [ref]: [...(p[ref] ?? []), ...novos] }))
    setAvisoAnexo(p => ({ ...p, [ref]: rejeitados > 0 ? `${rejeitados} arquivo(s) acima de ${LIM_ANEXO_MB} MB ou ilegível(is) — ignorado(s)` : '' }))
  }
  function removerAnexo(ref: string, idx: number) {
    setAnexosExtra(p => ({ ...p, [ref]: (p[ref] ?? []).filter((_, i) => i !== idx) }))
  }

  // Cabeçalho marca/desmarca SÓ os Pronto (nunca pendente/enviado em massa).
  function alternarTodosPronto(marcar: boolean) {
    setDesmarcado(prev => {
      const next = { ...prev }
      for (const l of prontos) next[l.ref] = !marcar
      return next
    })
  }

  const nMarcados = useMemo(() => linhas.filter(marcadoDe).length, [linhas, marcadoDe])

  const contagens = useMemo(() => {
    const c = { todos: linhas.length, atencao: 0, prontos: 0, enviados: 0 }
    for (const l of linhas) {
      const r = resultado[l.ref]
      if (r?.fase === 'enviado' || r?.fase === 'ja') { c.enviados++; continue }
      if (r?.fase === 'erro') { c.atencao++; continue }
      const s = situacaoDe(l)
      if (s === 'ja_enviado') c.enviados++
      else if (s === 'pronto') c.prontos++
      else c.atencao++ // sem_dest + nota_pendente
    }
    return c
  }, [linhas, resultado, situacaoDe])

  const visiveis = useMemo(() => linhas.filter(l => {
    if (filtro === 'todos') return true
    const r = resultado[l.ref]
    const enviado = r?.fase === 'enviado' || r?.fase === 'ja' || situacaoDe(l) === 'ja_enviado'
    if (filtro === 'enviados') return enviado
    if (filtro === 'prontos') return !enviado && r?.fase !== 'erro' && situacaoDe(l) === 'pronto'
    // atenção
    return !enviado && (r?.fase === 'erro' || situacaoDe(l) === 'sem_dest' || situacaoDe(l) === 'nota_pendente')
  }), [linhas, filtro, resultado, situacaoDe])

  // Modo EFETIVO = o apurado no servidor (fresh); a prop de SSR pode estar obsoleta na virada.
  const modoEfetivo = modoServidor ?? emailModo
  const confirmadoReal = modoEfetivo === 'real' ? confirmReal.trim().toUpperCase() === 'ENVIAR' : true

  // Disparo em blocos: snapshot congelado dos MARCADOS → 1 por vez, ~2,1s entre chamadas.
  const enviarLote = useCallback(async () => {
    if (disparando || !confirmadoReal) return
    const alvos = linhas.filter(marcadoDe).map(l => ({
      ref: l.ref,
      destinatariosOverride: splitDestinatarios(draft[l.ref] ?? '').validos,
      soBoleto: !!soBoleto[l.ref],
      forcarReenvio: !!reenviar[l.ref],
      anexosExtra: anexosExtra[l.ref] ?? [],
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
          anexosExtra: a.anexosExtra,
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
  }, [disparando, confirmadoReal, linhas, marcadoDe, draft, soBoleto, reenviar, anexosExtra])

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

  // ── Célula de destinatários (editável; efêmera). Inválidos em vermelho na própria string. ──
  function celulaDestinatarios(l: LinhaEnvioEmail) {
    const val = draft[l.ref] ?? ''
    const { validos, invalidos } = splitDestinatarios(val)
    if (editando === l.ref) {
      return (
        <div>
          <textarea
            autoFocus
            value={val}
            onChange={e => { const v = e.target.value; setDraft(p => ({ ...p, [l.ref]: v })) }}
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

  // ── Célula de anexos: badges do boleto/nota (abrem o arquivo) + anexos "Outros" (upload por-linha,
  //    removíveis) + botão de adicionar. "Só boleto" oculta a nota. Os "Outros" viajam no disparo. ──
  function celulaAnexos(l: LinhaEnvioEmail) {
    const so = !!soBoleto[l.ref]
    const extras = anexosExtra[l.ref] ?? []
    const aviso = avisoAnexo[l.ref]
    const semAnexo = !l.boletoUrl && !l.notaUrl && extras.length === 0
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {l.boletoUrl && <BadgeAnexo url={l.boletoUrl} label="Boleto" />}
          {!so && l.notaUrl && <BadgeAnexo url={l.notaUrl} label="Nota fiscal" />}
          {so && <span className="text-2xs text-zinc-400 italic">só boleto</span>}
          {semAnexo && <span className="text-2xs text-zinc-300">—</span>}
          {extras.map((a, i) => (
            <span key={i} className="inline-flex max-w-[10rem] items-center gap-1 rounded border border-action-soft-border bg-action-soft px-1.5 py-0.5 text-2xs text-action-primary">
              <span className="truncate" title={a.nome}>{a.nome}</span>
              {!disparando && (
                <button type="button" onClick={() => removerAnexo(l.ref, i)} aria-label={`Remover anexo ${a.nome}`}
                  className="foco-neutro shrink-0 text-action-primary/70 hover:text-danger">
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
          {!disparando && (
            <label className="foco-neutro inline-flex cursor-pointer items-center gap-0.5 rounded border border-dashed border-zinc-300 px-1.5 py-0.5 text-2xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-700">
              <Paperclip size={10} /> Outros
              <input type="file" multiple className="hidden"
                onChange={e => { void adicionarAnexos(l.ref, e.target.files); e.target.value = '' }} />
            </label>
          )}
        </div>
        {aviso && <span className="text-3xs text-warning">{aviso}</span>}
      </div>
    )
  }

  // ── Status: MENSAGEM PURA em 4 cores (+ fases de disparo). Sem pills, sem links, sem sublabels. ──
  function celulaStatus(l: LinhaEnvioEmail) {
    const r = resultado[l.ref]
    if (r?.fase === 'enviando') return <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Loader2 size={12} className="animate-spin" /> Enviando…</span>
    if (r?.fase === 'enviado')  return <span className="text-xs font-medium text-success">Enviado{r.registroFalhou ? ' · registro local falhou' : ''}</span>
    if (r?.fase === 'ja')       return <span className="text-xs text-zinc-500">Já enviado</span>
    if (r?.fase === 'erro')     return <span className="text-xs text-danger">Falha no envio: {r.erro}</span>
    switch (situacaoDe(l)) {
      case 'ja_enviado':    return <span className="text-xs text-zinc-500">Já enviado</span>
      case 'sem_dest':      return <span className="text-xs font-medium text-danger">Sem destinatário</span>
      case 'nota_pendente': return <span className="text-xs font-medium text-warning">Nota fiscal pendente</span>
      default:              return <span className="text-xs font-medium text-success">Pronto</span>
    }
  }

  // ── Rodapé FIXO: progresso (durante/após o disparo) + contador "N marcados" + botão "Enviar N". ──
  const rodape = (!carregando && !erroCarga && linhas.length > 0) ? (
    <div className="flex flex-col gap-3">
      {progresso && (
        <div>
          <div className="flex items-center justify-between text-xs text-zinc-600">
            <span>{disparando ? 'Enviando…' : 'Concluído'} — {progresso.feito} de {progresso.total}</span>
            <span className="text-2xs text-zinc-500">{resumo.enviados} enviados · {resumo.falharam} falharam · {resumo.pulados} pulados</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-200 overflow-hidden">
            <div className="h-full bg-success transition-[width] duration-300" style={{ width: `${progresso.total ? (progresso.feito / progresso.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-2xs text-zinc-400 max-w-md">
          <b className="text-zinc-600 tabular-nums">{nMarcados}</b> {nMarcados === 1 ? 'marcado' : 'marcados'} · as correções valem só para este envio — o permanente é no Cadastro de Clientes.
        </p>
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
            disabled={disparando || nMarcados === 0 || !confirmadoReal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {disparando && <Loader2 size={14} className="animate-spin" />}
            Enviar {nMarcados} {nMarcados === 1 ? 'e-mail' : 'e-mails'}
          </button>
        </div>
      </div>
    </div>
  ) : undefined

  return (
    <ModalCentral
      titulo="Revisar e-mails antes do envio"
      subtitulo="Revise as informações antes do envio dos e-mails, edite destinatários e inclua anexos"
      tituloAcessorio={badgeModo} largura="5xl" corpoFlex alturaFixa rodape={rodape} onClose={onClose}
    >
      {carregando ? (
        <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Preparando o envio…</div>
      ) : erroCarga ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6"><AlertTriangle size={22} className="text-warning" /><p className="text-sm text-zinc-600">{erroCarga}</p></div>
      ) : linhas.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">Nenhuma fatura com boleto emitido para enviar.</div>
      ) : (
        <>
          {/* Pills de filtro (fixas no topo) */}
          <div className="shrink-0 px-6 pt-5 pb-3 flex flex-wrap gap-2">
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

          {/* Tabela rolável — cabeçalho fixo (receita border-separate/DS §7). */}
          <div className="flex-1 min-h-0 overflow-auto px-6 pb-4" onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}>
            <table className="w-full border-separate border-spacing-0 text-left">
              <thead className={`sticky top-0 z-20 text-2xs font-medium text-zinc-400 [&_th]:bg-zinc-50 [&_th]:py-2 [&_th]:px-2 [&_tr:first-child_th]:border-b [&_tr:first-child_th]:border-zinc-200 [&_tr:first-child_th:first-child]:rounded-tl-lg [&_tr:first-child_th:last-child]:rounded-tr-lg ${rolado ? '[&_tr:last-child_th]:shadow-[0_2px_4px_-2px_rgba(0,0,0,0.12)]' : ''}`}>
                <tr>
                  <th>Pessoa</th>
                  <th className="w-20">Fatura Nº</th>
                  <th className="w-52">Anexos</th>
                  <th className="w-[30%]">Destinatários</th>
                  <th className="w-40">Status</th>
                  <th className="w-16 text-center">
                    <span className="inline-flex items-center justify-center" title="Marcar/desmarcar todos os Prontos">
                      <input
                        type="checkbox"
                        ref={el => { if (el) el.indeterminate = prontos.length > 0 && prontosMarcados > 0 && prontosMarcados < prontos.length }}
                        checked={prontos.length > 0 && prontosMarcados === prontos.length}
                        disabled={prontos.length === 0 || disparando}
                        onChange={e => alternarTodosPronto(e.target.checked)}
                        className="h-4 w-4 accent-zinc-700 foco-neutro disabled:opacity-40"
                        aria-label="Marcar ou desmarcar todos os prontos"
                      />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr key={l.ref} className="align-top [&>td]:border-b [&>td]:border-zinc-50 [&>td]:py-2 [&>td]:px-2">
                    <td className="text-xs text-zinc-800">{l.pessoa || '—'}</td>
                    <td className="text-xs text-zinc-500 tabular-nums">{l.ref}</td>
                    <td>{celulaAnexos(l)}</td>
                    <td>{celulaDestinatarios(l)}</td>
                    <td>{celulaStatus(l)}</td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={marcadoDe(l)}
                        disabled={checkboxDesabilitado(l)}
                        onChange={e => alternar(l, e.target.checked)}
                        className="h-4 w-4 accent-zinc-700 foco-neutro disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Enviar para ${l.pessoa || l.ref}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ModalCentral>
  )
}

// Badge de anexo — chip clicável que abre o arquivo (boleto/nota) em nova aba.
function BadgeAnexo({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="foco-neutro inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-2xs text-zinc-600 hover:border-zinc-300 hover:text-zinc-800">
      {label} <ExternalLink size={10} />
    </a>
  )
}
