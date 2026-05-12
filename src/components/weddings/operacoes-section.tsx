'use client'

import { useState } from 'react'
import ListaOperacoesCard from '@/components/weddings/lista-operacoes'
import DrilldownDrawer from '@/components/weddings/drilldown-drawer'

export default function OperacoesSection() {
  const [selectedOperacao, setSelectedOperacao] = useState<string | null>(null)

  return (
    <>
      <ListaOperacoesCard onSelectOperacao={setSelectedOperacao} />
      {selectedOperacao && (
        <DrilldownDrawer
          operacao={selectedOperacao}
          onClose={() => setSelectedOperacao(null)}
        />
      )}
    </>
  )
}
