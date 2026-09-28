// ── Mês PARCIAL da base de competência (v6.0.0/M7b, decisão 14) — módulo PURO ─────
// "Parcial" NÃO deriva do calendário (não usa `hojeSP()`, não usa `Date.now()`, sem
// rede) — o caso que discrimina: um export extraído em 21/09 com dado até setembro
// olhado em 21/09 marca setembro; o MESMO export olhado em 01/10 continua marcando
// setembro, porque pelo calendário "setembro fechou" mas a BASE não mudou — é a base
// que decide, não o relógio de quem está olhando a tela.
//
// Regra (contrato, anexo M7b/§3.1): o ÚLTIMO MÊS COM DADO na base (o mês/ano de
// `cobertura_ate`) é parcial quando a CARGA (`carregado_em`, convertida ao fuso de São
// Paulo) caiu DENTRO dele — mesmo ano e mês. Os dois campos são os do envelope de
// `get_dre_competencia_mensal` (0257/0260) e são GLOBAIS à base — `max()` sem filtro de
// ano —, não do ano pedido: por isso qualquer ano que tenha carregado serve como fonte
// (mesmo princípio que a página já usa para o selo de frescor via `compQualquer`).
//
// SÓ RÓTULO (invariante 1 da v6.0.0): este módulo não soma nada, não corta janela
// nenhuma — devolve {ano, mes} ou `null`, e quem chama decide se aquele PONTO específico
// (uma coluna de mês, um ano de YTD) é o marcado.

/** O que a regra precisa do envelope de competência — os DOIS campos são globais da
 *  base (não do ano pedido). Interface estrutural, não amarrada a um schema Zod
 *  específico, para o módulo continuar puro e fácil de testar com literais. */
export interface EnvelopeMesParcial {
  /** `AAAA-MM-DD` do último dia coberto pela base (`cobertura_ate` do envelope). */
  cobertura_ate: string | null | undefined
  /** timestamptz (UTC) da carga mais recente (`carregado_em` do envelope). */
  carregado_em: string | null | undefined
}

export interface MesParcial {
  ano: number
  /** 1-based (1 = janeiro). */
  mes: number
}

/** `AAAA-MM-DD` (calendário puro, fuso de São Paulo) de um timestamptz UTC qualquer —
 *  a mesma receita de `hojeSP()` (`@/lib/fmt`), só que parametrizada por uma data
 *  arbitrária em vez de "agora". `null` quando o ISO não parseia (nunca lança, nunca
 *  devolve string malformada). Fuso: `2026-10-01T02:30Z` (02:30 UTC) devolve
 *  `'2026-09-30'` — em São Paulo (UTC−3) ainda são 23:30 do dia anterior. */
function dataSP(iso: string): string | null {
  const dt = new Date(iso)
  if (isNaN(dt.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(dt)
}

/**
 * Mês PARCIAL da base de competência, ou `null` quando nenhum mês é parcial.
 *
 * `null` em qualquer um destes casos — nunca inventa:
 *  · `cobertura_ate` ou `carregado_em` ausentes/nulos;
 *  · qualquer um dos dois sem a forma de data esperada;
 *  · a carga caiu num mês/ano DIFERENTE do último mês coberto (ex.: carga de 02/10 com
 *    dado só até setembro — outubro não tem linha nenhuma, então setembro FECHOU antes
 *    da carga, e nada fica parcial).
 */
export function mesParcialCompetencia(p: EnvelopeMesParcial): MesParcial | null {
  if (typeof p.cobertura_ate !== 'string' || typeof p.carregado_em !== 'string') return null

  const mCob = /^(\d{4})-(\d{2})/.exec(p.cobertura_ate)
  if (!mCob) return null
  const anoCob = Number(mCob[1])
  const mesCob = Number(mCob[2])
  if (!Number.isFinite(anoCob) || !Number.isFinite(mesCob)) return null

  const ymdCarga = dataSP(p.carregado_em)
  if (!ymdCarga) return null
  const mCarga = /^(\d{4})-(\d{2})/.exec(ymdCarga)
  if (!mCarga) return null
  const anoCarga = Number(mCarga[1])
  const mesCarga = Number(mCarga[2])

  if (anoCarga === anoCob && mesCarga === mesCob) return { ano: anoCob, mes: mesCob }
  return null
}

/** O mês `mes` (1-based) do ano `ano` é exatamente o mês parcial computado acima?
 *  Helper de comparação para os call-sites (tabela densa) não repetirem o par de
 *  igualdades — `parcial === null` (nada marcado) devolve `false` por construção. */
export function ehMesParcial(parcial: MesParcial | null, ano: number, mes: number): boolean {
  return parcial !== null && parcial.ano === ano && parcial.mes === mes
}

/** Sufixo EXATO do rótulo — ponto médio com espaços, minúsculo. Fonte única para a
 *  tabela densa e o Resumo Executivo nunca divergirem em pontuação/capitalização. */
export const SUF_PARCIAL = ' · parcial'
