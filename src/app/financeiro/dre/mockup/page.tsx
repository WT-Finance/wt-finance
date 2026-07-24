import { requireArea } from '@/lib/auth/sessao'
import TopSection from '@/components/shared/top-section'
import TabelaDreMockup from '@/components/financeiro/dre/tabela-dre-mockup'
import EditorDreMockup from '@/components/financeiro/dre/editor-dre-mockup'

// ⛔ GATE DE MOCKUP (v5.3.0 · M0) — rota de PREVIEW, não é a feature.
// Dois mockups interativos da DRE por Fluxo de Caixa (Onda 2): a tabela hierárquica
// (159 linhas, dados REAIS do dashboard da controladoria — base 15/07/2026) e o
// editor da estrutura viva. Nada é persistido; nenhuma migration existe ainda.
// A implementação real (M1+) só começa após o OK do Yan sobre esta página.
// Remoção prevista: quando a M4 entregar a tabela real em /financeiro/dre.

export default async function DreMockupPage() {
  await requireArea('financeiro/dre')

  return (
    <div>
      <TopSection
        titulo="Mockup · Tabela DRE"
        subtitulo="gate da v5.3.0 — dados reais da controladoria (base 15/07/2026); nada é persistido"
      >
        <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-bg)]/50 px-4 py-3 mb-4 text-xs text-zinc-600">
          <span className="font-medium">Pontos em validação neste gate:</span>{' '}
          (1) mês corrente híbrido em duas colunas (Jul·R | Jul·P) com divisor tracejado;{' '}
          (2) meses previstos em âmbar; (3) negativos em parênteses (contábil);{' '}
          (4) <span className="font-medium">Total do ano = soma das colunas mensais</span> — o modelo da
          controladoria soma também os vencidos em aberto, que não têm coluna neste recorte;{' '}
          (5) bandeja “Não classificadas” ao fim (valores ilustrativos — o dado real da órfã vive em 2023).
        </div>
        <TabelaDreMockup />
      </TopSection>

      <TopSection
        titulo="Mockup · Editor de estrutura"
        subtitulo="setas dentro do bloco · mover entre blocos com efeito · bandeja e excluídas · salvar em lote (mock)"
      >
        <EditorDreMockup />
      </TopSection>
    </div>
  )
}
