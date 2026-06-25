// Calculadora de Rateio (v4.28.0) — núcleo PURO do cálculo (isomórfico, testável).
//
// Cada linha da fatura COM valor é atribuída ao setor da sua venda (mapaSetor:
// venda_numero → setor REAL da base). Venda nula ou ausente do mapa → 'Não
// identificado' (EXPLÍCITO, nunca silencioso). Linhas sem valor parseável não
// entram (carregam 0) e são contadas em `ignoradas`. % = valor do balde / total.
//
// FECHAMENTO DE CONTA por construção: cada linha resolvida cai em EXATAMENTE um
// balde (os 4 cobrem todos os setores lógicos possíveis), então soma(baldes) ==
// total — as mesmas parcelas, só agrupadas. `fecha` confere isso com tolerância
// de meio centavo (ruído de float ao reagrupar a soma).

import {
  SETORES_LOGICOS, type SetorLogico, type LinhaFatura,
  type ResultadoRateio, type Balde, type LinhaResolvida,
} from './tipos'

export function calcularRateio(
  linhas: LinhaFatura[],
  /** venda_numero → setor REAL ('Corporativo'|'Lazer'|'Weddings'). Só vendas casadas. */
  mapaSetor: Record<string, SetorLogico>,
): ResultadoRateio {
  const resolvidas: LinhaResolvida[] = []
  let ignoradas = 0

  for (const l of linhas) {
    if (l.valor === null) { ignoradas++; continue }
    // Venda nula OU sem casamento → 'Não identificado'. O mapa só contém setores
    // reais, então o fallback é o único caminho para o balde de não-casados.
    const setor: SetorLogico =
      l.venda_numero !== null && mapaSetor[l.venda_numero]
        ? mapaSetor[l.venda_numero]
        : 'Não identificado'
    resolvidas.push({ linha: l.linha, venda_numero: l.venda_numero, valor: l.valor, setor })
  }

  const total = resolvidas.reduce((s, r) => s + r.valor, 0)

  const baldes: Balde[] = SETORES_LOGICOS.map(setor => {
    const doSetor = resolvidas.filter(r => r.setor === setor)
    const valor = doSetor.reduce((s, r) => s + r.valor, 0)
    return { setor, valor, pct: total !== 0 ? valor / total : 0, linhas: doSetor.length }
  })

  const somaBaldes = baldes.reduce((s, b) => s + b.valor, 0)
  return { baldes, total, resolvidas, ignoradas, fecha: Math.abs(total - somaBaldes) < 0.005 }
}
