import { describe, it, expect, vi } from 'vitest'
import { parseRpc } from '../schemas-rpc'
import { rendimentoFloatSchema, taxasCdiSchema } from './schemas-float'

// v5.9.4 (B4) — invariante 6 do briefing: introduzir schema nas RPCs do float NÃO pode criar
// caminho novo de erro na tela. `parseRpc` que reprova devolve `null`, e `null` é exatamente o
// que os call-sites já tratavam como "sem dado" (route: bloco do float não aparece;
// weddings-content: `taxasCdi` undefined). Este teste é offline — o shape REAL das RPCs é
// coberto pelos casos de `rpc-contrato.test.ts` (CONTRATOS_PARSE_RPC).

describe('schemas do float — degradação preservada (v5.9.4)', () => {
  it('payload válido passa e preserva campos extras (passthrough)', () => {
    const taxas = taxasCdiSchema.safeParse({
      taxa_vigente_mes: '2026-08-01',
      meses: [{ mes: '2026-08-01', taxa: 0.0115, origem: 'bacen_sgs', extra: 1 }],
    })
    expect(taxas.success).toBe(true)

    const float = rendimentoFloatSchema.safeParse({
      taxa_vigente_mes: '2026-08-01',
      operacoes: [{
        operacao: 'OP-1', rendimento: 10, rendimento_positivo: 12, custo_negativo: -2,
        saldo_medio: 1000, meses_positivos: 3, meses_total: 4, mes_inicio: '2026-01-01', mes_fim: '2026-04-01',
      }],
    })
    expect(float.success).toBe(true)
  })

  it('payload inválido → parseRpc devolve null (mesmo caminho de "sem dado"), sem lançar', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const a = parseRpc(taxasCdiSchema, { data: { meses: 'não é lista' }, error: null }, 'get_taxas_cdi')
      const b = parseRpc(rendimentoFloatSchema, { data: { operacoes: [{ operacao: 42 }] }, error: null }, 'get_rendimento_float')
      const c = parseRpc(taxasCdiSchema, { data: null, error: { message: 'boom' } }, 'get_taxas_cdi')
      expect(a).toBeNull()
      expect(b).toBeNull()
      expect(c).toBeNull()
      expect(erro).toHaveBeenCalled() // drift/erro é LOGADO, não engolido em silêncio
    } finally {
      erro.mockRestore()
    }
  })
})
