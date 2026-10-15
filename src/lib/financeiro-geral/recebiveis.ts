// Recebíveis e inadimplência (v6.4.0) — módulo PURO: rótulos, ordem e proporções do que a RPC
// `get_geral_recebiveis` devolve. Sem I/O nem React.
//
// Decisões do Yan que este módulo encarna (GATE 1, plano "Decisões do Yan"):
//  • Inadimplência = SÓ a marcação `Conferido = Inadimplente`. O "vencido em aberto" pela data NÃO
//    é número da página.
//  • As faixas de atraso são sobre os títulos MARCADOS.
//  • A marcação dos demais títulos em aberto (Pendente/Enviado/Sim/vazio) entra só como CONTEXTO.
//  • O nome do devedor aparece só no top 10 da seção; a faixa do topo diz "10 maiores = X%".

import { fmtAxisMes, fmtDate } from '@/lib/fmt'
import { fmtPct } from '@/lib/marketing/formatar'
import { pctDe } from './numeros'
import {
  FAIXAS_ATRASO, MARCACOES, type FaixaAtraso, type Marcacao, type Recebiveis,
} from './schemas'

export const ROTULO_FAIXA: Record<FaixaAtraso, string> = {
  'nao_vencido': 'Ainda não vencido',
  '1-30': '1 a 30 dias',
  '31-60': '31 a 60 dias',
  '61-90': '61 a 90 dias',
  '90+': 'Mais de 90 dias',
}

/** Rótulo da marcação do Financeiro; `null` (célula vazia no export) = sem marcação. */
export const ROTULO_MARCACAO: Record<Marcacao, string> = {
  'Inadimplente': 'Inadimplente',
  'Enviado para o banco': 'Enviado para o banco',
  'Pendente': 'Pendente',
  'Sim': 'Conferido (Sim)',
}
export const ROTULO_SEM_MARCACAO = 'Sem marcação'


export interface LinhaFaixa {
  faixa: FaixaAtraso
  rotulo: string
  n: number
  valor: number
  /** % do valor marcado como inadimplente; `null` quando não há inadimplente. */
  pct: number | null
}

/** As 5 faixas SEMPRE, na ordem do atraso, com zero onde a RPC não trouxe a faixa (ela só emite as
 *  que têm título). Faixa ausente é "nenhum título", e aqui isso É zero de verdade — o universo (os
 *  marcados) é fechado, ao contrário do histórico das fotos, que nunca ganha zero fabricado. */
export function faixasCompletas(r: Pick<Recebiveis['inadimplente'], 'faixas' | 'valor'>): LinhaFaixa[] {
  return FAIXAS_ATRASO.map(faixa => {
    const f = r.faixas.find(x => x.faixa === faixa)
    const valor = f?.valor ?? 0
    return { faixa, rotulo: ROTULO_FAIXA[faixa], n: f?.n ?? 0, valor, pct: pctDe(valor, r.valor) }
  })
}

export interface LinhaMarcacao {
  conferido: Marcacao | null
  rotulo: string
  n: number
  valor: number
  pct: number | null
}

/** Os títulos em aberto por marcação, na ordem fixa (inadimplente primeiro, sem marcação por último),
 *  só as que existem. `total` é o em-aberto inteiro (a soma das linhas) — o denominador do %. */
export function marcacoesOrdenadas(
  lista: Recebiveis['marcacao_em_aberto'],
): { linhas: LinhaMarcacao[]; total: { n: number; valor: number } } {
  const ordem: (Marcacao | null)[] = [...MARCACOES, null]
  const total = lista.reduce((s, m) => ({ n: s.n + m.n, valor: s.valor + m.valor }), { n: 0, valor: 0 })
  const linhas = ordem.flatMap((c): LinhaMarcacao[] => {
    const itens = lista.filter(m => m.conferido === c)
    if (itens.length === 0) return []
    const n = itens.reduce((s, m) => s + m.n, 0)
    const valor = itens.reduce((s, m) => s + m.valor, 0)
    return [{
      conferido: c,
      rotulo: c === null ? ROTULO_SEM_MARCACAO : ROTULO_MARCACAO[c],
      n, valor, pct: pctDe(valor, total.valor),
    }]
  })
  return { linhas, total }
}

/** "na carga de 15/10" — a posição é um ESTOQUE numa data, e a data é a da carga. */
export function rotuloPosicao(dataPosicao: string): string {
  const [, m, d] = dataPosicao.split('-')
  return `na carga de ${d}/${m}`
}

/** "histórico desde 25/09/2026" — a evolução começa na v6.4, nunca fabrica zero antes dela. */
export function rotuloHistoricoDesde(iso: string | null): string | null {
  return iso ? `histórico desde ${fmtDate(iso)}` : null
}

/** "10 maiores = 62,3%" (faixa do topo, SEM nome); `null` quando não há inadimplente. */
export function rotuloConcentracao(pctTop: number | null, n: number): string | null {
  if (pctTop === null || n <= 0) return null
  return `10 maiores = ${fmtPct(pctTop)}`
}

export interface LinhaTop {
  posicao: number
  /** `null` na origem (célula vazia no export) → "(sem nome)" na tela. */
  pessoa: string | null
  n: number
  valor: number
  pct: number | null
}

/** O top 10 do inadimplente, com a posição e o % sobre o TOTAL marcado (não sobre o top). */
export function topComPct(c: Recebiveis['concentracao'], totalInadimplente: number): LinhaTop[] {
  return c.top.map((t, i) => ({
    posicao: i + 1, pessoa: t.pessoa, n: t.n, valor: t.valor, pct: pctDe(t.valor, totalInadimplente),
  }))
}

export interface PontoEvolucao {
  /** "out/26" */
  rotulo: string
  /** "AAAA-MM" */
  mes: string
  /** 'AAAA-MM-DD' da carga que ficou como foto do mês. */
  dataPosicao: string
  valor: number
  n: number
}

/** A evolução pelas fotos, do mais antigo ao mais recente — só os meses que TÊM foto (um mês sem
 *  carga não vira zero: seria afirmar que não havia inadimplência). */
export function evolucaoParaGrafico(evolucao: Recebiveis['evolucao']): PontoEvolucao[] {
  return [...evolucao]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(e => ({
      rotulo: fmtAxisMes(e.mes), mes: e.mes, dataPosicao: e.data_posicao,
      valor: e.inadimplente_valor, n: e.inadimplente_n,
    }))
}

/** A base ainda não teve carga? (`carga: null`) — estado normal da v6.4.0 até o 1º upload. */
export function semBase(r: Pick<Recebiveis, 'carga'>): boolean {
  return r.carga === null
}
