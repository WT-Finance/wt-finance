'use client'

import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import KpiDetailDrawer from './kpi-detail-drawer'

interface Props {
  children:  ReactNode
  metrica:   'faturamento' | 'receita'
  rotulo:    string
  setor:     string
}

export default function KpiDrawerTrigger({ children, metrica, rotulo, setor }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        className="relative cursor-pointer group/drawer rounded-xl hover:shadow-md transition-shadow h-full"
        onClick={() => setOpen(true)}
        title={`Ver histórico — ${rotulo}`}
      >
        {children}
        <span className="absolute bottom-3 right-3 opacity-20 group-hover/drawer:opacity-70 transition-opacity pointer-events-none">
          <ChevronRight size={15} className="text-blue-600" />
        </span>
      </div>

      {open && (
        <KpiDetailDrawer
          metrica={metrica}
          rotulo={rotulo}
          setor={setor}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
