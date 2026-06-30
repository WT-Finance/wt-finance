import 'server-only'

// Cobranças (boletos) no Asaas — fiel ao script legado. Idempotência por externalReference
// (= Fatura Cliente Nº): SEMPRE checar antes de criar (B2: rodar 2x não duplica). create
// envia billingType=BOLETO + fine/interest 2%/2% (defaults do script) + description padrão.

import { asaasReq, type AsaasResult } from './client'

/** Resposta de uma cobrança (B3: shape confirmado no sandbox). */
export interface BoletoAsaas {
  id:           string
  status:       string
  bankSlipUrl?: string | null
  invoiceUrl?:  string | null
  nossoNumero?: string | null
  value?:       number
  dueDate?:     string
}

export const NOTA_PADRAO = 'Após 5 dias em atraso o título será negativado.'
export const descricaoBoleto = (ref: string) => `Fatura ${ref} - ${NOTA_PADRAO}`

/** Idempotência: cobrança já existente com este externalReference (ou null). */
export async function findPaymentByExternalRef(ref: string): Promise<AsaasResult<BoletoAsaas | null>> {
  const r = await asaasReq<{ data?: BoletoAsaas[] }>('GET', '/payments', { params: { externalReference: ref, limit: '1' } })
  if (!r.ok) return r
  return { ok: true, data: r.data.data?.[0] ?? null }
}

export async function criarBoleto(p: {
  customer: string
  value: number
  dueDate: string
  externalReference: string
  fine?: number      // % multa (default 2)
  interest?: number  // % juros/mês (default 2)
}): Promise<AsaasResult<BoletoAsaas>> {
  const body: Record<string, unknown> = {
    customer:          p.customer,
    billingType:       'BOLETO',
    value:             p.value,
    dueDate:           p.dueDate,
    description:       descricaoBoleto(p.externalReference),
    externalReference: p.externalReference,
  }
  const fine = p.fine ?? 2.0
  const interest = p.interest ?? 2.0
  if (fine > 0)     body.fine     = { value: fine }
  if (interest > 0) body.interest = { value: interest }
  return asaasReq<BoletoAsaas>('POST', '/payments', { body })
}
