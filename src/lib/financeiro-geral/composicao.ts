// Composição MULTI-ANO das seções de fluxo (v6.4.0) — módulo PURO.
//
// Antecipações e Perdas e prejuízos leem UMA RPC por ano selecionado. Aqui as leituras de
// vários anos viram o que os gráficos e as tabelas desenham: uma barra por ano, mês a mês, jan–dez.
//
//  • O eixo X é SEMPRE jan–dez. O mês que o ano ainda não alcançou é `null` (sem barra) — ausência
//    não é zero. Mês realizado sem lançamento é `0` (a RPC devolve 0 onde não há realizado; dentro do
//    recorte isso é um zero verdadeiro).
//  • Um ano que NÃO carregou fica fora da série e é listado em `anosFalha` — o gráfico desenha os que
//    chegaram e AVISA dos ausentes (ele não soma anos; quem soma mostra o erro no lugar do número).
//  • Cor por token e por POSIÇÃO entre os SELECIONADOS (`coresPorAno` do Marketing, importada sem mover):
//    a cor de um ano não muda porque o de outro falhou.

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

/**
 * A leitura do ANO CORRENTE entre as selecionadas, para o que é "do ano corrente" e não da seleção
 * (tile de Prejuízos, maior intervalo das Antecipações). Quem decide é a RPC: a leitura CARREGADA com
 * `relacao === 'corrente'`. Uma que falhou não traz `relacao`, então ela é achada pelo ano de `hoje`
 * (o `hoje` de SP calculado no servidor) — falhou ≠ não selecionada, e a UI diz cada um à sua maneira.
 * `null` = o ano corrente não está entre as leituras (as pills não o incluem).
 */
export function leituraDoAnoCorrente<T extends RelacaoDoAno>(
  leituras: readonly LeituraAno<T>[],
  hoje: string,
): LeituraAno<T> | null {
  const carregada = leituras.find(x => x.leitura.ok && x.leitura.dados.relacao === 'corrente')
  if (carregada) return carregada
  const anoHoje = Number(hoje.slice(0, 4))
  return leituras.find(x => x.ano === anoHoje) ?? null
}

/** Adaptador `Carregado<T>` → `T | null`, para as seções de leitura única. */
export function dadosOuNull<T>(c: Carregado<T>): T | null {
  return c.ok ? c.dados : null
}
