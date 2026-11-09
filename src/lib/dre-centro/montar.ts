import { CENTROS, porCentro, type CentroId } from './centros'
import { atribuirAntecipacoes, quemCobreQuem, type QuemCobreQuem } from './atribuicao'
import { indiceUltimoTotalizador, mesFimRealizado, montarLinhasCentro, type LinhasCentro } from './visoes'
import type { DreCentroAno } from './tipos'

// ── Um ano da DRE por centro, pronto para a tela (v6.5.1) — módulo PURO ──────
// Encadeia: árvore operacional por centro → atribuição das antecipações (§3.4) → linhas do
// bloco e da memória → Quem cobre quem → notas de cobertura. A página chama no servidor; o
// componente só escolhe a visão (Mensal, Consolidado, Lado a lado), sem ida ao servidor.

export interface NaoIdentificada {
  data: string
  conta: string
  /** Quanto do registro a regra não achou nos recebimentos (positivo). */
  falta: number
  motivo?: string
}

export interface NotasCentro {
  /** % do valor movimentado no ano que tem centro de custo (0..1). */
  coberturaPct: number
  semCentro: number
  registrado: number
  identificado: number
  naoIdentificadas: NaoIdentificada[]
  /** Taxa do registro ainda não lançada no Monde (negativa) e as datas. */
  taxaPendente: number
  datasTaxaPendente: string[]
  /** Antecipado no ano que só vence no ano seguinte (C sem D ainda). */
  naoDevolvido: number
}

export interface AnoDadosCentro {
  ano: number
  relacao: DreCentroAno['relacao']
  mesCorrente: number | null
  /** Último mês do recorte realizado (o corrente em curso; 12 num ano fechado). */
  fim: number
  parcial: boolean
  porCentro: Record<CentroId, LinhasCentro>
  /** Receita Bruta da empresa no recorte realizado — base da AV do CSC. */
  rbEmpresa: number | null
  quem: QuemCobreQuem
  notas: NotasCentro
}

function montarNotas(d: DreCentroAno, naoDevolvido: number): NotasCentro {
  const registrado = d.eventos.reduce((s, e) => s + e.valor, 0)
  const identificado = d.eventos.reduce((s, e) => s + e.identificado, 0)
  // Taxa ainda não lançada no Monde = Σ (registro − Monde) sobre os eventos, como o protótipo (as duas
  // negativas; diferença negativa = falta lançar). As DATAS nomeadas são as das antecipações sem taxa
  // nenhuma no Monde — as pequenas sobras/faltas de outras entram na soma, não na lista.
  const pendentes = d.eventos.filter(e => e.taxaMonde === 0 && e.taxaRegistro !== 0)
  const pendenteTotal = d.eventos.reduce((s, e) => s + (e.taxaRegistro - e.taxaMonde), 0)
  return {
    coberturaPct: d.cobertura.valorMovimentado > 0 ? 1 - d.cobertura.semCentro / d.cobertura.valorMovimentado : 1,
    semCentro: d.cobertura.semCentro,
    registrado,
    identificado,
    naoIdentificadas: d.eventos
      .filter(e => e.identificado < e.valor - 0.005)
      .map(e => ({ data: e.data, conta: e.conta, falta: e.valor - e.identificado, motivo: e.motivo })),
    taxaPendente: pendenteTotal,
    datasTaxaPendente: pendentes.map(e => e.data),
    naoDevolvido,
  }
}

export function montarAnoCentro(d: DreCentroAno, rbEmpresa: number | null): AnoDadosCentro {
  const operacional = porCentro(c => {
    const arv = d.arvores[c]
    const i = indiceUltimoTotalizador(arv)
    return i >= 0 ? arv[i].meses : Array.from({ length: 12 }, () => 0)
  })
  const entrada = { operacional, recebiveis: d.recebiveis, taxaMonde: d.taxaMonde }
  const atr = atribuirAntecipacoes(entrada)
  const fim = mesFimRealizado(d.relacao, d.mes_corrente)
  return {
    ano: d.ano,
    relacao: d.relacao,
    mesCorrente: d.mes_corrente,
    fim,
    parcial: d.relacao === 'corrente',
    porCentro: Object.fromEntries(CENTROS.map(c => [c, montarLinhasCentro(d.arvores[c], c, atr)])) as Record<CentroId, LinhasCentro>,
    rbEmpresa,
    quem: quemCobreQuem(entrada, atr),
    notas: montarNotas(d, atr.naoDevolvidoNoAno),
  }
}
