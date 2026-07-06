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
import { ensureCustomer, type DadosCliente } from '@/lib/asaas/customers'
import { findPaymentByExternalRef, criarBoleto } from '@/lib/asaas/boletos'
import {
  createInvoice, authorizeInvoice, findInvoiceByExternalRef, getInvoiceById,
  externalReferenceNota, type ModoNota,
} from '@/lib/asaas/notas'
import { emailAmbiente } from '@/lib/email/config'
import { enviarFaturaEmail, splitDestinatarios } from '@/lib/email/fatura'
import { jurosMultaDoCadastro, JUROS_MULTA_DEFAULT } from '@/lib/faturamento/juros-multa'

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

  // Juros/multa por cliente (Visão B parcial, v4.37.0) — read-only e FAIL-SAFE: se a RPC do cadastro
  // falhar, segue com defaults 2/2 (a emissão NUNCA cai por juros/multa). multa→fine, juros→interest.
  const jmPorNome = new Map<string, { fine: number; interest: number }>()
  try {
    const nomesCorp = Array.from(new Set(faturas.map(f => (f.pessoa ?? '').trim()).filter(Boolean)))
    const resCad = await (db.rpc as any)('buscar_cliente_corporativo', { p_nomes: nomesCorp })
    if (!resCad?.error && Array.isArray(resCad?.data)) {
      for (const c of resCad.data as Array<{ empresa?: string; pct_juros?: string | null; pct_multa?: string | null }>) {
        const k = normNome(c.empresa ?? '')
        if (k) jmPorNome.set(k, jurosMultaDoCadastro(c))
      }
    }
  } catch { /* fail-safe: mapa vazio → defaults 2/2 */ }

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

      // Juros/multa do cadastro (default 2/2). Só emissão NOVA aplica — boleto já existente não retroage.
      const jm = jmPorNome.get(normNome(pessoa)) ?? JUROS_MULTA_DEFAULT
      const boleto = existente.data
        ? { dado: existente.data, jaExistia: true }
        : await (async () => {
            const cr = await criarBoleto({ customer: customerId, value: f.valor!, dueDate: f.vencimento!, externalReference: ref, fine: jm.fine, interest: jm.interest })
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

// ───────────────────────────────────────────────────────────────────────────
// Fase 2 (v4.32.0) — EMISSÃO de NOTAS FISCAIS (NFS-e). Documento fiscal, IRREVERSÍVEL.
//
// Mesmos invariantes da Fase 1 (sandbox-first, idempotência, falha parcial, rastreabilidade,
// só-prontas emitem), com as especificidades da NF:
//   • Idempotência com -AVULSA: externalReference = Fatura Cliente Nº (normal) ou ref-AVULSA.
//     (1) nota_existentes (nosso registro) pula; (2) findInvoiceByExternalRef no Asaas.
//   • Prontidão-NF: exige CPF/CNPJ + endereço + CEP (mais que o boleto) — re-validado aqui.
//   • ensureCustomer com completarEndereco=true (a NF exige endereço no customer).
//   • Vínculo SOFT ao boleto (só normal): acha o payment por ref → payment (XOR customer).
//   • ASSÍNCRONO: createInvoice + authorizeInvoice não deixam a nota pronta; o status evolui.
//     atualizarStatusNotas (refresh) resolve depois (getInvoiceById → atualizar_status_nota).
// ───────────────────────────────────────────────────────────────────────────

/** Uma fatura marcada para emitir NF (payload do cliente; o cadastro é re-buscado). */
export interface NotaEmitir {
  pessoa:            string
  fatura_cliente_no: string | null
  modo:              'normal' | 'avulsa'
  valorBoleto:       number | null  // valor da fatura (usado se normal)
  valorAvulso:       number | null  // usado se avulsa
  // NOTA: a data de emissão da NF (effectiveDate) é SEMPRE hoje (o dia da emissão), NÃO a
  // coluna "Emissão" da planilha — o Asaas recusa effectiveDate anterior à data atual.
}

export interface ItemNota {
  ref:             string  // externalReference (com -AVULSA se avulsa)
  faturaClienteNo: string
  pessoa:          string
  modo:            ModoNota
  resultado:       'emitida' | 'ja_existia' | 'falhou' | 'pulada'
  invoiceId?:      string | null
  status?:         string | null
  pdfUrl?:         string | null
  erro?:           string
  registroFalhou?: boolean
  /** NF criada no Asaas mas a autorização falhou — a nota existe, porém não autorizada. */
  avisoAutorizacao?: string
}

export interface ResultadoNotas {
  ambiente:   AsaasAmbiente
  emitidas:   ItemNota[]
  jaExistiam: ItemNota[]
  falharam:   ItemNota[]
  puladas:    ItemNota[]
  total:      number
}

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export async function emitirNotas(
  notas: NotaEmitir[],
  opts?: { confirmacaoProducao?: boolean },
): Promise<ResultadoNotas> {
  await requireAreaAction('financeiro/faturamento-corp') // authz: lança = negação
  const ambiente = asaasAmbiente()

  const vazio: ResultadoNotas = { ambiente, emitidas: [], jaExistiam: [], falharam: [], puladas: [], total: 0 }
  if (!notas?.length) return vazio

  const refDe = (n: NotaEmitir) => n.fatura_cliente_no ? externalReferenceNota(n.fatura_cliente_no.trim(), n.modo) : ''
  const recusarTudo = (erro: string): ResultadoNotas => ({
    ...vazio,
    total: notas.length,
    falharam: notas.map(n => ({
      ref: refDe(n) || '(sem nº)', faturaClienteNo: (n.fatura_cliente_no ?? '').trim(),
      pessoa: (n.pessoa ?? '').trim(), modo: n.modo, resultado: 'falhou' as const, erro,
    })),
  })

  if (ambiente === 'producao' && !opts?.confirmacaoProducao) {
    return recusarTudo('Emissão em PRODUÇÃO exige confirmação reforçada — não confirmada.')
  }
  if (!asaasConfigurado()) {
    return recusarTudo('Asaas não configurado neste ambiente (ASAAS_API_KEY ausente).')
  }

  const db = await getServerClient()

  const porNome = new Map<string, PessoaCadastro>()
  let jaEmitidas = new Set<string>()
  try {
    const nomes = Array.from(new Set(notas.map(n => (n.pessoa ?? '').trim()).filter(Boolean)))
    const resPessoas = await (db.rpc as any)('buscar_pessoas', { p_nomes: nomes })
    // Fail-closed: erro na RPC não pode degradar silenciosamente (cadastros vazios faria
    // TODAS falharem como "não encontrado"; existentes vazio furaria a 1ª trava).
    if (resPessoas?.error) throw new Error('não foi possível consultar a base de pessoas')
    const cadastros = (parseRpc(buscarPessoasSchema, resPessoas, 'buscar_pessoas') ?? []) as PessoaCadastro[]
    for (const c of cadastros) {
      const k = (c.nome ?? '').trim()
      if (k && !porNome.has(k)) porNome.set(k, c)
    }
    const refs = notas.map(refDe).filter(Boolean)
    const resExist = await (db.rpc as any)('nota_existentes', { p_refs: refs })
    if (resExist?.error) throw new Error('não foi possível consultar o registro de notas')
    jaEmitidas = new Set<string>(Array.isArray(resExist?.data) ? resExist.data : [])
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'falha ao consultar cadastros/idempotência'
    return recusarTudo(`Nada emitido — ${msg}. Verifique e tente de novo.`)
  }

  // Fallback de e-mail fiscal (Visão B parcial, v4.37.0) — read-only e FAIL-SAFE: se a RPC do
  // cadastro falhar, segue SEM o degrau 3 (o e-mail vem do Asaas/pessoas, como antes).
  // emailFallback = 1º destinatário VÁLIDO do Cadastro de Clientes (splitDestinatarios).
  const emailFallbackPorNome = new Map<string, string>()
  try {
    const nomesCorp = Array.from(new Set(notas.map(n => (n.pessoa ?? '').trim()).filter(Boolean)))
    const resCad = await (db.rpc as any)('buscar_cliente_corporativo', { p_nomes: nomesCorp })
    if (!resCad?.error && Array.isArray(resCad?.data)) {
      for (const c of resCad.data as Array<{ empresa?: string; destinatarios?: string | null }>) {
        const k = normNome(c.empresa ?? '')
        const primeiro = splitDestinatarios(c.destinatarios).validos[0]
        if (k && primeiro) emailFallbackPorNome.set(k, primeiro)
      }
    }
  } catch { /* fail-safe: sem fallback nesta rodada */ }

  const out: ResultadoNotas = { ambiente, emitidas: [], jaExistiam: [], falharam: [], puladas: [], total: notas.length }

  for (const n of notas) {
    const faturaClienteNo = (n.fatura_cliente_no ?? '').trim()
    const ref = refDe(n)
    const pessoa = (n.pessoa ?? '').trim()
    const modo = n.modo
    const base: ItemNota = { ref: ref || '(sem nº)', faturaClienteNo, pessoa, modo, resultado: 'falhou' }
    const valor = modo === 'avulsa' ? n.valorAvulso : n.valorBoleto

    try {
      if (!faturaClienteNo) { out.falharam.push({ ...base, erro: 'Fatura sem "Fatura Cliente Nº".' }); continue }
      if (jaEmitidas.has(ref)) { out.puladas.push({ ...base, resultado: 'pulada', erro: 'NF já emitida (registro existente).' }); continue }
      if (valor == null || !(valor > 0)) { out.falharam.push({ ...base, erro: modo === 'avulsa' ? 'Valor avulso ausente ou não positivo.' : 'Valor da fatura ausente ou não positivo.' }); await registrarFalhaNota(db, base, valor, ambiente, 'Valor ausente ou não positivo.'); continue }

      const cadastro = porNome.get(pessoa)
      const cpfCnpj = onlyDigits(cadastro?.cnpj) ?? onlyDigits(cadastro?.cpf)
      // Prontidão-NF: CPF/CNPJ + endereço + CEP (mais que o boleto) — re-validado server-side.
      if (!cadastro) { out.falharam.push({ ...base, erro: 'Cliente não encontrado na base de pessoas.' }); await registrarFalhaNota(db, base, valor, ambiente, 'Cliente não encontrado na base.'); continue }
      if (!cpfCnpj)  { out.falharam.push({ ...base, erro: 'Cliente sem CPF/CNPJ na base.' }); await registrarFalhaNota(db, base, valor, ambiente, 'Cliente sem CPF/CNPJ.'); continue }
      if (!cadastro.endereco || !cadastro.cep) { out.falharam.push({ ...base, erro: 'Cliente sem endereço/CEP na base (a NF exige).' }); await registrarFalhaNota(db, base, valor, ambiente, 'Cliente sem endereço/CEP (NF exige).'); continue }
      // E-mail: NÃO barra aqui (permissivo). ensureCustomer completa o e-mail da base quando o Asaas
      // não tem; se ficar sem e-mail em lugar nenhum, o Asaas recusa a NF e reportamos como falha parcial.

      const dados: DadosCliente = {
        nome: pessoa || cadastro.nome, cpfCnpj, email: cadastro.email,
        endereco: cadastro.endereco, numero: cadastro.numero, complemento: cadastro.complemento,
        bairro: cadastro.bairro, cep: cadastro.cep, cidade: cadastro.cidade, uf: cadastro.uf,
      }
      const emailFallback = emailFallbackPorNome.get(normNome(pessoa))
      const ens = await ensureCustomer(dados, { completarEndereco: true, emailFallback })
      if (!ens.ok) { out.falharam.push({ ...base, erro: ens.error }); await registrarFalhaNota(db, base, valor, ambiente, ens.error); continue }
      const customerId = ens.data.customerId

      // Vínculo SOFT ao boleto (só NF normal): acha o payment por Fatura Cliente Nº.
      let paymentId: string | null = null
      if (modo === 'normal') {
        const pay = await findPaymentByExternalRef(faturaClienteNo)
        if (pay.ok && pay.data) paymentId = pay.data.id
      }

      // 2ª trava de idempotência: NF já existe no Asaas com este externalReference?
      const existente = await findInvoiceByExternalRef(ref)
      if (!existente.ok) { out.falharam.push({ ...base, erro: existente.error }); await registrarFalhaNota(db, base, valor, ambiente, existente.error); continue }

      let invoiceId: string, status: string | null, pdfUrl: string | null, jaExistia: boolean
      let avisoAuth: string | undefined // NF criada mas a autorização falhou — não pode ficar mascarado
      if (existente.data) {
        invoiceId = existente.data.id; status = existente.data.status; pdfUrl = existente.data.pdfUrl ?? null; jaExistia = true
      } else {
        const eff = hojeSP() // sempre HOJE (dia da emissão) — o Asaas recusa data anterior à atual
        const cr = await createInvoice({
          customer: paymentId ? null : customerId, payment: paymentId,
          value: valor, externalReference: ref, effectiveDate: eff,
        })
        if (!cr.ok) { out.falharam.push({ ...base, erro: cr.error }); await registrarFalhaNota(db, base, valor, ambiente, cr.error); continue }
        invoiceId = cr.data.id; status = cr.data.status; pdfUrl = cr.data.pdfUrl ?? null
        // autoriza (entra em PROCESSING; assíncrono — o refresh resolve depois). Se o authorize
        // FALHA, a nota EXISTE (invoice_id) mas ficou sem autorizar — registra + reporta o aviso
        // (não mascarar como "processando" normal; o script legado também registra esse erro).
        const auth = await authorizeInvoice(invoiceId)
        if (auth.ok) { status = auth.data.status ?? status; pdfUrl = auth.data.pdfUrl ?? pdfUrl }
        else avisoAuth = auth.error
        jaExistia = false
      }

      const registroFalhou = !(await registrarNotaSucesso(db, {
        ref, faturaClienteNo, modo, valor, ambiente, invoiceId, paymentId, status, pdfUrl,
        number: existente.data?.number ?? null, xmlUrl: existente.data?.xmlUrl ?? null,
        rps: existente.data?.rpsNumber ?? null, verif: existente.data?.verificationCode ?? null,
        erro: avisoAuth ?? null,
      }))

      const item: ItemNota = {
        ref, faturaClienteNo, pessoa, modo,
        resultado: jaExistia ? 'ja_existia' : 'emitida',
        invoiceId, status, pdfUrl, registroFalhou: registroFalhou || undefined,
        avisoAutorizacao: avisoAuth,
      }
      if (jaExistia) out.jaExistiam.push(item)
      else out.emitidas.push(item)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro inesperado na emissão da NF.'
      out.falharam.push({ ...base, erro: msg })
      try { await registrarFalhaNota(db, base, valor, ambiente, msg) } catch { /* noop */ }
    }
  }

  return out
}

/** Refresh de status das notas (assincronia): getInvoiceById → atualizar_status_nota. */
export async function atualizarStatusNotas(
  items: { externalReference: string; invoiceId: string }[],
): Promise<{ externalReference: string; status: string | null; pdfUrl: string | null; number: string | null }[]> {
  await requireAreaAction('financeiro/faturamento-corp')
  if (!items?.length) return []
  const db = await getServerClient()
  const out: { externalReference: string; status: string | null; pdfUrl: string | null; number: string | null }[] = []

  for (const it of items) {
    if (!it.invoiceId || !it.externalReference) continue
    try {
      const inv = await getInvoiceById(it.invoiceId)
      if (!inv.ok) { out.push({ externalReference: it.externalReference, status: null, pdfUrl: null, number: null }); continue }
      // Ownership: só grava se o externalReference do invoice bate com o esperado (não deixa
      // um par (ref, invoiceId) trocado corromper o status de outra nota).
      if (inv.data.externalReference && inv.data.externalReference !== it.externalReference) {
        out.push({ externalReference: it.externalReference, status: null, pdfUrl: null, number: null }); continue
      }
      await (db.rpc as any)('atualizar_status_nota', {
        p_dados: {
          external_reference: it.externalReference,
          status: inv.data.status, pdf_url: inv.data.pdfUrl ?? null, xml_url: inv.data.xmlUrl ?? null,
          number: inv.data.number ?? null, rps_number: inv.data.rpsNumber ?? null,
          verification_code: inv.data.verificationCode ?? null, erro: null,
        },
      })
      out.push({ externalReference: it.externalReference, status: inv.data.status, pdfUrl: inv.data.pdfUrl ?? null, number: inv.data.number ?? null })
    } catch {
      out.push({ externalReference: it.externalReference, status: null, pdfUrl: null, number: null })
    }
  }
  return out
}

async function registrarNotaSucesso(
  db: any,
  p: { ref: string; faturaClienteNo: string; modo: ModoNota; valor: number; ambiente: AsaasAmbiente; invoiceId: string; paymentId: string | null; status: string | null; pdfUrl: string | null; number: string | null; xmlUrl: string | null; rps: string | null; verif: string | null; erro: string | null },
): Promise<boolean> {
  const res = await (db.rpc as any)('registrar_nota', {
    p_dados: {
      external_reference: p.ref, fatura_cliente_no: p.faturaClienteNo, modo: p.modo, valor: String(p.valor),
      asaas_invoice_id: p.invoiceId, asaas_payment_id: p.paymentId, status: p.status,
      pdf_url: p.pdfUrl, xml_url: p.xmlUrl, number: p.number, rps_number: p.rps, verification_code: p.verif,
      ambiente: p.ambiente, erro: p.erro,
    },
  })
  if (res?.error) console.error(`[faturamento] registro de NOTA (sucesso) falhou ref=${p.ref} invoice=${p.invoiceId}:`, res.error)
  return !res?.error
}

async function registrarFalhaNota(
  db: any, base: ItemNota, valor: number | null, ambiente: AsaasAmbiente, erro: string,
): Promise<void> {
  if (!base.faturaClienteNo) return // sem chave não há o que registrar (external_reference é NOT NULL)
  const res = await (db.rpc as any)('registrar_nota', {
    p_dados: {
      external_reference: base.ref, fatura_cliente_no: base.faturaClienteNo, modo: base.modo,
      valor: valor == null ? null : String(valor), asaas_invoice_id: null, asaas_payment_id: null,
      status: 'erro', pdf_url: null, xml_url: null, number: null, rps_number: null, verification_code: null,
      ambiente, erro,
    },
  })
  if (res?.error) console.error(`[faturamento] registro de NOTA (falha) falhou ref=${base.ref}:`, res.error)
}

// ───────────────────────────────────────────────────────────────────────────
// Fase 4a (v4.35.0) — ENVIO do e-mail de fatura (boleto + nota anexados) — MODO TESTE.
//
// Invariantes (todos server-side; o cliente só manda a `ref`):
//   • MODO REAL INALCANÇÁVEL: recusa se emailAmbiente() != 'teste' (a virada é a 4b).
//   • Tudo DERIVADO no servidor: documentos (buscar_docs_fatura), cliente/destinatários
//     (buscar_cliente_corporativo + split/validação), idempotência (email_existentes no modo).
//   • Regra da nota (decisão 1): nota presente e NÃO autorizada → fatura NÃO enviável.
//   • Override do destinatário e fail-closed vivem na CAMADA (enviarFaturaEmail), não aqui.
//   • Registro de TODA tentativa (sucesso ou erro) em app.fatura_email — reais E efetivos.
// ───────────────────────────────────────────────────────────────────────────

export interface ResultadoEmailFatura {
  ref:                    string
  resultado:              'enviado' | 'ja_enviado' | 'falhou'
  destinatariosEfetivos?: string[]
  anexos?:                { boleto: boolean; nota: boolean }
  erro?:                  string
  /** Envio OK mas o registro em app.fatura_email falhou (idempotência NÃO gravada → risco de
   *  reenvio duplicado na virada real). Espelha o registroFalhou de emitirBoletos/emitirNotas. */
  registroFalhou?:        boolean
}

/** Opções da 4b (todas opcionais → o botão por-linha da 4a segue chamando só com `ref`). */
export interface OpcoesEnvioFatura {
  /** Snapshot efêmero do modal "Revisar envio": destinatários editados p/ ESTE envio.
   *  RE-VALIDADOS no servidor (splitDestinatarios) — o cliente nunca é fonte de verdade.
   *  Presente → ignora o cadastro (permite envio avulso a cliente inativo/fora do cadastro). */
  destinatariosOverride?: string[]
  /** true → envia SÓ o boleto (não anexa a nota, mesmo pendente). Ação explícita do modal. */
  soBoleto?: boolean
  /** true → reenvio deliberado: pula a idempotência (email_existentes). */
  forcarReenvio?: boolean
  /** Dupla trava do modo REAL (M4): sem esta confirmação, real é RECUSADO. EMAIL_MODO segue 'teste'
   *  em todos os ambientes → o modo real permanece INALCANÇÁVEL nesta entrega (a virada é do Yan). */
  confirmacaoReal?: boolean
}

export async function enviarEmailFatura(ref: string, opts?: OpcoesEnvioFatura): Promise<ResultadoEmailFatura> {
  await requireAreaAction('financeiro/faturamento-corp') // authz: lança = negação (não é "falhou")
  const falhar = (erro: string): ResultadoEmailFatura => ({ ref, resultado: 'falhou', erro })

  // Modo: 'teste' (default fail-safe) ou 'real'. Dupla trava do real CONSTRUÍDA mas não acionável
  // (EMAIL_MODO fica 'teste' em todos os ambientes → o ramo real nunca roda; testes cobrem a recusa).
  const modo = emailAmbiente()
  if (modo === 'real' && !opts?.confirmacaoReal) {
    return falhar('Envio em modo REAL exige confirmação explícita (dupla trava).')
  }
  const refT = (ref ?? '').trim()
  if (!refT) return falhar('Fatura sem número.')

  const db = await getServerClient()
  try {
    // 1) Documentos da fatura (só faturas com boleto bem-sucedido voltam da RPC).
    const docsRes = await (db.rpc as any)('buscar_docs_fatura', { p_refs: [refT] })
    if (docsRes?.error) return falhar('Não foi possível ler os documentos da fatura.')
    const docs = (docsRes?.data ?? []) as Array<{
      fatura_cliente_no: string; pessoa_nome: string | null; bank_slip_url: string | null;
      invoice_url: string | null; nota_pdf_url: string | null; nota_status: string | null
    }>
    const d = docs.find(x => x.fatura_cliente_no === refT)
    if (!d)                return falhar('Boleto ainda não emitido para esta fatura.')
    if (!d.bank_slip_url)  return falhar('Boleto sem PDF disponível para anexar.')

    // Regra da nota: enviável só com nota AUTORIZADA + PDF pronto. Nota presente mas não-pronta →
    // fatura NÃO enviável — EXCETO quando o operador escolhe "enviar só o boleto" (opts.soBoleto),
    // que anexa só o boleto (o corpo condicional do template omite a nota). (Fase 4b.)
    const notaPronta = d.nota_status === 'AUTHORIZED' && !!d.nota_pdf_url
    let notaUrl: string | undefined
    if (opts?.soBoleto) {
      notaUrl = undefined
    } else {
      if (d.nota_status && !notaPronta) {
        return falhar('Nota fiscal pendente (não autorizada ou sem PDF) — fatura não enviável.')
      }
      notaUrl = notaPronta ? d.nota_pdf_url! : undefined
    }
    const cliente = (d.pessoa_nome ?? '').trim()
    if (!cliente) return falhar('Fatura sem nome de cliente para cruzar com o cadastro.')

    // 2) Destinatários: override efêmero do modal (RE-VALIDADO aqui) OU o cadastro (botão por-linha 4a).
    let validos: string[]
    if (opts?.destinatariosOverride && opts.destinatariosOverride.length > 0) {
      // Snapshot do modal — permite envio avulso (cliente inativo/fora do cadastro) desde que
      // haja ≥1 destinatário válido. O servidor RE-VALIDA (nunca confia só no cliente).
      validos = splitDestinatarios(opts.destinatariosOverride.join(';')).validos
      if (validos.length === 0) return falhar('Nenhum destinatário válido informado.')
    } else {
      // Caminho do cadastro (botão por-linha da 4a): exige cliente ATIVO com destinatário válido.
      const cadRes = await (db.rpc as any)('buscar_cliente_corporativo', { p_nomes: [cliente] })
      if (cadRes?.error) return falhar('Não foi possível consultar o cadastro de clientes.')
      const cads = (cadRes?.data ?? []) as Array<{ empresa: string; situacao: string | null; destinatarios: string | null }>
      if (!cads.length) return falhar('Cliente não está no Cadastro de Clientes.')
      if ((cads[0].situacao ?? '').trim().toLowerCase() !== 'ativo') return falhar('Cliente inativo no cadastro.')
      validos = splitDestinatarios(cads[0].destinatarios).validos
      if (validos.length === 0) return falhar('Nenhum destinatário válido no cadastro do cliente.')
    }

    // 3) Idempotência POR MODO: já enviado com sucesso NESTE modo → pula (salvo reenvio deliberado).
    if (!opts?.forcarReenvio) {
      const jaRes = await (db.rpc as any)('email_existentes', { p_refs: [refT], p_modo: modo })
      if (jaRes?.error) return falhar('Não foi possível verificar envios anteriores.')
      const ja = (jaRes?.data ?? []) as string[]
      if (Array.isArray(ja) && ja.includes(refT)) return { ref: refT, resultado: 'ja_enviado' }
    }

    // 4) Envia (override do destinatário + modo vivem na CAMADA enviarFaturaEmail) e registra a tentativa.
    const env = await enviarFaturaEmail({
      ref: refT, cliente, destinatariosReais: validos,
      boletoUrl: d.bank_slip_url, notaUrl,
    })
    const regRes = await (db.rpc as any)('registrar_email', {
      p_dados: {
        fatura_cliente_no: refT, modo,
        destinatarios_reais: validos,
        destinatarios_efetivos: env.destinatariosEfetivos ?? [],
        anexos: env.anexos ?? { boleto: false, nota: false },
        sucesso: env.ok, erro: env.erro ?? null,
      },
    })
    if (regRes?.error) console.error(`[faturamento] registro de E-MAIL falhou ref=${refT}:`, regRes.error)

    if (!env.ok) return falhar(env.erro ?? 'Falha no envio do e-mail.')
    // Envio OK; se o registro falhou, SINALIZA (não engole): a idempotência não foi gravada.
    return { ref: refT, resultado: 'enviado', destinatariosEfetivos: env.destinatariosEfetivos, anexos: env.anexos, registroFalhou: !!regRes?.error }
  } catch {
    return falhar('Falha inesperada ao enviar o e-mail.')
  }
}

// ── Fase 4b (M1) — preparo do modal "Revisar envio": estado por fatura (tudo server-side) ─────
/** Uma linha do modal de envio em lote. Os fatos (nota/cadastro/idempotência) vêm daqui; o
 *  cliente recompõe o estado AO VIVO conforme edita destinatários / escolhe "só boleto". */
export interface LinhaEnvioEmail {
  ref:           string
  pessoa:        string
  /** invoice_url (preferido) ou bank_slip_url — p/ o link "ver boleto" no modal. */
  boletoUrl:     string | null
  notaPronta:    boolean   // nota AUTORIZADA + PDF → anexa
  notaPendente:  boolean   // nota presente mas não-pronta → bloqueia (salvo "só boleto")
  anexosLabel:   string    // "boleto e nota" | "boleto (nota pendente)" | "boleto"
  destinatarios: string    // seed editável (string do cadastro; '' se fora do cadastro)
  noCadastro:    boolean
  ativo:         boolean   // cadastro com situação 'ativo'
  jaEnviado:     boolean   // já enviado com sucesso NESTE modo (idempotência)
  estado:        'pronto' | 'atencao' | 'enviado'  // estado INICIAL (o cliente recomputa ao editar)
  motivo?:       string    // rótulo do porquê (quando 'atencao')
}

const normNome = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Monta a lista do modal a partir das refs das faturas da sessão que têm boleto emitido. Deriva
 * TUDO no servidor: documentos (buscar_docs_fatura), cadastro (buscar_cliente_corporativo),
 * idempotência (email_existentes no modo atual). Ordena Atenção → Prontos → Enviados. Read-only.
 */
export async function prepararEnvioEmails(refs: string[]): Promise<{ modo: 'teste' | 'real'; linhas: LinhaEnvioEmail[] }> {
  await requireAreaAction('financeiro/faturamento-corp')
  const modo = emailAmbiente()  // apurado no SERVIDOR a cada abertura — a UI usa ESTE valor p/ a dupla trava (não a prop de SSR, que pode estar obsoleta na virada).
  const uniq = Array.from(new Set((refs ?? []).map(r => (r ?? '').trim()).filter(Boolean)))
  if (uniq.length === 0) return { modo, linhas: [] }

  const db = await getServerClient()
  const docsRes = await (db.rpc as any)('buscar_docs_fatura', { p_refs: uniq })
  if (docsRes?.error) throw new Error('Falha ao ler documentos das faturas.')
  const docs = (docsRes?.data ?? []) as Array<{
    fatura_cliente_no: string; pessoa_nome: string | null; bank_slip_url: string | null;
    invoice_url: string | null; nota_pdf_url: string | null; nota_status: string | null
  }>
  if (docs.length === 0) return { modo, linhas: [] }

  const nomes = Array.from(new Set(docs.map(d => (d.pessoa_nome ?? '').trim()).filter(Boolean)))
  const cadByNome = new Map<string, { situacao: string | null; destinatarios: string | null }>()
  if (nomes.length) {
    const cadRes = await (db.rpc as any)('buscar_cliente_corporativo', { p_nomes: nomes })
    const cads = (cadRes?.data ?? []) as Array<{ empresa: string; situacao: string | null; destinatarios: string | null }>
    for (const c of cads) cadByNome.set(normNome(c.empresa ?? ''), { situacao: c.situacao, destinatarios: c.destinatarios })
  }

  const jaRes = await (db.rpc as any)('email_existentes', { p_refs: uniq, p_modo: modo })
  const jaSet = new Set(((jaRes?.data ?? []) as string[]))

  const linhas: LinhaEnvioEmail[] = docs.map(d => {
    const ref = d.fatura_cliente_no
    const pessoa = (d.pessoa_nome ?? '').trim()
    const notaPronta = d.nota_status === 'AUTHORIZED' && !!d.nota_pdf_url
    const notaPendente = !!d.nota_status && !notaPronta
    const cad = cadByNome.get(normNome(pessoa))
    const noCadastro = !cad
    const ativo = ((cad?.situacao ?? '').trim().toLowerCase() === 'ativo')
    const destinatarios = cad?.destinatarios ?? ''
    const { validos, invalidos } = splitDestinatarios(destinatarios)
    const jaEnviado = jaSet.has(ref)

    let estado: LinhaEnvioEmail['estado']
    let motivo: string | undefined
    if (jaEnviado) {
      estado = 'enviado'
    } else if (validos.length > 0 && !notaPendente && ativo && !noCadastro) {
      estado = 'pronto'
    } else {
      estado = 'atencao'
      motivo = noCadastro ? 'Cliente fora do Cadastro'
        : !ativo ? 'Cliente inativo no Cadastro'
        : notaPendente ? 'Nota fiscal pendente'
        : invalidos.length > 0 ? 'Destinatário inválido'
        : 'Sem destinatário'
    }

    const anexosLabel = notaPronta ? 'boleto e nota' : notaPendente ? 'boleto (nota pendente)' : 'boleto'
    return {
      ref, pessoa, boletoUrl: d.invoice_url ?? d.bank_slip_url,
      notaPronta, notaPendente, anexosLabel, destinatarios,
      noCadastro, ativo, jaEnviado, estado, motivo,
    }
  })

  const ordem: Record<LinhaEnvioEmail['estado'], number> = { atencao: 0, pronto: 1, enviado: 2 }
  linhas.sort((a, b) => ordem[a.estado] - ordem[b.estado] || a.pessoa.localeCompare(b.pessoa, 'pt-BR'))
  return { modo, linhas }
}
