'use client'

import { useMemo } from 'react'
import { Landmark } from 'lucide-react'
import CabecalhoCard from '@/components/shared/cabecalho-card'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { Card } from '@/components/ui/card'
import { rotuloAnos } from '@/lib/marketing/periodo'
import {
  comparativoPorConta, fmtCustoPct, type CelulaComparativo,
} from '@/lib/financeiro-geral/antecipacoes'
import type { Antecipacoes } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import { TD, TD_NUM, TD_TOTAL, TH_DIR, TH_ESQ } from './comum'

// Card "Comparativo (custo efetivo e percentual por conta)" (v6.5.0): conta × ano selecionado, no padrão
// "bloco por ano" de Marketing ("Por fornecedor"): cada ano é um bloco de duas colunas — R$ (custo efetivo:
// o desconto, antecipado − líquido) e % (custo percentual: desconto ÷ antecipado) —, e a última linha é o
// custo do ano inteiro. O cabeçalho é o da Geral (`TH_ESQ`/`TH_DIR`, caixa normal), não o da DRE. Todas as
// células saem de `comparativoPorConta`, que usa a MESMA `custoDoRecorte` dos cards "Custo ... no ano" — o
// custo % aqui e lá não pode divergir. Célula "—" = a conta não antecipou naquele ano (ausência ≠ custo zero).
//
// Largura: cada ano acrescenta 228px; a tabela tem largura mínima e rola POR DENTRO do card
// (`ScrollAutoHide eixo="x"`, gutter `pb-3.5`), com a 1ª coluna ("Conta") presa à esquerda — nunca a página.

const LARG_PRIMEIRA = 120
const LARG_VALOR = 148
const LARG_PCT = 80
/** Régua à esquerda do bloco de cada ano a partir do 2º (a 1ª coluna já separa o 1º). */
const SEP = 'border-l border-l-wt-border'
/** 1ª coluna presa à esquerda: fundo OPACO, senão o que rola vaza por baixo dela. */
const PRIMEIRA = 'sticky left-0 z-10'

function CelulaValor({ celula }: { celula: CelulaComparativo }) {
  return celula.custo
    ? <ValorContabil valor={celula.custo.efetivo} />
    : <span className="block text-right text-[var(--text-subtle)]">—</span>
}

export default function AntecipacoesComparativoConta({ leituras }: { leituras: LeituraAno<Antecipacoes>[] }) {
  const comp = useMemo(() => comparativoPorConta(leituras), [leituras])
  const sep = (i: number) => (i === 0 ? '' : SEP)

  return (
    <Card className="min-w-0">
      <CabecalhoCard
        titulo="Comparativo (custo efetivo e percentual por conta)"
        subtitulo="R$ = desconto (antecipado − líquido) · % = desconto ÷ valor antecipado, por ano"
      />

      {comp.linhas.length === 0 ? (
        <EmptyState icon={Landmark} message={`Sem antecipações em ${rotuloAnos(comp.anos.map(a => a.ano))}.`} />
      ) : (
        <ScrollAutoHide eixo="x" className="pb-3.5">
          <table
            aria-label="Custo efetivo e percentual por conta, por ano"
            className="w-full table-fixed border-separate border-spacing-0"
            style={{ minWidth: LARG_PRIMEIRA + comp.anos.length * (LARG_VALOR + LARG_PCT) }}
          >
            <colgroup>
              <col style={{ width: LARG_PRIMEIRA }} />
              {comp.anos.flatMap(a => [
                <col key={`${a.ano}-valor`} />,
                <col key={`${a.ano}-pct`} style={{ width: LARG_PCT }} />,
              ])}
            </colgroup>
            <thead>
              <tr>
                {/* `rowSpan` 2: a régua de base já está na própria célula (`TH_ESQ`), então o seletor de
                    "última linha" não é preciso. */}
                <th rowSpan={2} scope="col" className={`${TH_ESQ} ${PRIMEIRA} bg-white align-bottom`}>Conta</th>
                {comp.anos.map((a, i) => (
                  <th key={a.ano} colSpan={2} scope="colgroup" className={`${TH_DIR} ${sep(i)}`}>{a.rotulo}</th>
                ))}
              </tr>
              <tr>
                {comp.anos.flatMap((a, i) => [
                  <th key={`${a.ano}-valor`} scope="col" className={`${TH_DIR} ${sep(i)}`}>R$</th>,
                  <th key={`${a.ano}-pct`} scope="col" className={TH_DIR}>%</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {comp.linhas.map(l => (
                <tr key={l.conta}>
                  <td className={`${TD} ${PRIMEIRA} bg-white`}>
                    <span className="block truncate" title={l.conta}>{l.conta}</span>
                  </td>
                  {l.celulas.flatMap((c, i) => [
                    <td key={`${c.ano}-valor`} className={`${TD} ${sep(i)}`}><CelulaValor celula={c} /></td>,
                    <td key={`${c.ano}-pct`} className={TD_NUM}>{c.custo ? fmtCustoPct(c.custo.pct) : '—'}</td>,
                  ])}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${TD_TOTAL} ${PRIMEIRA}`}>Total</td>
                {comp.total.flatMap((c, i) => [
                  <td key={`${c.ano}-valor`} className={`${TD_TOTAL} ${sep(i)}`}><CelulaValor celula={c} /></td>,
                  <td key={`${c.ano}-pct`} className={`${TD_TOTAL} text-right tabular-nums`}>
                    {c.custo ? fmtCustoPct(c.custo.pct) : '—'}
                  </td>,
                ])}
              </tr>
            </tfoot>
          </table>
        </ScrollAutoHide>
      )}

      {comp.anosFalha.length > 0 && (
        <ErroCarregamento
          className="mt-3"
          mensagem={`Não foi possível carregar ${rotuloAnos(comp.anosFalha)}; fora do comparativo.`}
        />
      )}
    </Card>
  )
}
