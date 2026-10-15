import 'server-only'
import { getAdminClient } from '@/lib/supabase/admin'

// Foto de prazos (PMR/PMP) — v6.4.0, migration 0297.
//
// Depois que uma carga de `lancamentos-aberto` é APLICADA, o servidor chama
// `public.registrar_foto_prazos(p_carga_id)`: grava um ponto da série histórica de prazos (saldo a
// receber/pagar do Aberto ÷ fluxo dos 12 meses fechados). A RPC é service_role-only e mora fora do
// pipeline do `ingestor` de propósito — por isso usa o client de METADADO (`getAdminClient`, o mesmo
// de `somaPorAno` e do log da carga), não a credencial que aplica a carga.
//
// FAIL-SOFT por desenho: a carga JÁ foi promovida quando isto roda, e a foto é uma camada de
// histórico, não parte do dado. Qualquer falha — erro devolvido pelo SDK (que NÃO lança, skill
// `contrato-rpc-front` §2b) ou exceção de rede — vira um AVISO para `alarmes[]` da resposta; nada aqui
// lança e nada desfaz a carga. Chamar `.rpc(...)` direto no client (nunca destacado) preserva o `this`.

/** Texto de `alarmes[]` quando a foto não foi registrada. O motivo vai ao log do servidor, não à UI. */
export const AVISO_FOTO_PRAZOS_FALHOU =
  'A carga foi aplicada, mas a foto de prazos (PMR/PMP) não foi registrada — ver o log do servidor. ' +
  'A próxima carga de Lançamentos por Vencimento (em aberto) registra a seguinte.'

/** `null` quando a foto foi registrada; senão o aviso (fail-soft — nunca lança). */
export async function registrarFotoDePrazos(cargaId: string): Promise<string | null> {
  try {
    const { error } = await getAdminClient().rpc('registrar_foto_prazos', { p_carga_id: cargaId })
    if (error) {
      console.error(`[ingestao/foto-prazos] registrar_foto_prazos(${cargaId}) falhou — a carga NÃO é desfeita por isto:`, error.message)
      return AVISO_FOTO_PRAZOS_FALHOU
    }
    return null
  } catch (err) {
    console.error(`[ingestao/foto-prazos] registrar_foto_prazos(${cargaId}) lançou — a carga NÃO é desfeita por isto:`, err)
    return AVISO_FOTO_PRAZOS_FALHOU
  }
}
