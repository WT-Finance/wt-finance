'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import GraficoMensalPorAno, { type SerieDoAno } from '@/components/shared/grafico-mensal-por-ano'
import { PILL, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { fmtDate, fmtDataSP } from '@/lib/fmt'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { custoPorAno, diasSemAntecipacao, rotuloDias } from '@/lib/financeiro-geral/antecipacoes'
import { carimboDoFluxo } from '@/lib/financeiro-geral/carimbos'
import { anosQueFalharam, dadosCarregados, serieMensalMultiAno } from '@/lib/financeiro-geral/composicao'
import { recorteTexto, rotuloDoAno } from '@/lib/financeiro-geral/periodo'
import type { Antecipacoes } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import AntecipacoesCardCusto from './antecipacoes-card-custo'
import AntecipacoesComparativoConta from './antecipacoes-comparativo-conta'
import AntecipacoesVolumeConta from './antecipacoes-volume-conta'
import { CascaEstado, MetaSecao, Tile } from './comum'
import PainelAntecipacoes from './painel-antecipacoes'

// Antecipações — FLUXO (uma leitura por ano selecionado; v6.5.0, segunda forma da página).
//
// Linha 1: "Dias sem antecipação" (do ano CORRENTE, carregado SEMPRE — não depende das pills) | "Custo efetivo no
// ano" | "Custo percentual no ano" (uma linha por ano selecionado). Linha 2: "Volume antecipado por mês/ano"
// (gráfico compartilhado com Marketing, eixo normal: valores positivos). Linha 3: "Volume antecipado por conta"
// | "Comparativo (custo efetivo e percentual por conta)". O rótulo na tela é "Conta", nunca "bandeira".
//
// As contas estão em `antecipacoes.ts`: o custo % dos cards e do comparativo sai de UMA fórmula
// (`custoDoRecorte`); o percentual pronto que a RPC ainda devolve em `total` NÃO é lido. Cada ano falha sozinho:
// cada card desenha os anos que chegaram e avisa dos ausentes. O "Dias sem antecipação" sobrevive mesmo
// se todos os anos das pills falharem (ele lê só o ano corrente).
//
// O registro (botão "Registrar antecipação", painel, desfazer pelo diário) NÃO mudou (inv. 7): o botão só
// existe para quem tem 'financeiro/geral/gestao' (`podeGerir`).

const AJUDA =
  'Volume antecipado pelas contas (Asaas, Blimboo), mês a mês, no regime de caixa. Custo efetivo = desconto ' +
  '(antecipado − líquido), em R$; custo percentual = desconto ÷ valor antecipado do recorte (média ponderada ' +
  'pelo volume). Dias sem antecipação contam da última antecipação registrada até hoje e não dependem dos ' +
  'anos selecionados. Um ano em andamento leva * e vai até o mês corrente.'

const AJUDA_CUSTO_EFETIVO =
  'Desconto que se pagou para antecipar: valor antecipado menos valor líquido recebido, somado no ano (o ano em ' +
  'andamento vai até o mês corrente). Não é CET: o registro de antecipações não tem prazo, então o número não ' +
  'considera por quantos dias o dinheiro foi antecipado.'

interface Props {
  leituras: LeituraAno<Antecipacoes>[]
  /** A leitura do ano CORRENTE, carregada sempre (mesmo com a pill desmarcada): alimenta "Dias sem antecipação". */
  corrente: LeituraAno<Antecipacoes>
  /** Anos selecionados (todos), crescente. */
  anos: number[]
  hoje: string
  podeGerir: boolean
}

export default function SecaoAntecipacoes({ leituras, corrente, anos, hoje, podeGerir }: Props) {
  const [painelAberto, setPainelAberto] = useState(false)

  const carregadas = useMemo(() => dadosCarregados(leituras), [leituras])
  const falhas = useMemo(() => anosQueFalharam(leituras), [leituras])
  const mensal = useMemo(() => serieMensalMultiAno(leituras, d => d.meses.map(m => m.volume)), [leituras])
  const custo = useMemo(() => custoPorAno(leituras, hoje), [leituras, hoje])
  const dias = useMemo(() => diasSemAntecipacao([corrente], hoje), [corrente, hoje])
  // O carimbo vale para tudo o que a seção mostra: os anos selecionados e o corrente.
  const carimbo = useMemo(
    () => carimboDoFluxo([
      ...carregadas.map(c => c.dados),
      ...(corrente.leitura.ok ? [corrente.leitura.dados] : []),
    ]),
    [carregadas, corrente],
  )

  // Entrada genérica do gráfico: por ano carregado, 12 volumes (`null` = mês que o ano ainda não alcançou),
  // o total do ano e o recorte. `carregadas` e `mensal.anos` saem das mesmas leituras, ambos crescentes.
  const series = useMemo<SerieDoAno[]>(
    () => carregadas.map(({ ano, dados }, i) => ({
      ano,
      valores: mensal.pontos.map(p => p.valores[i]),
      total: dados.total.volume,
      parcial: recorteTexto(dados) !== null,
      rotuloRecorte: recorteTexto(dados) ?? undefined,
    })),
    [carregadas, mensal],
  )

  const acao = podeGerir ? (
    <button
      type="button"
      onClick={() => setPainelAberto(true)}
      className={`${PILL} ${PILL_PRIMARIA}`}
      style={PILL_PRIMARIA_STYLE}
    >
      <Plus size={13} aria-hidden /> Registrar antecipação
    </button>
  ) : null

  const recorte = carregadas.length > 0
    ? `${carregadas.map(c => rotuloDoAno(c.ano, c.dados)).join(' + ')} · regime de caixa`
    : rotuloAnos(anos)

  const meta = (
    <MetaSecao
      regime="fluxo"
      recorte={recorte}
      carimbo={carimbo ? `Último registro em ${fmtDataSP(carimbo)}` : null}
      ajudaRotulo="Antecipações"
      ajudaTexto={AJUDA}
      acao={acao}
    />
  )

  const painel = podeGerir && painelAberto
    ? <PainelAntecipacoes hoje={hoje} onFechar={() => setPainelAberto(false)} />
    : null

  // "Dias sem antecipação": lê só o ano corrente. `maiorIntervalo` já inclui o que atravessa a virada e o
  // intervalo em curso (nunca menor que os dias sem antecipação).
  const apoioDias: string[] = []
  if (dias.ultimaData) apoioDias.push(`última em ${fmtDate(dias.ultimaData)}`)
  if (dias.maiorIntervalo) apoioDias.push(`maior intervalo do ano: ${rotuloDias(dias.maiorIntervalo.dias)}`)
  const tileDias = (
    <Tile
      rotulo="Dias sem antecipação"
      escopo="Independe dos anos selecionados"
      valor={dias.dias === null ? null : rotuloDias(dias.dias)}
      estado={dias.estado === 'erro' ? 'erro' : dias.estado === 'sem-registro' ? 'vazio' : 'ok'}
      mensagem={dias.estado === 'erro'
        ? 'Não foi possível carregar o ano corrente — recarregue a página.'
        : 'Nenhuma antecipação registrada ainda.'}
      apoio={apoioDias}
    />
  )

  if (carregadas.length === 0) {
    return (
      <div>
        {meta}
        <div className="space-y-4">
          {dias.estado !== 'erro' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{tileDias}</div>
          )}
          <CascaEstado>
            <ErroCarregamento mensagem={`Não foi possível carregar as antecipações de ${rotuloAnos(falhas.length ? falhas : anos)} — recarregue a página.`} />
          </CascaEstado>
        </div>
        {painel}
      </div>
    )
  }

  // Com ano que falhou, "sem antecipações em <todos os anos>" seria falso: só vale para os carregados.
  const semAntecipacao = !carregadas.some(c => c.dados.total.n > 0)
  const mensagemSemDados = semAntecipacao
    ? `Sem antecipações em ${rotuloAnos(carregadas.map(c => c.ano))}${falhas.length > 0 ? ' (anos carregados)' : ''}.`
    : undefined

  return (
    <div>
      {meta}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {tileDias}
          <AntecipacoesCardCusto
            rotulo="Custo efetivo no ano"
            escopo="Antecipado − líquido, em R$"
            ajuda={<GatilhoAjuda rotulo="Custo efetivo no ano" texto={AJUDA_CUSTO_EFETIVO} />}
            modo="efetivo"
            linhas={custo.linhas}
            anosFalha={custo.anosFalha}
          />
          <AntecipacoesCardCusto
            rotulo="Custo percentual no ano"
            escopo="Desconto ÷ valor antecipado"
            modo="pct"
            linhas={custo.linhas}
            anosFalha={custo.anosFalha}
          />
        </div>

        <GraficoMensalPorAno
          titulo="Volume antecipado por mês/ano"
          subtitulo={`Valor antecipado, bruto · ${recorte}`}
          anos={anos}
          series={series}
          anosFalha={falhas}
          invertido={false}
          descricaoMensal="Volume antecipado por mês, janeiro a dezembro, por ano"
          descricaoTotal="Volume antecipado total por ano"
          mensagemFalhaTotal={`Não foi possível carregar o volume antecipado de ${rotuloAnos(falhas.length ? falhas : anos)}.`}
          mensagemSemDados={mensagemSemDados}
          nomeSerie="Volume"
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          {/* `[&>*]:h-full`: os dois cards têm a mesma altura na linha (o `Card` é o filho direto). */}
          <div className="min-w-0 xl:col-span-2 [&>*]:h-full">
            <AntecipacoesVolumeConta leituras={leituras} />
          </div>
          <div className="min-w-0 xl:col-span-3 [&>*]:h-full">
            <AntecipacoesComparativoConta leituras={leituras} />
          </div>
        </div>
      </div>

      {painel}
    </div>
  )
}
