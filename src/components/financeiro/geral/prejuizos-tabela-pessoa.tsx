'use client'

import { useMemo } from 'react'
import { Users } from 'lucide-react'
import CabecalhoCard from '@/components/shared/cabecalho-card'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { Card } from '@/components/ui/card'
import { fmtPct } from '@/lib/marketing/formatar'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { dadosCarregados } from '@/lib/financeiro-geral/composicao'
import { pctDe } from '@/lib/financeiro-geral/numeros'
import { rotuloDoAno } from '@/lib/financeiro-geral/periodo'
import { tabelaPorPessoa } from '@/lib/financeiro-geral/prejuizos'
import type { Prejuizos } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import { TD, TD_NUM, TD_TOTAL, TH_DIR, TH_ESQ } from './comum'

// Card "Prejuízo por pessoa" (v6.5.0): UMA tabela que SOMA os anos selecionados que carregaram (decisão do
// Yan, GATE 1). O subtítulo declara quais anos entraram na soma; ano que falhou fica fora e é avisado sob a
// tabela — nunca somado calado só com o que chegou. As contas (soma por pessoa, ordem, corte top/demais,
// %, `fecha`) são de `prejuizos.ts` (`tabelaPorPessoa`); aqui só se desenha.
//
// "(sem pessoa)" e "demais N pessoas" ficam visíveis (inv. 4), em itálico e tom discreto — o mesmo
// tratamento de "(sem fornecedor)" em Marketing. Valores no sinal da DRE (prejuízo negativo); a % é
// positiva (negativo ÷ negativo).
//
// Tabela no padrão A (cartão-tabela, `comum.tsx`). Largura estreita: a tabela tem largura mínima e rola
// POR DENTRO do card (`ScrollAutoHide eixo="x"`, gutter `pb-3.5` para o thumb overlay), nunca a página.

/** Largura mínima da tabela: abaixo disso ela rola por dentro do card em vez de espremer a 1ª coluna. */
const LARGURA_MIN = 480

export default function PrejuizosTabelaPessoa({ leituras }: { leituras: LeituraAno<Prejuizos>[] }) {
  const tabela = useMemo(() => tabelaPorPessoa(leituras), [leituras])
  const carregadas = useMemo(() => dadosCarregados(leituras), [leituras])

  const anosSomados = carregadas.map(c => rotuloDoAno(c.ano, c.dados)).join(' + ')
  const subtitulo = carregadas.length > 0
    ? `${carregadas.length > 1 ? 'Soma de ' : ''}${anosSomados} · regime de caixa`
    : undefined

  const semLinhas = tabela.linhas.length === 0 && tabela.demais === null
  const pctTotal = pctDe(tabela.total.valor, tabela.total.valor)

  return (
    <Card className="min-w-0">
      <CabecalhoCard titulo="Prejuízo por pessoa" subtitulo={subtitulo} />

      {semLinhas ? (
        <EmptyState icon={Users} message={`Sem prejuízos registrados em ${rotuloAnos(tabela.anos)}.`} />
      ) : (
        <ScrollAutoHide eixo="x" className="pb-3.5">
          <table
            aria-label="Prejuízo por pessoa"
            className="w-full table-fixed border-separate border-spacing-0"
            style={{ minWidth: LARGURA_MIN }}
          >
            <colgroup>
              <col />
              <col style={{ width: 96 }} />
              <col style={{ width: 148 }} />
              <col style={{ width: 72 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={TH_ESQ}>Pessoa</th>
                <th scope="col" className={TH_DIR}>Lançamentos</th>
                <th scope="col" className={TH_DIR}>Valor</th>
                <th scope="col" className={TH_DIR}>%</th>
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map(l => (
                <tr key={l.posicao}>
                  <td className={TD}>
                    <span
                      className={`block truncate ${l.semPessoa ? 'italic text-[var(--text-muted)]' : ''}`}
                      title={l.pessoa}
                    >
                      {l.pessoa}
                    </span>
                  </td>
                  <td className={TD_NUM}>{l.n}</td>
                  <td className={TD}><ValorContabil valor={l.valor} /></td>
                  <td className={TD_NUM}>{fmtPct(l.pct)}</td>
                </tr>
              ))}
              {tabela.demais && (
                <tr>
                  <td className={TD}>
                    <span className="block truncate italic text-[var(--text-muted)]" title={tabela.demais.rotulo}>
                      {tabela.demais.rotulo}
                    </span>
                  </td>
                  <td className={TD_NUM}>{tabela.demais.n}</td>
                  <td className={TD}><ValorContabil valor={tabela.demais.valor} /></td>
                  <td className={TD_NUM}>{fmtPct(tabela.demais.pct)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className={TD_TOTAL}>Total</td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{tabela.total.n}</td>
                <td className={TD_TOTAL}><ValorContabil valor={tabela.total.valor} /></td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{fmtPct(pctTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </ScrollAutoHide>
      )}

      {tabela.anosFalha.length > 0 && (
        <ErroCarregamento
          className="mt-3"
          mensagem={`Não foi possível carregar ${rotuloAnos(tabela.anosFalha)}; fora da soma.`}
        />
      )}
      {!tabela.fecha && (
        <ErroCarregamento
          className="mt-3"
          mensagem="A soma por pessoa não fecha com o total de prejuízos do período — avise quem mantém a página."
        />
      )}
    </Card>
  )
}
