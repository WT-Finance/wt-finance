'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'
import type { ProximosCasamentos } from '@/types/api'
import { fmtDateMid, fmtBRL2, parseLocalDate } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import EmptyState from '@/components/shared/empty-state'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'

const LIMITE = 6

type HorizontePill = '3m' | '6m' | '12m'

interface Props {
  data18m: ProximosCasamentos | null
}

// Resultado Previsto = operação individual (um casamento) → 2 casas (ADR-0100), via fmtBRL2.
function ResultadoCell({ valor }: { valor: number }) {
  return (
    <td className="py-2 px-3 text-xs tabular-nums text-right whitespace-nowrap text-zinc-500">
      <span title="Total de entradas menos total de saídas da operação (coincide com Rec. Líq. na Lista de Operações)">
        {fmtBRL2(valor)}
      </span>
    </td>
  )
}

function Colunas() {
  return (
    <colgroup>
      <col className="w-32" />
      <col />
      <col />
      <col className="w-28" />
    </colgroup>
  )
}

function DrawerContent({ casamentos }: { casamentos: NonNullable<ProximosCasamentos>['casamentos'] }) {
  const [horizonte, setHorizonte] = useState<HorizontePill>('3m')

  const hoje = new Date()
  const limite = new Date(hoje)
  if (horizonte === '3m')  limite.setMonth(limite.getMonth() + 3)
  if (horizonte === '6m')  limite.setMonth(limite.getMonth() + 6)
  if (horizonte === '12m') limite.setFullYear(limite.getFullYear() + 1)

  const filtrados = casamentos.filter(c => {
    if (!c.data_casamento) return false
    return parseLocalDate(c.data_casamento) <= limite  // F6: parse local, sem deslocamento de fuso
  })

  return (
    <>
      <div className="sticky -top-5 z-20 bg-white -mx-6 -mt-5 px-6 pt-5 pb-3 mb-3 border-b border-zinc-100 flex items-center gap-1.5">
        {(['3m', '6m', '12m'] as HorizontePill[]).map(h => (
          <button
            key={h}
            onClick={() => setHorizonte(h)}
            className={[
              'text-2xs px-2.5 py-0.5 rounded-full border transition-colors',
              horizonte === h
                ? 'bg-zinc-800 text-white border-zinc-800'
                : 'text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700',
            ].join(' ')}
          >
            {h === '3m' ? '3 meses' : h === '6m' ? '6 meses' : '12 meses'}
          </button>
        ))}
      </div>
      <table className="w-full table-fixed text-sm">
        <Colunas />
        <thead>
          <tr className="border-b border-zinc-100">
            <th className={`${CARD_TABELA_TH} text-left`}>Data</th>
            <th className={`${CARD_TABELA_TH} text-left`}>Casal</th>
            <th className={`${CARD_TABELA_TH} text-left`}>Hotel</th>
            <th className={`${CARD_TABELA_TH} text-right`}>Resultado Previsto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {filtrados.map((c, i) => (
            <tr key={i} className="hover:bg-zinc-50">
              <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                {c.data_casamento ? fmtDateMid(c.data_casamento) : '—'}
              </td>
              <td className="py-2 px-3 text-zinc-800 font-medium truncate">
                {c.casal ?? '—'}
              </td>
              <td className="py-2 px-3 text-zinc-500 text-xs truncate">
                {c.hotel ?? '—'}
              </td>
              <ResultadoCell valor={c.resultado_previsto ?? 0} />
            </tr>
          ))}
        </tbody>
      </table>
      {filtrados.length === 0 && (
        <div className="py-8 text-center text-xs text-zinc-400">
          Nenhum casamento no horizonte selecionado
        </div>
      )}
    </>
  )
}

export default function ProximosCasamentosCard({ data18m }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const casamentos = data18m?.casamentos ?? []
  const visiveis = casamentos.slice(0, LIMITE)
  const temMais = casamentos.length > LIMITE

  return (
    <CardTabela
      titulo="Próximos Casamentos a Entregar"
      temMais={temMais}
      onVerMais={() => setDrawerOpen(true)}
    >
      {casamentos.length === 0 ? (
        <EmptyState icon={Calendar} message="Nenhum casamento previsto para o horizonte selecionado" />
      ) : (
        <table className="w-full table-fixed text-sm">
          <Colunas />
          <thead>
            <tr className="border-b border-zinc-100">
              <th className={`${CARD_TABELA_TH} text-left`}>Data</th>
              <th className={`${CARD_TABELA_TH} text-left`}>Casal</th>
              <th className={`${CARD_TABELA_TH} text-left`}>Hotel</th>
              <th className={`${CARD_TABELA_TH} text-right`}>Resultado Prev.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {visiveis.map((c, i) => (
              <tr key={i} className="hover:bg-zinc-50">
                <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">
                  {c.data_casamento ? fmtDateMid(c.data_casamento) : '—'}
                </td>
                <td className="py-2 px-3 text-zinc-800 font-medium truncate">
                  {c.casal ?? '—'}
                </td>
                <td className="py-2 px-3 text-zinc-500 text-xs truncate">
                  {c.hotel ?? '—'}
                </td>
                <ResultadoCell valor={c.resultado_previsto ?? 0} />
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drawerOpen && (
        <ListDrawer titulo="Próximos Casamentos a Entregar" subtitulo="Listagem dos próximos casamentos a entregar" onClose={() => setDrawerOpen(false)}>
          <DrawerContent casamentos={casamentos} />
        </ListDrawer>
      )}
    </CardTabela>
  )
}
