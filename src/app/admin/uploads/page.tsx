import { redirect } from 'next/navigation'

// v6.1.1 — o Upload de Arquivos passou para dentro do grupo "Ingestão de Dados"
// (/admin/ingestao/upload). Esta rota permanece apenas como redirecionamento para links antigos.
export default function AdminUploadsRedirect() {
  redirect('/admin/ingestao/upload')
}
