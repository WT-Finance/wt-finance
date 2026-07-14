import { requireArea } from '@/lib/auth/sessao'
import { isPresetMetas } from '@/lib/metas/periodo-metas'
import { carregarAcompanhamento } from '@/lib/metas/carregar-acompanhamento'
import TvTela from '@/components/metas/tv/tv-tela'

// Modo TV (v5.1.0) — pele de exibição de /metas em TELA CHEIA (sem AppShell: o chrome é
// curto-circuitado por pathname no AppShell — ADR-0148). FONTE ÚNICA: a MESMA
// `carregarAcompanhamento` da /metas (os números batem por construção). Guard de leitura
// de Metas (o usuário dedicado 'TV Comercial' tem exatamente metas/acompanhamento).
// Rota dinâmica (lê searchParams + dados por request).

interface SearchParams {
  periodo?: string
}

export default async function MetasTvPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireArea(['metas/acompanhamento', 'metas'])
  const sp = await searchParams
  const preset = isPresetMetas(sp.periodo) ? sp.periodo : 'mensal'
  const data = await carregarAcompanhamento(preset)

  return <TvTela data={data} />
}
