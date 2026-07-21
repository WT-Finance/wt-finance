import { requireArea } from '@/lib/auth/sessao'
import { listarChavesApi } from '@/lib/api-externa/rpc'
import { getTiposAdmin } from '@/lib/solicitacoes/rpc'
import { ChavesApiContent } from '@/components/admin/chaves-api/chaves-api-content'
import type { TipoDisponivel } from '@/components/admin/chaves-api/tipos'

// v5.4.0/M2 — Chaves de API para a API externa de Solicitações: uma chave por
// plataforma integradora (segredo em hash, callback opcional, whitelist de
// tipos, usuário-robô vinculado). Rota de plataforma (área 'solicitacoes' —
// gestão de Solicitações governa as chaves), tema neutro Group.
//
// NAVEGAÇÃO: esta rota não está na sidebar (mesmo padrão de /admin/solicitacoes,
// que também só é alcançada por link a partir de /solicitacoes — v4.16.0). O
// link de IDA (a partir de /admin/solicitacoes) fica para outra missão desta
// versão (aquele arquivo está fora do escopo desta entrega); aqui só o link de
// VOLTA, dentro de ChavesApiContent.

export const dynamic = 'force-dynamic'

export default async function ChavesApiPage() {
  await requireArea('solicitacoes')

  const [chaves, tiposRes] = await Promise.all([
    listarChavesApi(),
    getTiposAdmin(),
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
      ? 'Não foi possível carregar os tipos de solicitação — a whitelist pode aparecer incompleta. Recarregue a página.'
      : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Chaves de API</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Credenciais para plataformas externas abrirem e consultarem solicitações via API
        </p>
      </div>

      <ChavesApiContent chaves={chaves ?? []} tipos={tipos} erroCarga={erroCarga} />
    </div>
  )
}
