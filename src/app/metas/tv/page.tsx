import { requireArea } from '@/lib/auth/sessao'
import { carregarAcompanhamento } from '@/lib/metas/carregar-acompanhamento'
import TvTela from '@/components/metas/tv/tv-tela'

// Modo TV (v5.1.0) — pele de exibição de /metas em TELA CHEIA (sem AppShell: o chrome é
// curto-circuitado por pathname no AppShell — ADR-0148). FONTE ÚNICA: a MESMA
// `carregarAcompanhamento` da /metas (os números batem por construção). Guard de leitura
// de Metas (o usuário dedicado 'TV Comercial' tem exatamente metas/acompanhamento).
// Rota dinâmica (lê searchParams + dados por request).
//
// v5.6.4: o TV agora RODA os 3 recortes calendário-fixos em carrossel (mês → trimestre →
// ano — semestre fica de fora, pedido do Yan). Os 3 são carregados aqui em PARALELO (mesma
// `carregarAcompanhamento` ×3 — fonte única preservada: os números de cada slide batem com
// a /metas no preset correspondente). `?periodo=` (herdado do link "Modo TV" da
// Acompanhamento, que passa o preset que o usuário estava vendo — inclusive 'semestral',
// fora do carrossel) só decide em qual dos 3 slides o carrossel COMEÇA; se não reconhecido,
// cai no mensal (índice 0). A rotação automática segue normalmente dali (client, `TvTela`).

interface SearchParams {
  periodo?: string
}

/** Ordem fixa do carrossel — índice = posição no track. */
const ORDEM_TV = ['mensal', 'trimestral', 'anual'] as const

export default async function MetasTvPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireArea(['metas/acompanhamento', 'metas'])
  const sp = await searchParams
  const indiceInicial = ORDEM_TV.findIndex(preset => preset === sp.periodo)

  const [mensal, trimestral, anual] = await Promise.all(ORDEM_TV.map(preset => carregarAcompanhamento(preset)))

  return <TvTela slides={[mensal, trimestral, anual]} indiceInicial={indiceInicial >= 0 ? indiceInicial : 0} />
}
