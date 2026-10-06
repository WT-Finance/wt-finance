import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toNum } from '@/lib/carga/coercao'
import { fmtValor, vencida, fmtDataBR, hojeSP, casaBuscaSolicitacao, maisRecentePrimeiro, valorNumericoCanonico, previaValorNumerico, normalizarRespostasNumericas, REGEX_NUMERICO_BANCO } from './format'
import type { Solicitacao } from './schemas'

// Cobre a coerção/limite de Solicitações (v4.17.0 / Balde 2). fmtValor agora usa o
// toNum canônico; vencida é date-only em fuso de São Paulo.

type Resposta = Parameters<typeof fmtValor>[0]
const r = (tipo_campo: string, valor: string | null): Resposta =>
  ({ campo_id: 1, rotulo: 'X', tipo_campo, valor } as unknown as Resposta)

describe('fmtValor — moeda via toNum canônico', () => {
  it('BR milhar+decimal e milhar puro', () => {
    expect(fmtValor(r('moeda', '8.840,00'))).toBe('R$ 8.840,00')
    expect(fmtValor(r('moeda', '1.234,56'))).toBe('R$ 1.234,56')
    expect(fmtValor(r('moeda', '12.345'))).toBe('R$ 12.345,00') // milhar puro → 12345
  })
  it('decimal US e fallback', () => {
    expect(fmtValor(r('moeda', '12.34'))).toBe('R$ 12,34')
    expect(fmtValor(r('moeda', 'abc'))).toBe('abc') // não-numérico → cru
    expect(fmtValor(r('moeda', null))).toBe('—')
  })
  it('data e texto', () => {
    expect(fmtValor(r('data', '2026-06-08'))).toBe('08/06/2026')
    expect(fmtValor(r('texto_curto', 'oi'))).toBe('oi')
  })
})

describe('fmtDataBR — sem deslocar o dia', () => {
  it('ISO e timestamptz → DD/MM/AAAA', () => {
    expect(fmtDataBR('2026-06-08')).toBe('08/06/2026')
    expect(fmtDataBR('2026-06-08T23:30:00+00:00')).toBe('08/06/2026') // date-only (slice 10)
    expect(fmtDataBR(null)).toBe('—')
  })
})

describe('vencida — date-only, fuso de São Paulo, cruzando o limite', () => {
  afterEach(() => vi.useRealTimers())

  it('hoje (SP) é a data local de SP, não a UTC', () => {
    // 2026-06-13T02:00Z = 2026-06-12 23:00 em São Paulo (UTC-3) → hoje = dia 12
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-13T02:00:00Z'))
    expect(hojeSP()).toBe('2026-06-12')
    // limite no dia 12 NÃO está vencido ainda (ainda é dia 12 em SP)
    expect(vencida('2026-06-12', 'aberta')).toBe(false)
    expect(vencida('2026-06-11', 'aberta')).toBe(true)
  })

  it('limite cruza para vencido quando a data-limite < hoje (SP)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-13T12:00:00Z')) // SP = dia 13, 09:00
    expect(hojeSP()).toBe('2026-06-13')
    expect(vencida('2026-06-12', 'aberta')).toBe(true)  // ontem → vencida
    expect(vencida('2026-06-13', 'aberta')).toBe(false) // vence hoje → ainda não
    expect(vencida('2026-06-14', 'aberta')).toBe(false) // futuro
  })

  it('só conta como vencida se ABERTA', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    expect(vencida('2026-06-01', 'concluida')).toBe(false)
    expect(vencida('2026-06-01', 'cancelada')).toBe(false)
    expect(vencida('2026-06-01', 'rejeitada')).toBe(false)
  })
})

// ── Busca e ordem das listas (v5.7.2) ─────────────────────────────────────────
function sol(over: Partial<Solicitacao>): Solicitacao {
  return { id: 1, solicitante_email: 'a@x.com', criado_em: '2026-08-01T10:00:00Z', ...over } as Solicitacao
}

describe('casaBuscaSolicitacao — por número OU e-mail do solicitante', () => {
  const s = sol({ id: 1068, solicitante_email: 'kissia@welcometrips.com.br' })

  it('termo vazio ou só espaços não filtra nada', () => {
    expect(casaBuscaSolicitacao(s, '')).toBe(true)
    expect(casaBuscaSolicitacao(s, '   ')).toBe(true)
  })

  it('acha pelo número, com e sem "#", inclusive parcial', () => {
    expect(casaBuscaSolicitacao(s, '1068')).toBe(true)
    expect(casaBuscaSolicitacao(s, '#1068')).toBe(true)
    expect(casaBuscaSolicitacao(s, '106')).toBe(true)   // parcial
    expect(casaBuscaSolicitacao(s, '068')).toBe(true)   // parcial no meio
    expect(casaBuscaSolicitacao(s, '2222')).toBe(false)
  })

  it('acha pelo e-mail, sem diferenciar maiúsculas', () => {
    expect(casaBuscaSolicitacao(s, 'kissia')).toBe(true)
    expect(casaBuscaSolicitacao(s, 'KISSIA')).toBe(true)
    expect(casaBuscaSolicitacao(s, 'welcometrips')).toBe(true)
    expect(casaBuscaSolicitacao(s, 'outro@')).toBe(false)
  })

  // ⚠️ REGRESSÃO: a primeira versão extraía os dígitos de QUALQUER termo
  // (`termo.replace(/\D+/g,'')`), então buscar um e-mail que contém números também casava
  // por id — "ana2024@x.com" trazia de brinde a solicitação #2024. A busca por número só
  // acontece quando o termo INTEIRO é uma referência numérica.
  it('e-mail com dígitos NÃO vira busca por número', () => {
    const outra = sol({ id: 2024, solicitante_email: 'zzz@x.com' })
    expect(casaBuscaSolicitacao(outra, 'ana2024@x.com')).toBe(false)
    expect(casaBuscaSolicitacao(outra, '2024')).toBe(true)      // aí sim
  })

  it('e-mail nulo não quebra', () => {
    expect(casaBuscaSolicitacao(sol({ id: 7, solicitante_email: null }), 'qualquer')).toBe(false)
    expect(casaBuscaSolicitacao(sol({ id: 7, solicitante_email: null }), '7')).toBe(true)
  })
})

describe('maisRecentePrimeiro — data de CRIAÇÃO, decrescente', () => {
  it('ordena do mais recente para o mais antigo', () => {
    const lista = [
      sol({ id: 1, criado_em: '2026-08-01T10:00:00Z' }),
      sol({ id: 2, criado_em: '2026-08-24T09:00:00Z' }),
      sol({ id: 3, criado_em: '2026-08-10T23:59:00Z' }),
    ]
    expect([...lista].sort(maisRecentePrimeiro).map(s => s.id)).toEqual([2, 3, 1])
  })

  it('desempata de forma estável quando o instante é idêntico', () => {
    const lista = [
      sol({ id: 1, criado_em: '2026-08-01T10:00:00Z' }),
      sol({ id: 2, criado_em: '2026-08-01T10:00:00Z' }),
    ]
    expect([...lista].sort(maisRecentePrimeiro).map(s => s.id)).toEqual([1, 2])
  })
})

// ── v6.2.1 — valor digitado em numero/moeda → forma canônica aceita pelo banco ────────────
//
// O regex vem do SQL, não de uma cópia: `app.solic_validar_e_snapshotar` (0212) é quem
// recusa — conferido contra o catálogo de produção em 06/10/2026. ⚠️ Se uma migration futura
// redefinir essa função, APONTE `SQL_VALIDACAO` para ela (mesma ressalva do
// ciclo-de-vida.test.ts: migration aplicada é imutável e este teste leria a antiga).
const SQL_VALIDACAO = readFileSync(resolve(__dirname, '../../../supabase/migrations/0212_api_validacao_compartilhada.sql'), 'utf8')
const regexBanco = (() => {
  const m = /tipo_campo IN \('numero','moeda'\) AND v_val !~ '([^']+)'/.exec(SQL_VALIDACAO)
  if (!m) throw new Error('regex de numero/moeda não encontrado na 0212')
  return new RegExp(m[1])
})()

describe('valorNumericoCanonico — o que a tela manda o banco aceita', () => {
  const casos: [string, string][] = [
    ['1.234,56', '1234,56'],       // o caso do bug: milhar + decimal (o banco recusava)
    ['R$ 1.234,56', '1234,56'],
    ['1234,56', '1234,56'],
    ['1234.56', '1234,56'],        // decimal US
    ['1,234.56', '1234,56'],       // milhar US
    ['1200', '1200,00'],
    ['1.318', '1318,00'],          // milhar BR puro — a leitura que a prévia deixa à vista
    ['10.000,00', '10000,00'],
    ['0,5', '0,50'],
    ['-50,25', '-50,25'],
  ]
  it('o regex do banco recusa o formato que motivou o patch (prova de que a sonda lê a regra certa)', () => {
    expect('1.234,56').not.toMatch(regexBanco)
    expect('1234,56').toMatch(regexBanco)
  })

  it('o espelho TS do regex (REGEX_NUMERICO_BANCO) é idêntico ao do SQL', () => {
    expect(REGEX_NUMERICO_BANCO.source).toBe(regexBanco.source)
  })

  it.each(casos)('moeda %s → %s', (digitado, esperado) => {
    const c = valorNumericoCanonico('moeda', digitado)
    expect(c).toBe(esperado)
    expect(c).toMatch(regexBanco)
  })

  it('moeda arredonda a 2 casas pela regra do toCentavos (meio para longe de zero)', () => {
    expect(valorNumericoCanonico('moeda', '0.1250')).toBe('0,13')
    expect(valorNumericoCanonico('moeda', '-0.1250')).toBe('-0,13')
    expect(valorNumericoCanonico('moeda', '1.0055')).toBe('1,01')
  })

  it('numero que o banco JÁ aceita vai como digitado (identificador e medida não são reinterpretados)', () => {
    expect(valorNumericoCanonico('numero', '3')).toBe('3')                 // não vira 3,00
    expect(valorNumericoCanonico('numero', '1,5')).toBe('1,5')
    expect(valorNumericoCanonico('numero', '000123')).toBe('000123')       // zero à esquerda fica
    expect(valorNumericoCanonico('numero', '2.500')).toBe('2.500')         // não vira 2500
    expect(valorNumericoCanonico('numero', ' 42 ')).toBe('42')
  })

  it('numero que o banco recusaria passa pelo toNum', () => {
    expect(valorNumericoCanonico('numero', '1.234,5')).toBe('1234,5')
    expect(valorNumericoCanonico('numero', '1.234.567')).toBe('1234567')
    for (const d of ['1.234,5', '1.234.567', '-2']) expect(valorNumericoCanonico('numero', d)).toMatch(regexBanco)
  })

  it('magnitude além do inteiro seguro é recusada (sem "1e+23,00" nem dígito perdido)', () => {
    expect(valorNumericoCanonico('moeda', '9'.repeat(22))).toBeNull()
    expect(valorNumericoCanonico('moeda', '9'.repeat(17))).toBeNull()
    expect(valorNumericoCanonico('numero', '9'.repeat(17) + ',5')).toBe('9'.repeat(17) + ',5')   // já aceito: texto, sem perda
    expect(valorNumericoCanonico('numero', '9.999.999.999.999.999.999,5')).toBeNull()             // precisaria do toNum: recusa
    expect(valorNumericoCanonico('moeda', '1.000.000.000,00')).toBe('1000000000,00')
  })

  it('o que não dá para ler devolve null (a tela avisa, sem ir ao banco)', () => {
    for (const d of ['', '-', '.', 'abc', '1.2.3,4,5', '1e999']) {
      expect(valorNumericoCanonico('moeda', d)).toBeNull()
      expect(valorNumericoCanonico('numero', d)).toBeNull()
    }
  })

  it('ida e volta: o canônico é lido de volta como o MESMO número que foi digitado', () => {
    for (const [digitado] of casos) {
      const c = valorNumericoCanonico('moeda', digitado)!
      expect(toNum(c)).toBe(toNum(digitado))
    }
  })
})

describe('previaValorNumerico — o que a tela mostra abaixo do campo', () => {
  it('é o mesmo texto que o drawer vai exibir depois de gravado', () => {
    expect(previaValorNumerico('moeda', '1.318')?.replace(/\s/g, ' ')).toBe('R$ 1.318,00')
    expect(previaValorNumerico('moeda', '1.234,56')?.replace(/\s/g, ' ')).toBe('R$ 1.234,56')
    expect(previaValorNumerico('moeda', '1.234,56')).toBe(fmtValor(r('moeda', '1234,56')))
    expect(previaValorNumerico('numero', '1,5')).toBe('1,5')
    expect(previaValorNumerico('moeda', 'abc')).toBeNull()
  })
})

describe('normalizarRespostasNumericas — o envio do modal', () => {
  const campos = [
    { id: 10, rotulo: 'Valor', tipo_campo: 'moeda' },
    { id: 11, rotulo: 'Parcelas', tipo_campo: 'numero' },
    { id: 12, rotulo: 'Fornecedor', tipo_campo: 'texto_curto' },
  ]
  it('normaliza moeda/numero e deixa o resto intacto', () => {
    const r = normalizarRespostasNumericas(campos, { '10': '1.234,56', '11': '3', '12': '1.234,56' })
    expect(r).toEqual({ ok: true, respostas: { '10': '1234,56', '11': '3', '12': '1.234,56' } })
  })
  it('campo vazio fica como está (obrigatório é do servidor)', () => {
    expect(normalizarRespostasNumericas(campos, { '10': '' })).toEqual({ ok: true, respostas: { '10': '' } })
  })
  it('valor ilegível devolve o RÓTULO do campo', () => {
    expect(normalizarRespostasNumericas(campos, { '10': '-', '11': '2' })).toEqual({ ok: false, rotulo: 'Valor' })
  })
})
