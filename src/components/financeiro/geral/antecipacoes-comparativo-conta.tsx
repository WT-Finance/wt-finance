'use client'

import { useMemo } from 'react'
import { Landmark } from 'lucide-react'
import CabecalhoCard from '@/components/shared/cabecalho-card'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { Card } from '@/components/ui/card'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { rotuloAnos } from '@/lib/marketing/periodo'
import {
  comparativoPorConta, fmtCustoPct, type CelulaComparativo,
} from '@/lib/financeiro-geral/antecipacoes'
import type { Antecipacoes } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import { TD, TD_NUM, TD_TOTAL, TH_DIR, TH_ESQ } from './comum'

// Card "Comparativo por Conta" (v6.5.0): UMA tabela, largura total da linha — uma linha por conta + a linha
// de total; cada ano é um bloco de três colunas ("bloco por ano", padrão A da skill `tabela-densa`): Volume
// antecipado (R$), Custo efetivo (R$: o desconto, antecipado − líquido) e Custo efetivo % (desconto ÷ volume).
// Todas as células saem de `comparativoPorConta`, que usa a MESMA `custoDoRecorte` dos cards de custo — o
// custo % aqui e lá não pode divergir, e o do total NÃO é média das contas. Célula "—" = a conta não antecipou
// naquele ano (ausência ≠ zero). O rótulo na tela é "Conta", nunca "bandeira" (em finanças, Visa/Mastercard).
//
// Largura: cada ano acrescenta `LARG_ANO`; a tabela tem largura mínima e rola POR DENTRO do card
// (`ScrollAutoHide eixo="x"`, gutter `pb-3.5`), com a 1ª coluna ("Conta") presa à esquerda — nunca a página.

const AJUDA =
  'Por conta (Asaas, Blimboo) e por ano, no regime de caixa. Antecipado = valor bruto antecipado; Custo ' +
  'Efetivo = desconto pago (antecipado − líquido), em R$; % = desconto ÷ valor antecipado do ' +
  'recorte (média ponderada pelo valor antecipado, também no total). "—" = a conta não antecipou no ano. * = ano ' +
  'corrente parcial (até o mês corrente); o período comparado do ano anterior é o mesmo.'

const LARG_PRIMEIRA = 140
const LARG_VOLUME = 148
const LARG_CUSTO = 136
const LARG_PCT = 84
const LARG_ANO = LARG_VOLUME + LARG_CUSTO + LARG_PCT
/** Régua à esquerda do bloco de cada ano a partir do 2º (a 1ª coluna já separa o 1º). */
const SEP = 'border-l border-l-wt-border'
/** 1ª coluna presa à esquerda: fundo OPACO, senão o que rola vaza por baixo dela. */
const PRIMEIRA = 'sticky left-0 z-10'

const AUSENTE = <span className="block text-right text-[var(--text-subtle)]">—</span>

/** As três células de um ano (volume, custo efetivo, custo %); `classe` = `TD` ou `TD_TOTAL`. */
function CelulasDoAno({ c, i, classe }: { c: CelulaComparativo; i: number; classe: string }) {
  const sep = i === 0 ? '' : SEP
  const num = classe === TD ? TD_NUM : `${classe} text-right tabular-nums`
  return (
    <>
      <td className={`${classe} ${sep}`}>{c.volume !== null ? <ValorContabil valor={c.volume} /> : AUSENTE}</td>
      <td className={classe}>{c.custo ? <ValorContabil valor={c.custo.efetivo} /> : AUSENTE}</td>
      <td className={num}>{c.custo ? fmtCustoPct(c.custo.pct) : '—'}</td>
    </>
  )
}

export default function AntecipacoesComparativoConta({ leituras }: { leituras: LeituraAno<Antecipacoes>[] }) {
  const comp = useMemo(() => comparativoPorConta(leituras), [leituras])
  const sep = (i: number) => (i === 0 ? '' : SEP)

  return (
    <Card className="min-w-0">
      <CabecalhoCard
        titulo="Comparativo por Conta"
        ajuda={<GatilhoAjuda rotulo="Comparativo por Conta" texto={AJUDA} />}
      />

      {comp.linhas.length === 0 ? (
        <EmptyState icon={Landmark} message={`Sem antecipações em ${rotuloAnos(comp.anos.map(a => a.ano))}.`} />
      ) : (
        <ScrollAutoHide eixo="x" className="pb-3.5">
          <table
            aria-label="Valor antecipado, custo efetivo e percentual de custo por conta, por ano"
            className="w-full table-fixed border-separate border-spacing-0"
            style={{ minWidth: LARG_PRIMEIRA + comp.anos.length * LARG_ANO }}
          >
            <colgroup>
              <col style={{ width: LARG_PRIMEIRA }} />
              {comp.anos.flatMap(a => [
                <col key={`${a.ano}-volume`} style={{ width: LARG_VOLUME }} />,
                <col key={`${a.ano}-custo`} style={{ width: LARG_CUSTO }} />,
                <col key={`${a.ano}-pct`} style={{ width: LARG_PCT }} />,
              ])}
            </colgroup>
            <thead>
              <tr>
                {/* `rowSpan` 2: a régua de base já está na própria célula (`TH_ESQ`), então o seletor de
                    "última linha" não é preciso. */}
                <th rowSpan={2} scope="col" className={`${TH_ESQ} ${PRIMEIRA} bg-white align-bottom`}>Conta</th>
                {comp.anos.map((a, i) => (
                  <th key={a.ano} colSpan={3} scope="colgroup" className={`${TH_DIR} ${sep(i)}`}>{a.rotulo}</th>
                ))}
              </tr>
              <tr>
                {comp.anos.flatMap((a, i) => [
                  <th key={`${a.ano}-volume`} scope="col" className={`${TH_DIR} ${sep(i)}`}>Antecipado</th>,
                  <th key={`${a.ano}-custo`} scope="col" className={TH_DIR}>Custo Efetivo</th>,
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
                  {l.celulas.map((c, i) => <CelulasDoAno key={c.ano} c={c} i={i} classe={TD} />)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${TD_TOTAL} ${PRIMEIRA}`}>Total</td>
                {comp.total.map((c, i) => <CelulasDoAno key={c.ano} c={c} i={i} classe={TD_TOTAL} />)}
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
      {!comp.fecha && (
        <ErroCarregamento
          className="mt-3"
          mensagem="A soma por conta não fecha com o total do registro em algum ano — avise quem mantém a página."
        />
      )}
    </Card>
  )
}
