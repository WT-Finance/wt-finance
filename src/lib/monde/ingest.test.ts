import { describe, it, expect, vi } from 'vitest'

// ingest.ts importa ./client (que é `import 'server-only'`): fora do bundle Next o
// marker lança por design — mock vazio, mesmo padrão dos testes de email/asaas.
// (Pego no fechamento da v5.6.4: o arquivo nasceu sem o mock na v5.6.3 e a suíte
// só quebrou quando o pacote `server-only` passou a resolver de verdade.)
vi.mock('server-only', () => ({}))

import { idsEspelhaveis } from './ingest'

// O conjunto de sale_ids espelháveis é o insumo direto do DELETE da cura (v5.6.3) —
// ALTO do revisor: a superfície que gera a "lista de sobrevivência" precisa de
// cobertura própria. O caso do sale_id nulo é o que arma a guarda de PARIDADE de
// `podeCurar` (contagem×ids): a venda conta em `espelhaveis` mas sai daqui, e sem a
// guarda a linha antiga dela (com sale_id real) viraria candidata a remoção.
describe('idsEspelhaveis (v5.6.3)', () => {
  it('todas com sale_id ⇒ paridade perfeita com a contagem', () => {
    const vendas = [{ sale_id: 'a' }, { sale_id: 'b' }, { sale_id: 'c' }]
    const ids = idsEspelhaveis(vendas)
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(ids.length).toBe(vendas.length)
  })

  it('sale_id nulo SAI do conjunto — e a paridade quebra de propósito (gatilho do bloqueio)', () => {
    const vendas = [{ sale_id: 'a' }, { sale_id: null }, { sale_id: 'c' }]
    const ids = idsEspelhaveis(vendas)
    expect(ids).toEqual(['a', 'c'])
    expect(ids.length).not.toBe(vendas.length) // é ESTA diferença que podeCurar detecta
  })

  it('lista vazia ⇒ conjunto vazio (a RPC 0250 bloqueia conjunto vazio por cinto próprio)', () => {
    expect(idsEspelhaveis([])).toEqual([])
  })
})
