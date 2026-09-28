import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
// storage.ts (e, transitivamente, @/lib/supabase/admin) importam 'server-only' — neutralizado
// no vitest, padrão já usado no projeto (ex.: src/lib/asaas/customers.test.ts). Este teste só
// exercita as PARTES PURAS: nenhuma chamada de rede, nenhum mock do cliente Supabase inteiro.
vi.mock('server-only', () => ({}))

import {
  BUCKET_INGESTAO,
  LIMITE_BYTES_ARQUIVO,
  LIMITE_BYTES_CARGA,
  ErroIngestaoStorage,
  caminhoCru,
  ehCaminhoDaCarga,
  expiraEmDoToken,
  sha256Hex,
  sha256Confere,
} from './storage'
import { sanitizarNomeArquivo } from '@/lib/storage/nome-arquivo'

const AGORA = new Date('2026-09-21T12:00:00-03:00')
const CARGA_1 = '3f6c1234-aaaa-bbbb-cccc-1234567890ab'
const CARGA_2 = '9a1b2c3d-dddd-eeee-ffff-abcdefabcdef'

describe('BUCKET_INGESTAO e limites do contrato §2.1', () => {
  it('bucket é o nome fixo do contrato', () => {
    expect(BUCKET_INGESTAO).toBe('ingestao-cru')
  })
  it('50 MB por arquivo, 200 MB por carga — valores exatos do contrato', () => {
    expect(LIMITE_BYTES_ARQUIVO).toBe(52_428_800)
    expect(LIMITE_BYTES_CARGA).toBe(209_715_200)
  })
})

describe('caminhoCru — forma canônica do contrato §2.1 (base/aaaa/mm/cargaId-indice-nome)', () => {
  it('monta exatamente o exemplo do contrato (§2.1)', () => {
    const path = caminhoCru('vendas-produto', CARGA_1, 1, '25-26.xlsx', AGORA)
    expect(path).toBe(`vendas-produto/2026/09/${CARGA_1}-1-25-26.xlsx`)
  })

  it('aaaa/mm vêm do MOMENTO DA EMISSÃO, não do nome do arquivo', () => {
    // O "2026" no nome do arquivo é o período do DADO, não a data de hoje — o path usa `agora`.
    const emJaneiro = new Date('2026-01-05T09:00:00-03:00')
    const path = caminhoCru('vendas-produto', CARGA_1, 1, 'vendas-2026.xlsx', emJaneiro)
    expect(path.startsWith('vendas-produto/2026/01/')).toBe(true)
  })

  it('nome com acento, cedilha e travessão de autocorreção vira chave ASCII-only válida', () => {
    // Caso realista do briefing: "Vendas Operação Própria – 2026.xlsx".
    const nomeOriginal = 'Vendas Operação Própria – 2026.xlsx'
    const path = caminhoCru('vendas-produto', CARGA_1, 1, nomeOriginal, AGORA)

    expect(path).toMatch(/^[A-Za-z0-9._/-]+$/) // chave de Storage válida (v5.4.3)
    expect(path).toBe(`vendas-produto/2026/09/${CARGA_1}-1-${sanitizarNomeArquivo(nomeOriginal)}`)
  })

  it('dois arquivos da MESMA carga com o MESMO nome original não colidem (índice diferencia)', () => {
    const p1 = caminhoCru('vendas-produto', CARGA_1, 1, '25-26.xlsx', AGORA)
    const p2 = caminhoCru('vendas-produto', CARGA_1, 2, '25-26.xlsx', AGORA)
    expect(p1).not.toBe(p2)
  })
})

describe('ehCaminhoDaCarga — guarda de autorização do passo 3 (§2.3)', () => {
  const path = caminhoCru('vendas-produto', CARGA_1, 1, '25-26.xlsx', AGORA)

  it('aceita o path legítimo, da própria base e do próprio carga_id', () => {
    expect(ehCaminhoDaCarga(path, 'vendas-produto', CARGA_1)).toBe(true)
  })

  it('recusa path de OUTRA base', () => {
    expect(ehCaminhoDaCarga(path, 'lancamentos-aberto', CARGA_1)).toBe(false)
  })

  it('recusa path de OUTRO carga_id', () => {
    expect(ehCaminhoDaCarga(path, 'vendas-produto', CARGA_2)).toBe(false)
  })

  it('recusa tentativa de escapar do prefixo do bucket (path traversal)', () => {
    expect(ehCaminhoDaCarga('vendas-produto/2026/09/../../../etc/passwd', 'vendas-produto', CARGA_1)).toBe(false)
    expect(ehCaminhoDaCarga('/etc/passwd', 'vendas-produto', CARGA_1)).toBe(false)
    expect(ehCaminhoDaCarga(`vendas-produto/2026/09/${CARGA_1}-1-a\\b.xlsx`, 'vendas-produto', CARGA_1)).toBe(false)
  })

  it('recusa forma malformada (segmentos a mais/a menos, ano/mês fora de forma)', () => {
    expect(ehCaminhoDaCarga(`vendas-produto/${CARGA_1}-1-25-26.xlsx`, 'vendas-produto', CARGA_1)).toBe(false)
    expect(ehCaminhoDaCarga(`vendas-produto/26/09/${CARGA_1}-1-25-26.xlsx`, 'vendas-produto', CARGA_1)).toBe(false)
    expect(ehCaminhoDaCarga(`vendas-produto/2026/13/${CARGA_1}-1-25-26.xlsx`, 'vendas-produto', CARGA_1)).toBe(false)
  })

  it('recusa nome de arquivo que só tem o carga_id, sem sufixo depois do hífen', () => {
    expect(ehCaminhoDaCarga(`vendas-produto/2026/09/${CARGA_1}-`, 'vendas-produto', CARGA_1)).toBe(false)
    expect(ehCaminhoDaCarga(`vendas-produto/2026/09/${CARGA_1}`, 'vendas-produto', CARGA_1)).toBe(false)
  })
})

describe('sha256Hex', () => {
  it('bate com o vetor de teste conhecido "abc" (FIPS 180)', () => {
    const bytes = new TextEncoder().encode('abc')
    expect(sha256Hex(bytes)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('concorda com node:crypto para bytes arbitrários (oráculo independente)', () => {
    const bytes = new TextEncoder().encode('Janus — ingestão v6.0.0, checksum R$ 1.234,56')
    const esperado = createHash('sha256').update(bytes).digest('hex')
    expect(sha256Hex(bytes)).toBe(esperado)
  })

  it('é hex minúsculo de 64 chars e sensível a qualquer byte', () => {
    const a = sha256Hex(new Uint8Array([1, 2, 3]))
    const b = sha256Hex(new Uint8Array([1, 2, 4]))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })
})

describe('sha256Confere — conferência do §2.3 passo 4', () => {
  const bytes = new TextEncoder().encode('conteudo do arquivo cru')
  const hex = sha256Hex(bytes)

  it('confere igual quando o hash declarado bate (tolera maiúscula e espaço)', () => {
    expect(sha256Confere(hex, bytes)).toBe(true)
    expect(sha256Confere(hex.toUpperCase(), bytes)).toBe(true)
    expect(sha256Confere(`  ${hex}  `, bytes)).toBe(true)
  })

  it('diverge quando o hash declarado NÃO bate (422 SHA256_DIVERGE na rota)', () => {
    expect(sha256Confere('0'.repeat(64), bytes)).toBe(false)
  })
})

/** Fabrica um token no formato header.payload.assinatura (sem assinar de verdade — só a forma
 *  que `expiraEmDoToken` lê) com o `exp` pedido, no mesmo molde de `roleDoToken` em
 *  `@/lib/auth/credencial-maquina.ts`. */
function tokenComExp(expSegundos: number | undefined): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(expSegundos === undefined ? {} : { exp: expSegundos })).toString(
    'base64url',
  )
  return `${header}.${payload}.assinatura-fake`
}

describe('expiraEmDoToken — validade REAL da URL assinada, lida do claim exp', () => {
  it('lê o claim exp (epoch em segundos) e devolve ISO 8601', () => {
    const expSeg = Math.floor(Date.UTC(2026, 8, 21, 14, 15, 0) / 1000) // 2026-09-21T14:15:00Z
    expect(expiraEmDoToken(tokenComExp(expSeg))).toBe('2026-09-21T14:15:00.000Z')
  })

  it('lança ErroIngestaoStorage (ERRO_STORAGE) quando o token não tem claim exp', () => {
    expect(() => expiraEmDoToken(tokenComExp(undefined))).toThrow(ErroIngestaoStorage)
  })

  it('lança ErroIngestaoStorage quando o token não é um JWT de 3 partes', () => {
    expect(() => expiraEmDoToken('token-sem-pontos')).toThrow(ErroIngestaoStorage)
  })
})
