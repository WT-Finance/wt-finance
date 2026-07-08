'use server'

// Onboarding "Welcome to Janus" (v4.40.0, ADR-0145) — flag POR USUÁRIO no banco
// (app.rbac_usuarios.onboarding_visto_em, migration 0174; nunca localStorage — multi-dispositivo).
// FAIL-SAFE em tudo: o onboarding jamais trava o app — consulta que falhe conta como "visto"
// (não exibe) e a marcação que falhe é silenciosa (o modal fecha localmente de qualquer jeito;
// na próxima carga ele volta, o que é preferível a travar).

import { getServerClient } from '@/lib/supabase/server'

/** true = já viu (não exibir). Erro/sessão inválida → true (fail-safe: não exibe). */
export async function getOnboardingVisto(): Promise<boolean> {
  try {
    const db = await getServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC fora dos tipos gerados (padrão do projeto)
    const res = await (db.rpc as any)('onboarding_visto')
    if (res?.error) return true
    return res?.data === false ? false : true
  } catch {
    return true
  }
}

/** Grava a 1ª visualização (idempotente no banco). Nunca lança. */
export async function marcarOnboardingVisto(): Promise<void> {
  try {
    const db = await getServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC fora dos tipos gerados (padrão do projeto)
    await (db.rpc as any)('marcar_onboarding_visto')
  } catch {
    // silencioso — fail-safe (ver cabeçalho)
  }
}
