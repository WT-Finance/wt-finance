// Inventário de Ativos (v5.6.0) — derivação de estado a partir do razão.
//
// Estas funções são PURAS e são a fonte única do contrato "tipo → destino / status" na UI.
// O banco repete o mesmo contrato como CHECK por tipo (M1); o teste de contrato da M1 compara
// as duas pontas. Enquanto a M0 roda sobre fixture, é aqui que o estado nasce.

import type {
  AtivoLista, Movimentacao, StatusAtivo, TipoMovimentacao, AtivoFicha, MotivoBaixa,
} from './tipos'

export const ROTULO_TIPO: Record<TipoMovimentacao, string> = {
  cadastro:           'Cadastro',
  transferencia:      'Transferência',
  devolucao_estoque:  'Devolução ao estoque',
  envio_manutencao:   'Envio para manutenção',
  retorno_manutencao: 'Retorno de manutenção',
  emprestimo:         'Empréstimo',
  baixa:              'Baixa',
  reativacao:         'Reativação',
}

export const ROTULO_STATUS: Record<StatusAtivo, string> = {
  em_uso:        'Em uso',
  em_estoque:    'Em estoque',
  em_manutencao: 'Em manutenção',
  emprestado:    'Emprestado',
  baixado:       'Baixado',
}

export const ROTULO_MOTIVO_BAIXA: Record<MotivoBaixa, string> = {
  venda:    'Venda',
  descarte: 'Descarte',
  perda:    'Perda / extravio',
  doacao:   'Doação',
  sinistro: 'Sinistro',
}

/**
 * Status sai da ÚLTIMA movimentação — do tipo dela e, só no `cadastro`, de ter ou não detentor.
 *
 * O briefing dizia "status derivado do tipo"; o Yan decidiu (10/08) que **um ativo pode nascer
 * direto no estoque**, e aí o `cadastro` tem dois desfechos. A alternativa seria um tipo novo
 * (`cadastro_estoque`), que duplicaria a abertura no enum e no CHECK sem ganhar nada. O que
 * importa da invariante 1 continua de pé: o estado vem do RAZÃO, lido do mesmo registro que
 * já está lá — nenhuma coluna espelho, nenhum campo a mais para divergir.
 */
const STATUS_POR_TIPO: Record<Exclude<TipoMovimentacao, 'cadastro'>, StatusAtivo> = {
  transferencia:      'em_uso',
  retorno_manutencao: 'em_uso',
  reativacao:         'em_uso',
  devolucao_estoque:  'em_estoque',
  envio_manutencao:   'em_manutencao',
  emprestimo:         'emprestado',
  baixa:              'baixado',
}

/**
 * Que campos de destino cada tipo exige/proíbe. Espelha o CHECK por tipo do banco (M1) e
 * governa quais campos o modal de movimentação mostra.
 * `obrigatorio` = tem de vir preenchido · `opcional` = pode vir · ausente = TEM de ser nulo.
 */
export type CampoDestino = 'area' | 'detentor' | 'texto' | 'motivo_baixa'
export const DESTINO_POR_TIPO: Record<TipoMovimentacao, Partial<Record<CampoDestino, 'obrigatorio' | 'opcional'>>> = {
  // Abertura (invariante 5): o ativo nasce numa ÁREA; o detentor é OPCIONAL e é ele que decide
  // se o ativo nasce em uso ou em estoque (decisão do Yan, 10/08).
  cadastro:           { area: 'obrigatorio', detentor: 'opcional' },
  transferencia:      { area: 'obrigatorio', detentor: 'obrigatorio' },
  // Volta ao estoque: fica SEM detentor — a lista mostra travessão, não erro.
  devolucao_estoque:  { area: 'obrigatorio' },
  // Terceiro em texto livre: ninguém vai perguntar "quantos itens estão na assistência X".
  envio_manutencao:   { texto: 'obrigatorio' },
  retorno_manutencao: { area: 'obrigatorio', detentor: 'obrigatorio' },
  // Empréstimo: quem levou (a previsão de retorno vai em `obs`).
  emprestimo:         { detentor: 'obrigatorio', texto: 'opcional' },
  baixa:              { motivo_baixa: 'obrigatorio' },
  reativacao:         { area: 'obrigatorio', detentor: 'obrigatorio' },
}

export const TIPOS_MOVIMENTACAO: TipoMovimentacao[] = [
  'transferencia', 'devolucao_estoque', 'envio_manutencao', 'retorno_manutencao',
  'emprestimo', 'baixa', 'reativacao',
]

/**
 * Status produzido por UMA movimentação. Só o `cadastro` ramifica (ver `STATUS_POR_TIPO`);
 * é a mesma conta que a RPC `listar_ativos` fará em SQL — manter as duas em espelho.
 */
export function statusDaMovimentacao(m: Pick<Movimentacao, 'tipo' | 'detentor_destino_id' | 'detentor_destino_nome'>): StatusAtivo {
  if (m.tipo === 'cadastro') {
    return (m.detentor_destino_id != null || m.detentor_destino_nome != null) ? 'em_uso' : 'em_estoque'
  }
  return STATUS_POR_TIPO[m.tipo]
}

/**
 * Ordenação canônica do razão: `(data_movimentacao, criado_em)` ASC — a mesma dos três lugares
 * (SQL, timeline e derivação). Retroativa é liberada, então `criado_em` é o desempate
 * determinístico quando duas movimentações compartilham a data.
 */
export function ordenarCronologico(movs: Movimentacao[]): Movimentacao[] {
  return [...movs].sort((a, b) => {
    if (a.data_movimentacao !== b.data_movimentacao) {
      return a.data_movimentacao < b.data_movimentacao ? -1 : 1
    }
    if (a.criado_em !== b.criado_em) return a.criado_em < b.criado_em ? -1 : 1
    return a.id - b.id
  })
}

/** A última movimentação da cadeia — a que manda no estado atual. */
export function ultimaMovimentacao(movs: Movimentacao[]): Movimentacao | null {
  const ordenadas = ordenarCronologico(movs)
  return ordenadas.length > 0 ? ordenadas[ordenadas.length - 1] : null
}

/**
 * Ficha + razão → linha da lista com estado derivado.
 * É o equivalente em TS do `DISTINCT ON (ativo_id) … ORDER BY data_movimentacao DESC, criado_em DESC`
 * que a RPC `listar_ativos` fará na M1.
 */
export function derivarLinha(ficha: AtivoFicha, movs: Movimentacao[]): AtivoLista {
  const ultima = ultimaMovimentacao(movs)
  // Invariante 5: ativo sem movimentação é inalcançável. Se acontecer, degradar sem quebrar.
  if (!ultima) {
    return {
      ...ficha,
      status: 'em_estoque',
      area_atual_nome: null,
      detentor_atual_nome: null,
      local_atual_texto: null,
      ultima_movimentacao_em: null,
    }
  }
  return {
    ...ficha,
    status: statusDaMovimentacao(ultima),
    area_atual_nome: ultima.area_destino_nome,
    detentor_atual_nome: ultima.detentor_destino_nome,
    local_atual_texto: ultima.destino_texto,
    ultima_movimentacao_em: ultima.data_movimentacao,
  }
}

/** Onde o ativo está, em uma frase — o destino de UMA movimentação, montado na leitura. */
export function rotuloDestino(m: Movimentacao): string {
  if (m.tipo === 'baixa') {
    return m.motivo_baixa ? `Baixa por ${ROTULO_MOTIVO_BAIXA[m.motivo_baixa].toLowerCase()}` : 'Baixa'
  }
  const partes: string[] = []
  if (m.area_destino_nome) partes.push(m.area_destino_nome)
  if (m.detentor_destino_nome) partes.push(m.detentor_destino_nome)
  if (m.destino_texto) partes.push(m.destino_texto)
  if (partes.length === 0) return m.tipo === 'devolucao_estoque' ? 'Estoque' : '—'
  // Sem detentor, "Tecnologia" sozinho não diz que o item está PARADO. Os dois casos em que
  // isso acontece (devolução, e cadastro que nasce no estoque) ganham o sufixo explícito.
  if (!m.detentor_destino_nome && statusDaMovimentacao(m) === 'em_estoque') {
    return `${partes.join(' / ')} · estoque`
  }
  return partes.join(' / ')
}

/**
 * ORIGEM DERIVADA (invariante 2): a origem de uma movimentação é o destino da ANTERIOR na
 * cadeia — nunca um campo gravado. `null` na primeira (abertura não tem de onde vir).
 * Recebe a lista JÁ em ordem cronológica.
 */
export function rotuloOrigem(movsOrdenadas: Movimentacao[], indice: number): string | null {
  if (indice <= 0) return null
  return rotuloDestino(movsOrdenadas[indice - 1])
}

/**
 * O registro entrou DEPOIS do fato? Compara a data do evento com o dia em que a linha foi
 * gravada (`criado_em`, timestamptz — comparado pelo dia em SP). A timeline sinaliza, não bloqueia:
 * retroativa é liberada de propósito (invariante 8).
 */
const FMT_DIA_SP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
})
export function ehRetroativa(m: Movimentacao): boolean {
  const criadoEm = new Date(m.criado_em)
  if (isNaN(criadoEm.getTime())) return false
  return m.data_movimentacao < FMT_DIA_SP.format(criadoEm)
}

/** Ativo baixado bloqueia novas movimentações — exceto a `reativacao`, que é o caminho de volta. */
export function tiposPermitidos(status: StatusAtivo): TipoMovimentacao[] {
  if (status === 'baixado') return ['reativacao']
  return TIPOS_MOVIMENTACAO.filter(t => t !== 'reativacao')
}
