import { HardHat } from 'lucide-react'
import { Card } from '@/components/ui/card'
import CabecalhoCard from './cabecalho-card'

// Placeholder de SEÇÃO/CARD em construção (v6.5.0): a casca de uma parte da página que já tem lugar, mas
// ainda não tem conteúdo (Vendas e Cartões de crédito no Financeiro · Geral; o card "Prejuízo por setor").
// Mesmo tom da tela inteira `EmConstrucao` (Performance), em escala de card: ícone e texto discretos. Nunca
// vazio total — a diretoria leria um card em branco como erro de carga.
export default function EmConstrucaoSecao({
  titulo, detalhe,
}: {
  /** Título do card. Omitido quando a seção (TopSection) já dá o título. */
  titulo?: string
  /** Uma linha de contexto opcional ("Depende da fonte de setor."). */
  detalhe?: string
}) {
  return (
    <Card>
      {titulo && <CabecalhoCard titulo={titulo} />}
      <div className="flex items-center gap-2.5 py-2 text-[var(--text-subtle)]">
        <HardHat size={18} aria-hidden="true" className="shrink-0" />
        <div>
          <p className="text-[13px] font-medium">Em construção</p>
          {detalhe && <p className="text-xs">{detalhe}</p>}
        </div>
      </div>
    </Card>
  )
}
