// v4.37.0 (Visão B parcial) — juros/multa por cliente no BOLETO, a partir do Cadastro de Clientes.
//
// ⚠️ MAPEAMENTO CRÍTICO — NÃO INVERTER (é o "dado errado parecendo certo"):
//     pct_multa → fine     (MULTA: cobrança ÚNICA no atraso)
//     pct_juros → interest (JUROS: AO MÊS)
//   O boleto sai e é aceito com as penalidades trocadas se inverter — por isso há teste.
//
// Contrato ESTRITO: só "1%" | "2%" | "5%" | "10%" viram inteiro; QUALQUER outra coisa (vazio,
// formato diferente, fora do contrato, cliente fora do cadastro) → null → DEFAULT 2/2, silencioso.
// A emissão NUNCA falha por juros/multa (fail-safe).

/** Percentuais aceitos pelo contrato (exatamente estas 4 strings, já trimadas). */
const CONTRATO: Record<string, number> = { '1%': 1, '2%': 2, '5%': 5, '10%': 10 }

/** "N%" do contrato → inteiro; qualquer outra coisa → null. */
export function parsePctContrato(v: string | null | undefined): number | null {
  return CONTRATO[(v ?? '').trim()] ?? null
}

/**
 * Normaliza o texto de juros/multa NA ENTRADA do Cadastro (import da planilha) para o formato do
 * contrato (v6.5.2 — a regra da migration 0170, que limpou o legado em jul/26, agora vale também
 * para cada novo import): vazio ou "padrão" → "2%"; "N% <qualquer texto>" → "N%"; o resto fica
 * como veio (e cai no default 2/2 do `parsePctContrato`, como antes).
 * Sem isto, a planilha ("1% ao mês", "10% sobre o valor integral da fatura") reimportada crua
 * rebaixava em SILÊNCIO os clientes de condição especial para 2/2 no boleto.
 */
export function normalizarPctEntrada(v: string | null | undefined): string {
  const s = (v ?? '').trim()
  if (s === '' || /^padr[aã]o/i.test(s)) return '2%'
  const m = s.match(/^(\d+)\s*%/)
  return m ? `${Number(m[1])}%` : s
}

export interface JurosMulta { fine: number; interest: number }

/** Default fail-safe (comportamento atual do boleto: 2% multa, 2% juros/mês). */
export const JUROS_MULTA_DEFAULT: JurosMulta = { fine: 2, interest: 2 }

/**
 * Deriva `fine`/`interest` (percentuais) do cadastro corporativo.
 * multa→fine, juros→interest — NÃO INVERTER. Cadastro ausente/inválido → default 2/2.
 */
export function jurosMultaDoCadastro(
  cad: { pct_juros?: string | null; pct_multa?: string | null } | null | undefined,
): JurosMulta {
  return {
    fine:     parsePctContrato(cad?.pct_multa) ?? JUROS_MULTA_DEFAULT.fine,     // MULTA → fine
    interest: parsePctContrato(cad?.pct_juros) ?? JUROS_MULTA_DEFAULT.interest, // JUROS → interest
  }
}
