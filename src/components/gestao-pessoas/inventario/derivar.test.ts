import { describe, it, expect } from 'vitest'
import {
  DESTINO_POR_TIPO, TIPOS_MOVIMENTACAO, derivarLinha, ehRetroativa, ordenarCronologico,
  rotuloDestino, rotuloOrigem, statusDaMovimentacao, tiposPermitidos, ultimaMovimentacao,
} from './derivar'
import type { AtivoFicha, Movimentacao, TipoMovimentacao } from './tipos'

// Guard do contrato "tipo → destino / status" da UI. Estas funções são o ESPELHO em TS do que
// a RPC `listar_ativos`/`detalhe_ativo` fará em SQL (M1): se o SQL mudar, estes casos têm de
// mudar junto — é aqui que a divergência entre as duas pontas aparece.

const FICHA: AtivoFicha = {
  id: 1, codigo: 'WG-0001', categoria_id: 1, categoria_nome: 'Informática',
  descricao: 'Notebook', numero_serie: null, fornecedor: null, data_aquisicao: null,
  valor_aquisicao: null, nota_fiscal: null, estado_conservacao: null, obs: null,
}

let seq = 0
function mov(p: Partial<Movimentacao> & { tipo: TipoMovimentacao; data_movimentacao: string }): Movimentacao {
  seq += 1
  return {
    id: seq, ativo_id: 1,
    area_destino_id: null, area_destino_nome: null,
    detentor_destino_id: null, detentor_destino_nome: null,
    destino_texto: null, motivo_baixa: null, obs: null,
    registrado_por_rotulo: 'Teste',
    criado_em: `${p.data_movimentacao}T12:00:00Z`,
    ...p,
  }
}

describe('statusDaMovimentacao — status sai da última movimentação', () => {
  const casos: Array<[TipoMovimentacao, string]> = [
    ['transferencia', 'em_uso'],
    ['retorno_manutencao', 'em_uso'],
    ['reativacao', 'em_uso'],
    ['devolucao_estoque', 'em_estoque'],
    ['envio_manutencao', 'em_manutencao'],
    ['emprestimo', 'emprestado'],
    ['baixa', 'baixado'],
  ]
  it.each(casos)('%s → %s', (tipo, esperado) => {
    expect(statusDaMovimentacao(mov({ tipo, data_movimentacao: '2026-01-01' }))).toBe(esperado)
  })

  // Decisão do Yan (10/08): um ativo PODE nascer direto no estoque. É o único tipo que ramifica.
  it('cadastro COM detentor → em uso', () => {
    expect(statusDaMovimentacao(mov({
      tipo: 'cadastro', data_movimentacao: '2026-01-01',
      area_destino_id: 1, area_destino_nome: 'Tecnologia',
      detentor_destino_id: 9, detentor_destino_nome: 'Ana',
    }))).toBe('em_uso')
  })
  it('cadastro SEM detentor → em estoque', () => {
    expect(statusDaMovimentacao(mov({
      tipo: 'cadastro', data_movimentacao: '2026-01-01',
      area_destino_id: 1, area_destino_nome: 'Tecnologia',
    }))).toBe('em_estoque')
  })
})

describe('ordenação e estado derivado', () => {
  it('movimentação RETROATIVA entra no meio da cadeia e o estado atual NÃO muda', () => {
    const abertura = mov({ tipo: 'cadastro', data_movimentacao: '2026-01-10', area_destino_nome: 'Financeiro', detentor_destino_nome: 'Ana' })
    const atual    = mov({ tipo: 'transferencia', data_movimentacao: '2026-06-01', area_destino_nome: 'Comercial', detentor_destino_nome: 'Bruno' })
    const semRetro = derivarLinha(FICHA, [abertura, atual])
    expect(semRetro.detentor_atual_nome).toBe('Bruno')

    // Registrada HOJE, com data de MARÇO: cai entre as duas, não no fim.
    const retroativa = mov({
      tipo: 'transferencia', data_movimentacao: '2026-03-15',
      area_destino_nome: 'Operações', detentor_destino_nome: 'Carla',
      criado_em: '2026-08-10T12:00:00Z',
    })
    const comRetro = derivarLinha(FICHA, [abertura, atual, retroativa])
    expect(comRetro.detentor_atual_nome).toBe('Bruno')
    expect(comRetro.area_atual_nome).toBe('Comercial')
    // ...e ela passa a ser a ORIGEM da transferência de junho.
    const ord = ordenarCronologico([abertura, atual, retroativa])
    expect(ord.map(m => m.data_movimentacao)).toEqual(['2026-01-10', '2026-03-15', '2026-06-01'])
    expect(rotuloOrigem(ord, 2)).toBe('Operações / Carla')
  })

  it('mesma data desempata por criado_em, nunca por ordem de chegada', () => {
    const a = mov({ tipo: 'transferencia', data_movimentacao: '2026-05-01', criado_em: '2026-05-01T18:00:00Z', detentor_destino_nome: 'Tarde' })
    const b = mov({ tipo: 'transferencia', data_movimentacao: '2026-05-01', criado_em: '2026-05-01T09:00:00Z', detentor_destino_nome: 'Manhã' })
    expect(ultimaMovimentacao([a, b])?.detentor_destino_nome).toBe('Tarde')
    expect(ultimaMovimentacao([b, a])?.detentor_destino_nome).toBe('Tarde')
  })

  it('devolução ao estoque deixa o ativo SEM detentor (travessão na lista, não erro)', () => {
    const linha = derivarLinha(FICHA, [
      mov({ tipo: 'cadastro', data_movimentacao: '2026-01-01', area_destino_nome: 'Financeiro', detentor_destino_nome: 'Ana' }),
      mov({ tipo: 'devolucao_estoque', data_movimentacao: '2026-04-01', area_destino_nome: 'Tecnologia' }),
    ])
    expect(linha.status).toBe('em_estoque')
    expect(linha.detentor_atual_nome).toBeNull()
    expect(linha.area_atual_nome).toBe('Tecnologia')
  })

  it('ativo sem movimentação é inalcançável, mas degrada sem quebrar', () => {
    const linha = derivarLinha(FICHA, [])
    expect(linha.status).toBe('em_estoque')
    expect(linha.ultima_movimentacao_em).toBeNull()
  })
})

describe('origem DERIVADA — nunca armazenada', () => {
  it('a primeira movimentação não tem origem; as seguintes herdam o destino da anterior', () => {
    const ord = ordenarCronologico([
      mov({ tipo: 'cadastro', data_movimentacao: '2026-01-01', area_destino_nome: 'Financeiro', detentor_destino_nome: 'Ana' }),
      mov({ tipo: 'envio_manutencao', data_movimentacao: '2026-02-01', destino_texto: 'TecnoService' }),
      mov({ tipo: 'retorno_manutencao', data_movimentacao: '2026-03-01', area_destino_nome: 'Financeiro', detentor_destino_nome: 'Ana' }),
    ])
    expect(rotuloOrigem(ord, 0)).toBeNull()
    expect(rotuloOrigem(ord, 1)).toBe('Financeiro / Ana')
    expect(rotuloOrigem(ord, 2)).toBe('TecnoService')
  })

  it('destino sem detentor que resulta em estoque diz "estoque" — "Tecnologia" sozinho esconderia', () => {
    expect(rotuloDestino(mov({ tipo: 'devolucao_estoque', data_movimentacao: '2026-01-01', area_destino_nome: 'Tecnologia' })))
      .toBe('Tecnologia · estoque')
    expect(rotuloDestino(mov({ tipo: 'cadastro', data_movimentacao: '2026-01-01', area_destino_nome: 'Tecnologia' })))
      .toBe('Tecnologia · estoque')
    expect(rotuloDestino(mov({ tipo: 'cadastro', data_movimentacao: '2026-01-01', area_destino_nome: 'Tecnologia', detentor_destino_nome: 'Ana' })))
      .toBe('Tecnologia / Ana')
  })

  it('baixa mostra o motivo, não um destino', () => {
    expect(rotuloDestino(mov({ tipo: 'baixa', data_movimentacao: '2026-01-01', motivo_baixa: 'perda' })))
      .toBe('Baixa por perda / extravio')
  })
})

describe('baixa trava o ativo — reativação é o caminho de volta', () => {
  it('baixado só aceita reativação', () => {
    expect(tiposPermitidos('baixado')).toEqual(['reativacao'])
  })
  it('não-baixado aceita todos os outros, e NUNCA a reativação', () => {
    for (const s of ['em_uso', 'em_estoque', 'em_manutencao', 'emprestado'] as const) {
      expect(tiposPermitidos(s)).not.toContain('reativacao')
      expect(tiposPermitidos(s).length).toBe(TIPOS_MOVIMENTACAO.length - 1)
    }
  })
  it('reativação devolve o ativo ao uso', () => {
    const linha = derivarLinha(FICHA, [
      mov({ tipo: 'cadastro', data_movimentacao: '2026-01-01', area_destino_nome: 'Operações', detentor_destino_nome: 'Ana' }),
      mov({ tipo: 'baixa', data_movimentacao: '2026-06-01', motivo_baixa: 'perda' }),
      mov({ tipo: 'reativacao', data_movimentacao: '2026-06-20', area_destino_nome: 'Operações', detentor_destino_nome: 'Ana' }),
    ])
    expect(linha.status).toBe('em_uso')
  })
})

describe('marcador de registro retroativo', () => {
  it('data do fato anterior ao dia da gravação → retroativa', () => {
    expect(ehRetroativa(mov({ tipo: 'transferencia', data_movimentacao: '2026-05-04', criado_em: '2026-05-13T18:22:00Z' }))).toBe(true)
  })
  it('registrada no mesmo dia → não é retroativa', () => {
    expect(ehRetroativa(mov({ tipo: 'transferencia', data_movimentacao: '2026-05-04', criado_em: '2026-05-04T18:22:00Z' }))).toBe(false)
  })
  it('o dia é o de SÃO PAULO, não o UTC', () => {
    // 01:30Z de 05/05 é 22:30 de 04/05 em SP ⇒ o fato de 04/05 foi registrado NO MESMO dia.
    expect(ehRetroativa(mov({ tipo: 'transferencia', data_movimentacao: '2026-05-04', criado_em: '2026-05-05T01:30:00Z' }))).toBe(false)
  })
})

describe('DESTINO_POR_TIPO cobre os 8 tipos e nenhum fica sem destino exigido', () => {
  it('todo tipo declara ao menos um campo de destino obrigatório', () => {
    const tipos: TipoMovimentacao[] = ['cadastro', ...TIPOS_MOVIMENTACAO]
    for (const t of tipos) {
      const regra = DESTINO_POR_TIPO[t]
      expect(Object.values(regra)).toContain('obrigatorio')
    }
  })
})
