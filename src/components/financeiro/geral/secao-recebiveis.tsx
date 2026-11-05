'use client'

import { AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { Card } from '@/components/ui/card'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import CabecalhoCard from '@/components/shared/cabecalho-card'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { fmtBRL2 } from '@/lib/fmt'
import { fmtPct } from '@/lib/marketing/formatar'
import {
  avisoInadimplenteAVencer, faixasDeAtraso, funilDosRecebiveis, pontosSemanais, rotuloHistoricoDesde,
} from '@/lib/financeiro-geral/recebiveis'
import type { Recebiveis } from '@/lib/financeiro-geral/schemas'
import type { Carregado } from '@/lib/financeiro-geral/tipos'
import { CascaEstado, TD, TD_NUM, TD_TOTAL, TH_DIR, TH_ESQ, Tile } from './comum'
import CardMaioresInadimplentes, { AvisoNaoFecha } from './recebiveis-devedores'
import EvolucaoInadimplente from './recebiveis-evolucao'

// Recebíveis e inadimplência (v6.5.0) — ESTOQUE: a posição numa data (a da última carga de contas a
// receber) e por isso IGNORA as pills de ano. A seção NÃO tem linha de metadados: as definições vivem no
// "?" de cada card (`GatilhoAjuda` no `CabecalhoCard`).
// Decisões do Yan (briefing §1/§2.1 + refinos de 05/11):
//  • Linha 1: Recebíveis em aberto | vencidos | Inadimplência — SÓ o valor e o nº de títulos.
//  • Linha 2: Faixas em Atraso | Maiores Inadimplentes (`recebiveis-devedores.tsx`: 4 posições + total +
//    "Ver mais" no drawer) — AMBAS só sobre os títulos marcados como inadimplentes, em colunas e altura iguais.
//  • Linha 3: Evolução da Inadimplência (`recebiveis-evolucao.tsx`).
//  • Inadimplência = SÓ a marcação `Conferido = Inadimplente`. Marcado e ainda não vencido continua contando e
//    gera o aviso (inv. 3). Nada some (inv. 4): "(sem nome)" e semana sem carga aparecem.
// Todo cálculo (funil, faixas, devedores, semanas) vem de `lib/financeiro-geral/recebiveis.ts`; aqui só se desenha.

const AJUDA_FAIXAS =
  'Posição dos contas a receber na data da última carga (não muda com os anos escolhidos). Em aberto = títulos sem ' +
  'liquidação. Vencidos = em aberto com vencimento anterior à data da carga. Inadimplência = títulos marcados como ' +
  'Inadimplente pelo Financeiro e ainda não liquidados. As faixas contam só esses títulos marcados; o atraso é a ' +
  'diferença, em dias, entre o vencimento e a data da carga.'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const titulos = (n: number) => plural(n, 'título', 'títulos')

export default function SecaoRecebiveis({ leitura, hoje }: { leitura: Carregado<Recebiveis>; hoje: string }) {
  const dados = leitura.ok ? leitura.dados : null
  const carga = dados?.carga ?? null

  if (dados === null) {
    return (
      <CascaEstado>
        <ErroCarregamento mensagem="Não foi possível carregar os recebíveis — recarregue a página." />
      </CascaEstado>
    )
  }

  if (carga === null) {
    return (
      <CascaEstado>
        <EmptyState
          icon={FileSpreadsheet}
          message="A base de contas a receber ainda não teve a primeira carga. Quando o relatório do Monde for carregado, a posição e a inadimplência aparecem aqui."
        />
      </CascaEstado>
    )
  }

  return <Corpo dados={dados} hoje={hoje} />
}

// ── Seção com carga ────────────────────────────────────────────────────────────────────────────

function Corpo({ dados, hoje }: { dados: Recebiveis; hoje: string }) {
  const funil = funilDosRecebiveis(dados)
  const faixas = faixasDeAtraso(dados.inadimplente)
  const aviso = avisoInadimplenteAVencer(dados.inadimplente)
  const pontos = pontosSemanais(dados, hoje)

  return (
    <div className="space-y-4">
      {aviso && <AvisoAVencer n={aviso.n} valor={aviso.valor} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Tile rotulo="Recebíveis em aberto" valor={fmtBRL2(funil.emAberto.valor)} apoio={[titulos(funil.emAberto.n)]} />
        <Tile rotulo="Recebíveis vencidos" valor={fmtBRL2(funil.vencido.valor)} apoio={[titulos(funil.vencido.n)]} />
        <Tile rotulo="Inadimplência" valor={fmtBRL2(funil.inadimplente.valor)} apoio={[titulos(dados.inadimplente.n)]} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="min-w-0 h-full">
          <CabecalhoCard
            titulo="Faixas em Atraso"
            ajuda={<GatilhoAjuda rotulo="Faixas em Atraso" texto={AJUDA_FAIXAS} />}
          />
          <ScrollAutoHide eixo="x" className="pb-3.5">
            <table className="w-full min-w-[380px] table-fixed border-separate border-spacing-0" aria-label="Inadimplentes por faixa de atraso">
              <colgroup><col /><col style={{ width: 72 }} /><col style={{ width: 150 }} /><col style={{ width: 72 }} /></colgroup>
              <thead>
                <tr>
                  <th scope="col" className={TH_ESQ}>Faixa</th>
                  <th scope="col" className={TH_DIR}>Títulos</th>
                  <th scope="col" className={TH_DIR}>Valor</th>
                  <th scope="col" className={TH_DIR}>%</th>
                </tr>
              </thead>
              <tbody>
                {faixas.linhas.map(f => (
                  <tr key={f.faixa}>
                    <td className={TD}>{f.rotulo}</td>
                    <td className={TD_NUM}>{f.n}</td>
                    <td className={TD}><ValorContabil valor={f.valor} /></td>
                    <td className={TD_NUM}>{fmtPct(f.pct)}</td>
                  </tr>
                ))}
                <tr>
                  <td className={TD_TOTAL}>Total</td>
                  <td className={`${TD_TOTAL} text-right tabular-nums`}>{faixas.total.n}</td>
                  <td className={TD_TOTAL}><ValorContabil valor={faixas.total.valor} /></td>
                  <td className={`${TD_TOTAL} text-right tabular-nums`}>{fmtPct(faixas.total.pct)}</td>
                </tr>
              </tbody>
            </table>
          </ScrollAutoHide>
          {!faixas.fecha && <AvisoNaoFecha />}
        </Card>

        <CardMaioresInadimplentes devedores={dados.devedores} inadimplente={dados.inadimplente} />
      </div>

      <EvolucaoInadimplente pontos={pontos} desde={rotuloHistoricoDesde(dados.historico_desde)} />
    </div>
  )
}

// ── Avisos ─────────────────────────────────────────────────────────────────────────────────────

/** Inv. 3: título marcado como inadimplente que ainda não venceu. Continua contando (a marcação é manual);
 *  o aviso não some e não força o funil. */
function AvisoAVencer({ n, valor }: { n: number; valor: number }) {
  return (
    <div role="note" className="flex items-start gap-2 rounded-lg bg-warning-bg px-4 py-3 text-[13px] text-warning-deep">
      <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
      <p>
        {plural(n, 'título marcado como inadimplente ainda não venceu', 'títulos marcados como inadimplentes ainda não venceram')}{' '}
        ({fmtBRL2(valor)}). A marcação é manual: {n === 1 ? 'ele continua' : 'eles continuam'} contando na
        inadimplência e {n === 1 ? 'aparece' : 'aparecem'} como &quot;A vencer&quot; nas faixas de atraso — por isso a
        inadimplência pode passar dos vencidos.
      </p>
    </div>
  )
}
