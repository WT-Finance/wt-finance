import type { PontoAtencao, ResultadoAlertas } from '@/lib/regras-alerta'

const MAX_ALERTAS = 3

function AlertaItem({ ponto }: { ponto: PontoAtencao }) {
  const isVermelho = ponto.severidade === 'vermelho'
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border-l-2 text-sm ${
      isVermelho
        ? 'bg-danger-bg border-danger text-danger'
        : 'bg-warning-bg border-warning text-warning'
    }`}>
      <span className="shrink-0 mt-px">{isVermelho ? '▼' : '⚠'}</span>
      <p>{ponto.mensagem}</p>
    </div>
  )
}

interface Props {
  resultado: ResultadoAlertas
}

export default function PontosAtencaoCard({ resultado }: Props) {
  if (resultado.estado === 'sem_dados') return null

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4 mt-6">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
        ⚠ Pontos de atenção
      </p>

      {resultado.estado === 'sem_alertas' ? (
        <div className="flex items-center gap-2 text-success text-sm">
          <span>✓</span>
          <span>Sem pontos de atenção identificados no período.</span>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {resultado.pontos.map((p, i) => (
              <AlertaItem key={i} ponto={p} />
            ))}
          </div>
          {resultado.totalDisparados > MAX_ALERTAS && (
            <p className="mt-3 text-xs text-zinc-400">
              + {resultado.totalDisparados - MAX_ALERTAS} outros pontos de atenção (ver Aba Performance)
            </p>
          )}
        </>
      )}
    </div>
  )
}
