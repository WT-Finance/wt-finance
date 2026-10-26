'use client'

import { useMemo } from 'react'
import { Landmark } from 'lucide-react'
import CabecalhoCard from '@/components/shared/cabecalho-card'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { Card } from '@/components/ui/card'
import { fmtPct } from '@/lib/marketing/formatar'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { volumePorConta } from '@/lib/financeiro-geral/antecipacoes'
import { dadosCarregados } from '@/lib/financeiro-geral/composicao'
import { pctDe } from '@/lib/financeiro-geral/numeros'
import { rotuloDoAno } from '@/lib/financeiro-geral/periodo'
import type { Antecipacoes } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import { TD, TD_NUM, TD_TOTAL, TH_DIR, TH_ESQ } from './comum'

// Card "Volume antecipado por conta" (v6.5.0): soma dos anos selecionados que carregaram, por conta. O
// rótulo na tela é "Conta" — nunca "bandeira" (que, em finanças, é Visa/Mastercard). O subtítulo declara os
// anos somados; ano que falhou fica fora e é avisado sob a tabela. As contas (soma, ordem, %, `fecha`) são
// de `antecipacoes.ts` (`volumePorConta`); aqui só se desenha. Mesmo padrão de tabela de "Prejuízo por
// pessoa" (cartão-tabela de `comum.tsx`; rola por dentro do card em largura estreita).

const LARGURA_MIN = 440

export default function AntecipacoesVolumeConta({ leituras }: { leituras: LeituraAno<Antecipacoes>[] }) {
  const tabela = useMemo(() => volumePorConta(leituras), [leituras])
  const carregadas = useMemo(() => dadosCarregados(leituras), [leituras])

  const anosSomados = carregadas.map(c => rotuloDoAno(c.ano, c.dados)).join(' + ')
  const subtitulo = carregadas.length > 0
    ? `${carregadas.length > 1 ? 'Soma de ' : ''}${anosSomados} · regime de caixa`
    : undefined
  const pctTotal = pctDe(tabela.total.volume, tabela.total.volume)

  return (
    <Card className="min-w-0">
      <CabecalhoCard titulo="Volume antecipado por conta" subtitulo={subtitulo} />

      {tabela.linhas.length === 0 ? (
        <EmptyState icon={Landmark} message={`Sem antecipações em ${rotuloAnos(carregadas.map(c => c.ano))}.`} />
      ) : (
        <ScrollAutoHide eixo="x" className="pb-3.5">
          <table
            aria-label="Volume antecipado por conta"
            className="w-full table-fixed border-separate border-spacing-0"
            style={{ minWidth: LARGURA_MIN }}
          >
            <colgroup>
              <col />
              <col style={{ width: 56 }} />
              <col style={{ width: 148 }} />
              <col style={{ width: 72 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={TH_ESQ}>Conta</th>
                <th scope="col" className={TH_DIR}>Nº</th>
                <th scope="col" className={TH_DIR}>Volume</th>
                <th scope="col" className={TH_DIR}>%</th>
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map(l => (
                <tr key={l.conta}>
                  <td className={TD}><span className="block truncate" title={l.conta}>{l.conta}</span></td>
                  <td className={TD_NUM}>{l.n}</td>
                  <td className={TD}><ValorContabil valor={l.volume} /></td>
                  <td className={TD_NUM}>{fmtPct(l.pct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={TD_TOTAL}>Total</td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{tabela.total.n}</td>
                <td className={TD_TOTAL}><ValorContabil valor={tabela.total.volume} /></td>
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
          mensagem="A soma por conta não fecha com o total do registro no período — avise quem mantém a página."
        />
      )}
    </Card>
  )
}
