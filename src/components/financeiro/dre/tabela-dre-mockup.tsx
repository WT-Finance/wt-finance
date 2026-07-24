'use client'

// ── Mockup interativo da tabela hierárquica da DRE por Fluxo de Caixa (v5.3.0 · M0) ──
// Sem RPC, sem persistência — dados REAIS em fixture (mockup-dados.ts), base 15/07/2026.
// Alvo: qualidade visual/interação de produção, para servir de gate antes da M4 (tabela
// real sobre get_dre_mensal). Removível/substituível quando a RPC chegar.
//
// Estrutura: blocoH (agregador-topo) → sub (agregador-meio, ex.: Despesas Administrativas)
// → cat (categoria-folha). `cat.g` aponta para a CHAVE do pai (blocoH OU sub) — visibilidade
// de uma linha `cat` depende só de `abertos.has(cat.g)` (um único nível de ocultação; blocoH/
// sub/tot nunca são filtrados). Linha expansível (chevron) = tem `k` E `EXPANSIVEIS.includes(k)`.

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import Button from '@/components/ui/button'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import { fmtContabil } from './fmt-contabil'
import { LINHAS, BANDEJA, EXPANSIVEIS, DATA_BASE, type TipoLinha } from './mockup-dados'

type Ano = 2026 | 2025

const MESES_26 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul·R', 'Jul·P', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_25 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// A partir do índice 7, em 2026, a coluna é PREVISTO (Jul·P em diante); em 2025 (ano
// fechado) não há previsto — tudo é realizado.
const IDX_PREVISTO_26 = 7

interface EstiloLinha {
  trBg: string
  trBorda: string
  rotuloClasse: string
  valorTamanho: string
  corPadrao: string
}

function estiloLinha(t: TipoLinha): EstiloLinha {
  switch (t) {
    case 'blocoH':
      return {
        trBg: '[&>td]:bg-zinc-50',
        trBorda: '[&>td]:border-b [&>td]:border-zinc-50',
        rotuloClasse: 'font-medium text-[13px] text-text-primary',
        valorTamanho: '',
        corPadrao: 'text-text-primary',
      }
    case 'sub':
      return {
        // Fundo SÓLIDO (não /60): a 1ª coluna é sticky e um bg translúcido deixa os
        // valores vazarem por baixo do rótulo no scroll horizontal.
        trBg: '[&>td]:bg-zinc-50',
        trBorda: '[&>td]:border-b [&>td]:border-zinc-50',
        rotuloClasse: 'font-medium text-[13px] text-text-primary pl-4',
        valorTamanho: '',
        corPadrao: 'text-text-primary',
      }
    case 'tot':
      return {
        trBg: '[&>td]:bg-white',
        trBorda: '[&>td]:border-t-2 [&>td]:border-b [&>td]:border-zinc-300',
        rotuloClasse: 'font-semibold text-[13px] text-text-primary',
        valorTamanho: 'font-semibold text-[13px]',
        corPadrao: 'text-text-primary',
      }
    case 'cat':
    default:
      return {
        trBg: '[&>td]:bg-white',
        trBorda: '[&>td]:border-b [&>td]:border-zinc-50',
        rotuloClasse: 'text-[13px] text-zinc-600 pl-9',
        valorTamanho: 'text-xs',
        corPadrao: 'text-zinc-600',
      }
  }
}

/** Cor do valor: zero (discreto) > previsto (âmbar) > cor padrão da linha. */
function corValor(v: number, previsto: boolean, corPadrao: string): string {
  if (Math.abs(v) < 0.005) return 'text-zinc-300'
  if (previsto) return 'text-warning'
  return corPadrao
}

/** Divisor tracejado do mês corrente híbrido — só na 1ª coluna de previsto (2026, índice 7). */
function divisorHibrido(ano: Ano, idx: number): string {
  return ano === 2026 && idx === IDX_PREVISTO_26 ? 'border-l border-dashed border-zinc-300' : ''
}

export default function TabelaDreMockup() {
  const [ano, setAno]         = useState<Ano>(2026)
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set())
  const [rolado, setRolado]   = useState(false)

  const toggleAberto = (k: string) => setAbertos(prev => {
    const s = new Set(prev)
    if (s.has(k)) s.delete(k)
    else s.add(k)
    return s
  })
  const expandirTudo = () => setAbertos(new Set(EXPANSIVEIS))
  const recolherTudo = () => setAbertos(new Set())

  const meses     = ano === 2026 ? MESES_26 : MESES_25
  const numCols   = meses.length
  const totalCols = 1 + numCols + 1 // rótulo + meses + total do ano

  // As células `rowSpan={2}` (Conta / Total do ano) existem SÓ na 1ª <tr> do thead, então
  // NUNCA casam com o seletor `tr:last-child_th` que pinta a borda-de-baixo e a sombra-ao-rolar
  // do cabeçalho. Sem isto, a sombra sai "cortada" justamente na coluna sticky. (Achado ALTO
  // do revisor; a receita do DS §7 pressupõe cabeçalho de 1 linha.)
  const bordaBaseHeader = [
    'border-b border-zinc-200',
    rolado ? 'shadow-[0_4px_6px_-4px_rgba(0,0,0,0.12)]' : '',
  ].join(' ')

  const linhasVisiveis = LINHAS.filter(l => l.t !== 'cat' || (l.g != null && abertos.has(l.g)))

  return (
    // Card RAW (não o primitivo `@/components/ui/card`): o primitivo pinta padding uniforme em
    // TODOS os filhos, mas aqui a tabela precisa correr de ponta a ponta dentro do card (só o
    // header/toolbar e a nota de rodapé têm respiro) — padrão exigido pelo mockup (DS §7 não cobre
    // esse caso; o Card genérico cobriria o requisito só se a tabela ficasse recuada como em
    // base-dados-tab, o que a spec pede para NÃO acontecer aqui).
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="p-5 pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {([2026, 2025] as Ano[]).map(a => (
            <button key={a} type="button" onClick={() => setAno(a)}
              className={[PILL_FILTRO, ano === a ? '' : PILL_FILTRO_INATIVO].join(' ')}
              style={ano === a ? PILL_FILTRO_ATIVO_STYLE : undefined}>
              {a}
            </button>
          ))}
          <span className="text-2xs text-zinc-400 ml-1">data-base {DATA_BASE} (fixture do mockup)</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={expandirTudo}>Expandir tudo</Button>
          <Button variant="ghost" size="sm" onClick={recolherTudo}>Recolher tudo</Button>
        </div>
      </div>

      <ScrollAutoHide eixo="both" className="max-h-[72vh]" onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}>
        <table className="min-w-[1480px] w-full text-sm border-separate border-spacing-0">
          <thead
            className={[
              'sticky top-0 z-20',
              '[&_th]:bg-zinc-50',
              '[&_tr:first-child_th]:border-b [&_tr:first-child_th]:border-zinc-100',
              '[&_tr:last-child_th]:border-b [&_tr:last-child_th]:border-zinc-200',
              '[&_tr:first-child_th:first-child]:rounded-tl-lg',
              '[&_tr:first-child_th:last-child]:rounded-tr-lg',
              rolado ? '[&_tr:last-child_th]:shadow-[0_4px_6px_-4px_rgba(0,0,0,0.12)]' : '',
            ].join(' ')}
          >
            {ano === 2026 ? (
              <>
                <tr>
                  <th rowSpan={2} className={`sticky left-0 z-30 w-[260px] min-w-[260px] pl-3 pr-3 py-2 text-left text-2xs font-medium text-text-muted ${bordaBaseHeader}`}>
                    Conta
                  </th>
                  <th colSpan={7} className="px-3 py-1.5 text-right text-2xs font-medium text-text-muted">
                    Realizado · movimentação
                  </th>
                  <th colSpan={6} className="px-3 py-1.5 text-right text-2xs font-medium text-warning">
                    Previsto · vencimento
                  </th>
                  <th rowSpan={2} className={`w-[140px] min-w-[140px] border-l border-zinc-200 px-3 py-2 text-right text-2xs font-medium text-text-muted ${bordaBaseHeader}`}>
                    Total do ano
                  </th>
                </tr>
                <tr>
                  {meses.map((m, i) => (
                    <th key={m} className={`px-3 py-1.5 text-right text-2xs font-medium ${i >= IDX_PREVISTO_26 ? 'text-warning' : 'text-text-muted'} ${divisorHibrido(ano, i)}`}>
                      {m}
                    </th>
                  ))}
                </tr>
              </>
            ) : (
              <>
                <tr>
                  <th rowSpan={2} className={`sticky left-0 z-30 w-[260px] min-w-[260px] pl-3 pr-3 py-2 text-left text-2xs font-medium text-text-muted ${bordaBaseHeader}`}>
                    Conta
                  </th>
                  <th colSpan={12} className="px-3 py-1.5 text-right text-2xs font-medium text-text-muted">
                    Realizado · movimentação (ano fechado)
                  </th>
                  <th rowSpan={2} className={`w-[140px] min-w-[140px] border-l border-zinc-200 px-3 py-2 text-right text-2xs font-medium text-text-muted ${bordaBaseHeader}`}>
                    Total do ano
                  </th>
                </tr>
                <tr>
                  {meses.map(m => (
                    <th key={m} className="px-3 py-1.5 text-right text-2xs font-medium text-text-muted">
                      {m}
                    </th>
                  ))}
                </tr>
              </>
            )}
          </thead>

          <tbody>
            {linhasVisiveis.map((l, i) => {
              const estilo      = estiloLinha(l.t)
              const valores     = ano === 2026 ? l.m26 : l.m25
              const totalAno    = valores.reduce((acc, v) => acc + v, 0)
              const expansivel  = l.k != null && EXPANSIVEIS.includes(l.k)
              const chaveAberta = l.k != null && abertos.has(l.k)
              const pesoTotal   = l.t === 'tot' ? estilo.valorTamanho : l.t === 'cat' ? 'text-xs font-medium' : 'font-medium'

              return (
                <tr key={`${l.t}-${l.g ?? ''}-${l.l}-${i}`} className={`${estilo.trBg} ${estilo.trBorda}`}>
                  <td className={`sticky left-0 z-10 py-1.5 pr-3 ${estilo.rotuloClasse}`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      {expansivel && l.k && (
                        <button
                          type="button"
                          onClick={() => toggleAberto(l.k as string)}
                          aria-expanded={chaveAberta}
                          aria-label={`${chaveAberta ? 'Recolher' : 'Expandir'} ${l.l}`}
                          className="foco-neutro inline-flex shrink-0 items-center justify-center rounded p-0.5 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 transition-colors"
                        >
                          <ChevronRight size={14} className={`transition-transform ${chaveAberta ? 'rotate-90' : ''}`} />
                        </button>
                      )}
                      <span className="truncate">{l.l}</span>
                      {l.estrela && <sup className="text-warning" title="Nota da controladoria">*</sup>}
                    </div>
                  </td>

                  {valores.map((v, idx) => {
                    const previsto = ano === 2026 && idx >= IDX_PREVISTO_26
                    return (
                      <td key={idx} className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${estilo.valorTamanho} ${corValor(v, previsto, estilo.corPadrao)} ${divisorHibrido(ano, idx)}`}>
                        {fmtContabil(v)}
                      </td>
                    )
                  })}

                  <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-l border-zinc-200 ${pesoTotal} ${corValor(totalAno, false, estilo.corPadrao)}`}>
                    {fmtContabil(totalAno)}
                  </td>
                </tr>
              )
            })}

            {/* Bandeja "Não classificadas" — categoria(s) órfã(s) do de-para (fora do sistema de
                abertos/fechados). O rótulo fica na célula STICKY (visível mesmo com scroll
                horizontal); o explicador corre na faixa restante. Fundos SÓLIDOS (célula sticky
                translúcida deixaria os valores vazarem por baixo no scroll horizontal). */}
            <tr>
              <td className="sticky left-0 z-10 bg-warning-bg px-3 py-2 whitespace-nowrap">
                <span className="font-medium text-[13px] text-text-primary">Não classificadas</span>
                <span className="ml-1 text-[13px] text-zinc-500">({BANDEJA.length})</span>
              </td>
              <td colSpan={totalCols - 1} className="bg-warning-bg px-3 py-2 text-2xs text-zinc-500">
                categorias do Monde sem bloco na estrutura — nada some em silêncio
              </td>
            </tr>
            {BANDEJA.map((l, i) => {
              const valores  = ano === 2026 ? l.m26 : l.m25
              const totalAno = valores.reduce((acc, v) => acc + v, 0)
              return (
                <tr key={`bandeja-${l.l}-${i}`} className="[&>td]:bg-warning-bg [&>td]:border-b [&>td]:border-zinc-100">
                  <td className="sticky left-0 z-10 py-1.5 pl-4 pr-3 text-[13px] text-zinc-600">
                    <span className="truncate">{l.l}</span>
                  </td>
                  {valores.map((v, idx) => {
                    const previsto = ano === 2026 && idx >= IDX_PREVISTO_26
                    return (
                      <td key={idx} className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-xs ${corValor(v, previsto, 'text-zinc-600')} ${divisorHibrido(ano, idx)}`}>
                        {fmtContabil(v)}
                      </td>
                    )
                  })}
                  <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-l border-zinc-200 text-xs font-medium ${corValor(totalAno, false, 'text-zinc-600')}`}>
                    {fmtContabil(totalAno)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollAutoHide>

      <div className="p-4 text-2xs text-zinc-400 space-y-1">
        <p>Mockup (M0) — dados REAIS do dashboard da controladoria (base 15/07/2026); bandeja com valores ilustrativos.</p>
        <p>Total do ano = soma das colunas mensais exibidas. O modelo da controladoria soma também os vencidos em aberto (sem coluna neste recorte) — ponto em validação no gate.</p>
      </div>
    </div>
  )
}
