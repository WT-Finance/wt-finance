'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { fmtBRL2, fmtDataSP } from '@/lib/fmt'
import { fmtPct } from '@/lib/marketing/formatar'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { carimboDoFluxo } from '@/lib/financeiro-geral/carimbos'
import { comporTabelaCustos, type CelulaCusto } from '@/lib/financeiro-geral/custos'
import { anosQueFalharam, dadosCarregados } from '@/lib/financeiro-geral/composicao'
import { rotuloDoAno } from '@/lib/financeiro-geral/periodo'
import type { CustosFinanceiros } from '@/lib/financeiro-geral/schemas'
import type { LeituraAno } from '@/lib/financeiro-geral/tipos'
import { CascaEstado, MetaSecao, TD, TD_TOTAL, TH_DIR, TH_ESQ } from './comum'

// Custos financeiros — FLUXO. Decisão do Yan (GATE 0): os CUSTOS por grupo (Cartão, Antecipação, Juros e
// IOF, Tarifas) e, abaixo, Câmbio e Receitas financeiras, FECHANDO no Resultado financeiro — o mesmo
// número do bloco FIN da DRE. A bandeja "Não classificado" (categoria do FIN sem grupo) é VISÍVEL.
//
// Sinal da DRE (despesa negativa); "% da RB" = total ÷ Receita Bruta do mesmo ano e recorte.
// Cada grupo expande nas categorias (para conferir contra a DRE). As colunas são por ano: um ano que
// falhou vira coluna com "—" sem derrubar os outros (não há soma entre anos para falsear).

const AJUDA =
  'Custos financeiros do regime de caixa: Cartão, Antecipação, Juros e IOF e Tarifas. Abaixo, Câmbio e Receitas ' +
  'financeiras (acréscimos cobrados, desconto obtido). A tabela fecha no Resultado financeiro, que é o bloco FIN ' +
  'da DRE. O % é sobre a Receita Bruta do mesmo ano. Categoria nova no FIN sem grupo aparece em "Não classificado". ' +
  'Despesa em negativo, como na DRE; ano em andamento leva * e vai até o mês corrente.'

function Celula({ c, classe = '' }: { c: CelulaCusto; classe?: string }) {
  return (
    <td className={`${classe}`}>
      {c.total === null
        ? <span className="block text-right text-[var(--text-subtle)]">—</span>
        : <ValorContabil valor={c.total} />}
    </td>
  )
}

function CelulaPct({ c, classe = '' }: { c: CelulaCusto; classe?: string }) {
  return <td className={`${classe} text-right tabular-nums`}>{fmtPct(c.pctRb)}</td>
}

interface Props {
  leituras: LeituraAno<CustosFinanceiros>[]
  anos: number[]
}

export default function SecaoCustos({ leituras, anos }: Props) {
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set())
  const carregadas = useMemo(() => dadosCarregados(leituras), [leituras])
  const falhas = useMemo(() => anosQueFalharam(leituras), [leituras])
  const tabela = useMemo(() => comporTabelaCustos(leituras), [leituras])
  const carimbo = useMemo(() => carimboDoFluxo(carregadas.map(c => c.dados)), [carregadas])

  function alternar(chave: string) {
    setAbertos(prev => {
      const novo = new Set(prev)
      if (novo.has(chave)) novo.delete(chave)
      else novo.add(chave)
      return novo
    })
  }

  const meta = (
    <MetaSecao
      regime="fluxo"
      recorte={carregadas.length > 0 ? `${carregadas.map(c => rotuloDoAno(c.ano, c.dados)).join(' + ')} · regime de caixa` : rotuloAnos(anos)}
      carimbo={carimbo ? `Atualizado em ${fmtDataSP(carimbo)}` : null}
      ajudaRotulo="Custos financeiros"
      ajudaTexto={AJUDA}
    />
  )

  if (carregadas.length === 0) {
    return (
      <div>
        {meta}
        <CascaEstado>
          <ErroCarregamento mensagem={`Não foi possível carregar os custos financeiros de ${rotuloAnos(falhas.length ? falhas : anos)} — recarregue a página.`} />
        </CascaEstado>
      </div>
    )
  }

  if (!tabela.temMovimento) {
    return (
      <div>
        {meta}
        <CascaEstado>
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            Sem lançamentos no bloco financeiro em {rotuloAnos(carregadas.map(c => c.ano))}.
          </p>
        </CascaEstado>
      </div>
    )
  }

  return (
    <div>
      {meta}

      <Card title="Custos financeiros por grupo" subtitle="Fecha no Resultado financeiro — o bloco FIN da DRE.">
        <table className="w-full table-fixed border-separate border-spacing-0" aria-label="Custos financeiros por grupo e ano">
          <colgroup>
            <col style={{ width: 232 }} />
            {tabela.anos.flatMap(a => [<col key={`${a.ano}-v`} />, <col key={`${a.ano}-p`} style={{ width: 76 }} />])}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={TH_ESQ}>Grupo</th>
              {tabela.anos.flatMap(a => [
                <th key={`${a.ano}-v`} scope="col" className={TH_DIR}>{a.rotulo}</th>,
                <th key={`${a.ano}-p`} scope="col" className={TH_DIR} title={`% da Receita Bruta de ${a.rotulo}`}>% RB</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {tabela.linhas.map(l => {
              const total = l.tipo !== 'grupo'
              const aberto = abertos.has(l.chave)
              const expansivel = l.categorias.length > 0
              const classe = total ? TD_TOTAL : `${TD} ${l.bandeja ? 'text-warning-deep' : ''}`
              return (
                <Fragment key={l.chave}>
                  <tr>
                    <td className={classe}>
                      {expansivel ? (
                        <button
                          type="button"
                          onClick={() => alternar(l.chave)}
                          aria-expanded={aberto}
                          className="foco-neutro -my-1 inline-flex items-center gap-1 rounded py-1 text-left hover:text-zinc-900"
                        >
                          {aberto ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
                          {l.rotulo}
                        </button>
                      ) : (
                        <span className={l.bandeja ? 'inline-flex items-center gap-1' : ''}>
                          {l.bandeja && <TriangleAlert size={13} aria-hidden />}
                          {l.rotulo}
                        </span>
                      )}
                      {l.bandeja && <span className="ml-1 text-2xs font-normal">(sem grupo no mapa)</span>}
                    </td>
                    {l.celulas.flatMap(c => [
                      <Celula key={`${c.ano}-v`} c={c} classe={classe} />,
                      <CelulaPct key={`${c.ano}-p`} c={c} classe={classe} />,
                    ])}
                  </tr>
                  {aberto && l.categorias.map(cat => (
                    <tr key={cat.chave}>
                      <td className={`${TD} pl-9 text-[var(--text-muted)]`}>{cat.rotulo}</td>
                      {cat.celulas.flatMap(c => [
                        <Celula key={`${c.ano}-v`} c={c} classe={`${TD} text-[var(--text-muted)]`} />,
                        <CelulaPct key={`${c.ano}-p`} c={c} classe={`${TD} text-[var(--text-muted)]`} />,
                      ])}
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>

        {falhas.length > 0 && (
          <ErroCarregamento className="mt-3" mensagem={`Não foi possível carregar ${rotuloAnos(falhas)}; a coluna fica em branco.`} />
        )}

        {tabela.divergencias.length > 0 && (
          <div role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-warning bg-warning-bg px-4 py-2.5 text-xs text-warning-deep">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {tabela.divergencias.map(d =>
                `${d.ano}: ${d.tipo === 'grupos-vs-fin' ? 'os grupos não fecham no bloco FIN da DRE' : 'os grupos de custo não fecham no subtotal'} (diferença de ${fmtBRL2(d.diferenca)}).`,
              ).join(' ')}{' '}
              Os números acima podem estar incompletos — avise a equipe.
            </span>
          </div>
        )}
      </Card>
    </div>
  )
}
