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
        <div className="rounded-lg border border-wt-border bg-surface-soft px-4 py-3 mb-4 text-xs text-text-secondary">
          <p>
            <span className="font-medium text-text-primary">Desenho aplicado</span> (rodada visual,
            sobre o estudo aprovado): hierarquia em <span className="font-medium">régua contábil</span>{' '}
            — sem bandas coloridas, com régua dupla no resultado, como um demonstrativo impresso;{' '}
            <span className="font-medium">natureza na faixa</span> (entrada sage · saída terracota ·
            misto dourado · resultado cinza-marca) e <span className="font-medium">sinal na tinta só
            nas linhas de resultado</span>; <span className="font-medium">previsto no fundo</span>{' '}
            (âmbar marca o tempo, a tinta fica livre para o sinal); figuras tabulares da Avenir;
            paleta quente do DS no lugar do cinza frio.
          </p>
          <p className="mt-2">
            <span className="font-medium text-text-primary">Ainda para você decidir:</span>{' '}
            o <span className="font-medium">Total do ano</span> soma apenas as colunas mensais — o
            modelo da controladoria soma <span className="font-medium">também os vencidos em aberto</span>{' '}
            (−R$ 306.512 no resultado do exercício), que não têm coluna neste recorte. Somar no total,
            dar coluna própria, ou manter como está?
          </p>
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
