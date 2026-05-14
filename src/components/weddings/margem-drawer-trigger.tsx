'use client'

import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import MargemDrawer from './margem-drawer'
import type { TendenciaMargem, SumarioSubsetor } from '@/types/api'

interface Props {
  children:     ReactNode
  tendencia:    TendenciaMargem | null
  sumario:      SumarioSubsetor | null
  margemOk:     number
  margemAlerta: number
}

export default function MargemDrawerTrigger({ children, tendencia, sumario, margemOk, margemAlerta }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        className="relative cursor-pointer group/drawer rounded-xl hover:shadow-md transition-shadow h-full"
        onClick={() => setOpen(true)}
        title="Ver tendência de margem"
      >
        {children}
        <span className="absolute bottom-3 right-3 opacity-20 group-hover/drawer:opacity-70 transition-opacity pointer-events-none">
          <ChevronRight size={15} className="text-blue-600" />
        </span>
      </div>

      {open && (
        <MargemDrawer
          tendencia={tendencia}
          sumario={sumario}
          margemOk={margemOk}
          margemAlerta={margemAlerta}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
