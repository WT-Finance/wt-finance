// Coerção canônica de células de planilha (v4.17.0 / Balde 2). Fonte ÚNICA de
// toNum/toIsoDate/toStr para todos os parsers de carga — elimina as implementações
// divergentes que existiam, em especial o toNum INGÊNUO
// `Number(String(v).replace(',', '.'))`, que para valores BR com separador de milhar
// ("8.840,00", "1.234,56") produzia NaN → null = PERDA SILENCIOSA de valor.
//
// Regra de número (robusta BR/US — desambigua ponto milhar × ponto decimal pelo
// número de dígitos após o ponto):
//   - "R$ "/espaços removidos primeiro;
//   - vírgula-decimal no fim (",dd"/",d") → BR: ponto é milhar (removido), vírgula
//     vira ponto. Ex.: "8.840,00"→8840; "1.234,56"→1234.56;
//   - tem vírgula mas não-decimal → US: vírgula é milhar (removida). Ex.: "1,234.56"→1234.56;
//   - sem vírgula e casando ^-?\d{1,3}(\.\d{3})+$ → BR milhar puro (pontos removidos).
//     Ex.: "1.234"→1234; "12.345"→12345; "-1.234"→-1234;
//   - senão → ponto é decimal US, mantido. Ex.: "12.34"→12.34.
//   - valor entre PARÊNTESES → NEGATIVO (convenção contábil), com o conteúdo pela
//     regra acima. Ex.: "(1.000)"→-1000; "(1.234,56)"→-1234,56. (v4.27/ADR-0130)
// (mesma lógica do antigo fmtValor de solicitacoes/format.ts, agora única.)

/** Número robusto BR/US, ou null. Aceita number nativo (célula numérica). */
export function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isNaN(value) ? null : value
  let s = String(value).trim().replace(/[R$\s]/g, '').trim()
  if (!s) return null
  // Negativo entre parênteses (convenção contábil, v4.27): "(1.000)" → -1000. O
  // invólucro é detectado ANTES da desambiguação; o conteúdo segue a MESMA regra BR/US
  // abaixo e o sinal é aplicado no fim. NÃO afeta nenhum caso sem parênteses. (ADR-0130)
  let negativo = false
  if (s.startsWith('(') && s.endsWith(')')) {
    negativo = true
    s = s.slice(1, -1).trim()
    if (!s) return null
  }
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')        // BR decimal
  } else if (s.includes(',')) {
    s = s.replace(/,/g, '')                           // US milhar
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')                          // BR milhar puro (ponto agrupador)
  }
  // senão: ponto é decimal US ("12.34") → mantém
  const n = Number(s)
  if (Number.isNaN(n)) return null
  return negativo ? -n : n
}

/**
 * Data → ISO `YYYY-MM-DD`, SEM inverter dia/mês e SEM deslocamento de fuso.
 * - `Date` nativo (cellDates:true): usa ano/mês/dia LOCAIS (toISOString deslocaria
 *   o dia em fusos negativos — armadilha da ADR-0099);
 * - "DD/MM/YYYY" → split direto (8/06 = 8 de junho, não 6 de agosto);
 * - "YYYY-MM-DD" → passthrough;
 * - resto → null.
 */
export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    if (y < 1900) return null // serial 0 do Excel (1899-12-30) e datas inválidas
    return `${y}-${m}-${d}`
  }
  const s = String(value).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.endsWith('-00') ? null : s
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/')
    return d === '00' ? null : `${y}-${m}-${d}`
  }
  return null
}

/** String aparada, ou null se vazia/ausente. */
export function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}
