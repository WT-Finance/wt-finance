import 'server-only'

// Notas fiscais (NFS-e) no Asaas — Fase 2 (v4.32.0). Fiel ao script legado
// (docs/faturamento-legado/asaas_nfe_from_contas.py). Reusa client.ts (server-only, header
// access_token, timeout, erro {errors:[…]}) e ensureCustomer (estendido p/ endereço).
//
// DIFERENÇA ESTRUTURAL vs boleto: a NF é ASSÍNCRONA. createInvoice + authorizeInvoice NÃO
// retornam a nota pronta — o status evolui (SCHEDULED/PENDING → PROCESSING → AUTHORIZED com
// pdf/xml/number | ERROR/CANCELLED). getInvoiceById (refresh) resolve depois.
//
// Idempotência por externalReference (como o boleto), com uma torção do script: NF NORMAL usa
// o Fatura Cliente Nº; NF AVULSA usa `<ref>-AVULSA` — separando as chaves (não colidem).
//
// Campos fiscais FIXOS = config da Welcome (do script), NÃO vêm da crua nem da pessoa:
// serviceDescription (texto da Portaria), municipalServiceCode 9.02 / name "Serviços diversos",
// taxes (ISS 5% parametrizável, demais 0, retainIss false), deductions = value.

import { asaasReq, type AsaasResult } from './client'

/** Resposta de uma NFS-e (shape do script/refresh; B3 a confirmar no sandbox). */
export interface InvoiceAsaas {
  id:                 string
  status:             string  // SCHEDULED | PENDING | PROCESSING | AUTHORIZED | ERROR | CANCELLED …
  pdfUrl?:            string | null
  xmlUrl?:            string | null
  number?:            string | null
  rpsNumber?:         string | null
  verificationCode?:  string | null
  value?:             number
  effectiveDate?:     string | null
  externalReference?: string | null
}

export type ModoNota = 'normal' | 'avulsa'

// ── Config fiscal FIXA da Welcome (do script; não inventar) ───────────────────
export const NF_SERVICE_DESCRIPTION = 'Nota fiscal referente às despesas de viagem. Nota Fiscal emitida conforme Portaria 06/2008.'
export const NF_MUNICIPAL_CODE = '9.02'
export const NF_MUNICIPAL_NAME = 'Serviços diversos'
export const NF_ISS_PADRAO = 5 // era --iss 5 no script; parametrizável

/** externalReference da NF: normal usa a ref; avulsa recebe o sufixo -AVULSA (separa idempotência). */
export function externalReferenceNota(faturaClienteNo: string, modo: ModoNota): string {
  return modo === 'avulsa' ? `${faturaClienteNo}-AVULSA` : faturaClienteNo
}

function taxes(iss: number): Record<string, unknown> {
  return { retainIss: false, iss, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 }
}

/** Idempotência: NF já existente com este externalReference (ou null). */
export async function findInvoiceByExternalRef(ref: string): Promise<AsaasResult<InvoiceAsaas | null>> {
  const r = await asaasReq<{ data?: InvoiceAsaas[] }>('GET', '/invoices', { params: { externalReference: ref, limit: '1' } })
  if (!r.ok) return r
  return { ok: true, data: r.data.data?.[0] ?? null }
}

/** Refresh: estado atual da NF (status + pdf/xml/number/rps/verificationCode quando AUTHORIZED). */
export async function getInvoiceById(id: string): Promise<AsaasResult<InvoiceAsaas>> {
  return asaasReq<InvoiceAsaas>('GET', `/invoices/${id}`)
}

/**
 * Cria a NFS-e. XOR customer/payment (do script): se `payment` (vínculo ao boleto), envia
 * payment e NÃO customer; senão envia customer (standalone/avulsa). deductions = value.
 */
export async function createInvoice(p: {
  customer?: string | null
  payment?: string | null
  value: number
  externalReference: string
  effectiveDate: string
  iss?: number
}): Promise<AsaasResult<InvoiceAsaas>> {
  const temPayment = Boolean(p.payment)
  const body: Record<string, unknown> = {
    customer:             temPayment ? undefined : p.customer,
    payment:              temPayment ? p.payment : undefined,
    serviceDescription:   NF_SERVICE_DESCRIPTION,
    value:                p.value,
    externalReference:    p.externalReference,
    municipalServiceCode: NF_MUNICIPAL_CODE,
    municipalServiceName: NF_MUNICIPAL_NAME,
    effectiveDate:        p.effectiveDate,
    deductions:           p.value, // deduções = valor da nota (regra do script)
    taxes:                taxes(p.iss ?? NF_ISS_PADRAO),
  }
  return asaasReq<InvoiceAsaas>('POST', '/invoices', { body })
}

/** Solicita a autorização (a nota entra em PROCESSING). Separado do create (script). */
export async function authorizeInvoice(id: string): Promise<AsaasResult<InvoiceAsaas>> {
  return asaasReq<InvoiceAsaas>('POST', `/invoices/${id}/authorize`)
}
