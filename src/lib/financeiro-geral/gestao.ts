// Registro de antecipações (v6.4.0) — regras PURAS do painel: quem gerencia, como o valor digitado
// vira número, o desconto derivado, a validação-dica e a tradução dos erros das RPCs. Sem I/O.
//
// A barreira de verdade é o BANCO (CHECK de valores positivos, líquido ≤ antecipado, conta da lista
// curada, data não futura — e `exigir_acesso` em cada RPC). Aqui a validação existe só para dar a
// frase certa ANTES de ir ao servidor e para o formulário não prometer o que o banco recusaria.

import { toCentavos, toNum } from '@/lib/carga/coercao'
import { fmtBRL2 } from '@/lib/fmt'
import type { EntradaHistorico } from './schemas'

/** Área que dá o botão "Registrar antecipação" e libera as RPCs de escrita. */
export const AREA_GESTAO = 'financeiro/geral/gestao' as const

/** Só quem tem a área de gestão vê o botão (quem só lê a página NÃO vê). */
export function podeGerirAntecipacoes(permissoes: readonly string[]): boolean {
  return permissoes.includes(AREA_GESTAO)
}

// ── Valor digitado ─────────────────────────────────────────────────────────────────────────────

export type LeituraValor =
  | { ok: true; centavos: number }
  | { ok: false; motivo: 'vazio' | 'ilegivel' | 'nao-positivo' | 'casas' }

/**
 * O valor digitado (pt-BR: "1.234,56", "R$ 1.234,56", "1234,56", "1234.56") → centavos INTEIROS.
 * Lê pelo `toNum` canônico (`@/lib/carga/coercao`), o mesmo padrão da v6.2.1 — a normalização é no
 * ENVIO, nunca no `onChange` (normalizar enquanto se digita impediria escrever "1.234,56").
 * Recusa o que o banco recusaria: ≤ 0 e mais de 2 casas decimais (arredondar calado mudaria o valor
 * que o usuário digitou).
 */
export function lerValorDigitado(texto: string): LeituraValor {
  const bruto = texto.trim()
  if (bruto === '') return { ok: false, motivo: 'vazio' }
  // Aqui a vírgula é o separador DECIMAL (campo em pt-BR). O `toNum` lê "100,555" como milhar US
  // (100555) — uma 3ª casa digitada sem querer viraria um valor 1000× maior. Vírgula seguida de 3+
  // dígitos até o fim, sem ponto depois, é recusada em vez de reinterpretada.
  if (/,\d{3,}$/.test(bruto)) return { ok: false, motivo: 'casas' }
  const n = toNum(bruto)
  if (n === null || !Number.isFinite(n)) return { ok: false, motivo: 'ilegivel' }
  const centavos = toCentavos(n)
  if (centavos === null || Math.abs(centavos) > Number.MAX_SAFE_INTEGER) return { ok: false, motivo: 'ilegivel' }
  // `n*100` tem de cair num inteiro (com folga de ponto flutuante): senão há 3ª casa ou mais.
  if (Math.abs(n * 100 - centavos) > 1e-6) return { ok: false, motivo: 'casas' }
  if (centavos <= 0) return { ok: false, motivo: 'nao-positivo' }
  return { ok: true, centavos }
}

/** Centavos inteiros → reais para o parâmetro `numeric` da RPC (ex.: 123456 → 1234.56). */
export function centavosParaReais(centavos: number): number {
  return centavos / 100
}

/** Desconto DERIVADO (antecipado − líquido), em centavos — nunca digitado. `null` se algum valor não
 *  é legível ou se o líquido passa do antecipado (o banco recusaria). */
export function descontoEmCentavos(antecipado: string, liquido: string): number | null {
  const a = lerValorDigitado(antecipado)
  const l = lerValorDigitado(liquido)
  if (!a.ok || !l.ok || l.centavos > a.centavos) return null
  return a.centavos - l.centavos
}

/** "R$ 1.234,56" do desconto derivado; `null` quando ainda não dá para calcular. */
export function descontoFormatado(antecipado: string, liquido: string): string | null {
  const c = descontoEmCentavos(antecipado, liquido)
  return c === null ? null : fmtBRL2(centavosParaReais(c))
}

// ── Formulário ─────────────────────────────────────────────────────────────────────────────────

export interface FormAntecipacao {
  contaId: string
  data: string
  valorAntecipado: string
  valorLiquido: string
}

export interface EntradaAntecipacao {
  contaId: number
  data: string
  valorAntecipado: number
  valorLiquido: number
}

/** Piso aceito pela RPC (ANTECIPACAO_DATA_INVALIDA). */
export const DATA_PISO = '2000-01-01'

/** 'YYYY-MM-DD' que existe no calendário (31/02 não passa). */
export function dataIsoValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const FRASE_VALOR: Record<Exclude<LeituraValor, { ok: true }>['motivo'], string> = {
  'vazio': 'informe o valor',
  'ilegivel': 'não consegui ler o valor — use o formato 1.234,56',
  'nao-positivo': 'o valor precisa ser maior que zero',
  'casas': 'use no máximo duas casas decimais',
}

/**
 * Valida o formulário e devolve a entrada pronta para a action (valores já em reais numéricos) ou a
 * PRIMEIRA frase de erro. `hoje` ('YYYY-MM-DD', SP, vindo do servidor) é o teto da data: o banco recusa
 * data futura.
 */
export function validarFormulario(
  f: FormAntecipacao,
  hoje: string,
): { ok: true; entrada: EntradaAntecipacao } | { ok: false; erro: string } {
  const contaId = Number(f.contaId)
  if (f.contaId.trim() === '' || !Number.isInteger(contaId) || contaId <= 0) {
    return { ok: false, erro: 'Escolha a conta.' }
  }
  if (!dataIsoValida(f.data)) return { ok: false, erro: 'Informe uma data válida.' }
  if (f.data < DATA_PISO) return { ok: false, erro: 'Data anterior a 2000 não é aceita.' }
  if (f.data > hoje) return { ok: false, erro: 'A data não pode ser futura.' }

  const a = lerValorDigitado(f.valorAntecipado)
  if (!a.ok) return { ok: false, erro: `Valor antecipado: ${FRASE_VALOR[a.motivo]}.` }
  const l = lerValorDigitado(f.valorLiquido)
  if (!l.ok) return { ok: false, erro: `Valor líquido: ${FRASE_VALOR[l.motivo]}.` }
  if (l.centavos > a.centavos) return { ok: false, erro: 'O valor líquido não pode passar do valor antecipado.' }

  return {
    ok: true,
    entrada: {
      contaId,
      data: f.data,
      valorAntecipado: centavosParaReais(a.centavos),
      valorLiquido: centavosParaReais(l.centavos),
    },
  }
}

// ── Erros das RPCs ─────────────────────────────────────────────────────────────────────────────

/**
 * "CODIGO: texto legível" → o texto. As RPCs de antecipação levantam os erros neste formato
 * (ANTECIPACAO_CONTA_INVALIDA, _DATA_INVALIDA, _VALOR_INVALIDO, _INEXISTENTE, _HISTORICO_INEXISTENTE);
 * o conflito do desfazer vem SEM prefixo ("Conflito ao desfazer: … Recarregue e tente de novo.");
 * `exigir_acesso` devolve PERMISSAO_NEGADA / USUARIO_INATIVO / AUTH_NECESSARIA.
 * `conhecido: false` = mensagem que ninguém previu — a action a LOGA, e a tela mostra a frase genérica
 * (mensagem crua de Postgres não ajuda ninguém).
 */
export function traduzirErroAntecipacao(msg: string): { texto: string; conhecido: boolean } {
  const m = /^(ANTECIPACAO_[A-Z_]+):\s*([\s\S]+)$/.exec(msg.trim())
  if (m) return { texto: m[2].trim(), conhecido: true }
  if (msg.includes('Conflito ao desfazer')) return { texto: msg.trim(), conhecido: true }
  if (msg.includes('PERMISSAO_NEGADA')) return { texto: 'Sem permissão para registrar antecipações.', conhecido: true }
  if (msg.includes('USUARIO_INATIVO')) return { texto: 'Seu acesso foi desativado. Recarregue a página.', conhecido: true }
  if (msg.includes('AUTH_NECESSARIA')) return { texto: 'Sua sessão expirou. Entre de novo.', conhecido: true }
  return { texto: 'Não foi possível concluir. Tente novamente.', conhecido: false }
}

// ── Histórico ──────────────────────────────────────────────────────────────────────────────────

/** I/U/D do diário → verbo. A entrada que É um desfazer (`e_desfazer`) tem rótulo próprio. */
export function rotuloOperacao(e: Pick<EntradaHistorico, 'operacao' | 'e_desfazer'>): string {
  const base = e.operacao === 'I' ? 'Registrou' : e.operacao === 'U' ? 'Alterou' : e.operacao === 'D' ? 'Excluiu' : 'Mexeu em'
  return e.e_desfazer ? `Desfez (${base.toLowerCase()})` : base
}

/** Dá para desfazer esta entrada na tela? Não se desfaz um desfazer (quem errou, registra de novo). */
export function podeDesfazerEntrada(e: Pick<EntradaHistorico, 'e_desfazer'>): boolean {
  return !e.e_desfazer
}

/** O registro que a entrada descreve: o estado de DEPOIS (insert/update) ou de ANTES (delete). */
export function registroDaEntrada(e: Pick<EntradaHistorico, 'antes' | 'depois'>): EntradaHistorico['depois'] {
  return e.depois ?? e.antes
}
