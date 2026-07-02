// Faturamento Corporativo — Fase 1a (v4.30.0). Classificação PURA (isomórfica, testável).
// Cruza cada fatura com a base de pessoas (mapa nome→cadastros vindo de buscar_pessoas) e
// classifica: pronta / sem_dados_fiscais / nao_identificado. NADA é emitido — só informa a
// tela de revisão (e, na prática, expõe quantos clientes vêm sem dados fiscais — informa a 1b).

import type {
  FaturaRaw, FaturaClassificada, PessoaCadastro, StatusCruzamento, ResumoFaturamento,
} from './tipos'

/** Campos fiscais conferidos para a prontidão (boleto exige CPF/CNPJ; a NF exige, além, endereço + CEP).
 *  O e-mail do tomador NÃO entra aqui: é permissivo — o Asaas pode já ter o e-mail no cadastro dele
 *  (mesmo sem na base); quem valida o e-mail é o Asaas na emissão (com aviso claro se faltar). */
function camposFaltantes(p: PessoaCadastro): string[] {
  const faltam: string[] = []
  if (!p.cnpj && !p.cpf) faltam.push('CPF/CNPJ')
  if (!p.endereco)       faltam.push('Endereço')
  if (!p.cep)            faltam.push('CEP')
  return faltam
}

/**
 * @param faturas linhas da crua já coagidas
 * @param mapa    nome TRIMADO → cadastros (de buscar_pessoas; pode ter >1 = homônimo)
 */
export function classificarFaturas(
  faturas: FaturaRaw[],
  mapa: Record<string, PessoaCadastro[]>,
): { faturas: FaturaClassificada[]; resumo: ResumoFaturamento } {
  const classificadas: FaturaClassificada[] = faturas.map(f => {
    const nome = (f.pessoa ?? '').trim()
    const matches = nome ? (mapa[nome] ?? []) : []

    if (matches.length === 0) {
      return { ...f, status: 'nao_identificado', cadastro: null, faltam: [], multiplos: false, emitir: false, prontaNf: false, modoNf: 'nao', valorAvulso: null }
    }

    const cadastro = matches[0]
    const faltam = camposFaltantes(cadastro)
    const temCpfCnpj = Boolean(cadastro.cnpj || cadastro.cpf)
    const status: StatusCruzamento = temCpfCnpj ? 'pronta' : 'sem_dados_fiscais'
    // Prontidão-NF (Fase 2): a NF exige CPF/CNPJ + endereço + CEP (mais que o boleto). O e-mail
    // do tomador é validado pelo Asaas na emissão (permissivo: o Asaas pode já tê-lo no cadastro).
    const prontaNf = temCpfCnpj && Boolean(cadastro.endereco) && Boolean(cadastro.cep)

    return {
      ...f,
      status,
      cadastro,
      faltam,
      multiplos: matches.length > 1,
      emitir: status === 'pronta', // sugestão; o usuário decide (nada é emitido em 1a)
      prontaNf,
      modoNf: prontaNf ? 'normal' : 'nao', // default Normal quando a fatura está pronta p/ NF (o usuário decide)
      valorAvulso: null,
    }
  })

  const resumo: ResumoFaturamento = {
    total:            classificadas.length,
    valorTotal:       classificadas.reduce((s, f) => s + (f.valor ?? 0), 0),
    prontas:          classificadas.filter(f => f.status === 'pronta').length,
    semDados:         classificadas.filter(f => f.status === 'sem_dados_fiscais').length,
    naoIdentificadas: classificadas.filter(f => f.status === 'nao_identificado').length,
  }

  return { faturas: classificadas, resumo }
}

/** Constrói o mapa nome-trimado → cadastros a partir do array plano de buscar_pessoas. */
export function mapaPorNome(cadastros: PessoaCadastro[]): Record<string, PessoaCadastro[]> {
  const mapa: Record<string, PessoaCadastro[]> = {}
  for (const c of cadastros) {
    const nome = (c.nome ?? '').trim()
    if (!nome) continue
    ;(mapa[nome] ??= []).push(c)
  }
  return mapa
}
