// Composição MULTI-ANO das seções de fluxo (v6.4.0) — módulo PURO.
//
// Antecipações, Perdas e prejuízos e Custos leem UMA RPC por ano selecionado. Aqui as leituras de
// vários anos viram o que os gráficos e as tabelas desenham: uma barra por ano, mês a mês, jan–dez.
//
//  • O eixo X é SEMPRE jan–dez. O mês que o ano ainda não alcançou é `null` (sem barra) — ausência
//    não é zero. Mês realizado sem lançamento é `0` (a RPC devolve 0 onde não há realizado; dentro do
//    recorte isso é um zero verdadeiro).
//  • Um ano que NÃO carregou fica fora da série e é listado em `anosFalha` — o gráfico desenha os que
//    chegaram e AVISA dos ausentes (ele não soma anos; quem soma mostra o erro no lugar do número).
//  • Cor por token e por POSIÇÃO entre os SELECIONADOS (`coresPorAno` do Marketing, importada sem mover):
//    a cor de um ano não muda porque o de outro falhou.

import { passoRedondo } from '@/lib/escala-grafico'
import { ROTULOS_MES, mesesRealizados, rotuloDoAno, type RelacaoDoAno } from './periodo'
import type { Carregado, LeituraAno } from './tipos'

export interface AnoDaSerie {
  ano: number
  /** "2026*" quando parcial. */
  rotulo: string
}

export interface PontoMensal {
  /** 1..12 */
  mes: number
  /** "Jan" … "Dez" */
  label: string
  /** Um valor por ano de `anos`, na mesma ordem; `null` = mês que o ano ainda não alcançou. */
  valores: (number | null)[]
}

export interface SerieMultiAno {
  /** Só os anos que carregaram, crescente. */
  anos: AnoDaSerie[]
  pontos: PontoMensal[]
  /** Anos selecionados cuja leitura falhou. */
  anosFalha: number[]
  /** Algum valor diferente de zero em algum mês? (senão a seção diz "sem lançamento", não desenha 12 barras vazias) */
  temMovimento: boolean
}

/**
 * Uma série mensal por ano. `pegar` extrai os 12 valores mensais da leitura (ex.: `l => l.prejuizo.meses`).
 */
export function serieMensalMultiAno<T extends RelacaoDoAno>(
  leituras: readonly LeituraAno<T>[],
  pegar: (dados: T) => readonly number[],
): SerieMultiAno {
  const ordenadas = [...leituras].sort((a, b) => a.ano - b.ano)
  const carregadas = ordenadas.flatMap(x => (x.leitura.ok ? [{ ano: x.ano, dados: x.leitura.dados }] : []))
  const anosFalha = ordenadas.filter(x => !x.leitura.ok).map(x => x.ano)

  const pontos: PontoMensal[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    label: ROTULOS_MES[i],
    valores: carregadas.map(({ dados }) => (i < mesesRealizados(dados) ? (pegar(dados)[i] ?? 0) : null)),
  }))

  return {
    anos: carregadas.map(({ ano, dados }) => ({ ano, rotulo: rotuloDoAno(ano, dados) })),
    pontos,
    anosFalha,
    temMovimento: pontos.some(p => p.valores.some(v => v !== null && Math.abs(v) >= 0.005)),
  }
}

/** Atalho: os dados já carregados de uma lista de leituras, na ordem dos anos. */
export function dadosCarregados<T>(leituras: readonly LeituraAno<T>[]): { ano: number; dados: T }[] {
  return [...leituras]
    .sort((a, b) => a.ano - b.ano)
    .flatMap(x => (x.leitura.ok ? [{ ano: x.ano, dados: x.leitura.dados }] : []))
}

export function anosQueFalharam<T>(leituras: readonly LeituraAno<T>[]): number[] {
  return [...leituras].filter(x => !x.leitura.ok).map(x => x.ano).sort((a, b) => a - b)
}

/** Adaptador `Carregado<T>` → `T | null`, para as seções de leitura única. */
export function dadosOuNull<T>(c: Carregado<T>): T | null {
  return c.ok ? c.dados : null
}

export interface EscalaEixo {
  domain: [number, number]
  ticks: number[]
}

const INTERVALOS_ALVO = 4
const limpar = (n: number): number => (n === 0 ? 0 : Math.round(n * 100) / 100) // normaliza -0

/**
 * Domínio e ticks do eixo Y. Sempre CONTÉM o dado e o zero (a ponta é arredondada para FORA do dado,
 * nunca para dentro — encaixar para dentro faz pontos sumirem), a partir de um PASSO redondo
 * (`passoRedondo`), nunca o contrário. Quem fixa `domain` fixa os `ticks` junto: o domínio explícito
 * desliga os ticks bonitos do Recharts. Série que cruza o zero (prejuízo com reversão, custo com
 * receita) exige isso — o default do Recharts ancora em zero e corta os negativos.
 */
export function escalaEixo(valores: readonly (number | null | undefined)[]): EscalaEixo {
  const v = valores.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  const min = Math.min(0, ...v)
  const max = Math.max(0, ...v)
  const amplitude = max - min
  if (amplitude <= 0) return { domain: [0, 1000], ticks: [0, 250, 500, 750, 1000] }
  const passo = passoRedondo(amplitude / INTERVALOS_ALVO)
  const lo = Math.floor(min / passo) * passo
  const hi = Math.ceil(max / passo) * passo
  const ticks: number[] = []
  for (let t = lo; t <= hi + passo / 1000; t += passo) ticks.push(limpar(t))
  return { domain: [limpar(lo), limpar(hi)], ticks }
}

/** Todos os valores de uma série (para a escala). */
export function valoresDaSerie(s: SerieMultiAno): (number | null)[] {
  return s.pontos.flatMap(p => p.valores)
}
