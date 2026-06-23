import { z } from 'zod'

// Contratos Zod do módulo de Solicitações (v4.16.0, ADR-0112). Espelham o RETORNO
// REAL das RPCs (0128/0129) — validados por parseRpc e por rpc-contrato.test.ts.
// Campos que a RPC às vezes não emite são .optional()/.nullable() (lição v4.12.1).

export const TIPOS_CAMPO = ['texto_curto','texto_longo','numero','moeda','data','selecao','anexo'] as const
export type TipoCampo = (typeof TIPOS_CAMPO)[number]
export const STATUS_SOLIC = ['aberta','concluida','rejeitada','cancelada'] as const
export type StatusSolic = (typeof STATUS_SOLIC)[number]

// Definição de campo (para o construtor do admin e o motor de render da abertura).
export const campoDefSchema = z.object({
  id:          z.number().optional(),
  rotulo:      z.string(),
  tipo_campo:  z.enum(TIPOS_CAMPO),
  obrigatorio: z.boolean(),
  opcoes:      z.array(z.string()).nullable().optional(),
  ordem:       z.number().optional(),
  // Regra de data por campo (v4.19.0). Só fazem sentido quando tipo_campo='data'.
  // .optional() (não só .nullable()): a RPC pode NÃO emitir (campo antigo / não-data)
  // → optional aceita undefined; nullable sozinho reprovaria e parseRpc devolveria null
  // (HTTP 500). data_aviso_dias_futuro é nullable+optional (null = sem aviso).
  data_permite_passado:   z.boolean().optional(),
  data_aviso_dias_futuro: z.number().int().nullable().optional(),
})
export type CampoDef = z.infer<typeof campoDefSchema>

// Resposta gravada (snapshot imutável por solicitação).
export const respostaSchema = z.object({
  campo_id:    z.number(),
  rotulo:      z.string(),
  tipo_campo:  z.enum(TIPOS_CAMPO),
  obrigatorio: z.boolean().optional(),
  opcoes:      z.array(z.string()).nullable().optional(),
  valor:       z.string().nullable(),
})

export const anexoSchema = z.object({
  id:      z.number(),
  campo_id: z.number().nullable().optional(),
  nome:    z.string(),
  mime:    z.string(),
  tamanho: z.number(),
})

const destinatarioSchema = z.object({ tipo: z.enum(['usuario','role']), rotulo: z.string().nullable() })

// Uma solicitação (saída de solic_json — minhas/caixa/detalhe).
export const solicitacaoSchema = z.object({
  id:                 z.number(),
  tipo_id:            z.number(),
  tipo_nome:          z.string().nullable(),
  solicitante_email:  z.string().nullable(),
  destinatario:       destinatarioSchema,
  data_limite:        z.string(),               // date puro 'AAAA-MM-DD'
  descricao:          z.string().nullable(),
  status:             z.enum(STATUS_SOLIC),
  respostas:          z.array(respostaSchema),
  decidido_em:        z.string().nullable(),
  decidido_por_email: z.string().nullable(),
  justificativa:      z.string().nullable(),
  criado_em:          z.string(),
  sou_solicitante:    z.boolean().optional(),
  sou_atendente:      z.boolean().optional(),
  anexos:             z.array(anexoSchema),
}).passthrough()
export type Solicitacao = z.infer<typeof solicitacaoSchema>

export const solicitacoesListaSchema = z.array(solicitacaoSchema)

// Tipos disponíveis para abertura (com campos).
export const tipoAberturaSchema = z.object({
  id:     z.number(),
  nome:   z.string(),
  campos: z.array(campoDefSchema),
})
export const tiposAberturaSchema = z.array(tipoAberturaSchema)
export type TipoAbertura = z.infer<typeof tipoAberturaSchema>

// Destinatários elegíveis.
export const destinatariosSchema = z.object({
  usuarios: z.array(z.object({ user_id: z.string(), email: z.string() })),
  roles:    z.array(z.object({ id: z.number(), nome: z.string() })),
})
export type Destinatarios = z.infer<typeof destinatariosSchema>

// Admin: tipos com contagens (para a lista do admin).
export const tipoAdminSchema = z.object({
  id:             z.number(),
  nome:           z.string(),
  arquivado:      z.boolean(),
  n_campos:       z.number(),
  n_solicitacoes: z.number(),
  campos:         z.array(campoDefSchema),
})
export const tiposAdminSchema = z.array(tipoAdminSchema)
export type TipoAdmin = z.infer<typeof tipoAdminSchema>

// ── Movimentações (v4.19.1) — lista única de AUDITORIA, DERIVADA das colunas de
// app.solicitacao via RPC solic_movimentacoes() (migration 0142). Gestão-only.
// Cada item = abertura (solicitante/criado_em) OU decisão terminal (decidido_por/
// decidido_em/status→ação). A RPC emite SEMPRE as 7 chaves (nenhuma .optional());
// ator/tipo_nome/detalhe podem vir NULL → .nullable() (ator nulo se o usuário sumiu;
// detalhe nulo na abertura e na decisão sem justificativa). acao é z.string() livre
// (rótulo derivado) p/ não quebrar o parse se um rótulo novo surgir.
export const movimentacaoSchema = z.object({
  solicitacao_id: z.number(),
  tipo_nome:      z.string().nullable(),
  acao:           z.string(),                 // 'Abertura' | 'Conclusão' | 'Rejeição' | 'Cancelamento'
  status_atual:   z.enum(STATUS_SOLIC),
  ator:           z.string().nullable(),      // nome (ou e-mail) de quem fez a ação
  em:             z.string(),                 // timestamptz (UTC) — exibir via fmtDataHoraSP
  detalhe:        z.string().nullable(),      // justificativa (rejeição); senão null
})
export type Movimentacao = z.infer<typeof movimentacaoSchema>

export const movimentacoesSchema = z.array(movimentacaoSchema)

// ── Envolvidos para notificação por e-mail (v4.25.0) — retorno de solic_emails_envolvidos.
// A RPC (gated por pode_ver_solic) resolve a role → membros ativos e devolve SÓ os e-mails
// desta solicitação + o contexto mínimo do corpo. Shape estável (todas as chaves sempre).
export const emailsEnvolvidosSchema = z.object({
  tipo_nome:          z.string().nullable(),
  autor_rotulo:       z.string().nullable(),   // v4.25.1: nome (fallback e-mail) do solicitante
  atribuido_rotulo:   z.string().nullable(),   // nome da role OU nome (fallback e-mail) do usuário
  criado_em_fmt:      z.string().nullable(),   // 'DD/MM/AAAA às HH:MM' (SP)
  decidido_em_fmt:    z.string().nullable(),   // idem; null se ainda aberta
  envolvidos_emails:  z.array(z.string()),
})
export type EmailsEnvolvidos = z.infer<typeof emailsEnvolvidosSchema>
