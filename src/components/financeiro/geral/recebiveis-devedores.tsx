'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import CabecalhoCard from '@/components/shared/cabecalho-card'
import ListDrawer from '@/components/shared/list-drawer'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { fmtPct } from '@/lib/marketing/formatar'
import { rotuloMaiorAtraso, tabelaDevedores, type TabelaDevedores } from '@/lib/financeiro-geral/recebiveis'
import type { Recebiveis } from '@/lib/financeiro-geral/schemas'
import { TD, TD_NUM, TD_TOTAL, TH_DIR, TH_ESQ } from './comum'

// "Maiores Inadimplentes" (v6.5.0) — o card mostra as primeiras posições + o total de TODOS os devedores e
// um "Ver mais" que abre o drawer com a lista completa. A tabela é a mesma nos dois lugares; só muda o corte.
// Todo número vem de `tabelaDevedores` (módulo puro); aqui só se desenha. O estado de abrir/fechar é local.

/** Posições exibidas no card quando a seção não informa; o resto fica no drawer. */
const POSICOES_PADRAO = 4

const AJUDA =
  'Por pessoa, só os títulos marcados como inadimplentes, do maior valor para o menor. O atraso é o maior entre ' +
  'os títulos da pessoa (o do título mais antigo), em dias.'

/** Defesa: se algum dia o total da tabela não fechar com a inadimplência (completude, inv. 2), a tela diz. */
export function AvisoNaoFecha() {
  return (
    <p role="note" className="mt-2 text-xs text-warning-deep">
      Atenção: o total desta tabela não fecha com o valor inadimplente do card acima.
    </p>
  )
}

function TabelaDosDevedores({ tabela }: { tabela: TabelaDevedores }) {
  return (
    <ScrollAutoHide eixo="x" className="pb-3.5">
      <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-0" aria-label="Maiores inadimplentes">
        <colgroup>
          <col style={{ width: 40 }} /><col /><col style={{ width: 72 }} /><col style={{ width: 150 }} />
          <col style={{ width: 72 }} /><col style={{ width: 104 }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH_DIR}>#</th>
            <th scope="col" className={TH_ESQ}>Pessoa</th>
            <th scope="col" className={TH_DIR}>Títulos</th>
            <th scope="col" className={TH_DIR}>Valor</th>
            <th scope="col" className={TH_DIR}>%</th>
            <th scope="col" className={TH_DIR}>Atraso</th>
          </tr>
        </thead>
        <tbody>
          {tabela.linhas.map(d => (
            <tr key={d.posicao}>
              <td className={TD_NUM}>{d.posicao}</td>
              <td className={TD}>
                <span className={`block truncate ${d.semNome ? 'italic text-[var(--text-muted)]' : ''}`} title={d.devedor}>{d.devedor}</span>
              </td>
              <td className={TD_NUM}>{d.n}</td>
              <td className={TD}><ValorContabil valor={d.valor} /></td>
              <td className={TD_NUM}>{fmtPct(d.pct)}</td>
              <td className={TD_NUM}>{rotuloMaiorAtraso(d.maiorAtraso)}</td>
            </tr>
          ))}
          <tr>
            <td className={TD_TOTAL} />
            <td className={TD_TOTAL}>Total</td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{tabela.total.n}</td>
            <td className={TD_TOTAL}><ValorContabil valor={tabela.total.valor} /></td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{fmtPct(tabela.total.pct)}</td>
            <td className={TD_TOTAL} />
          </tr>
        </tbody>
      </table>
    </ScrollAutoHide>
  )
}

export default function CardMaioresInadimplentes({
  devedores, inadimplente, posicoes,
}: {
  devedores: Recebiveis['devedores']
  inadimplente: Pick<Recebiveis['inadimplente'], 'n' | 'valor'>
  /** Posições mostradas no card: o nº de linhas da tabela de faixas ao lado (a seção calcula), para os dois
   *  cards casarem linha a linha. Sem a prop, `POSICOES_PADRAO`. */
  posicoes?: number
}) {
  const [aberto, setAberto] = useState(false)
  const card = tabelaDevedores(devedores, inadimplente, posicoes ?? POSICOES_PADRAO)
  // A lista completa só é montada com o drawer aberto.
  const completa = aberto ? tabelaDevedores(devedores, inadimplente) : null

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CabecalhoCard
        titulo="Maiores Inadimplentes"
        ajuda={<GatilhoAjuda rotulo="Maiores Inadimplentes" texto={AJUDA} />}
      />
      {card.linhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">Nenhum título marcado como inadimplente.</p>
      ) : (
        <TabelaDosDevedores tabela={card} />
      )}
      {!card.fecha && <AvisoNaoFecha />}
      {card.temMais && (
        <div className="mt-auto border-t border-zinc-100 pt-1">
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="card-tabela-vermais w-full py-1.5 text-xs font-medium"
          >
            Ver mais
          </button>
        </div>
      )}

      {completa && (
        <ListDrawer titulo="Maiores Inadimplentes" onClose={() => setAberto(false)}>
          <TabelaDosDevedores tabela={completa} />
          {!completa.fecha && <AvisoNaoFecha />}
        </ListDrawer>
      )}
    </Card>
  )
}
