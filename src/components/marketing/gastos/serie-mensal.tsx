'use client'

import { useMemo } from 'react'
import GraficoMensalPorAno, { type SerieDoAno } from '@/components/shared/grafico-mensal-por-ano'
import {
  serieMensalMultiAno, totaisPorAno, totalDoPeriodo, type FatiaAno,
} from '@/lib/marketing/agregacao'
import { recorteParcial, rotuloAnos, rotuloRecorte } from '@/lib/marketing/periodo'
import type { LinhaMesCategoria } from '@/lib/marketing/tipos'

// Componente C — "Despesas mensais": ADAPTADOR FINO (v6.5.0). O gráfico em si (jan–dez, uma barra por
// ano lado a lado, painel "Total por ano" em escala própria, cores por posição entre os SELECIONADOS,
// ordem das barras, eixo Y com domínio/ticks explícitos) vive em `@/components/shared/grafico-mensal-por-ano`
// — o mesmo componente do Financeiro · Geral —, com a documentação das armadilhas. Aqui só se converte o
// formato de Marketing (fatias por ano + recorte) na entrada genérica e se decidem os textos.
//
// Série de GASTO: negativa por natureza, então `invertido` (v6.4.2, decisão do Yan): a despesa SOBE a
// partir do zero ("mais gasto" = "mais alto") e o rótulo do eixo continua negativo.
//
// Ano PARCIAL: o recorte de cada ano (`@/lib/marketing/periodo`) vira `parcial` + `rotuloRecorte`; o
// compartilhado monta "2026*" e "2026 · jan–out" a partir deles.
//
// O critério de "sem dado" é de Marketing (nenhum LANÇAMENTO nos anos carregados — zero no valor não é
// ausência de lançamento), por isso é decidido aqui e passado como mensagem.

interface Props {
  /** Rótulo do período ("2025 + 2026 (até out)"). */
  periodo: string
  /** Todos os anos SELECIONADOS (carregados ou não): a cor de cada ano sai da posição aqui. */
  anos: readonly number[]
  /** Os anos selecionados que carregaram, cada um no seu recorte. */
  fatias: readonly FatiaAno<LinhaMesCategoria>[]
  /** Anos selecionados cujo resumo falhou. */
  anosFalha: readonly number[]
}

export default function SerieMensal({ periodo, anos, fatias, anosFalha }: Props) {
  const serie = useMemo(() => serieMensalMultiAno(fatias), [fatias])
  const totais = useMemo(() => totaisPorAno(fatias), [fatias])

  // `serie.anos` e `totais` saem das mesmas fatias, ambos crescentes: um valor por ano, na mesma ordem.
  const series = useMemo<SerieDoAno[]>(() => {
    const recortePorAno = new Map(fatias.map(f => [f.ano, f.recorte]))
    const totalPorAno = new Map(totais.map(t => [t.ano, t.valor]))
    return serie.anos.map((ano, i) => {
      const recorte = recortePorAno.get(ano)
      return {
        ano,
        valores: serie.pontos.map(p => p.valores[i]),
        total: totalPorAno.get(ano) ?? 0,
        parcial: recorte ? recorteParcial(recorte) : false,
        rotuloRecorte: recorte ? rotuloRecorte(recorte) : undefined,
      }
    })
  }, [serie, totais, fatias])

  // Com ano que falhou, "sem lançamentos em <todos os anos>" seria falso: só vale para os carregados.
  const mensagemSemDados = useMemo(() => {
    if (fatias.length === 0 || totalDoPeriodo(fatias).qtd !== 0) return undefined
    return anosFalha.length > 0
      ? `Sem lançamentos pagos nos anos carregados (${rotuloAnos(serie.anos)}).`
      : `Sem lançamentos pagos em ${periodo}.`
  }, [fatias, anosFalha, serie, periodo])

  return (
    <GraficoMensalPorAno
      titulo="Despesas mensais"
      anos={anos}
      series={series}
      anosFalha={anosFalha}
      invertido
      descricaoMensal="Despesas mensais de marketing, janeiro a dezembro, por ano"
      descricaoTotal="Total por ano de despesas de marketing"
      mensagemFalhaTotal={anosFalha.length > 0
        ? `Não foi possível carregar as despesas mensais de ${rotuloAnos(anosFalha)}.`
        : 'Não foi possível carregar as despesas mensais.'}
      mensagemSemDados={mensagemSemDados}
    />
  )
}
