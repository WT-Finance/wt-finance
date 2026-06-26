// Validação de COLUNAS obrigatórias no cabeçalho de uma planilha de upload (v4.29.0).
//
// As 5 bases da Atualização de Dados declaram seus requisitos (label amigável +
// headers que o satisfazem) e este helper devolve os labels FALTANTES — uma mensagem
// clara ANTES de processar, em vez de erro técnico. Valida só a PRESENÇA da COLUNA no
// cabeçalho, NUNCA se a célula está preenchida (uma base como Pessoas tem a maioria das
// células vazia, e isso é esperado).
//
// Não-regressão (Frente 2): o helper faz set-membership simples sobre os headers
// passados; CADA base controla se normaliza (acento/caixa) ou compara exato ANTES de
// chamar — espelhando o que o parser dela já fazia, sem mudar o que aceita/rejeita.

export interface RequisitoColuna {
  /** Rótulo amigável exibido ao usuário (ex.: "Valor Final"). */
  label:   string
  /** Headers que SATISFAZEM o requisito (variantes aceitas; ex.: ['Valor Final','Valor_Final']). */
  aceitos: string[]
}

/** LABELS cujos `aceitos` não estão presentes nos headers. Vazio = todas presentes. */
export function validarColunasObrigatorias(headers: string[], requisitos: RequisitoColuna[]): string[] {
  const presentes = new Set(headers.map(h => h.trim()))
  return requisitos
    .filter(req => !req.aceitos.some(a => presentes.has(a)))
    .map(req => req.label)
}

/** Mensagem amigável única — mesma em todas as 5 bases. */
export function mensagemColunasFaltando(faltando: string[]): string {
  return `Sua planilha precisa conter as colunas: ${faltando.join(', ')}.`
}
