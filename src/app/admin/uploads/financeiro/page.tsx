import { redirect } from 'next/navigation'

// v4.8 — unificação: as bases financeiras (Lançamentos por Categoria e
// Fluxo de Caixa CAP/CAR) migraram para a página única /admin/uploads.
// Esta rota permanece apenas como redirecionamento para links antigos.
export default function AdminUploadsFinanceiroRedirect() {
  redirect('/admin/uploads')
}
