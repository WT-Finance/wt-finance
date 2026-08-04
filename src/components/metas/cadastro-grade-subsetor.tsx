'use client'

// Metas por subsetor de Weddings (v5.4.4) — SEGUNDO quadro do Cadastro de Metas, no
// MESMO molde do quadro por setor (`cadastro-grade.tsx`): 12 linhas de mês + Total,
// edição local + SALVAR EM LOTE, dirty/pendências contra baseline, popover "aplicar ao
// ano" nas colunas % Rec, rodapé "Última alteração por…". Reusa os primitivos de lá
// (`NavegacaoAno`/`CabecalhoPctRec`/`CelulaEditavel`/`CelulaGroup`/constantes de
// largura) em vez de duplicá-los.
//
// DUAS DIFERENÇAS estruturais que impedem generalizar o `<thead>`/loop do quadro
// irmão:
//  1. COMERCIAL tem 3 colunas (Contratos, Faturamento, % Rec) contra 2 dos outros 4
//     subsetores — o cabeçalho de 2 linhas e o corpo desenham o próprio `colSpan`/loop.
//     `meta_contratos` só existe para COMERCIAL (constraint no banco); não entra em
//     NENHUMA soma de R$ (nem no "Total" da linha, nem no rodapé anual) — só tem o seu
//     PRÓPRIO total anual (soma simples, não é média ponderada).
//  2. São 11 colunas de valor: a tabela PRECISA de scroll horizontal com a coluna Mês
//     presa (`sticky left-0`) — receita copiada de `financeiro/dre/tabela-dre.tsx`
//     (`border-separate border-spacing-0`, fundo opaco na célula presa, borda por
//     célula) + `ScrollAutoHide eixo="x"` com o gutter (`pb-3.5`) no viewport — ver
//     skill `tabela-densa`/`ui-design-system`.
//
// ESTADO LEVANTADO (`valores`/`onChange`): ao contrário do quadro irmão (que guarda o
// próprio estado), aqui `valores` é uma prop CONTROLADA pelo pai `CadastroMetas` — é
// esse mesmo estado que alimenta a célula travada de Weddings no quadro de cima
// (`weddingsDerivado`, calculado no pai). `baseline` (a verdade do servidor, para
// dirty/pendências) continua LOCAL a este componente, re-hidratada a partir da prop
// `metas` — o mesmo padrão "ajustar durante a renderização" do quadro irmão.
//
// ⚠️ SALVAR SÓ O QUE FOI TOCADO, por LINHA (subsetor,ano,mes) — não por célula.
// `metas_subsetor_upsert` faz UPDATE dos TRÊS campos (valor_meta/meta_contratos/
// pct_receita) com o que vier no item, sem COALESCE com o gravado: um item que omita
// `meta_contratos` apagaria a meta de contratos já salva daquele mês. Por isso a
// unidade de "pendente" aqui é a LINHA — se qualquer um dos 3 campos mudou, a linha
// INTEIRA (com o valor CORRENTE de cada um, inclusive os que não mudaram) entra no
// lote; linha sem NENHUM campo tocado não é enviada (correção do revisor-db, v5.4.4).
// Isso também preserva o gatilho da rampa no Acompanhamento: "mês com ao menos uma
// linha de subsetor" — gravar linhas não-tocadas zeraria a meta de Weddings inteira de
// uma vez (ver `aplicarRampaWeddings` em `@/lib/metas/metas-derivadas`).

import { useState, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, History } from 'lucide-react'
import { toNum } from '@/lib/carga/coercao'
import { fmtDataHoraSP } from '@/lib/fmt'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { Card } from '@/components/ui/card'
import Button from '@/components/ui/button'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import {
  CabecalhoPctRec, CelulaEditavel, CelulaGroup, MESES,
} from '@/components/metas/cadastro-grade'
import { salvarMetasSubsetor, type MetaSubsetorCelula } from '@/app/metas/cadastro/actions'
import { SUBSETOR_ORDER, SUBSETOR_LABELS, subsetorColor } from '@/lib/config'
import { somarPorMes } from '@/lib/metas/metas-derivadas'

/** Item cru de `metas_subsetor_listar` (ver `metasSubsetorListarSchema`). */
export interface MetaSubsetorItem {
  subsetor:       string
  mes:            number
  valor_meta:     number
  meta_contratos: number | null
  pct_receita:    number | null
}

/** Estado de UMA célula (subsetor×mês) do quadro — os 3 campos editáveis. */
export type CelulaValorSub = {
  valorMeta:     number | null
  metaContratos: number | null
  pctReceita:    number | null
}

interface Props {
  ano:              number
  metas:            MetaSubsetorItem[]
  ultimaAlteracao:  { alterado_em: string; alterado_por: string | null } | null
  /** Estado corrente (edição não salva incluída), levantado ao pai `CadastroMetas` —
   *  é o mesmo mapa que alimenta a célula travada de Weddings no quadro de cima. */
  valores:  Record<string, CelulaValorSub>
  onChange: (subsetor: string, mes: number, campo: keyof CelulaValorSub, novo: number | null) => void
}

export const chaveSub = (subsetor: string, mes: number): string => `${subsetor}-${mes}`

/** Constrói o mapa (subsetor×mês) a partir dos itens crus da RPC. Exportada: o pai
 *  (`CadastroMetas`) usa a MESMA função para inicializar/rehidratar o estado levantado. */
export function construirMapaSub(lista: MetaSubsetorItem[]): Record<string, CelulaValorSub> {
  const mapa: Record<string, CelulaValorSub> = {}
  for (const item of lista) {
    mapa[chaveSub(item.subsetor, item.mes)] = {
      valorMeta:     item.valor_meta,
      metaContratos: item.meta_contratos,
      pctReceita:    item.pct_receita,
    }
  }
  return mapa
}

/** Diferença de UM campo entre o valor corrente e o baseline (null-safe). */
function celulaDiferente(a: CelulaValorSub | undefined, b: CelulaValorSub | undefined, campo: keyof CelulaValorSub): boolean {
  return (a?.[campo] ?? null) !== (b?.[campo] ?? null)
}

/** "12,5%" — 1 casa, sem zeros à direita forçados. Idêntica à do quadro irmão (não
 *  exportada de lá — repetição de 2 linhas é mais barata que acoplar os dois arquivos
 *  por uma função de formatação). */
function fmtPct(v: number): string {
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

const EMPTY_CEL: CelulaValorSub = { valorMeta: null, metaContratos: null, pctReceita: null }

/**
 * Linhas (subsetor×mês) que diferem do baseline E são persistáveis. A unidade é a
 * LINHA: se qualquer um dos 3 campos mudou, os TRÊS vão com o valor corrente — omitir
 * um deles apagaria o valor gravado, porque o `ON CONFLICT DO UPDATE` da RPC não usa
 * COALESCE (contrato documentado no header da seção 4 da migration 0230). Persistável
 * exige Faturamento != null (a RPC recusa `valor_meta` nulo); linha com só % ou só
 * contratos alterados fica "suja" na tela mas não é enviada — mesmo critério do irmão.
 *
 * PURA e EXPORTADA porque o PAI também precisa da contagem: o aviso de "há alterações
 * não salvas" ao trocar de ano é único para a página inteira e tem de somar as
 * pendências dos dois quadros. Uma definição só, para as duas contagens não divergirem.
 */
export function pendenciasSub(
  valores: Record<string, CelulaValorSub>,
  baseline: Record<string, CelulaValorSub>,
  ano: number,
): MetaSubsetorCelula[] {
  const pendentes: MetaSubsetorCelula[] = []
  for (const subsetor of SUBSETOR_ORDER) {
    for (let mes = 1; mes <= 12; mes++) {
      const k = chaveSub(subsetor, mes)
      const atual = valores[k]
      const base  = baseline[k]
      const mudou = celulaDiferente(atual, base, 'valorMeta')
                 || celulaDiferente(atual, base, 'pctReceita')
                 || celulaDiferente(atual, base, 'metaContratos')
      const valorMeta = atual?.valorMeta ?? null
      if (mudou && valorMeta != null) {
        pendentes.push({
          subsetor,
          ano,
          mes,
          valorMeta,
          metaContratos: subsetor === 'COMERCIAL' ? (atual?.metaContratos ?? null) : null,
          pctReceita: atual?.pctReceita ?? null,
        })
      }
    }
  }
  return pendentes
}

export default function CadastroGradeSubsetor({ ano, metas, ultimaAlteracao, valores, onChange }: Props) {
  // Só para o `router.refresh()` pós-Salvar. A navegação de ANO não vive aqui: o seletor
  // é único e fica no quadro de cima (ver o comentário no cabeçalho deste componente).
  const router = useRouter()

  // Baseline = a verdade do servidor (para dirty/pendências) — LOCAL a este
  // componente (diferente de `valores`, que é levantado ao pai). Re-hidrata quando
  // `metas` muda (nova navegação de ano OU router.refresh() pós-Salvar).
  const [baseline, setBaseline] = useState<Record<string, CelulaValorSub>>(() => construirMapaSub(metas))
  const [erroGlobal, setErroGlobal] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [aplicarSubsetor, setAplicarSubsetor] = useState<string | null>(null)
  const [aplicarTxt, setAplicarTxt] = useState('')

  const [metasPrev, setMetasPrev] = useState(metas)
  if (metas !== metasPrev) {
    setMetasPrev(metas)
    setBaseline(construirMapaSub(metas))
    setErroGlobal(null)
    setAplicarSubsetor(null)
  }

  // Total (por MÊS, coluna à direita): soma de Faturamento dos 5 subsetores; % Rec
  // ponderado pelo Faturamento. MESMA função `somarPorMes` usada pelo pai para derivar
  // a meta de Weddings (`weddingsDerivado`) a partir do MESMO `valores` — os dois
  // números concordam por construção, nunca por convenção copiada.
  const itensTodos: { ano: number; mes: number; valorMeta: number; pctReceita: number | null }[] = []
  for (const subsetor of SUBSETOR_ORDER) {
    for (let mes = 1; mes <= 12; mes++) {
      const cel = valores[chaveSub(subsetor, mes)]
      if (cel?.valorMeta != null) itensTodos.push({ ano, mes, valorMeta: cel.valorMeta, pctReceita: cel.pctReceita })
    }
  }
  const totalPorMes = new Map(somarPorMes(itensTodos).map(m => [m.mes, { valorMeta: m.valorMeta, pctReceita: m.pctReceita ?? null }]))

  /** Total ANUAL de um subsetor (12 meses colapsados numa bucket única — mesma fórmula
   *  de `somarPorMes`, sem reescrevê-la: força `mes` a uma constante para agregar tudo
   *  junto). */
  function totalAnualSubsetor(subsetor: string): { valorMeta: number; pctReceita: number | null } {
    const itens: { ano: number; mes: number; valorMeta: number; pctReceita: number | null }[] = []
    for (let mes = 1; mes <= 12; mes++) {
      const cel = valores[chaveSub(subsetor, mes)]
      if (cel?.valorMeta != null) itens.push({ ano, mes: 1, valorMeta: cel.valorMeta, pctReceita: cel.pctReceita })
    }
    const [tot] = somarPorMes(itens)
    return tot ? { valorMeta: tot.valorMeta, pctReceita: tot.pctReceita ?? null } : { valorMeta: 0, pctReceita: null }
  }

  /** Total ANUAL do grupo "Total" (os 5 subsetores × 12 meses, mesma técnica acima). */
  function totalAnualGeral(): { valorMeta: number; pctReceita: number | null } {
    const itens = itensTodos.map(it => ({ ...it, mes: 1 }))
    const [tot] = somarPorMes(itens)
    return tot ? { valorMeta: tot.valorMeta, pctReceita: tot.pctReceita ?? null } : { valorMeta: 0, pctReceita: null }
  }

  // Contratos (só COMERCIAL): soma simples dos 12 meses — NÃO é média ponderada, não
  // entra em NENHUM total de R$.
  let totalContratosAno = 0
  for (let mes = 1; mes <= 12; mes++) {
    totalContratosAno += valores[chaveSub('COMERCIAL', mes)]?.metaContratos ?? 0
  }

  const pendentes = pendenciasSub(valores, baseline, ano)
  const pendCount = pendentes.length

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (pendCount > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [pendCount])

  function abrirAplicar(subsetor: string) {
    setAplicarSubsetor(subsetor)
    setAplicarTxt('')
  }
  function fecharAplicar() {
    setAplicarSubsetor(null)
    setAplicarTxt('')
  }
  // Aplica o mesmo % Rec aos 12 meses do subsetor — via `onChange` (o estado vive no
  // pai), um confirmar por mês.
  function aplicarAoAno(subsetor: string) {
    const num = toNum(aplicarTxt)
    if (num === null) { fecharAplicar(); return }
    for (let mes = 1; mes <= 12; mes++) {
      onChange(subsetor, mes, 'pctReceita', num)
    }
    fecharAplicar()
  }

  async function salvar() {
    setSalvando(true)
    setErroGlobal(null)
    let res: { ok: true; gravadas: number } | { ok: false; erro: string }
    try {
      res = await salvarMetasSubsetor(pendentes)
    } catch {
      res = { ok: false, erro: 'Falha ao salvar as metas. Tente novamente.' }
    }
    setSalvando(false)
    if (res.ok) {
      router.refresh()
    } else {
      setErroGlobal(res.erro)
    }
  }

  const grandTotal = totalAnualGeral()

  const sepGrupo   = 'border-l border-zinc-100'
  const blocoTotal = 'border-l border-zinc-200 bg-zinc-50/70'
  // Coluna Mês PRESA à esquerda — fundo opaco na CÉLULA (nunca translúcido: vazaria as
  // colunas que rolam por baixo), borda direita separando-a do conteúdo rolável.
  const stickyMes = 'sticky left-0 z-10 w-[6.5rem] min-w-[6.5rem] border-r border-zinc-200'

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Metas por subsetor de Weddings</h2>
          <p className="mt-0.5 text-sm text-zinc-400">
            Distribui a meta de Weddings entre os subsetores — a soma vira a meta travada no quadro acima
          </p>
        </div>
        {/* Sem seletor de ano próprio: o ano é da PÁGINA (`?ano=`) e o seletor vive uma
            vez só, no cabeçalho do quadro de cima. Dois seletores para o mesmo parâmetro
            confundiriam, e — pior — cada um avisaria apenas sobre as suas próprias
            pendências: trocar o ano pelo quadro limpo descartaria em SILÊNCIO o que
            estivesse digitado no outro. O aviso agora é único e soma os dois. */}
      </div>

      {erroGlobal && (
        <FaixaMensagem tipo="erro" texto={erroGlobal} onFechar={() => setErroGlobal(null)} />
      )}

      <Card className="px-5 py-4">
        <p className="mb-2 flex items-center justify-end gap-1.5 text-2xs text-zinc-400">
          <Pencil size={11} className="text-zinc-300" />
          Clique numa célula para editar
        </p>

        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <div className="pb-1.5">
            <ScrollAutoHide eixo="x" className="pb-3.5">
              <table className="border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th aria-hidden className={`${stickyMes} border-b border-zinc-100 bg-zinc-50`} />
                    {SUBSETOR_ORDER.map(subsetor => (
                      <th
                        key={subsetor}
                        colSpan={subsetor === 'COMERCIAL' ? 3 : 2}
                        className={`whitespace-nowrap border-b border-zinc-100 px-2 pb-1.5 pt-0.5 text-center text-[13px] font-semibold ${sepGrupo}`}
                        style={{ color: subsetorColor(subsetor) }}
                      >
                        {SUBSETOR_LABELS[subsetor] ?? subsetor}
                      </th>
                    ))}
                    <th colSpan={2} className={`border-b border-zinc-100 px-2 pb-1.5 pt-0.5 text-center text-[13px] font-semibold text-zinc-500 ${blocoTotal}`}>
                      Total
                    </th>
                  </tr>
                  <tr>
                    <th className={`${stickyMes} border-b border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left text-2xs font-medium text-zinc-400`}>Mês</th>
                    {SUBSETOR_ORDER.map(subsetor => (
                      <Fragment key={subsetor}>
                        {subsetor === 'COMERCIAL' && (
                          <th title="Contratos de casamento vendidos (meta)" className={`border-b border-zinc-200 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400 ${sepGrupo}`}>
                            Contratos
                          </th>
                        )}
                        <th className={`border-b border-zinc-200 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400 ${subsetor === 'COMERCIAL' ? '' : sepGrupo}`}>
                          Faturamento
                        </th>
                        <th className="border-b border-zinc-200 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400">
                          <CabecalhoPctRec
                            aberto={aplicarSubsetor === subsetor}
                            valor={aplicarTxt}
                            onAbrir={() => abrirAplicar(subsetor)}
                            onFechar={fecharAplicar}
                            onValorChange={setAplicarTxt}
                            onAplicar={() => aplicarAoAno(subsetor)}
                          />
                        </th>
                      </Fragment>
                    ))}
                    <th className={`border-b border-zinc-200 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400 ${blocoTotal}`}>Faturamento</th>
                    <th title="% Rec do Total = média dos alvos ponderada pelo Faturamento" className="border-b border-zinc-200 bg-zinc-50/70 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400">
                      % Rec
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {MESES.map((nomeMes, idx) => {
                    const mes = idx + 1
                    const totalMes = totalPorMes.get(mes) ?? { valorMeta: null, pctReceita: null }
                    return (
                      <tr key={mes} className="transition-colors hover:bg-zinc-50/50 [&>td]:border-b [&>td]:border-zinc-50">
                        <td className={`${stickyMes} bg-white px-2 py-1 text-[13px] text-zinc-600`}>{nomeMes}</td>
                        {SUBSETOR_ORDER.map(subsetor => {
                          const k = chaveSub(subsetor, mes)
                          const cel = valores[k] ?? EMPTY_CEL
                          const base = baseline[k]
                          return (
                            <Fragment key={subsetor}>
                              {subsetor === 'COMERCIAL' && (
                                <td className={`px-1 py-0.5 ${sepGrupo}`}>
                                  <CelulaEditavel
                                    valor={cel.metaContratos}
                                    tipo="inteiro"
                                    dirty={celulaDiferente(cel, base, 'metaContratos')}
                                    onConfirmar={v => onChange(subsetor, mes, 'metaContratos', v)}
                                  />
                                </td>
                              )}
                              <td className={`px-1 py-0.5 ${subsetor === 'COMERCIAL' ? '' : sepGrupo}`}>
                                <CelulaEditavel
                                  valor={cel.valorMeta}
                                  tipo="moeda"
                                  dirty={celulaDiferente(cel, base, 'valorMeta')}
                                  onConfirmar={v => onChange(subsetor, mes, 'valorMeta', v)}
                                />
                              </td>
                              <td className="px-1 py-0.5">
                                <CelulaEditavel
                                  valor={cel.pctReceita}
                                  tipo="percentual"
                                  dirty={celulaDiferente(cel, base, 'pctReceita')}
                                  onConfirmar={v => onChange(subsetor, mes, 'pctReceita', v)}
                                />
                              </td>
                            </Fragment>
                          )
                        })}
                        <td className={`px-2 py-0.5 ${blocoTotal}`}>
                          <CelulaGroup valor={totalMes.valorMeta} tipo="moeda" />
                        </td>
                        <td className="bg-zinc-50/70 px-2 py-0.5">
                          <CelulaGroup valor={totalMes.pctReceita} tipo="percentual" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-50/70 [&>td]:border-t [&>td]:border-zinc-200">
                    <td className={`${stickyMes} bg-zinc-50/70 px-2 py-2.5 text-[13px] font-semibold text-zinc-700`}>Total</td>
                    {SUBSETOR_ORDER.map(subsetor => {
                      const tot = totalAnualSubsetor(subsetor)
                      return (
                        <Fragment key={subsetor}>
                          {subsetor === 'COMERCIAL' && (
                            <td className={`px-2 py-2.5 ${sepGrupo}`}>
                              <CelulaGroup valor={totalContratosAno} tipo="inteiro" forte />
                            </td>
                          )}
                          <td className={`px-2 py-2.5 ${subsetor === 'COMERCIAL' ? '' : sepGrupo}`}>
                            <CelulaGroup valor={tot.valorMeta} tipo="moeda" forte />
                          </td>
                          <td className="px-2 py-2.5 text-right text-[13px] font-medium tabular-nums text-zinc-600">
                            {tot.pctReceita === null ? <span className="text-zinc-300">—</span> : fmtPct(tot.pctReceita)}
                          </td>
                        </Fragment>
                      )
                    })}
                    <td className="border-l border-zinc-200 px-2 py-2.5">
                      <CelulaGroup valor={grandTotal.valorMeta} tipo="moeda" forte />
                    </td>
                    <td className="px-2 py-2.5 text-right text-[13px] font-medium tabular-nums text-zinc-600">
                      {grandTotal.pctReceita === null ? <span className="text-zinc-300">—</span> : fmtPct(grandTotal.pctReceita)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </ScrollAutoHide>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {pendCount > 0 ? (
            <span className="text-xs font-medium text-warning">
              {pendCount} alteração(ões) não salva(s)
            </span>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <History size={13} className="text-zinc-300" />
              {ultimaAlteracao
                ? <>Última alteração por <span className="font-medium text-zinc-500">{ultimaAlteracao.alterado_por ?? '—'}</span> · {fmtDataHoraSP(ultimaAlteracao.alterado_em)}</>
                : 'Nenhuma alteração registrada.'}
            </p>
          )}
          <Button variant="solido" size="sm" disabled={pendCount === 0 || salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
