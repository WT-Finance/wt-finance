// A faixa de 3 indicadores do topo (v6.5.0) — módulo PURO. Monta, de cada seção carregada, o número que
// a diretoria lê primeiro. Sem I/O nem React; os textos saem prontos (testáveis).
//
// Um tile por seção COM conteúdo, na ordem das seções da página (Vendas e Cartões ganham tile quando
// forem preenchidas — nunca um tile vazio):
//  • Inadimplência — valor na posição da carga (estoque, ignora as pills) e Δ contra a referência da semana;
//  • Prejuízos — o bruto do ano CORRENTE e o Δ contra o mesmo período do ano anterior;
//  • Antecipações — tile dividido: custo efetivo do ano corrente (R$ e %) | dias sem antecipação (global).
//
// Prejuízos e Antecipações leem `d.corrente` (a leitura do ano corrente, carregada sempre): o topo não muda
// com as pills. Cada indicador degrada sozinho (inv. 11): `erro` (a leitura falhou) e `vazio` (a base não
// tem o dado ainda) são estados próprios, com mensagem — nunca um zero que parece dado, nem o número de
// OUTRO ano em silêncio.

import { fmtBRL2, fmtDate } from '@/lib/fmt'
import { custoPorAno, diasSemAntecipacao, fmtCustoPct, rotuloDias } from './antecipacoes'
import { leituraDoAnoCorrente } from './composicao'
import { recorteTexto } from './periodo'
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
  /** "em 15/10" / "2026*" — o recorte do número. */
  escopo: string | null
  /** Linhas de contexto, já formatadas. */
  apoio: string[]
  variacao: Variacao | null
  /** "vs 08/10" / "vs 2025 (jan–out)". */
  referencia: string | null
  /** Explicação de `vazio`/`erro`. */
  mensagem: string | null
  /** Só no tile de Antecipações: duas metades lado a lado (esquerda = custo efetivo do ano corrente, direita =
   *  dias sem antecipar), cada uma com o seu estado. `valor`/`escopo`/`apoio` ficam vazios nele. Quando as
   *  duas falham juntas (ou ficam sem dado juntas), `estado` do tile assume isso e a UI desenha o tile comum. */
  metades?: readonly [MetadeTopo, MetadeTopo]
}

/** Uma metade de tile dividido: rótulo curto, valor, linhas pequenas embaixo e estado próprio. */
export interface MetadeTopo {
  rotulo: string
  estado: 'ok' | 'vazio' | 'erro'
  /** Texto principal já formatado; `null` em `vazio`/`erro`. */
  valor: string | null
  /** Linhas pequenas abaixo do valor (o custo %; "Última em DD/MM/AAAA"). */
  apoio: string[]
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
  return {
    chave: 'inadimplencia', rotulo, estado: 'ok',
    valor: fmtBRL2(r.inadimplente.valor),
    escopo: rotuloPosicao(r.carga.data_posicao),
    apoio: [r.inadimplente.n === 0 ? 'Nenhum título marcado' : plural(r.inadimplente.n, 'título marcado', 'títulos marcados')],
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
    // "vs 2025*": o `*` = o mesmo período do ano anterior (o formato de Antecipações e de Marketing); só
    // neste tile — a seção de Prejuízos segue com `resumoDoAno().referencia` ("vs 2025 (jan–out)").
    referencia: `vs ${l.ano - 1}${recorteTexto(l) ? '*' : ''}`,
    mensagem: null,
  }
}

const MENSAGEM_ERRO = 'Não foi possível carregar — recarregue a página.'

const metadeErro = (): MetadeTopo => ({ rotulo: '', estado: 'erro', valor: null, apoio: [], mensagem: MENSAGEM_ERRO })
const metadeVazia = (rotulo: string, mensagem: string): MetadeTopo => ({ rotulo, estado: 'vazio', valor: null, apoio: [], mensagem })

/** Esquerda: o custo efetivo do ano CORRENTE (a fórmula única — `custoPorAno` → `custoDoRecorte`), com o % embaixo. */
function metadeDoCusto(d: DadosGeral): MetadeTopo {
  const x = leituraDoAnoCorrente([d.corrente.antecipacoes], d.hoje)
  if (x === null) return metadeVazia('Custo efetivo', 'Sem leitura do ano corrente.')
  if (!x.leitura.ok) return { ...metadeErro(), rotulo: 'Custo efetivo' }
  const [l] = custoPorAno([x]).linhas
  const rotulo = `Custo efetivo ${l.rotulo}`
  // Ausência não é zero: sem antecipação no ano, nunca "R$ 0,00 · 0,00%".
  if (l.semAntecipacao) return metadeVazia(rotulo, `Sem antecipação em ${l.ano}.`)
  return { rotulo, estado: 'ok', valor: fmtBRL2(l.custo.efetivo), apoio: [fmtCustoPct(l.custo.pct)], mensagem: null }
}

/** Direita: os dias sem antecipar (global — a última antecipação de qualquer conta/ano) e a data da última. */
function metadeDosDias(d: DadosGeral): MetadeTopo {
  const x = diasSemAntecipacao([d.corrente.antecipacoes], d.hoje)
  if (x.estado === 'erro') return { ...metadeErro(), rotulo: 'Dias sem antecipar' }
  if (x.estado === 'sem-registro' || x.dias === null || x.ultimaData === null) {
    return metadeVazia('Dias sem antecipar', 'Nenhuma antecipação registrada.')
  }
  return {
    // "35 dias · sem antecipar"; no próprio dia, "hoje · última antecipação".
    rotulo: x.dias === 0 ? 'Última antecipação' : 'Sem antecipar',
    estado: 'ok',
    valor: rotuloDias(x.dias),
    apoio: [`Última em ${fmtDate(x.ultimaData)}`],
    mensagem: null,
  }
}

function antecipacoes(d: DadosGeral): IndicadorTopo {
  const metades: [MetadeTopo, MetadeTopo] = [metadeDoCusto(d), metadeDosDias(d)]
  const [a, b] = metades
  // As duas metades concordam num estado não-ok (as duas falharam / as duas sem dado): o tile inteiro assume
  // esse estado e a mensagem (uma só, em vez de duas iguais em meio tile). Senão cada metade se desenha e
  // degrada sozinha.
  const estado = a.estado === b.estado ? a.estado : 'ok'
  return {
    chave: 'antecipacoes', rotulo: 'Antecipações', estado,
    valor: null, escopo: null, apoio: [], variacao: null, referencia: null,
    mensagem: estado === 'ok' ? null : b.mensagem,
    metades,
  }
}

/** Os 3 indicadores, na ordem das seções da página. */
export function faixaDoTopo(d: DadosGeral): IndicadorTopo[] {
  return [inadimplencia(d), prejuizos(d), antecipacoes(d)]
}
