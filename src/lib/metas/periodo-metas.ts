import { format } from 'date-fns'

// Períodos do Acompanhamento de Metas (v5.0.0) — CALENDÁRIO-FIXOS, não janelas
// móveis: "Trimestral" é o trimestre-calendário corrente (jan–mar, abr–jun,
// jul–set, out–dez), nunca "últimos 3 meses". Decisão de produto: metas são
// cadastradas por mês-calendário, então o acompanhamento fecha nos mesmos cortes.
// Módulo PURO (testável; `hoje` injetável).

export type PresetMetas = 'mensal' | 'trimestral' | 'semestral' | 'anual'

export const PRESETS_METAS: { id: PresetMetas; label: string }[] = [
  { id: 'mensal',     label: 'Mensal' },
  { id: 'trimestral', label: 'Trimestral' },
  { id: 'semestral',  label: 'Semestral' },
  { id: 'anual',      label: 'Anual' },
]

export function isPresetMetas(v: string | null | undefined): v is PresetMetas {
  return v === 'mensal' || v === 'trimestral' || v === 'semestral' || v === 'anual'
}

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** Período calendário corrente que CONTÉM `hoje`, para o preset dado. */
export function resolverPeriodoMetas(
  preset: PresetMetas,
  hoje: Date = new Date(),
): { from: string; to: string; label: string } {
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth() // 0..11

  let m0: number
  let m1: number
  let label: string
  switch (preset) {
    case 'mensal': {
      m0 = mes; m1 = mes
      label = `${MESES_PT[mes]} de ${ano}`
      break
    }
    case 'trimestral': {
      const q = Math.floor(mes / 3)
      m0 = q * 3; m1 = m0 + 2
      label = `${q + 1}º trimestre de ${ano}`
      break
    }
    case 'semestral': {
      const s = mes < 6 ? 0 : 1
      m0 = s * 6; m1 = m0 + 5
      label = `${s + 1}º semestre de ${ano}`
      break
    }
    case 'anual': {
      m0 = 0; m1 = 11
      label = String(ano)
      break
    }
  }

  const from = new Date(ano, m0, 1)
  const to = new Date(ano, m1 + 1, 0) // dia 0 do mês seguinte = último dia de m1
  return { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd'), label }
}
