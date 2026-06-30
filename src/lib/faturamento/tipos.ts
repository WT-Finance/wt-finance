// Faturamento Corporativo — Fase 1a (v4.30.0). Tipos compartilhados.
// READ-ONLY: importa a crua, cruza com a base de pessoas (buscar_pessoas, v4.29.0) e
// classifica para a tela de revisão. NADA é emitido (a emissão é a Fase 1b).

/** Estado do cruzamento de uma fatura com a base de pessoas. */
export type StatusCruzamento =
  | 'pronta'             // cliente casou E tem o mínimo fiscal (CPF/CNPJ — exigido pelo Asaas na 1b)
  | 'sem_dados_fiscais'  // cliente casou mas falta CPF/CNPJ (na 1b não daria p/ emitir)
  | 'nao_identificado'   // nome não está na base de pessoas

/** Uma linha da planilha crua (faturamento.xlsx), já coagida. */
export interface FaturaRaw {
  linha:             number
  numero:            string | null
  emissao:           string | null  // ISO (YYYY-MM-DD)
  pessoa:            string | null  // trimado (chave do cruzamento)
  vencimento:        string | null  // ISO
  valor:             number | null  // "Valor Final"
  /** "Fatura Cliente Nº" — TEXT (será o externalReference/idempotência da Fase 1b). */
  fatura_cliente_no: string | null
}

/** Cadastro de pessoa devolvido por buscar_pessoas (raw.pessoas, sem carregado_em). */
export interface PessoaCadastro {
  nome:                string
  razao_social:        string | null
  cnpj:                string | null
  cpf:                 string | null
  cep:                 string | null
  endereco:            string | null
  numero:              string | null
  complemento:         string | null
  bairro:              string | null
  cidade:              string | null
  uf:                  string | null
  pais:                string | null
  inscricao_estadual:  string | null
  inscricao_municipal: string | null
  email:               string | null
  telefone:            string | null
  celular:             string | null
}

/** Uma fatura já cruzada/classificada para a tela de revisão. */
export interface FaturaClassificada extends FaturaRaw {
  status:    StatusCruzamento
  cadastro:  PessoaCadastro | null  // a pessoa casada (1ª, se houver)
  /** Campos fiscais ausentes no cadastro (rótulos) — informa a prontidão p/ boleto/NF. */
  faltam:    string[]
  /** >1 cadastro com o mesmo nome (ambiguidade — homônimos na base). */
  multiplos: boolean
  /** Sugestão default do toggle "Emitir Boleto" (o usuário decide; nada é emitido em 1a). */
  emitir:    boolean
}

export interface ResumoFaturamento {
  total:            number
  valorTotal:       number
  prontas:          number
  semDados:         number
  naoIdentificadas: number
}
