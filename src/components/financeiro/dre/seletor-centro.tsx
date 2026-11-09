import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { OPCOES_SELETOR, ROTULO_SELETOR, type SeletorCentro as Opcao } from '@/lib/dre-centro/centros'

// ── Seletor de centro de custo do card da DRE por centro (v6.5.1) ────────────
// Vive DENTRO do card por centro, que é separado da tabela da Empresa (decisão do Yan no
// GATE 1). Estado do card, sem ida ao servidor: todos os centros já vêm no mesmo payload.

const AJUDA =
  'A mesma árvore da DRE de caixa, calculada para cada operação: os recebíveis antecipados voltam ao ' +
  'mês do vencimento e ao centro dono, e as antecipações (dinheiro, devolução e taxa) ficam com quem ' +
  'precisou do caixa. Todos mostra os centros em colunas, inclusive o que ficou sem centro no Monde. ' +
  'Só 2026: antes disso o Monde não tem ' +
  'o centro preenchido. A DRE da empresa inteira é a tabela acima.'

export default function SeletorCentro({ atual, onEscolher }: { atual: Opcao; onEscolher: (s: Opcao) => void }) {
  return (
    <div role="group" aria-label="Centro de custo" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1 text-xs text-text-muted">
        Centro de custo
        <GatilhoAjuda
          rotulo="Centro de custo"
          texto={AJUDA}
          classNameBalao="z-30 w-80 !whitespace-normal font-normal normal-case tracking-normal leading-snug"
        />
      </span>
      {OPCOES_SELETOR.map(s => (
        <span key={s} className="contents">
          {s === 'lado' && <span className="mx-1 h-4 w-px bg-wt-border-strong" aria-hidden />}
          <button
            type="button"
            onClick={() => onEscolher(s)}
            aria-pressed={atual === s}
            className={['foco-neutro', PILL_FILTRO, atual === s ? '' : PILL_FILTRO_INATIVO].join(' ')}
            style={atual === s ? PILL_FILTRO_ATIVO_STYLE : undefined}
          >
            {ROTULO_SELETOR[s]}
          </button>
        </span>
      ))}
    </div>
  )
}
