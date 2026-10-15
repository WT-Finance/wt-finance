'use client'

import { useMemo } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { fmtBRL2, fmtDataSP } from '@/lib/fmt'
import { fmtDeltaPct } from '@/lib/marketing/formatar'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { carimboDoFluxo } from '@/lib/financeiro-geral/carimbos'
import { anosQueFalharam, dadosCarregados, serieMensalMultiAno } from '@/lib/financeiro-geral/composicao'
import { rotuloDoAno } from '@/lib/financeiro-geral/periodo'
import { bandejaDosAnos, resumoDoAno } from '@/lib/financeiro-geral/prejuizos'
import type { Prejuizos } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import { CascaEstado, MetaSecao, TD, TD_NUM, TH_DIR, TH_ESQ } from './comum'
import GraficoMensal from './grafico-mensal'

// Perdas e prejuízos — FLUXO. Decisão do Yan (GATE 0): o número e a série principais são o PREJUÍZO
// BRUTO (categoria da tabela curada, no sinal da DRE: negativo); a reversão ("recuperado") e o líquido
// ficam ao lado como contexto. "Por natureza" saiu — no lugar, o prejuízo por mês.
// A bandeja (categoria com nome de prejuízo/perda ainda fora do mapa) é VISÍVEL: nunca fica de fora em silêncio.

const AJUDA =
  'Prejuízo bruto = lançamentos realizados na categoria Prejuízos (negativo, como na DRE). Recuperado = Reversão ' +
  'de Perdas Financeiras (positivo). Líquido = prejuízo + recuperado. Mesmo recorte do regime de caixa da DRE: ' +
  'cada total é a soma das células da DRE. Um ano em andamento leva * e vai até o mês corrente.'

interface Props {
  leituras: LeituraAno<Prejuizos>[]
  anos: number[]
}

export default function SecaoPrejuizos({ leituras, anos }: Props) {
  const carregadas = useMemo(() => dadosCarregados(leituras), [leituras])
  const falhas = useMemo(() => anosQueFalharam(leituras), [leituras])
  const resumos = useMemo(() => carregadas.map(c => resumoDoAno(c.dados)), [carregadas])
  const serie = useMemo(() => serieMensalMultiAno(leituras, d => d.prejuizo.meses), [leituras])
  const bandeja = useMemo(() => bandejaDosAnos(leituras), [leituras])
  const carimbo = useMemo(() => carimboDoFluxo(carregadas.map(c => c.dados)), [carregadas])

  const meta = (
    <MetaSecao
      regime="fluxo"
      recorte={carregadas.length > 0 ? `${carregadas.map(c => rotuloDoAno(c.ano, c.dados)).join(' + ')} · regime de caixa` : rotuloAnos(anos)}
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

  const nenhum = !serie.temMovimento && resumos.every(r => Math.abs(r.reversao) < 0.005)

  return (
    <div>
      {meta}

      <Card title="Prejuízo bruto por mês" subtitle="Sinal da DRE: prejuízo negativo.">
        {nenhum
          ? <p className="py-10 text-center text-sm text-[var(--text-muted)]">Sem prejuízos registrados em {rotuloAnos(carregadas.map(c => c.ano))}.</p>
          : <GraficoMensal serie={serie} anosSelecionados={anos} descricao="Prejuízo bruto por mês, janeiro a dezembro, por ano" nomeSerie="Prejuízo" />}
      </Card>

      <div className="mt-4">
        <Card title="Prejuízo, recuperado e líquido" subtitle="O prejuízo bruto é o número principal; recuperado e líquido são contexto.">
          <table className="w-full table-fixed border-separate border-spacing-0" aria-label="Prejuízos por ano">
            <colgroup>
              <col style={{ width: 232 }} />
              {resumos.map(r => <col key={r.ano} />)}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={TH_ESQ}>Indicador</th>
                {resumos.map(r => <th key={r.ano} scope="col" className={TH_DIR}>{r.rotulo}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={`${TD} font-medium`}>Prejuízo (bruto)</td>
                {resumos.map(r => <td key={r.ano} className={`${TD} font-medium`}><ValorContabil valor={r.prejuizo} /></td>)}
              </tr>
              <tr>
                <td className={TD}>Δ vs. mesmo período do ano anterior</td>
                {resumos.map(r => <td key={r.ano} className={TD_NUM}>{fmtDeltaPct(r.deltaPrejuizo.pct)}</td>)}
              </tr>
              <tr>
                <td className={TD}>Recuperado (reversão de perdas)</td>
                {resumos.map(r => <td key={r.ano} className={TD}><ValorContabil valor={r.reversao} /></td>)}
              </tr>
              <tr>
                <td className={TD}>Líquido</td>
                {resumos.map(r => <td key={r.ano} className={TD}><ValorContabil valor={r.liquido} /></td>)}
              </tr>
            </tbody>
          </table>
          {falhas.length > 0 && (
            <ErroCarregamento className="mt-3" mensagem={`Não foi possível carregar ${rotuloAnos(falhas)}; fora da tabela.`} />
          )}
        </Card>
      </div>

      {bandeja.length > 0 && (
        <div role="status" className="mt-4 rounded-xl border border-warning bg-warning-bg px-5 py-4">
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
  )
}
