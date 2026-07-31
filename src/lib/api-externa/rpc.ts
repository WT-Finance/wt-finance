import 'server-only'
import { getServerClient } from '@/lib/supabase/server'
import type { ChaveApi, LogChamada } from '@/components/admin/api-externa/tipos'

// Leituras do módulo de Chaves de API (v5.4.0/M2), consumidas pela page RSC e
// pelas server actions. Cliente de SESSÃO (authenticated) — o banco valida a
// área 'solicitacoes' do chamador via exigir_acesso (0211).
//
// As RPCs api_chave_listar/api_log_listar são NOVAS: não estão em
// src/types/database.ts (congelado desde ~v4.29) — helper de tipagem FROUXA
// (cast + narrowing manual), mesmo padrão de src/app/admin/acessos/page.tsx,
// em vez de regenerar o database.ts ou adicionar Zod (que exigiria um caso novo
// em rpc-contrato.test.ts por RPC).

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

async function call(fn: string, args: Record<string, unknown> = {}): Promise<{ data: unknown; error: { message: string } | null }> {
  const sb = await getServerClient()
  return (sb.rpc as unknown as BoundRpc).bind(sb)(fn, args)
}

function comoObjArray(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return []
  return data.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
}

function comoTipos(data: unknown): { id: number; nome: string }[] {
  return comoObjArray(data)
    .map(x => ({ id: typeof x.id === 'number' ? x.id : 0, nome: typeof x.nome === 'string' ? x.nome : '' }))
    .filter(t => t.id !== 0)
}

function comoChave(x: Record<string, unknown>): ChaveApi | null {
  if (typeof x.id !== 'number') return null
  const robo = (typeof x.robo === 'object' && x.robo !== null && !Array.isArray(x.robo))
    ? (x.robo as Record<string, unknown>)
    : {}
  return {
    id:                   x.id,
    plataforma:           typeof x.plataforma === 'string' ? x.plataforma : '',
    callback_url:         typeof x.callback_url === 'string' ? x.callback_url : null,
    tem_callback_segredo: x.tem_callback_segredo === true,
    whitelist_tipos:      comoTipos(x.whitelist_tipos),
    robo: {
      user_id: typeof robo.user_id === 'string' ? robo.user_id : '',
      email:   typeof robo.email === 'string' ? robo.email : '',
      nome:    typeof robo.nome === 'string' ? robo.nome : null,
    },
    ativo:             x.ativo === true,
    criado_em:         typeof x.criado_em === 'string' ? x.criado_em : '',
    revogado_em:       typeof x.revogado_em === 'string' ? x.revogado_em : null,
    ultima_chamada_em: typeof x.ultima_chamada_em === 'string' ? x.ultima_chamada_em : null,
  }
}

/** Lista as chaves de API (tela /admin/api-externa). null = a RPC falhou. */
export async function listarChavesApi(): Promise<ChaveApi[] | null> {
  const { data, error } = await call('api_chave_listar')
  if (error) { console.error('[api_chave_listar]', error.message); return null }
  return comoObjArray(data).map(comoChave).filter((c): c is ChaveApi => c !== null)
}

/** Últimas chamadas registradas para uma chave (modal de log). null = a RPC falhou. */
export async function listarLogApi(chaveId: number, limite = 50): Promise<LogChamada[] | null> {
  const { data, error } = await call('api_log_listar', { p_chave_id: chaveId, p_limit: limite })
  if (error) { console.error('[api_log_listar]', error.message); return null }
  return comoObjArray(data).map(x => ({
    rota:      typeof x.rota === 'string' ? x.rota : '',
    status:    typeof x.status === 'number' ? x.status : 0,
    detalhe:   typeof x.detalhe === 'string' ? x.detalhe : null,
    criado_em: typeof x.criado_em === 'string' ? x.criado_em : '',
  }))
}
