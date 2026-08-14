import { requireArea } from '@/lib/auth/sessao'
import { carregarAcompanhamento } from '@/lib/metas/carregar-acompanhamento'
import TvTela from '@/components/metas/tv/tv-tela'
import MetasAutoRefresh from '@/components/metas/metas-auto-refresh'
import type { AcompanhamentoData } from '@/components/metas/tipos'

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

  // Resiliência de parede (achado MÉDIO do revisor, v5.6.4): a tela roda sem humano por
  // perto para recarregar — um throw em QUALQUER um dos 3 recortes (são ~30 RPCs
  // concorrentes no total) não pode derrubar a página inteira. Cada recorte degrada
  // sozinho (slide omitido); com TODOS fora, a tela mínima abaixo segue com o
  // auto-refresh de 60s e se auto-cura na primeira rodada boa.
  const resultados = await Promise.all(ORDEM_TV.map(preset =>
    carregarAcompanhamento(preset).catch((e: unknown) => {
      console.error(`[metas/tv] falha ao carregar o recorte '${preset}'`, e)
      return null
    }),
  ))
  const slides = resultados.filter((d): d is AcompanhamentoData => d != null)

  if (slides.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-soft)]">
        <MetasAutoRefresh intervaloMs={60_000} />
        <p className="text-2xl text-[var(--text-muted)]">
          Sem dados no momento — nova tentativa automática em instantes.
        </p>
      </div>
    )
  }

  const indiceInicial = slides.findIndex(d => d.preset === sp.periodo)
  return <TvTela slides={slides} indiceInicial={indiceInicial >= 0 ? indiceInicial : 0} />
}
