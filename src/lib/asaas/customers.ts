import 'server-only'

// ensure_customer — fiel ao script legado (asaas_from_simple_sheet.py / asaas_nfe_from_contas.py):
// busca por cpfCnpj → se existe, usa; senão busca por nome → se existe e falta cpfCnpj/email,
// COMPLETA (PUT); senão CRIA (POST) com name+cpfCnpj (+ email + endereço da raw.pessoas).
// Para BOLETO basta name+cpfCnpj (B1). Para NF (Fase 2), o endereço é FISCALMENTE exigido no
// customer — por isso `opts.completarEndereco` faz o PUT de endereço num cadastro já existente
// que esteja sem endereço (o que o script de NF faz via needs_address_update). A inscrição do
// CLIENTE NUNCA é enviada (o create_invoice não usa; quem importa é a do EMITENTE, B6).

import { asaasReq, emailValido, onlyDigits, type AsaasResult } from './client'

interface AsaasCustomer {
  id:             string
  cpfCnpj?:       string | null
  email?:         string | null
  name?:          string
  address?:       string | null
  addressNumber?: string | null
  complement?:    string | null
  province?:      string | null
  postalCode?:    string | null
  city?:          string | null
  state?:         string | null
}

/** Dados do cliente vindos da raw.pessoas (cadastro casado). cpfCnpj já só-dígitos. */
export interface DadosCliente {
  nome:         string
  cpfCnpj:      string
  email?:       string | null
  endereco?:    string | null
  numero?:      string | null
  complemento?: string | null
  bairro?:      string | null
  cep?:         string | null
  cidade?:      string | null
  uf?:          string | null
}

export interface EnsureResult { customerId: string; created: boolean; updated: boolean }

/** CEP só-dígitos e SÓ se tiver exatamente 8 (fiel ao clean_cep do script — nunca envia CEP inválido). */
function cep8(cep: string | null | undefined): string | null {
  const d = onlyDigits(cep)
  return d && d.length === 8 ? d : null
}

/** Campos de endereço que o customer NÃO tem e a raw.pessoas tem (só o que falta). */
function enderecoFaltando(cust: AsaasCustomer, d: DadosCliente): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const cepOk = cust.postalCode && /^\d{8}$/.test(String(cust.postalCode))
  const cep = cep8(d.cep)
  if (!cepOk && cep)                        body.postalCode    = cep
  if (!cust.address && d.endereco)          body.address       = d.endereco
  if (!cust.addressNumber && d.numero)      body.addressNumber = d.numero
  if (!cust.province && d.bairro)           body.province      = d.bairro
  if (!cust.city && d.cidade)               body.city          = d.cidade
  if (!cust.state && d.uf)                  body.state         = d.uf
  if (!cust.complement && d.complemento)    body.complement    = d.complemento
  return body
}

/** Corpo de criação com endereço da raw.pessoas (usado no POST). */
function corpoEndereco(d: DadosCliente): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (d.endereco)    body.address       = d.endereco
  if (d.numero)      body.addressNumber = d.numero
  if (d.complemento) body.complement    = d.complemento
  if (d.bairro)      body.province      = d.bairro
  if (d.cidade)      body.city          = d.cidade
  if (d.uf)          body.state         = d.uf
  const cep = cep8(d.cep)
  if (cep)           body.postalCode    = cep
  return body
}

/**
 * @param opts.completarEndereco  (Fase 2/NF) se o cadastro existente estiver sem endereço,
 *   completa via PUT com os dados da raw.pessoas. Sem a flag (boleto/Fase 1), NÃO mexe no
 *   endereço de um cadastro existente — comportamento da Fase 1 preservado byte-a-byte.
 */
export async function ensureCustomer(
  d: DadosCliente,
  opts?: { completarEndereco?: boolean },
): Promise<AsaasResult<EnsureResult>> {
  const completar = opts?.completarEndereco === true

  // 1) por cpfCnpj
  const porDoc = await asaasReq<{ data?: AsaasCustomer[] }>('GET', '/customers', { params: { cpfCnpj: d.cpfCnpj, limit: '1' } })
  if (!porDoc.ok) return porDoc
  const achadoDoc = porDoc.data.data?.[0]
  if (achadoDoc) {
    if (completar) {
      const body = enderecoFaltando(achadoDoc, d)
      if (Object.keys(body).length) {
        const upd = await asaasReq<AsaasCustomer>('PUT', `/customers/${achadoDoc.id}`, { body })
        if (!upd.ok) return upd
        return { ok: true, data: { customerId: achadoDoc.id, created: false, updated: true } }
      }
    }
    return { ok: true, data: { customerId: achadoDoc.id, created: false, updated: false } }
  }

  // 2) por nome — completa cpfCnpj/email (+ endereço se completar) se faltarem
  const porNome = await asaasReq<{ data?: AsaasCustomer[] }>('GET', '/customers', { params: { name: d.nome, limit: '1' } })
  if (!porNome.ok) return porNome
  const achadoNome = porNome.data.data?.[0]
  if (achadoNome) {
    const body: Record<string, unknown> = {}
    if (!achadoNome.cpfCnpj) body.cpfCnpj = d.cpfCnpj
    if (d.email && emailValido(d.email) && !achadoNome.email) body.email = d.email.trim()
    if (completar) Object.assign(body, enderecoFaltando(achadoNome, d))
    if (Object.keys(body).length) {
      const upd = await asaasReq<AsaasCustomer>('PUT', `/customers/${achadoNome.id}`, { body })
      if (!upd.ok) return upd
      return { ok: true, data: { customerId: achadoNome.id, created: false, updated: true } }
    }
    return { ok: true, data: { customerId: achadoNome.id, created: false, updated: false } }
  }

  // 3) cria — name + cpfCnpj (mínimo do boleto) + email + endereço da raw.pessoas
  const body: Record<string, unknown> = { name: d.nome, cpfCnpj: d.cpfCnpj, ...corpoEndereco(d) }
  if (d.email && emailValido(d.email)) body.email = d.email.trim()

  const criado = await asaasReq<AsaasCustomer>('POST', '/customers', { body })
  if (!criado.ok) return criado
  return { ok: true, data: { customerId: criado.data.id, created: true, updated: false } }
}
