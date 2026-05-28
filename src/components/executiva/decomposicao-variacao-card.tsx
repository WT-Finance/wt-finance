import type { ReactNode } from 'react'
import type { DecomposicaoVariacao } from '@/types/api'
import { fmtMi } from '@/lib/fmt'
import { gerarTextoDecomposicao } from '@/lib/decomposicao-variacao'

function comNegrito(texto: string): ReactNode[] {
  return texto.split(/\*\*(.*?)\*\*/g).map((parte, i) =>
    i % 2 === 1 ? <strong key={i}>{parte}</strong> : parte
  )
}

interface BarraProps {
  variacao:  number
  maxAbs:    number
  nome:      string
  variacaoPct: number | null
}

function BarraSetor({ variacao, maxAbs, nome, variacaoPct }: BarraProps) {
  if (maxAbs === 0) return null
  const larguraPct = Math.round((Math.abs(variacao) / maxAbs) * 100)
  const positivo   = variacao >= 0
  const cor        = positivo ? '#16a34a' : '#dc2626'
  const sinal      = positivo ? '+' : ''
  const pctLabel   = variacaoPct != null
    ? ` (${sinal}${variacaoPct.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%)`
    : ''

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs text-zinc-500 w-24 shrink-0 truncate">{nome}</span>
      <div className="flex-1 min-w-0">
        <div
          className="h-3 rounded-sm"
          style={{ width: `${larguraPct}%`, backgroundColor: cor, opacity: 0.75 }}
        />
      </div>
      <span className="text-xs tabular-nums shrink-0" style={{ color: cor }}>
        {sinal}{fmtMi(variacao)}{pctLabel}
      </span>
    </div>
  )
}

interface Props {
  data: DecomposicaoVariacao | null
}

export default function DecomposicaoVariacaoCard({ data }: Props) {
  if (!data || !data.tem_dados_anterior) return null

  const temDadosAtuais = (data.setores ?? []).some(s => s.atual > 0)
  if (!temDadosAtuais) return null

  const setoresFiltrados = (data.setores ?? []).filter(s => Math.abs(s.variacao) >= 1_000)
  if (setoresFiltrados.length === 0) return null

  const maxAbs  = Math.max(...setoresFiltrados.map(s => Math.abs(s.variacao)))
  const texto   = gerarTextoDecomposicao(data.variacao_total, setoresFiltrados)

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
        De onde veio a variação
      </p>
      <p className="text-sm text-zinc-700 leading-relaxed mb-4">
        {comNegrito(texto)}
      </p>
      <div className="space-y-2">
        {setoresFiltrados.map(s => (
          <BarraSetor
            key={s.nome}
            variacao={s.variacao}
            maxAbs={maxAbs}
            nome={s.display_nome}
            variacaoPct={s.variacao_pct}
          />
        ))}
      </div>
    </div>
  )
}
