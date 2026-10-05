import { describe, it, expect, vi } from 'vitest'

// ingest.ts importa ./client (que é `import 'server-only'`): fora do bundle Next o marker lança por
// design — mock vazio, mesmo padrão dos testes de email/asaas.
vi.mock('server-only', () => ({}))

import { varrerCabecalhos, drenarFila, bloqueioDaApuracao, linhaDeCabecalho, corteDoDia, type MondeDb, type ResultadoVarredura } from './ingest'
import { OrcamentoEsgotado, ErroMonde, type ClienteMonde } from './client'
import { CacheNomes } from './nomes'

// Tudo SINTÉTICO (ids e nomes inventados).

/** Banco falso: registra a ordem das chamadas e responde por função. */
function bancoFalso(respostas: Record<string, (args: Record<string, unknown> | undefined) => unknown> = {}) {
  const chamadas: { fn: string; args?: Record<string, unknown> }[] = []
  const db: MondeDb = {
    rpc: async (fn, args) => {
      chamadas.push({ fn, args })
      const r = respostas[fn]
      return { data: r ? r(args) : null, error: null }
    },
  }
  return { db, chamadas, ordem: () => chamadas.map((c) => c.fn) }
}

function cab(n: number, criado: string, extra: Record<string, unknown> = {}) {
  return { id: `sale-${n}`, sale_number: String(n), sale_date: criado.slice(0, 10), created_at: criado, status: 'closed', totals: { final_amount: 1 }, ...extra }
}
function pagina(data: unknown[], next: string | null) {
  return { data, pagination: { has_next_page: next !== null, next_cursor: next } }
}

function detalhe(n: number) {
  const raw = {
    id: `sale-${n}`, sale_number: n, sale_date: '2026-10-01', status: 'closed',
    payer: { id: 'p1' }, seller: { id: 'p1' }, intermediary: null,
    custom_fields: [{ id: 7, value: 'Lazer' }],
    totals: { final_amount: 100, revenue: 10 },
    hotels: [{ id: `h${n}`, status: 'active', supplier: { id: 'p1' }, totals: { amount: 100 }, passengers: [] }],
  }
  return raw
}

const REGISTRAR = () => ({ registrados: 1, novos: 1, pendentes: 1, agora: '2026-10-05T12:00:00-03:00' })

describe('linhaDeCabecalho', () => {
  it('monta a linha do registrar a partir do cabeçalho da lista', () => {
    expect(linhaDeCabecalho(cab(10, '2026-10-01T09:00:00') as never)).toEqual({
      sale_id: 'sale-10', venda_numero: '10', data_venda: '2026-10-01', criado_monde: '2026-10-01T09:00:00',
      status: 'closed', totais: { final_amount: 1 },
    })
  })
  it('sem id, data ou criação ⇒ null (não registrável — conta como inválido)', () => {
    expect(linhaDeCabecalho(cab(10, '2026-10-01T09:00:00', { id: null }) as never)).toBeNull()
    expect(linhaDeCabecalho(cab(10, '2026-10-01T09:00:00', { sale_date: '' }) as never)).toBeNull()
    expect(linhaDeCabecalho(cab(10, '2026-10-01T09:00:00', { created_at: '' }) as never)).toBeNull()
  })
})

describe('varrerCabecalhos — corte por CRIAÇÃO (a lista da v3 vem desc por created_at)', () => {
  it('para na página cuja ÚLTIMA venda foi criada antes do corte; registra tudo; guarda o instante do banco', async () => {
    const { db, chamadas } = bancoFalso({ monde_cabecalho_registrar: REGISTRAR })
    const paginas = [
      pagina([cab(3, '2026-10-05T10:00:00'), cab(2, '2026-10-01T10:00:00')], 'c2'),
      // Data de venda ANTIGA, criada dentro da janela: o corte por sale_date a perderia (venda 74632).
      pagina([cab(1, '2026-09-30T10:00:00', { sale_date: '2026-08-01' }), cab(0, '2026-09-20T10:00:00')], 'c3'),
      pagina([cab(-1, '2026-09-10T10:00:00')], null),
    ]
    const cliente = { listarVendas: vi.fn(async () => paginas.shift()) } as unknown as ClienteMonde
    const r = await varrerCabecalhos(db, cliente, { corte: corteDoDia('2026-09-28') })
    expect(r.paginas).toBe(2)
    expect(r.chegou_no_corte).toBe(true)
    expect(r.inicio_banco).toBe('2026-10-05T12:00:00-03:00')
    const registrados = chamadas.flatMap((c) => (c.args?.p_cabecalhos as { venda_numero: string }[]) ?? [])
    expect(registrados.map((l) => l.venda_numero)).toEqual(['3', '2', '1', '0'])
  })

  it('linha sem id conta como INVÁLIDA (bloqueia a cura depois) e não é registrada', async () => {
    const { db } = bancoFalso({ monde_cabecalho_registrar: REGISTRAR })
    const cliente = { listarVendas: async () => pagina([cab(1, '2026-10-05T10:00:00', { id: null }), cab(2, '2026-09-01T10:00:00')], null) } as unknown as ClienteMonde
    const r = await varrerCabecalhos(db, cliente, { corte: corteDoDia('2026-09-28') })
    expect(r.invalidos).toBe(1)
  })

  it('orçamento acabou no meio: devolve o que leu, com chegou_no_corte=false e o cursor', async () => {
    const { db } = bancoFalso({ monde_cabecalho_registrar: REGISTRAR })
    let n = 0
    const cliente = {
      listarVendas: async () => { if (n++ === 0) return pagina([cab(5, '2026-10-05T10:00:00')], 'proximo'); throw new OrcamentoEsgotado() },
    } as unknown as ClienteMonde
    const r = await varrerCabecalhos(db, cliente, { corte: corteDoDia('2026-01-01') })
    expect(r).toMatchObject({ paginas: 1, chegou_no_corte: false, cursor_final: 'proximo' })
  })
})

describe('drenarFila', () => {
  const CAMPOS = { campoSetor: 7, campoVendedorWeddings: 11 }
  const fila = [1, 2, 3].map((n) => ({ sale_id: `sale-${n}`, venda_numero: String(n), cabecalho_hash: `h${n}`, motivo: 'pendente' }))

  function montar(detalheVenda: (id: string) => Promise<unknown>, pessoa: () => Promise<unknown> = async () => ({ id: 'p1', name: 'Fulano' })) {
    const banco = bancoFalso({
      monde_cabecalho_fila: () => fila,
      monde_pessoa_obter: () => ({}),
      monde_ingest_promover: () => ({ ok: true, inseridas: 2, atualizadas: 0, ignoradas: 0, itens: 2 }),
      monde_cabecalho_marcar: (a) => (a?.p_resultados as unknown[]).length,
    })
    const cliente = {
      detalheVenda: vi.fn(async (id: string) => {
        const raw = await detalheVenda(id)
        const { zVendaDetalhe } = await import('./schemas')
        return { detalhe: zVendaDetalhe.parse(raw), raw }
      }),
      pessoa: vi.fn(pessoa),
      produto: vi.fn(async () => null),
    } as unknown as ClienteMonde
    return { ...banco, cliente, nomes: new CacheNomes(banco.db, cliente) }
  }

  it('promove ANTES de marcar; erro de detalhe vira classificação "erro" com o hash da fila', async () => {
    const m = montar(async (id) => { if (id === 'sale-2') throw new ErroMonde(404, 'sale'); return detalhe(Number(id.split('-')[1])) })
    const r = await drenarFila(m.db, m.cliente, m.nomes, CAMPOS, { limite: 10, revisitaDesde: '2026-08-01', revisitaAntes: '2026-10-05T00:00:00Z' })
    expect(r).toMatchObject({ lidas: 2, espelhadas: 2, erros: 1, parou_por_orcamento: false })
    const ordem = m.ordem()
    expect(ordem.indexOf('monde_ingest_promover')).toBeLessThan(ordem.indexOf('monde_cabecalho_marcar'))
    const marcados = m.chamadas.find((c) => c.fn === 'monde_cabecalho_marcar')!.args!.p_resultados as { sale_id: string; classificacao: string; lido_hash: string }[]
    expect(marcados.find((x) => x.sale_id === 'sale-2')).toMatchObject({ classificacao: 'erro', lido_hash: 'h2' })
    expect(marcados.filter((x) => x.classificacao === 'espelhada').map((x) => x.lido_hash)).toEqual(['h1', 'h3'])
  })

  it('orçamento acaba resolvendo um nome NOVO: o bloco inteiro volta para a fila (nada promovido nem marcado)', async () => {
    const m = montar(async (id) => detalhe(Number(id.split('-')[1])), async () => { throw new OrcamentoEsgotado() })
    const r = await drenarFila(m.db, m.cliente, m.nomes, CAMPOS, { limite: 10, revisitaDesde: '2026-08-01', revisitaAntes: '2026-10-05T00:00:00Z' })
    expect(r.parou_por_orcamento).toBe(true)
    expect(m.ordem()).not.toContain('monde_ingest_promover')
    expect(m.ordem()).not.toContain('monde_cabecalho_marcar')
  })

  it('marcar que grava menos do que o enviado LANÇA (cabeçalho sumiu)', async () => {
    const m = montar(async (id) => detalhe(Number(id.split('-')[1])))
    m.db.rpc = (async (fn: string, args?: Record<string, unknown>) => {
      if (fn === 'monde_cabecalho_fila') return { data: fila, error: null }
      if (fn === 'monde_pessoa_obter') return { data: {}, error: null }
      if (fn === 'monde_ingest_promover') return { data: { ok: true, inseridas: 3, atualizadas: 0, ignoradas: 0, itens: 3 }, error: null }
      if (fn === 'monde_cabecalho_marcar') return { data: 1, error: null }
      return { data: args ? null : null, error: null }
    }) as MondeDb['rpc']
    await expect(drenarFila(m.db, m.cliente, m.nomes, CAMPOS, { limite: 10, revisitaDesde: '2026-08-01', revisitaAntes: '2026-10-05T00:00:00Z' }))
      .rejects.toThrow(/gravou 1 de 3/)
  })
})

describe('bloqueioDaApuracao — o que só a v3 precisa checar antes de curar', () => {
  const v: ResultadoVarredura = { paginas: 50, registrados: 2500, novos: 3, pendentes: 0, invalidos: 0, chegou_no_corte: true, cursor_final: null, inicio_banco: '2026-10-05T06:05:00-03:00' }
  const a = { api: 700, espelhaveis: 690, welcome: 10, sem_setor: 0, erros: 0, pendentes: 0, espelhaveis_ids: [] }
  it('íntegra ⇒ null', () => expect(bloqueioDaApuracao(v, a)).toBeNull())
  it('varredura que não chegou ao corte bloqueia', () => expect(bloqueioDaApuracao({ ...v, chegou_no_corte: false }, a)).toMatch(/corte/))
  it('linha inválida na lista bloqueia', () => expect(bloqueioDaApuracao({ ...v, invalidos: 1 }, a)).toMatch(/sem id/))
  it('venda do mês ainda na fila bloqueia (pendente NÃO é "sem sale_id")', () => expect(bloqueioDaApuracao(v, { ...a, pendentes: 4 })).toMatch(/fila/))
  it('sem nenhum cabeçalho registrado bloqueia', () => expect(bloqueioDaApuracao({ ...v, inicio_banco: null }, a)).toMatch(/nenhum/))
})
