// Fixture da página "Financeiro · Geral" (v6.5.0, GATE 1 — mockup na rota real) — dado de DEMONSTRAÇÃO
// tipado como `DadosGeral`. Alimenta o mockup e os testes dos módulos puros; NÃO é dado vivo.
//
// Os números são os da medição M0 (posição de 15/10/2026): funil de recebíveis, prejuízo bruto e
// antecipações por ano. O que a M0 não dá (faixas, devedores, séries, pessoas, split por conta) é
// FICTÍCIO, montado para somar exato:
//  • nada de nome real — devedores são "Devedor A".."Devedor R", pessoas são "Pessoa 01"..;
//  • tudo em centavos exatos, e a ÚLTIMA parcela de cada soma é o RESÍDUO (`total − Σ anteriores`), então
//    as completudes do inv. 2 (Σ faixas, top + demais, Σ pessoas ≡ Σ série, Σ por conta ≡ Σ volume) fecham
//    por construção — o teste da fixture só confirma;
//  • a `referencia_semana` (08/10) e a série semanal são inventadas para o Δ e o gráfico aparecerem (a
//    base real tem UMA foto, sem semana anterior).
//
// Estados: `normal` (com dado), `vazio` (sem carga, anos zerados — o estado normal de "sem dado", não
// erro) e `erro` (toda leitura `{ ok: false }`). Os recebíveis são a posição FIXA de 15/10 e a última
// antecipação é 21/09/2026 (datas fixas); tudo que depende do tempo (`relacao`, `mes_corrente`,
// `dias_desde_ultima`) deriva de `hoje`. A série semanal termina na semana de 12/10: com `hoje` depois
// dela, as semanas seguintes aparecem como lacuna (é o que `pontosSemanais` faz com `hoje`).
// Os anos fora de `anos` não entram.

import { custoDoRecorte } from './antecipacoes'
import { diasEntre, emCentavos } from './numeros'
import { anosDasPillsGeral, recorteDaLeitura, type RelacaoDoAno } from './periodo'
import {
  antecipacoesSchema, prejuizosSchema, recebiveisSchema,
  type Antecipacoes, type Prejuizos, type Recebiveis,
} from './schemas'
import type { Carregado, DadosGeral, LeituraAno } from './tipos'

export type EstadoFixture = 'normal' | 'vazio' | 'erro'

// ── Utilitários de centavos ────────────────────────────────────────────────────────────────────

const zeros = (): number[] => Array.from({ length: 12 }, () => 0)
const somar = (v: readonly number[]): number => v.reduce((s, x) => s + emCentavos(x), 0) / 100
/** `parciais` + o resíduo que fecha `total` ao centavo. */
const fechar = (total: number, parciais: readonly number[]): number[] => [...parciais, (emCentavos(total) - emCentavos(somar(parciais))) / 100]
const completar12 = (v: readonly number[]): number[] => [...v, ...zeros()].slice(0, 12)

function relacaoDoAno(ano: number, hoje: string): { relacao: 'fechado' | 'corrente' | 'futuro'; mes_corrente: number | null } {
  const anoHoje = Number(hoje.slice(0, 4))
  if (ano < anoHoje) return { relacao: 'fechado', mes_corrente: null }
  if (ano > anoHoje) return { relacao: 'futuro', mes_corrente: null }
  return { relacao: 'corrente', mes_corrente: Number(hoje.slice(5, 7)) }
}

/** Quantos meses do ano anterior entram no "mesmo período" do ano `ano` (o recorte da própria RPC). */
const mesesDoRecorte = (r: RelacaoDoAno): number => recorteDaLeitura(r).mesFim

// ── Recebíveis (posição de 15/10/2026) ─────────────────────────────────────────────────────────

const INADIMPLENTE = { n: 21, valor: 199767.74 }

function recebiveisNormal(): Recebiveis {
  // Faixas: as quatro de atraso fictícias; "90+" é o resíduo. "nao_vencido" vem zerada, como a RPC emite.
  const f1 = 18432.15, f2 = 22610.48, f3 = 14985.3
  const f4 = (emCentavos(INADIMPLENTE.valor) - emCentavos(f1) - emCentavos(f2) - emCentavos(f3)) / 100

  // 18 devedores: 10 no top e 8 em "demais"; o "demais" é o resíduo de valor e de títulos.
  const valoresTop = [48210.6, 31875.25, 24100, 19320.4, 14780.95, 11250, 8640.3, 6420.15, 5105.8, 3890.45]
  const atrasos = [142, 118, 97, 203, 66, 45, 188, 31, 22, 12]
  const top = valoresTop.map((valor, i) => ({
    pessoa: `Devedor ${String.fromCharCode(65 + i)}`,
    n: i < 2 ? 2 : 1,
    valor,
    maior_atraso: atrasos[i],
  }))
  const demais = {
    devedores: 8,
    n: INADIMPLENTE.n - top.reduce((s, t) => s + t.n, 0),
    valor: (emCentavos(INADIMPLENTE.valor) - emCentavos(somar(valoresTop))) / 100,
  }

  const semana = (s: string, data: string, n: number, valor: number, vencido: number) => ({
    semana: s, data_posicao: data, inadimplente_n: n, inadimplente_valor: valor, vencido_valor: vencido,
  })

  return recebiveisSchema.parse({
    carga: { carga_id: 'fixture-carga-2026-10-15', data_posicao: '2026-10-15', gravado_em: '2026-10-15T16:42:10+00:00' },
    em_aberto: { n: 4830, valor: 12146832.84 },
    vencido: { n: 182, valor: 1029384.12 },
    inadimplente: {
      ...INADIMPLENTE,
      faixas: [
        { faixa: 'nao_vencido', n: 0, valor: 0 },
        { faixa: '1-30', n: 4, valor: f1 },
        { faixa: '31-60', n: 3, valor: f2 },
        { faixa: '61-90', n: 2, valor: f3 },
        { faixa: '90+', n: 12, valor: f4 },
      ],
    },
    devedores: { top, demais },
    // FICTÍCIA: a última foto da semana de 05/10 (a posição atual é da semana de 12/10).
    referencia_semana: {
      data_posicao: '2026-10-08',
      em_aberto: { n: 4790, valor: 11930500.2 },
      vencido: { n: 170, valor: 951200.55 },
      inadimplente: { n: 19, valor: 181420.3 },
    },
    // FICTÍCIA, com UMA lacuna (semana de 21/09, sem carga). A última semana é a da posição real.
    evolucao_semanal: [
      semana('2026-08-17', '2026-08-21', 14, 142300, 760100.4),
      semana('2026-08-24', '2026-08-28', 15, 149850.75, 790420.1),
      semana('2026-08-31', '2026-09-04', 15, 154200.3, 812900),
      semana('2026-09-07', '2026-09-11', 16, 161700.2, 861300.55),
      semana('2026-09-14', '2026-09-18', 17, 166250, 902770.8),
      // 21/09: lacuna
      semana('2026-09-28', '2026-10-02', 18, 176300, 930410.2),
      semana('2026-10-05', '2026-10-08', 19, 181420.3, 951200.55),
      semana('2026-10-12', '2026-10-15', INADIMPLENTE.n, INADIMPLENTE.valor, 1029384.12),
    ],
    historico_desde: '2026-08-21',
  })
}

function recebiveisVazio(): Recebiveis {
  return recebiveisSchema.parse({
    carga: null,
    em_aberto: { n: 0, valor: 0 },
    vencido: { n: 0, valor: 0 },
    inadimplente: { n: 0, valor: 0, faixas: null },
    devedores: { top: null, demais: { devedores: 0, n: 0, valor: 0 } },
    referencia_semana: null,
    evolucao_semanal: null,
    historico_desde: null,
  })
}

// ── Prejuízos (bruto, sinal da DRE) ────────────────────────────────────────────────────────────

const PREJUIZO_TOTAL: Partial<Record<number, number>> = { 2024: -77892.96, 2025: -175808.35, 2026: -224574.79 }
/** Os meses anteriores ao RESÍDUO. 2024/2025: jan–nov (dez fecha); 2026: jan–set (out fecha; nov e dez = 0). */
const PREJUIZO_PARCIAIS: Partial<Record<number, number[]>> = {
  2024: [-4210.5, -6830, -3120.75, -9450.2, -5980, -8120.35, -7340.1, -6010.8, -9230.45, -4890, -7150.25],
  2025: [-9800, -12450.3, -15120.45, -11230, -18340.75, -14760.2, -16890.1, -13420.55, -21050, -17610.3, -12980.4],
  2026: [-14200, -19850.4, -22310.15, -18740, -27120.6, -21980.35, -25430.9, -23670.2, -28110.45],
}
/** Pessoas e lançamentos por ano (M0, Q4). */
const PREJUIZO_PESSOAS: Partial<Record<number, { pessoas: number; lancamentos: number }>> = {
  2024: { pessoas: 32, lancamentos: 48 },
  2025: { pessoas: 31, lancamentos: 56 },
  2026: { pessoas: 50, lancamentos: 123 },
}

function mesesPrejuizo(ano: number): number[] {
  const total = PREJUIZO_TOTAL[ano]
  const parciais = PREJUIZO_PARCIAIS[ano]
  if (total === undefined || parciais === undefined) return zeros()
  return completar12(fechar(total, parciais))
}

/** Reparte `total` entre N pessoas com peso 1/i^1,2 (cauda longa, top 10 ≈ 75%); a última é o RESÍDUO. */
function ratearPessoas(total: number, pessoas: number, lancamentos: number) {
  const pesos = Array.from({ length: pessoas }, (_, i) => 1 / (i + 1) ** 1.2)
  const somaPesos = pesos.reduce((s, p) => s + p, 0)
  const centavos = pesos.slice(0, -1).map(p => Math.round((emCentavos(total) * p) / somaPesos))
  centavos.push(emCentavos(total) - centavos.reduce((s, c) => s + c, 0))
  // 1 lançamento para cada; os que sobram vão para as 10 primeiras.
  const n = Array.from({ length: pessoas }, () => 1)
  for (let k = 0; k < lancamentos - pessoas; k++) n[k % Math.min(10, pessoas)] += 1
  return centavos.map((c, i) => ({ pessoa: `Pessoa ${String(i + 1).padStart(2, '0')}`, n: n[i], valor: c / 100 }))
}

function prejuizosDoAno(ano: number, hoje: string, vazio: boolean): Prejuizos {
  const rel = relacaoDoAno(ano, hoje)
  const meses = vazio ? zeros() : mesesPrejuizo(ano)
  const total = somar(meses)
  const anterior = PREJUIZO_TOTAL[ano - 1]
  const ytd = vazio || anterior === undefined ? null : { prejuizo: somar(mesesPrejuizo(ano - 1).slice(0, mesesDoRecorte(rel))) }
  const cfg = PREJUIZO_PESSOAS[ano]
  return prejuizosSchema.parse({
    ano, ...rel,
    prejuizo: { meses, total },
    ano_anterior_ytd: ytd,
    por_pessoa: vazio || !cfg ? [] : ratearPessoas(total, cfg.pessoas, cfg.lancamentos),
    bandeja: [],
    atualizado_em: vazio ? null : '2026-10-15T16:42:10+00:00',
  })
}

// ── Antecipações ───────────────────────────────────────────────────────────────────────────────

type Tupla = [volume: number, desconto: number, n: number]
interface AnoAntecipacao {
  volume: number
  desconto: number
  n: number
  /** 12 posições; `null` = mês sem antecipação. A posição `idxResto` só traz o `n`: volume e desconto são o resíduo. */
  meses: (Tupla | null)[]
  idxResto: number
  /** Asaas é dado; Blimboo é o resíduo do ano. */
  asaas: { volume: number; desconto: number; n: number }
  maiorIntervalo: { dias: number; de: string; ate: string }
}

const ULTIMA_ANTECIPACAO = '2026-09-21'

const ANTECIPACAO: Partial<Record<number, AnoAntecipacao>> = {
  2024: {
    volume: 1521381.14, desconto: 43964.39, n: 9, idxResto: 11,
    meses: [[140000, 4000, 1], null, [330000, 9500, 2], [160000, 4600, 1], null, [150000, 4300, 1], [170000, 5000, 1], null, [190000, 5400, 1], null, [200000, 5900, 1], [0, 0, 1]],
    asaas: { volume: 900000, desconto: 26000, n: 5 },
    maiorIntervalo: { dias: 70, de: '2024-07-10', ate: '2024-09-18' },
  },
  2025: {
    volume: 3926091.12, desconto: 102130.34, n: 18, idxResto: 11,
    meses: [[450000, 11700, 2], [220000, 5700, 1], [480000, 12500, 2], [390000, 10200, 2], [180000, 4700, 1], [400000, 10400, 2], [210000, 5500, 1], [430000, 11200, 2], [190000, 4900, 1], [250000, 6500, 1], [420000, 10900, 2], [0, 0, 1]],
    asaas: { volume: 1900000, desconto: 49000, n: 11 },
    maiorIntervalo: { dias: 48, de: '2025-08-05', ate: '2025-09-22' },
  },
  // Maior intervalo de 2026 = 117 dias (27/05 → 21/09), como na M0; o intervalo em curso (até hoje) é menor.
  2026: {
    volume: 1797940.19, desconto: 41968.28, n: 11, idxResto: 8,
    meses: [[260000, 6100, 2], [310000, 7300, 2], [395000, 9250, 3], [270000, 6400, 2], [190000, 4400, 1], null, null, null, [0, 0, 1], null, null, null],
    asaas: { volume: 888686.34, desconto: 17863.14, n: 6 },
    maiorIntervalo: { dias: 117, de: '2026-05-27', ate: ULTIMA_ANTECIPACAO },
  },
}

function mesesAntecipacao(ano: number): { volume: number; liquido: number; desconto: number; n: number }[] {
  const a = ANTECIPACAO[ano]
  if (!a) return zeros().map(() => ({ volume: 0, liquido: 0, desconto: 0, n: 0 }))
  const soma = (i: 0 | 1) => a.meses.reduce((s, t, k) => (t && k !== a.idxResto ? s + emCentavos(t[i]) : s), 0)
  return a.meses.map((t, k) => {
    if (!t) return { volume: 0, liquido: 0, desconto: 0, n: 0 }
    const volume = k === a.idxResto ? (emCentavos(a.volume) - soma(0)) / 100 : t[0]
    const desconto = k === a.idxResto ? (emCentavos(a.desconto) - soma(1)) / 100 : t[1]
    return { volume, liquido: (emCentavos(volume) - emCentavos(desconto)) / 100, desconto, n: t[2] }
  })
}

function antecipacoesDoAno(ano: number, hoje: string, vazio: boolean): Antecipacoes {
  const rel = relacaoDoAno(ano, hoje)
  const dado = vazio ? undefined : ANTECIPACAO[ano]
  const meses = vazio ? zeros().map(() => ({ volume: 0, liquido: 0, desconto: 0, n: 0 })) : mesesAntecipacao(ano)
  const soma = (campo: 'volume' | 'liquido' | 'desconto') => somar(meses.map(m => m[campo]))
  const total = { volume: soma('volume'), liquido: soma('liquido'), desconto: soma('desconto'), n: meses.reduce((s, m) => s + m.n, 0) }

  const anterior = ANTECIPACAO[ano - 1]
  const mesesAnterior = anterior ? mesesAntecipacao(ano - 1).slice(0, mesesDoRecorte(rel)) : null
  const ytd = vazio || !mesesAnterior
    ? null
    : {
      volume: somar(mesesAnterior.map(m => m.volume)),
      desconto: somar(mesesAnterior.map(m => m.desconto)),
      n: mesesAnterior.reduce((s, m) => s + m.n, 0),
    }

  // Asaas é dado; Blimboo fecha o ano (resíduo de volume, desconto e títulos).
  const porConta = dado
    ? [
      { conta: 'Asaas', ...dado.asaas },
      {
        conta: 'Blimboo',
        volume: (emCentavos(total.volume) - emCentavos(dado.asaas.volume)) / 100,
        desconto: (emCentavos(total.desconto) - emCentavos(dado.asaas.desconto)) / 100,
        n: total.n - dado.asaas.n,
      },
    ]
    : []

  return antecipacoesSchema.parse({
    ano, ...rel,
    meses,
    // `desconto_pct` pela MESMA fórmula do módulo (a UI não o lê: usa `custoDoRecorte`).
    total: { ...total, desconto_pct: custoDoRecorte(total).pct },
    ano_anterior_ytd: ytd,
    por_conta: porConta,
    // GLOBAL: o mesmo valor em cada ano lido.
    ultima_data: vazio ? null : ULTIMA_ANTECIPACAO,
    dias_desde_ultima: vazio ? null : Math.max(0, diasEntre(ULTIMA_ANTECIPACAO, hoje)),
    maior_intervalo_ano: dado ? dado.maiorIntervalo : null,
    atualizado_em: vazio ? null : '2026-09-22T13:05:00+00:00',
  })
}

// ── A fixture ──────────────────────────────────────────────────────────────────────────────────

/**
 * `DadosGeral` de demonstração. `anos` = os anos selecionados (os demais não entram); `hoje` = 'AAAA-MM-DD'
 * (o `hoje` de SP que o servidor mandaria). `podeGerir` liga o botão "Registrar antecipação" no mockup.
 */
export function fixtureGeral(
  estado: EstadoFixture,
  hoje: string,
  anos: readonly number[],
  podeGerir: boolean = true,
): DadosGeral {
  const selecionados = [...new Set(anos)].sort((a, b) => a - b)
  const leituraDo = <T>(ano: number, montar: (ano: number) => T): LeituraAno<T> => ({
    ano,
    leitura: estado === 'erro' ? { ok: false } : { ok: true, dados: montar(ano) },
  })
  const porAno = <T>(montar: (ano: number) => T): LeituraAno<T>[] => selecionados.map(ano => leituraDo(ano, montar))
  const anoCorrente = Number(hoje.slice(0, 4))
  const recebiveis: Carregado<Recebiveis> = estado === 'erro'
    ? { ok: false }
    : { ok: true, dados: estado === 'vazio' ? recebiveisVazio() : recebiveisNormal() }

  return {
    anos: selecionados,
    anosDisponiveis: anosDasPillsGeral(anoCorrente),
    hoje,
    recebiveis,
    antecipacoes: porAno(ano => antecipacoesDoAno(ano, hoje, estado === 'vazio')),
    prejuizos: porAno(ano => prejuizosDoAno(ano, hoje, estado === 'vazio')),
    corrente: {
      prejuizos: leituraDo(anoCorrente, ano => prejuizosDoAno(ano, hoje, estado === 'vazio')),
      antecipacoes: leituraDo(anoCorrente, ano => antecipacoesDoAno(ano, hoje, estado === 'vazio')),
    },
    podeGerir,
  }
}
