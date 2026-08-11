'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '@/components/ui/button'
import { MAX_MESES_COMPARATIVO, ANO_MINIMO_COMPARATIVO, chaveMes, type MesRef } from '@/lib/metas/comparativo'

// Popover de seleção ADITIVA de meses do Comparativo de Metas (v5.6.1) — grade por
// ano (mais recente primeiro), 12 meses por bloco, teto de MAX_MESES_COMPARATIVO. O
// estado CONFIRMADO (prop `selecionados`, do pai) só muda no "Aplicar"; Esc/click-
// fora/scroll/resize fecham SEM aplicar.
//
// A posição (`pos`) é calculada pelo CHAMADOR no clique que abre — mesma mecânica de
// FiltroVencimento em financeiro/gerencial/base-dados-tab.tsx (getBoundingClientRect +
// clamp no viewport + portal para document.body). Necessário porque este popover vive
// dentro da cortina de uma TopSection, e a skill ui-design-system (§2.1) veta
// position:absolute ali — o overflow-hidden do clip corta popover/tooltip/menu. (A
// delegação citou periodo-filter-pills-url.tsx como referência; aquele popover NÃO
// usa portal — é o de FiltroVencimento que tem a mecânica de portal+clamp que este
// caso precisa. Ver out-briefing.)
//
// A seleção EM ANDAMENTO é local a este componente e nasce do prop a CADA ABERTURA:
// o pai só monta <SeletorMesesPopover> quando `aberto` e `pos` estão prontos, então
// cada abertura é uma montagem NOVA — o initializer do useState já resolve isso, sem
// precisar de um efeito de sincronização (react-padroes §1b).

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface Props {
  selecionados: MesRef[]
  onAplicar: (meses: MesRef[]) => void
  aberto: boolean
  onFechar: () => void
  /** Calculado pelo chamador (getBoundingClientRect + clamp) no clique que abre. */
  pos: { top: number; left: number } | null
}

export default function SeletorMeses({ selecionados, onAplicar, aberto, onFechar, pos }: Props) {
  if (!aberto || !pos) return null
  return <SeletorMesesPopover selecionados={selecionados} onAplicar={onAplicar} onFechar={onFechar} pos={pos} />
}

function SeletorMesesPopover({ selecionados, onAplicar, onFechar, pos }: {
  selecionados: MesRef[]
  onAplicar: (meses: MesRef[]) => void
  onFechar: () => void
  pos: { top: number; left: number }
}) {
  const [escolhidos, setEscolhidos] = useState<MesRef[]>(() => selecionados)
  const painelRef = useRef<HTMLDivElement>(null)

  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1
  const anos: number[] = []
  for (let a = anoAtual; a >= ANO_MINIMO_COMPARATIVO; a--) anos.push(a)

  // Esc fecha sem aplicar; scroll/resize fecham (a `pos` calculada no clique ficaria
  // desalinhada) — molde de FiltroVencimento.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', aoTeclar)
    window.addEventListener('scroll', onFechar, true)
    window.addEventListener('resize', onFechar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      window.removeEventListener('scroll', onFechar, true)
      window.removeEventListener('resize', onFechar)
    }
  }, [onFechar])

  // Gestão de foco do dialog (APG): move o foco para o painel ao abrir e DEVOLVE ao
  // gatilho (elemento focado antes) ao fechar — cada abertura é uma montagem nova,
  // então mount/cleanup cobrem o ciclo inteiro.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    painelRef.current?.focus()
    return () => anterior?.focus()
  }, [])

  // Prende o Tab dentro do painel (aria-modal exige): cicla entre o primeiro e o
  // último focável habilitado.
  function prenderTab(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return
    const focaveis = painelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')
    if (!focaveis || focaveis.length === 0) return
    const primeiro = focaveis[0]
    const ultimo = focaveis[focaveis.length - 1]
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
  }

  function toggle(m: MesRef) {
    const chave = chaveMes(m)
    const jaEscolhido = escolhidos.some(e => chaveMes(e) === chave)
    if (jaEscolhido) { setEscolhidos(escolhidos.filter(e => chaveMes(e) !== chave)); return }
    if (escolhidos.length >= MAX_MESES_COMPARATIVO) return
    setEscolhidos([...escolhidos, m])
  }

  return createPortal(
    <>
      {/* Backdrop full-screen (irmão do popover, não ancestral) — clique fora fecha sem
          aplicar. Como é IRMÃO (não envolve o popover), o clique DENTRO do popover não
          borbulha para aqui — sem precisar de stopPropagation (molde de FiltroVencimento). */}
      <div className="fixed inset-0 z-40" onMouseDown={onFechar} />
      <div
        ref={painelRef}
        tabIndex={-1}
        onKeyDown={prenderTab}
        role="dialog"
        aria-modal="true"
        aria-label="Selecionar meses para comparação"
        className="foco-neutro fixed z-50 w-[360px] rounded-xl border border-zinc-200 bg-white p-4 shadow-lg font-sans"
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Selecione os meses</p>
          <span className="text-2xs font-medium tabular-nums text-[var(--text-muted)]">
            {escolhidos.length}/{MAX_MESES_COMPARATIVO}
          </span>
        </div>

        <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
          {anos.map(ano => (
            <div key={ano}>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {ano}
              </p>
              <div role="group" aria-label={`Meses de ${ano}`} className="grid grid-cols-4 gap-1.5">
                {NOMES_MES.map((nome, i) => {
                  const mes = i + 1
                  const m: MesRef = { ano, mes }
                  const chave = chaveMes(m)
                  const selecionado = escolhidos.some(e => chaveMes(e) === chave)
                  const futuro = ano === anoAtual && mes > mesAtual
                  const noTeto = !selecionado && escolhidos.length >= MAX_MESES_COMPARATIVO
                  const desabilitado = futuro || noTeto
                  return (
                    <button
                      key={chave}
                      type="button"
                      aria-pressed={selecionado}
                      disabled={desabilitado}
                      onClick={() => toggle(m)}
                      className={[
                        'foco-neutro rounded-md border px-1 py-1.5 text-2xs font-medium transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                        selecionado ? '' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50',
                      ].join(' ')}
                      style={selecionado ? {
                        background:  'var(--action-soft)',
                        borderColor: 'var(--action-soft-border)',
                        color:       'var(--action-soft-fg)',
                      } : undefined}
                    >
                      {nome}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-3">
          <button
            type="button"
            onClick={() => setEscolhidos([])}
            className="foco-neutro text-2xs text-zinc-400 transition-colors hover:text-zinc-600"
          >
            Limpar
          </button>
          <Button
            variant="solido"
            size="sm"
            disabled={escolhidos.length === 0}
            onClick={() => onAplicar([...escolhidos].sort((a, b) => chaveMes(a).localeCompare(chaveMes(b))))}
          >
            Aplicar
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}
