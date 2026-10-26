'use client'

import { AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { Card } from '@/components/ui/card'
import CabecalhoCard from '@/components/shared/cabecalho-card'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { fmtBRL2, fmtDataSP } from '@/lib/fmt'
import { fmtPct } from '@/lib/marketing/formatar'
import {
  avisoInadimplenteAVencer, faixasDeAtraso, funilDosRecebiveis, pontosSemanais, rotuloHistoricoDesde,
  rotuloMaiorAtraso, rotuloPosicao, tabelaDevedores,
} from '@/lib/financeiro-geral/recebiveis'
import type { Recebiveis } from '@/lib/financeiro-geral/schemas'
import type { Carregado } from '@/lib/financeiro-geral/tipos'
import { CascaEstado, MetaSecao, TD, TD_NUM, TD_TOTAL, TH_DIR, TH_ESQ, Tile } from './comum'
import EvolucaoInadimplente from './recebiveis-evolucao'

// Recebíveis e inadimplência (v6.5.0) — ESTOQUE: a posição numa data (a da última carga de contas a
// receber) e por isso IGNORA as pills de ano; a seção mostra a própria data de carga (inv. 11).
// Decisões do Yan (briefing §1/§2.1):
//  • Linha 1: Recebíveis em aberto | vencidos | Inadimplência — valor, nº de títulos, o % que cada um tem do
//    anterior (funil) e o Δ contra a última foto da semana anterior ("vs DD/MM"; sem foto, sem Δ).
//  • Linha 2: Faixas de atraso | 10 maiores inadimplentes — AMBAS só sobre os títulos marcados como inadimplentes.
//  • Linha 3: Evolução semanal do inadimplente (`recebiveis-evolucao.tsx`).
//  • Inadimplência = SÓ a marcação `Conferido = Inadimplente`. Marcado e ainda não vencido continua contando e
//    gera o aviso (inv. 3). Nada some (inv. 4): "(sem nome)" e semana sem carga aparecem.
// Todo cálculo (funil, faixas, devedores, semanas) vem de `lib/financeiro-geral/recebiveis.ts`; aqui só se desenha.

const AJUDA =
  'Posição dos contas a receber na data da última carga (não muda com os anos escolhidos). Em aberto = títulos sem ' +
  'liquidação. Vencidos = em aberto com vencimento anterior à data da carga. Inadimplência = títulos marcados como ' +
  'Inadimplente pelo Financeiro e ainda não liquidados. As faixas de atraso e os maiores devedores contam só esses ' +
  'títulos marcados; o atraso é a diferença, em dias, entre o vencimento e a data da carga. A variação compara com a ' +
  'última carga da semana anterior. A evolução usa a última carga de cada semana (segunda a domingo) e começa na ' +
  'primeira carga desta base.'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const titulos = (n: number) => plural(n, 'título', 'títulos')

export default function SecaoRecebiveis({ leitura, hoje }: { leitura: Carregado<Recebiveis>; hoje: string }) {
  const dados = leitura.ok ? leitura.dados : null
  const carga = dados?.carga ?? null
  const meta = (
    <MetaSecao
      regime="estoque"
      recorte={carga ? `posição ${rotuloPosicao(carga.data_posicao)}` : 'posição na última carga'}
      carimbo={carga ? `Carga gravada em ${fmtDataSP(carga.gravado_em)}` : null}
      ajudaRotulo="Recebíveis e inadimplência"
      ajudaTexto={AJUDA}
    />
  )

  if (dados === null) {
    return (
      <div>
        {meta}
        <CascaEstado>
          <ErroCarregamento mensagem="Não foi possível carregar os recebíveis — recarregue a página." />
        </CascaEstado>
      </div>
    )
  }

  if (carga === null) {
    return (
      <div>
        {meta}
        <CascaEstado>
          <EmptyState
            icon={FileSpreadsheet}
            message="A base de contas a receber ainda não teve a primeira carga. Quando o relatório do Monde for carregado, a posição e a inadimplência aparecem aqui."
          />
        </CascaEstado>
      </div>
    )
  }

  return (
    <div>
      {meta}
      <Corpo dados={dados} dataPosicao={carga.data_posicao} hoje={hoje} />
    </div>
  )
}

// ── Seção com carga ────────────────────────────────────────────────────────────────────────────

function Corpo({ dados, dataPosicao, hoje }: { dados: Recebiveis; dataPosicao: string; hoje: string }) {
  const funil = funilDosRecebiveis(dados)
  const faixas = faixasDeAtraso(dados.inadimplente)
  const devedores = tabelaDevedores(dados.devedores, dados.inadimplente)
  const aviso = avisoInadimplenteAVencer(dados.inadimplente)
  const pontos = pontosSemanais(dados, hoje)

  // Sem referência (nenhuma foto na semana anterior) o Δ some dos três cards: nem número nem "vs DD/MM".
  const escopo = rotuloPosicao(dataPosicao)
  const ref = funil.referencia?.rotulo ?? null
  const apoioInad = [dados.inadimplente.n === 0 ? 'Nenhum título marcado' : plural(dados.inadimplente.n, 'título marcado', 'títulos marcados')]
  if (funil.inadimplente.pctDosVencidos !== null) apoioInad.push(`${fmtPct(funil.inadimplente.pctDosVencidos)} dos vencidos`)
  const apoioVencido = [titulos(funil.vencido.n)]
  if (funil.vencido.pctDoEmAberto !== null) apoioVencido.push(`${fmtPct(funil.vencido.pctDoEmAberto)} do em aberto`)

  return (
    <div className="space-y-4">
      {aviso && <AvisoAVencer n={aviso.n} valor={aviso.valor} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Tile
          rotulo="Recebíveis em aberto"
          escopo={escopo}
          valor={fmtBRL2(funil.emAberto.valor)}
          apoio={[titulos(funil.emAberto.n)]}
          variacao={ref ? funil.emAberto.delta : null}
          referencia={ref}
        />
        <Tile
          rotulo="Recebíveis vencidos"
          escopo={escopo}
          valor={fmtBRL2(funil.vencido.valor)}
          apoio={apoioVencido}
          variacao={ref ? funil.vencido.delta : null}
          referencia={ref}
        />
        <Tile
          rotulo="Inadimplência"
          escopo={escopo}
          valor={fmtBRL2(funil.inadimplente.valor)}
          apoio={apoioInad}
          variacao={ref ? funil.inadimplente.delta : null}
          referencia={ref}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="min-w-0 xl:col-span-2">
          <CabecalhoCard titulo="Faixas de atraso" subtitulo="Só os títulos marcados como inadimplentes." />
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

        <Card className="min-w-0 xl:col-span-3">
          <CabecalhoCard titulo="10 maiores inadimplentes" subtitulo="Por devedor, só os títulos marcados como inadimplentes." />
          {devedores.linhas.length === 0 && devedores.demais === null ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">Nenhum título marcado como inadimplente.</p>
          ) : (
            <ScrollAutoHide eixo="x" className="pb-3.5">
              <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0" aria-label="Dez maiores inadimplentes">
                <colgroup>
                  <col style={{ width: 40 }} /><col /><col style={{ width: 72 }} /><col style={{ width: 150 }} />
                  <col style={{ width: 128 }} /><col style={{ width: 104 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={TH_DIR}>#</th>
                    <th scope="col" className={TH_ESQ}>Devedor</th>
                    <th scope="col" className={TH_DIR}>Títulos</th>
                    <th scope="col" className={TH_DIR}>Valor</th>
                    <th scope="col" className={TH_DIR}>% do inadimplente</th>
                    <th scope="col" className={TH_DIR}>Maior atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {devedores.linhas.map(d => (
                    <tr key={d.posicao}>
                      <td className={TD_NUM}>{d.posicao}</td>
                      <td className={`${TD} truncate ${d.semNome ? 'italic text-[var(--text-muted)]' : ''}`} title={d.devedor}>{d.devedor}</td>
                      <td className={TD_NUM}>{d.n}</td>
                      <td className={TD}><ValorContabil valor={d.valor} /></td>
                      <td className={TD_NUM}>{fmtPct(d.pct)}</td>
                      <td className={TD_NUM}>{rotuloMaiorAtraso(d.maiorAtraso)}</td>
                    </tr>
                  ))}
                  {devedores.demais && (
                    <tr>
                      <td className={TD} />
                      <td className={`${TD} text-[var(--text-muted)]`}>{devedores.demais.rotulo}</td>
                      <td className={TD_NUM}>{devedores.demais.n}</td>
                      <td className={TD}><ValorContabil valor={devedores.demais.valor} /></td>
                      <td className={TD_NUM}>{fmtPct(devedores.demais.pct)}</td>
                      <td className={TD} />
                    </tr>
                  )}
                  <tr>
                    <td className={TD_TOTAL} />
                    <td className={TD_TOTAL}>Total</td>
                    <td className={`${TD_TOTAL} text-right tabular-nums`}>{devedores.total.n}</td>
                    <td className={TD_TOTAL}><ValorContabil valor={devedores.total.valor} /></td>
                    <td className={`${TD_TOTAL} text-right tabular-nums`}>{fmtPct(devedores.total.pct)}</td>
                    <td className={TD_TOTAL} />
                  </tr>
                </tbody>
              </table>
            </ScrollAutoHide>
          )}
          {!devedores.fecha && <AvisoNaoFecha />}
        </Card>
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

/** Defesa: se algum dia o total da tabela não fechar com a inadimplência (completude, inv. 2), a tela diz. */
function AvisoNaoFecha() {
  return (
    <p role="note" className="mt-2 text-xs text-warning-deep">
      Atenção: o total desta tabela não fecha com o valor inadimplente do card acima.
    </p>
  )
}
