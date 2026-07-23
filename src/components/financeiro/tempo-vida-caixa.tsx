import { fmtAxisMes } from '@/lib/fmt'
import Tooltip from '@/components/ui/tooltip'
import { calcularCobertura, type CoberturaEstimativa } from '@/lib/fluxo/cobertura'
import type { CoberturaData } from '@/lib/fluxo/rpc-fluxo'

// Tempo de Vida · Runway de Caixa (v5.2.0, ajuste do checkpoint) — régua de fôlego no
// modelo da referência da controladoria: recebíveis EM ABERTO ÷ saída média mensal =
// cobertura em MESES, plotada numa régua 0–12m com as zonas de mercado (0–3 risco ·
// 3–6 atenção · 6–12 ideal p/ turismo/sazonal). DUAS estimativas pontuais, cada uma com
// IC 95% (t de Student sobre a média das saídas mensais — src/lib/fluxo/cobertura.ts):
//   • SEM antecipação (recebíveis brutos) — marcador escuro, acima da régua;
//   • COM antecipação (−4% de taxa média) — marcador cinza, abaixo da régua (cenário
//     derivado → whisker tracejado, convenção sólido=real/tracejado=derivado).
// Régua com o que está LANÇADO hoje: não inclui saldo bancário nem vendas futuras.

const ESCALA_MAX = 12 // meses (teto da régua, como na referência)

/** Posição na régua (%), clampada em [0, ESCALA_MAX]. */
function pct(v: number): number {
  return (Math.min(Math.max(v, 0), ESCALA_MAX) / ESCALA_MAX) * 100
}

/** Meses com 1 casa, compacto: 3.82 → '3,8m' (rótulos da régua e ICs). */
function fmtM(v: number): string {
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}m`
}

/** Meses com 1 casa, por extenso: 3.82 → '3,8 meses' (manchete e texto corrido). */
function fmtMExtenso(v: number): string {
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses`
}

/** 'IC 2,9–5,2m' (teto aberto → '2,9m–∞'). */
function fmtIC(e: CoberturaEstimativa): string {
  return e.icHi === null ? `IC ${fmtM(e.icLo)}–∞` : `IC ${fmtM(e.icLo)}–${fmtM(e.icHi)}`
}

/** Whisker do IC + ponto + pino, numa faixa própria (acima ou abaixo da régua). */
function Marcador({ e, cor, lado, rotulo, tracejado = false }: {
  e:          CoberturaEstimativa
  cor:        string
  lado:       'cima' | 'baixo'
  rotulo:     string
  tracejado?: boolean
}) {
  const pPonto = pct(e.meses)
  const pLo    = pct(e.icLo)
  const pHi    = pct(e.icHi ?? ESCALA_MAX)
  // O rótulo é clampado para não vazar do card nas pontas da régua.
  const pRotulo = Math.min(Math.max(pPonto, 12), 88)
  const cima    = lado === 'cima'

  return (
    <div className="relative h-11">
      {/* rótulo (valor + IC) */}
      <div
        className={`absolute ${cima ? 'top-0' : 'bottom-0'} -translate-x-1/2 text-2xs whitespace-nowrap`}
        style={{ left: `${pRotulo}%`, color: cor }}
      >
        <span className="font-semibold">{rotulo} {fmtM(e.meses)}</span>
        <span className="opacity-70"> · {fmtIC(e)}</span>
      </div>
      {/* whisker do IC (tracejado = cenário derivado) */}
      <div
        className={`absolute ${cima ? 'bottom-[13px]' : 'top-[13px]'}`}
        style={{
          left: `${pLo}%`, width: `${Math.max(pHi - pLo, 0)}%`,
          borderTop: `1.5px ${tracejado ? 'dashed' : 'solid'} ${cor}`, opacity: 0.55,
        }}
      />
      {/* pontas do whisker */}
      <div className={`absolute ${cima ? 'bottom-[10px]' : 'top-[10px]'} w-px h-[7px]`} style={{ left: `${pLo}%`, background: cor, opacity: 0.55 }} />
      {e.icHi !== null && (
        <div className={`absolute ${cima ? 'bottom-[10px]' : 'top-[10px]'} w-px h-[7px]`} style={{ left: `${pHi}%`, background: cor, opacity: 0.55 }} />
      )}
      {/* estimativa pontual + pino até a régua (o pino de BAIXO atravessa a linha da
          escala — h-4 + mt-0.5 = 18px — que fica colada na barra) */}
      <div className={`absolute ${cima ? 'bottom-[9px]' : 'top-[9px]'} w-2.5 h-2.5 rounded-full -translate-x-1/2`} style={{ left: `${pPonto}%`, background: cor }} />
      <div className={`absolute ${cima ? 'bottom-0 h-[11px]' : '-top-[18px] h-[29px]'} w-0.5 -translate-x-1/2`} style={{ left: `${pPonto}%`, background: cor }} />
    </div>
  )
}

interface Props {
  data: CoberturaData
}

export default function TempoVidaCaixa({ data }: Props) {
  const calc = calcularCobertura(data.recebiveis, data.saidas_mensais.map(m => m.s))

  if (!calc) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5">
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Runway de Caixa</h3>
        <div className="h-24 flex items-center justify-center text-sm text-zinc-400">
          Sem base para calcular (recebíveis em aberto e meses fechados de movimentação)
        </div>
      </div>
    )
  }

  const meses  = data.saidas_mensais
  const janela = meses.length === 1
    ? fmtAxisMes(meses[0].mes)
    : `${fmtAxisMes(meses[0].mes)}–${fmtAxisMes(meses[meses.length - 1].mes)}`

  return (
    <div className="rounded-xl shadow-sm bg-white p-5">
      <div className="mb-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Runway de Caixa</h3>
          {/* Botão "?" de explicação — mesmo padrão do resto da plataforma (Tooltip + círculo). */}
          <Tooltip
            conteudo={`Recebíveis em aberto ÷ saída média mensal (${janela}, n=${calc.n}) · IC 95% via t de Student · "com antecipação" desconta a taxa média de 4% dos recebíveis · régua com o que está lançado hoje — não inclui saldo bancário nem vendas futuras.`}
            className="z-30 w-72 !whitespace-normal font-normal leading-snug"
          >
            <span aria-label="Como o Runway de Caixa é calculado" className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400">?</span>
          </Tooltip>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-3xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {fmtMExtenso(calc.semTaxa.meses)}
          </span>
          {/* Pior cenário = piso do IC 95% da estimativa COM antecipação (a leitura mais
              conservadora do card: taxa descontada E saída média na ponta alta do IC). */}
          <span className="text-sm text-zinc-400 tabular-nums">
            | {fmtMExtenso(calc.comTaxa.icLo)} no pior cenário
          </span>
        </div>
      </div>

      {/* Marcador SEM antecipação (acima da régua) */}
      <Marcador e={calc.semTaxa} cor="var(--text-primary)" lado="cima" rotulo="sem antecipação" />

      {/* Régua 0–12m com as zonas de mercado */}
      <div className="flex h-7 rounded-full overflow-hidden">
        <div className="flex items-center justify-center text-2xs font-medium" style={{ width: '25%', background: 'var(--negative-soft)', color: 'var(--negative-deep)' }}>risco</div>
        <div className="flex items-center justify-center text-2xs font-medium" style={{ width: '25%', background: 'var(--warning-bg)', color: 'var(--warning)' }}>atenção</div>
        <div className="flex items-center justify-center text-2xs font-medium" style={{ width: '50%', background: 'var(--positive-soft)', color: 'var(--positive-deep)' }}>ideal</div>
      </div>

      {/* Escala — COLADA na barra (o marcador de baixo vem depois, com o pino atravessando) */}
      <div className="relative h-4 mt-0.5 text-2xs text-zinc-400">
        <span className="absolute left-0">0m</span>
        <span className="absolute -translate-x-1/2" style={{ left: '25%' }}>3m</span>
        <span className="absolute -translate-x-1/2" style={{ left: '50%' }}>6m</span>
        <span className="absolute right-0">12m</span>
      </div>

      {/* Marcador COM antecipação (abaixo da régua; cenário derivado → tracejado) */}
      <Marcador e={calc.comTaxa} cor="var(--text-muted)" lado="baixo" rotulo="com antecipação (−4%)" tracejado />
    </div>
  )
}
