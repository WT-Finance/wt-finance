import { describe, it, expect, vi } from 'vitest'

// `aplicar.ts` é `server-only` (usa service role). Fora do bundler do Next o pacote LANÇA ao
// ser importado, e o arquivo inteiro deixaria de rodar — mesmo molde já usado em
// `storage.test.ts` e em `src/lib/asaas/customers.test.ts`. O que este arquivo testa são os
// ADAPTADORES, que são puros e não tocam rede nem banco.
vi.mock('server-only', () => ({}))

import {
  adaptarVenda,
  adaptarDemonstrativo,
  adaptarLancamentoMovimentacao,
  adaptarTituloEmAberto,
  adaptarLancamentoOperacao,
  lancamentoOperacaoAplicavel,
  serializarChecksumsVendas,
  serializarChecksumsLancamentoCategoria,
  serializarChecksumsDemonstrativo,
} from './aplicar'
import type { VendaProdutoCru } from './parsers/vendas-produto'
import type { DemonstrativoCompetenciaCru } from './parsers/demonstrativo-competencia'
import type { LancamentoCategoriaCru } from './parsers/lancamentos-categoria'
import type { LancamentoOperacaoCru } from './parsers/lancamentos-operacao'
import type { Checksum } from './parsers/comum'

// ── Provas dos ADAPTADORES `*Cru` → payload da RPC ───────────────────────────────────────────
//
// Isto NÃO testa a sequência de RPCs contra o banco (é prova de comportamento com transação
// revertida, e não é desta missão — skill `banco-e-rpc` §6). O que se prova aqui é que cada
// adaptador é fiel à forma que a RPC de hoje lê, conferida coluna a coluna contra o `INSERT`
// real das migrations — não contra o que "parece certo".

function vendaCru(overrides: Partial<VendaProdutoCru> = {}): VendaProdutoCru {
  return {
    arquivo_origem:   'vendas-2026.xlsx',
    linha_origem:     2,
    venda_numero:     '12345',
    data_venda:       '2026-03-10',
    data_inicio:      '2026-06-15',
    vendedor:         'Fulano de Tal',
    intermediario:    'Agência Parceira',
    pagante:          'Ciclano',
    passageiros:      '2',
    setor:            'Lazer',
    produto:          'Passagem Aérea',
    tipo_contrato:    'Voucher',
    fornecedor:       'CVC',
    receitas:         1234.5,
    valor_total:      2500,
    situacao:         'Confirmada',
    operacao_propria: 'W - Fulano e Ciclana',
    semana:           10,
    setor_macro:      'Lazer',
    mes:              'mar',
    setor_micro:      'Lazer',
    contrato:         0,
    taxa_servico:     0,
    ...overrides,
  }
}

// Colunas REAIS do `INSERT` de `inserir_lote_staging` (migration 0135/0118, com o `CREATE OR
// REPLACE` da 0278 acrescentando `intermediario`) — não a lista que "parece certa".
const COLUNAS_VENDAS_STAGING = [
  'arquivo_origem', 'linha_origem', 'venda_numero', 'data_venda', 'vendedor', 'pagante',
  'setor_macro', 'setor', 'setor_micro', 'produto', 'valor_total', 'receitas', 'contrato',
  'taxa_servico', 'semana', 'mes', 'data_inicio_evento', 'fornecedor', 'situacao',
  'tipo_contrato', 'passageiros', 'operacao_propria', 'intermediario',
].sort()

describe('adaptarVenda', () => {
  it('produz exatamente as chaves que inserir_lote_staging lê (migration 0135/0278)', () => {
    const payload = adaptarVenda(vendaCru())
    expect(Object.keys(payload).sort()).toEqual(COLUNAS_VENDAS_STAGING)
  })

  // M5 (decisão 7 do briefing): a coluna nasceu na 0277/0278 e o script R legado a zerava —
  // resíduo, não regra de negócio. O parser da M3 já preservava o dado; só faltava para onde ir.
  it('intermediario É GRAVADO — preserva o valor do Cru (deixou de ser descartado na M5)', () => {
    const payload = adaptarVenda(vendaCru({ intermediario: 'Agência Parceira' }))
    expect(payload.intermediario).toBe('Agência Parceira')
  })

  it('intermediario nulo continua nulo', () => {
    const payload = adaptarVenda(vendaCru({ intermediario: null }))
    expect(payload.intermediario).toBeNull()
  })

  it('a data de início do evento não se perde nem troca de VALOR ao trocar de nome (data_inicio → data_inicio_evento)', () => {
    const payload = adaptarVenda(vendaCru({ data_inicio: '2026-12-25' }))
    expect(payload.data_inicio_evento).toBe('2026-12-25')
    expect(payload).not.toHaveProperty('data_inicio')
  })

  it('contrato e taxa_servico viram boolean corretamente, inclusive no caso 0', () => {
    const zero = adaptarVenda(vendaCru({ contrato: 0, taxa_servico: 0 }))
    expect(zero.contrato).toBe(false)
    expect(zero.taxa_servico).toBe(false)
    expect(typeof zero.contrato).toBe('boolean')

    const um = adaptarVenda(vendaCru({ contrato: 1, taxa_servico: 1 }))
    expect(um.contrato).toBe(true)
    expect(um.taxa_servico).toBe(true)
  })

  it('valor_total e receitas saem como STRING e mantêm as duas casas', () => {
    const payload = adaptarVenda(vendaCru({ valor_total: 100, receitas: 1234.5 }))
    expect(payload.valor_total).toBe('100.00')
    expect(typeof payload.valor_total).toBe('string')
    expect(payload.receitas).toBe('1234.50')
    expect(typeof payload.receitas).toBe('string')
  })

  it('campo nulo continua nulo — não vira string vazia nem zero', () => {
    const payload = adaptarVenda(vendaCru({
      fornecedor: null, passageiros: null, semana: null, valor_total: null, situacao: null,
    }))
    expect(payload.fornecedor).toBeNull()
    expect(payload.passageiros).toBeNull()
    expect(payload.semana).toBeNull()
    expect(payload.valor_total).toBeNull()
    expect(payload.situacao).toBeNull()
  })

  // Decisão do Yan em 22/09: a coluna PASSA a ser gravada. Ela existe desde a 0038 exatamente
  // para a tela "Vendas em Aberto", que filtra `situacao = 'Aberta'` ESTRITO
  // (`vw_vendas_agregadas`/0040, `get_vendas_em_aberto`/0114) — com a coluna nula, aquele filtro
  // não casava nada e a tela ficava vazia sem ninguém ter como saber pela tela. Medido nos anexos
  // de 21/09: 411 "Aberta" e 48.451 "Fechada" em 48.865 linhas, os dois únicos valores, ambos
  // dentro do CHECK da 0038. É exceção declarada ao invariante 1 da versão.
  it('situacao é GRAVADA — a tela "Vendas em Aberto" depende dela e ficava vazia sem ela', () => {
    expect(adaptarVenda(vendaCru({ situacao: 'Aberta' })).situacao).toBe('Aberta')
    expect(adaptarVenda(vendaCru({ situacao: 'Fechada' })).situacao).toBe('Fechada')
  })

  it('situacao ausente continua nula — "não veio" não é "Fechada"', () => {
    expect(adaptarVenda(vendaCru({ situacao: null })).situacao).toBeNull()
  })
})

function demonstrativoCru(overrides: Partial<DemonstrativoCompetenciaCru> = {}): DemonstrativoCompetenciaCru {
  return {
    tipo:        'Despesas',
    grupo:       'Custo dos Serviços Prestados',
    descricao:   'Assessoria Local',
    ano:         2026,
    mes:         'março',
    mes_num:     3,
    competencia: '2026-03-01',
    valor:       -1234.56,
    ...overrides,
  }
}

// Colunas REAIS de `inserir_lote_demonstrativo_competencia` (migration 0255).
const COLUNAS_DEMONSTRATIVO = [
  'arquivo_origem', 'tipo', 'grupo', 'descricao', 'ano', 'mes', 'mes_num', 'competencia', 'valor',
].sort()

describe('adaptarDemonstrativo', () => {
  it('produz exatamente as chaves de inserir_lote_demonstrativo_competencia (migration 0255)', () => {
    const payload = adaptarDemonstrativo(demonstrativoCru(), 'demonstrativo-2026.xlsx')
    expect(Object.keys(payload).sort()).toEqual(COLUNAS_DEMONSTRATIVO)
  })

  it('o nome do arquivo de origem chega em TODAS as linhas', () => {
    const linhas = [
      demonstrativoCru({ descricao: 'Assessoria Local' }),
      demonstrativoCru({ descricao: 'Comissão de Venda' }),
      demonstrativoCru({ descricao: 'Marketing' }),
    ]
    const payloads = linhas.map((l) => adaptarDemonstrativo(l, 'demonstrativo_de_resultado.xlsx'))
    expect(payloads.every((p) => p.arquivo_origem === 'demonstrativo_de_resultado.xlsx')).toBe(true)
  })

  it('preserva o valor (inclusive negativo) sem arredondar de novo', () => {
    const payload = adaptarDemonstrativo(demonstrativoCru({ valor: -271.73 }), 'x.xlsx')
    expect(payload.valor).toBe(-271.73)
  })
})

function lancamentoCategoriaCru(overrides: Partial<LancamentoCategoriaCru> = {}): LancamentoCategoriaCru {
  return {
    grupo_categoria:     'Custo dos Serviços Prestados',
    categoria:           'Assessoria Local',
    numero:              '9001',
    venda_numero:        '12345',
    emissao:             '2026-01-05',
    vencimento:          '2026-02-05',
    liquidacao:          '2026-02-04',
    movimentacao:        '2026-02-04',
    pessoa:              'Fulano de Tal',
    descricao:           'Pagamento assessoria local',
    descricao_categoria: 'Serviços prestados',
    valor:               -271.73,
    conta:               'Banco X',
    ...overrides,
  }
}

// Colunas REAIS de `inserir_lote_lancamentos_movimentacao` (migration 0185).
const COLUNAS_MOVIMENTACAO = [
  'arquivo_origem', 'numero', 'venda_no', 'emissao', 'vencimento', 'liquidacao',
  'data_movimentacao', 'pessoa', 'descricao', 'descricao_categoria', 'valor', 'categoria',
  'grupo_categoria', 'conta',
].sort()

// Colunas REAIS de `inserir_lote_titulos_em_aberto` (migration 0186) — sem data_movimentacao.
const COLUNAS_ABERTO = [
  'arquivo_origem', 'numero', 'venda_no', 'emissao', 'vencimento', 'liquidacao', 'pessoa',
  'descricao', 'descricao_categoria', 'valor', 'categoria', 'grupo_categoria', 'conta',
].sort()

describe('adaptarLancamentoMovimentacao', () => {
  it('produz exatamente as chaves de inserir_lote_lancamentos_movimentacao (migration 0185)', () => {
    const payload = adaptarLancamentoMovimentacao(lancamentoCategoriaCru(), 'movimentacao.xlsx')
    expect(Object.keys(payload).sort()).toEqual(COLUNAS_MOVIMENTACAO)
  })

  it('renomeia venda_numero → venda_no e movimentacao → data_movimentacao (a RPC lê por este nome)', () => {
    const payload = adaptarLancamentoMovimentacao(
      lancamentoCategoriaCru({ venda_numero: '777', movimentacao: '2026-05-01' }),
      'x.xlsx',
    )
    expect(payload.venda_no).toBe('777')
    expect(payload.data_movimentacao).toBe('2026-05-01')
    expect(payload).not.toHaveProperty('venda_numero')
    expect(payload).not.toHaveProperty('movimentacao')
  })

  it('venda_numero nulo continua nulo em venda_no — não vira zero nem string vazia', () => {
    const payload = adaptarLancamentoMovimentacao(lancamentoCategoriaCru({ venda_numero: null }), 'x.xlsx')
    expect(payload.venda_no).toBeNull()
  })

  it('o nome do arquivo de origem chega em todas as linhas', () => {
    const linhas = [lancamentoCategoriaCru({ numero: '1' }), lancamentoCategoriaCru({ numero: '2' })]
    const payloads = linhas.map((l) => adaptarLancamentoMovimentacao(l, 'lancamentos_movimentacao.xlsx'))
    expect(payloads.every((p) => p.arquivo_origem === 'lancamentos_movimentacao.xlsx')).toBe(true)
  })
})

describe('adaptarTituloEmAberto', () => {
  it('produz exatamente as chaves de inserir_lote_titulos_em_aberto (migration 0186) — sem data_movimentacao', () => {
    const payload = adaptarTituloEmAberto(lancamentoCategoriaCru({ movimentacao: null }), 'aberto.xlsx')
    expect(Object.keys(payload).sort()).toEqual(COLUNAS_ABERTO)
    expect(payload).not.toHaveProperty('data_movimentacao')
  })

  it('renomeia venda_numero → venda_no', () => {
    const payload = adaptarTituloEmAberto(lancamentoCategoriaCru({ venda_numero: '999' }), 'x.xlsx')
    expect(payload.venda_no).toBe('999')
    expect(payload).not.toHaveProperty('venda_numero')
  })

  it('campo nulo (liquidacao, sempre vazia nesta base) continua nulo', () => {
    const payload = adaptarTituloEmAberto(lancamentoCategoriaCru({ liquidacao: null }), 'x.xlsx')
    expect(payload.liquidacao).toBeNull()
  })
})

function lancamentoOperacaoCru(overrides: Partial<LancamentoOperacaoCru> = {}): LancamentoOperacaoCru {
  return {
    linha_origem:       5,
    lancamento_numero:  '30021',
    venda_numero:       '12345',
    pessoa:             'Fulano de Tal',
    descricao:          'Pagamento operação',
    liquidacao:         '2026-02-04',
    vencimento:         '2026-02-05',
    valor:              -389.16,
    operacao:           'W - Camila e Bruno - 02SET23',
    tipo:               'Saída',
    data_final:         '2026-02-04',
    ...overrides,
  }
}

// Colunas REAIS de `inserir_lote_staging_operacao` → `raw.lancamentos_operacao_staging`
// (migrations 0277/0278) — M5 muda o alvo de "direto no fato" (0026/0027) para "staging → raw →
// fato": nenhuma renomeação aqui (a staging usa os MESMOS nomes do Cru), e status/mes_ano/
// data_final NÃO são mais calculados neste adaptador (anexo M5 §6) — passam a ser derivados
// dentro de `promover_carga_operacao`, em SQL, com "hoje" de São Paulo lido no banco.
const COLUNAS_LANCAMENTO_OPERACAO_STAGING = [
  'arquivo_origem', 'linha_origem', 'lancamento_numero', 'venda_numero', 'pessoa', 'descricao',
  'liquidacao', 'vencimento', 'valor', 'operacao', 'tipo',
].sort()

describe('adaptarLancamentoOperacao', () => {
  it('produz exatamente as chaves de inserir_lote_staging_operacao (migration 0278)', () => {
    const payload = adaptarLancamentoOperacao(lancamentoOperacaoCru(), 'operacoes-2026.csv')
    expect(Object.keys(payload).sort()).toEqual(COLUNAS_LANCAMENTO_OPERACAO_STAGING)
  })

  it('NÃO renomeia mais lancamento_numero/venda_numero/liquidacao/vencimento — a staging usa os mesmos nomes do Cru', () => {
    const payload = adaptarLancamentoOperacao(lancamentoOperacaoCru(), 'x.csv')
    expect(payload.lancamento_numero).toBe('30021')
    expect(payload.venda_numero).toBe('12345')
    expect(payload.liquidacao).toBe('2026-02-04')
    expect(payload.vencimento).toBe('2026-02-05')
    expect(payload).not.toHaveProperty('lancamento_n')
    expect(payload).not.toHaveProperty('venda_n')
    expect(payload).not.toHaveProperty('liquidacao_dt')
    expect(payload).not.toHaveProperty('vencimento_dt')
  })

  it('linha_origem chega ao payload — a staging tem essa coluna, o fato antigo não tinha', () => {
    const payload = adaptarLancamentoOperacao(lancamentoOperacaoCru({ linha_origem: 42 }), 'x.csv')
    expect(payload.linha_origem).toBe(42)
  })

  it('o nome do arquivo de origem chega em todas as linhas — base PASSA a exigir isto na M5', () => {
    const linhas = [lancamentoOperacaoCru({ lancamento_numero: '1' }), lancamentoOperacaoCru({ lancamento_numero: '2' })]
    const payloads = linhas.map((l) => adaptarLancamentoOperacao(l, 'analise-operacoes.csv'))
    expect(payloads.every((p) => p.arquivo_origem === 'analise-operacoes.csv')).toBe(true)
  })

  // `status`/`mes_ano`/`data_final` deixaram de ser calculados AQUI na M5 (anexo §6) — quem os
  // deriva agora é `promover_carga_operacao`, em SQL. O adaptador não lê mais `cru.data_final`
  // nem `statusDoLancamento`/`hojeSP()`; a prova desse cálculo passa a ser da migration 0278
  // (fora do escopo desta missão tocar migrations), não deste módulo.
  it('não grava status/mes_ano/data_final — são derivados em SQL na promoção, não aqui', () => {
    const payload = adaptarLancamentoOperacao(lancamentoOperacaoCru(), 'x.csv')
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('mes_ano')
    expect(payload).not.toHaveProperty('data_final')
  })

  it('valor negativo é preservado sem Math.abs', () => {
    const payload = adaptarLancamentoOperacao(lancamentoOperacaoCru({ valor: -42.5 }), 'x.csv')
    expect(payload.valor).toBe(-42.5)
  })

  it('campo nulo (pessoa) continua nulo', () => {
    const payload = adaptarLancamentoOperacao(lancamentoOperacaoCru({ pessoa: null }), 'x.csv')
    expect(payload.pessoa).toBeNull()
  })
})

describe('lancamentoOperacaoAplicavel', () => {
  it('aceita uma linha normal (Entrada/Saída, valor e operação presentes)', () => {
    expect(lancamentoOperacaoAplicavel(lancamentoOperacaoCru())).toBe(true)
  })

  it('rejeita linha-placeholder do scrape (valor null — "nada para mostrar"/"carregando...")', () => {
    expect(lancamentoOperacaoAplicavel(lancamentoOperacaoCru({ valor: null }))).toBe(false)
  })

  it('rejeita linha sem operação (operacao NOT NULL na tabela)', () => {
    expect(lancamentoOperacaoAplicavel(lancamentoOperacaoCru({ operacao: null }))).toBe(false)
  })

  it('rejeita tipo fora de Entrada/Saída (CHECK da migration 0026)', () => {
    expect(lancamentoOperacaoAplicavel(lancamentoOperacaoCru({ tipo: 'nada para mostrar' }))).toBe(false)
    expect(lancamentoOperacaoAplicavel(lancamentoOperacaoCru({ tipo: null }))).toBe(false)
  })
})

// ── Serializador de checksum: parser → jsonb da RPC (contrato do checksum, cabeçalho da 0278) ─
//
// É o ponto de MAIOR RISCO da M5: mandar `centavosApurados` em vez de `centavosArredondados`, ou
// remontar `chave` errado, faz o checksum não fechar por alguns centavos em TODA carga daquela
// base — e o erro seria "CHECKSUM_FALHOU" na aplicação real, nunca um erro de tipo. Cada teste
// abaixo confere o jsonb produzido contra as colunas que o CORPO de cada `promover_carga_{base}`
// (migration 0278) realmente lê no `WHERE`, não contra suposição.

function checksum(overrides: Partial<Checksum> = {}): Checksum {
  return {
    escopo: 'grupo',
    chave: ['Custo dos Serviços Prestados'],
    campo: 'valor',
    linhasDeclaradas: 1738,
    centavosDeclarados: -454603179,
    linhasApuradas: 1738,
    centavosApurados: -454603179,
    centavosArredondados: -454603179,
    ...overrides,
  }
}

describe('serializarChecksumsVendas', () => {
  it('escopo "arquivo": chave vira {arquivo_origem} — mesmo nome de coluna que a RPC lê (WHERE r.arquivo_origem = ...)', () => {
    const c = checksum({
      escopo: 'arquivo', chave: ['vendas-2026.xlsx'], campo: 'valor_total',
      linhasDeclaradas: 48652, centavosArredondados: 123456,
    })
    expect(serializarChecksumsVendas([c])).toEqual([
      { escopo: 'arquivo', chave: { arquivo_origem: 'vendas-2026.xlsx' }, campo: 'valor_total', linhas: 48652, centavos: 123456 },
    ])
  })

  it('centavos sai de centavosArredondados, NUNCA de centavosApurados', () => {
    const c = checksum({ campo: 'receitas', centavosApurados: 999999, centavosArredondados: 111111 })
    expect(serializarChecksumsVendas([c])[0].centavos).toBe(111111)
  })

  it('linhas nulo (o arquivo não declara contagem para este campo) continua nulo, não vira 0', () => {
    const c = checksum({ campo: 'total_produtos_moeda_origem', linhasDeclaradas: null })
    expect(serializarChecksumsVendas([c])[0].linhas).toBeNull()
  })

  it('campo não-reconferível pela RPC (total_produtos_moeda_origem/reembolso_ao_cliente) ainda assim serializa — a RPC decide contá-lo como não-conferível', () => {
    const c = checksum({ escopo: 'arquivo', chave: ['vendas-2026.xlsx'], campo: 'reembolso_ao_cliente', centavosArredondados: -50000 })
    expect(serializarChecksumsVendas([c])[0]).toEqual({
      escopo: 'arquivo', chave: { arquivo_origem: 'vendas-2026.xlsx' }, campo: 'reembolso_ao_cliente', linhas: 1738, centavos: -50000,
    })
  })

  it('sem centavosArredondados: falha alto e explícito, nunca vira jsonb calado', () => {
    const c = checksum({ centavosArredondados: undefined })
    expect(() => serializarChecksumsVendas([c])).toThrow(/centavosArredondados/)
  })
})

describe('serializarChecksumsLancamentoCategoria', () => {
  it('escopo "grupo": chave vira {grupo_categoria} — mesmo nome de coluna que Movimentação e Aberto usam', () => {
    const c = checksum({ escopo: 'grupo', chave: ['Custo dos Serviços Prestados'], linhasDeclaradas: 1738, centavosArredondados: -454603179 })
    expect(serializarChecksumsLancamentoCategoria([c])).toEqual([
      { escopo: 'grupo', chave: { grupo_categoria: 'Custo dos Serviços Prestados' }, campo: 'valor', linhas: 1738, centavos: -454603179 },
    ])
  })

  it('escopo "categoria": chave vira {grupo_categoria, categoria}, na ordem [grupo, categoria] que o parser produz', () => {
    const c = checksum({
      escopo: 'categoria', chave: ['Custo dos Serviços Prestados', 'Assessoria Local'],
      linhasDeclaradas: 99, centavosArredondados: -27173535,
    })
    expect(serializarChecksumsLancamentoCategoria([c])).toEqual([
      {
        escopo: 'categoria',
        chave: { grupo_categoria: 'Custo dos Serviços Prestados', categoria: 'Assessoria Local' },
        campo: 'valor', linhas: 99, centavos: -27173535,
      },
    ])
  })

  it('escopo "total-arquivo": chave VAZIA — soma a tabela inteira, sem filtro', () => {
    const c = checksum({ escopo: 'total-arquivo', chave: [], linhasDeclaradas: 1837, centavosArredondados: -71771074 })
    expect(serializarChecksumsLancamentoCategoria([c])[0]).toEqual({
      escopo: 'total-arquivo', chave: {}, campo: 'valor', linhas: 1837, centavos: -71771074,
    })
  })

  it('escopo desconhecido PARA em vez de assumir "sem filtro"', () => {
    const c = checksum({ escopo: 'nivel-esquisito', chave: ['x'] })
    expect(() => serializarChecksumsLancamentoCategoria([c])).toThrow(/escopo desconhecido/)
  })
})

describe('serializarChecksumsDemonstrativo', () => {
  const CAMPOS_ORDEM_PADRAO = ['Tipo', 'Grupo', 'Descrição', 'Ano', 'Mês']

  it('ordem PADRÃO do pivot: chave posicional vira objeto por nome de coluna', () => {
    const c = checksum({ escopo: 'grupo', chave: ['Despesas', 'Custo dos Serviços Prestados'], linhasDeclaradas: null, centavosArredondados: -454603179 })
    expect(serializarChecksumsDemonstrativo([c], CAMPOS_ORDEM_PADRAO)).toEqual([
      { escopo: 'grupo', chave: { tipo: 'Despesas', grupo: 'Custo dos Serviços Prestados' }, campo: 'valor', linhas: null, centavos: -454603179 },
    ])
  })

  // O pivot é DESCOBERTO, não fixo (parsers/demonstrativo-competencia.ts) — reordenar os campos
  // no export não pode quebrar a leitura, e o serializador precisa acompanhar essa liberdade.
  it('ordem REORDENADA do pivot (Ano antes de Tipo): a chave usa a POSIÇÃO, não um mapa fixo', () => {
    const camposReordenados = ['Ano', 'Tipo', 'Grupo', 'Descrição', 'Mês']
    const c = checksum({ escopo: 'tipo', chave: ['2026', 'Despesas'], linhasDeclaradas: null, centavosArredondados: -100 })
    expect(serializarChecksumsDemonstrativo([c], camposReordenados)).toEqual([
      { escopo: 'tipo', chave: { ano: '2026', tipo: 'Despesas' }, campo: 'valor', linhas: null, centavos: -100 },
    ])
  })

  it('escopo "total-geral": chave VAZIA', () => {
    const c = checksum({ escopo: 'total-geral', chave: [], linhasDeclaradas: null, centavosArredondados: -100000 })
    expect(serializarChecksumsDemonstrativo([c], CAMPOS_ORDEM_PADRAO)[0]).toEqual({
      escopo: 'total-geral', chave: {}, campo: 'valor', linhas: null, centavos: -100000,
    })
  })

  it('linhasDeclaradas sempre null nesta base (o pivot nunca declara contagem) — preservado como null, não 0', () => {
    const c = checksum({ escopo: 'descricao', chave: ['Despesas', 'Custo dos Serviços Prestados', 'Assessoria Local'], linhasDeclaradas: null, centavosArredondados: -50 })
    expect(serializarChecksumsDemonstrativo([c], CAMPOS_ORDEM_PADRAO)[0].linhas).toBeNull()
  })

  it('chave além do que camposPivot declara: PARA em vez de adivinhar a que coluna a posição corresponde', () => {
    const c = checksum({ chave: ['Despesas'], centavosArredondados: -1 })
    expect(() => serializarChecksumsDemonstrativo([c], [])).toThrow(/camposPivot/)
  })
})
