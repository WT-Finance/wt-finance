import type { DreLinha } from '@/lib/dre/schemas'
import { chaveDeLinha } from '@/lib/dre/identidade'
import { CHAVE_BASE_AV, avPercentual, baseAv, indiceBaseAv } from '@/lib/dre/av'
import { MESES, anoCurto, deltaYtd } from '@/lib/dre/colunas-tabela'
import { SUF_PARCIAL } from '@/lib/dre/mes-parcial'
import { CENTROS, ROTULO_CENTRO, type CentroId } from './centros'
import type { Atribuicao } from './atribuicao'

// ── Linhas e colunas da DRE por centro (v6.5.1) — módulo PURO ────────────────
//
// A árvore de cada centro é a da visão Empresa (mesmas linhas, mesma ordem, mapa vivo). Este
// módulo acrescenta o que é só das visões por centro e monta as colunas de cada uma:
//
//   (=) Resultado operacional de caixa     ← o último totalizador da árvore, renomeado (D1)
//   (+) Antecipação de recebíveis - C
//   (−) Antecipação de recebíveis - D
//   (−) Taxa de antecipação
//   (=) Resultado de caixa                 ← Σ centros ≡ último totalizador da Empresa
//   ── memória (fora das somas) ──
//   Recebíveis próprios cedidos para antecipação · Saldo operacional acumulado · Saldo de
//   caixa acumulado
//
// As colunas são um modelo PRÓPRIO (não `ColunaCons`): a visão Lado a lado tem centros nas
// colunas, coisa que a tabela da Empresa não conhece. O componente só desenha o que vem aqui.

export const ROTULO_RESULTADO_OPERACIONAL = '(=) Resultado operacional de caixa'

export const LINHA_C    = { chave: 'ANT_C',     rotulo: '(+) Antecipação de recebíveis - C' }
export const LINHA_D    = { chave: 'ANT_D',     rotulo: '(−) Antecipação de recebíveis - D' }
export const LINHA_TAXA = { chave: 'ANT_TAXA',  rotulo: '(−) Taxa de antecipação' }
export const LINHA_RES  = { chave: 'RES_CAIXA', rotulo: '(=) Resultado de caixa' }

/** Linha de memória: informativa, nunca entra em soma nem em AV. `saldo` = no período vale o
 *  valor do FIM (Consolidado, Lado a lado e coluna de total); `soma` = soma do período. */
export interface LinhaMemoria {
  chave: string
  rotulo: string
  meses: number[]
  agregacao: 'soma' | 'saldo'
  ajuda: string
}

export const AJUDA_MEMORIA = {
  cedidos:
    'Recebíveis deste centro que foram antecipados, no mês da antecipação. Informativo: quem ' +
    'precisou do caixa recebe a antecipação (linha C), não o dono dos recebíveis.',
  saldoOperacional:
    'Soma do resultado operacional de caixa desde 1º de janeiro, no fim de cada mês. Negativo = o ' +
    'centro consumiu mais caixa do que gerou. É o que decide quem toma cada antecipação.',
  saldoCaixa:
    'Soma do resultado de caixa (já com as antecipações) desde 1º de janeiro, no fim de cada mês. ' +
    'Cada centro começa 2026 com saldo zero.',
} as const

export interface LinhasCentro {
  linhas: DreLinha[]
  memoria: LinhaMemoria[]
}

const soma = (v: readonly number[]) => v.reduce((s, x) => s + x, 0)

function linhaSintetica(t: DreLinha['t'], def: { chave: string; rotulo: string }, meses: number[]): DreLinha {
  return { t, chave: def.chave, rotulo: def.rotulo, estrela: false, meses, venc: 0, total: soma(meses) }
}

/** Índice do último totalizador (`tot`) da árvore — derivado do dado, não de uma chave fixa:
 *  a estrutura é editável no editor. */
export function indiceUltimoTotalizador(linhas: readonly DreLinha[]): number {
  for (let i = linhas.length - 1; i >= 0; i--) if (linhas[i].t === 'tot') return i
  return -1
}

/** Árvore operacional de UM centro + o bloco de antecipação + a memória. */
export function montarLinhasCentro(arvore: readonly DreLinha[], centro: CentroId, a: Atribuicao): LinhasCentro {
  const iUlt = indiceUltimoTotalizador(arvore)
  const linhas = arvore.map((l, i) => (i === iUlt ? { ...l, rotulo: ROTULO_RESULTADO_OPERACIONAL } : l))
  const operacional = iUlt >= 0 ? arvore[iUlt].meses : Array.from({ length: 12 }, () => 0)
  const c = a.c[centro], d = a.d[centro], taxa = a.taxa[centro]
  const resultado = operacional.map((op, m) => op + c[m] + d[m] + taxa[m])
  linhas.push(
    linhaSintetica('sub', LINHA_C, c),
    linhaSintetica('sub', LINHA_D, d),
    linhaSintetica('sub', LINHA_TAXA, taxa),
    linhaSintetica('tot', LINHA_RES, resultado),
  )
  return {
    linhas,
    memoria: [
      { chave: 'MEM_CEDIDOS', rotulo: 'Recebíveis próprios cedidos para antecipação', meses: a.cedidos[centro], agregacao: 'soma', ajuda: AJUDA_MEMORIA.cedidos },
      { chave: 'MEM_SALDO_OP', rotulo: 'Saldo operacional acumulado', meses: a.saldoOperacional[centro], agregacao: 'saldo', ajuda: AJUDA_MEMORIA.saldoOperacional },
      { chave: 'MEM_SALDO_CX', rotulo: 'Saldo de caixa acumulado', meses: a.saldoCaixa[centro], agregacao: 'saldo', ajuda: AJUDA_MEMORIA.saldoCaixa },
    ],
  }
}

// ── Colunas ──────────────────────────────────────────────────────────────────

export interface ColunaVisao {
  id: string
  rotulo: string
  titulo: string
  tipo: 'valor' | 'av' | 'delta'
  /** Presa à direita: o total e a AV dele (a largura vem das constantes da tabela). */
  fixa?: 'total' | 'av'
  /** Régua à esquerda (início do total, ou fronteira entre centros). */
  divisoria?: boolean
}

export interface GrupoCabecalho {
  rotulo: string
  titulo: string
  /** Quantas colunas NÃO fixas o grupo cobre. */
  span: number
}

export interface VisaoTabela {
  grupos: GrupoCabecalho[]
  colunas: ColunaVisao[]
  linhas: DreLinha[]
  memoria: Array<Pick<LinhaMemoria, 'chave' | 'rotulo' | 'ajuda'>>
  /** colId → chave da linha (`chaveDeLinha` ou `m:<chave>`) → valor. Ausente = travessão. */
  valores: Record<string, Record<string, number | null>>
}

export const chaveMemoria = (m: Pick<LinhaMemoria, 'chave'>) => `m:${m.chave}`

/** Valor de uma linha de memória num recorte que termina no mês `fim` (1..12). */
function memoriaNoPeriodo(m: LinhaMemoria, fim: number): number {
  return m.agregacao === 'soma' ? soma(m.meses.slice(0, fim)) : (m.meses[fim - 1] ?? 0)
}

/** AV de todas as linhas de uma coluna, com a regra da tabela da Empresa: só da base para
 *  baixo; a base é a Receita Bruta do MESMO recorte. */
function colunaAv(linhas: readonly DreLinha[], valorDe: (l: DreLinha) => number, base: number | null): Record<string, number | null> {
  const iBase = indiceBaseAv(linhas)
  const out: Record<string, number | null> = {}
  linhas.forEach((l, i) => {
    const k = chaveDeLinha(l)
    if (k) out[k] = iBase >= 0 && i >= iBase ? avPercentual(valorDe(l), base) : null
  })
  return out
}

function colunaValor(linhas: readonly DreLinha[], memoria: readonly LinhaMemoria[], fim: number, valorDe: (l: DreLinha) => number) {
  const out: Record<string, number | null> = {}
  for (const l of linhas) {
    const k = chaveDeLinha(l)
    if (k) out[k] = valorDe(l)
  }
  for (const m of memoria) out[chaveMemoria(m)] = memoriaNoPeriodo(m, fim)
  return out
}

const ytd = (l: DreLinha, fim: number) => soma(l.meses.slice(0, fim))

/** Receita Bruta (a base da AV) de um conjunto de linhas, num recorte. */
function receitaBruta(linhas: readonly DreLinha[], fim: number): number | null {
  const rb = linhas.find(l => l.chave === CHAVE_BASE_AV)
  return baseAv(rb ? ytd(rb, fim) : null)
}

/** Mês final do recorte realizado de um ano: o corrente em curso, 12 num ano fechado. */
export function mesFimRealizado(relacao: 'fechado' | 'corrente' | 'futuro', mesCorrente: number | null): number {
  if (relacao === 'fechado') return 12
  if (relacao === 'corrente' && mesCorrente != null) return mesCorrente
  return 0
}

export const TITULO_AV_CSC =
  'O CSC não tem receita própria: a AV dele é sobre a Receita Bruta da empresa — quanto da ' +
  'receita total a estrutura central consome.'

/** Base da AV de um centro: a própria Receita Bruta; o CSC usa a da empresa (proposta do
 *  GATE 1 — a alternativa é travessão). */
function baseDoCentro(centro: CentroId, proprio: number | null, empresa: number | null): number | null {
  return centro === 'csc' ? empresa : proprio
}

// ── Visão 1: um centro, Mensal ───────────────────────────────────────────────

export function visaoMensal(args: {
  ano: number
  centro: CentroId
  lc: LinhasCentro
  fim: number
  parcial: boolean
  /** Receita Bruta da empresa no recorte (base da AV do CSC). */
  rbEmpresa: number | null
}): VisaoTabela {
  const { ano, centro, lc, fim, parcial, rbEmpresa } = args
  const colunas: ColunaVisao[] = []
  const valores: VisaoTabela['valores'] = {}
  for (let i = 0; i < fim; i++) {
    const id = `m${i + 1}`
    const ultimo = parcial && i === fim - 1
    colunas.push({
      id,
      rotulo: `${MESES[i]}${ultimo ? SUF_PARCIAL : ''}`,
      titulo: ultimo ? 'Mês em curso — realizado até hoje' : 'Realizado por data de movimentação',
      tipo: 'valor',
    })
    valores[id] = colunaValor(lc.linhas, lc.memoria, i + 1, l => l.meses[i])
    // Na coluna de um mês a memória de SOMA é a do mês, não a acumulada.
    for (const m of lc.memoria) valores[id][chaveMemoria(m)] = m.meses[i]
  }
  const rotuloTotal = `Total ${ano}${parcial ? '*' : ''}`
  colunas.push({
    id: 'total', rotulo: rotuloTotal, tipo: 'valor', fixa: 'total', divisoria: true,
    titulo: parcial ? `Realizado de jan a ${MESES[fim - 1].toLowerCase()} (ano em curso)` : 'Realizado do ano',
  })
  valores.total = colunaValor(lc.linhas, lc.memoria, fim, l => ytd(l, fim))
  colunas.push({
    id: 'av', rotulo: centro === 'csc' ? 'AV*' : 'AV', tipo: 'av', fixa: 'av',
    titulo: centro === 'csc' ? TITULO_AV_CSC : 'Análise vertical — % sobre a Receita Bruta do centro',
  })
  valores.av = colunaAv(lc.linhas, l => ytd(l, fim), baseDoCentro(centro, receitaBruta(lc.linhas, fim), rbEmpresa))
  return {
    grupos: [{ rotulo: 'Realizado', titulo: 'Realizado por data de movimentação', span: fim }],
    colunas, linhas: lc.linhas, memoria: lc.memoria, valores,
  }
}

// ── Visão 2: um centro, Consolidado (anos com cobertura) ─────────────────────

export interface AnoCentro {
  ano: number
  /** Ano em curso (o total é parcial, marcado com `*`). */
  parcial: boolean
  fim: number
  lc: LinhasCentro
  rbEmpresa: number | null
}

export function visaoConsolidado(args: { centro: CentroId; anos: AnoCentro[]; mesJanela: number }): VisaoTabela | null {
  const { centro, anos, mesJanela } = args
  if (anos.length === 0) return null
  const ref = anos[anos.length - 1]
  const colunas: ColunaVisao[] = []
  const valores: VisaoTabela['valores'] = {}
  const janela = Math.min(mesJanela, 12)
  anos.forEach((a, i) => {
    const ultimo = i === anos.length - 1
    if (!ultimo) {
      const idAno = `a${a.ano}`
      colunas.push({ id: idAno, rotulo: String(a.ano), titulo: `${a.ano} inteiro`, tipo: 'valor' })
      valores[idAno] = colunaValor(a.lc.linhas, a.lc.memoria, a.fim, l => ytd(l, a.fim))
    }
    const idYtd = `y${a.ano}`
    colunas.push({
      id: idYtd, rotulo: `YTD ${anoCurto(a.ano)}${a.parcial ? '*' : ''}`, tipo: 'valor',
      titulo: `Realizado de jan a ${MESES[janela - 1].toLowerCase()} de ${a.ano}`,
    })
    valores[idYtd] = colunaValor(a.lc.linhas, a.lc.memoria, janela, l => ytd(l, janela))
    const idAv = `av${a.ano}`
    colunas.push({
      id: idAv, rotulo: centro === 'csc' ? 'AV*' : 'AV', tipo: 'av',
      titulo: centro === 'csc' ? TITULO_AV_CSC : 'Análise vertical — % sobre a Receita Bruta do centro',
    })
    valores[idAv] = colunaAv(a.lc.linhas, l => ytd(l, janela), baseDoCentro(centro, receitaBruta(a.lc.linhas, janela), a.rbEmpresa))
    const prox = anos[i + 1]
    if (prox) {
      const idDelta = `d${a.ano}`
      colunas.push({ id: idDelta, rotulo: `Δ% YTD ${anoCurto(a.ano)}·${anoCurto(prox.ano)}`, tipo: 'delta', titulo: 'Variação do YTD' })
      const atual = valores[idYtd]
      const seguinte = colunaValor(prox.lc.linhas, prox.lc.memoria, janela, l => ytd(l, janela))
      valores[idDelta] = Object.fromEntries(Object.keys(seguinte).map(k => [k, deltaYtd(atual[k] ?? null, seguinte[k])]))
    }
  })
  return {
    grupos: [{ rotulo: 'Realizado', titulo: 'Só os anos com centro de custo no Monde', span: colunas.length }],
    colunas, linhas: ref.lc.linhas, memoria: ref.lc.memoria, valores,
  }
}

// ── Visão 3: Lado a lado (um ano; centros nas colunas) ───────────────────────

export const TITULO_TOTAL_LADO =
  'Soma dos centros. O Resultado de caixa é igual ao último totalizador da visão Empresa; as ' +
  'linhas acima dele diferem da Empresa pelo deslocamento dos recebíveis antecipados (que voltam ' +
  'ao mês do vencimento) e pela taxa de antecipação, que sai do Resultado financeiro para o bloco ' +
  'de antecipação.'

export function visaoLadoALado(args: {
  ano: number
  porCentro: Record<CentroId, LinhasCentro>
  fim: number
  parcial: boolean
  rbEmpresa: number | null
}): VisaoTabela {
  const { porCentro, fim, rbEmpresa } = args
  const esqueleto = porCentro.trips
  const colunas: ColunaVisao[] = []
  const valores: VisaoTabela['valores'] = {}
  CENTROS.forEach((c, i) => {
    const lc = porCentro[c]
    colunas.push({
      id: `v:${c}`, rotulo: 'Realizado', titulo: `Realizado de ${ROTULO_CENTRO[c]}, jan a ${MESES[fim - 1].toLowerCase()}`,
      tipo: 'valor', divisoria: i > 0,
    })
    valores[`v:${c}`] = colunaValor(lc.linhas, lc.memoria, fim, l => ytd(l, fim))
    const proprio = receitaBruta(lc.linhas, fim)
    colunas.push({
      id: `av:${c}`, rotulo: c === 'csc' ? 'AV*' : 'AV', tipo: 'av',
      titulo: c === 'csc' ? TITULO_AV_CSC : `% sobre a Receita Bruta de ${ROTULO_CENTRO[c]}`,
    })
    valores[`av:${c}`] = colunaAv(lc.linhas, l => ytd(l, fim), baseDoCentro(c, proprio, rbEmpresa))
  })
  // Total = Σ centros, linha a linha (memória de saldo: Σ dos saldos no fim).
  const total: Record<string, number | null> = {}
  for (const k of Object.keys(valores['v:trips'])) {
    total[k] = CENTROS.reduce((s, c) => s + (valores[`v:${c}`][k] ?? 0), 0)
  }
  colunas.push({ id: 'total', rotulo: 'Total', titulo: TITULO_TOTAL_LADO, tipo: 'valor', fixa: 'total', divisoria: true })
  valores.total = total
  const rbTotal = baseAv(total[`b:${CHAVE_BASE_AV}`] ?? null)
  colunas.push({ id: 'av', rotulo: 'AV', titulo: '% sobre a Receita Bruta da soma dos centros', tipo: 'av', fixa: 'av' })
  valores.av = colunaAv(esqueleto.linhas, l => total[chaveDeLinha(l) ?? ''] ?? 0, rbTotal)
  return {
    grupos: CENTROS.map(c => ({ rotulo: ROTULO_CENTRO[c], titulo: `Centro de custo ${ROTULO_CENTRO[c]}`, span: 2 })),
    colunas, linhas: esqueleto.linhas, memoria: esqueleto.memoria, valores,
  }
}
