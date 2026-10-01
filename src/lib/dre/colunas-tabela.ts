// ── Colunas e valores da tabela do DRE — módulo PURO (v6.1.1 · M4) ─────────────
//
// Estas funções MORARAM em `tabela-dre.tsx` até a v6.1.0 e foram movidas para cá SEM
// alterar o corpo de nenhuma, para ter DOIS consumidores sobre a MESMA fonte: a tabela
// (que renderiza) e o export para Excel (`./exportar`). Cabeçalho e valor da planilha
// saem destas mesmas funções — "o que a tela mostra na coluna é o que a planilha mostra"
// por construção, e não por um segundo cálculo que alguém teria de manter igual.
//
// Puro de propósito: sem React, sem DOM, sem `next/*`. É isso que deixa o export
// testável no vitest sem arrastar o componente 'use client' junto.
//
// Os comentários de cada função são os ORIGINAIS da tabela (decisões de rodadas
// anteriores); o contexto de UI deles (toggles, sticky) segue documentado em
// `tabela-dre.tsx`.

import type { DreMensalLike, ConsolidadoAno, RegistroAnoLinha } from './schemas'

export type Relacao   = DreMensalLike['relacao']
/** Modo de exibição do "Total do ano" (Refino 8) — ver bullet no topo de `tabela-dre.tsx`. */
export type TotalModo = 'realizado' | 'tudo'

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function soma(valores: number[]): number {
  return valores.reduce((acc, v) => acc + v, 0)
}

/** Monta as colunas mensais de EXIBIÇÃO a partir do payload cru: em 'fechado'/'futuro'
 *  os 12 `meses` bastam; em 'corrente' COM `incluirPrevCorrente` (totalModo 'tudo'),
 *  insere `prev_corrente` logo após o mês corrente (a 2ª coluna do mês híbrido) —
 *  12+1 = 13 colunas. Em 'corrente' SEM `incluirPrevCorrente` (totalModo 'realizado',
 *  Refino 12/item 6) devolve os 12 `meses` CRUS, sem inserir nada — o mês corrente
 *  aparece só com o que já aconteceu (`meses[mesCorrente-1]`), sem a coluna de
 *  projeção do restante do mês. `mesCorrente` é 1-based; os meses
 *  ANTES-E-INCLUINDO ele (índices 0..mesCorrente-1) são realizado, os DEPOIS
 *  (mesCorrente..11) já vêm previsto do payload — em AMBOS os casos. */
export function construirValores(
  meses: number[],
  prevCorrente: number | null | undefined,
  relacao: Relacao,
  mesCorrente: number | null,
  incluirPrevCorrente: boolean,
): number[] {
  if (relacao === 'corrente' && mesCorrente != null) {
    if (!incluirPrevCorrente) return meses
    return [...meses.slice(0, mesCorrente), prevCorrente ?? 0, ...meses.slice(mesCorrente)]
  }
  return meses
}

/** Como as colunas de PREVISTO da visão Mensal aparecem:
 *  · 'aberto'    — uma coluna por mês (comportamento padrão);
 *  · 'colapsado' — só a do MÊS CORRENTE (toggle ««»; rodada 4/Refino 6 — antes era a
 *                  SOMA de tudo a partir de `idxPrevisto`, sob o rótulo "«Mês»·P–Dez";
 *                  hoje o rótulo dela é o "«Mês»·PREV" de sempre, rodada 5/Refino 1);
 *  · 'oculto'    — nenhuma coluna de previsto (modo 'realizado', rodada 3/Refino 5). */
export type ModoPrevisto = 'aberto' | 'colapsado' | 'oculto'

/** Recorta as colunas conforme o `ModoPrevisto` — GENÉRICO porque serve aos VALORES e
 *  aos RÓTULOS (2ª linha do cabeçalho) com o MESMO corte: os dois PRECISAM andar
 *  juntos, senão rótulo e valor escorregam de coluna. Antes eram duas funções gêmeas
 *  (`colunasVisiveis`/`rotulosVisiveis`); desde o Refino 6 (rodada 4) a coluna
 *  recolhida deixou de ser uma SOMA e virou um recorte puro, então o corte é
 *  literalmente o mesmo dos dois lados — unificar é o que torna o alinhamento
 *  estrutural, não uma disciplina de edição.
 *   · 'colapsado' — mantém até `idxPrevisto` INCLUSIVE: a única coluna de previsto que
 *     sobra é a do MÊS CORRENTE ("«Mês»·PREV" = `prev_corrente`, que ocupa exatamente esse
 *     índice), NÃO a soma do previsto até dezembro. O índice do corte não muda, então
 *     o fundo âmbar e a régua de `corte` (decididos por ÍNDICE em `LinhaDreTr`/
 *     `LinhaBandejaTr`) não precisam de ramo extra. Guarda `idxPrevisto >= itens.length`:
 *     sem NENHUMA coluna de previsto não há o que recolher (e o `slice` inventaria uma
 *     coluna fantasma).
 *   · 'oculto' — corta tudo a partir de `idxPrevisto`: em 'fechado' o índice é
 *     +Infinity (nada é cortado — ano fechado é 100% realizado), em 'futuro' é 0 (não
 *     sobra coluna nenhuma: nada aconteceu ainda). */
export function recortarPrevisto<T>(itens: T[], modo: ModoPrevisto, idxPrevisto: number): T[] {
  if (modo === 'oculto') return itens.slice(0, idxPrevisto)
  if (modo === 'aberto' || idxPrevisto >= itens.length) return itens
  return itens.slice(0, idxPrevisto + 1)
}

/** Índice (0-based) da 1ª coluna mensal de PREVISTO, por relação. Extraído de
 *  `TabelaDre` na v6.1.1 para a tabela e o export decidirem o corte pela MESMA conta. */
export function idxPrevistoDe(relacao: Relacao, mesCorrente: number | null): number {
  return relacao === 'corrente' ? (mesCorrente ?? Number.POSITIVE_INFINITY) :
    relacao === 'futuro'        ? 0 :
    Number.POSITIVE_INFINITY // 'fechado'
}

/** Modo do previsto na visão Mensal — extraído de `TabelaDre` (v6.1.1), regra idêntica:
 *  o modo 'realizado' esconde TODO o previsto, EXCETO em ano 'fechado' (ali não existe
 *  previsto algum para esconder, os dois modos mostram as mesmas 12 colunas). Fora isso,
 *  só o toggle `previstoAberto` (estado de UI) pode recolher. O export passa
 *  `previstoAberto = true`: toggle de colapso é estado de tela, e a planilha leva tudo. */
export function modoPrevistoDe(totalModo: TotalModo, relacao: Relacao, previstoAberto: boolean): ModoPrevisto {
  if (totalModo === 'realizado' && relacao !== 'fechado') return 'oculto'
  if (relacao === 'corrente' && !previstoAberto) return 'colapsado'
  return 'aberto'
}

/** Sufixos do MÊS HÍBRIDO (rodada 5/Refino 1) — por EXTENSO, não mais as iniciais
 *  "·R"/"·P": o cabeçalho é `uppercase` por CSS, então saem "JUL·REAL" / "JUL·PREV",
 *  que se explicam sozinhos e ecoam os nomes das pills de modo. Constantes porque o
 *  sufixo aparece nas DUAS colunas do par e a coluna ·PREV é também a que sobra quando
 *  o previsto é recolhido (`recortarPrevisto`) — um sufixo divergente ali seria a
 *  mesma coluna com dois nomes. */
export const SUF_REAL = '·REAL'
export const SUF_PREV = '·PREV'

/** Rótulos das colunas mensais em 'corrente': COM `incluirPrevCorrente` (totalModo
 *  'tudo'), 13 rótulos — meses antes do corrente + "«Mês»·REAL" (o próprio mês
 *  corrente, realizado) + "«Mês»·PREV" (mesma competência, previsto) + os meses
 *  restantes. SEM `incluirPrevCorrente` (totalModo 'realizado', Refino 12/item 6),
 *  os 12 meses PUROS — o mês corrente some para "«Mês»" só (sem sufixo: não há mais
 *  o par ·REAL/·PREV para distinguir). */
export function labelsCorrente(mesCorrente: number, incluirPrevCorrente: boolean): string[] {
  if (!incluirPrevCorrente) return MESES
  const atual = MESES[mesCorrente - 1]
  return [
    ...MESES.slice(0, mesCorrente - 1),
    `${atual}${SUF_REAL}`,
    `${atual}${SUF_PREV}`,
    ...MESES.slice(mesCorrente),
  ]
}

/** Rótulo e posição das colunas mensais VISÍVEIS (2ª linha do cabeçalho da visão Mensal):
 *  o MESMO recorte que `recortarPrevisto` aplica aos valores. Extraído de `TabelaDre`
 *  na v6.1.1 (era inline), sem mudar a conta. */
export function rotulosMensais(
  relacao: Relacao,
  mesCorrente: number | null,
  incluirPrevCorrente: boolean,
  modoPrevisto: ModoPrevisto,
  idxPrevisto: number,
): string[] {
  return recortarPrevisto(
    relacao === 'corrente' && mesCorrente != null ? labelsCorrente(mesCorrente, incluirPrevCorrente) : MESES,
    modoPrevisto,
    idxPrevisto,
  )
}

/** Rótulo da coluna de total da visão Mensal (rodada 4/Refino 7). "Total previsto" avisa
 *  que o número INCLUI projeção — e explica a soma das colunas visíveis não bater com ele
 *  quando o previsto está recolhido (Refino 6, só sobra o do mês corrente). Em ano
 *  'fechado' não há projeção alguma: o rótulo continua "Total do ano" (mesmo critério do
 *  "TOTAL «yn»" da Consolidado num ano fechado). Extraído de `TabelaDre` na v6.1.1. */
export function rotuloTotalAno(totalModo: TotalModo, relacao: Relacao): string {
  const totalComPrevisto = totalModo === 'tudo' && relacao !== 'fechado'
  return totalComPrevisto ? 'Total previsto' : 'Total do ano'
}

/** Totais dos anos seguintes (ano+1/ano+2) por linha — prop injetada pela página (ver
 *  bullet no topo de `tabela-dre.tsx`). `totais` é indexado pela MESMA chave que
 *  `chaveLinha` deriva de cada linha. */
export interface AnoSeguinteDados {
  ano: number
  totais: Record<string, number>
}

/** Campo de `RegistroAnoLinha` que uma coluna exibe. 'prev' é derivado
 *  (`total − ytd`) e só é oferecido quando o ano é o CORRENTE — ver `ConsolidadoAno`. */
export type CampoAno = 'total' | 'ytd' | 'venc' | 'prev'

/** Em qual grupo da 1ª linha do cabeçalho a coluna cai (ver `TabelaConsolidada`).
 *  'venc' é uma faixa PRÓPRIA, sem rótulo, entre "Realizado" e "Previsto" (rodada
 *  5/Refino 2): vencido não é projeção nem realizado — é uma terceira natureza. */
export type GrupoCons = 'comp' | 'venc' | 'prev' | 'total'

/** Escala de fundo de uma célula de valor — resolvida por NÍVEL de linha nos mapas
 *  `BG_PREVISTO` (âmbar) e `BG_VENCIDO` (vermelho) de `tabela-dre.tsx`; 'normal' usa o
 *  fundo da própria linha. Um tri-estado, e não dois booleanos: 'previsto' e 'vencido' são
 *  MUTUAMENTE exclusivos, e a combinação impossível não deve nem ser representável. */
export type FundoCelula = 'normal' | 'previsto' | 'vencido'

/** Descritor de UMA coluna da visão Consolidado. O conjunto de colunas é DINÂMICO (um
 *  grupo por ano marcado), então cabeçalho e células são gerados do MESMO array —
 *  rótulo e valor não têm como divergir por edição de um lado só. */
export type ColunaCons =
  | {
      k: 'valor'
      id: string
      rotulo: string
      /** De qual ano marcado o valor sai. */
      ano: number
      campo: CampoAno
      /** Escala de fundo da coluna (normal · âmbar de projeção · vermelho de vencido). */
      fundo: FundoCelula
      /** Régua grossa de 2px à ESQUERDA da célula — fronteira entre faixas de natureza
       *  (realizado → vencidos → previsto). Duas colunas seguidas com `corte` é o que
       *  cerca VENCIDOS dos dois lados (rodada 5/Refino 2). */
      corte: boolean
      /** Régua fina + peso do "Total". */
      totalAno: boolean
      grupo: GrupoCons
      classe: string
      titulo: string
    }
  | {
      k: 'delta'
      id: string
      rotulo: string
      /** Δ% do YTD de `de` para o YTD de `para`. */
      de: number
      para: number
      grupo: GrupoCons
      classe: string
      titulo: string
    }
  | {
      /** Análise Vertical (v5.7.0) — % da linha sobre a ROL do MESMO ano e do MESMO
       *  campo. Não é uma variante de 'valor' porque não tem fundo, corte nem
       *  totalAno: é uma coluna subordinada, e representá-la como 'valor' obrigaria a
       *  carregar quatro campos que nunca se aplicam. */
      k: 'av'
      id: string
      rotulo: string
      /** Ano cuja composição a coluna descreve. */
      ano: number
      /** Numerador E denominador saem deste mesmo campo — é o que mantém a AV falando
       *  do mesmo recorte que a coluna de valor à esquerda. */
      campo: CampoAno
      grupo: GrupoCons
      classe: string
      titulo: string
    }

/** Valor de uma coluna para uma linha. `undefined` no mapa = a linha NÃO EXISTE naquele
 *  ano (a estrutura mudou entre os anos) → devolve `null` = AUSÊNCIA, que a célula
 *  mostra como travessão. Nunca 0: zero é informação (não houve movimento), ausência é
 *  outra coisa (a conta nem existia) — inventar 0 aqui produziria um Δ% falso. */
export function valorCons(reg: RegistroAnoLinha | undefined, campo: CampoAno): number | null {
  if (reg === undefined) return null
  if (campo === 'prev') return reg.total - reg.ytd
  return reg[campo]
}

/** Δ% (em pontos percentuais) do YTD de A para o de B. `null` → travessão quando falta
 *  um dos lados (ausência) ou quando o denominador é ZERO: variação sobre zero é
 *  indefinida, nunca Infinity/NaN na tela. O teste de zero usa o MESMO epsilon do zero
 *  contábil (`fmtContabil`, 0,005) — uma célula que se EXIBE como travessão não pode
 *  gerar um "+9.999.900,0%" a partir de resíduo de ponto flutuante.
 *  Denominador em MÓDULO (decisão firmada): sair de prejuízo para lucro tem de ler como
 *  MELHORA (+118,2%), não como piora. */
export function deltaYtd(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null
  if (Math.abs(a) < 0.005) return null
  return ((b - a) / Math.abs(a)) * 100
}

/** "Total do ano" por MODO (Refino 8): 'tudo' é o `total` do PAYLOAD (Σ meses +
 *  `prev_corrente`, como a RPC já entrega — comportamento ORIGINAL, default).
 *  'realizado' soma só a parte JÁ ACONTECIDA, a partir dos `meses` crus (NUNCA do
 *  `prev_corrente`, que é 100% projeção): 'fechado' → os 12 meses (tudo realizado);
 *  'corrente' → só `meses[0..mesCorrente-1]` (o mês corrente entra pela fatia
 *  realizada-até-a-data-base; exclui a `prev_corrente` e os meses futuros); 'futuro' →
 *  0 (nada aconteceu ainda). Vale para blocos/categorias E bandeja (mesma forma). As
 *  colunas de ANOS SEGUINTES (Refino 7) NÃO passam por aqui — são previsto por
 *  natureza (projeção pura, a mesma base independente do modo escolhido nesta
 *  coluna). A visão Consolidado TAMBÉM não passa por aqui: lá o YTD de CADA ano
 *  marcado vem pronto do payload (`porLinha[k].ytd`, todos na mesma janela) — inclusive
 *  o do ano de referência, que pode nem ser o ano cujas `linhas` estão em tela. */
export function totalDoAno(
  meses: number[],
  total: number,
  totalModo: TotalModo,
  relacao: Relacao,
  mesCorrente: number | null,
): number {
  if (totalModo === 'tudo') return total
  if (relacao === 'futuro') return 0
  if (relacao === 'corrente' && mesCorrente != null) return soma(meses.slice(0, mesCorrente))
  return soma(meses) // 'fechado' (ou 'corrente' sem mes_corrente informado — trata como realizado)
}

/** O que a coluna "AV" quer dizer. Vive no `title` das `th` (nas duas visões) porque o
 *  cabeçalho já usa esse idioma para a coluna de total, e um balão posicionado seria
 *  recortado pelo `overflow-x` do container que rola. */
export const TITULO_AV =
  'AV — Análise Vertical: % sobre a Receita Bruta de Vendas do mesmo período. ' +
  'As linhas ACIMA da Receita Bruta não têm AV: elas são as parcelas que a formam, não parte dela.'

/** Janela do YTD em texto ("jan a jul") para os `title` do cabeçalho — clampada, para
 *  um `mesJanela` fora de 1..12 nunca virar "jan a undefined". Extraída de `TabelaDre`
 *  na v6.1.1 (era inline), sem mudar a conta. */
export function janelaTextoDe(mesJanela: number): string {
  return `jan a ${MESES[Math.min(Math.max(mesJanela, 1), 12) - 1].toLowerCase()}`
}

/** Últimos 2 dígitos do ano — "2026" → "26" (rótulos compactos da visão Consolidado). */
export function anoCurto(a: number): string {
  return String(a).slice(-2)
}

/** Monta as colunas da visão Consolidado a partir dos anos MARCADOS (ascendente, ao
 *  menos 1 — vazio devolve vazio) e do MODO (rodada 4/Refino 4). Sendo y1<…<yn:
 *   · para cada yi com i<n (anos de COMPARAÇÃO): "«yi»" (ano cheio) · "YTD «aa»" ·
 *     "Δ% YTD «aa»·«aa+1»" (variação do YTD de yi para o do PRÓXIMO marcado — encadeada,
 *     não todos contra o de referência: é assim que se lê a evolução ano a ano);
 *   · para yn (REFERÊNCIA): "YTD «aa»" e, SÓ no modo 'tudo', "VENCIDOS" e "PREV «aa»"
 *     (= total − YTD) quando yn é o ano CORRENTE, mais a coluna de TOTAL. VENCIDOS vem
 *     ANTES de PREV e em faixa própria no cabeçalho (rodada 5/Refino 2): a leitura da
 *     esquerda para a direita passa a ser "o que entrou → o que já venceu e não entrou →
 *     o que ainda vai vencer → o total", que é a ordem cronológica do risco.
 *  No modo 'realizado' não há previsto nem coluna de TOTAL: num ano CORRENTE o "total
 *  realizado" É o YTD ao lado, e uma segunda coluna com o mesmo número é ruído (foi o
 *  motivo dado pelo Yan). Num ano FECHADO, porém, o ano cheio ≠ YTD (jan..dez × jan..mês
 *  corrente) e esconder o número perderia informação REAL — por isso a referência fechada
 *  ganha, no modo 'realizado', a MESMA coluna de ano cheio que os anos de comparação já
 *  têm, na mesma posição (antes do YTD) e com o mesmo rótulo "«ano»". Assim o conjunto
 *  fica simétrico: todo ano marcado se apresenta igual, e o que some é só a duplicata.
 *  Num ano fechado, `total − ytd` seria realizado de ago..dez — por isso PREV/VENCIDOS
 *  não existem ali, o TOTAL fica com o fundo NORMAL (nada de âmbar de projeção) e o
 *  rótulo continua "TOTAL «yn»" em vez de "TOTAL PREVISTO". */
export function montarColunasCons(sel: ConsolidadoAno[], janelaTexto: string, totalModo: TotalModo): ColunaCons[] {
  if (sel.length === 0) return []
  const ref = sel[sel.length - 1]
  const cols: ColunaCons[] = []

  /** UMA coluna de AV por ano marcado (decisão do Yan na abertura da v5.7.0), colada à
   *  coluna de NÍVEL daquele ano: o ano cheio nos anos de comparação, o YTD no ano de
   *  referência. É a leitura literal de "AV à direita de cada ano" e a menor densidade
   *  possível — com 3 anos marcados no modo 'tudo' a tabela já passa de 12 colunas, e a
   *  válvula para alargar (AV em toda coluna de valor) é só acrescentar chamadas aqui. */
  const colunaAv = (ano: number, campo: CampoAno, recorte: string): ColunaCons => ({
    k: 'av', id: `av-${campo}-${ano}`, rotulo: 'AV', ano, campo, grupo: 'comp',
    classe: 'text-text-subtle',
    titulo: `${TITULO_AV} — ${recorte}`,
  })

  sel.slice(0, -1).forEach((c, i) => {
    const prox = sel[i + 1]
    cols.push({
      k: 'valor', id: `ano-${c.ano}`, rotulo: String(c.ano), ano: c.ano, campo: 'total',
      fundo: 'normal', corte: false, totalAno: false, grupo: 'comp', classe: 'text-text-secondary',
      titulo: `${c.ano} — ano inteiro`,
    })
    cols.push(colunaAv(c.ano, 'total', `${c.ano} inteiro`))
    cols.push({
      k: 'valor', id: `ytd-${c.ano}`, rotulo: `YTD ${anoCurto(c.ano)}`, ano: c.ano, campo: 'ytd',
      fundo: 'normal', corte: false, totalAno: false, grupo: 'comp', classe: 'text-text-secondary',
      titulo: `${c.ano} na MESMA janela dos demais anos (${janelaTexto})`,
    })
    cols.push({
      // "Δ% YTD 25·26", não "Δ% 25·26" (v5.4.1): a variação é entre os YTDs, e sem a
      // palavra o leitor supunha ano cheio contra ano cheio — o vizinho imediato à
      // esquerda é justamente uma coluna de ano cheio.
      k: 'delta', id: `delta-${c.ano}-${prox.ano}`, rotulo: `Δ% YTD ${anoCurto(c.ano)}·${anoCurto(prox.ano)}`,
      de: c.ano, para: prox.ano, grupo: 'comp', classe: 'text-text-secondary',
      titulo: `Variação do YTD de ${c.ano} para ${prox.ano} (mesma janela: ${janelaTexto})`,
    })
  })

  // Ano cheio da REFERÊNCIA — só no modo 'realizado' e só se ela for um ano FECHADO
  // (ver o porquê no doc-comment): ali o ano inteiro já aconteceu e é um número distinto
  // do YTD. Num ano corrente esse total conteria projeção, que o modo 'realizado' exclui.
  if (totalModo === 'realizado' && !ref.corrente) {
    cols.push({
      k: 'valor', id: `ano-${ref.ano}`, rotulo: String(ref.ano), ano: ref.ano, campo: 'total',
      fundo: 'normal', corte: false, totalAno: false, grupo: 'comp', classe: 'text-text-secondary',
      titulo: `${ref.ano} — ano inteiro`,
    })
  }

  cols.push({
    k: 'valor', id: `ytd-${ref.ano}`, rotulo: `YTD ${anoCurto(ref.ano)}`, ano: ref.ano, campo: 'ytd',
    fundo: 'normal', corte: false, totalAno: false, grupo: 'comp', classe: 'text-text-secondary',
    titulo: `${ref.ano} na MESMA janela dos demais anos (${janelaTexto})`,
  })
  // No ano de REFERÊNCIA a coluna de nível é o YTD — é ela que compara com os demais
  // anos na mesma janela, e num ano corrente é o único recorte 100% realizado.
  cols.push(colunaAv(ref.ano, 'ytd', `${ref.ano} em ${janelaTexto}`))

  if (totalModo === 'realizado') return cols

  if (ref.corrente) {
    cols.push({
      // VENCIDOS não é projeção — é prazo ESTOURADO. Fundo e rótulo em VERMELHO (rodada
      // 4/Refino 5), a escala `BG_VENCIDO`. A tinta do rótulo é --negative e não
      // --danger: sobre a banda do cabeçalho o --danger dá 3,6:1 (reprova), o --negative
      // dá 4,3:1 — o MESMO patamar do --warning-deep que ele substitui aqui.
      // Rodada 5/Refino 2: passou a vir ANTES de PREV, no grupo PRÓPRIO 'venc' (nem
      // Realizado, nem Previsto). `corte: true` nas DUAS colunas seguintes é o que
      // desenha a divisória dos DOIS lados da faixa: a régua grossa entra à ESQUERDA de
      // cada célula, então a de VENCIDOS fecha o Realizado e a de PREV fecha VENCIDOS.
      k: 'valor', id: `venc-${ref.ano}`, rotulo: 'VENCIDOS', ano: ref.ano, campo: 'venc',
      fundo: 'vencido', corte: true, totalAno: false, grupo: 'venc', classe: 'text-negative',
      titulo: 'Vencido em aberto, ainda não liquidado — nem realizado (não entrou) nem projeção (o prazo já passou)',
    })
    cols.push({
      k: 'valor', id: `prev-${ref.ano}`, rotulo: `PREV ${anoCurto(ref.ano)}`, ano: ref.ano, campo: 'prev',
      fundo: 'previsto', corte: true, totalAno: false, grupo: 'prev', classe: 'text-warning-deep',
      titulo: `Previsto de ${ref.ano} — total do ano menos o já realizado (YTD)`,
    })
  }

  cols.push({
    k: 'valor', id: `total-${ref.ano}`, rotulo: ref.corrente ? 'TOTAL PREVISTO' : `TOTAL ${ref.ano}`,
    ano: ref.ano, campo: 'total',
    // Âmbar e rótulo "TOTAL PREVISTO" só quando o total CONTÉM projeção (ano corrente) —
    // o ano de referência é o critério, não o modo: no modo 'realizado' esta coluna
    // sequer existe (return acima), então aqui `totalModo` já é 'tudo'. Sem o ano no
    // rótulo (Refino 4): a pill marcada e o "YTD «aa»" ao lado já dizem qual ano é.
    fundo: ref.corrente ? 'previsto' : 'normal', corte: false, totalAno: true, grupo: 'total',
    classe: 'text-text-secondary',
    titulo: ref.corrente
      ? `${ref.ano} inteiro — realizado (${janelaTexto}) + previsto do que falta`
      : `${ref.ano} inteiro — tudo realizado (ano fechado)`,
  })

  return cols
}
