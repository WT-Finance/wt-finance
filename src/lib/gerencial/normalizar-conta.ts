// Normalização tolerante de conta (v4.22 / M6). Isomórfico — sem deps de xlsx/Supabase,
// usável tanto na API Route de import quanto em Client Components (o select de Conta).
//
// Casa o conta_previsao (texto humano da planilha) com as contas REAIS de gerencial_saldos:
// tolerante a caixa/acento/espaço + tabela de aliases conhecidos. Nulo/vazio/órfão → "Outras".
//
// ⚠️ NÃO afeta a Visualização Agregada: a agregada NÃO usa conta_previsao (decisão de modelo
// imutável). Isto só serve ao FILTRO/seleção e à limpeza da base. Espelha o backfill SQL (0149).

export const ROTULO_OUTRAS = 'Outras'

/** Chave de comparação: minúsculo + sem acento + trim + espaços colapsados. */
export function normalizarChaveConta(s: string | null | undefined): string {
  if (!s) return ''
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

// Variações conhecidas da planilha humana → chave normalizada da conta REAL.
// (As contas reais — Itaú/Asaas/Blimboo — já casam por chave normalizada; aqui ficam só
//  os apelidos que NÃO casariam sozinhos, como "Banco Itau".)
const ALIAS_NORM: Record<string, string> = {
  'banco itau': 'itau', // "Banco Itau"/"Banco Itaú" → Itaú
}

/**
 * Devolve o NOME canônico (exatamente como está em gerencial_saldos) para um conta_previsao
 * cru, ou "Outras" se não casar com nenhuma conta real. `contasReais` = nomes de gerencial_saldos.
 */
export function canonizarConta(raw: string | null | undefined, contasReais: readonly string[]): string {
  const chave = normalizarChaveConta(raw)
  if (!chave) return ROTULO_OUTRAS
  const alvo = ALIAS_NORM[chave] ?? chave
  const real = contasReais.find(c => normalizarChaveConta(c) === alvo)
  return real ?? ROTULO_OUTRAS
}
