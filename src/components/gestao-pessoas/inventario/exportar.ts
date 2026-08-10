// Export CSV das duas abas do Inventário (v5.6.0/M5).
//
// O mecanismo do dialeto Excel pt-BR (BOM, `;`, vírgula decimal, CRLF, guarda de fórmula) vive
// em `@/lib/patrimonio/csv`; aqui ficam só as COLUNAS de cada aba — o que é assunto do domínio.
//
// Exporta o que está NA TELA (a lista já filtrada), não a base inteira: o botão fica ao lado
// dos filtros, então é isso que ele promete. Um export que ignorasse o filtro devolveria um
// arquivo que não bate com o número exibido logo abaixo da tabela.

import {
  celulaData, celulaDataHora, celulaNumero, celulaTexto, montarCsv,
} from '@/lib/patrimonio/csv'
import {
  ROTULO_ESTADO_CONSERVACAO, ROTULO_MOTIVO_BAIXA, ROTULO_STATUS, ROTULO_TIPO, rotuloDestino,
} from './derivar'
import type { AtivoLista, Movimentacao } from './tipos'

const COLUNAS_ATIVOS = [
  'Código', 'Item', 'Categoria', 'Nº de série', 'Status', 'Área atual', 'Com quem / onde',
  'Última movimentação', 'Fornecedor', 'Data de aquisição', 'Valor de aquisição (R$)',
  'Nota fiscal', 'Estado de conservação', 'Observações',
]

export function csvDeAtivos(ativos: AtivoLista[]): string {
  return montarCsv(COLUNAS_ATIVOS, ativos.map(a => [
    celulaTexto(a.codigo),
    celulaTexto(a.descricao),
    celulaTexto(a.categoria_nome),
    celulaTexto(a.numero_serie),
    celulaTexto(ROTULO_STATUS[a.status]),
    celulaTexto(a.area_atual_nome),
    // Mesma regra da coluna da tabela: pessoa, ou o local em texto quando não há pessoa.
    celulaTexto(a.detentor_atual_nome ?? a.local_atual_texto),
    celulaData(a.ultima_movimentacao_em),
    celulaTexto(a.fornecedor),
    celulaData(a.data_aquisicao),
    celulaNumero(a.valor_aquisicao),
    celulaTexto(a.nota_fiscal),
    celulaTexto(a.estado_conservacao ? ROTULO_ESTADO_CONSERVACAO[a.estado_conservacao] : null),
    celulaTexto(a.obs),
  ]))
}

const COLUNAS_MOVS = [
  'Data', 'Registro retroativo', 'Código', 'Item', 'Tipo', 'Origem', 'Destino',
  'Motivo da baixa', 'Observação', 'Registrado por', 'Registrado em',
]

/** Uma linha do razão com a ORIGEM já derivada da cadeia do ativo (invariante 2). */
export interface LinhaRazao {
  mov: Movimentacao
  origem: string | null
  retroativa: boolean
  codigo: string
  descricao: string
}

export function csvDeMovimentacoes(linhas: LinhaRazao[]): string {
  return montarCsv(COLUNAS_MOVS, linhas.map(({ mov, origem, retroativa, codigo, descricao }) => [
    celulaData(mov.data_movimentacao),
    celulaTexto(retroativa ? 'Sim' : ''),
    celulaTexto(codigo),
    celulaTexto(descricao),
    celulaTexto(ROTULO_TIPO[mov.tipo]),
    celulaTexto(origem),
    celulaTexto(rotuloDestino(mov)),
    celulaTexto(mov.motivo_baixa ? ROTULO_MOTIVO_BAIXA[mov.motivo_baixa] : null),
    celulaTexto(mov.obs),
    celulaTexto(mov.registrado_por_rotulo),
    celulaDataHora(mov.criado_em),
  ]))
}

/**
 * Dispara o download no navegador. `text/csv` + BOM já embutido no conteúdo.
 * Isolada aqui (e não dentro dos geradores) para o CSV continuar sendo função pura — é o que
 * permite testá-lo caractere a caractere sem DOM.
 */
export function baixarCsv(nomeArquivo: string, conteudo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  // Sem o revoke o blob fica retido na aba até o reload.
  URL.revokeObjectURL(url)
}
