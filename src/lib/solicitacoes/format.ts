import type { StatusSolic } from './schemas'
import type { z } from 'zod'
import type { respostaSchema } from './schemas'
import { toNum } from '@/lib/carga/coercao'

// Helpers de apresentação do módulo (client-safe). Cores semânticas neutras de
// plataforma (sem var(--brand)); emerald/red são feedback semântico, permitidos.

export const STATUS_LABEL: Record<StatusSolic, string> = {
  aberta: 'Aberta', concluida: 'Concluída', rejeitada: 'Rejeitada', cancelada: 'Cancelada',
}

export function statusBadge(status: StatusSolic): string {
  switch (status) {
    case 'concluida': return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'rejeitada': return 'border-red-200 bg-red-50 text-red-700'
    case 'cancelada': return 'border-zinc-200 bg-zinc-100 text-zinc-400'
    default:          return 'border-zinc-300 bg-zinc-100 text-zinc-600' // aberta (informativo)
  }
}

// cacheado: construir Intl por chamada custa ~ms; format() cacheado custa µs
const FMT_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })

/** Hoje em America/Sao_Paulo como 'AAAA-MM-DD' (data_limite é date puro, sem fuso). */
export function hojeSP(): string {
  return FMT_SP.format(new Date())
}

/** Vencida = data-limite anterior a hoje (SP) e ainda aberta. */
export function vencida(dataLimite: string, status: StatusSolic): boolean {
  return status === 'aberta' && dataLimite < hojeSP()
}

/** 'AAAA-MM-DD' ou timestamptz → 'DD/MM/AAAA' (sem deslocar o dia). */
export function fmtDataBR(iso: string | null): string {
  if (!iso) return '—'
  const d = iso.slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso
}

type Resposta = z.infer<typeof respostaSchema>

/** Valor de uma resposta formatado para leitura. */
export function fmtValor(r: Resposta): string {
  if (r.valor == null || r.valor === '') return '—'
  if (r.tipo_campo === 'moeda') {
    // Coerção de moeda agora vem do módulo canônico (v4.17.0/Balde 2) — mesma
    // desambiguação BR/US que os parsers de carga usam (fonte única).
    const n = toNum(r.valor)
    return n !== null ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : r.valor
  }
  if (r.tipo_campo === 'data') return fmtDataBR(r.valor)
  return r.valor
}

/** Resumo (2-3 primeiros campos preenchidos) para cards/linhas. */
export function resumo(respostas: Resposta[], max = 3): string {
  const preenchidos = respostas.filter(r => r.tipo_campo !== 'anexo' && r.valor != null && r.valor !== '')
  if (preenchidos.length === 0) return '—'
  return preenchidos.slice(0, max).map(r => `${r.rotulo}: ${fmtValor(r)}`).join(' · ')
}
