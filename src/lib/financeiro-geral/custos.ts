// Custos financeiros (v6.4.0) — módulo PURO: agrupamento e composição multi-ano do retorno de
// `get_geral_custos_financeiros`. Sem I/O nem React.
//
// Decisão do Yan (GATE 0): custos financeiros = os CUSTOS por grupo (Cartão, Antecipação, Juros e IOF,
// Tarifas) e, abaixo, Câmbio e Receitas financeiras, FECHANDO no Resultado Financeiro — o mesmo número
// do bloco FIN da DRE. A Taxa do Cartão ENTRA como custo. Categoria nova no FIN sem grupo cai em
// "Não classificado" (bandeja VISÍVEL): a página nunca esconde o que o mapa ainda não sabe classificar.
//
// Sinal da DRE (despesa negativa). "% da RB" = total ÷ Receita Bruta do MESMO ano e recorte — como a
// RB é positiva, o custo sai negativo (−2,1%), igual à grade "Proporção sobre a Receita Bruta" da DRE.
//
// Os NÚMEROS vêm todos da RPC (que usa o predicado do Realizado da DRE, inv. 1). Este módulo só
// reordena, soma o que precisa conferir e rotula — e CONFERE que os grupos fecham no FIN, em vez de
// supor: se um dia não fechar, a tela avisa (a página está errada, nunca a DRE).

import { pctDe, somarCentavos } from './numeros'
import type { CustosFinanceiros, GrupoCustos } from './schemas'
import type { LeituraAno } from './tipos'
import { rotuloDoAno } from './periodo'
import { variacao, type Variacao } from './variacao'

export const ROTULO_GRUPO: Record<string, string> = {
  cartao: 'Cartão',
  antecipacao: 'Antecipação',
  juros_iof: 'Juros e IOF',
  tarifas: 'Tarifas',
  cambio: 'Câmbio',
  receitas_financeiras: 'Receitas financeiras',
  nao_classificado: 'Não classificado',
}

/** Ordem de exibição dos grupos conhecidos. Grupo desconhecido vai depois dos conhecidos do mesmo tipo
 *  (com o `grupo` cru como rótulo) — a seção nunca some por causa de um grupo novo. */
const ORDEM_CUSTO = ['cartao', 'antecipacao', 'juros_iof', 'tarifas']
const ORDEM_OUTROS = ['cambio', 'receitas_financeiras']
const CHAVE_BANDEJA = 'nao_classificado'

/** Tolerância de fechamento: meio centavo (a mesma do zero contábil da DRE). */
const EPS = 0.005

export interface CelulaCusto {
  ano: number
  /** `null` = o ano não carregou (célula "—"). */
  total: number | null
  /** % da Receita Bruta do ano; `null` sem total ou com RB zero. */
  pctRb: number | null
}

export interface LinhaCusto {
  chave: string
  /** `grupo` = linha de grupo; `subtotal` = "Custos financeiros"; `resultado` = "Resultado financeiro". */
  tipo: 'grupo' | 'subtotal' | 'resultado'
  rotulo: string
  /** Grupo da bandeja: a tela o destaca. */
  bandeja: boolean
  celulas: CelulaCusto[]
  /** Categorias do grupo (para expandir e conferir contra a DRE). Vazio nas linhas de total. */
  categorias: LinhaCategoria[]
}

export interface LinhaCategoria {
  chave: string
  rotulo: string
  celulas: CelulaCusto[]
}

export interface ColunaAnoCustos {
  ano: number
  /** "2026*" quando parcial. Ano que falhou usa o número cru. */
  rotulo: string
  /** O ano não carregou. */
  falhou: boolean
}

export interface DivergenciaFechamento {
  ano: number
  /** Grupos × bloco FIN, ou grupos de custo × subtotal "Custos financeiros". */
  tipo: 'grupos-vs-fin' | 'grupos-vs-custos'
  /** Σ grupos − total da RPC. */
  diferenca: number
}

export interface TabelaCustos {
  anos: ColunaAnoCustos[]
  /** Linhas na ordem: grupos de custo, subtotal, grupos "outros", resultado. */
  linhas: LinhaCusto[]
  /** Fechamentos que NÃO bateram (vazio = tudo fecha no FIN). */
  divergencias: DivergenciaFechamento[]
  /** Há categoria do FIN fora de qualquer grupo? (mostrada como linha "Não classificado"). */
  temBandeja: boolean
  /** Algum ano carregado teve lançamento no FIN? (senão a seção é um vazio explicado). */
  temMovimento: boolean
}

const rotuloGrupo = (g: string) => ROTULO_GRUPO[g] ?? g

function posicaoGrupo(g: GrupoCustos): number {
  const lista = g.tipo === 'custo' ? ORDEM_CUSTO : ORDEM_OUTROS
  const i = lista.indexOf(g.grupo)
  if (g.grupo === CHAVE_BANDEJA) return 1000
  return i === -1 ? 500 : i
}

/** Os grupos de um tipo, na ordem de exibição, de todos os anos carregados (união por chave). */
function chavesDoTipo(leituras: readonly CustosFinanceiros[], tipo: GrupoCustos['tipo']): string[] {
  const vistos = new Map<string, GrupoCustos>()
  for (const l of leituras) for (const g of l.grupos) if (g.tipo === tipo && !vistos.has(g.grupo)) vistos.set(g.grupo, g)
  return [...vistos.values()].sort((a, b) => posicaoGrupo(a) - posicaoGrupo(b)).map(g => g.grupo)
}

function celula(ano: number, l: CustosFinanceiros | null, total: number | null): CelulaCusto {
  if (l === null || total === null) return { ano, total: null, pctRb: null }
  return { ano, total, pctRb: pctDe(total, l.receita_bruta.total) }
}

/**
 * A tabela "grupo × ano": uma coluna por ano SELECIONADO (as que falharam entram como coluna com "—",
 * porque aqui cada ano é independente — não há soma entre anos para falsear).
 */
export function comporTabelaCustos(leituras: readonly LeituraAno<CustosFinanceiros>[]): TabelaCustos {
  const ordenadas = [...leituras].sort((a, b) => a.ano - b.ano)
  const carregadas = ordenadas.flatMap(x => (x.leitura.ok ? [x.leitura.dados] : []))
  const porAno = new Map<number, CustosFinanceiros | null>(
    ordenadas.map(x => [x.ano, x.leitura.ok ? x.leitura.dados : null]),
  )

  const anos: ColunaAnoCustos[] = ordenadas.map(x => ({
    ano: x.ano,
    rotulo: x.leitura.ok ? rotuloDoAno(x.ano, x.leitura.dados) : String(x.ano),
    falhou: !x.leitura.ok,
  }))

  const linhaGrupo = (chave: string): LinhaCusto => {
    const noAno = (ano: number) => porAno.get(ano)?.grupos.find(g => g.grupo === chave) ?? null
    // Categorias: união por id entre os anos, na ordem em que aparecem (a RPC as ordena).
    const cats = new Map<number, string>()
    for (const l of carregadas) for (const g of l.grupos) if (g.grupo === chave) for (const c of g.categorias) cats.set(c.categoria_id, c.rotulo)
    return {
      chave,
      tipo: 'grupo',
      rotulo: rotuloGrupo(chave),
      bandeja: chave === CHAVE_BANDEJA,
      // Ano carregado sem este grupo = nenhum lançamento nele = ZERO real (a RPC só emite o que tem).
      celulas: ordenadas.map(({ ano }) => {
        const l = porAno.get(ano) ?? null
        return celula(ano, l, l === null ? null : (noAno(ano)?.total ?? 0))
      }),
      categorias: [...cats.entries()].map(([id, rotulo]) => ({
        chave: `${chave}:${id}`,
        rotulo,
        celulas: ordenadas.map(({ ano }) => {
          const l = porAno.get(ano) ?? null
          const c = noAno(ano)?.categorias.find(x => x.categoria_id === id)
          return celula(ano, l, l === null ? null : (c?.total ?? 0))
        }),
      })),
    }
  }

  const linhaTotal = (tipo: 'subtotal' | 'resultado', rotulo: string, pegar: (l: CustosFinanceiros) => number): LinhaCusto => ({
    chave: tipo,
    tipo,
    rotulo,
    bandeja: false,
    celulas: ordenadas.map(({ ano }) => {
      const l = porAno.get(ano) ?? null
      return celula(ano, l, l === null ? null : pegar(l))
    }),
    categorias: [],
  })

  const linhas: LinhaCusto[] = [
    ...chavesDoTipo(carregadas, 'custo').map(linhaGrupo),
    linhaTotal('subtotal', 'Custos financeiros', l => l.custos.total),
    ...chavesDoTipo(carregadas, 'outros').map(linhaGrupo),
    linhaTotal('resultado', 'Resultado financeiro', l => l.fin.total),
  ]

  const divergencias: DivergenciaFechamento[] = carregadas.flatMap(l => {
    const somaTodos = somarCentavos(l.grupos.map(g => g.total))
    const somaCustos = somarCentavos(l.grupos.filter(g => g.tipo === 'custo').map(g => g.total))
    const out: DivergenciaFechamento[] = []
    if (Math.abs(somaTodos - l.fin.total) > EPS) out.push({ ano: l.ano, tipo: 'grupos-vs-fin', diferenca: somarCentavos([somaTodos, -l.fin.total]) })
    if (Math.abs(somaCustos - l.custos.total) > EPS) out.push({ ano: l.ano, tipo: 'grupos-vs-custos', diferenca: somarCentavos([somaCustos, -l.custos.total]) })
    return out
  })

  return {
    anos,
    linhas,
    divergencias,
    temBandeja: linhas.some(l => l.bandeja),
    // Pelos TOTAIS, não pela presença de grupos: a RPC devolve SEMPRE os 6 grupos curados (com zeros).
    temMovimento: carregadas.some(l => Math.abs(l.fin.total) > EPS || l.grupos.some(g => Math.abs(g.total) > EPS)),
  }
}

/** Δ dos custos do ano contra o mesmo período do ano anterior (despesa negativa: crescer = desfavorável). */
export function variacaoCustos(l: CustosFinanceiros): Variacao {
  return variacao(l.ano_anterior_ytd?.custos, l.custos.total, 'maior-melhor')
}

/** % dos custos financeiros sobre a Receita Bruta do ano (negativo, como na DRE); `null` sem RB. */
export function pctCustosSobreRb(l: CustosFinanceiros): number | null {
  return pctDe(l.custos.total, l.receita_bruta.total)
}
