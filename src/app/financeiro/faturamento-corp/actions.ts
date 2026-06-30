'use server'

// Faturamento Corporativo — Fase 1a (v4.30.0). Server action do CRUZAMENTO (read-only).
// Recebe os nomes distintos da coluna Pessoa, chama buscar_pessoas (v4.29.0, gate
// estendido p/ esta área na 0161) e devolve os cadastros. NÃO chama o Asaas, NÃO grava
// nada — a classificação e a tela de revisão acontecem no cliente. Emissão = Fase 1b.

import { getServerClient } from '@/lib/supabase/server'
import { requireAreaAction } from '@/lib/auth/sessao'
import { parseRpc, buscarPessoasSchema } from '@/lib/schemas-rpc'
import type { PessoaCadastro } from '@/lib/faturamento/tipos'
import { asaasAmbiente, asaasConfigurado, onlyDigits, type AsaasAmbiente } from '@/lib/asaas/client'
import { ensureCustomer } from '@/lib/asaas/customers'
import { findPaymentByExternalRef, criarBoleto } from '@/lib/asaas/boletos'

export async function cruzarFaturamento(nomes: string[]): Promise<PessoaCadastro[]> {
  await requireAreaAction('financeiro/faturamento-corp')
  const distinct = Array.from(new Set(nomes.map(n => (n ?? '').trim()).filter(Boolean)))
  if (distinct.length === 0) return []

  const db = await getServerClient()
  // `as any`: RPC não está nos tipos gerados do supabase (padrão do projeto).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (db.rpc as any)('buscar_pessoas', { p_nomes: distinct })
  return (parseRpc(buscarPessoasSchema, res, 'buscar_pessoas') ?? []) as PessoaCadastro[]
}

// ───────────────────────────────────────────────────────────────────────────
// Fase 1b (v4.31.0) — EMISSÃO de boletos (AÇÃO IRREVERSÍVEL sobre dinheiro).
//
// Invariantes (todos enforced server-side, não confiando no cliente):
//   • SANDBOX-first: o ambiente vem do env (asaasAmbiente), exibido na tela; produção só
//     por env consciente. O ambiente é devolvido no resultado para a UI nunca mentir.
//   • Idempotência DUPLA: (1) app.fatura_emissao_existentes (nosso registro) PULA refs já
//     emitidas; (2) findPaymentByExternalRef no Asaas antes de criar (rodar 2x não duplica).
//   • Falha parcial: cada fatura é uma transação independente (try/catch); uma falha NÃO
//     aborta as outras — reporta "M emitidos, J falharam, K pulados".
//   • Rastreabilidade: TODA tentativa (sucesso, já-existente ou falha) grava em
//     app.fatura_emissao via registrar_emissao (registro = fonte da verdade + 2ª trava).
//   • Só clientes PRONTOS emitem: a action re-busca o cadastro por nome e exige CPF/CNPJ
//     (re-validação do "pronta" da 1a — o cliente não decide isso).
// ───────────────────────────────────────────────────────────────────────────

/** Uma fatura marcada para emitir (payload mínimo do cliente; o cadastro é re-buscado). */
export interface FaturaEmitir {
  pessoa:            string
  valor:             number | null
  vencimento:        string | null  // ISO YYYY-MM-DD
  fatura_cliente_no: string | null
}

export interface ItemEmissao {
  ref:          string
  pessoa:       string
  resultado:    'emitido' | 'ja_existia' | 'falhou' | 'pulado'
  paymentId?:   string | null
  bankSlipUrl?: string | null
  invoiceUrl?:  string | null
  status?:      string | null
  erro?:        string
  /** Boleto criado/encontrado no Asaas mas o registro local falhou (o Asaas é a verdade). */
  registroFalhou?: boolean
}

export interface ResultadoEmissao {
  ambiente:   AsaasAmbiente
  emitidos:   ItemEmissao[]
  jaExistiam: ItemEmissao[]
  falharam:   ItemEmissao[]
  pulados:    ItemEmissao[]
  total:      number
}

/* eslint-disable @typescript-eslint/no-explicit-any */ // RPCs fora dos tipos gerados (padrão do projeto)

export async function emitirBoletos(
  faturas: FaturaEmitir[],
  opts?: { confirmacaoProducao?: boolean },
): Promise<ResultadoEmissao> {
  await requireAreaAction('financeiro/faturamento-corp') // authz: lança = negação (não é "falhou")
  const ambiente = asaasAmbiente()

  const vazio: ResultadoEmissao = { ambiente, emitidos: [], jaExistiam: [], falharam: [], pulados: [], total: 0 }
  if (!faturas?.length) return vazio

  // Recusa o lote inteiro com um motivo, em resultado DISCRIMINADO (nunca um throw cru).
  const recusarTudo = (erro: string): ResultadoEmissao => ({
    ...vazio,
    total: faturas.length,
    falharam: faturas.map(f => ({
      ref: (f.fatura_cliente_no ?? '').trim() || '(sem nº)',
      pessoa: (f.pessoa ?? '').trim(),
      resultado: 'falhou' as const,
      erro,
    })),
  })

  // PRODUÇÃO exige confirmação reforçada também no SERVIDOR (não só na UI): sem o sinal
  // explícito, recusa — a confirmação deixa de ser cosmética e vira invariante server-side.
  if (ambiente === 'producao' && !opts?.confirmacaoProducao) {
    return recusarTudo('Emissão em PRODUÇÃO exige confirmação reforçada — não confirmada.')
  }

  // Sem chave configurada → não tenta nada (falha clara, nunca quebra). Fail-safe.
  if (!asaasConfigurado()) {
    return recusarTudo('Asaas não configurado neste ambiente (ASAAS_API_KEY ausente).')
  }

  const db = await getServerClient()

  // Setup (cadastros + 1ª trava de idempotência) numa barreira PROTEGIDA: se uma RPC de
  // leitura rejeitar, NADA foi emitido — devolve resultado discriminado ("nada confirmado"),
  // nunca um throw cru. (Falha aqui é setup, ANTES do laço — sem risco de duplicar boleto.)
  const porNome = new Map<string, PessoaCadastro>()
  let jaEmitidas = new Set<string>()
  try {
    // 1) Cadastros re-buscados server-side (o cliente não é fonte de verdade do CPF/CNPJ).
    const nomes = Array.from(new Set(faturas.map(f => (f.pessoa ?? '').trim()).filter(Boolean)))
    const resPessoas = await (db.rpc as any)('buscar_pessoas', { p_nomes: nomes })
    const cadastros = (parseRpc(buscarPessoasSchema, resPessoas, 'buscar_pessoas') ?? []) as PessoaCadastro[]
    for (const c of cadastros) {
      const k = (c.nome ?? '').trim()
      if (k && !porNome.has(k)) porNome.set(k, c) // 1º cadastro do nome (homônimo: usa o primeiro)
    }
    // 2) 1ª trava de idempotência: refs que JÁ têm emissão bem-sucedida no nosso registro.
    const refs = faturas.map(f => (f.fatura_cliente_no ?? '').trim()).filter(Boolean)
    const resExist = await (db.rpc as any)('fatura_emissao_existentes', { p_refs: refs })
    jaEmitidas = new Set<string>(Array.isArray(resExist?.data) ? resExist.data : [])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'falha ao consultar cadastros/idempotência'
    return recusarTudo(`Nada emitido — ${msg}. Verifique e tente de novo.`)
  }

  const out: ResultadoEmissao = { ambiente, emitidos: [], jaExistiam: [], falharam: [], pulados: [], total: faturas.length }

  // Sequencial: volume pequeno (uma planilha) e evita corrida no registro/idempotência.
  for (const f of faturas) {
    const ref = (f.fatura_cliente_no ?? '').trim()
    const pessoa = (f.pessoa ?? '').trim()
    const base: ItemEmissao = { ref: ref || '(sem nº)', pessoa, resultado: 'falhou' }

    try {
      // Re-validações server-side (defesa em profundidade — não confiar no cliente).
      if (!ref) { out.falharam.push({ ...base, erro: 'Fatura sem "Fatura Cliente Nº" (idempotência impossível).' }); continue }
      if (jaEmitidas.has(ref)) { out.pulados.push({ ...base, resultado: 'pulado', erro: 'Já emitida (registro existente).' }); continue }
      if (f.valor == null || !(f.valor > 0)) { out.falharam.push({ ...base, erro: 'Valor ausente ou não positivo.' }); await registrarFalha(db, f, ref, pessoa, ambiente, 'Valor ausente ou não positivo.'); continue }
      if (!f.vencimento) { out.falharam.push({ ...base, erro: 'Vencimento ausente.' }); await registrarFalha(db, f, ref, pessoa, ambiente, 'Vencimento ausente.'); continue }

      const cadastro = porNome.get(pessoa)
      const cpfCnpj = onlyDigits(cadastro?.cnpj) ?? onlyDigits(cadastro?.cpf)
      if (!cadastro) { out.falharam.push({ ...base, erro: 'Cliente não encontrado na base de pessoas.' }); await registrarFalha(db, f, ref, pessoa, ambiente, 'Cliente não encontrado na base de pessoas.'); continue }
      if (!cpfCnpj) { out.falharam.push({ ...base, erro: 'Cliente sem CPF/CNPJ na base (não emite boleto).' }); await registrarFalha(db, f, ref, pessoa, ambiente, 'Cliente sem CPF/CNPJ na base.'); continue }

      // ensure_customer (acha por doc → usa; por nome → completa; senão cria).
      const ens = await ensureCustomer({
        nome: pessoa || cadastro.nome, cpfCnpj,
        email: cadastro.email, endereco: cadastro.endereco, numero: cadastro.numero,
        complemento: cadastro.complemento, bairro: cadastro.bairro, cep: cadastro.cep,
      })
      if (!ens.ok) { out.falharam.push({ ...base, erro: ens.error }); await registrarFalha(db, f, ref, pessoa, ambiente, ens.error); continue }
      const customerId = ens.data.customerId

      // 2ª trava de idempotência: já existe cobrança com este externalReference no Asaas?
      const existente = await findPaymentByExternalRef(ref)
      if (!existente.ok) { out.falharam.push({ ...base, erro: existente.error }); await registrarFalha(db, f, ref, pessoa, ambiente, existente.error); continue }

      const boleto = existente.data
        ? { dado: existente.data, jaExistia: true }
        : await (async () => {
            const cr = await criarBoleto({ customer: customerId, value: f.valor!, dueDate: f.vencimento!, externalReference: ref })
            return cr.ok ? { dado: cr.data, jaExistia: false } : { erro: cr.error }
          })()

      if ('erro' in boleto) { out.falharam.push({ ...base, erro: boleto.erro }); await registrarFalha(db, f, ref, pessoa, ambiente, boleto.erro); continue }

      // Registro de sucesso (idempotente no banco — não sobrescreve sucesso anterior).
      const registroFalhou = !(await registrarSucesso(db, {
        ref, pessoa, valor: f.valor!, vencimento: f.vencimento!, ambiente, customerId, boleto: boleto.dado,
      }))

      const item: ItemEmissao = {
        ref, pessoa, resultado: boleto.jaExistia ? 'ja_existia' : 'emitido',
        paymentId: boleto.dado.id, bankSlipUrl: boleto.dado.bankSlipUrl, invoiceUrl: boleto.dado.invoiceUrl,
        status: boleto.dado.status, registroFalhou: registroFalhou || undefined,
      }
      if (boleto.jaExistia) out.jaExistiam.push(item)
      else out.emitidos.push(item)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro inesperado na emissão.'
      out.falharam.push({ ...base, erro: msg })
      // best-effort: registra a falha (se isto também falhar, não derruba o lote)
      try { await registrarFalha(db, f, ref, pessoa, ambiente, msg) } catch { /* noop */ }
    }
  }

  return out
}

async function registrarSucesso(
  db: any,
  p: { ref: string; pessoa: string; valor: number; vencimento: string; ambiente: AsaasAmbiente; customerId: string; boleto: { id: string; status: string; bankSlipUrl?: string | null; invoiceUrl?: string | null; nossoNumero?: string | null } },
): Promise<boolean> {
  const res = await (db.rpc as any)('registrar_emissao', {
    p_dados: {
      fatura_cliente_no: p.ref, pessoa_nome: p.pessoa, valor: String(p.valor), vencimento: p.vencimento,
      asaas_customer_id: p.customerId, asaas_payment_id: p.boleto.id, status: p.boleto.status,
      bank_slip_url: p.boleto.bankSlipUrl ?? null, invoice_url: p.boleto.invoiceUrl ?? null,
      nosso_numero: p.boleto.nossoNumero ?? null, ambiente: p.ambiente, erro: null,
    },
  })
  // Observabilidade: boleto JÁ existe no Asaas mas o registro local falhou — não pode passar
  // silencioso (o reprocesso reconcilia via externalReference, mas precisa ficar no log).
  if (res?.error) console.error(`[faturamento] registro de SUCESSO falhou ref=${p.ref} payment=${p.boleto.id}:`, res.error)
  return !res?.error
}

async function registrarFalha(
  db: any, f: FaturaEmitir, ref: string, pessoa: string, ambiente: AsaasAmbiente, erro: string,
): Promise<void> {
  if (!ref) return // sem chave de idempotência não há o que registrar (coluna é NOT NULL)
  const res = await (db.rpc as any)('registrar_emissao', {
    p_dados: {
      fatura_cliente_no: ref, pessoa_nome: pessoa,
      valor: f.valor == null ? null : String(f.valor), vencimento: f.vencimento ?? null,
      asaas_customer_id: null, asaas_payment_id: null, status: 'erro',
      bank_slip_url: null, invoice_url: null, nosso_numero: null, ambiente, erro,
    },
  })
  if (res?.error) console.error(`[faturamento] registro de FALHA falhou ref=${ref}:`, res.error)
}
