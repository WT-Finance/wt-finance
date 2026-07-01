import { requireArea } from '@/lib/auth/sessao'
import FaturamentoCorpContent from '@/components/financeiro/faturamento-corp-content'
import type { ClienteCorp } from '@/components/financeiro/cadastro-clientes'
import { asaasAmbiente, asaasConfigurado } from '@/lib/asaas/client'
import { getServerClient } from '@/lib/supabase/server'

// Faturamento Corporativo (v4.33.0/Fase 3). Duas abas: Emissão (Fases 1a/1b/2, preservada) e
// Cadastro de Clientes (esta fase). Área RBAC própria e apertada 'financeiro/faturamento-corp'.
// O ambiente do Asaas (sandbox/produção) é resolvido SERVER-SIDE; o cadastro é carregado SSR.
export default async function FaturamentoCorpPage() {
  await requireArea('financeiro/faturamento-corp')

  // Carrega o cadastro (SSR) para a aba Cadastro. PROTEGIDO: uma falha aqui NÃO pode derrubar
  // a página inteira nem a aba Emissão (não-regressão) — em erro, a aba Cadastro nasce vazia.
  let clientes: ClienteCorp[] = []
  try {
    const db = await getServerClient()
    // `as any`: RPC não está nos tipos gerados do supabase (padrão do projeto).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db.rpc as any)('listar_clientes_corp')
    if (Array.isArray(data)) clientes = data as ClienteCorp[]
  } catch {
    clientes = []
  }

  return (
    <div className="max-w-5xl mx-auto px-4">
      <FaturamentoCorpContent ambiente={asaasAmbiente()} configurado={asaasConfigurado()} clientes={clientes} />
    </div>
  )
}
