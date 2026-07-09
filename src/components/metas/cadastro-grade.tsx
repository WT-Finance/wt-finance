'use client'

// Cadastro de Metas (v5.0.0) — grade anual 12 meses × 3 setores × [Meta VT, % Rec],
// com autosave por célula (a linha setor×mês inteira é enviada a cada save) e reversão
// LOCAL em erro. A coluna Group (soma de VT; média de % Rec ponderada pela VT) é
// COMPUTADA no cliente, ao vivo, a partir do estado local — nunca persistida.
//
// Tela de PLATAFORMA (tema group): sem var(--brand); a única cor "viva" é a identidade
// de cada setor no cabeçalho (prop `cor`, já um `var(--setor-*)` vindo de SETOR_COLORS).
// Padrão de célula editável com reversão modelado em contas-manager.tsx (checa res.ok
// e reverte) — nunca o de lancamento-row (que não reverte).
//
// Visual (checkpoint v5.0.0): o valor contábil vive num BLOCO DE LARGURA FIXA dentro
// da célula (o "R$" fica ancorado perto do número — em célula larga, o justify-between
// cru abriria um abismo entre eles); grupos de setor separados por borda vertical;
// affordance de edição = lápis no hover; colunas Group com fundo próprio (read-only).

import { useState, Fragment, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Check, X, Pencil, History } from 'lucide-react'
import { toNum } from '@/lib/carga/coercao'
import { fmtDataHoraSP, fmtMi } from '@/lib/fmt'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { Card } from '@/components/ui/card'
import { salvarMeta } from '@/app/metas/cadastro/actions'

export interface MetaItem {
  setor_macro_id: number
  setor_nome:     string
  setor_display:  string
  mes:            number
  valor_meta:     number
  pct_receita:    number | null
}

export interface SetorCol {
  id:      number
  nome:    string
  display: string
  cor:     string // var(--setor-*), já resolvido por SETOR_COLORS
}

interface Props {
  ano:              number
  setores:          SetorCol[]
  metas:            MetaItem[]
  ultimaAlteracao:  { alterado_em: string; alterado_por: string | null } | null
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// Faixa coerente com o range de `dim_data` (2022–2030, ver CLAUDE.md).
const ANO_MIN = 2022
const ANO_MAX = 2030

// Larguras dos blocos de valor (mantêm o "R$" colado no número e o alinhamento
// vertical entre linhas; a folga da célula vira goteira ENTRE colunas).
const W_MOEDA = 'w-[8.25rem]'
const W_PCT   = 'w-[3.5rem]'

type CelulaValor  = { valorMeta: number | null; pctReceita: number | null }
type CelulaEstado = { saving: boolean; saved: boolean; erro: string | null }
type TotalAno = { valorMeta: number; pctReceita: number | null }

const chave = (setorId: number, mes: number): string => `${setorId}-${mes}`

function construirMapa(lista: MetaItem[]): Record<string, CelulaValor> {
  const mapa: Record<string, CelulaValor> = {}
  for (const item of lista) {
    mapa[chave(item.setor_macro_id, item.mes)] = { valorMeta: item.valor_meta, pctReceita: item.pct_receita }
  }
  return mapa
}

/** "12,5%" — 1 casa, sem zeros à direita forçados. */
function fmtPct(v: number): string {
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/** Group de um MÊS: soma de Meta VT; % Rec = média ponderada por VT (só setores com % informado). */
function computarGroupMes(valores: Record<string, CelulaValor>, setores: SetorCol[], mes: number): CelulaValor {
  let somaVt = 0
  let temVt = false
  let somaPonderada = 0
  let somaVtComPct = 0
  for (const s of setores) {
    const cel = valores[chave(s.id, mes)]
    if (!cel || cel.valorMeta === null) continue
    temVt = true
    somaVt += cel.valorMeta
    if (cel.pctReceita !== null) {
      somaPonderada += cel.valorMeta * cel.pctReceita
      somaVtComPct += cel.valorMeta
    }
  }
  return {
    valorMeta:  temVt ? somaVt : null,
    pctReceita: somaVtComPct > 0 ? somaPonderada / somaVtComPct : null,
  }
}

/** Total ANUAL de um setor (soma das 12 linhas de Meta VT; % Rec ponderado por VT). */
function totalSetorAno(valores: Record<string, CelulaValor>, setorId: number): TotalAno {
  let somaVt = 0
  let somaPonderada = 0
  let somaVtComPct = 0
  for (let mes = 1; mes <= 12; mes++) {
    const cel = valores[chave(setorId, mes)]
    if (!cel || cel.valorMeta === null) continue
    somaVt += cel.valorMeta
    if (cel.pctReceita !== null) {
      somaPonderada += cel.valorMeta * cel.pctReceita
      somaVtComPct += cel.valorMeta
    }
  }
  return { valorMeta: somaVt, pctReceita: somaVtComPct > 0 ? somaPonderada / somaVtComPct : null }
}

/** Total ANUAL do Group (soma dos 3 setores nos 12 meses). */
function totalGroupAno(valores: Record<string, CelulaValor>, setores: SetorCol[]): TotalAno {
  let somaVt = 0
  let somaPonderada = 0
  let somaVtComPct = 0
  for (const s of setores) {
    for (let mes = 1; mes <= 12; mes++) {
      const cel = valores[chave(s.id, mes)]
      if (!cel || cel.valorMeta === null) continue
      somaVt += cel.valorMeta
      if (cel.pctReceita !== null) {
        somaPonderada += cel.valorMeta * cel.pctReceita
        somaVtComPct += cel.valorMeta
      }
    }
  }
  return { valorMeta: somaVt, pctReceita: somaVtComPct > 0 ? somaPonderada / somaVtComPct : null }
}

// ── Navegação por ano (?ano=) — controle segmentado; startTransition p/ o clique
// não "morrer" (padrão v4.39). ──
function NavegacaoAno({ ano, pending, onMudar }: { ano: number; pending: boolean; onMudar: (novo: number) => void }) {
  return (
    <div
      className={`inline-flex items-stretch overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm ${pending ? 'pointer-events-none opacity-60' : ''}`}
      aria-busy={pending}
    >
      <button
        type="button"
        onClick={() => onMudar(ano - 1)}
        disabled={ano <= ANO_MIN}
        aria-label="Ano anterior"
        className="foco-neutro px-2.5 py-1.5 text-zinc-500 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="flex items-center border-x border-zinc-100 px-4 text-sm font-semibold tabular-nums text-zinc-800">
        {pending ? <Loader2 size={14} className="animate-spin text-zinc-400" /> : ano}
      </span>
      <button
        type="button"
        onClick={() => onMudar(ano + 1)}
        disabled={ano >= ANO_MAX}
        aria-label="Próximo ano"
        className="foco-neutro px-2.5 py-1.5 text-zinc-500 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}

// ── Célula editável (Meta VT ou % Rec). Exibe/edita UM campo; o save envia a LINHA
// inteira (feito pelo pai via onSalvar). Reverte sozinha entradas não-numéricas
// (não chama onSalvar); a reversão de FALHA DE SERVIDOR é do pai (estado `valor`
// vem de volta ao anterior, refletindo aqui via prop). ──
function CelulaEditavel({ valor, tipo, estado, onSalvar }: {
  valor:    number | null
  tipo:     'moeda' | 'percentual'
  estado?:  CelulaEstado
  onSalvar: (novo: number | null) => void
}) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState(() => (valor === null ? '' : valor.toFixed(2).replace('.', ',')))

  function abrir() {
    setTxt(valor === null ? '' : valor.toFixed(2).replace('.', ','))
    setEditando(true)
  }

  function confirmar() {
    const vazio = txt.trim() === ''
    const num = vazio ? null : toNum(txt)
    setEditando(false)
    if (!vazio && num === null) return // entrada não-numérica: descarta, mantém o valor anterior
    if (num === valor) return
    onSalvar(num)
  }

  const saving = estado?.saving ?? false
  const saved  = estado?.saved  ?? false
  const erro   = estado?.erro   ?? null

  const wBloco = tipo === 'moeda' ? W_MOEDA : W_PCT

  if (editando) {
    return (
      <span className="flex w-full justify-end px-1">
        <input
          autoFocus
          inputMode="decimal"
          value={txt}
          onChange={e => setTxt(e.target.value)}
          onBlur={confirmar}
          onKeyDown={e => {
            if (e.key === 'Enter') confirmar()
            if (e.key === 'Escape') setEditando(false)
          }}
          placeholder={tipo === 'moeda' ? '0,00' : '0,0'}
          aria-label={tipo === 'moeda' ? 'Meta VT (R$)' : 'Alvo de % Rec'}
          className={`${wBloco} rounded-md border border-[var(--action-soft-border)] bg-white px-1.5 py-1 text-right text-[13px] tabular-nums shadow-sm outline-none`}
        />
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={abrir}
      title={erro ?? 'Clique para editar'}
      className="group flex w-full cursor-text items-center justify-end gap-1.5 rounded-md px-1 py-1 text-[13px] transition-colors hover:bg-zinc-100/70"
    >
      {/* Slot de status/affordance: loader > check > erro > lápis-no-hover */}
      <span className="flex w-3.5 shrink-0 justify-center">
        {saving
          ? <Loader2 size={12} className="animate-spin text-zinc-400" />
          : saved
            ? <Check size={12} className="text-success" />
            : erro
              ? <X size={12} className="text-danger" />
              : <Pencil size={11} className="text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100" />}
      </span>
      <span className={`${wBloco} shrink-0`}>
        {valor === null
          ? <span className="block text-right text-zinc-300">—</span>
          : tipo === 'moeda'
            ? <ValorContabil valor={valor} />
            : <span className="block text-right tabular-nums text-[var(--text-primary)]">{fmtPct(valor)}</span>}
      </span>
    </button>
  )
}

/** Bloco read-only do Group (mesmas larguras das células editáveis, sem affordance). */
function CelulaGroup({ valor, tipo, forte }: { valor: number | null; tipo: 'moeda' | 'percentual'; forte?: boolean }) {
  const wBloco = tipo === 'moeda' ? W_MOEDA : W_PCT
  return (
    <span className={`ml-auto block ${wBloco} ${forte ? 'font-semibold text-zinc-800' : 'font-medium text-zinc-700'}`}>
      {valor === null
        ? <span className="block text-right text-zinc-300">—</span>
        : tipo === 'moeda'
          ? <ValorContabil valor={valor} />
          : <span className="block text-right tabular-nums">{fmtPct(valor)}</span>}
    </span>
  )
}

export default function CadastroGrade({ ano, setores, metas, ultimaAlteracao }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const [valores, setValores] = useState<Record<string, CelulaValor>>(() => construirMapa(metas))
  const [estados, setEstados] = useState<Record<string, CelulaEstado>>({})
  const [erroGlobal, setErroGlobal] = useState<string | null>(null)

  // Re-hidrata quando o servidor troca o ano (nova navegação → novo `metas`). Padrão
  // "ajustar durante a renderização" (mesmo usado em cadastro-clientes.tsx).
  const [metasPrev, setMetasPrev] = useState(metas)
  if (metas !== metasPrev) {
    setMetasPrev(metas)
    setValores(construirMapa(metas))
    setEstados({})
  }

  function mudarAno(novo: number) {
    if (novo < ANO_MIN || novo > ANO_MAX) return
    const params = new URLSearchParams()
    params.set('ano', String(novo))
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  // Uma célula edita um campo; o save sempre envia a LINHA (setor×mês) inteira —
  // `metas_upsert` grava valor_meta E pct_receita juntos. Limpar a Meta VT não é uma
  // operação suportada (a RPC exige valor >= 0, não nulo): mantém o anterior, sem salvar.
  async function salvarCelula(setorId: number, mes: number, patch: Partial<CelulaValor>) {
    const k = chave(setorId, mes)
    const anterior = valores[k] ?? { valorMeta: null, pctReceita: null }

    if ('valorMeta' in patch && patch.valorMeta === null) return

    const atual: CelulaValor = { ...anterior, ...patch }

    if (atual.valorMeta === null) {
      // Só o % Rec foi preenchido, sem Meta VT ainda — guarda localmente, nada a persistir.
      setValores(prev => ({ ...prev, [k]: atual }))
      return
    }

    setValores(prev => ({ ...prev, [k]: atual }))
    setEstados(prev => ({ ...prev, [k]: { saving: true, saved: false, erro: null } }))

    let res: { ok: true } | { ok: false; erro: string }
    try {
      res = await salvarMeta({ setorMacroId: setorId, ano, mes, valorMeta: atual.valorMeta, pctReceita: atual.pctReceita })
    } catch {
      res = { ok: false, erro: 'Falha ao salvar a meta. Tente novamente.' }
    }

    if (res.ok) {
      setEstados(prev => ({ ...prev, [k]: { saving: false, saved: true, erro: null } }))
      setTimeout(() => {
        setEstados(prev => (prev[k] ? { ...prev, [k]: { ...prev[k], saved: false } } : prev))
      }, 1500)
    } else {
      setValores(prev => ({ ...prev, [k]: anterior })) // reverte
      setEstados(prev => ({ ...prev, [k]: { saving: false, saved: false, erro: res.erro } }))
      setErroGlobal(res.erro)
      setTimeout(() => {
        setEstados(prev => (prev[k] ? { ...prev, [k]: { ...prev[k], erro: null } } : prev))
      }, 3000)
    }
  }

  const totGroupAno = totalGroupAno(valores, setores)

  // Separadores verticais entre grupos de setor; bloco Group com fundo próprio.
  const sepGrupo = 'border-l border-zinc-100'
  const blocoGroup = 'border-l border-zinc-200 bg-zinc-50/70'

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Metas — Cadastro</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            Metas mensais de faturamento (Meta VT) e alvo de receita (% Rec) por setor
          </p>
        </div>
        <NavegacaoAno ano={ano} pending={isPending} onMudar={mudarAno} />
      </div>

      {erroGlobal && (
        <FaixaMensagem tipo="erro" texto={erroGlobal} onFechar={() => setErroGlobal(null)} />
      )}

      <Card className="px-5 py-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--text-muted)]">
            As colunas <span className="font-medium text-zinc-500">Group</span> somam os setores automaticamente e não são editáveis.
          </p>
          <p className="flex items-center gap-1.5 text-2xs text-zinc-400">
            <Pencil size={11} className="text-zinc-300" />
            Clique numa célula para editar · Enter salva · Esc cancela
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th rowSpan={2} className="w-[6.5rem] border-b border-zinc-200 px-2 pb-2 text-left align-bottom text-xs font-medium text-zinc-400">
                  Mês
                </th>
                {setores.map(s => (
                  <th
                    key={s.id}
                    colSpan={2}
                    className={`border-b border-zinc-100 px-2 pb-1.5 pt-0.5 text-center text-[13px] font-semibold ${sepGrupo}`}
                    style={{ color: s.cor }}
                  >
                    {s.display}
                  </th>
                ))}
                <th colSpan={2} className={`border-b border-zinc-100 px-2 pb-1.5 pt-0.5 text-center text-[13px] font-semibold text-zinc-500 ${blocoGroup}`}>
                  Group
                </th>
              </tr>
              <tr>
                {setores.map(s => (
                  <Fragment key={s.id}>
                    <th className={`border-b border-zinc-200 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400 ${sepGrupo}`}>Meta VT</th>
                    <th title="Alvo de receita como % do faturamento (VT)" className="border-b border-zinc-200 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400">
                      % Rec
                    </th>
                  </Fragment>
                ))}
                <th className={`border-b border-zinc-200 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400 ${blocoGroup}`}>Meta VT</th>
                <th title="Receita do Group = média dos alvos ponderada pela Meta VT" className={`border-b border-zinc-200 bg-zinc-50/70 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400`}>
                  % Rec
                </th>
              </tr>
            </thead>
            <tbody>
              {MESES.map((nomeMes, idx) => {
                const mes = idx + 1
                const group = computarGroupMes(valores, setores, mes)
                return (
                  <tr key={mes} className="transition-colors hover:bg-zinc-50/50 [&>td]:border-b [&>td]:border-zinc-50">
                    <td className="px-2 py-1 text-[13px] text-zinc-600">{nomeMes}</td>
                    {setores.map(s => {
                      const k = chave(s.id, mes)
                      const cel = valores[k] ?? { valorMeta: null, pctReceita: null }
                      const estado = estados[k]
                      return (
                        <Fragment key={s.id}>
                          <td className={`px-1 py-0.5 ${sepGrupo}`}>
                            <CelulaEditavel
                              valor={cel.valorMeta}
                              tipo="moeda"
                              estado={estado}
                              onSalvar={v => void salvarCelula(s.id, mes, { valorMeta: v })}
                            />
                          </td>
                          <td className="px-1 py-0.5">
                            <CelulaEditavel
                              valor={cel.pctReceita}
                              tipo="percentual"
                              estado={estado}
                              onSalvar={v => void salvarCelula(s.id, mes, { pctReceita: v })}
                            />
                          </td>
                        </Fragment>
                      )
                    })}
                    <td className={`px-2 py-0.5 ${blocoGroup}`}>
                      <CelulaGroup valor={group.valorMeta} tipo="moeda" />
                    </td>
                    <td className="bg-zinc-50/70 px-2 py-0.5">
                      <CelulaGroup valor={group.pctReceita} tipo="percentual" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="[&>td]:border-t [&>td]:border-zinc-200">
                <td className="px-2 py-2.5 text-[13px] font-semibold text-zinc-700">Total {ano}</td>
                {setores.map(s => {
                  const tot = totalSetorAno(valores, s.id)
                  return (
                    <Fragment key={s.id}>
                      <td className={`px-2 py-2.5 text-right text-[13px] font-semibold tabular-nums text-zinc-800 ${sepGrupo}`}>{fmtMi(tot.valorMeta)}</td>
                      <td className="px-2 py-2.5 text-right text-[13px] font-medium tabular-nums text-zinc-600">
                        {tot.pctReceita === null ? <span className="text-zinc-300">—</span> : fmtPct(tot.pctReceita)}
                      </td>
                    </Fragment>
                  )
                })}
                <td className={`px-2 py-2.5 text-right text-[13px] font-semibold tabular-nums text-zinc-900 ${blocoGroup}`}>{fmtMi(totGroupAno.valorMeta)}</td>
                <td className="bg-zinc-50/70 px-2 py-2.5 text-right text-[13px] font-medium tabular-nums text-zinc-600">
                  {totGroupAno.pctReceita === null ? <span className="text-zinc-300">—</span> : fmtPct(totGroupAno.pctReceita)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <History size={13} className="text-zinc-300" />
        {ultimaAlteracao
          ? <>Última alteração por <span className="font-medium text-zinc-500">{ultimaAlteracao.alterado_por ?? '—'}</span> · {fmtDataHoraSP(ultimaAlteracao.alterado_em)}</>
          : 'Nenhuma alteração registrada.'}
      </p>
    </div>
  )
}
