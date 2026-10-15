'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { ValorContabil } from '@/components/shared/valor-contabil'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { fmtDate } from '@/lib/fmt'
import {
  fmtDias, fmtFolga, interpretarFolga, pontosDaSerie, rotuloJanela,
} from '@/lib/financeiro-geral/prazos'
import { rotuloHistoricoDesde } from '@/lib/financeiro-geral/recebiveis'
import type { Prazos } from '@/lib/financeiro-geral/schemas'
import type { Carregado } from '@/lib/financeiro-geral/tipos'
import { CascaEstado, MetaSecao, TD, TD_NUM, TH_DIR, TH_ESQ, Tile } from './comum'

// Prazos médios — janela móvel de 12 meses (não depende das pills de ano: a RPC não recebe `p_ano`).
// Decisão do Yan (GATE 0): CLIENTES × FORNECEDORES, saldo do Aberto.
//   PMR = a receber de clientes ÷ entrada de clientes (12 meses) × 365
//   PMP = repasse a pagar ÷ pagamento a fornecedor (12 meses) × 365
//   Folga = PMP − PMR. Despesas ficam fora.
// A série vem das FOTOS (uma por dia de carga) e cresce com o tempo: "histórico desde DD/MM/AAAA" — a
// seção nunca fabrica ponto antes da 1ª foto. A série é uma tabela, não um gráfico, enquanto o
// histórico é de poucos pontos: a linha de 3 pontos mente mais do que informa (vira gráfico quando
// houver meses de fotos).

const AJUDA =
  'PMR (prazo médio de recebimento) = a receber de clientes ÷ entradas de clientes dos últimos 12 meses × 365. ' +
  'PMP (prazo médio de pagamento) = repasse a pagar ÷ pagamentos a fornecedores dos últimos 12 meses × 365. ' +
  'Folga = PMP − PMR: positiva, o caixa recebe antes de pagar. Os saldos vêm das cargas do relatório de ' +
  'títulos em aberto; a janela são os 12 meses fechados anteriores à foto e o histórico cresce a cada carga.'

const LINHAS_DA_SERIE = 12

export default function SecaoPrazos({ leitura }: { leitura: Carregado<Prazos> }) {
  const pontos = useMemo(
    () => (leitura.ok ? pontosDaSerie(leitura.dados.serie) : []),
    [leitura],
  )

  const atual = leitura.ok ? leitura.dados.atual : null
  const desde = leitura.ok ? rotuloHistoricoDesde(leitura.dados.historico_desde) : null

  const meta = (
    <MetaSecao
      regime="fluxo"
      recorte={atual ? rotuloJanela(atual) : 'janela móvel de 12 meses'}
      carimbo={atual ? `Foto de ${fmtDate(atual.data)}` : null}
      ajudaRotulo="Prazos médios"
      ajudaTexto={AJUDA}
    />
  )

  if (!leitura.ok) {
    return (
      <div>
        {meta}
        <CascaEstado>
          <ErroCarregamento mensagem="Não foi possível carregar os prazos médios — recarregue a página." />
        </CascaEstado>
      </div>
    )
  }

  if (atual === null) {
    return (
      <div>
        {meta}
        <CascaEstado>
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            Ainda não há foto dos prazos: eles são calculados a partir das cargas do relatório de títulos em aberto.
          </p>
        </CascaEstado>
      </div>
    )
  }

  const folga = interpretarFolga(atual.folga)
  const recentes = [...pontos].reverse().slice(0, LINHAS_DA_SERIE)

  return (
    <div>
      {meta}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile rotulo="Prazo médio de recebimento (PMR)" valor={fmtDias(atual.pmr)} escopo="clientes" apoio={['Quanto o cliente leva para pagar']} />
        <Tile rotulo="Prazo médio de pagamento (PMP)" valor={fmtDias(atual.pmp)} escopo="fornecedores" apoio={['Quanto levamos para pagar o fornecedor']} />
        <Tile
          rotulo="Folga (PMP − PMR)"
          valor={fmtFolga(atual.folga)}
          escopo="positiva = recebe antes de pagar"
          apoio={folga ? [folga.texto] : []}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="De onde vêm os prazos" subtitle={rotuloJanela(atual)}>
          <table className="w-full table-fixed border-separate border-spacing-0" aria-label="Componentes dos prazos médios">
            <thead>
              <tr>
                <th scope="col" className={TH_ESQ}>Componente</th>
                <th scope="col" className={TH_DIR}>Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className={TD}>A receber de clientes (saldo)</td><td className={TD}><ValorContabil valor={atual.saldo_receber} /></td></tr>
              <tr><td className={TD}>Entradas de clientes (12 meses)</td><td className={TD}><ValorContabil valor={atual.entrada_12m} /></td></tr>
              <tr><td className={TD}>Repasse a pagar (saldo)</td><td className={TD}><ValorContabil valor={atual.saldo_pagar} /></td></tr>
              <tr><td className={TD}>Pagamentos a fornecedores (12 meses)</td><td className={TD}><ValorContabil valor={atual.pagamento_12m} /></td></tr>
            </tbody>
          </table>
        </Card>

        <Card title="Evolução pelas fotos" subtitle={desde ?? 'Uma foto por dia de carga'}>
          {recentes.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">Sem fotos ainda.</p>
          ) : (
            <table className="w-full table-fixed border-separate border-spacing-0" aria-label="Prazos médios por foto">
              <thead>
                <tr>
                  <th scope="col" className={TH_ESQ}>Foto</th>
                  <th scope="col" className={TH_DIR}>PMR</th>
                  <th scope="col" className={TH_DIR}>PMP</th>
                  <th scope="col" className={TH_DIR}>Folga</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map(p => (
                  <tr key={p.data}>
                    <td className={`${TD} tabular-nums`}>{fmtDate(p.data)}</td>
                    <td className={TD_NUM}>{fmtDias(p.pmr)}</td>
                    <td className={TD_NUM}>{fmtDias(p.pmp)}</td>
                    <td className={TD_NUM}>{fmtFolga(p.folga)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}
