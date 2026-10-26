// Recebíveis e inadimplência (v6.5.0) — módulo PURO sobre o retorno de `get_geral_recebiveis`: o funil
// dos três cards, as faixas de atraso, a tabela dos devedores e a evolução semanal. Sem I/O nem React.
//
// Decisões do Yan que este módulo encarna (briefing v6.5.0 §1/§2.1):
//  • Inadimplência = SÓ a marcação `Conferido = Inadimplente` (em aberto). As faixas de atraso e a tabela
//    dos devedores são SOBRE OS INADIMPLENTES, nunca sobre todos os vencidos.
//  • O Δ dos três cards é contra a última foto ANTERIOR à semana da posição (`referencia_semana`); sem
//    referência, o Δ some (nunca zero) e a tela diz que não há base.
//  • Nada some (inv. 4): devedor sem nome vira "(sem nome)", semana sem carga é LACUNA — `null`, nunca
//    zero (zero afirmaria "não havia inadimplência").
//  • Completude ao centavo (inv. 2): Σ faixas ≡ inadimplente e Σ top + demais ≡ inadimplente. Cada tabela
//    traz `fecha` — a conferência feita em centavos inteiros —, para a UI poder avisar se algum dia não fechar.

import { fmtDate } from '@/lib/fmt'
import {
  diaMes, diasEntre, emCentavos, pctDe, segundaDaSemana, somarCentavos, somarDias,
} from './numeros'
import { FAIXAS_ATRASO, type FaixaAtraso, type Recebiveis } from './schemas'
import { variacao, type Variacao } from './variacao'

// ── O funil: em aberto ⊃ vencido ⊃ inadimplente ────────────────────────────────────────────────

export interface CardRecebivel {
  valor: number
  n: number
  /** Δ do VALOR contra a referência da semana; `{ pct: null, sentido: null }` sem referência. */
  delta: Variacao
}

export interface FunilRecebiveis {
  /** Sem juízo: ter mais ou menos título em aberto não é bom nem ruim por si. */
  emAberto: CardRecebivel
  /** "menor é melhor". */
  vencido: CardRecebivel & {
    /** "X% do em aberto" (valor ÷ valor); `null` com em aberto zerado. */
    pctDoEmAberto: number | null
  }
  /** "menor é melhor". */
  inadimplente: CardRecebivel & {
    /** "X% dos vencidos" (valor ÷ valor); `null` com vencido zerado. Pode passar de 100% se houver
     *  inadimplente marcado AINDA NÃO VENCIDO (inv. 3) — a seção avisa disso. */
    pctDosVencidos: number | null
  }
  /** A foto contra a qual o Δ foi calculado; `null` = sem base (o Δ some dos três cards). */
  referencia: {
    dataPosicao: string
    /** "vs 08/10" */
    rotulo: string
  } | null
}

export function funilDosRecebiveis(
  r: Pick<Recebiveis, 'em_aberto' | 'vencido' | 'inadimplente' | 'referencia_semana'>,
): FunilRecebiveis {
  const ref = r.referencia_semana
  return {
    emAberto: {
      valor: r.em_aberto.valor, n: r.em_aberto.n,
      delta: variacao(ref?.em_aberto.valor, r.em_aberto.valor, 'sem-juizo'),
    },
    vencido: {
      valor: r.vencido.valor, n: r.vencido.n,
      delta: variacao(ref?.vencido.valor, r.vencido.valor, 'menor-melhor'),
      pctDoEmAberto: pctDe(r.vencido.valor, r.em_aberto.valor),
    },
    inadimplente: {
      valor: r.inadimplente.valor, n: r.inadimplente.n,
      delta: variacao(ref?.inadimplente.valor, r.inadimplente.valor, 'menor-melhor'),
      pctDosVencidos: pctDe(r.inadimplente.valor, r.vencido.valor),
    },
    referencia: ref ? { dataPosicao: ref.data_posicao, rotulo: `vs ${diaMes(ref.data_posicao)}` } : null,
  }
}

// ── Faixas de atraso (sobre os inadimplentes) ──────────────────────────────────────────────────

const ROTULO_FAIXA: Record<FaixaAtraso, string> = {
  'nao_vencido': 'A vencer',
  '1-30': '1 a 30 dias',
  '31-60': '31 a 60 dias',
  '61-90': '61 a 90 dias',
  '90+': 'Mais de 90 dias',
}

export interface LinhaFaixa {
  faixa: FaixaAtraso
  rotulo: string
  n: number
  valor: number
  /** % do valor inadimplente; `null` quando não há inadimplente. */
  pct: number | null
}

export interface TabelaFaixas {
  /** 1–30, 31–60, 61–90 e 90+ SEMPRE (mesmo zeradas — o universo é fechado, zero é zero de verdade);
   *  "A vencer" (a marcação manual de um título que ainda não venceu, inv. 3) só quando houver título. */
  linhas: LinhaFaixa[]
  /** A soma das LINHAS (não o número da RPC copiado): é isto que se confere contra o inadimplente. */
  total: { n: number; valor: number; pct: number | null }
  /** Σ linhas ≡ inadimplente, ao centavo e em nº de títulos. */
  fecha: boolean
}

export function faixasDeAtraso(
  inad: Pick<Recebiveis['inadimplente'], 'n' | 'valor' | 'faixas'>,
): TabelaFaixas {
  const linhas = FAIXAS_ATRASO.flatMap((faixa): LinhaFaixa[] => {
    const itens = inad.faixas.filter(f => f.faixa === faixa)
    const n = itens.reduce((s, f) => s + f.n, 0)
    const valor = somarCentavos(itens.map(f => f.valor))
    if (faixa === 'nao_vencido' && n <= 0) return []
    return [{ faixa, rotulo: ROTULO_FAIXA[faixa], n, valor, pct: pctDe(valor, inad.valor) }]
  })
  const n = linhas.reduce((s, l) => s + l.n, 0)
  const valor = somarCentavos(linhas.map(l => l.valor))
  return {
    linhas,
    total: { n, valor, pct: pctDe(valor, inad.valor) },
    fecha: emCentavos(valor) === emCentavos(inad.valor) && n === inad.n,
  }
}

/** O aviso do inv. 3: título marcado como inadimplente que AINDA NÃO VENCEU (a marcação é manual). Ele
 *  continua contando — não some nem força o funil —, e a seção avisa. `null` = nenhum caso. */
export function avisoInadimplenteAVencer(
  inad: Pick<Recebiveis['inadimplente'], 'faixas'>,
): { n: number; valor: number } | null {
  const itens = inad.faixas.filter(f => f.faixa === 'nao_vencido')
  const n = itens.reduce((s, f) => s + f.n, 0)
  if (n <= 0) return null
  return { n, valor: somarCentavos(itens.map(f => f.valor)) }
}

// ── 10 maiores inadimplentes (por devedor) ─────────────────────────────────────────────────────

export const ROTULO_SEM_NOME = '(sem nome)'

export interface LinhaDevedor {
  /** 1..N, na ordem que a RPC devolveu (valor decrescente). */
  posicao: number
  /** `null` na origem → "(sem nome)", visível (inv. 4). */
  devedor: string
  semNome: boolean
  /** Títulos inadimplentes do devedor. */
  n: number
  valor: number
  /** % do TOTAL inadimplente (não do top). */
  pct: number | null
  /** Maior atraso entre os títulos, em dias (≤ 0 = ainda não venceu; `null` = sem vencimento). */
  maiorAtraso: number | null
}

export interface LinhaDemaisDevedores {
  devedores: number
  /** "demais 8 devedores" */
  rotulo: string
  n: number
  valor: number
  pct: number | null
}

export interface TabelaDevedores {
  linhas: LinhaDevedor[]
  /** `null` quando não há devedor além do top. */
  demais: LinhaDemaisDevedores | null
  /** Σ top + demais. */
  total: { n: number; valor: number; pct: number | null }
  /** Σ top + demais ≡ inadimplente, ao centavo e em nº de títulos. */
  fecha: boolean
}

export function rotuloDemaisDevedores(devedores: number): string {
  return `demais ${devedores} ${devedores === 1 ? 'devedor' : 'devedores'}`
}

/** "—" (sem vencimento) / "a vencer" (≤ 0) / "1 dia" / "142 dias". */
export function rotuloMaiorAtraso(dias: number | null): string {
  if (dias === null) return '—'
  if (dias <= 0) return 'a vencer'
  return dias === 1 ? '1 dia' : `${dias} dias`
}

export function tabelaDevedores(
  d: Recebiveis['devedores'],
  inad: Pick<Recebiveis['inadimplente'], 'n' | 'valor'>,
): TabelaDevedores {
  const linhas = d.top.map((t, i): LinhaDevedor => ({
    posicao: i + 1,
    devedor: t.pessoa ?? ROTULO_SEM_NOME,
    semNome: t.pessoa === null,
    n: t.n,
    valor: t.valor,
    pct: pctDe(t.valor, inad.valor),
    maiorAtraso: t.maior_atraso,
  }))
  const demais: LinhaDemaisDevedores | null = d.demais.devedores > 0
    ? {
      devedores: d.demais.devedores,
      rotulo: rotuloDemaisDevedores(d.demais.devedores),
      n: d.demais.n,
      valor: d.demais.valor,
      pct: pctDe(d.demais.valor, inad.valor),
    }
    : null
  // O total entra com o "demais" mesmo quando a linha não aparece (devedores = 0): nunca descarta valor.
  const n = linhas.reduce((s, l) => s + l.n, 0) + d.demais.n
  const valor = somarCentavos([...linhas.map(l => l.valor), d.demais.valor])
  return {
    linhas,
    demais,
    total: { n, valor, pct: pctDe(valor, inad.valor) },
    fecha: emCentavos(valor) === emCentavos(inad.valor) && n === inad.n,
  }
}

// ── Evolução semanal do inadimplente ───────────────────────────────────────────────────────────

export interface PontoSemana {
  /** A segunda-feira da semana ('AAAA-MM-DD'). */
  semana: string
  /** Rótulo curto do eixo: "12/10" (a segunda). */
  rotulo: string
  /** A foto que representa a semana; `null` na lacuna. */
  dataPosicao: string | null
  /** `null` = semana SEM carga: lacuna, nunca zero. */
  inadimplenteValor: number | null
  inadimplenteN: number | null
  /** Para o tooltip ("vencido no tooltip", briefing §2.1). */
  vencidoValor: number | null
  /** A semana de `hoje`: a foto dela (se houver) ainda pode mudar. */
  parcial: boolean
  lacuna: boolean
}

/** "12/10 a 18/10" — a semana inteira, para o tooltip. */
export function rotuloIntervaloSemana(semana: string): string {
  return `${diaMes(semana)} a ${diaMes(somarDias(semana, 6))}`
}

/**
 * Um ponto por semana (segunda a domingo), da semana de `historico_desde` até a semana de `hoje`.
 * `hoje` é a string 'AAAA-MM-DD' do SERVIDOR (fuso de SP): a aritmética é de calendário puro em UTC,
 * nunca o relógio do cliente. Semana sem item em `evolucao_semanal` ⇒ valores `null` (LACUNA). Sem
 * histórico ⇒ `[]` (a seção diz que ainda não há foto; não desenha zero).
 *
 * Toda semana PRESENTE em `evolucao_semanal` aparece na saída, mesmo que caia fora do intervalo
 * esperado (o intervalo se estende para contê-la): se a geração das segundas errasse por um dia, o
 * dado viraria lacuna falsa em silêncio.
 */
export function pontosSemanais(
  r: Pick<Recebiveis, 'evolucao_semanal' | 'historico_desde'>,
  hoje: string,
): PontoSemana[] {
  if (r.historico_desde === null) return []
  // A chave é a segunda DA semana do item (a RPC já emite segundas; se um dia emitir outro dia da semana,
  // o item cai na semana certa em vez de virar lacuna falsa).
  const porSemana = new Map(r.evolucao_semanal.map(e => [segundaDaSemana(e.semana), e]))
  const semanaDeHoje = segundaDaSemana(hoje)
  const semanasComDado = [...porSemana.keys()].sort()

  const inicio = [segundaDaSemana(r.historico_desde), ...semanasComDado.slice(0, 1)].sort()[0]
  const fim = [semanaDeHoje, ...semanasComDado.slice(-1)].sort().at(-1) as string
  const semanas = Math.round(diasEntre(inicio, fim) / 7)
  if (!Number.isFinite(semanas) || semanas < 0) return []

  return Array.from({ length: semanas + 1 }, (_, i): PontoSemana => {
    const semana = somarDias(inicio, i * 7)
    const e = porSemana.get(semana)
    return {
      semana,
      rotulo: diaMes(semana),
      dataPosicao: e?.data_posicao ?? null,
      inadimplenteValor: e?.inadimplente_valor ?? null,
      inadimplenteN: e?.inadimplente_n ?? null,
      vencidoValor: e?.vencido_valor ?? null,
      parcial: semana === semanaDeHoje,
      lacuna: e === undefined,
    }
  })
}

// ── Rótulos e estados ──────────────────────────────────────────────────────────────────────────

/** "na carga de 15/10" — a posição é um ESTOQUE numa data, e a data é a da carga. */
export function rotuloPosicao(dataPosicao: string): string {
  const [, m, d] = dataPosicao.split('-')
  return `na carga de ${d}/${m}`
}

/** "histórico desde 25/09/2026" — a evolução começa na v6.4, nunca fabrica zero antes dela. */
export function rotuloHistoricoDesde(iso: string | null): string | null {
  return iso ? `histórico desde ${fmtDate(iso)}` : null
}

/** A base ainda não teve carga? (`carga: null`) — estado normal até o 1º upload. */
export function semBase(r: Pick<Recebiveis, 'carga'>): boolean {
  return r.carga === null
}
