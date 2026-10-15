'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { PILL, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { fmtDate, fmtDataSP } from '@/lib/fmt'
import { fmtDeltaPct, fmtPct } from '@/lib/marketing/formatar'
import { rotuloAnos } from '@/lib/marketing/periodo'
import {
  contasDosAnos, diasSemAntecipar, indicadoresDoAno, pausaAtualEhMaior, rotuloDias,
} from '@/lib/financeiro-geral/antecipacoes'
import { carimboDoFluxo } from '@/lib/financeiro-geral/carimbos'
import { anosQueFalharam, dadosCarregados, serieMensalMultiAno } from '@/lib/financeiro-geral/composicao'
import { rotuloDoAno } from '@/lib/financeiro-geral/periodo'
import type { Antecipacoes } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import { CascaEstado, MetaSecao, TD, TD_NUM, TH_DIR, TH_ESQ, Tile } from './comum'
import GraficoMensal from './grafico-mensal'
import PainelAntecipacoes from './painel-antecipacoes'

// Antecipações — FLUXO (uma leitura por ano selecionado).
//
// O DESCONTO é só contexto: o custo da antecipação conta em "Custos financeiros" (grupo Antecipação) e
// nenhum número daqui o soma a custo algum — contar o mesmo real nas duas seções seria dobrar o custo.
// Os sinais de pressão de caixa são os "dias desde a última antecipação" e o "maior intervalo do ano".
// O botão "Registrar antecipação" só existe para quem tem 'financeiro/geral/gestao' (`podeGerir`).

const AJUDA =
  'Volume antecipado pelas contas (Asaas, Blimboo), mês a mês, no regime de caixa. O desconto é o que se paga ' +
  'para antecipar (antecipado − líquido) e aparece só como contexto: o custo de antecipação já conta em Custos ' +
  'financeiros — não some os dois. Dias desde a última antecipação e maior intervalo do ano mostram quanto ' +
  'tempo o caixa passou sem precisar antecipar. Um ano em andamento leva * e vai até o mês corrente.'

interface Props {
  leituras: LeituraAno<Antecipacoes>[]
  /** Anos selecionados (todos), crescente. */
  anos: number[]
  hoje: string
  podeGerir: boolean
}

export default function SecaoAntecipacoes({ leituras, anos, hoje, podeGerir }: Props) {
  const [painelAberto, setPainelAberto] = useState(false)

  const carregadas = useMemo(() => dadosCarregados(leituras), [leituras])
  const falhas = useMemo(() => anosQueFalharam(leituras), [leituras])
  const indicadores = useMemo(() => carregadas.map(c => indicadoresDoAno(c.dados)), [carregadas])
  const serie = useMemo(() => serieMensalMultiAno(leituras, d => d.meses.map(m => m.volume)), [leituras])
  const contas = useMemo(() => contasDosAnos(carregadas.map(c => c.dados)), [carregadas])
  const carimbo = useMemo(() => carimboDoFluxo(carregadas.map(c => c.dados)), [carregadas])

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

  const meta = (
    <MetaSecao
      regime="fluxo"
      recorte={carregadas.length > 0 ? `${carregadas.map(c => rotuloDoAno(c.ano, c.dados)).join(' + ')} · regime de caixa` : rotuloAnos(anos)}
      carimbo={carimbo ? `Último registro em ${fmtDataSP(carimbo)}` : null}
      ajudaRotulo="Antecipações"
      ajudaTexto={AJUDA}
      acao={acao}
    />
  )

  const painel = podeGerir && painelAberto
    ? <PainelAntecipacoes hoje={hoje} onFechar={() => setPainelAberto(false)} />
    : null

  if (carregadas.length === 0) {
    return (
      <div>
        {meta}
        <CascaEstado>
          <ErroCarregamento mensagem={`Não foi possível carregar as antecipações de ${rotuloAnos(falhas.length ? falhas : anos)} — recarregue a página.`} />
        </CascaEstado>
        {painel}
      </div>
    )
  }

  // Os sinais "agora" são GLOBAIS (todas as contas, todos os anos): a RPC devolve o mesmo valor em cada
  // ano — vale o do ano mais recente que carregou, com o maior intervalo DESTE ano.
  const recente = carregadas[carregadas.length - 1].dados
  const dias = diasSemAntecipar(recente, hoje)
  const maiorRecente = recente.maior_intervalo_ano
  const apoioDias: string[] = []
  if (recente.ultima_data) apoioDias.push(`Última em ${fmtDate(recente.ultima_data)}`)
  if (maiorRecente) apoioDias.push(`Maior intervalo de ${rotuloDoAno(recente.ano, recente)}: ${rotuloDias(maiorRecente.dias)}`)
  if (pausaAtualEhMaior(dias, maiorRecente)) apoioDias.push('A pausa atual já é a maior do ano')

  const algumaAntecipacao = indicadores.some(i => i.n > 0)

  return (
    <div>
      {meta}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          rotulo="Dias desde a última antecipação"
          valor={dias === null ? null : rotuloDias(dias)}
          estado={dias === null ? 'vazio' : 'ok'}
          mensagem="Nenhuma antecipação registrada ainda."
          apoio={apoioDias}
        />
        <Card className="sm:col-span-2" title="Volume antecipado por mês">
          {algumaAntecipacao
            ? <GraficoMensal serie={serie} anosSelecionados={anos} descricao="Volume antecipado por mês, janeiro a dezembro, por ano" nomeSerie="Volume" />
            : <p className="py-10 text-center text-sm text-[var(--text-muted)]">Sem antecipações em {rotuloAnos(carregadas.map(c => c.ano))}.</p>}
        </Card>
      </div>

      <Card title="Resumo por ano" subtitle="O desconto é só contexto — o custo da antecipação conta em Custos financeiros.">
        <table className="w-full table-fixed border-separate border-spacing-0" aria-label="Antecipações por ano">
          <colgroup>
            <col style={{ width: 232 }} />
            {indicadores.map(i => <col key={i.ano} />)}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={TH_ESQ}>Indicador</th>
              {carregadas.map(c => (
                <th key={c.ano} scope="col" className={TH_DIR}>{rotuloDoAno(c.ano, c.dados)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${TD} font-medium`}>Volume antecipado</td>
              {indicadores.map(i => <td key={i.ano} className={`${TD} font-medium`}><ValorContabil valor={i.volume} /></td>)}
            </tr>
            <tr>
              <td className={TD}>Δ vs. mesmo período do ano anterior</td>
              {indicadores.map(i => (
                <td key={i.ano} className={TD_NUM}>{fmtDeltaPct(i.deltaVolume.pct)}</td>
              ))}
            </tr>
            <tr>
              <td className={TD}>Valor líquido recebido</td>
              {indicadores.map(i => <td key={i.ano} className={TD}><ValorContabil valor={i.liquido} /></td>)}
            </tr>
            <tr>
              <td className={TD}>Desconto (contexto)</td>
              {indicadores.map(i => <td key={i.ano} className={TD}><ValorContabil valor={i.desconto} /></td>)}
            </tr>
            <tr>
              <td className={TD}>Desconto sobre o volume</td>
              {indicadores.map(i => <td key={i.ano} className={TD_NUM}>{fmtPct(i.descontoPct)}</td>)}
            </tr>
            <tr>
              <td className={TD}>Nº de antecipações</td>
              {indicadores.map(i => <td key={i.ano} className={TD_NUM}>{i.n}</td>)}
            </tr>
            <tr>
              <td className={TD}>Maior intervalo sem antecipar</td>
              {indicadores.map(i => (
                <td key={i.ano} className={TD_NUM}>
                  {i.maiorIntervalo
                    ? <span title={`de ${fmtDate(i.maiorIntervalo.de)} a ${fmtDate(i.maiorIntervalo.ate)}`}>{rotuloDias(i.maiorIntervalo.dias)}</span>
                    : '—'}
                </td>
              ))}
            </tr>
            {contas.map(conta => (
              <tr key={conta}>
                <td className={`${TD} pl-6 text-[var(--text-muted)]`}>Volume · {conta}</td>
                {indicadores.map(i => {
                  const c = i.porConta.find(x => x.conta === conta)
                  return <td key={i.ano} className={TD}>{c ? <ValorContabil valor={c.volume} /> : <span className="block text-right text-[var(--text-subtle)]">—</span>}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {falhas.length > 0 && (
          <ErroCarregamento
            className="mt-3"
            mensagem={`Não foi possível carregar ${rotuloAnos(falhas)}; fora da tabela.`}
          />
        )}
      </Card>

      {painel}
    </div>
  )
}
