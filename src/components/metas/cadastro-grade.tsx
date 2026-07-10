'use client'

// Cadastro de Metas (v5.0.0) — grade anual 12 meses × 3 setores × [Faturamento, % Rec],
// com EDIÇÃO LOCAL + SALVAR EM LOTE (adendo pós-checkpoint). Enter/blur confirma a
// célula só no estado do cliente (sem chamar o servidor); o "Salvar" do rodapé envia
// TODAS as linhas pendentes de uma vez via `salvarMetas`. A coluna Group (soma de
// Faturamento; média de % Rec ponderada pelo Faturamento) é COMPUTADA no cliente, ao
// vivo, a partir do estado local (`valores`) — nunca persistida.
//
// Tela de PLATAFORMA (tema group): sem var(--brand); a única cor "viva" é a identidade
// de cada setor no cabeçalho (prop `cor`, já um `var(--setor-*)` vindo de SETOR_COLORS).
//
// Dirty/pendências: `valores` (edição corrente) é comparado contra `baseline` (a
// verdade do servidor, re-hidratada quando `metas` muda — inclusive após o
// `router.refresh()` do Salvar, que é o que zera dirty/pendências). Célula suja =
// ponto âmbar; LINHA pendente (persistável) exige Faturamento != null (a RPC não aceita
// valor_meta nulo) — uma linha só-com-%-mudado fica suja mas não conta nem é enviada.
//
// Visual (mockup v2): moldura interna (border+rounded+overflow-hidden) em volta da
// tabela; valor contábil em BLOCO DE LARGURA FIXA dentro da célula (o "R$" ancorado
// perto do número); grupos de setor separados por borda vertical; affordance de edição
// = lápis no hover (ponto âmbar substitui o lápis quando a célula está suja); colunas
// Group com fundo próprio (read-only); linha Total no mesmo cinza do Group, em formato
// contábil pleno (sem abreviação "Mi").

import { useState, useEffect, useRef, Fragment, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Pencil, History, CopyPlus } from 'lucide-react'
import { toNum } from '@/lib/carga/coercao'
import { fmtDataHoraSP } from '@/lib/fmt'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { Card } from '@/components/ui/card'
import Button from '@/components/ui/button'
import { salvarMetas, type MetaCelula } from '@/app/metas/cadastro/actions'

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

type CelulaValor = { valorMeta: number | null; pctReceita: number | null }
type TotalAno     = { valorMeta: number; pctReceita: number | null }

const chave = (setorId: number, mes: number): string => `${setorId}-${mes}`

function construirMapa(lista: MetaItem[]): Record<string, CelulaValor> {
  const mapa: Record<string, CelulaValor> = {}
  for (const item of lista) {
    mapa[chave(item.setor_macro_id, item.mes)] = { valorMeta: item.valor_meta, pctReceita: item.pct_receita }
  }
  return mapa
}

/** Diferença de UM campo entre o valor corrente e o baseline (null-safe). */
function celulaDiferente(a: CelulaValor | undefined, b: CelulaValor | undefined, campo: keyof CelulaValor): boolean {
  return (a?.[campo] ?? null) !== (b?.[campo] ?? null)
}

/** "12,5%" — 1 casa, sem zeros à direita forçados. */
function fmtPct(v: number): string {
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/** Group de um MÊS: soma de Faturamento; % Rec = média ponderada por Faturamento (só setores com % informado). */
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

/** Total ANUAL de um setor (soma das 12 linhas de Faturamento; % Rec ponderado por Faturamento). */
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

// ── Ícone "Aplicar ao ano" no cabeçalho de cada coluna % Rec — popover de 1 campo
// que seta o mesmo alvo nos 12 meses do setor de uma vez (atalho para a carga
// inicial da meta: digitar 1x em vez de 12). Fecha ao aplicar/Esc/clique-fora. ──
function CabecalhoPctRec({ aberto, valor, onAbrir, onFechar, onValorChange, onAplicar }: {
  aberto:        boolean
  valor:         string
  onAbrir:       () => void
  onFechar:      () => void
  onValorChange: (v: string) => void
  onAplicar:     () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onFechar()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aberto, onFechar])

  return (
    <span className="relative inline-flex items-center gap-1">
      <span title="Alvo de receita como % do faturamento (VT)">% Rec</span>
      <button
        type="button"
        onClick={onAbrir}
        title="Aplicar um % Rec a todos os meses"
        className="foco-neutro text-zinc-300 transition-colors hover:text-zinc-500"
      >
        <CopyPlus size={12} />
      </button>
      {aberto && (
        <div
          ref={ref}
          className="absolute right-0 top-full z-30 mt-1.5 w-40 rounded-lg border border-zinc-200 bg-white p-2 text-left shadow-lg"
        >
          <label className="mb-1 block text-2xs font-normal text-zinc-400">% Rec p/ os 12 meses</label>
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              inputMode="decimal"
              value={valor}
              onChange={e => onValorChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onAplicar()
                if (e.key === 'Escape') onFechar()
              }}
              placeholder="0,0"
              aria-label="% Rec a aplicar nos 12 meses"
              className="w-16 rounded-md border border-zinc-200 px-1.5 py-1 text-right text-[13px] tabular-nums outline-none"
            />
            <button
              type="button"
              onClick={onAplicar}
              className="foco-neutro shrink-0 rounded-md bg-action-primary px-2 py-1 text-2xs font-semibold text-action-primary-fg transition hover:opacity-90"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </span>
  )
}

// ── Célula editável (Faturamento ou % Rec). Enter/blur CONFIRMA LOCALMENTE (só
// atualiza o estado do pai via onConfirmar — nada é enviado ao servidor aqui); Esc
// cancela a edição sem alterar o valor. Reverte sozinha entradas não-numéricas.
// `dirty` (célula difere do baseline) pinta um ponto âmbar no lugar do lápis. ──
function CelulaEditavel({ valor, tipo, dirty, onConfirmar }: {
  valor:       number | null
  tipo:        'moeda' | 'percentual'
  dirty:       boolean
  onConfirmar: (novo: number | null) => void
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
    onConfirmar(num)
  }

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
          aria-label={tipo === 'moeda' ? 'Faturamento (R$)' : 'Alvo de % Rec'}
          className={`${wBloco} rounded-md border border-[var(--action-soft-border)] bg-white px-1.5 py-1 text-right text-[13px] tabular-nums shadow-sm outline-none`}
        />
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={abrir}
      title={dirty ? 'Alteração não salva — clique para editar' : 'Clique para editar'}
      className="group flex w-full cursor-text items-center justify-end gap-1.5 rounded-md px-1 py-1 text-[13px] transition-colors hover:bg-zinc-100/70"
    >
      {/* Slot de affordance: ponto âmbar (suja) > lápis-no-hover (limpa) */}
      <span className="flex w-3.5 shrink-0 justify-center">
        {dirty
          ? <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
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

  // `valores` = edição corrente (o que a grade mostra); `baseline` = a verdade do
  // servidor (o que já está gravado). Dirty/pendência sempre compara os dois.
  const [valores, setValores]   = useState<Record<string, CelulaValor>>(() => construirMapa(metas))
  const [baseline, setBaseline] = useState<Record<string, CelulaValor>>(() => construirMapa(metas))
  const [erroGlobal, setErroGlobal] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // "Aplicar ao ano" — qual setor tem o popover aberto + o valor digitado.
  const [aplicarSetor, setAplicarSetor] = useState<number | null>(null)
  const [aplicarTxt, setAplicarTxt] = useState('')

  // Re-hidrata quando o servidor troca de dado (nova navegação de ano OU o
  // `router.refresh()` pós-Salvar): valores E baseline convergem à verdade nova, o que
  // zera dirty/pendências de graça. Padrão "ajustar durante a renderização" (mesmo
  // usado em cadastro-clientes.tsx).
  const [metasPrev, setMetasPrev] = useState(metas)
  if (metas !== metasPrev) {
    setMetasPrev(metas)
    setValores(construirMapa(metas))
    setBaseline(construirMapa(metas))
    setErroGlobal(null)
    setAplicarSetor(null)
  }

  // Pendências: linhas (setor×mês) que diferem do baseline E têm Faturamento != null
  // (persistáveis — a RPC exige valor_meta não-nulo). Uma linha só-com-%-mudado sem
  // Faturamento fica "suja" (ponto âmbar na célula) mas não conta nem é enviada.
  const pendentes: MetaCelula[] = []
  for (const s of setores) {
    for (let mes = 1; mes <= 12; mes++) {
      const k = chave(s.id, mes)
      const atual = valores[k]
      const base  = baseline[k]
      const mudou = celulaDiferente(atual, base, 'valorMeta') || celulaDiferente(atual, base, 'pctReceita')
      const valorMeta = atual?.valorMeta ?? null
      if (mudou && valorMeta != null) {
        pendentes.push({ setorMacroId: s.id, ano, mes, valorMeta, pctReceita: atual?.pctReceita ?? null })
      }
    }
  }
  const pendCount = pendentes.length

  // Avisa ao fechar/recarregar a aba com pendências (a guarda de troca de ano usa
  // window.confirm; esta cobre a saída da página em si).
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

  function mudarAno(novo: number) {
    if (novo < ANO_MIN || novo > ANO_MAX) return
    if (pendCount > 0) {
      const ok = window.confirm(`Há ${pendCount} alteração(ões) não salva(s). Descartar e trocar de ano?`)
      if (!ok) return
    }
    const params = new URLSearchParams()
    params.set('ano', String(novo))
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  // Confirma UM campo de UMA célula localmente — só atualiza `valores`; a persistência
  // real acontece em bloco, no `salvar()`.
  function confirmarCelula(setorId: number, mes: number, campo: keyof CelulaValor, novo: number | null) {
    const k = chave(setorId, mes)
    setValores(prev => ({
      ...prev,
      [k]: { ...(prev[k] ?? { valorMeta: null, pctReceita: null }), [campo]: novo },
    }))
  }

  function abrirAplicar(setorId: number) {
    setAplicarSetor(setorId)
    setAplicarTxt('')
  }
  function fecharAplicar() {
    setAplicarSetor(null)
    setAplicarTxt('')
  }
  // Aplica o mesmo % Rec aos 12 meses do setor (localmente — vira pendência; só
  // persiste quando "Salvar" for clicado).
  function aplicarAoAno(setorId: number) {
    const num = toNum(aplicarTxt)
    if (num === null) { fecharAplicar(); return }
    setValores(prev => {
      const novo = { ...prev }
      for (let mes = 1; mes <= 12; mes++) {
        const k = chave(setorId, mes)
        novo[k] = { ...(novo[k] ?? { valorMeta: null, pctReceita: null }), pctReceita: num }
      }
      return novo
    })
    fecharAplicar()
  }

  // Salva em LOTE as linhas pendentes (`metas_upsert` via `salvarMetas`). Sucesso →
  // router.refresh() (o servidor refaz o fetch; o `metas` novo re-hidrata valores E
  // baseline acima, zerando dirty/pendências e atualizando a nota de auditoria — nada
  // além disso é necessário aqui). Erro → mantém `valores`/dirty/pendências intactos e
  // mostra a faixa no topo; nada se perde, retry possível.
  async function salvar() {
    setSalvando(true)
    setErroGlobal(null)
    let res: { ok: true; gravadas: number } | { ok: false; erro: string }
    try {
      res = await salvarMetas(pendentes)
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

  const totGroupAno = totalGroupAno(valores, setores)

  // Separadores verticais entre grupos de setor; bloco Group com fundo próprio.
  const sepGrupo = 'border-l border-zinc-100'
  const blocoGroup = 'border-l border-zinc-200 bg-zinc-50/70'

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Cadastro de Metas</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            Metas mensais de faturamento e a receita alvo por setor
          </p>
        </div>
        <NavegacaoAno ano={ano} pending={isPending} onMudar={mudarAno} />
      </div>

      {erroGlobal && (
        <FaixaMensagem tipo="erro" texto={erroGlobal} onFechar={() => setErroGlobal(null)} />
      )}

      <Card className="px-5 py-4">
        <p className="mb-2 flex items-center gap-1.5 text-2xs text-zinc-400">
          <Pencil size={11} className="text-zinc-300" />
          Clique numa célula para editar
        </p>

        <div className="overflow-hidden rounded-lg border border-zinc-200">
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
                    <th className={`border-b border-zinc-200 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400 ${sepGrupo}`}>Faturamento</th>
                    <th className="border-b border-zinc-200 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400">
                      <CabecalhoPctRec
                        aberto={aplicarSetor === s.id}
                        valor={aplicarTxt}
                        onAbrir={() => abrirAplicar(s.id)}
                        onFechar={fecharAplicar}
                        onValorChange={setAplicarTxt}
                        onAplicar={() => aplicarAoAno(s.id)}
                      />
                    </th>
                  </Fragment>
                ))}
                <th className={`border-b border-zinc-200 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400 ${blocoGroup}`}>Faturamento</th>
                <th title="Receita do Group = média dos alvos ponderada pelo Faturamento" className="border-b border-zinc-200 bg-zinc-50/70 px-2 py-1.5 text-right text-2xs font-medium text-zinc-400">
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
                      const base = baseline[k]
                      return (
                        <Fragment key={s.id}>
                          <td className={`px-1 py-0.5 ${sepGrupo}`}>
                            <CelulaEditavel
                              valor={cel.valorMeta}
                              tipo="moeda"
                              dirty={celulaDiferente(cel, base, 'valorMeta')}
                              onConfirmar={v => confirmarCelula(s.id, mes, 'valorMeta', v)}
                            />
                          </td>
                          <td className="px-1 py-0.5">
                            <CelulaEditavel
                              valor={cel.pctReceita}
                              tipo="percentual"
                              dirty={celulaDiferente(cel, base, 'pctReceita')}
                              onConfirmar={v => confirmarCelula(s.id, mes, 'pctReceita', v)}
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
              <tr className="bg-zinc-50/70 [&>td]:border-t [&>td]:border-zinc-200">
                <td className="px-2 py-2.5 text-[13px] font-semibold text-zinc-700">Total</td>
                {setores.map(s => {
                  const tot = totalSetorAno(valores, s.id)
                  return (
                    <Fragment key={s.id}>
                      <td className={`px-2 py-2.5 ${sepGrupo}`}>
                        <span className={`ml-auto block ${W_MOEDA} text-[13px] font-semibold tabular-nums text-zinc-800`}>
                          <ValorContabil valor={tot.valorMeta} />
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right text-[13px] font-medium tabular-nums text-zinc-600">
                        {tot.pctReceita === null ? <span className="text-zinc-300">—</span> : fmtPct(tot.pctReceita)}
                      </td>
                    </Fragment>
                  )
                })}
                <td className="border-l border-zinc-200 px-2 py-2.5">
                  <span className={`ml-auto block ${W_MOEDA} text-[13px] font-semibold tabular-nums text-zinc-900`}>
                    <ValorContabil valor={totGroupAno.valorMeta} />
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right text-[13px] font-medium tabular-nums text-zinc-600">
                  {totGroupAno.pctReceita === null ? <span className="text-zinc-300">—</span> : fmtPct(totGroupAno.pctReceita)}
                </td>
              </tr>
            </tfoot>
          </table>
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
