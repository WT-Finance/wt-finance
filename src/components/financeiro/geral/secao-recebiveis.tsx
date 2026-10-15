'use client'

import { useMemo } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ChartGrid, ChartXAxisCategoria, ChartYAxisBRL, CustomTooltip, barRadius, chartMargins,
} from '@/components/charts'
import { Card } from '@/components/ui/card'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { fmtBRL2, fmtDataSP, fmtDate } from '@/lib/fmt'
import { fmtPct } from '@/lib/marketing/formatar'
import {
  evolucaoParaGrafico, faixasCompletas, marcacoesOrdenadas, rotuloConcentracao, rotuloHistoricoDesde,
  rotuloPosicao, topComPct,
} from '@/lib/financeiro-geral/recebiveis'
import { diaMes } from '@/lib/financeiro-geral/numeros'
import type { Recebiveis } from '@/lib/financeiro-geral/schemas'
import type { Carregado } from '@/lib/financeiro-geral/tipos'
import { variacao } from '@/lib/financeiro-geral/variacao'
import { CascaEstado, MetaSecao, TD, TD_NUM, TD_TOTAL, TH_DIR, TH_ESQ, Tile } from './comum'

// Recebíveis e inadimplência — ESTOQUE: a posição numa data (a da última carga de contas a receber) e
// por isso IGNORA as pills de ano. Decisões do Yan (GATE 1):
//  • Inadimplência = SÓ a marcação `Conferido = Inadimplente`; o "vencido em aberto" pela data NÃO é número.
//  • As faixas de atraso (1–30 … 90+) são sobre os títulos MARCADOS; "a vencer" é a carteira.
//  • A marcação dos demais títulos em aberto aparece só como CONTEXTO.
//  • Nome do devedor só no top 10 desta seção (a faixa do topo diz "10 maiores = X%" sem nome).
// A evolução usa a última foto de cada mês e começa na 1ª carga da base ("histórico desde"): nunca fabrica zero antes.

const AJUDA =
  'Posição dos contas a receber na data da última carga (não muda com os anos escolhidos). Inadimplente = títulos ' +
  'marcados como Inadimplente pelo Financeiro e ainda não liquidados; as faixas de atraso contam os dias entre o ' +
  'vencimento e a data da carga, só desses títulos. A vencer = títulos em aberto com vencimento depois da carga. ' +
  'A marcação dos demais títulos em aberto é contexto. Recuperado = títulos que estavam marcados e foram liquidados no ano. ' +
  'A evolução usa a última carga de cada mês e começa a partir da primeira carga desta base.'

const NOME_SEM_PESSOA = '(sem nome)'

export default function SecaoRecebiveis({ leitura }: { leitura: Carregado<Recebiveis> }) {
  const dados = leitura.ok ? leitura.dados : null
  const faixas = useMemo(() => (dados ? faixasCompletas(dados.inadimplente) : []), [dados])
  const marcacoes = useMemo(() => marcacoesOrdenadas(dados?.marcacao_em_aberto ?? []), [dados])
  const top = useMemo(() => (dados ? topComPct(dados.concentracao, dados.inadimplente.valor) : []), [dados])
  const evolucao = useMemo(() => evolucaoParaGrafico(dados?.evolucao ?? []), [dados])

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

  if (!leitura.ok || dados === null) {
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

  const { inadimplente, a_vencer: aVencer, recuperado_ano: recuperado, comparativo } = dados
  const conc = rotuloConcentracao(dados.concentracao.pct_top, inadimplente.n)
  const desde = rotuloHistoricoDesde(dados.historico_desde)

  return (
    <div>
      {meta}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          rotulo="Inadimplente (marcado)"
          escopo={rotuloPosicao(carga.data_posicao)}
          valor={fmtBRL2(inadimplente.valor)}
          apoio={[inadimplente.n === 0 ? 'Nenhum título marcado' : `${inadimplente.n} ${inadimplente.n === 1 ? 'título' : 'títulos'}`, ...(conc ? [conc] : [])]}
          variacao={comparativo ? variacao(comparativo.inadimplente_valor, inadimplente.valor, 'menor-melhor') : null}
          referencia={comparativo ? `vs carga de ${diaMes(comparativo.data_posicao)}` : null}
        />
        <Tile
          rotulo="A vencer (carteira)"
          escopo={rotuloPosicao(carga.data_posicao)}
          valor={fmtBRL2(aVencer.valor)}
          apoio={[`${aVencer.n} ${aVencer.n === 1 ? 'título' : 'títulos'} em aberto`]}
        />
        <Tile
          rotulo={`Recuperado em ${recuperado.ano ?? ''}`.trim()}
          escopo="marcados que foram liquidados"
          valor={fmtBRL2(recuperado.valor)}
          apoio={[`${recuperado.n} ${recuperado.n === 1 ? 'título' : 'títulos'}`]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Faixas de atraso" subtitle="Só os títulos marcados como inadimplentes.">
          <table className="w-full table-fixed border-separate border-spacing-0" aria-label="Inadimplentes por faixa de atraso">
            <colgroup><col /><col style={{ width: 64 }} /><col /><col style={{ width: 64 }} /></colgroup>
            <thead>
              <tr>
                <th scope="col" className={TH_ESQ}>Atraso</th>
                <th scope="col" className={TH_DIR}>Títulos</th>
                <th scope="col" className={TH_DIR}>Valor</th>
                <th scope="col" className={TH_DIR}>%</th>
              </tr>
            </thead>
            <tbody>
              {faixas.map(f => (
                <tr key={f.faixa}>
                  <td className={TD}>{f.rotulo}</td>
                  <td className={TD_NUM}>{f.n}</td>
                  <td className={TD}><ValorContabil valor={f.valor} /></td>
                  <td className={TD_NUM}>{fmtPct(f.pct)}</td>
                </tr>
              ))}
              <tr>
                <td className={TD_TOTAL}>Total marcado</td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{inadimplente.n}</td>
                <td className={TD_TOTAL}><ValorContabil valor={inadimplente.valor} /></td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{inadimplente.valor > 0 ? fmtPct(100) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card title="Títulos em aberto por marcação" subtitle="Contexto: como o Financeiro marcou o que ainda está em aberto (vencido e a vencer).">
          <table className="w-full table-fixed border-separate border-spacing-0" aria-label="Títulos em aberto por marcação">
            <colgroup><col /><col style={{ width: 64 }} /><col /><col style={{ width: 64 }} /></colgroup>
            <thead>
              <tr>
                <th scope="col" className={TH_ESQ}>Marcação</th>
                <th scope="col" className={TH_DIR}>Títulos</th>
                <th scope="col" className={TH_DIR}>Valor</th>
                <th scope="col" className={TH_DIR}>%</th>
              </tr>
            </thead>
            <tbody>
              {marcacoes.linhas.map(m => (
                <tr key={m.conferido ?? 'sem'}>
                  <td className={TD}>{m.rotulo}</td>
                  <td className={TD_NUM}>{m.n}</td>
                  <td className={TD}><ValorContabil valor={m.valor} /></td>
                  <td className={TD_NUM}>{fmtPct(m.pct)}</td>
                </tr>
              ))}
              <tr>
                <td className={TD_TOTAL}>Em aberto</td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{marcacoes.total.n}</td>
                <td className={TD_TOTAL}><ValorContabil valor={marcacoes.total.valor} /></td>
                <td className={TD_TOTAL} />
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Evolução do inadimplente" subtitle={desde ?? 'Última carga de cada mês'}>
          {evolucao.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              A evolução começa com a primeira carga e cresce a cada mês.
            </p>
          ) : (
            <div role="img" aria-label={`Inadimplente marcado na última carga de cada mês, de ${evolucao[0].rotulo} a ${evolucao[evolucao.length - 1].rotulo}`}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={evolucao} margin={chartMargins.default} barCategoryGap="30%">
                  {ChartGrid()}
                  {ChartXAxisCategoria('rotulo', { interval: 0 })}
                  {ChartYAxisBRL({ width: 76 })}
                  <Tooltip
                    content={p => (
                      <CustomTooltip
                        {...p}
                        labelFormatter={(l: string) => {
                          const ponto = evolucao.find(e => e.rotulo === l)
                          return ponto ? `${l} · carga de ${fmtDate(ponto.dataPosicao)}` : l
                        }}
                        formatter={v => [fmtBRL2(v), 'Inadimplente']}
                      />
                    )}
                    cursor={{ fill: 'var(--surface-soft)' }}
                  />
                  <Bar dataKey="valor" name="Inadimplente" fill="var(--action-primary)" radius={barRadius.top} maxBarSize={36} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card
          title="10 maiores inadimplentes"
          subtitle={conc ? `${conc} do total marcado.` : 'Concentração do total marcado.'}
        >
          {top.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">Nenhum título marcado como inadimplente.</p>
          ) : (
            <table className="w-full table-fixed border-separate border-spacing-0" aria-label="Dez maiores inadimplentes">
              <colgroup><col style={{ width: 40 }} /><col /><col style={{ width: 72 }} /><col style={{ width: 168 }} /><col style={{ width: 92 }} /></colgroup>
              <thead>
                <tr>
                  <th scope="col" className={TH_DIR}>#</th>
                  <th scope="col" className={TH_ESQ}>Cliente</th>
                  <th scope="col" className={TH_DIR}>Títulos</th>
                  <th scope="col" className={TH_DIR}>Valor</th>
                  <th scope="col" className={TH_DIR}>% do total</th>
                </tr>
              </thead>
              <tbody>
                {top.map(t => (
                  <tr key={t.posicao}>
                    <td className={TD_NUM}>{t.posicao}</td>
                    <td className={`${TD} truncate`} title={t.pessoa ?? NOME_SEM_PESSOA}>{t.pessoa ?? NOME_SEM_PESSOA}</td>
                    <td className={TD_NUM}>{t.n}</td>
                    <td className={TD}><ValorContabil valor={t.valor} /></td>
                    <td className={TD_NUM}>{fmtPct(t.pct)}</td>
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
