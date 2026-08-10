'use server'

import { revalidatePath } from 'next/cache'
import { requireAreaAction } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { rpcPatrimonio } from '@/lib/patrimonio/rpc-patrimonio'
import { parseRpc, patrimonioDetalheSchema } from '@/lib/schemas-rpc'
import type {
  AtivoDetalhe, EstadoConservacao, MotivoBaixa, StatusAtivo, TipoMovimentacao,
} from '@/components/gestao-pessoas/inventario/tipos'

// Escrita do Inventário de Ativos (v5.6.0/M3). Área ÚNICA de página: quem edita a página
// cadastra e movimenta (invariante 13) — sem dois níveis.
//
// Nenhuma regra de negócio vive aqui. As RPCs da 0248 são a barreira (código duplicado,
// campos obrigatórios, e a recusa de localização na edição) e estas actions só traduzem o
// erro delas para uma frase que o usuário entende. Duplicar a validação no TS criaria uma
// segunda verdade que envelhece — a do banco é a que vale.

const ROTA = '/gestao-pessoas/inventario'

export type Resultado =
  | { ok: true; id: number; codigo: string }
  | { ok: false; erro: string }

/** Ficha patrimonial — os campos que o formulário edita. SEM área/detentor/status. */
export interface FichaEntrada {
  descricao: string
  categoria_id: number
  /** Vazio ⇒ a sequência server-side gera o WG-XXXX. Preenchido ⇒ override manual. */
  codigo: string | null
  numero_serie: string | null
  fornecedor: string | null
  data_aquisicao: string | null
  valor_aquisicao: number | null
  nota_fiscal: string | null
  estado_conservacao: EstadoConservacao | null
  obs: string | null
}

/** No CADASTRO o destino inicial vem junto: a abertura nasce na mesma transação (invariante 5). */
export interface AberturaEntrada {
  area_destino_id: number
  /** Pessoa JÁ cadastrada. Ela e o nome abaixo ausentes ⇒ o ativo NASCE EM ESTOQUE
   *  (decisão do Yan, 10/08) — resolvido derivando do mesmo registro, sem tipo novo de enum. */
  detentor_destino_id: number | null
  /** Nome digitado que ainda não existe → cadastro inline no servidor. */
  detentor_destino_nome: string | null
  data_movimentacao: string | null
  obs_movimentacao: string | null
}

/**
 * Resolve a pessoa do destino: id quando já existe, `upsert_detentor` quando o nome é novo.
 * O upsert é idempotente por nome NORMALIZADO — digitar "ana beatriz" devolve a Ana existente
 * em vez de criar uma segunda.
 *
 * Duas chamadas, não uma transação: a RPC de criação recebe `id`, e migration aplicada é
 * registro (não se reescreve para embutir o nome). Se a criação do ativo falhar depois do
 * upsert, sobra um nome sem ativo na lista de pessoas — inócuo (é um rótulo, e o próximo
 * upsert do mesmo nome o reaproveita), e o razão continua íntegro, que é o que importa.
 */
async function resolverDetentor(
  db: Awaited<ReturnType<typeof getServerClient>>,
  id: number | null,
  nome: string | null,
): Promise<{ ok: true; id: number | null } | { ok: false; erro: string }> {
  if (id != null) return { ok: true, id }
  const limpo = nome?.trim() ?? ''
  if (limpo === '') return { ok: true, id: null }

  const { data, error } = await rpcPatrimonio(db, 'patrimonio_upsert_detentor', { p_nome: limpo })
  if (error) return { ok: false, erro: traduzirErro(error.message) }
  const novo = (data as { id?: unknown } | null)?.id
  if (typeof novo !== 'number') return { ok: false, erro: `Não foi possível cadastrar "${limpo}".` }
  return { ok: true, id: novo }
}

/**
 * Erro da RPC → frase para o usuário. Os prefixos são o contrato combinado com a 0248; o
 * `else` genérico existe porque mensagem crua de Postgres na tela não ajuda ninguém.
 *
 * O caminho genérico é LOGADO no servidor (`console.error`) de propósito: sem isso, um erro que
 * ninguém previu — CHECK novo, código esgotado, corrida de permissão — viraria "tente novamente"
 * na tela e NADA no log, e o diagnóstico ficaria sem ponto de partida. (Achado do revisor-db.)
 */
function traduzirErro(msg: string): string {
  if (msg.includes('CODIGO_DUPLICADO'))       return 'Já existe um ativo com esse código.'
  if (msg.includes('DESCRICAO_OBRIGATORIA'))  return 'Informe a descrição do item.'
  if (msg.includes('CATEGORIA_OBRIGATORIA'))  return 'Escolha a categoria.'
  if (msg.includes('AREA_OBRIGATORIA'))       return 'Todo ativo nasce numa área — escolha uma.'
  if (msg.includes('ESTADO_INVALIDO'))        return 'Estado de conservação inválido.'
  if (msg.includes('ATIVO_NAO_ENCONTRADO'))   return 'Este ativo não existe mais. Recarregue a página.'
  // A recusa de localização na ficha é a invariante 3 virando código: se ela aparecer aqui, é
  // bug de front (o formulário de edição não deve nem ter esses campos) — a frase diz o caminho.
  if (msg.includes('LOCALIZACAO_IMUTAVEL'))
    return 'Área e detentor não se editam na ficha: registre uma movimentação.'
  if (msg.includes('NOME_OBRIGATORIO'))       return 'Informe o nome da pessoa.'
  // Razão (M4). Os três primeiros são as regras do append-only respondendo.
  if (msg.includes('ATIVO_BAIXADO'))
    return 'Ativo baixado só aceita reativação — a baixa não se apaga, se reverte com um registro novo.'
  if (msg.includes('ATIVO_NAO_BAIXADO'))      return 'Reativação só faz sentido depois de uma baixa.'
  if (msg.includes('ABERTURA_UNICA'))         return 'A movimentação de cadastro nasce junto do ativo e não se repete.'
  if (msg.includes('DESTINO_INCOERENTE'))     return 'Os campos de destino não batem com o tipo escolhido.'
  if (msg.includes('DATA_INVALIDA'))          return 'Data fora do intervalo aceito — confira o ano.'
  if (msg.includes('TIPO_INVALIDO'))          return 'Tipo de movimentação inválido.'
  if (msg.includes('MOTIVO_INVALIDO'))        return 'Motivo de baixa inválido.'
  if (msg.includes('MOVIMENTACAO_NAO_ENCONTRADA'))
    return 'Esta movimentação não existe mais. Recarregue a página.'
  // CHECKs de coluna da 0247 — alcançáveis pela UI: a máscara de moeda aceita "-" e o campo de
  // data aceita qualquer ano digitado.
  if (msg.includes('valor_aquisicao'))        return 'O valor de aquisição não pode ser negativo.'
  if (msg.includes('data_aquisicao'))         return 'Data de aquisição fora do intervalo aceito — confira o ano.'
  // Sequência de código esgotada (10 mil tentativas) e usuário desativado no meio da operação.
  if (msg.includes('CODIGO_ESGOTADO'))
    return 'Não foi possível gerar um código novo. Avise o time — a sequência precisa de atenção.'
  if (msg.includes('USUARIO_INATIVO'))        return 'Seu acesso foi desativado. Recarregue a página.'
  if (msg.includes('PERMISSAO_NEGADA') || msg.includes('AUTH'))
    return 'Sem permissão para editar o inventário.'

  console.error(`[patrimonio] erro não mapeado: ${msg}`)
  return 'Não foi possível salvar. Tente novamente.'
}

function idEcodigo(data: unknown): { id: number; codigo: string } | null {
  const d = data as { id?: unknown; codigo?: unknown } | null
  return typeof d?.id === 'number' && typeof d?.codigo === 'string'
    ? { id: d.id, codigo: d.codigo }
    : null
}

export async function criarAtivo(ficha: FichaEntrada, abertura: AberturaEntrada): Promise<Resultado> {
  await requireAreaAction('gestao-pessoas/inventario')
  const db = await getServerClient()

  const pessoa = await resolverDetentor(db, abertura.detentor_destino_id, abertura.detentor_destino_nome)
  if (!pessoa.ok) return pessoa

  const { data, error } = await rpcPatrimonio(db, 'patrimonio_criar_ativo', {
    p_descricao:           ficha.descricao,
    p_categoria_id:        ficha.categoria_id,
    p_area_destino_id:     abertura.area_destino_id,
    p_detentor_destino_id: pessoa.id,
    p_codigo:              ficha.codigo,
    p_numero_serie:        ficha.numero_serie,
    p_fornecedor:          ficha.fornecedor,
    p_data_aquisicao:      ficha.data_aquisicao,
    p_valor_aquisicao:     ficha.valor_aquisicao,
    p_nota_fiscal:         ficha.nota_fiscal,
    p_estado_conservacao:  ficha.estado_conservacao,
    p_obs:                 ficha.obs,
    p_data_movimentacao:   abertura.data_movimentacao,
    p_obs_movimentacao:    abertura.obs_movimentacao,
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }

  const criado = idEcodigo(data)
  if (!criado) return { ok: false, erro: 'O ativo foi criado, mas a resposta veio incompleta. Recarregue a página.' }

  revalidatePath(ROTA)
  return { ok: true, ...criado }
}

/**
 * Atualiza SÓ identidade e ficha. Área e detentor não são enviados — e a RPC recusaria mesmo
 * que fossem (invariante 3): localização muda por movimentação, nunca por correção de cadastro.
 */
export async function atualizarAtivo(id: number, ficha: FichaEntrada): Promise<Resultado> {
  await requireAreaAction('gestao-pessoas/inventario')
  const db = await getServerClient()

  const { data, error } = await rpcPatrimonio(db, 'patrimonio_atualizar_ativo', {
    p_id:                 id,
    p_descricao:          ficha.descricao,
    p_categoria_id:       ficha.categoria_id,
    p_codigo:             ficha.codigo,
    p_numero_serie:       ficha.numero_serie,
    p_fornecedor:         ficha.fornecedor,
    p_data_aquisicao:     ficha.data_aquisicao,
    p_valor_aquisicao:    ficha.valor_aquisicao,
    p_nota_fiscal:        ficha.nota_fiscal,
    p_estado_conservacao: ficha.estado_conservacao,
    p_obs:                ficha.obs,
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }

  const salvo = idEcodigo(data)
  if (!salvo) return { ok: false, erro: 'A ficha foi salva, mas a resposta veio incompleta. Recarregue a página.' }

  revalidatePath(ROTA)
  return { ok: true, ...salvo }
}

/**
 * Ficha + histórico do ativo, para o drawer. LEITURA — está aqui, e não na página, porque o
 * drawer abre por clique, depois do render.
 *
 * Por que uma RPC própria em vez de filtrar o razão já carregado: (a) `detalhe_ativo` lê as
 * duas coisas numa ÚNICA transação, então ficha e histórico nunca saem de instantes diferentes
 * (invariante 10); (b) o razão da página vem com teto de 2000 linhas — filtrar dele truncaria
 * o histórico de um ativo EM SILÊNCIO quando o parque crescer.
 */
export async function carregarDetalhe(
  ativoId: number,
): Promise<{ ok: true; detalhe: AtivoDetalhe } | { ok: false; erro: string }> {
  await requireAreaAction('gestao-pessoas/inventario')
  const db = await getServerClient()

  const res = await rpcPatrimonio(db, 'patrimonio_detalhe_ativo', { p_ativo_id: ativoId })
  if (res.error) return { ok: false, erro: traduzirErro(res.error.message) }

  const detalhe = parseRpc(patrimonioDetalheSchema, res, 'patrimonio_detalhe_ativo')
  if (!detalhe) return { ok: false, erro: 'Não foi possível carregar o histórico deste ativo.' }
  return { ok: true, detalhe }
}

// ── Razão (M4) ────────────────────────────────────────────────────────────────────────

/** Uma linha nova do razão. `registrado_por` NÃO está aqui: vem da sessão (invariante 7). */
export interface MovimentacaoEntrada {
  ativo_id: number
  tipo: TipoMovimentacao
  data_movimentacao: string
  area_destino_id: number | null
  detentor_destino_id: number | null
  /** Nome digitado que ainda não existe → cadastro inline pelo próprio combobox. */
  detentor_destino_nome: string | null
  destino_texto: string | null
  motivo_baixa: MotivoBaixa | null
  obs: string | null
}

export type ResultadoMovimentacao =
  | { ok: true; id: number; status: StatusAtivo }
  | { ok: false; erro: string }

/**
 * Append-only: sempre INSERT, nunca UPDATE de destino. Erro de destino se conserta com uma
 * movimentação nova — inclusive a baixa, que se reverte por `reativacao` (a RPC recusa
 * qualquer outro tipo sobre ativo baixado, e recusa reativação sobre ativo não-baixado).
 */
export async function registrarMovimentacao(
  entrada: MovimentacaoEntrada,
): Promise<ResultadoMovimentacao> {
  await requireAreaAction('gestao-pessoas/inventario')
  const db = await getServerClient()

  const pessoa = await resolverDetentor(db, entrada.detentor_destino_id, entrada.detentor_destino_nome)
  if (!pessoa.ok) return pessoa

  const { data, error } = await rpcPatrimonio(db, 'patrimonio_registrar_movimentacao', {
    p_ativo_id:            entrada.ativo_id,
    p_tipo:                entrada.tipo,
    p_data_movimentacao:   entrada.data_movimentacao,
    p_area_destino_id:     entrada.area_destino_id,
    p_detentor_destino_id: pessoa.id,
    p_destino_texto:       entrada.destino_texto,
    p_motivo_baixa:        entrada.motivo_baixa,
    p_obs:                 entrada.obs,
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }

  const d = data as { id?: unknown; status?: unknown } | null
  if (typeof d?.id !== 'number' || typeof d?.status !== 'string') {
    return { ok: false, erro: 'A movimentação foi registrada, mas a resposta veio incompleta. Recarregue a página.' }
  }

  revalidatePath(ROTA)
  return { ok: true, id: d.id, status: d.status as StatusAtivo }
}

/**
 * A ÚNICA mutação permitida no razão (invariante 4): a observação. Nem destino, nem data, nem
 * tipo — e nada se deleta. O diário genérico da 0199 registra o antes/depois pelo trigger.
 */
export async function atualizarObsMovimentacao(
  id: number,
  obs: string | null,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  await requireAreaAction('gestao-pessoas/inventario')
  const db = await getServerClient()

  const { error } = await rpcPatrimonio(db, 'patrimonio_atualizar_obs_movimentacao', {
    p_id:  id,
    p_obs: obs,
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }

  revalidatePath(ROTA)
  return { ok: true }
}
