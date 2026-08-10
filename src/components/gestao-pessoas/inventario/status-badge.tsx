import Badge, { type BadgeVariant } from '@/components/ui/badge'
import { ROTULO_STATUS, ROTULO_TIPO } from './derivar'
import type { StatusAtivo, TipoMovimentacao } from './tipos'

// Badge do status DERIVADO e do tipo de movimentação. Cor sempre por variante semântica do
// primitivo <Badge> — nunca hex, nunca classe de cor crua (lint wt/no-cor-hardcoded).

const VARIANTE_STATUS: Record<StatusAtivo, BadgeVariant> = {
  em_uso:        'success',
  em_estoque:    'neutro',
  em_manutencao: 'warning',
  emprestado:    'gestao',
  baixado:       'danger',
}

export function StatusBadge({ status }: { status: StatusAtivo }) {
  return <Badge variant={VARIANTE_STATUS[status]}>{ROTULO_STATUS[status]}</Badge>
}

// O tipo da movimentação herda a cor do status que ele PRODUZ — assim a timeline e a lista
// contam a mesma história (envio para manutenção é âmbar nas duas, baixa é vermelha nas duas).
const VARIANTE_TIPO: Record<TipoMovimentacao, BadgeVariant> = {
  cadastro:           'neutro',
  transferencia:      'success',
  devolucao_estoque:  'neutro',
  envio_manutencao:   'warning',
  retorno_manutencao: 'success',
  emprestimo:         'gestao',
  baixa:              'danger',
  reativacao:         'success',
}

export function TipoBadge({ tipo }: { tipo: TipoMovimentacao }) {
  return <Badge variant={VARIANTE_TIPO[tipo]}>{ROTULO_TIPO[tipo]}</Badge>
}
