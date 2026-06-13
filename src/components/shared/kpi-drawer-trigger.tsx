'use client'

import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import KpiDetailDrawer from './kpi-detail-drawer'
import KpiPrincipalDrawer from '@/components/weddings/kpi-principal-drawer'

interface Props {
  children:  ReactNode
  metrica:   'faturamento' | 'receita'
  rotulo:    string
  setor:     string
  /** Qual drawer abrir: 'detalhe' (KpiDetailDrawer simples, padrão — Executiva)
   *  ou 'rico' (KpiPrincipalDrawer parametrizado por setor — Performance/Trips/Corp). */
  drawer?:   'detalhe' | 'rico'
}

export default function KpiDrawerTrigger({ children, metrica, rotulo, setor, drawer = 'detalhe' }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        className="relative cursor-pointer group/drawer rounded-xl h-full card-clicavel"
        onClick={() => setOpen(true)}
        title={`Ver histórico — ${rotulo}`}
      >
        {children}
        {/* v4.10/M4: afordância na convenção .card-clicavel — hover assume a cor da
            aba (--brand); a seta acompanha via .card-clicavel-cta (sem azul cravado). */}
        <span className="card-clicavel-cta absolute bottom-3 right-3 text-[var(--text-subtle)] opacity-40 group-hover/drawer:opacity-90 pointer-events-none">
          <ChevronRight size={15} />
        </span>
      </div>

      {open && (
        drawer === 'rico'
          ? <KpiPrincipalDrawer setor={setor} onClose={() => setOpen(false)} />
          : <KpiDetailDrawer
              metrica={metrica}
              rotulo={rotulo}
              setor={setor}
              onClose={() => setOpen(false)}
            />
      )}
    </>
  )
}
