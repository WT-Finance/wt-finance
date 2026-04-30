import {
  startOfMonth, endOfMonth, subMonths, subYears,
  differenceInDays, addDays,
  getYear, getMonth, getDate,
  isAfter,
} from 'date-fns'

export type PresetPeriodo =
  | 'este-mes'
  | 'mes-passado'
  | 'ultimos-3-meses'
  | 'ultimos-6-meses'
  | 'este-ano'
  | 'personalizado'

export interface Periodo {
  inicio: Date
  fim: Date
}

/** Resolve um preset (ou retorna a data literal de inicio/fim) para um Periodo concreto. */
export function resolvePeriodo(
  preset: PresetPeriodo,
  hoje: Date = new Date(),
  inicio?: Date,
  fim?: Date,
): Periodo {
  switch (preset) {
    case 'este-mes':
      return { inicio: startOfMonth(hoje), fim: endOfMonth(hoje) }

    case 'mes-passado': {
      const mesPassado = subMonths(hoje, 1)
      return { inicio: startOfMonth(mesPassado), fim: endOfMonth(mesPassado) }
    }

    case 'ultimos-3-meses': {
      const inicio3 = startOfMonth(subMonths(hoje, 2))
      return { inicio: inicio3, fim: endOfMonth(hoje) }
    }

    case 'ultimos-6-meses': {
      const inicio6 = startOfMonth(subMonths(hoje, 5))
      return { inicio: inicio6, fim: endOfMonth(hoje) }
    }

    case 'este-ano': {
      return {
        inicio: new Date(getYear(hoje), 0, 1),
        fim: endOfMonth(hoje),
      }
    }

    case 'personalizado': {
      if (!inicio || !fim) throw new Error('inicio e fim obrigatórios para preset personalizado')
      return { inicio, fim }
    }
  }
}

/**
 * Período imediatamente anterior de mesma duração.
 * Ex: 1–15 Mar → 14 Fev–28 Fev (15 dias corridos antes).
 */
export function calcularPeriodoAnterior(periodo: Periodo): Periodo {
  const dias = differenceInDays(periodo.fim, periodo.inicio)
  const fimAnterior = addDays(periodo.inicio, -1)
  const inicioAnterior = addDays(fimAnterior, -dias)
  return { inicio: inicioAnterior, fim: fimAnterior }
}

/**
 * Mesmo intervalo do ano anterior.
 * Usa date-fns subYears para tratar corretamente anos bissextos (29 Fev → 28 Fev).
 */
export function calcularPeriodoYoY(periodo: Periodo): Periodo {
  return {
    inicio: subYears(periodo.inicio, 1),
    fim: subYears(periodo.fim, 1),
  }
}

/** Retorna true se o período está encerrado (fim < hoje). */
export function periodoEncerrado(periodo: Periodo, hoje: Date = new Date()): boolean {
  return isAfter(hoje, periodo.fim)
}

/**
 * Granularidade sugerida para gráficos de tendência.
 * ≤30d → diária | 31–90d → semanal | ≥91d → mensal
 */
export type Granularidade = 'diario' | 'semanal' | 'mensal'

export function granularidadeSugerida(periodo: Periodo): Granularidade {
  const dias = differenceInDays(periodo.fim, periodo.inicio) + 1
  if (dias <= 30) return 'diario'
  if (dias <= 90) return 'semanal'
  return 'mensal'
}

/** Formata um Periodo como string legível em pt-BR. */
export function formatarPeriodo(periodo: Periodo): string {
  const fmt = (d: Date) =>
    `${String(getDate(d)).padStart(2, '0')}/${String(getMonth(d) + 1).padStart(2, '0')}/${getYear(d)}`
  return `${fmt(periodo.inicio)} – ${fmt(periodo.fim)}`
}
