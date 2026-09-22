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
} from './aplicar'
import type { VendaProdutoCru } from './parsers/vendas-produto'
import type { DemonstrativoCompetenciaCru } from './parsers/demonstrativo-competencia'
import type { LancamentoCategoriaCru } from './parsers/lancamentos-categoria'
import type { LancamentoOperacaoCru } from './parsers/lancamentos-operacao'

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

// Colunas REAIS do `INSERT` de `inserir_lote_staging` (migration 0135/0118) — não a lista que
// "parece certa". `intermediario` fica de fora de propósito (sem coluna hoje).
const COLUNAS_VENDAS_STAGING = [
  'arquivo_origem', 'linha_origem', 'venda_numero', 'data_venda', 'vendedor', 'pagante',
  'setor_macro', 'setor', 'setor_micro', 'produto', 'valor_total', 'receitas', 'contrato',
  'taxa_servico', 'semana', 'mes', 'data_inicio_evento', 'fornecedor', 'situacao',
  'tipo_contrato', 'passageiros', 'operacao_propria',
].sort()

describe('adaptarVenda', () => {
  it('produz exatamente as chaves que inserir_lote_staging lê (migration 0135) — sem intermediario', () => {
    const payload = adaptarVenda(vendaCru())
    expect(Object.keys(payload).sort()).toEqual(COLUNAS_VENDAS_STAGING)
    expect(payload).not.toHaveProperty('intermediario')
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

  // 🔴 A prova é de PRESERVAÇÃO, não de capacidade: a coluna existe desde a 0038 e o Cru da M3
  // traz o dado, mas mapeá-la mudaria tela. `vw_vendas_agregadas` (0040) e
  // `get_vendas_em_aberto`/`get_vendas_em_aberto_weddings` (0114/0121) filtram
  // `situacao = 'Aberta'` ESTRITO; com a coluna nula esse filtro não casa nada, e preenchê-la
  // faria "Vendas em Aberto" deixar de ser uma lista vazia (medido nos anexos de 21/09: 411
  // "Aberta" em 48.865 linhas). Invariante 1 da versão é "zero mudança de número em tela", e
  // `situacao` não está na lista de exceções visíveis do briefing — é decisão do Yan. Este
  // teste é o que impede a mudança de entrar sem querer, junto com a decisão.
  it('situacao sai NULL mesmo quando o Cru traz o dado — preservar tela é decisão, não esquecimento', () => {
    const payload = adaptarVenda(vendaCru({ situacao: 'Aberta' }))
    expect(payload.situacao).toBeNull()
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

// Colunas REAIS de `inserir_lote_lancamentos` → `analytics.fato_lancamento_operacao`
// (migrations 0026/0027).
const COLUNAS_LANCAMENTO_OPERACAO = [
  'lancamento_n', 'venda_n', 'pessoa', 'descricao', 'liquidacao_dt', 'vencimento_dt', 'valor',
  'tipo', 'operacao', 'status', 'data_final', 'mes_ano',
].sort()

describe('adaptarLancamentoOperacao', () => {
  it('produz exatamente as chaves de inserir_lote_lancamentos (migrations 0026/0027)', () => {
    const payload = adaptarLancamentoOperacao(lancamentoOperacaoCru())
    expect(Object.keys(payload).sort()).toEqual(COLUNAS_LANCAMENTO_OPERACAO)
  })

  it('renomeia lancamento_numero/venda_numero/liquidacao/vencimento para os nomes da coluna', () => {
    const payload = adaptarLancamentoOperacao(lancamentoOperacaoCru())
    expect(payload.lancamento_n).toBe('30021')
    expect(payload.venda_n).toBe('12345')
    expect(payload.liquidacao_dt).toBe('2026-02-04')
    expect(payload.vencimento_dt).toBe('2026-02-05')
    expect(payload).not.toHaveProperty('lancamento_numero')
    expect(payload).not.toHaveProperty('venda_numero')
  })

  // `status` e `mes_ano` não vêm no CSV do scrape: quem os derivava era o script R
  // (`docs/legado/scripts-r/analise_casamentos2.R`), e o parser de cliente antigo os lia já
  // prontos do CSV tratado. Continuam sendo GRAVADOS aqui porque há leitor vivo —
  // `SUM(CASE WHEN status = 'Entrada' …)` nas RPCs de Carteira/Próximos/Hotel de Weddings.
  // Coluna nula ali não dá erro: dá ZERO em quatro somas que a diretoria lê. O `Status`
  // calculado na leitura é a M7, junto com a mudança dos leitores.
  it('status: realizado quando a data final já passou (Tipo puro)', () => {
    const p = adaptarLancamentoOperacao(lancamentoOperacaoCru({ tipo: 'Saída', data_final: '2026-02-04' }), '2026-09-22')
    expect(p.status).toBe('Saída')
  })

  it('status: futuro vira "A Receber Futuro"/"A Pagar Futuro" quando a data final é depois de hoje', () => {
    const entrada = adaptarLancamentoOperacao(
      lancamentoOperacaoCru({ tipo: 'Entrada', data_final: '2026-12-31' }), '2026-09-22')
    const saida = adaptarLancamentoOperacao(
      lancamentoOperacaoCru({ tipo: 'Saída', data_final: '2026-12-31' }), '2026-09-22')
    expect(entrada.status).toBe('A Receber Futuro')
    expect(saida.status).toBe('A Pagar Futuro')
  })

  // O ramo `TRUE ~ Tipo` do `case_when` do R: lá, `NA > data` avalia para NA, então a linha sem
  // Data_Final nunca casava os dois primeiros ramos e caía no último. `statusDoLancamento` (M3)
  // devolve `null` aqui de propósito — decisão certa para quando a LEITURA mudar —, e é por
  // isso que o adaptador precisa do fallback: sem ele, os lançamentos sem data final (os 3
  // conhecidos, fora de Aberto e de Movimentação) sumiriam das somas de realizado.
  it('status: sem data final cai no Tipo — o ramo "TRUE ~ Tipo" do R, que o null da M3 não repõe', () => {
    const p = adaptarLancamentoOperacao(lancamentoOperacaoCru({ tipo: 'Entrada', data_final: null }), '2026-09-22')
    expect(p.status).toBe('Entrada')
  })

  it('mes_ano é AAAA-MM da data final, e null quando não há data final', () => {
    expect(adaptarLancamentoOperacao(lancamentoOperacaoCru({ data_final: '2026-02-04' }), '2026-09-22').mes_ano)
      .toBe('2026-02')
    expect(adaptarLancamentoOperacao(lancamentoOperacaoCru({ data_final: null }), '2026-09-22').mes_ano)
      .toBeNull()
  })

  it('valor negativo é preservado sem Math.abs', () => {
    const payload = adaptarLancamentoOperacao(lancamentoOperacaoCru({ valor: -42.5 }))
    expect(payload.valor).toBe(-42.5)
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
