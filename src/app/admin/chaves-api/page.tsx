import { requireArea } from '@/lib/auth/sessao'
import { listarChavesApi } from '@/lib/api-externa/rpc'
import { getDestinatarios, getTiposAdmin } from '@/lib/solicitacoes/rpc'
import { ChavesApiContent } from '@/components/admin/chaves-api/chaves-api-content'
import type { TipoDisponivel } from '@/components/admin/chaves-api/tipos'

// v5.4.0/M2 (+ Round2, 2026-07-28) — "API externa": duas seções reunidas numa
// página só (área RBAC 'solicitacoes'), tema neutro Group. "Tipos expostos"
// (exposição via API + equipes de destino por tipo — antes vivia dentro do
// editor de tipos, movida para cá) + "Chaves de API" (uma chave por
// plataforma integradora: segredo em hash, callback opcional, whitelist de
// tipos, usuário-robô vinculado) + log de chamadas por chave.
//
// NAVEGAÇÃO: esta rota não está na sidebar (mesmo padrão de /admin/solicitacoes,
// que também só é alcançada por link a partir de /solicitacoes — v4.16.0). O
// link de IDA (a partir de /admin/solicitacoes) fica em tipos-content.tsx.

export const dynamic = 'force-dynamic'

export default async function ChavesApiPage() {
  await requireArea('solicitacoes')

  const [chaves, tiposRes, destinatarios] = await Promise.all([
    listarChavesApi(),
    getTiposAdmin(),
    getDestinatarios(),
  ])

  // Whitelist admite tipo ARQUIVADO (uma chave já registrada pode tê-lo
  // selecionado) — escondê-lo do seletor faria o admin removê-lo sem querer ao
  // salvar uma edição. O seletor mostra "(arquivado)" ao lado do nome.
  const tipos: TipoDisponivel[] = (tiposRes ?? [])
    .map(t => ({ id: t.id, nome: t.nome, arquivado: t.arquivado }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const erroCarga = chaves === null
    ? 'Não foi possível carregar as chaves de API. Recarregue a página.'
    : tiposRes === null
      ? 'Não foi possível carregar os tipos de solicitação — a whitelist e os tipos expostos podem aparecer incompletos. Recarregue a página.'
      : destinatarios === null
        ? 'Não foi possível carregar as equipes — a seção de tipos expostos pode aparecer incompleta. Recarregue a página.'
        : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">API externa</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Tipos expostos (equipes de destino) e chaves de API para plataformas externas
          abrirem e consultarem solicitações
        </p>
      </div>

      <ChavesApiContent
        chaves={chaves ?? []}
        tipos={tipos}
        tiposAdmin={tiposRes ?? []}
        roles={destinatarios?.roles ?? []}
        erroCarga={erroCarga}
      />
    </div>
  )
}
