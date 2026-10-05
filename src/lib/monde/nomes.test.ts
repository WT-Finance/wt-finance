import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { CacheNomes, carregarCampos, TTL_PESSOA_DIAS } from './nomes'
import { OrcamentoEsgotado, type ClienteMonde } from './client'
import { zVendaDetalhe } from './schemas'
import type { MondeDb } from './ingest'

// Tudo SINTÉTICO.
const AGORA = Date.parse('2026-10-05T12:00:00Z')
const VELHA = new Date(AGORA - (TTL_PESSOA_DIAS + 1) * 86_400_000).toISOString()
const NOVA = new Date(AGORA - 86_400_000).toISOString()

function dbCom(pessoas: Record<string, { nome: string | null; cpf_cnpj: string | null; atualizado_em: string }>) {
  const gravadas: unknown[] = []
  const db: MondeDb = {
    rpc: async (fn, args) => {
      if (fn === 'monde_pessoa_obter') return { data: pessoas, error: null }
      if (fn === 'monde_pessoa_registrar') { gravadas.push(...(args!.p_pessoas as unknown[])); return { data: 1, error: null } }
      return { data: null, error: null }
    },
  }
  return { db, gravadas }
}
function cliente(pessoa: () => Promise<unknown>, restaMs = 200_000) {
  return { pessoa: vi.fn(pessoa), produto: vi.fn(async () => null), restaMs: () => restaMs } as unknown as ClienteMonde
}
const venda = zVendaDetalhe.parse({
  id: 's1', sale_number: 1, sale_date: '2026-10-01', payer: { id: 'p1' }, seller: null,
  totals: { final_amount: 1, revenue: 0 },
})

describe('CacheNomes.preparar', () => {
  it('re-busca de nome VELHO que volta vazia (404/cadastro mesclado) MANTÉM o nome antigo', async () => {
    const { db, gravadas } = dbCom({ p1: { nome: 'Fulano Antigo', cpf_cnpj: '123', atualizado_em: VELHA } })
    const c = new CacheNomes(db, cliente(async () => null), () => AGORA)
    await c.preparar([venda])
    expect(c.resolvedor({ campoSetor: 7, campoVendedorWeddings: 11 }).pessoa('p1')).toEqual({ nome: 'Fulano Antigo', cpf_cnpj: '123' })
    expect(gravadas).toEqual([{ id: 'p1', nome: 'Fulano Antigo', cpf_cnpj: '123' }]) // só renova a data
  })

  it('nome velho e SEM sobra de orçamento: não re-busca, usa o velho', async () => {
    const { db } = dbCom({ p1: { nome: 'Fulano', cpf_cnpj: null, atualizado_em: VELHA } })
    const cl = cliente(async () => ({ id: 'p1', name: 'Novo' }), 10_000)
    const c = new CacheNomes(db, cl, () => AGORA)
    await c.preparar([venda])
    expect(cl.pessoa).not.toHaveBeenCalled()
    expect(c.resolvedor({ campoSetor: 7, campoVendedorWeddings: null }).pessoa('p1')?.nome).toBe('Fulano')
  })

  it('nome recente não vai à API', async () => {
    const { db } = dbCom({ p1: { nome: 'Fulano', cpf_cnpj: null, atualizado_em: NOVA } })
    const cl = cliente(async () => ({ id: 'p1', name: 'Outro' }))
    await new CacheNomes(db, cl, () => AGORA).preparar([venda])
    expect(cl.pessoa).not.toHaveBeenCalled()
  })

  it('nome AUSENTE e orçamento esgotado: LANÇA (a venda espera na fila, nunca é gravada sem nome)', async () => {
    const { db } = dbCom({})
    const c = new CacheNomes(db, cliente(async () => { throw new OrcamentoEsgotado() }), () => AGORA)
    await expect(c.preparar([venda])).rejects.toBeInstanceOf(OrcamentoEsgotado)
  })
})

describe('carregarCampos', () => {
  it('acha os campos pelo NOME', async () => {
    const cl = { camposPersonalizados: async () => ({ data: [{ id: 7, name: 'Setor' }, { id: 11, name: 'Vendedor(a) Responsável - Grupo' }] }) } as unknown as ClienteMonde
    expect(await carregarCampos(cl)).toEqual({ campoSetor: 7, campoVendedorWeddings: 11 })
  })
  it('sem o campo "Setor" ABORTA — toda venda viraria sem_setor e a cura apagaria o mês', async () => {
    const cl = { camposPersonalizados: async () => ({ data: [{ id: 11, name: 'Vendedor(a) Responsável - Grupo' }] }) } as unknown as ClienteMonde
    await expect(carregarCampos(cl)).rejects.toThrow(/Setor/)
  })
})
