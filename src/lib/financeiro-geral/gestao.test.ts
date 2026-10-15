import { describe, expect, it } from 'vitest'
import { fmtBRL2 } from '@/lib/fmt'
import {
  centavosParaReais, dataIsoValida, descontoEmCentavos, descontoFormatado, lerValorDigitado,
  podeDesfazerEntrada, podeGerirAntecipacoes, registroDaEntrada, rotuloOperacao,
  traduzirErroAntecipacao, validarFormulario,
} from './gestao'
import { antecipacaoHistoricoSchema, antecipacaoListarSchema, salvarAntecipacaoSchema } from './schemas'

describe('podeGerirAntecipacoes — só a gestão vê o botão', () => {
  it('quem só tem financeiro/geral NÃO vê; a gestão vê', () => {
    expect(podeGerirAntecipacoes(['financeiro/geral'])).toBe(false)
    expect(podeGerirAntecipacoes(['financeiro/geral', 'financeiro/geral/gestao'])).toBe(true)
    expect(podeGerirAntecipacoes(['financeiro/fluxo-caixa', 'admin/acessos'])).toBe(false)
    expect(podeGerirAntecipacoes([])).toBe(false)
  })
})

describe('lerValorDigitado — pt-BR normalizado no envio (padrão v6.2.1, toNum canônico)', () => {
  it.each([
    ['1.234,56', 123456],
    ['R$ 1.234,56', 123456],
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['1.234', 123400],
    ['100', 10000],
    ['0,01', 1],
    ['7.245.412,45', 724541245],
    ['  50,5 ', 5050],
  ])('%s → %i centavos', (txt, c) => {
    expect(lerValorDigitado(txt)).toEqual({ ok: true, centavos: c })
  })

  it('recusa o que o banco recusaria: vazio, ilegível, ≤ 0, mais de 2 casas', () => {
    expect(lerValorDigitado('')).toEqual({ ok: false, motivo: 'vazio' })
    expect(lerValorDigitado('   ')).toEqual({ ok: false, motivo: 'vazio' })
    expect(lerValorDigitado('abc')).toEqual({ ok: false, motivo: 'ilegivel' })
    expect(lerValorDigitado('0')).toEqual({ ok: false, motivo: 'nao-positivo' })
    expect(lerValorDigitado('-10,00')).toEqual({ ok: false, motivo: 'nao-positivo' })
    expect(lerValorDigitado('10.005')).toMatchObject({ ok: true }) // "10.005" é milhar BR = 10005, não 3 casas
    expect(lerValorDigitado('10,005')).toEqual({ ok: false, motivo: 'casas' })
    expect(lerValorDigitado('10.5555')).toEqual({ ok: false, motivo: 'casas' })
  })

  it('"100,555" NÃO vira 100.555 (milhar US): uma 3ª casa sem querer não multiplica o valor por 1000', () => {
    expect(lerValorDigitado('100,555')).toEqual({ ok: false, motivo: 'casas' })
  })

  it('centavos → reais exatos (sem ruído de ponto flutuante na serialização)', () => {
    expect(centavosParaReais(123456)).toBe(1234.56)
    expect(String(centavosParaReais(1))).toBe('0.01')
    expect(String(centavosParaReais(724541245))).toBe('7245412.45')
  })
})

describe('desconto DERIVADO (antecipado − líquido), nunca digitado', () => {
  it('calcula em centavos e formata', () => {
    expect(descontoEmCentavos('1.000,00', '970,50')).toBe(2950)
    expect(descontoFormatado('1.000,00', '970,50')).toBe(fmtBRL2(29.5))
  })
  it('sem valor legível ou líquido > antecipado → null (o banco recusaria)', () => {
    expect(descontoEmCentavos('', '10')).toBeNull()
    expect(descontoEmCentavos('100', 'x')).toBeNull()
    expect(descontoEmCentavos('100', '100,01')).toBeNull()
    expect(descontoFormatado('100', '100,01')).toBeNull()
  })
  it('líquido = antecipado → desconto zero (válido)', () => {
    expect(descontoEmCentavos('100', '100')).toBe(0)
  })
})

describe('dataIsoValida', () => {
  it('calendário real', () => {
    expect(dataIsoValida('2026-10-15')).toBe(true)
    expect(dataIsoValida('2024-02-29')).toBe(true)
    expect(dataIsoValida('2026-02-29')).toBe(false)
    expect(dataIsoValida('2026-13-01')).toBe(false)
    expect(dataIsoValida('15/10/2026')).toBe(false)
    expect(dataIsoValida('')).toBe(false)
  })
})

describe('validarFormulario', () => {
  const HOJE = '2026-10-15'
  const bom = { contaId: '1', data: '2026-10-05', valorAntecipado: '10.000,00', valorLiquido: '9.700,00' }

  it('formulário certo → entrada em reais numéricos e id numérico', () => {
    expect(validarFormulario(bom, HOJE)).toEqual({
      ok: true,
      entrada: { contaId: 1, data: '2026-10-05', valorAntecipado: 10000, valorLiquido: 9700 },
    })
  })
  it('data de hoje passa; futura não; inválida não; anterior ao piso não', () => {
    expect(validarFormulario({ ...bom, data: HOJE }, HOJE).ok).toBe(true)
    expect(validarFormulario({ ...bom, data: '2026-10-16' }, HOJE)).toEqual({ ok: false, erro: 'A data não pode ser futura.' })
    expect(validarFormulario({ ...bom, data: '' }, HOJE).ok).toBe(false)
    expect(validarFormulario({ ...bom, data: '1999-12-31' }, HOJE).ok).toBe(false)
  })
  it('conta obrigatória', () => {
    expect(validarFormulario({ ...bom, contaId: '' }, HOJE)).toEqual({ ok: false, erro: 'Escolha a conta.' })
    expect(validarFormulario({ ...bom, contaId: 'x' }, HOJE).ok).toBe(false)
  })
  it('nomeia o campo do valor ruim', () => {
    const a = validarFormulario({ ...bom, valorAntecipado: '' }, HOJE)
    expect(a.ok === false && a.erro).toMatch(/^Valor antecipado:/)
    const l = validarFormulario({ ...bom, valorLiquido: '0' }, HOJE)
    expect(l.ok === false && l.erro).toMatch(/^Valor líquido:/)
  })
  it('líquido maior que o antecipado é recusado', () => {
    expect(validarFormulario({ ...bom, valorLiquido: '10.000,01' }, HOJE))
      .toEqual({ ok: false, erro: 'O valor líquido não pode passar do valor antecipado.' })
  })
})

describe('traduzirErroAntecipacao — "CODIGO: texto" vira só o texto', () => {
  it('códigos de negócio da 0296', () => {
    expect(traduzirErroAntecipacao('ANTECIPACAO_VALOR_INVALIDO: o valor líquido não pode passar do antecipado'))
      .toEqual({ texto: 'o valor líquido não pode passar do antecipado', conhecido: true })
    expect(traduzirErroAntecipacao('ANTECIPACAO_DATA_INVALIDA: a data não pode ser futura').texto).toBe('a data não pode ser futura')
    expect(traduzirErroAntecipacao('ANTECIPACAO_INEXISTENTE: registro 9 não existe').conhecido).toBe(true)
    // só o PRIMEIRO ': ' separa — o texto pode ter outros
    expect(traduzirErroAntecipacao('ANTECIPACAO_CONTA_INVALIDA: conta: 7 inativa').texto).toBe('conta: 7 inativa')
  })
  it('conflito do desfazer vem sem prefixo e passa inteiro', () => {
    const msg = 'Conflito ao desfazer: o registro mudou depois. Recarregue e tente de novo.'
    expect(traduzirErroAntecipacao(msg)).toEqual({ texto: msg, conhecido: true })
  })
  it('exigir_acesso', () => {
    expect(traduzirErroAntecipacao('PERMISSAO_NEGADA').conhecido).toBe(true)
    expect(traduzirErroAntecipacao('USUARIO_INATIVO').conhecido).toBe(true)
    expect(traduzirErroAntecipacao('AUTH_NECESSARIA').conhecido).toBe(true)
  })
  it('o que ninguém previu vira frase genérica E é marcado como desconhecido (a action loga)', () => {
    const r = traduzirErroAntecipacao('relation "financeiro.antecipacao" does not exist')
    expect(r.conhecido).toBe(false)
    expect(r.texto).not.toMatch(/relation/)
  })
})

describe('histórico', () => {
  const reg = { conta_id: 1, conta: 'Asaas', data: '2026-10-05', valor_antecipado: 100, valor_liquido: 97, desconto: 3 }
  it('rótulos por operação e o desfazer tem rótulo próprio', () => {
    expect(rotuloOperacao({ operacao: 'I', e_desfazer: false })).toBe('Registrou')
    expect(rotuloOperacao({ operacao: 'U', e_desfazer: false })).toBe('Alterou')
    expect(rotuloOperacao({ operacao: 'D', e_desfazer: false })).toBe('Excluiu')
    expect(rotuloOperacao({ operacao: 'D', e_desfazer: true })).toBe('Desfez (excluiu)')
    expect(rotuloOperacao({ operacao: '?', e_desfazer: false })).toBe('Mexeu em')
  })
  it('não se desfaz um desfazer', () => {
    expect(podeDesfazerEntrada({ e_desfazer: false })).toBe(true)
    expect(podeDesfazerEntrada({ e_desfazer: true })).toBe(false)
  })
  it('o registro descrito é o de DEPOIS (insert/update) ou o de ANTES (delete)', () => {
    expect(registroDaEntrada({ antes: null, depois: reg })).toEqual(reg)
    expect(registroDaEntrada({ antes: reg, depois: null })).toEqual(reg)
    expect(registroDaEntrada({ antes: null, depois: null })).toBeNull()
  })
})

describe('contrato da 0296 nos schemas', () => {
  const registro = {
    id: 5, conta_id: 1, conta: 'Asaas', data: '2026-10-05', valor_antecipado: 100, valor_liquido: 97, desconto: 3,
    atualizado_em: '2026-10-15T10:00:00-03:00',
  }
  it('antecipacao_salvar: formato do coordenador (chave extra tolerada)', () => {
    const r = salvarAntecipacaoSchema.safeParse({ ok: true, id: 5, criada: true, alterada: true, registro, extra: 1 })
    expect(r.success).toBe(true)
    expect(salvarAntecipacaoSchema.safeParse({ ok: true, id: 5, criada: false, alterada: false, registro }).success).toBe(true)
    expect(salvarAntecipacaoSchema.safeParse({ ok: true, id: 5 }).success).toBe(false)
  })
  it('antecipacao_listar: arrays NULL viram []', () => {
    expect(antecipacaoListarSchema.parse({ contas: null, registros: null })).toEqual({ contas: [], registros: [] })
    expect(antecipacaoListarSchema.safeParse({ contas: [{ id: 1, nome: 'Asaas' }], registros: [registro] }).success).toBe(true)
  })
  it('antecipacao_historico: array de entradas, NULL → []', () => {
    const entrada = {
      diario_id: 10, operacao: 'I', registro_id: 5, usuario_nome: 'Alguém', quando: '2026-10-15T10:00:00-03:00',
      e_desfazer: false, antes: null, depois: { conta_id: 1, conta: 'Asaas', data: '2026-10-05', valor_antecipado: 100, valor_liquido: 97, desconto: 3 },
    }
    expect(antecipacaoHistoricoSchema.parse([entrada])).toHaveLength(1)
    expect(antecipacaoHistoricoSchema.parse(null)).toEqual([])
    expect(antecipacaoHistoricoSchema.safeParse([{ ...entrada, usuario_nome: null, registro_id: null }]).success).toBe(true)
  })
})
