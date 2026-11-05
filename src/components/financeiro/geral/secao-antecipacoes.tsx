'use client'

import { useMemo, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import GraficoMensalPorAno, { type SerieDoAno } from '@/components/shared/grafico-mensal-por-ano'
import { PILL } from '@/components/shared/botoes'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { fmtDate } from '@/lib/fmt'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { custoPorAno, diasSemAntecipacao, rotuloDias, type IntervaloAntecipacao } from '@/lib/financeiro-geral/antecipacoes'
import { anosQueFalharam, dadosCarregados, serieMensalMultiAno } from '@/lib/financeiro-geral/composicao'
import { recorteTexto } from '@/lib/financeiro-geral/periodo'
import type { Antecipacoes } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import AntecipacoesCardCusto from './antecipacoes-card-custo'
import AntecipacoesComparativoConta from './antecipacoes-comparativo-conta'
import { CascaEstado, Tile } from './comum'
import PainelAntecipacoes from './painel-antecipacoes'

// Antecipações — FLUXO, FIXO no ano corrente e nos dois anteriores (ex.: 2024, 2025, 2026*; v6.5.0). Sem pills
// e sem parâmetro de URL: o servidor lê os 3 anos e a seção desenha todos.
//
// Linha de cima: só "Registro de Antecipações" (quem pode gerir), sem "?" da seção. Sem selo "fluxo", sem texto
// de recorte e sem data: a data de atualização ("Antecipações") mora no topo da página.
//
// Linha 1: "Dias sem antecipação" (do ano CORRENTE) | "Custo Efetivo" | "Custo efetivo percentual" (uma linha por
// ano). Linha 2: "Volume Mensal de Antecipações" (gráfico compartilhado com Marketing, eixo normal: valores
// positivos). Linha 3: "Comparativo por Conta" (uma tabela só, largura total). O rótulo na tela é "Conta",
// nunca "bandeira".
//
// As contas estão em `antecipacoes.ts`: o custo % dos cards e do comparativo sai de UMA fórmula
// (`custoDoRecorte`); o percentual pronto que a RPC ainda devolve em `total` NÃO é lido. Cada ano falha sozinho:
// cada card desenha os anos que chegaram e avisa dos ausentes. O "Dias sem antecipação" lê só o ano corrente.
//
// O registro (botão "Registrar antecipação", painel, desfazer pelo diário) NÃO mudou (inv. 7): o botão só
// existe para quem tem 'financeiro/geral/gestao' (`podeGerir`).

// Botão âmbar (tokens de aviso, como a `Badge warning`): borda `--warning`, fundo `--warning-bg`, texto
// `--warning-deep` (4,70:1 sobre o fundo — o `--warning` puro reprova AA em corpo pequeno). O foco vem do `PILL`.
const PILL_ALERTA = 'border-warning bg-warning-bg text-warning-deep hover:brightness-95'

const AJUDA_CUSTO_EFETIVO =
  'Desconto que se pagou para antecipar: valor antecipado menos valor líquido recebido, somado no ano. Não é CET: ' +
  'o registro de antecipações não tem prazo, então o número não considera por quantos dias o dinheiro foi ' +
  'antecipado. * = ano corrente parcial, até o mês corrente; a variação compara com o mesmo período do ano anterior.'

const AJUDA_CUSTO_PCT =
  'Desconto ÷ valor antecipado do ano (média ponderada pelo volume, nunca a média simples das taxas). * = ano ' +
  'corrente parcial, até o mês corrente; a variação, em pontos percentuais, compara com o mesmo período do ano anterior.'

const AJUDA_VOLUME =
  'Valor antecipado (bruto), mês a mês, no regime de caixa, no ano corrente e nos dois anteriores. * = ano ' +
  'corrente parcial: vai até o mês corrente.'

interface Props {
  /** Os 3 anos fixos, crescente. */
  leituras: LeituraAno<Antecipacoes>[]
  /** A leitura do ano CORRENTE: alimenta "Dias sem antecipação" (é a mesma leitura de `leituras`). */
  corrente: LeituraAno<Antecipacoes>
  /** Os anos da seção (os mesmos de `leituras`), crescente. */
  anos: number[]
  /** O recorde de sempre de dias sem antecipação (todos os anos desde o primeiro); `null` esconde a linha. */
  intervaloRecorde: IntervaloAntecipacao | null
  hoje: string
  podeGerir: boolean
}

export default function SecaoAntecipacoes({ leituras, corrente, anos, intervaloRecorde, hoje, podeGerir }: Props) {
  const [painelAberto, setPainelAberto] = useState(false)

  const carregadas = useMemo(() => dadosCarregados(leituras), [leituras])
  const falhas = useMemo(() => anosQueFalharam(leituras), [leituras])
  const mensal = useMemo(() => serieMensalMultiAno(leituras, d => d.meses.map(m => m.volume)), [leituras])
  const custo = useMemo(() => custoPorAno(leituras), [leituras])
  const dias = useMemo(() => diasSemAntecipacao([corrente], hoje), [corrente, hoje])

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
      className={`${PILL} ${PILL_ALERTA}`}
    >
      <ClipboardList size={13} aria-hidden /> Registro de Antecipações
    </button>
  ) : null

  // A linha de cima da seção: só o botão "Registro de Antecipações" (abre o registro num modal), para quem pode
  // gerir; sem permissão não há linha. A data de atualização ("Antecipações") mora no topo da página.
  const meta = acao ? <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">{acao}</div> : null

  const painel = podeGerir && painelAberto
    ? <PainelAntecipacoes hoje={hoje} onFechar={() => setPainelAberto(false)} />
    : null

  // "Dias sem antecipação": lê só o ano corrente. `maiorIntervalo` já inclui o que atravessa a virada e o
  // intervalo em curso (nunca menor que os dias sem antecipação).
  const apoioDias: string[] = []
  if (dias.ultimaData) apoioDias.push(`última em ${fmtDate(dias.ultimaData)}`)
  if (dias.maiorIntervalo) apoioDias.push(`maior intervalo do ano: ${rotuloDias(dias.maiorIntervalo.dias)}`)
  // O recorde de sempre: `null` (algum ano falhou, ou nunca houve intervalo) ⇒ a linha não aparece.
  if (intervaloRecorde) apoioDias.push(`maior intervalo de sempre: ${rotuloDias(intervaloRecorde.dias)}`)
  const tileDias = (
    <Tile
      rotulo="Dias sem antecipação"
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
            rotulo="Custo Efetivo"
            ajuda={<GatilhoAjuda rotulo="Custo Efetivo" texto={AJUDA_CUSTO_EFETIVO} />}
            modo="efetivo"
            linhas={custo.linhas}
            anosFalha={custo.anosFalha}
          />
          <AntecipacoesCardCusto
            rotulo="Custo efetivo percentual"
            ajuda={<GatilhoAjuda rotulo="Custo efetivo percentual" texto={AJUDA_CUSTO_PCT} />}
            modo="pct"
            linhas={custo.linhas}
            anosFalha={custo.anosFalha}
          />
        </div>

        <GraficoMensalPorAno
          titulo="Volume Mensal de Antecipações"
          ajuda={<GatilhoAjuda rotulo="Volume Mensal de Antecipações" texto={AJUDA_VOLUME} />}
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

        <AntecipacoesComparativoConta leituras={leituras} />
      </div>

      {painel}
    </div>
  )
}
