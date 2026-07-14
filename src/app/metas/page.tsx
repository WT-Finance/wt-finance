import Link from 'next/link'
import { requireArea } from '@/lib/auth/sessao'
import { isPresetMetas } from '@/lib/metas/periodo-metas'
import { carregarAcompanhamento } from '@/lib/metas/carregar-acompanhamento'
import AcompanhamentoContent from '@/components/metas/acompanhamento-content'

// Acompanhamento das Metas (v5.0.0) — substitui o dashboard v1 legado em /metas.
// FONTE ÚNICA DO REAL: get_executiva_kpis por setor (mesmo motor da Performance), via
// `carregarAcompanhamento` (módulo compartilhado com o Modo TV — /metas/tv, v5.1.0).
// A meta/pró-rata/ritmo vêm do módulo puro calcularRitmo. Group é COMPUTADO. Tema group.
// Área: leitura com OR ['metas/acompanhamento','metas'].

interface SearchParams {
  periodo?: string
}

export default async function MetasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireArea(['metas/acompanhamento', 'metas'])
  const sp = await searchParams

  // Cortes CALENDÁRIO-FIXOS (Mensal default / Trimestral / Semestral / Anual).
  const preset = isPresetMetas(sp.periodo) ? sp.periodo : 'mensal'
  const data = await carregarAcompanhamento(preset)

  return (
    <div>
      {/* Link discreto de acesso à validação Upload × Monde (v5.1.2/M6). Fica aqui (não
          dentro de AcompanhamentoContent, fora do escopo desta missão) — a página já
          re-gateia a área, então o link pode aparecer sempre que /metas é vista. */}
      <div className="mb-1 flex justify-end">
        <Link
          href="/metas/comparacao"
          className="foco-neutro text-xs text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-600 hover:underline"
        >
          Comparação (Monde)
        </Link>
      </div>
      <AcompanhamentoContent data={data} />
    </div>
  )
}
