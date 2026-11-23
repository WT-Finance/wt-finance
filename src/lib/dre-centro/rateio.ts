import { z } from 'zod'
import type { DreLinha } from '@/lib/dre/schemas'
import { toNum } from '@/lib/carga/coercao'

// ── Rateio do CSC (v6.5.1, 0308) — módulo PURO do drawer ─────────────────────
//
// Decisões do Yan (PR #311): o rateio reparte SÓ o valor que caiu no CSC entre Trips, Weddings e Corporativo
// (Sem centro é ignorado); um % por CATEGORIA ou por GRUPO de categoria (bloco-folha da DRE) — o grupo
// preenchido TRAVA as categorias dele (o banco faz o grupo vencer); um único conjunto para todos os períodos,
// salvo no banco. A conta em si roda no banco (financeiro.dre_caixa_centro_nucleo); aqui ficam a lista que o
// drawer mostra, a validação de cada linha e a lista que vai para salvar_dre_rateio_csc.

export const CENTROS_RATEIO = ['trips', 'weddings', 'corp'] as const
export type CentroRateio = (typeof CENTROS_RATEIO)[number]

export const ROTULO_RATEIO: Record<CentroRateio, string> = { trips: 'Trips', weddings: 'Weddings', corp: 'Corporativo' }

// ── Contrato de get_dre_rateio_csc ──────────────────────────────────────────
// numeric do Postgres pode vir como string: converte e RECUSA o que não for número finito (revisor, BAIXO).
const num = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite())
export const rateioCscSchema = z.object({
  itens: z.array(z.object({
    categoria_id: z.number().nullable(),
    bloco_chave: z.string().nullable(),
    pct_trips: num,
    pct_weddings: num,
    pct_corp: num,
    /** O alvo ainda existe no mapa vivo da DRE (0308). false = órfão: não vale e sai no próximo salvamento. */
    ativo: z.boolean().optional(),
  }).passthrough()),
  atualizado_em: z.string().nullable(),
}).passthrough()
export type RateioCsc = z.infer<typeof rateioCscSchema>

/** O que vai para salvar_dre_rateio_csc: exatamente um alvo por item. */
export interface ItemRateio {
  categoria_id?: number
  bloco_chave?: string
  pct_trips: number
  pct_weddings: number
  pct_corp: number
}

// ── O que o drawer lista: os grupos (blocos-folha) e as categorias de cada um, na ordem da DRE ──
export interface GrupoRateio {
  chave: string
  rotulo: string
  categorias: Array<{ categoria_id: number; rotulo: string }>
}

/** Grupos = linhas da árvore que têm categorias penduradas (`cat.g` = chave do grupo), na ordem da árvore. */
export function gruposDaArvore(linhas: readonly DreLinha[]): GrupoRateio[] {
  const porChave = new Map<string, GrupoRateio>()
  const rotulos = new Map(linhas.filter(l => l.t !== 'cat' && l.chave).map(l => [l.chave as string, l.rotulo]))
  for (const l of linhas) {
    if (l.t !== 'cat' || l.g == null || l.categoria_id == null) continue
    let g = porChave.get(l.g)
    if (!g) {
      g = { chave: l.g, rotulo: rotulos.get(l.g) ?? l.g, categorias: [] }
      porChave.set(l.g, g)
    }
    g.categorias.push({ categoria_id: l.categoria_id, rotulo: l.rotulo })
  }
  return [...porChave.values()]
}

// ── Estado do formulário: texto digitado por alvo ('g:<chave>' | 'c:<id>') ───
export type Pcts = Record<CentroRateio, string>
export type EstadoRateio = Record<string, Pcts>

export const chaveGrupo = (chave: string) => `g:${chave}`
export const chaveCategoria = (id: number) => `c:${id}`
export const PCTS_VAZIO: Pcts = { trips: '', weddings: '', corp: '' }

/** Até 2 casas, vírgula decimal (o drawer só aceita 2 casas — ver `lerPct`). */
const fmtPct = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false })

/** Estado inicial a partir do que está salvo. */
export function estadoInicial(r: RateioCsc | null): EstadoRateio {
  const out: EstadoRateio = {}
  for (const it of r?.itens ?? []) {
    const k = it.bloco_chave != null ? chaveGrupo(it.bloco_chave) : it.categoria_id != null ? chaveCategoria(it.categoria_id) : null
    if (k) out[k] = { trips: fmtPct(it.pct_trips), weddings: fmtPct(it.pct_weddings), corp: fmtPct(it.pct_corp) }
  }
  return out
}

/** Formato aceito ANTES da coerção: até 3 dígitos e até 2 casas, vírgula ou ponto. Com 3+ casas a `toNum`
 *  canônica leria a vírgula como milhar ("33,333" → 33333) — o formato barra isso antes. */
const FORMATO_PCT = /^\d{1,3}([.,]\d{1,2})?$/

/** Percentual digitado ("33,33", "33.33", " 50 "); vazio = null; inválido = NaN. Coerção pela `toNum` canônica. */
export function lerPct(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  if (!FORMATO_PCT.test(t)) return Number.NaN
  return toNum(t) ?? Number.NaN
}

export type ValidacaoLinha = { tipo: 'vazia' } | { tipo: 'ok'; pcts: Record<CentroRateio, number> } | { tipo: 'erro'; msg: string }

/** Uma linha está vazia (sem rateio), completa (Σ = 100) ou com erro. Campo vazio numa linha preenchida = 0. */
export function validarLinha(p: Pcts | undefined): ValidacaoLinha {
  if (!p) return { tipo: 'vazia' }
  const v = CENTROS_RATEIO.map(c => lerPct(p[c]))
  if (v.every(x => x === null)) return { tipo: 'vazia' }
  if (v.some(x => x !== null && Number.isNaN(x))) return { tipo: 'erro', msg: 'Use números de 0 a 100, com até 2 casas decimais.' }
  const n = v.map(x => x ?? 0)
  if (n.some(x => x > 100)) return { tipo: 'erro', msg: 'Cada percentual vai de 0 a 100.' }
  const soma = Math.round(n.reduce((s, x) => s + x, 0) * 10_000) / 10_000
  if (soma !== 100) return { tipo: 'erro', msg: `A soma é ${fmtPct(soma)}% — precisa ser 100%.` }
  return { tipo: 'ok', pcts: { trips: n[0], weddings: n[1], corp: n[2] } }
}

/** A categoria fica travada quando o grupo dela tem rateio preenchido (completo OU em edição). */
export function categoriaTravada(estado: EstadoRateio, chaveDoGrupo: string): boolean {
  return validarLinha(estado[chaveGrupo(chaveDoGrupo)]).tipo !== 'vazia'
}

export interface ResultadoMontagem {
  itens: ItemRateio[]
  /** alvo → mensagem; vazio = pode salvar. */
  erros: Record<string, string>
}

/** A lista que vai para o banco: grupos preenchidos e categorias preenchidas. A categoria de grupo travado com
 *  rascunho VÁLIDO também vai (fica guardada e volta a valer se o grupo for limpo — o banco faz o grupo vencer); com
 *  rascunho inválido ela é descartada (não bloqueia o salvamento). Só entra o que está na árvore da tela: um item
 *  salvo cuja categoria não aparece nela (ex.: a taxa de antecipação, fora da árvore com ajuste) sai ao salvar. */
export function montarItens(estado: EstadoRateio, grupos: readonly GrupoRateio[]): ResultadoMontagem {
  const itens: ItemRateio[] = []
  const erros: Record<string, string> = {}
  for (const g of grupos) {
    const kg = chaveGrupo(g.chave)
    const vg = validarLinha(estado[kg])
    if (vg.tipo === 'erro') erros[kg] = vg.msg
    if (vg.tipo === 'ok') itens.push({ bloco_chave: g.chave, pct_trips: vg.pcts.trips, pct_weddings: vg.pcts.weddings, pct_corp: vg.pcts.corp })
    for (const c of g.categorias) {
      const kc = chaveCategoria(c.categoria_id)
      const vc = validarLinha(estado[kc])
      // Categoria travada com rascunho inválido não bloqueia: ela não vale enquanto o grupo existir.
      if (vc.tipo === 'erro' && vg.tipo === 'vazia') erros[kc] = vc.msg
      if (vc.tipo === 'ok') itens.push({ categoria_id: c.categoria_id, pct_trips: vc.pcts.trips, pct_weddings: vc.pcts.weddings, pct_corp: vc.pcts.corp })
    }
  }
  return { itens, erros }
}

/** Há rateio salvo? (a chave "Com rateio" só aparece quando há). */
export const temRateio = (r: RateioCsc | null) => (r?.itens.length ?? 0) > 0
