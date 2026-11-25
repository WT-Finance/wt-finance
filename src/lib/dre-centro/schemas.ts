import { z } from 'zod'
import { dreLinhaSchema } from '@/lib/dre/schemas'
import { CENTROS, type CentroId } from './centros'
import type { DreCentroAno } from './tipos'

// ── Contrato de `get_dre_caixa_centro(p_ano, p_ajuste)` (0306) — v6.5.1 ──────────────────────────
// O schema reflete o retorno REAL da RPC (snake_case, como as irmãs); `paraDreCentroAno` converte
// para o contrato do front (`tipos.ts`), consumido pelo módulo puro (atribuição, linhas, visões).
// Objetos raiz com `.passthrough()`: chave nova na RPC é aditiva e não quebra o front no ar
// (skill banco-e-rpc §5); TIRAR chave quebra — destrutiva pós-deploy.

const doze = z.array(z.number()).length(12)

function porCentro<T extends z.ZodTypeAny>(s: T) {
  return z.object(Object.fromEntries(CENTROS.map((c) => [c, s])) as Record<CentroId, T>)
}

export const dreCaixaCentroSchema = z.object({
  ano:          z.number(),
  hoje:         z.string(),
  relacao:      z.enum(['fechado', 'corrente', 'futuro']),
  mes_corrente: z.number().nullable(),
  ajuste:       z.boolean(),
  arvores:      porCentro(z.array(dreLinhaSchema)),
  recebiveis:   z.array(z.object({
    dono:            z.enum(CENTROS),
    mes_antecipacao: z.number().int(),
    mes_vencimento:  z.number().int(),
    valor:           z.number(),
  })),
  taxa_monde:   porCentro(doze),
  eventos:      z.array(z.object({
    data:          z.string(),
    conta:         z.string(),
    valor:         z.number(),
    identificado:  z.number(),
    n_recebiveis:  z.number().int(),
    taxa_registro: z.number(),
    taxa_monde:    z.number(),
    motivo:        z.string().nullable(),
  })),
  cobertura: z.object({ valor_movimentado: z.number(), sem_centro: z.number() }),
  anos_com_centro:            z.array(z.number().int()),
  centro_carregado_em:        z.string().nullable(),
  antecipacoes_atualizado_em: z.string().nullable(),
}).passthrough()

export type DreCaixaCentro = z.infer<typeof dreCaixaCentroSchema>

/** Leitura → contrato do módulo puro. */
export function paraDreCentroAno(r: DreCaixaCentro): DreCentroAno {
  return {
    ano: r.ano,
    hoje: r.hoje,
    relacao: r.relacao,
    mes_corrente: r.mes_corrente,
    arvores: r.arvores,
    recebiveis: r.recebiveis.map((x) => ({
      dono: x.dono, mesAntecipacao: x.mes_antecipacao, mesVencimento: x.mes_vencimento, valor: x.valor,
    })),
    taxaMonde: r.taxa_monde,
    eventos: r.eventos.map((e) => ({
      data: e.data, conta: e.conta, valor: e.valor, identificado: e.identificado, nRecebiveis: e.n_recebiveis,
      taxaRegistro: e.taxa_registro, taxaMonde: e.taxa_monde, motivo: e.motivo ?? undefined,
    })),
    cobertura: { valorMovimentado: r.cobertura.valor_movimentado, semCentro: r.cobertura.sem_centro },
  }
}
