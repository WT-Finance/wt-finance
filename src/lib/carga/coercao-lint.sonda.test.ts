import { RuleTester } from 'eslint'
import tsParser from '@typescript-eslint/parser'
import { afterAll, describe, it } from 'vitest'
// A MESMA regra carregada pelo eslint.config.mjs. É um .mjs sem .d.ts: o allowJs infere
// o shape; castamos no uso onde o tipo RuleDefinition do ESLint é exigido.
import rule from '../../../eslint-rules/no-coercao-reimpl.mjs'

// SONDA da regra wt/no-coercao-reimpl (v4.27/M3, ADR-0130). Prova que a regra DISPARA
// no padrão do bug de coerção e NÃO dispara nos casos benignos que o briefing lista
// (parseInt(...,10), Number(e.target.value), toFixed().replace, sanitizador de <input>).
// É o mesmo papel do tokens.test.ts/sonda do no-cor-hardcoded: o lint só vale se a sonda
// provar o limite. A isenção de coercao.ts/test/email é de CONFIG (files: override),
// provada pelo `npm run lint` verde do projeto — não pela sonda (que testa a regra crua).

// Integra o RuleTester ao runner do vitest (describe/it). Os setters estáticos não estão
// no tipo público do RuleTester → view castada para a MESMA referência.
const RT = RuleTester as unknown as {
  afterAll: typeof afterAll
  describe: typeof describe
  it: typeof it
  itOnly: typeof it.only
}
RT.afterAll = afterAll
RT.describe = describe
RT.it = it
RT.itOnly = it.only

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

ruleTester.run('wt/no-coercao-reimpl', rule as Parameters<typeof ruleTester.run>[1], {
  valid: [
    // parseInt COM radix: índice/contagem, não coerção de dinheiro (27/27 benignos).
    { code: 'const n = parseInt(s, 10)' },
    // Number(e.target.value): leitura de <input type=number>, sem replace de separador.
    { code: 'const n = Number(e.target.value)' },
    // toFixed().replace('.', ','): direção STRING (exibição), função retorna string.
    { code: "const editStr = (v: number): string => v.toFixed(2).replace('.', ',')" },
    // sanitizador de input: regex de separador, mas alimenta um setter (não Number) e
    // a função não retorna number — direção STRING.
    { code: "const limpar = (v: string) => set(v.replace(/[^\\d.,-]/g, ''))" },
    // formatador com nome de coerção MAS *BRL* → excluído (formata, não coage).
    { code: "function toValorBRL(n: number): string { return 'R$' + n }" },
    // parse com nome NÃO-numérico (tipo/vencimento): fora do alvo.
    { code: 'function parseTipo(s: string) { return s }' },
    // replace de separador NÃO-numérico (':' → 'h'): nem candidato.
    { code: "const t = d.replace(':', 'h')" },
    // replace de separador SEM direção número (rótulo): cirúrgico, não dispara.
    { code: "const label = s.replace(',', '.')" },
  ],
  invalid: [
    // (1) parseFloat em qualquer lugar.
    { code: 'const n = parseFloat(x)', errors: [{ messageId: 'parseFloat' }] },
    // (2) replace de separador alimentando Number().
    { code: "const n = Number(s.replace(',', '.'))", errors: [{ messageId: 'replaceSeparador' }] },
    // (2) cadeia de replaces alimentando Number() — dispara em cada replace.
    {
      code: "const n = Number(s.replace(/\\./g, '').replace(',', '.'))",
      errors: [{ messageId: 'replaceSeparador' }, { messageId: 'replaceSeparador' }],
    },
    // (2) guard 'direção número' por TIPO DE RETORNO: replace não está dentro de Number,
    // mas a função retorna number → coerção.
    {
      code: "function h(s: string): number { const t = s.replace(',', '.'); return Number(t) }",
      errors: [{ messageId: 'replaceSeparador' }],
    },
    // (3) função com nome de coerção fora de coercao.ts.
    { code: 'function toNumero(v: unknown) { return v }', errors: [{ messageId: 'nomeCoercao' }] },
    // (3) const-função com nome de coerção.
    { code: 'const parseValor = (v: unknown) => v', errors: [{ messageId: 'nomeCoercao' }] },
  ],
})
