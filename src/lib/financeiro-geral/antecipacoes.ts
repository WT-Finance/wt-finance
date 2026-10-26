// Antecipações (v6.5.0) — módulo PURO sobre o retorno de `get_geral_antecipacoes` (uma leitura por ano).
//
// UMA fórmula de custo (inv. 2): `custoDoRecorte`. Os cards "Custo efetivo/percentual no ano" e o
// "Comparativo por conta" usam SÓ ela — o `total.desconto_pct` que a RPC ainda devolve NÃO é lido aqui.
// O custo percentual é desconto ÷ volume: média PONDERADA pelo volume, nunca a média simples das taxas
// (um recorte pequeno de taxa alta pesaria igual a um grande de taxa baixa).
//
// O que NÃO é copiado do card de Marketing (`linhasTotalPorAno`), por decisão da delegação v6.5.0:
//  • o Δ não é contra o "próximo ano da lista", e sim contra o MESMO PERÍODO do ano anterior
//    (`ano_anterior_ytd` da própria leitura);
//  • não é fail-closed: a página degrada por seção/ano — as linhas dos anos que chegaram vêm com os que
//    falharam em `anosFalha`, e a UI avisa.
// O que É copiado: uma linha por ano selecionado, do mais recente ao mais antigo, o ano corrente em destaque.

import { fmtAxisPct } from '@/lib/fmt'
import { anosQueFalharam, leituraDoAnoCorrente, type AnoDaSerie } from './composicao'
import { diasEntre, emCentavos, pctDe } from './numeros'
import { rotuloDoAno, rotuloReferencia } from './periodo'
import type { Antecipacoes } from './schemas'
import type { LeituraAno } from './tipos'
import { variacao, type Polaridade, type Sentido, type Variacao } from './variacao'

export { diasEntre }

/** "hoje" / "1 dia" / "12 dias". */
export function rotuloDias(dias: number): string {
  if (dias === 0) return 'hoje'
  return dias === 1 ? '1 dia' : `${dias} dias`
}

// ── A fórmula única do custo ───────────────────────────────────────────────────────────────────

export interface CustoRecorte {
  /** Custo efetivo: o desconto (antecipado − líquido), em R$. */
  efetivo: number
  /** Custo percentual: desconto ÷ volume × 100, ponderado pelo volume; `null` com volume zero. */
  pct: number | null
}

/** O custo de um recorte qualquer (um ano, uma conta, um ano de uma conta). Os cards e o comparativo
 *  passam por AQUI e por nenhum outro caminho. */
export function custoDoRecorte(r: { volume: number; desconto: number }): CustoRecorte {
  return { efetivo: r.desconto, pct: pctDe(r.desconto, r.volume) }
}

/** "2,33%" — 2 casas (a taxa de antecipação vive na segunda casa; `fmtPct` de Marketing arredonda a 1). */
export function fmtCustoPct(pct: number | null): string {
  return pct === null ? '—' : fmtAxisPct(pct === 0 ? 0 : pct, 2)
}

// ── Δ em pontos percentuais (o Δ do custo %) ───────────────────────────────────────────────────

export interface DeltaPontos {
  /** pct atual − pct anterior, em pontos percentuais; `null` quando falta um dos lados. */
  pp: number | null
  /** `null` sem Δ ou em `sem-juizo`; "estável" (`neutro`) quando o Δ arredonda a 0,00 p.p. */
  sentido: Sentido | null
}

/** Subtração de duas taxas (não é o Δ% relativo do `variacao`: 2,6% → 2,3% é −0,27 p.p., não −10%). */
export function deltaPontos(
  anterior: number | null | undefined,
  atual: number | null | undefined,
  polaridade: Polaridade,
): DeltaPontos {
  if (anterior === null || anterior === undefined || atual === null || atual === undefined) {
    return { pp: null, sentido: null }
  }
  const pp = atual - anterior
  if (polaridade === 'sem-juizo') return { pp, sentido: null }
  // Mesmo arredondamento que `fmtPontos` mostra (2 casas): "+0,00 p.p." não pode virar "desfavorável".
  if (Math.round(pp * 100) === 0) return { pp, sentido: 'neutro' }
  const subiu = pp > 0
  const bom = polaridade === 'maior-melhor' ? subiu : !subiu
  return { pp, sentido: bom ? 'favoravel' : 'desfavoravel' }
}

const nfPontos = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "+0,27 p.p." / "−0,27 p.p." / "0,00 p.p." (menos tipográfico U+2212; "−0,00" nunca aparece); `null` → "—". */
export function fmtPontos(pp: number | null): string {
  if (pp === null) return '—'
  const r = Math.round(pp * 100) / 100
  const sinal = r > 0 ? '+' : r < 0 ? '−' : ''
  return `${sinal}${nfPontos.format(Math.abs(r))} p.p.`
}

// ── Cards "Custo efetivo no ano" e "Custo percentual no ano" ───────────────────────────────────

/** Polaridade do custo: menor é melhor — o `desconto` chega POSITIVO (diferente da despesa da DRE, que
 *  é negativa), então subir o custo é desfavorável. */
const POLARIDADE_CUSTO: Polaridade = 'menor-melhor'

export interface LinhaCustoAno {
  ano: number
  /** "2026*" quando parcial. */
  rotulo: string
  /** O ano corrente: a linha em destaque. */
  corrente: boolean
  /** Nenhuma antecipação no recorte do ano (n = 0): a UI escreve "—", nunca "R$ 0,00 / 0%" como dado. */
  semAntecipacao: boolean
  custo: CustoRecorte
  /** Δ do custo efetivo (R$) vs o mesmo período do ano anterior. */
  deltaEfetivo: Variacao
  /** Δ do custo percentual, em pontos percentuais. */
  deltaPct: DeltaPontos
  /** "vs 2025 (jan–out)" */
  referencia: string
}

export interface CustoPorAno {
  /** Os anos que carregaram, do mais RECENTE ao mais antigo. */
  linhas: LinhaCustoAno[]
  /** Anos selecionados que NÃO carregaram — a UI avisa. */
  anosFalha: number[]
}

export function custoPorAno(leituras: readonly LeituraAno<Antecipacoes>[], hoje: string): CustoPorAno {
  const anoCorrente = Number(hoje.slice(0, 4))
  const linhas = leituras
    .flatMap(x => (x.leitura.ok ? [{ ano: x.ano, l: x.leitura.dados }] : []))
    .sort((a, b) => b.ano - a.ano)
    .map(({ ano, l }): LinhaCustoAno => {
      const custo = custoDoRecorte(l.total)
      const semAntecipacao = l.total.n === 0
      const ytd = l.ano_anterior_ytd
      // O custo % do ano anterior sai da MESMA função, sobre o mesmo recorte (volume e desconto do ytd).
      const pctAnterior = ytd && ytd.volume !== null && ytd.desconto !== null
        ? custoDoRecorte({ volume: ytd.volume, desconto: ytd.desconto }).pct
        : null
      return {
        ano,
        rotulo: rotuloDoAno(ano, l),
        corrente: l.relacao === 'corrente' || ano === anoCorrente,
        semAntecipacao,
        custo,
        // Ausência não é zero: sem antecipação no ano, não há variação a mostrar.
        deltaEfetivo: semAntecipacao
          ? { pct: null, sentido: null }
          : variacao(ytd?.desconto, custo.efetivo, POLARIDADE_CUSTO),
        deltaPct: semAntecipacao
          ? { pp: null, sentido: null }
          : deltaPontos(pctAnterior, custo.pct, POLARIDADE_CUSTO),
        referencia: `vs ${rotuloReferencia(ano - 1, l)}`,
      }
    })
  return { linhas, anosFalha: anosQueFalharam(leituras) }
}

// ── Card "Dias sem antecipação" ────────────────────────────────────────────────────────────────

/** Dias sem antecipar até `hoje` (SP, calculado no servidor). A RPC já devolve o número, calculado no
 *  banco com o "hoje" de SP; sem ele, derivado da última data — mesma conta, calendário puro. Data de
 *  hoje anterior à última (relógio) nunca dá negativo. `null` = nunca houve antecipação. */
export function diasSemAntecipar(
  l: Pick<Antecipacoes, 'dias_desde_ultima' | 'ultima_data'>,
  hoje: string,
): number | null {
  if (l.dias_desde_ultima !== null) return Math.max(0, l.dias_desde_ultima)
  if (l.ultima_data === null) return null
  return Math.max(0, diasEntre(l.ultima_data, hoje))
}

export interface DiasSemAntecipacao {
  /** `erro` = nenhuma leitura carregou; `sem-registro` = carregou, mas nunca houve antecipação. */
  estado: 'ok' | 'sem-registro' | 'erro'
  dias: number | null
  /** 'AAAA-MM-DD' da última antecipação (de qualquer conta, de qualquer ano). */
  ultimaData: string | null
  /** O maior intervalo do ano CORRENTE (já inclui o que atravessa a virada e o intervalo em curso). `null`
   *  se a leitura do ano corrente não existe (pills sem o ano corrente) ou falhou. */
  maiorIntervalo: Antecipacoes['maior_intervalo_ano']
  /** O ano a que `maiorIntervalo` se refere (o corrente); `null` junto com `maiorIntervalo`. */
  anoDoMaiorIntervalo: number | null
}

/**
 * O card não depende das pills: a última antecipação é GLOBAL (a RPC devolve o mesmo valor em cada ano
 * lido), então vale qualquer leitura que carregou — a de `ultima_data` mais recente, por segurança. O
 * maior intervalo é o da leitura do ano CORRENTE; sem ela (não selecionada ou falhou) é `null`.
 */
export function diasSemAntecipacao(
  leituras: readonly LeituraAno<Antecipacoes>[],
  hoje: string,
): DiasSemAntecipacao {
  const carregadas = leituras.flatMap(x => (x.leitura.ok ? [x.leitura.dados] : []))
  if (carregadas.length === 0) {
    return { estado: 'erro', dias: null, ultimaData: null, maiorIntervalo: null, anoDoMaiorIntervalo: null }
  }
  const fonte = [...carregadas].sort((a, b) => (b.ultima_data ?? '').localeCompare(a.ultima_data ?? ''))[0]
  const dias = diasSemAntecipar(fonte, hoje)

  // Leitura do ano corrente que falhou (ou ausente) ⇒ sem maior intervalo; o resto do card segue de pé.
  const corrente = leituraDoAnoCorrente(leituras, hoje)
  const doCorrente = corrente !== null && corrente.leitura.ok ? corrente.leitura.dados : null

  return {
    estado: dias === null ? 'sem-registro' : 'ok',
    dias,
    ultimaData: fonte.ultima_data,
    maiorIntervalo: doCorrente?.maior_intervalo_ano ?? null,
    anoDoMaiorIntervalo: doCorrente?.maior_intervalo_ano ? doCorrente.ano : null,
  }
}

// ── Por conta ──────────────────────────────────────────────────────────────────────────────────

/** Soma por conta dos anos carregados, na ordem do maior volume (empate: nome). */
function agruparPorConta(
  leituras: readonly LeituraAno<Antecipacoes>[],
): { conta: string; n: number; volumeC: number; descontoC: number }[] {
  const grupos = new Map<string, { n: number; volumeC: number; descontoC: number }>()
  for (const x of leituras) {
    if (!x.leitura.ok) continue
    for (const c of x.leitura.dados.por_conta) {
      const g = grupos.get(c.conta) ?? { n: 0, volumeC: 0, descontoC: 0 }
      g.n += c.n
      g.volumeC += emCentavos(c.volume)
      g.descontoC += emCentavos(c.desconto)
      grupos.set(c.conta, g)
    }
  }
  return [...grupos.entries()]
    .map(([conta, g]) => ({ conta, ...g }))
    .sort((a, b) => b.volumeC - a.volumeC || a.conta.localeCompare(b.conta, 'pt-BR'))
}

export interface LinhaConta {
  conta: string
  n: number
  volume: number
  /** % do volume total; `null` com total zero. */
  pct: number | null
}

export interface TabelaVolumePorConta {
  linhas: LinhaConta[]
  total: { n: number; volume: number }
  /** Anos que não carregaram (fora da soma) — a UI avisa. */
  anosFalha: number[]
  /** Σ por conta ≡ Σ `total.volume` (e `total.n`) dos anos carregados, ao centavo. */
  fecha: boolean
}

/** "Volume antecipado por conta": soma dos anos selecionados que carregaram, por conta (rótulo "Conta"). */
export function volumePorConta(leituras: readonly LeituraAno<Antecipacoes>[]): TabelaVolumePorConta {
  const grupos = agruparPorConta(leituras)
  const totalVolumeC = grupos.reduce((s, g) => s + g.volumeC, 0)
  const totalN = grupos.reduce((s, g) => s + g.n, 0)
  const carregadas = leituras.flatMap(x => (x.leitura.ok ? [x.leitura.dados] : []))
  const registroVolumeC = carregadas.reduce((s, l) => s + emCentavos(l.total.volume), 0)
  const registroN = carregadas.reduce((s, l) => s + l.total.n, 0)
  return {
    linhas: grupos.map(g => ({
      conta: g.conta, n: g.n, volume: g.volumeC / 100, pct: pctDe(g.volumeC / 100, totalVolumeC / 100),
    })),
    total: { n: totalN, volume: totalVolumeC / 100 },
    anosFalha: anosQueFalharam(leituras),
    fecha: totalVolumeC === registroVolumeC && totalN === registroN,
  }
}

export interface CelulaComparativo {
  ano: number
  /** `null` = nenhuma antecipação dessa conta nesse ano ("—"): ausência não é custo zero. */
  custo: CustoRecorte | null
}

export interface LinhaComparativo {
  conta: string
  /** Uma célula por ano de `Comparativo.anos`, na mesma ordem. */
  celulas: CelulaComparativo[]
}

export interface Comparativo {
  /** Os anos que carregaram, CRESCENTE (a ordem das colunas e das cores, como nos gráficos). */
  anos: AnoDaSerie[]
  /** Na ordem do volume por conta (as duas tabelas se alinham). */
  linhas: LinhaComparativo[]
  /** O custo do ano inteiro (todas as contas), pela MESMA função; `null` sem antecipação no ano. */
  total: CelulaComparativo[]
  anosFalha: number[]
}

/** "Comparativo por conta": conta × ano selecionado, cada célula {efetivo, pct} por `custoDoRecorte`. */
export function comparativoPorConta(leituras: readonly LeituraAno<Antecipacoes>[]): Comparativo {
  const carregadas = leituras
    .flatMap(x => (x.leitura.ok ? [{ ano: x.ano, l: x.leitura.dados }] : []))
    .sort((a, b) => a.ano - b.ano)
  const contas = agruparPorConta(leituras).map(g => g.conta)
  return {
    anos: carregadas.map(({ ano, l }) => ({ ano, rotulo: rotuloDoAno(ano, l) })),
    linhas: contas.map(conta => ({
      conta,
      celulas: carregadas.map(({ ano, l }): CelulaComparativo => {
        const c = l.por_conta.find(x => x.conta === conta)
        return { ano, custo: c && c.n > 0 ? custoDoRecorte(c) : null }
      }),
    })),
    total: carregadas.map(({ ano, l }): CelulaComparativo => ({
      ano, custo: l.total.n > 0 ? custoDoRecorte(l.total) : null,
    })),
    anosFalha: anosQueFalharam(leituras),
  }
}

/** Todas as contas que aparecem em algum dos anos, em ordem alfabética estável. */
export function contasDosAnos(leituras: readonly Pick<Antecipacoes, 'por_conta'>[]): string[] {
  return [...new Set(leituras.flatMap(l => l.por_conta.map(c => c.conta)))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
