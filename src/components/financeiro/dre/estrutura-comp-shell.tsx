'use client'

import EstruturaShell from './estrutura-shell'
import type { HistoricoFetchers } from '@/components/financeiro/gerencial/historico-alteracoes'
import type { DreEstrutura } from '@/lib/dre/schemas'
import {
  salvarEstruturaCompetencia, compHistoricoLotes, compHistoricoLote,
  compDesfazerLote, compDesfazerLinha,
} from '@/app/financeiro/dre/estrutura-competencia/actions'

// Shell da estrutura de COMPETÊNCIA (v5.8.0 · M5). Não reimplementa nada: é só a amarração
// das actions do regime ao `EstruturaShell` compartilhado, que ganhou duas props com default
// do caixa. Existe como componente CLIENTE (e não como objeto montado na página) pelo mesmo
// motivo que o do caixa: o módulo que importa as Server Actions é o cliente, e o default
// do shell continua sendo o caixa — o call-site dele não mudou uma linha.

const FETCHERS_COMPETENCIA: HistoricoFetchers = {
  lotes: compHistoricoLotes,
  lote: compHistoricoLote,
  desfazerLote: compDesfazerLote,
  desfazerLinha: compDesfazerLinha,
}

export default function EstruturaCompShell({
  estrutura, totaisPorCategoria,
}: {
  estrutura: DreEstrutura
  totaisPorCategoria: Record<number, number>
}) {
  return (
    <EstruturaShell
      estrutura={estrutura}
      totaisPorCategoria={totaisPorCategoria}
      fetchers={FETCHERS_COMPETENCIA}
      salvarAction={salvarEstruturaCompetencia}
    />
  )
}
