import 'server-only'

// ensure_customer — fiel ao script legado (asaas_from_simple_sheet.py): busca por cpfCnpj
// → se existe, usa; senão busca por nome → se existe e falta cpfCnpj/email, COMPLETA (PUT)
// com os dados da raw.pessoas; senão CRIA (POST) com name+cpfCnpj (+ email + endereço da
// raw.pessoas). Para BOLETO basta name+cpfCnpj (B1); o endereço enriquece o cadastro (NF
// futura). A base de pessoas é NECESSÁRIA — o cpfCnpj vem dela (a crua só tem o nome).

import { asaasReq, emailValido, onlyDigits, type AsaasResult } from './client'

interface AsaasCustomer { id: string; cpfCnpj?: string | null; email?: string | null; name?: string }

/** Dados do cliente vindos da raw.pessoas (cadastro casado). cpfCnpj já só-dígitos. */
export interface DadosCliente {
  nome:        string
  cpfCnpj:     string
  email?:      string | null
  endereco?:   string | null
  numero?:     string | null
  complemento?: string | null
  bairro?:     string | null
  cep?:        string | null
}

export interface EnsureResult { customerId: string; created: boolean; updated: boolean }

export async function ensureCustomer(d: DadosCliente): Promise<AsaasResult<EnsureResult>> {
  // 1) por cpfCnpj
  const porDoc = await asaasReq<{ data?: AsaasCustomer[] }>('GET', '/customers', { params: { cpfCnpj: d.cpfCnpj, limit: '1' } })
  if (!porDoc.ok) return porDoc
  const achadoDoc = porDoc.data.data?.[0]
  if (achadoDoc) return { ok: true, data: { customerId: achadoDoc.id, created: false, updated: false } }

  // 2) por nome — completa cpfCnpj/email se faltarem (raw.pessoas é a fonte)
  const porNome = await asaasReq<{ data?: AsaasCustomer[] }>('GET', '/customers', { params: { name: d.nome, limit: '1' } })
  if (!porNome.ok) return porNome
  const achadoNome = porNome.data.data?.[0]
  if (achadoNome) {
    const precisaDoc   = !achadoNome.cpfCnpj
    const precisaEmail = Boolean(d.email && emailValido(d.email) && !achadoNome.email)
    if (precisaDoc || precisaEmail) {
      const body: Record<string, unknown> = {}
      if (precisaDoc) body.cpfCnpj = d.cpfCnpj
      if (precisaEmail) body.email = d.email!.trim()
      const upd = await asaasReq<AsaasCustomer>('PUT', `/customers/${achadoNome.id}`, { body })
      if (!upd.ok) return upd
      return { ok: true, data: { customerId: achadoNome.id, created: false, updated: true } }
    }
    return { ok: true, data: { customerId: achadoNome.id, created: false, updated: false } }
  }

  // 3) cria — name + cpfCnpj (mínimo do boleto) + email + endereço da raw.pessoas
  const body: Record<string, unknown> = { name: d.nome, cpfCnpj: d.cpfCnpj }
  if (d.email && emailValido(d.email)) body.email = d.email.trim()
  if (d.endereco)    body.address       = d.endereco
  if (d.numero)      body.addressNumber = d.numero
  if (d.complemento) body.complement    = d.complemento
  if (d.bairro)      body.province      = d.bairro
  const cep = onlyDigits(d.cep)
  if (cep)           body.postalCode    = cep

  const criado = await asaasReq<AsaasCustomer>('POST', '/customers', { body })
  if (!criado.ok) return criado
  return { ok: true, data: { customerId: criado.data.id, created: true, updated: false } }
}
