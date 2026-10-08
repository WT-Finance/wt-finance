import { describe, it, expect } from 'vitest'
import {
  montarExportacaoSolicitacoes, colunasDoTipo, nomeDeAba, nomeArquivoExportacao,
  celulaData, celulaDataHora, celulaMoeda,
  FMT_MOEDA, FMT_DATA, FMT_DATA_HORA, NOME_ABA_TODAS, NOME_ABA_ANEXOS, NOME_ABA_SOBRE,
  type AbaExportacao, type Celula,
} from './exportar'
import type { Solicitacao } from './schemas'

// Fixture ilustrativa — o módulo é puro; nada aqui depende do dado vivo.

type Resp = Solicitacao['respostas'][number]
const resp = (campo_id: number, rotulo: string, tipo_campo: Resp['tipo_campo'], valor: string | null): Resp =>
  ({ campo_id, rotulo, tipo_campo, valor })

function sol(over: Partial<Solicitacao> & Pick<Solicitacao, 'id'>): Solicitacao {
  return {
    tipo_id: 1, tipo_nome: 'Contas a pagar', solicitante_email: 'ana@x.com',
    destinatario: { tipo: 'role', rotulo: 'Financeiro' }, data_limite: '2026-08-11',
    descricao: 'Descrição', status: 'aberta', respostas: [], decidido_em: null,
    decidido_por_email: null, aprovado_em: null, aprovado_por_email: null, justificativa: null,
    criado_em: '2026-08-04T12:22:00Z', anexos: [], origem: null,
    ...over,
  } as Solicitacao
}

const serialData = (a: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(a, m - 1, d, h, mi) / 86_400_000 + 25569
const abaPorNome = (abas: AbaExportacao[], nome: string) => {
  const a = abas.find(x => x.nome === nome)
  if (!a) throw new Error(`aba ${nome} ausente`)
  return a
}
const coluna = (a: AbaExportacao, cab: string): Celula[] => {
  const i = a.linhas[0].indexOf(cab)
  if (i < 0) throw new Error(`coluna ${cab} ausente em ${a.nome}: ${a.linhas[0].join(' | ')}`)
  return a.linhas.slice(1).map(l => l[i] ?? null)
}

describe('células', () => {
  it('data pura vira serial do Excel sem fuso', () => {
    expect(celulaData('2026-08-11')).toEqual({ t: 'n', v: 46245, z: FMT_DATA })
    expect(celulaData(null)).toBeNull()
    expect(celulaData('11/08/2026')).toBe('11/08/2026') // fora do formato → cru, nunca some
  })

  it('timestamptz vira data-hora de PAREDE em São Paulo — inclusive perto da meia-noite', () => {
    expect(celulaDataHora('2026-08-04T12:22:00Z')).toEqual({ t: 'n', v: serialData(2026, 8, 4, 9, 22), z: FMT_DATA_HORA })
    // 02:30 UTC é 23:30 do DIA ANTERIOR em SP — o split de string erraria o dia.
    expect(celulaDataHora('2026-08-05T02:30:00+00:00')).toEqual({ t: 'n', v: serialData(2026, 8, 4, 23, 30), z: FMT_DATA_HORA })
    expect(celulaDataHora(null)).toBeNull()
  })

  it('moeda lida pelo MESMO toNum da tela (fmtValor)', () => {
    expect(celulaMoeda('3000,00')).toEqual({ t: 'n', v: 3000, z: FMT_MOEDA })
    expect(celulaMoeda('1.318')).toEqual({ t: 'n', v: 1318, z: FMT_MOEDA }) // milhar BR, como o drawer mostra
    expect(celulaMoeda('79.99')).toEqual({ t: 'n', v: 79.99, z: FMT_MOEDA })
    expect(celulaMoeda('abc')).toBe('abc')
    expect(celulaMoeda('')).toBeNull()
  })
})

describe('nomeDeAba', () => {
  it('remove caracteres proibidos, corta em 31 e desambigua sem diferenciar maiúsculas', () => {
    const usados = new Set(['todas'])
    expect(nomeDeAba('Compras/reparos [TI]', usados)).toBe('Compras reparos TI')
    expect(nomeDeAba('TODAS', usados)).toBe('TODAS (2)')
    const longo = 'Um nome de tipo muito comprido demais para o Excel'
    const a = nomeDeAba(longo, usados)
    const b = nomeDeAba(longo, usados)
    expect(a.length).toBeLessThanOrEqual(31)
    expect(b.length).toBeLessThanOrEqual(31)
    expect(b.endsWith(' (2)')).toBe(true)
    expect(a).not.toBe(b)
  })
})

describe('colunasDoTipo — coluna é rótulo+tipo, não campo_id', () => {
  it('o mesmo campo recriado com id novo (edição do tipo) cai na MESMA coluna', () => {
    const nova = sol({ id: 2, respostas: [resp(20, 'Valor', 'moeda', '10'), resp(21, 'Fornecedor', 'texto_curto', 'B')] })
    const velha = sol({ id: 1, respostas: [resp(10, 'Fornecedor ', 'texto_curto', 'A'), resp(11, 'Valor', 'moeda', '5')] })
    const { colunas, colunaDoCampo } = colunasDoTipo([nova, velha])
    expect(colunas.map(c => c.rotulo)).toEqual(['Valor', 'Fornecedor']) // ordem do snapshot MAIS RECENTE
    expect(colunaDoCampo.get(11)).toBe(colunaDoCampo.get(20))
    expect(colunaDoCampo.get(10)).toBe(colunaDoCampo.get(21))
  })

  it('mesmo rótulo com TIPO diferente são colunas distintas', () => {
    const { colunas } = colunasDoTipo([
      sol({ id: 2, respostas: [resp(2, 'Prazo', 'data', '2026-01-01')] }),
      sol({ id: 1, respostas: [resp(1, 'Prazo', 'texto_curto', 'amanhã')] }),
    ])
    expect(colunas).toHaveLength(2)
  })

  it('dois campos de mesmo rótulo NA MESMA solicitação não se fundem', () => {
    const { colunas, colunaDoCampo } = colunasDoTipo([
      sol({ id: 1, respostas: [resp(1, 'Obs', 'texto_curto', 'a'), resp(2, 'Obs', 'texto_curto', 'b')] }),
    ])
    expect(colunas).toHaveLength(2)
    expect(colunaDoCampo.get(1)).not.toBe(colunaDoCampo.get(2))
  })

  it('campo que só existe em snapshot antigo vai para o fim', () => {
    const { colunas } = colunasDoTipo([
      sol({ id: 2, respostas: [resp(3, 'A', 'texto_curto', 'x')] }),
      sol({ id: 1, respostas: [resp(1, 'Antigo', 'texto_curto', 'y'), resp(2, 'A', 'texto_curto', 'z')] }),
    ])
    expect(colunas.map(c => c.rotulo)).toEqual(['A', 'Antigo'])
  })
})

describe('montarExportacaoSolicitacoes', () => {
  const lista: Solicitacao[] = [
    sol({
      id: 7, tipo_id: 2, tipo_nome: 'Compras e reparos', status: 'concluida',
      decidido_em: '2026-08-06T15:00:00Z', decidido_por_email: 'gestor@x.com',
      origem: { plataforma: 'Monde' },
      respostas: [resp(30, 'Item', 'texto_curto', 'Cadeira')],
    }),
    sol({
      id: 3, status: 'aprovada', aprovado_em: '2026-08-05T13:00:00Z', aprovado_por_email: 'gestor@x.com',
      respostas: [
        resp(20, 'Valor (R$)', 'moeda', '1.318'),
        resp(21, 'Nota fiscal', 'anexo', null),
        resp(22, 'Pagar até', 'data', '2026-08-20'),
        resp(23, 'Código', 'numero', '000123'),
      ],
      anexos: [
        { id: 1, campo_id: 21, nome: 'nf.pdf', mime: 'application/pdf', tamanho: 2048 },
        { id: 2, campo_id: null, nome: 'comprovante.png', mime: 'image/png', tamanho: 512 },
      ],
    }),
    sol({ id: 5, criado_em: '2026-07-01T12:00:00Z', respostas: [resp(10, 'Valor (R$)', 'moeda', 'abc')] }),
  ]
  const abas = montarExportacaoSolicitacoes(lista, new Date('2026-10-08T17:00:00Z'))

  it('abas: Todas, um por tipo (mais solicitações primeiro), Anexos, Sobre', () => {
    expect(abas.map(a => a.nome)).toEqual([NOME_ABA_TODAS, 'Contas a pagar', 'Compras e reparos', NOME_ABA_ANEXOS, NOME_ABA_SOBRE])
    expect(abas.find(a => a.nome === NOME_ABA_SOBRE)?.filtro).toBe(false)
  })

  it('Todas: uma linha por solicitação, em ordem de número, com rótulos de status e origem', () => {
    const todas = abaPorNome(abas, NOME_ABA_TODAS)
    expect(coluna(todas, 'Nº')).toEqual([{ t: 'n', v: 3 }, { t: 'n', v: 5 }, { t: 'n', v: 7 }])
    expect(coluna(todas, 'Status')).toEqual(['Aprovada', 'Aberta', 'Concluída'])
    expect(coluna(todas, 'Origem')).toEqual(['Janus', 'Janus', 'API (Monde)'])
    expect(coluna(todas, 'Aprovada por')).toEqual(['gestor@x.com', null, null])
    expect(coluna(todas, 'Anexos')).toEqual([{ t: 'n', v: 2 }, { t: 'n', v: 0 }, { t: 'n', v: 0 }])
  })

  it('aba do tipo: campos viram colunas tipadas; versões do campo na mesma coluna', () => {
    const contas = abaPorNome(abas, 'Contas a pagar')
    // rótulo que já traz "R$" não ganha um segundo "(R$)"
    expect(coluna(contas, 'Valor (R$)')).toEqual([{ t: 'n', v: 1318, z: FMT_MOEDA }, 'abc'])
    expect(coluna(contas, 'Pagar até')).toEqual([{ t: 'n', v: 46254, z: FMT_DATA }, null])
    expect(coluna(contas, 'Código')).toEqual(['000123', null]) // numero fica texto, como na tela
    expect(coluna(contas, 'Nota fiscal')).toEqual(['nf.pdf', null]) // anexo posterior NÃO entra no campo
  })

  it('Anexos: todo arquivo, com o campo de origem ou "Anexo posterior"', () => {
    const anexos = abaPorNome(abas, NOME_ABA_ANEXOS)
    expect(anexos.linhas).toHaveLength(3)
    expect(coluna(anexos, 'Campo')).toEqual(['Nota fiscal', 'Anexo posterior'])
    expect(coluna(anexos, 'Tamanho (KB)')).toEqual([{ t: 'n', v: 2, z: '#,##0' }, { t: 'n', v: 1, z: '#,##0' }])
  })

  it('larguras: uma por coluna, com teto', () => {
    for (const a of abas) {
      expect(a.larguras).toHaveLength(Math.max(...a.linhas.map(l => l.length)))
      expect(Math.max(...a.larguras)).toBeLessThanOrEqual(60)
    }
  })

  it('lista vazia ainda gera Todas/Anexos/Sobre só com cabeçalho', () => {
    const vazias = montarExportacaoSolicitacoes([], new Date())
    expect(vazias.map(a => a.nome)).toEqual([NOME_ABA_TODAS, NOME_ABA_ANEXOS, NOME_ABA_SOBRE])
    expect(abaPorNome(vazias, NOME_ABA_TODAS).linhas).toHaveLength(1)
  })
})

it('nomeArquivoExportacao', () => {
  expect(nomeArquivoExportacao('2026-10-08')).toBe('solicitacoes-2026-10-08.xlsx')
})
