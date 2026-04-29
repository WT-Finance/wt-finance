'use client'

const SETORES = [
  { value: 'todos',       label: 'Todos os setores' },
  { value: 'Lazer',       label: 'Trips'            },
  { value: 'Corporativo', label: 'Corporativo'      },
  { value: 'Weddings',    label: 'Weddings'         },
]

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function buildMesOptions() {
  const now = new Date()
  const opts: { value: string; label: string; ano: number; mes: number }[] = []
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ano = d.getFullYear()
    const mes = d.getMonth() + 1
    opts.push({ value: `${ano}-${mes}`, label: `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`, ano, mes })
  }
  return opts
}

interface FilterBarProps {
  setor: string
  ano: number
  mes: number
  onSetorChange: (setor: string) => void
  onAnoMesChange: (ano: number, mes: number) => void
}

export default function FilterBar({ setor, ano, mes, onSetorChange, onAnoMesChange }: FilterBarProps) {
  const mesOptions = buildMesOptions()
  const mesValue = `${ano}-${mes}`

  const selectClass =
    'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400'

  return (
    <div className="flex items-center gap-3">
      <select value={setor} onChange={e => onSetorChange(e.target.value)} className={selectClass}>
        {SETORES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      <select
        value={mesValue}
        onChange={e => {
          const [a, m] = e.target.value.split('-').map(Number)
          onAnoMesChange(a, m)
        }}
        className={selectClass}
      >
        {mesOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
