// Regra wt/no-coercao-reimpl (v4.27, ADR-0130). Irmã das wt/no-cor-hardcoded (v4.26) e
// wt/no-tailwind-var-shorthand (v4.17): operacionaliza com ENFORCEMENT a convenção do
// CLAUDE.md "NUNCA reimplementar coerção de número fora de @/lib/carga/coercao.ts".
// Origem: o bug crítico do saldo v4.23.1 — um parseNum local com replace(/\./g,'')
// multiplicou saldos por ~100, silenciosamente. É uma regra de AST (não regex de
// className como as duas irmãs). Mira 3 SINAIS FORTES, FORA de coercao.ts:
//
//   (1) parseFloat(...)  — 1 vetor de coerção de dinheiro, 100% sinal (o toNumStr de
//       Vendas era o único, removido na v4.27/M1);
//   (2) .replace(<separador numérico>) NA DIREÇÃO NÚMERO — i.e., alimentando
//       Number()/parseFloat() OU dentro de função que retorna `number`. O guard
//       'direção número' é o que EVITA o falso-positivo do sanitizador de <input>
//       (.replace(/[^\d.,-]/g,'') que volta string) e do toFixed().replace (saída/
//       formatação, direção STRING);
//   (3) DEFINIR função/const com NOME de coerção (/^(to|para|parse).*(num|valor|money|
//       reais|float|decimal)/i), excluindo formatadores (*BRL*/*format*) — fecha o
//       vetor de ENTRADA de um 2º parser (o parseValorMonetario, removido na v4.27/M2).
//
// CIRÚRGICA, não ampliada: NÃO mira parseInt(...,10) (índice/contagem), unário + (datas),
// nem Number() por nome (os ~6 de <input type=number> são corretos). Isenções via
// `files:` override no eslint.config.mjs: coercao.ts (a implementação), **/*.test.ts,
// src/lib/email/**. Provada pela sonda em src/lib/carga/coercao-lint.sonda.test.ts.

const NOME_COERCAO = /^(to|para|parse).*(num|valor|money|reais|float|decimal)/i
const NOME_FORMATADOR = /brl|format/i

// Tipo função (qualquer das três formas) — fronteira da subida do guard.
function ehFuncao(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  )
}

// A função declara retorno `number` (incl. união `number | null`)?
function retornaNumero(fnNode) {
  const ann = fnNode.returnType
  if (!ann || ann.type !== 'TSTypeAnnotation') return false
  return tipoTemNumber(ann.typeAnnotation)
}
function tipoTemNumber(t) {
  if (!t) return false
  if (t.type === 'TSNumberKeyword') return true
  if (t.type === 'TSUnionType') return t.types.some(tipoTemNumber)
  return false
}

// O 1º argumento do .replace mexe num SEPARADOR numérico? String ',' ou '.', ou regex
// que seja \. , , , ou uma classe NEGADA só de dígitos/ponto/vírgula/traço ([^\d.,-]).
function ehSeparadorArg(arg) {
  if (!arg || arg.type !== 'Literal') return false
  if (typeof arg.value === 'string') return arg.value === ',' || arg.value === '.'
  if (arg.regex) {
    const src = arg.regex.pattern
    return src === '\\.' || src === ',' || /^\[\^[\\d0-9.,\-]+\]$/.test(src)
  }
  return false
}

// Guard 'direção número': o resultado do .replace é consumido por Number()/parseFloat()
// (subindo a espinha de chamada até a fronteira da função), OU o .replace vive dentro de
// uma função que retorna number. Senão (setter, rótulo, toFixed→exibição) → NÃO é coerção.
function naDirecaoNumero(replaceNode) {
  let p = replaceNode.parent
  while (p) {
    if (ehFuncao(p)) return retornaNumero(p) // chegou na função sem passar por Number/parseFloat
    if (
      p.type === 'CallExpression' &&
      p.callee.type === 'Identifier' &&
      (p.callee.name === 'Number' || p.callee.name === 'parseFloat')
    ) {
      return true // o callee é Identifier puro → o replace só pode estar nos argumentos
    }
    p = p.parent
  }
  return false
}

function nomeDeCoercao(nome) {
  return NOME_COERCAO.test(nome) && !NOME_FORMATADOR.test(nome)
}

const regraNoCoercaoReimpl = {
  meta: {
    type: 'problem',
    schema: [],
    docs: {
      description:
        'Proíbe reimplementar coerção de número fora de @/lib/carga/coercao (parseFloat, replace de separador na direção número, função com nome de coerção). ADR-0130.',
    },
    messages: {
      parseFloat:
        'parseFloat é coerção de número fora do canônico. Use toNum de @/lib/carga/coercao.',
      replaceSeparador:
        'replace de separador numérico alimentando coerção (Number/parseFloat ou função :number). Use toNum de @/lib/carga/coercao.',
      nomeCoercao:
        'Função/const com nome de coerção numérica fora de @/lib/carga/coercao. Use/estenda o toNum canônico (ADR-0130), não reimplemente.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // (1) parseFloat(...)
        if (node.callee.type === 'Identifier' && node.callee.name === 'parseFloat') {
          context.report({ node, messageId: 'parseFloat' })
          return
        }
        // (2) <obj>.replace(<separador>, ...) na direção número
        if (
          node.callee.type === 'MemberExpression' &&
          !node.callee.computed &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'replace' &&
          node.arguments.length >= 1 &&
          ehSeparadorArg(node.arguments[0]) &&
          naDirecaoNumero(node)
        ) {
          context.report({ node, messageId: 'replaceSeparador' })
        }
      },
      // (3) declaração de função com nome de coerção
      FunctionDeclaration(node) {
        if (node.id && nomeDeCoercao(node.id.name)) {
          context.report({ node: node.id, messageId: 'nomeCoercao' })
        }
      },
      // (3) const/let = (arrow|function) com nome de coerção
      VariableDeclarator(node) {
        if (
          node.id.type === 'Identifier' &&
          node.init &&
          (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression') &&
          nomeDeCoercao(node.id.name)
        ) {
          context.report({ node: node.id, messageId: 'nomeCoercao' })
        }
      },
    }
  },
}

export default regraNoCoercaoReimpl
