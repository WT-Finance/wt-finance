// A faixa de 3 indicadores do topo (v6.5.0) — módulo PURO. Monta, de cada seção carregada, o número que
// a diretoria lê primeiro. Sem I/O nem React; os textos saem prontos (testáveis).
//
// Um tile por seção COM conteúdo, na ordem das seções da página (Vendas e Cartões ganham tile quando
// forem preenchidas — nunca um tile vazio):
//  • Inadimplência — valor na posição da carga (estoque, ignora as pills) e Δ contra a referência da semana;
//  • Prejuízos — o bruto do ano CORRENTE e o Δ contra o mesmo período do ano anterior;
//  • Antecipações — dias sem antecipação (global; não depende das pills).
//
// Prejuízos e Antecipações leem `d.corrente` (a leitura do ano corrente, carregada sempre): o topo não muda
// com as pills. Cada indicador degrada sozinho (inv. 11): `erro` (a leitura falhou) e `vazio` (a base não
// tem o dado ainda) são estados próprios, com mensagem — nunca um zero que parece dado, nem o número de
// OUTRO ano em silêncio.

import { fmtBRL2, fmtDate } from '@/lib/fmt'
import { fmtPct } from '@/lib/marketing/formatar'
import { diasSemAntecipacao, rotuloDias } from './antecipacoes'
import { leituraDoAnoCorrente } from './composicao'
import { resumoDoAno } from './prejuizos'
import { funilDosRecebiveis, rotuloPosicao } from './recebiveis'
import type { DadosGeral } from './tipos'
import type { Variacao } from './variacao'

export type ChaveIndicador = 'inadimplencia' | 'prejuizos' | 'antecipacoes'

export interface IndicadorTopo {
  chave: ChaveIndicador
  rotulo: string
  estado: 'ok' | 'vazio' | 'erro'
  /** Texto principal (já formatado); `null` em `vazio`/`erro`. */
  valor: string | null
  /** "na carga de 15/10" / "2026*" / "desde a última antecipação" — o recorte do número. */
  escopo: string | null
  /** Linhas de contexto, já formatadas. */
  apoio: string[]
  variacao: Variacao | null
  /** "vs 08/10" / "vs 2025 (jan–out)". */
  referencia: string | null
  /** Explicação de `vazio`/`erro`. */
  mensagem: string | null
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

const erro = (chave: ChaveIndicador, rotulo: string): IndicadorTopo => ({
  chave, rotulo, estado: 'erro', valor: null, escopo: null, apoio: [], variacao: null, referencia: null,
  mensagem: 'Não foi possível carregar — recarregue a página.',
})

const vazio = (chave: ChaveIndicador, rotulo: string, mensagem: string): IndicadorTopo => ({
  chave, rotulo, estado: 'vazio', valor: null, escopo: null, apoio: [], variacao: null, referencia: null, mensagem,
})

function inadimplencia(d: DadosGeral): IndicadorTopo {
  const rotulo = 'Inadimplência'
  if (!d.recebiveis.ok) return erro('inadimplencia', rotulo)
  const r = d.recebiveis.dados
  if (r.carga === null) return vazio('inadimplencia', rotulo, 'A base de contas a receber ainda não teve carga.')

  const f = funilDosRecebiveis(r)
  const apoio = [r.inadimplente.n === 0 ? 'Nenhum título marcado' : plural(r.inadimplente.n, 'título marcado', 'títulos marcados')]
  if (f.inadimplente.pctDosVencidos !== null) apoio.push(`${fmtPct(f.inadimplente.pctDosVencidos)} dos vencidos`)
  return {
    chave: 'inadimplencia', rotulo, estado: 'ok',
    valor: fmtBRL2(r.inadimplente.valor),
    escopo: rotuloPosicao(r.carga.data_posicao),
    apoio,
    // Sem referência (sem foto na semana anterior), o Δ some: nem valor nem rótulo.
    variacao: f.referencia ? f.inadimplente.delta : null,
    referencia: f.referencia?.rotulo ?? null,
    mensagem: null,
  }
}

function prejuizos(d: DadosGeral): IndicadorTopo {
  const rotulo = 'Prejuízos'
  const x = leituraDoAnoCorrente([d.corrente.prejuizos], d.hoje)
  if (x === null) return vazio('prejuizos', rotulo, 'Sem leitura do ano corrente.')
  if (!x.leitura.ok) return erro('prejuizos', rotulo)
  const l = x.leitura.dados
  const r = resumoDoAno(l)
  const lancamentos = l.por_pessoa.reduce((s, p) => s + p.n, 0)
  return {
    chave: 'prejuizos', rotulo, estado: 'ok',
    valor: fmtBRL2(r.prejuizo),
    escopo: r.rotulo,
    apoio: [lancamentos === 0 ? 'Nenhum lançamento' : plural(lancamentos, 'lançamento', 'lançamentos')],
    variacao: r.deltaPrejuizo,
    referencia: r.referencia,
    mensagem: null,
  }
}

function antecipacoes(d: DadosGeral): IndicadorTopo {
  const rotulo = 'Antecipações'
  const x = diasSemAntecipacao([d.corrente.antecipacoes], d.hoje)
  if (x.estado === 'erro') return erro('antecipacoes', rotulo)
  if (x.estado === 'sem-registro' || x.dias === null || x.ultimaData === null) {
    return vazio('antecipacoes', rotulo, 'Nenhuma antecipação registrada.')
  }
  const apoio = [`Última em ${fmtDate(x.ultimaData)}`]
  if (x.maiorIntervalo && x.anoDoMaiorIntervalo !== null) {
    apoio.push(`Maior intervalo de ${x.anoDoMaiorIntervalo}: ${rotuloDias(x.maiorIntervalo.dias)}`)
  }
  return {
    chave: 'antecipacoes', rotulo, estado: 'ok',
    valor: rotuloDias(x.dias),
    // "35 dias · sem antecipar"; no próprio dia, "hoje · última antecipação".
    escopo: x.dias === 0 ? 'última antecipação' : 'sem antecipar',
    apoio,
    variacao: null,
    referencia: null,
    mensagem: null,
  }
}

/** Os 3 indicadores, na ordem das seções da página. */
export function faixaDoTopo(d: DadosGeral): IndicadorTopo[] {
  return [inadimplencia(d), prejuizos(d), antecipacoes(d)]
}
