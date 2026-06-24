// Decisões PURAS e testáveis do backup-gate (v4.27.1, ADR-0131), consumidas por migrate.mjs.
// Sem efeito colateral no import (NÃO toca rede/banco) → a sonda classificar.test.mjs as
// exercita direto. É a "execução do gate" que o briefing pede (não há UI).
//
//  • classificarSql(sql) → { nivel: 'aditiva'|'warn'|'destrutiva', motivos }
//      Olha SÓ o nível TOP-LEVEL. Um TOKENIZER excisa comentários, literais de string e
//      corpos dollar-quoted ($$…$$, $tag$…$tag$) ANTES de casar os padrões — porque
//      UPDATE/DELETE/DROP no CORPO de um CREATE FUNCTION é comportamento de RUNTIME, não
//      muda schema/dado no `db push` (era o falso-positivo de 0150/0153/0154). FALHA
//      FECHADA (→ destrutiva) em ambiguidade (corpo/comentário/string não fechado): nunca
//      deixar um DROP real escapar como aditivo. (M2)
//  • confirmaDestrutivaEOF(isTTY, resposta) → boolean
//      !isTTY (headless/pipe/EOF) → false SEMPRE: inverte o default do CLI (que PROSSEGUE =
//      fail-open). Num TTY, só resposta afirmativa explícita confirma. (M1)

const AFIRMATIVO = /^(y|s|sim|aplicar)$/i

/** Confirmação de migration DESTRUTIVA. EOF/headless NUNCA confirma; TTY exige resposta explícita. */
export function confirmaDestrutivaEOF(isTTY, resposta) {
  if (!isTTY) return false
  return AFIRMATIVO.test(String(resposta ?? '').trim())
}

// ── TOKENIZER: varre char-a-char, emitindo só o texto TOP-LEVEL (fora de comentário, string
// e corpo dollar-quoted). Tags custom/aninhadas: escaneia até a tag de FECHAMENTO EXATA
// (dollar-quote do Postgres não interpreta nada no meio do corpo). Estado não fechado ao
// fim → ambiguo=true (falha fechada). ──
export function limparTopLevel(sql) {
  const s = String(sql)
  const n = s.length
  let out = ''
  let i = 0
  let ambiguo = false

  // Abertura de dollar-quote em `pos`? Retorna a tag completa ("$$" ou "$nome$") ou null.
  // Tag = vazia, ou identificador (começa com letra/_). Assim `$1` (placeholder) NÃO casa.
  const matchDollar = pos => {
    if (s[pos] !== '$') return null
    let j = pos + 1
    if (s[j] === '$') return '$$'
    if (!/[A-Za-z_]/.test(s[j] ?? '')) return null
    j++
    while (j < n && /[A-Za-z0-9_]/.test(s[j])) j++
    return s[j] === '$' ? s.slice(pos, j + 1) : null
  }

  while (i < n) {
    const c = s[i]
    const c2 = s[i + 1]

    if (c === '-' && c2 === '-') {            // comentário de linha
      i += 2
      while (i < n && s[i] !== '\n') i++
      continue
    }
    if (c === '/' && c2 === '*') {            // comentário de bloco (Postgres ANINHA)
      i += 2
      let depth = 1
      while (i < n && depth > 0) {
        if (s[i] === '/' && s[i + 1] === '*') { depth++; i += 2 }
        else if (s[i] === '*' && s[i + 1] === '/') { depth--; i += 2 }
        else i++
      }
      if (depth > 0) { ambiguo = true; break }
      out += ' '
      continue
    }
    if (c === "'") {                          // string '...'  ('' = aspa escapada)
      i++
      let fechou = false
      while (i < n) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") { i += 2; continue }
          i++; fechou = true; break
        }
        i++
      }
      if (!fechou) { ambiguo = true; break }
      out += ' '
      continue
    }
    const abre = matchDollar(i)               // corpo dollar-quoted $tag$ … $tag$
    if (abre) {
      i += abre.length
      const fim = s.indexOf(abre, i)
      if (fim === -1) { ambiguo = true; break }
      i = fim + abre.length
      out += ' '
      continue
    }
    out += c                                  // top-level
    i++
  }

  return { texto: out, ambiguo }
}

// Padrões DESTRUTIVOS reais (top-level): destroem schema/dado no apply.
const DESTRUTIVO = [
  /\bTRUNCATE\b/i,
  /\bDROP\s+(TABLE|COLUMN|SCHEMA|VIEW|MATERIALIZED\s+VIEW|INDEX|TYPE|TRIGGER|POLICY|SEQUENCE|DATABASE)\b/i,
  /\bALTER\s+TABLE\b[\s\S]*\bDROP\b/i,   // ALTER TABLE ... DROP COLUMN/CONSTRAINT (no mesmo statement)
  /\bUPDATE\s+\w/i,                       // UPDATE de dado existente (top-level)
  /\bDELETE\s+FROM\b/i,                   // DELETE de dado existente (top-level)
]
// Troca de ASSINATURA de RPC: não é perda de dado, mas merece um olhar humano.
const WARN = [/\bDROP\s+(FUNCTION|PROCEDURE|ROUTINE|AGGREGATE)\b/i]

function classificarStatement(st) {
  if (DESTRUTIVO.some(re => re.test(st))) return 'destrutiva'
  if (WARN.some(re => re.test(st))) return 'warn'
  return 'aditiva'
}

const resumo = st => st.trim().replace(/\s+/g, ' ').slice(0, 70)

/** Classifica uma migration. Precedência: destrutiva > warn > aditiva. Falha fechada em ambiguidade. */
export function classificarSql(sql) {
  const { texto, ambiguo } = limparTopLevel(sql)
  if (ambiguo) {
    return { nivel: 'destrutiva', motivos: ['tokenizer: corpo $$ / comentário / string não fechado → falha fechada'] }
  }
  let nivel = 'aditiva'
  const motivos = []
  for (const st of texto.split(';')) {
    const c = classificarStatement(st)
    if (c === 'destrutiva') return { nivel: 'destrutiva', motivos: [...motivos, `top-level destrutivo: ${resumo(st)}`] }
    if (c === 'warn') { nivel = 'warn'; motivos.push(`troca de assinatura: ${resumo(st)}`) }
  }
  return { nivel, motivos }
}
