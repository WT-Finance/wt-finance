'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ChartGrid, ChartXAxisCategoria, ChartYAxisBRL, CustomTooltip, chartMargins, strokeWidths,
} from '@/components/charts'
import { Card } from '@/components/ui/card'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import CabecalhoCard from '@/components/shared/cabecalho-card'
import { passoRedondo } from '@/lib/escala-grafico'
import { fmtBRL2 } from '@/lib/fmt'
import { diaMes } from '@/lib/financeiro-geral/numeros'
import { rotuloIntervaloSemana, type PontoSemana } from '@/lib/financeiro-geral/recebiveis'

// Evolução da Inadimplência (v6.5.0) — UMA linha (o valor inadimplente na última carga de cada
// semana, segunda a domingo). Decisões do Yan (briefing §2.1):
//  • semana sem carga (refino 05/11): a linha é contínua — o ponto é CINZA e repete o valor da última carga
//    anterior (`valorExibido`; o real `inadimplenteValor` segue null). Nunca zero (zero afirmaria "não havia
//    inadimplência"); o tooltip avisa "sem carga na semana · repete DD/MM";
//  • a semana corrente COM carga é PARCIAL (a última foto dela ainda pode mudar): ponto vazado; sem carga, é cinza;
//  • o VENCIDO e o nº de títulos vão no tooltip, não numa segunda linha;
//  • com UMA carga só (o caso do primeiro dia) o gráfico continua legível: o ponto é desenhado (sem ele
//    seriam zero segmentos de linha e o gráfico ficaria em branco) e a nota explica.
// Só o dado muda entre mockup e produção: os pontos vêm de `pontosSemanais` (módulo puro).

const COR = 'var(--action-primary)'
/** Semana sem carga: ponto cinza (o valor repetido da anterior — desenho, não dado). */
const COR_SEM_CARGA = 'var(--text-muted)'
const ALTURA = 220

/** Legenda horizontal dos 3 tipos de ponto, desenhados como no gráfico (o primitivo `ChartLegend` não tem o
 *  marcador vazado, por isso a legenda é local, com os mesmos tokens). */
function LegendaDosPontos() {
  const itens = [
    { rotulo: 'Semana com carga', cor: COR, fill: COR },
    { rotulo: 'Semana sem carga', cor: COR_SEM_CARGA, fill: COR_SEM_CARGA },
    { rotulo: 'Semana em andamento', cor: COR, fill: 'var(--surface)' },
  ]
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
      {itens.map(i => (
        <li key={i.rotulo} className="flex items-center gap-1.5">
          <svg width="12" height="12" className="shrink-0" aria-hidden="true">
            <circle cx="6" cy="6" r="4" fill={i.fill} stroke={i.cor} strokeWidth={2} />
          </svg>
          {i.rotulo}
        </li>
      ))}
    </ul>
  )
}
/** Até este nº de semanas, todo rótulo do eixo aparece; acima, o Recharts omite os que se sobrepõem. */
const SEMANAS_COM_TODOS_OS_ROTULOS = 12

type LinhaGrafico = PontoSemana & { rotuloEixo: string }

/** Eixo Y de 0 ao 1º passo redondo que contém a série — domínio E ticks explícitos (skill `graficos`:
 *  `domain` fixo desliga os ticks bonitos). Começar em zero é o que mantém um ponto isolado legível e não
 *  exagera a inclinação; a ponta de cima só sobe até o último tick (nunca corta ponto). */
function escalaDoEixo(valores: readonly number[]): { domain: [number, number]; ticks: number[] } {
  const max = Math.max(0, ...valores)
  const passo = passoRedondo(max / 4)
  const n = Math.max(1, Math.ceil(max / passo))
  return { domain: [0, n * passo], ticks: Array.from({ length: n + 1 }, (_, i) => i * passo) }
}

export default function EvolucaoInadimplente({
  pontos, desde,
}: {
  pontos: readonly PontoSemana[]
  /** "histórico desde 25/09/2026" (`rotuloHistoricoDesde`); `null` = sem histórico. */
  desde: string | null
}) {
  const ajuda = (
    <GatilhoAjuda
      rotulo="Evolução da Inadimplência"
      texto={
        'Usa a última carga de cada semana (segunda a domingo)' +
        (desde ? ` e começa na primeira carga desta base (${desde}).` : ' e começa na primeira carga desta base.') +
        ' Semana sem carga repete o valor da semana anterior com carga (ponto cinza) — não é zero nem dado novo.'
      }
    />
  )

  if (pontos.length === 0) {
    return (
      <Card>
        <CabecalhoCard titulo="Evolução da Inadimplência" ajuda={ajuda} />
        <p className="py-8 text-center text-sm text-[var(--text-muted)]">
          A evolução começa com a primeira carga e cresce a cada semana.
        </p>
      </Card>
    )
  }

  const dados: LinhaGrafico[] = pontos.map(p => ({ ...p, rotuloEixo: p.rotulo }))
  const comCarga = pontos.filter(p => !p.lacuna)
  const temLacuna = pontos.some(p => p.lacuna)
  const escala = escalaDoEixo(pontos.map(p => p.valorExibido ?? 0))
  const primeiro = pontos[0]
  const ultimo = pontos[pontos.length - 1]

  return (
    <Card>
      <CabecalhoCard titulo="Evolução da Inadimplência" ajuda={ajuda} />
      <div
        role="img"
        aria-label={
          `Inadimplente na última carga de cada semana, de ${rotuloIntervaloSemana(primeiro.semana)} a ${rotuloIntervaloSemana(ultimo.semana)}` +
          (temLacuna ? '; semanas sem carga repetem o valor da última carga anterior' : '')
        }
      >
        <ResponsiveContainer width="100%" height={ALTURA}>
          <LineChart data={dados} margin={chartMargins.default}>
            {ChartGrid()}
            {/* `interval: 0` enquanto cabem todos: o default (`preserveStartEnd`) esconderia semanas do meio. */}
            {ChartXAxisCategoria('rotuloEixo', {
              interval: dados.length <= SEMANAS_COM_TODOS_OS_ROTULOS ? 0 : 'preserveStartEnd',
            })}
            {ChartYAxisBRL({ width: 76, domain: escala.domain, ticks: escala.ticks })}
            {/* `filterNull={false}`: sem isso o Recharts tira do tooltip a série nula e a semana SEM carga
                ficaria sem tooltip nenhum — a lacuna precisa se explicar ("sem carga"). */}
            <Tooltip
              filterNull={false}
              cursor={{ stroke: 'var(--chart-grid)' }}
              content={p => {
                const base = p.payload?.[0]
                const ponto = base?.payload as LinhaGrafico | undefined
                if (!base || !ponto) return null
                const rotulo =
                  rotuloIntervaloSemana(ponto.semana) +
                  (ponto.dataPosicao ? ` · carga de ${diaMes(ponto.dataPosicao)}` : '') +
                  (ponto.parcial ? ' · semana em andamento' : '')
                // Uma linha só no gráfico; o tooltip abre em três (inadimplente, títulos, vencido) sobre a
                // mesma entrada do Recharts. O formatter ignora o número que o CustomTooltip coage a 0:
                // na lacuna a resposta é "sem carga", nunca R$ 0,00.
                const entradas = ponto.lacuna
                  ? [{ ...base, name: 'Inadimplente' }]
                  : [
                      { ...base, name: 'Inadimplente' },
                      { ...base, name: 'Títulos' },
                      { ...base, name: 'Vencido' },
                    ]
                return (
                  <CustomTooltip
                    {...p}
                    payload={entradas}
                    labelFormatter={() => rotulo}
                    formatter={(_v, nome) => {
                      if (ponto.lacuna) {
                        return [
                          'sem carga na semana' + (ponto.repeteDataPosicao ? ` · repete ${diaMes(ponto.repeteDataPosicao)}` : ''),
                          nome,
                        ]
                      }
                      if (nome === 'Títulos') return [String(ponto.inadimplenteN ?? 0), nome]
                      if (nome === 'Vencido') return [fmtBRL2(ponto.vencidoValor ?? 0), nome]
                      return [fmtBRL2(ponto.inadimplenteValor ?? 0), nome]
                    }}
                  />
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="valorExibido"
              name="Inadimplente"
              stroke={COR}
              strokeWidth={strokeWidths.line}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={p => {
                const ponto = p.payload as LinhaGrafico | undefined
                return (
                  <circle
                    key={`ativo-${ponto?.semana}`}
                    cx={p.cx}
                    cy={p.cy}
                    r={5}
                    fill={ponto?.lacuna ? COR_SEM_CARGA : COR}
                  />
                )
              }}
              // Um círculo por ponto COM valor exibido. Com carga = cheio na cor da linha; sem carga = cheio
              // cinza (repete a anterior); em andamento = vazado. É o dot explícito que mantém legível a
              // semana isolada e o caso de uma carga só.
              dot={p => {
                const ponto = p.payload as LinhaGrafico | undefined
                if (!ponto || ponto.valorExibido === null || p.cx == null || p.cy == null) return null
                const cor = ponto.lacuna ? COR_SEM_CARGA : COR
                return (
                  <circle
                    key={`ponto-${ponto.semana}`}
                    cx={p.cx}
                    cy={p.cy}
                    r={4}
                    fill={ponto.parcial ? 'var(--surface)' : cor}
                    stroke={cor}
                    strokeWidth={2}
                  />
                )
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <LegendaDosPontos />
      {comCarga.length === 1 && (
        <p className="mt-1 text-center text-xs text-[var(--text-subtle)]">
          Só há uma carga até agora{comCarga[0].dataPosicao ? ` (${diaMes(comCarga[0].dataPosicao)})` : ''}: a
          evolução aparece como um ponto e a linha se forma a partir da próxima semana com carga.
        </p>
      )}
    </Card>
  )
}
