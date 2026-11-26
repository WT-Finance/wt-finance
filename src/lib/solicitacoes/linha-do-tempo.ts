import { emAndamento, type Solicitacao } from './schemas'

// v6.5.3 — linha do tempo da seção "Notas" do drawer: as movimentações (DERIVADAS das colunas
// da solicitação, como em `solic_movimentacoes` — ADR-0169) intercaladas com os comentários
// (EVENTOS da tabela `app.solicitacao_nota` — ADR-0185). Pura: a tela só formata e pinta.

export type TipoEvento = 'abertura' | 'aprovacao' | 'conclusao' | 'rejeicao' | 'cancelamento' | 'nota'

export interface EventoLinhaDoTempo {
  /** Chave estável para a lista do React. */
  chave: string
  tipo: TipoEvento
  /** timestamptz; null só numa decisão terminal sem instante gravado (dado antigo). */
  em: string | null
  /** E-mail de quem agiu ou comentou ('—' quando o cadastro não existe mais). */
  ator: string
  /** Texto do comentário, ou a justificativa da rejeição. */
  texto?: string | null
}

const TERMINAL: Partial<Record<Solicitacao['status'], TipoEvento>> = {
  concluida: 'conclusao', rejeitada: 'rejeicao', cancelada: 'cancelamento',
}

/** Desempate de instantes iguais: a ordem do ciclo de vida (o comentário antes do desfecho). */
const ORDEM: Record<TipoEvento, number> = {
  abertura: 0, aprovacao: 1, nota: 2, conclusao: 3, rejeicao: 3, cancelamento: 3,
}

export function linhaDoTempo(sol: Pick<Solicitacao,
  'criado_em' | 'solicitante_email' | 'aprovado_em' | 'aprovado_por_email' |
  'status' | 'decidido_em' | 'decidido_por_email' | 'justificativa' | 'notas'>): EventoLinhaDoTempo[] {
  const eventos: EventoLinhaDoTempo[] = [
    { chave: 'abertura', tipo: 'abertura', em: sol.criado_em, ator: sol.solicitante_email ?? '—' },
  ]
  if (sol.aprovado_em) {
    eventos.push({ chave: 'aprovacao', tipo: 'aprovacao', em: sol.aprovado_em, ator: sol.aprovado_por_email ?? '—' })
  }
  for (const n of sol.notas ?? []) {
    eventos.push({ chave: `nota-${n.id}`, tipo: 'nota', em: n.criado_em, ator: n.autor_email ?? '—', texto: n.texto })
  }
  // Desfecho: só quando de fato encerrou (mesma regra do bloco "Encerramento" que esta seção
  // substitui — 'aprovada' não é desfecho).
  const terminal = TERMINAL[sol.status]
  if (!emAndamento(sol.status) && terminal) {
    eventos.push({
      chave: 'desfecho', tipo: terminal, em: sol.decidido_em, ator: sol.decidido_por_email ?? '—',
      texto: terminal === 'rejeicao' ? sol.justificativa : null,
    })
  }
  const instante = (e: EventoLinhaDoTempo) => (e.em ? Date.parse(e.em) : Number.POSITIVE_INFINITY)
  // `sort` é estável: notas de mesmo instante e mesma ordem ficam na ordem do banco (criado_em, id).
  return eventos.sort((a, b) => instante(a) - instante(b) || ORDEM[a.tipo] - ORDEM[b.tipo])
}
