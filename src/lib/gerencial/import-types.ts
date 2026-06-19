// Tipos e helpers PUROS da importação Gerencial.
// Sem dependências de @e965/xlsx nem de Supabase — seguro para importar
// tanto de Client Components quanto de Server (API Route / Server Actions).
// O parsing de Excel vive em parser.ts (só consumido pela API Route, runtime Node).
//
// v4.23.0 — SINCRONIZAÇÃO POR FATIA DO ORIGINADOR (ADR-0126). A importação deixa de
// sincronizar contra TODAS as linhas de planilha (deleção mútua entre importadores) e
// passa a sincronizar APENAS a fatia do próprio importador (originador = ele). O cálculo
// do diff é PURO e testável (computeDiffPorFatia) — `fatia` é só as linhas DELE; o
// isolamento entre fatias é garantido na origem (a fatia do colega nunca entra aqui) e
// reforçado no banco (DELETE com `AND originador_id = <eu>`).

import { normalizarChaveConta } from './normalizar-conta'

export interface LancamentoPlanilha {
  tipo:           'A pagar' | 'A receber'
  pessoa:         string
  valor_final:    number
  descricao:      string | null
  conta_previsao: string | null
  vencimento:     string  // YYYY-MM-DD
}

/** Linha da BASE pertencente à fatia do importador (origem='planilha', originador = ele). */
export interface LinhaFatia {
  id:             number
  tipo:           string
  pessoa:         string
  valor_final:    number
  descricao:      string | null
  conta_previsao: string | null
  vencimento:     string
}

/** Linha da fatia (existente no banco) exibida no preview (a manter / a remover). */
export interface LinhaResumo {
  id:             number
  tipo:           string
  pessoa:         string
  valor_final:    number
  vencimento:     string
  descricao:      string | null
  conta_previsao: string | null
}

export interface ImportDiff {
  aAdicionar: LancamentoPlanilha[]
  aRemover:   LinhaResumo[]
  /** Linhas da fatia que permanecem intactas (idênticas à planilha). `.length` = contagem "a manter". */
  aManter:    LinhaResumo[]
  aAtualizar: Array<{ id: number; atual: Record<string, unknown>; novo: LancamentoPlanilha; camposDivergentes: string[] }>
  /** Linhas idênticas (6 campos) repetidas DENTRO da própria planilha (independe do toggle).
   *  >0 → a UI mostra o aviso e o controle "Manter duplicadas". (v4.23.1, item 5) */
  duplicatasPlanilha: number
  /** As ocorrências REPETIDAS (2ª+) dentro da planilha — para a UI listar QUAIS linhas duplicam.
   *  `.length === duplicatasPlanilha`. (v4.23.3, item 2) */
  duplicatasLinhas: LancamentoPlanilha[]
}

export interface ImportResumo {
  adicionados: number
  removidos:   number
  atualizados: number
}

// ── Chaves de identidade ─────────────────────────────────────────────────────
// Tudo normalizado (trim + caixa + acento + espaços colapsados) para comparação —
// "BestBuy Hotel" e "BestBuy Hotel " contam como idênticos. Reusa a normalização do
// conta_previsao (normalizarChaveConta) para pessoa/descrição/conta.
const norm = (s: string | null | undefined) => normalizarChaveConta(s)
// Arredonda aos centavos ANTES de formatar: toFixed sozinho não arredonda confiável
// (2.675→"2.67") e poderia colidir/dividir valores monetários distintos na chave.
const v2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2)

/** Chave LÓGICA (4 campos): "mesma linha lógica" — pareia add/atualizar/manter/remover. */
// tipo e pessoa são normalizados (trim/caixa) para casar com a identidade de 6 campos;
// vencimento já chega canônico (YYYY-MM-DD) das duas pontas.
function chaveLogica(l: { tipo: string; pessoa: string; valor_final: number; vencimento: string }): string {
  return `${norm(l.tipo)}|${norm(l.pessoa)}|${v2(l.valor_final)}|${l.vencimento}`
}
/** Identidade COMPLETA (6 campos normalizados): "linha idêntica". */
function chave6(l: { tipo: string; pessoa: string; valor_final: number; vencimento: string; descricao: string | null; conta_previsao: string | null }): string {
  return `${chaveLogica(l)}|${norm(l.descricao)}|${norm(l.conta_previsao)}`
}

/**
 * Diff da importação por fatia do originador, POR CONTAGEM de linhas (não presença).
 *
 * - `planilhaRaw`: linhas parseadas da planilha do importador (conta_previsao já canonizada na rota).
 * - `fatia`: linhas da base que JÁ são DELE (origem='planilha', originador=ele). NUNCA inclui o colega.
 * - `manterDuplicadas`: false (padrão) colapsa idênticas (6 campos) DENTRO da planilha; true mantém as duas.
 *
 * Regra: agrupa por chave LÓGICA (4 campos); dentro do grupo, casa as IDÊNTICAS (6 campos) → `aManter`;
 * o restante (mesma chave lógica, descrição/conta divergem) pareia 1:1 (ordem estável) → `aAtualizar`;
 * sobra da planilha → `aAdicionar`; sobra da fatia → `aRemover`. Tudo escopado à fatia → isolamento.
 */
export function computeDiffPorFatia(
  planilhaRaw: LancamentoPlanilha[],
  fatia: LinhaFatia[],
  manterDuplicadas: boolean,
): ImportDiff {
  // Linhas idênticas (6 campos) repetidas DENTRO da planilha (independe do toggle): coleta as
  // ocorrências REPETIDAS (2ª+) p/ a UI listar QUAIS duplicam; a contagem alimenta o aviso.
  const vistosDup = new Set<string>()
  const duplicatasLinhas: LancamentoPlanilha[] = []
  for (const l of planilhaRaw) {
    const k = chave6(l)
    if (vistosDup.has(k)) duplicatasLinhas.push(l); else vistosDup.add(k)
  }
  const duplicatasPlanilha = duplicatasLinhas.length

  // 1) Toggle: colapsa idênticas DENTRO da planilha (salvo "manter duplicadas").
  let planilha = planilhaRaw
  if (!manterDuplicadas) {
    const vistos = new Set<string>()
    planilha = planilhaRaw.filter(l => { const k = chave6(l); if (vistos.has(k)) return false; vistos.add(k); return true })
  }

  // 2) Agrupa ambos os lados por chave LÓGICA. Fatia ordenada por id → pareamento estável.
  type Grupo = { sheet: LancamentoPlanilha[]; slice: LinhaFatia[] }
  const grupos = new Map<string, Grupo>()
  const grupo = (k: string) => { let g = grupos.get(k); if (!g) { g = { sheet: [], slice: [] }; grupos.set(k, g) } return g }
  for (const l of planilha) grupo(chaveLogica(l)).sheet.push(l)
  for (const l of [...fatia].sort((a, b) => a.id - b.id)) grupo(chaveLogica(l)).slice.push(l)

  const diff: ImportDiff = { aAdicionar: [], aRemover: [], aManter: [], aAtualizar: [], duplicatasPlanilha, duplicatasLinhas }
  const resumo = (r: LinhaFatia): LinhaResumo =>
    ({ id: r.id, tipo: r.tipo, pessoa: r.pessoa, valor_final: r.valor_final, vencimento: r.vencimento, descricao: r.descricao, conta_previsao: r.conta_previsao })

  for (const { sheet, slice } of grupos.values()) {
    // 2a) Casa as IDÊNTICAS (6 campos) primeiro → manter (consome 1:1 por contagem).
    const sliceByChave6 = new Map<string, LinhaFatia[]>()
    for (const s of slice) { const k = chave6(s); let b = sliceByChave6.get(k); if (!b) { b = []; sliceByChave6.set(k, b) } b.push(s) }
    const sheetRest: LancamentoPlanilha[] = []
    for (const sh of sheet) {
      const bucket = sliceByChave6.get(chave6(sh))
      if (bucket && bucket.length) { diff.aManter.push(resumo(bucket.shift()!)) }
      else sheetRest.push(sh)
    }
    const sliceRest = [...sliceByChave6.values()].flat()

    // 2b) Restante com a MESMA chave lógica (descrição/conta divergem) → atualizar (preserva id).
    const par = Math.min(sheetRest.length, sliceRest.length)
    for (let i = 0; i < par; i++) {
      const novo = sheetRest[i], atual = sliceRest[i]
      const camposDivergentes: string[] = []
      if (norm(atual.descricao)      !== norm(novo.descricao))      camposDivergentes.push('descricao')
      if (norm(atual.conta_previsao) !== norm(novo.conta_previsao)) camposDivergentes.push('conta_previsao')
      diff.aAtualizar.push({ id: atual.id, atual: atual as unknown as Record<string, unknown>, novo, camposDivergentes })
    }
    // 2c) Sobra da planilha → adicionar; sobra da fatia → remover (só linhas DELE).
    for (let i = par; i < sheetRest.length; i++) diff.aAdicionar.push(sheetRest[i])
    for (let i = par; i < sliceRest.length; i++) {
      const r = sliceRest[i]
      diff.aRemover.push({ id: r.id, tipo: r.tipo, pessoa: r.pessoa, valor_final: r.valor_final, vencimento: r.vencimento, descricao: r.descricao, conta_previsao: r.conta_previsao })
    }
  }
  return diff
}
