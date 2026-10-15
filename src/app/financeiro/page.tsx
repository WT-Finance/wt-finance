import { redirect } from 'next/navigation'
import { requireArea } from '@/lib/auth/sessao'

export default async function FinanceiroPage() {
  // v4.13: guard de área (ADR-0109) — destino depende da permissão do usuário
  const s = await requireArea(['financeiro/fluxo-caixa', 'financeiro/gerencial', 'financeiro/acervo', 'financeiro/acervo/gestao', 'financeiro/geral'])
  if (s.permissoes.includes('financeiro/fluxo-caixa')) {
    redirect('/financeiro/fluxo-caixa')
  }
  if (s.permissoes.includes('financeiro/gerencial')) {
    redirect('/financeiro/fluxo-caixa/gerencial')
  }
  // Acervo de Documentos (v4.34.0): fallback para quem só tem essa área (ver ou gestão).
  if (s.permissoes.includes('financeiro/acervo') || s.permissoes.includes('financeiro/acervo/gestao')) {
    redirect('/financeiro/acervo')
  }
  // Financeiro · Geral (v6.4.0): fallback para quem só tem a visão executiva (a diretoria). Depois das
  // áreas que já existiam — quem as tem continua indo para onde ia.
  if (s.permissoes.includes('financeiro/geral')) {
    redirect('/financeiro/geral')
  }
  redirect('/financeiro/fluxo-caixa/gerencial')
}
