// Inventário de ativos (v5.6.0) — modelo de domínio.
//
// REGRA CENTRAL (briefing §Invariantes 1 e 2): o razão de movimentações é a fonte da verdade.
// Localização, detentor e status do ativo são DERIVADOS da última movimentação — nunca colunas
// em `patrimonio.ativo`. A ORIGEM de uma movimentação também não é armazenada: é o destino da
// anterior na cadeia (gravar origem como snapshot garante divergência quando há retroativa).
//
// Estes tipos são o shape que as RPCs da M1 devolverão; na M0 são alimentados por `fixture.ts`.

/** Tipos de movimentação (enum do banco). Governa destino obrigatório E status derivado. */
export type TipoMovimentacao =
  | 'cadastro'
  | 'transferencia'
  | 'devolucao_estoque'
  | 'envio_manutencao'
  | 'retorno_manutencao'
  | 'emprestimo'
  | 'baixa'
  | 'reativacao'

/** Status do ativo. NÃO é coluna: deriva do TIPO da última movimentação (ver `derivar.ts`). */
export type StatusAtivo = 'em_uso' | 'em_estoque' | 'em_manutencao' | 'emprestado' | 'baixado'

export type MotivoBaixa = 'venda' | 'descarte' | 'perda' | 'doacao' | 'sinistro'

export type EstadoConservacao = 'novo' | 'bom' | 'regular' | 'ruim'

/** Departamento administrativo — NÃO é setor de negócio (Trips/Weddings/Corporativo). */
export interface AreaPatrimonio {
  id: number
  nome: string
}

export interface CategoriaPatrimonio {
  id: number
  nome: string
}

/** Pessoa que detém um ativo. Desacoplada de usuário da plataforma (decisão consciente). */
export interface Detentor {
  id: number
  nome: string
  ativo: boolean
}

/**
 * Uma linha do razão. Append-only: só `obs` é editável.
 * Os campos de destino são governados por CHECK por tipo no banco (M1) — aqui o mesmo
 * contrato vive em `DESTINO_POR_TIPO` (`derivar.ts`), fonte única da UI.
 */
export interface Movimentacao {
  id: number
  ativo_id: number
  tipo: TipoMovimentacao
  /** `date` puro (sem fuso) — exibir com `fmtDate`, nunca com `fmtDataSP`. */
  data_movimentacao: string
  area_destino_id: number | null
  area_destino_nome: string | null
  detentor_destino_id: number | null
  detentor_destino_nome: string | null
  /** Terceiro/local em texto livre (assistência técnica, sala) — assimetria deliberada. */
  destino_texto: string | null
  motivo_baixa: MotivoBaixa | null
  obs: string | null
  /** Rótulo de quem registrou — vem da SESSÃO, nunca digitado (invariante 7). */
  registrado_por_rotulo: string
  /** timestamptz — exibir com `fmtDataHoraSP`. Desempata a ordenação com mesma data. */
  criado_em: string
}

/** Ficha patrimonial: só identidade e documento. Sem área, sem detentor, sem status. */
export interface AtivoFicha {
  id: number
  codigo: string
  categoria_id: number
  categoria_nome: string
  descricao: string
  numero_serie: string | null
  fornecedor: string | null
  data_aquisicao: string | null
  valor_aquisicao: number | null
  nota_fiscal: string | null
  estado_conservacao: EstadoConservacao | null
  obs: string | null
}

/** Linha da lista: ficha + estado DERIVADO (o que `listar_ativos` devolve). */
export interface AtivoLista extends AtivoFicha {
  status: StatusAtivo
  area_atual_nome: string | null
  detentor_atual_nome: string | null
  /** Preenchido quando o estado atual é um terceiro/local em texto (ex.: assistência). */
  local_atual_texto: string | null
  ultima_movimentacao_em: string | null
}

/** Ficha + histórico completo, lidos numa única transação (invariante 10). */
export interface AtivoDetalhe {
  ficha: AtivoFicha
  historico: Movimentacao[]
}
