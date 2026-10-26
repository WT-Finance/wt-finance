'use client'

import { useMemo } from 'react'
import { TriangleAlert } from 'lucide-react'
import EmConstrucaoSecao from '@/components/shared/em-construcao-secao'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import GraficoMensalPorAno, { type SerieDoAno } from '@/components/shared/grafico-mensal-por-ano'
import { fmtBRL2, fmtDataSP } from '@/lib/fmt'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { carimboDoFluxo } from '@/lib/financeiro-geral/carimbos'
import { anosQueFalharam, dadosCarregados, serieMensalMultiAno } from '@/lib/financeiro-geral/composicao'
import { recorteTexto, rotuloDoAno } from '@/lib/financeiro-geral/periodo'
import { bandejaDosAnos } from '@/lib/financeiro-geral/prejuizos'
import type { Prejuizos } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import { CascaEstado, MetaSecao } from './comum'
import PrejuizosTabelaPessoa from './prejuizos-tabela-pessoa'

// Perdas e prejuízos — FLUXO (v6.5.0, segunda forma da página). Tudo BRUTO, no sinal da DRE (negativo):
// reversão e líquido saíram. Três peças: "Prejuízo por pessoa" (uma tabela que soma os anos selecionados),
// "Prejuízo por setor" (adiado — placeholder até haver fonte de setor) e "Prejuízo bruto por mês/ano" (o
// gráfico compartilhado com Marketing, eixo invertido: o prejuízo SOBE a partir do zero, como a despesa na DRE).
// As contas estão em `prejuizos.ts`; aqui só se desenha. Cada ano falha sozinho: o gráfico desenha os que
// chegaram e avisa dos ausentes; a tabela por pessoa declara os anos que somou e avisa do que ficou fora.
// A bandeja (categoria com nome de prejuízo/perda ainda fora do mapa) é VISÍVEL: nunca fica de fora em silêncio.

const AJUDA =
  'Prejuízo bruto = lançamentos realizados na categoria Prejuízos (negativo, como na DRE), no regime de caixa: ' +
  'cada total é a soma das células da DRE. "Pessoa" é o campo pessoa do lançamento no Monde; lançamento sem ' +
  'pessoa aparece como "(sem pessoa)". Um ano em andamento leva * e vai até o mês corrente.'

interface Props {
  leituras: LeituraAno<Prejuizos>[]
  /** Anos selecionados (todos), crescente. */
  anos: number[]
  /** Hoje em SP ('AAAA-MM-DD'). Sem uso aqui: o recorte de cada ano vem da própria RPC (`relacao`/`mes_corrente`).
   *  Fica na interface para a seção ter a mesma assinatura das irmãs de fluxo. */
  hoje: string
}

export default function SecaoPrejuizos({ leituras, anos }: Props) {
  const carregadas = useMemo(() => dadosCarregados(leituras), [leituras])
  const falhas = useMemo(() => anosQueFalharam(leituras), [leituras])
  const mensal = useMemo(() => serieMensalMultiAno(leituras, d => d.prejuizo.meses), [leituras])
  const bandeja = useMemo(() => bandejaDosAnos(leituras), [leituras])
  const carimbo = useMemo(() => carimboDoFluxo(carregadas.map(c => c.dados)), [carregadas])

  // Entrada genérica do gráfico: por ano carregado, 12 valores (`null` = mês que o ano ainda não alcançou),
  // o total do ano e o recorte. `carregadas` e `mensal.anos` saem das mesmas leituras, ambos crescentes.
  const series = useMemo<SerieDoAno[]>(
    () => carregadas.map(({ ano, dados }, i) => ({
      ano,
      valores: mensal.pontos.map(p => p.valores[i]),
      total: dados.prejuizo.total,
      parcial: recorteTexto(dados) !== null,
      rotuloRecorte: recorteTexto(dados) ?? undefined,
    })),
    [carregadas, mensal],
  )

  const recorte = carregadas.length > 0
    ? `${carregadas.map(c => rotuloDoAno(c.ano, c.dados)).join(' + ')} · regime de caixa`
    : rotuloAnos(anos)

  const meta = (
    <MetaSecao
      regime="fluxo"
      recorte={recorte}
      carimbo={carimbo ? `Atualizado em ${fmtDataSP(carimbo)}` : null}
      ajudaRotulo="Perdas e prejuízos"
      ajudaTexto={AJUDA}
    />
  )

  if (carregadas.length === 0) {
    return (
      <div>
        {meta}
        <CascaEstado>
          <ErroCarregamento mensagem={`Não foi possível carregar os prejuízos de ${rotuloAnos(falhas.length ? falhas : anos)} — recarregue a página.`} />
        </CascaEstado>
      </div>
    )
  }

  // Com ano que falhou, "sem prejuízos em <todos os anos>" seria falso: só vale para os carregados.
  const mensagemSemDados = mensal.temMovimento
    ? undefined
    : `Sem prejuízos registrados em ${rotuloAnos(carregadas.map(c => c.ano))}${falhas.length > 0 ? ' (anos carregados)' : ''}.`

  return (
    <div>
      {meta}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PrejuizosTabelaPessoa leituras={leituras} />
          <EmConstrucaoSecao titulo="Prejuízo por setor" detalhe="Depende de uma fonte de setor." />
        </div>

        <GraficoMensalPorAno
          titulo="Prejuízo bruto por mês/ano"
          subtitulo={`Sinal da DRE: prejuízo negativo · ${recorte}`}
          anos={anos}
          series={series}
          anosFalha={falhas}
          invertido
          descricaoMensal="Prejuízo bruto por mês, janeiro a dezembro, por ano"
          descricaoTotal="Prejuízo bruto total por ano"
          mensagemFalhaTotal={`Não foi possível carregar o prejuízo de ${rotuloAnos(falhas.length ? falhas : anos)}.`}
          mensagemSemDados={mensagemSemDados}
          nomeSerie="Prejuízo"
        />

        {bandeja.length > 0 && (
          <div role="status" className="rounded-xl border border-warning bg-warning-bg px-5 py-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-warning-deep">
              <TriangleAlert size={15} aria-hidden /> Categorias de prejuízo ou perda ainda fora do mapa
            </p>
            <p className="mt-1 text-xs text-warning-deep">
              Não entram nos números acima até serem classificadas. Avise quem mantém o mapa da DRE.
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-warning-deep">
              {bandeja.map(b => (
                <li key={b.categoriaId}>
                  <span className="font-medium">{b.rotulo}</span>
                  {' — '}
                  {b.porAno.map(p => `${p.ano}: ${fmtBRL2(p.total)}`).join(' · ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
