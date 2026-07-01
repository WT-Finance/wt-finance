// Faturamento Corporativo — Fase 1a (v4.30.0). Classificação PURA (isomórfica, testável).
// Cruza cada fatura com a base de pessoas (mapa nome→cadastros vindo de buscar_pessoas) e
// classifica: pronta / sem_dados_fiscais / nao_identificado. NADA é emitido — só informa a
// tela de revisão (e, na prática, expõe quantos clientes vêm sem dados fiscais — informa a 1b).

import type {
  FaturaRaw, FaturaClassificada, PessoaCadastro, StatusCruzamento, ResumoFaturamento,
} from './tipos'

// E-mail válido — espelha emailValido de @/lib/asaas/client (server-only; aqui é client-side).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const emailValido = (e: string | null): boolean => !!e && EMAIL_RE.test(e.trim())

/** Campos fiscais conferidos para a prontidão (boleto exige CPF/CNPJ; a NF exige, além, endereço + CEP + e-mail do tomador — o Asaas valida o e-mail). */
function camposFaltantes(p: PessoaCadastro): string[] {
  const faltam: string[] = []
  if (!p.cnpj && !p.cpf)      faltam.push('CPF/CNPJ')
  if (!p.endereco)            faltam.push('Endereço')
  if (!p.cep)                 faltam.push('CEP')
  if (!emailValido(p.email))  faltam.push('E-mail')
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
    // Prontidão-NF (Fase 2): a NF exige CPF/CNPJ + endereço + CEP + e-mail válido (o Asaas
    // valida o e-mail do tomador para autorizar a NFS-e) — mais que o boleto.
    const prontaNf = temCpfCnpj && Boolean(cadastro.endereco) && Boolean(cadastro.cep) && emailValido(cadastro.email)

    return {
      ...f,
      status,
      cadastro,
      faltam,
      multiplos: matches.length > 1,
      emitir: status === 'pronta', // sugestão; o usuário decide (nada é emitido em 1a)
      prontaNf,
      modoNf: 'nao',               // NF é opcional por linha; default não emitir (o Yan decide)
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
