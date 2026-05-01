import { fmtMi } from '@/lib/fmt'

export interface SetorDecomposicao {
  display_nome: string
  variacao: number
}

export function gerarTextoDecomposicao(
  variacaoTotal: number,
  setores: SetorDecomposicao[],
): string {
  if (Math.abs(variacaoTotal) < 10_000) {
    return 'Faturamento estável vs período anterior. Variações por setor compensaram.'
  }

  const tipo     = variacaoTotal < 0 ? 'queda' : 'aumento'
  const valorAbs = fmtMi(Math.abs(variacaoTotal))

  const relevantes = setores
    .filter(s => Math.abs(s.variacao) >= 1_000)
    .sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao))

  if (relevantes.length === 0) {
    return `${tipo === 'queda' ? 'Queda' : 'Aumento'} de **${valorAbs}** no faturamento vs período anterior.`
  }

  if (relevantes.length === 1) {
    const s   = relevantes[0]
    const val = fmtMi(Math.abs(s.variacao))
    return `Toda a ${tipo} de **${valorAbs}** no faturamento veio de **${s.display_nome}** (${val}).`
  }

  // Verifica se há setores em direções opostas
  const temOpostos = relevantes.some(s => s.variacao > 0) && relevantes.some(s => s.variacao < 0)

  const partes = relevantes.map((s, i) => {
    const val  = fmtMi(Math.abs(s.variacao))
    const sinal = temOpostos ? (s.variacao < 0 ? '-' : '+') : ''
    const prefixoSinal = sinal ? `${sinal}${val}` : val

    if (i === 0)                       return `**${prefixoSinal}** vieram de **${s.display_nome}**`
    if (i === relevantes.length - 1)   return `e **${prefixoSinal}** de **${s.display_nome}**`
    return `**${prefixoSinal}** de **${s.display_nome}**`
  })

  if (temOpostos) {
    return `O saldo de **${variacaoTotal > 0 ? '+' : '-'}${valorAbs}** no faturamento (vs período anterior) combina ${partes.join(', ')}.`
  }

  return `Da ${tipo} de **${valorAbs}** no faturamento (vs período anterior), ${partes.join(', ')}.`
}
