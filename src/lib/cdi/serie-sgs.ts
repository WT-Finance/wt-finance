// Conversão da série do SGS/BACEN para o payload de `cdi_ingest_upsert` (v5.5.0/M2).
//
// Vive em `lib/` e não dentro da API Route por dois motivos: é lógica PURA e
// testável, e a rota importa o client service-role (`server-only`), que não resolve
// sob o vitest — o teste desta conversão morreria na cadeia de import.

/**
 * Série 4391 do SGS = "CDI acumulada no mês", em % ao mês.
 *
 * Conferida contra a API pública em 07/08/2026 antes de ser fixada: devolve
 * `{"data":"01/07/2026","valor":"1.22"}` — dia 1º do mês (a mesma chave de
 * `analytics.dim_taxa_cdi`) e percentual mensal na casa de 1,1%, coerente com um
 * CDI anual de ~14%. NÃO trocar por 4392, que é a MESMA série ANUALIZADA: a troca
 * não quebra nada visivelmente e entra na conta composta inflada em uma ordem de
 * grandeza. O guard de faixa em `converterSerieSgs` existe por causa dela.
 */
export const SERIE_SGS_CDI_MENSAL = 4391

/** Início do backfill (decisão do briefing). */
export const INICIO_SERIE = { dia: 1, mes: 8, ano: 2024 }

/**
 * Teto de plausibilidade para uma taxa MENSAL: 5% a.m. (≈ 79% a.a.).
 *
 * Serve para barrar a troca acidental pela série anualizada — hoje ela devolveria
 * ~14, que como fração mensal seria 0,14 e cai aqui. ⚠️ Não é proteção completa:
 * se o CDI anual voltasse a ~4% a.a., como em 2020, o valor anualizado passaria
 * por este teto sem acender nada. O que garante a série certa é a constante acima,
 * não este guard — ele é a segunda linha, não a primeira. O CHECK da tabela é mais
 * frouxo de propósito (±100%): é sanidade de coluna, não regra de negócio.
 */
export const TETO_TAXA_MENSAL = 0.05

/** O SGS aceita e devolve datas em dd/MM/yyyy. */
export function paraDataBr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

/**
 * "01/07/2026" → "2026-07-01".
 *
 * Parse manual de propósito: `new Date('01/07/2026')` é lido como 7 de JANEIRO
 * pelo runtime (formato americano). As duas datas existem, então o erro não lança —
 * a taxa só aparece no mês errado, e a conta composta segue sem sintoma.
 */
export function paraIsoPrimeiroDia(dataBr: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataBr.trim())
  if (!m) return null
  const [, dia, mes, ano] = m
  if (dia !== '01') return null // a série mensal sempre ancora no 1º dia
  const mesN = Number(mes)
  if (mesN < 1 || mesN > 12) return null
  return `${ano}-${mes}-01`
}

interface PontoSgs { data?: unknown; valor?: unknown }

export interface TaxaMes {
  /** 1º dia do mês de competência, ISO. */
  mes: string
  /** Fração decimal do mês: 0.0122 = 1,22% a.m. */
  taxa: number
}

/**
 * Converte a resposta do SGS no payload da RPC, em fração decimal.
 *
 * Linha malformada FALHA o lote inteiro em vez de ser pulada: se o BACEN mudar o
 * contrato, ingerir só o subconjunto que ainda casa produziria uma série com
 * buracos — e buraco é justamente o que a conta composta atravessa sem reclamar.
 */
export function converterSerieSgs(bruto: unknown): TaxaMes[] {
  if (!Array.isArray(bruto)) {
    throw new Error('resposta do SGS não é uma lista')
  }
  return bruto.map((p: PontoSgs, i) => {
    const mes = typeof p?.data === 'string' ? paraIsoPrimeiroDia(p.data) : null
    if (!mes) throw new Error(`ponto ${i}: data inválida (${JSON.stringify(p?.data)})`)

    const valor = typeof p?.valor === 'string' || typeof p?.valor === 'number'
      ? Number(p.valor)
      : NaN
    if (!Number.isFinite(valor)) {
      throw new Error(`ponto ${i}: valor inválido (${JSON.stringify(p?.valor)})`)
    }

    // O SGS devolve PERCENTUAL ao mês; a coluna guarda FRAÇÃO decimal.
    // O arredondamento para 8 casas NÃO é cosmético: `1.16 / 100` em ponto
    // flutuante é 0.011600000000000001, e a coluna é `numeric(10,8)`. Sem isto o
    // payload e o que fica gravado divergem no último bit, e qualquer comparação
    // exata (teste, conferência, diff entre duas ingestões) passa a mentir.
    const taxa = Number((valor / 100).toFixed(8))
    if (Math.abs(taxa) >= TETO_TAXA_MENSAL) {
      throw new Error(
        `ponto ${i}: taxa fora de faixa plausível para CDI MENSAL (${valor}% a.m.) — ` +
        'a série 4392 é a anualizada e cai aqui',
      )
    }
    return { mes, taxa }
  })
}

/** URL da série inteira, de `INICIO_SERIE` até `hoje`. */
export function urlSerieSgs(hoje: Date): string {
  const inicio = paraDataBr(new Date(Date.UTC(INICIO_SERIE.ano, INICIO_SERIE.mes - 1, INICIO_SERIE.dia)))
  const fim = paraDataBr(hoje)
  return (
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIE_SGS_CDI_MENSAL}/dados` +
    `?formato=json&dataInicial=${inicio}&dataFinal=${fim}`
  )
}
