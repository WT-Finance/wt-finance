// A faixa de 5 indicadores do topo (v6.4.0) — módulo PURO. Monta, de cada seção carregada, o número
// que a diretoria lê primeiro. Sem I/O nem React; os textos saem prontos (testáveis).
//
// Regras de leitura:
//  • Estoque (Inadimplência) e janela móvel (Prazos) IGNORAM as pills de ano. Os três de FLUXO
//    (Antecipações, Prejuízos, Custos) mostram o ano MAIS RECENTE selecionado — o Δ só faz sentido por
//    ano, e várias linhas num tile de faixa desfariam a leitura "de relance". As seções abaixo mostram
//    TODOS os anos selecionados.
//  • Cada indicador degrada sozinho (inv. 8): `erro` (a leitura falhou) e `vazio` (a base não tem o
//    dado ainda) são estados próprios, com mensagem — nunca um zero que parece dado.
//  • Inadimplência = SÓ a marcação (decisão do GATE 1); o contexto é "10 maiores = X%" SEM nome.

import { fmtBRL2, fmtDate } from '@/lib/fmt'
import { fmtPct } from '@/lib/marketing/formatar'
import { diasSemAntecipar, indicadoresDoAno, rotuloDias } from './antecipacoes'
import { pctCustosSobreRb, variacaoCustos } from './custos'
import { diaMes } from './numeros'
import { rotuloReferencia, rotuloDoAno } from './periodo'
import { fmtDias, fmtFolga } from './prazos'
import { resumoDoAno } from './prejuizos'
import { rotuloConcentracao, rotuloPosicao } from './recebiveis'
import type { DadosGeral, LeituraAno } from './tipos'
import { variacao, type Variacao } from './variacao'

export type ChaveIndicador = 'inadimplencia' | 'antecipacoes' | 'prejuizos' | 'custos' | 'prazos'

export interface IndicadorTopo {
  chave: ChaveIndicador
  rotulo: string
  estado: 'ok' | 'vazio' | 'erro'
  /** Texto principal (já formatado); `null` em `vazio`/`erro`. */
  valor: string | null
  /** "na carga de 15/10" / "2026*" / "janela de 12 meses" — o recorte do número. */
  escopo: string | null
  /** Linhas de contexto, já formatadas. */
  apoio: string[]
  variacao: Variacao | null
  /** "vs 2025 (jan–out)" / "vs carga de 15/09". */
  referencia: string | null
  /** Explicação de `vazio`/`erro`. */
  mensagem: string | null
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

const erro = (chave: ChaveIndicador, rotulo: string): IndicadorTopo => ({
  chave, rotulo, estado: 'erro', valor: null, escopo: null, apoio: [], variacao: null, referencia: null,
  mensagem: 'Não foi possível carregar — recarregue a página.',
})

/** A leitura do ano MAIS RECENTE selecionado (`null` se ele não está na lista). */
function leituraDoAnoRecente<T>(leituras: readonly LeituraAno<T>[]): LeituraAno<T> | null {
  return [...leituras].sort((a, b) => b.ano - a.ano)[0] ?? null
}

function inadimplencia(d: DadosGeral): IndicadorTopo {
  const rotulo = 'Inadimplência'
  if (!d.recebiveis.ok) return erro('inadimplencia', rotulo)
  const r = d.recebiveis.dados
  if (r.carga === null) {
    return {
      chave: 'inadimplencia', rotulo, estado: 'vazio', valor: null, escopo: null, apoio: [], variacao: null,
      referencia: null, mensagem: 'A base de contas a receber ainda não teve carga.',
    }
  }
  const apoio: string[] = [r.inadimplente.n === 0 ? 'Nenhum título marcado' : `${plural(r.inadimplente.n, 'título marcado', 'títulos marcados')}`]
  const conc = rotuloConcentracao(r.concentracao.pct_top, r.inadimplente.n)
  if (conc) apoio.push(conc)
  return {
    chave: 'inadimplencia', rotulo, estado: 'ok',
    valor: fmtBRL2(r.inadimplente.valor),
    escopo: rotuloPosicao(r.carga.data_posicao),
    apoio,
    // Estoque que se quer menor: subir é desfavorável. Contra a carga do fim do mês anterior.
    variacao: r.comparativo ? variacao(r.comparativo.inadimplente_valor, r.inadimplente.valor, 'menor-melhor') : null,
    referencia: r.comparativo ? `vs carga de ${diaMes(r.comparativo.data_posicao)}` : null,
    mensagem: null,
  }
}

function antecipacoes(d: DadosGeral): IndicadorTopo {
  const rotulo = 'Antecipações'
  const x = leituraDoAnoRecente(d.antecipacoes)
  if (!x || !x.leitura.ok) return erro('antecipacoes', rotulo)
  const l = x.leitura.dados
  const i = indicadoresDoAno(l)
  const dias = diasSemAntecipar(l, d.hoje)
  const apoio = [plural(i.n, 'antecipação', 'antecipações')]
  apoio.push(dias === null ? 'Nenhuma antecipação registrada' : `Última ${dias === 0 ? rotuloDias(0) : `há ${rotuloDias(dias)}`}`)
  return {
    chave: 'antecipacoes', rotulo, estado: 'ok',
    valor: fmtBRL2(i.volume),
    escopo: rotuloDoAno(l.ano, l),
    apoio,
    variacao: i.deltaVolume,
    referencia: `vs ${rotuloReferencia(l.ano - 1, l)}`,
    mensagem: null,
  }
}

function prejuizos(d: DadosGeral): IndicadorTopo {
  const rotulo = 'Prejuízos'
  const x = leituraDoAnoRecente(d.prejuizos)
  if (!x || !x.leitura.ok) return erro('prejuizos', rotulo)
  const l = x.leitura.dados
  const r = resumoDoAno(l)
  return {
    chave: 'prejuizos', rotulo, estado: 'ok',
    valor: fmtBRL2(r.prejuizo),
    escopo: r.rotulo,
    apoio: [`Recuperado ${fmtBRL2(r.reversao)}`, `Líquido ${fmtBRL2(r.liquido)}`],
    variacao: r.deltaPrejuizo,
    referencia: `vs ${rotuloReferencia(l.ano - 1, l)}`,
    mensagem: null,
  }
}

function custos(d: DadosGeral): IndicadorTopo {
  const rotulo = 'Custos financeiros'
  const x = leituraDoAnoRecente(d.custos)
  if (!x || !x.leitura.ok) return erro('custos', rotulo)
  const l = x.leitura.dados
  const pct = pctCustosSobreRb(l)
  return {
    chave: 'custos', rotulo, estado: 'ok',
    valor: fmtBRL2(l.custos.total),
    escopo: rotuloDoAno(l.ano, l),
    apoio: [pct === null ? '% da RB indisponível' : `${fmtPct(pct)} da RB`],
    variacao: variacaoCustos(l),
    referencia: `vs ${rotuloReferencia(l.ano - 1, l)}`,
    mensagem: null,
  }
}

function prazos(d: DadosGeral): IndicadorTopo {
  const rotulo = 'Prazos médios'
  if (!d.prazos.ok) return erro('prazos', rotulo)
  const a = d.prazos.dados.atual
  if (a === null) {
    return {
      chave: 'prazos', rotulo, estado: 'vazio', valor: null, escopo: null, apoio: [], variacao: null,
      referencia: null, mensagem: 'Ainda não há foto dos prazos.',
    }
  }
  return {
    chave: 'prazos', rotulo, estado: 'ok',
    // O destaque é a FOLGA (PMP − PMR): quantos dias o caixa fica entre receber e pagar.
    valor: fmtFolga(a.folga),
    escopo: `janela de 12 meses · foto de ${fmtDate(a.data)}`,
    apoio: [`PMR ${fmtDias(a.pmr)}`, `PMP ${fmtDias(a.pmp)}`],
    variacao: null,
    referencia: null,
    mensagem: null,
  }
}

/** Os 5 indicadores, na ordem das seções da página. */
export function faixaDoTopo(d: DadosGeral): IndicadorTopo[] {
  return [inadimplencia(d), antecipacoes(d), prejuizos(d), custos(d), prazos(d)]
}
