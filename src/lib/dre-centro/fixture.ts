import type { DreLinha, DreMensalLike } from '@/lib/dre/schemas'
import { CENTROS, porCentro, zeros12, type CentroId } from './centros'
import { mesFimRealizado } from './visoes'
import type { DreCentroAno, EventoAntecipacao, RecebivelAntecipado } from './tipos'

// ── Dados SINTÉTICOS da DRE por centro (v6.5.1) — números FICTÍCIOS, só para TESTES ──────────
//
// Nasceu como a fixture do mockup do GATE 1; desde a M4 a página lê a RPC real
// (`get_dre_caixa_centro`, 0306) e este módulo ficou só como gerador de dado coerente para os
// testes do componente e do módulo puro. Nada daqui é regra de negócio; a regra real vive na 0306.
//
// Os centros são a carga REAL da visão Empresa (`get_dre_mensal` do ano corrente) repartida por
// pesos fictícios por FOLHA da árvore (operação × pessoas × estrutura), com um pouco de
// sazonalidade para os centros não serem cópias em escala. Por isso o mockup mostra, na tela,
// a identidade que a versão promete: a soma dos centros fecha com a Empresa (a árvore é a viva
// e cada categoria é repartida com resto no maior peso). Nenhum número financeiro novo entra no
// repositório: os pesos e os eventos de antecipação são inventados.
//
// Sobre a árvore repartida a fixture imita o que a M3 vai fazer no banco:
//   · a categoria de taxa de antecipação (`CATEGORIA_TAXA_ANTECIPACAO`, M0/Q3) SAI da árvore —
//     ela vai para o bloco de antecipação, atribuída pela regra da §3.4;
//   · recebíveis antecipados (sintéticos) saem da "Entrada de clientes" do dono no mês da
//     antecipação e voltam no mês do vencimento original;
//   · os totalizadores são recalculados pelas FÓRMULAS vivas (`dre_estrutura`).

/** `dim_categoria.id` de "Taxa de Antecipação" (bloco FIN) — medido na M0 (Q3). */
export const CATEGORIA_TAXA_ANTECIPACAO = 38

export interface BlocoFormula {
  chave: string
  formula: string[] | null
}

type Pesos = Record<CentroId, number>

// Folhas da árvore viva (medidas em 06/11 contra `dre_bloco`): ENT_H · PAG_H · RV · IMP_H · CUSTO ·
// ADM · COM · MKT · ESTR · RH · RHB · FIN · RNOP · DNOP · INV · DIST_LUCROS. `REPASSE` NÃO é folha
// (= ENT_H + PAG_H): o pagamento ao fornecedor tem de seguir a mesma operação da entrada, senão o
// CSC nasce com Receita Bruta negativa (pego na conferência da fixture contra o payload vivo).
const OPERACAO = new Set(['ENT_H', 'PAG_H', 'RV', 'IMP_H', 'CUSTO', 'COM'])
const PESSOAS = new Set(['RH', 'RHB'])

const PERFIL_OPERACAO: Pesos = { trips: 0.31, weddings: 0.44, corp: 0.24, csc: 0, sem_centro: 0.01 }
const PERFIL_PESSOAS: Pesos = { trips: 0.2, weddings: 0.24, corp: 0.12, csc: 0.44, sem_centro: 0 }
const PERFIL_ESTRUTURA: Pesos = { trips: 0.04, weddings: 0.05, corp: 0.03, csc: 0.88, sem_centro: 0 }

/** Pesos fictícios de uma folha num mês (somam 1). A operação tem sazonalidade: Weddings pesa
 *  mais no meio do ano, Trips no começo e no fim. */
export function pesosFicticios(folha: string | undefined, mes: number): Pesos {
  if (folha && PESSOAS.has(folha)) return PERFIL_PESSOAS
  if (!folha || !OPERACAO.has(folha)) return PERFIL_ESTRUTURA
  const ang = (2 * Math.PI * mes) / 12
  const bruto: Pesos = {
    trips: PERFIL_OPERACAO.trips * (1 + 0.3 * Math.cos(ang)),
    weddings: PERFIL_OPERACAO.weddings * (1 - 0.45 * Math.cos(ang)),
    corp: PERFIL_OPERACAO.corp,
    csc: 0,
    sem_centro: PERFIL_OPERACAO.sem_centro,
  }
  const t = CENTROS.reduce((s, c) => s + bruto[c], 0)
  return porCentro(c => bruto[c] / t)
}

/** Reparte `x` pelos pesos em centavos; o resto vai ao maior peso — a soma fecha exata. */
function repartir(x: number, w: Pesos): Pesos {
  const maior = CENTROS.reduce((a, c) => (w[c] > w[a] ? c : a), CENTROS[0])
  const out = porCentro(c => (c === maior ? 0 : Math.round(x * w[c] * 100) / 100))
  out[maior] = x - CENTROS.reduce((s, c) => s + out[c], 0)
  return out
}

/** Meses em que a fixture cria antecipações (os mesmos meses do protótipo de 06/11). */
const MESES_ANTECIPACAO = [1, 2, 3, 4, 5, 9, 10]
const FRACAO_ANTECIPADA = 0.18
const DONOS: Array<[CentroId, number]> = [['weddings', 0.62], ['trips', 0.3], ['corp', 0.08]]
const VENCIMENTOS: Array<[number, number]> = [[1, 0.6], [3, 0.4]] // meses depois, fração

export function fixtureDreCentro(empresa: DreMensalLike, blocos: readonly BlocoFormula[]): DreCentroAno {
  const ano = empresa.ano
  const fim = mesFimRealizado(empresa.relacao, empresa.mes_corrente)
  const cats = empresa.linhas.filter(l => l.t === 'cat')

  // 1. Repartição das categorias (só meses realizados).
  const porCat = new Map<DreLinha, Record<CentroId, number[]>>()
  let valorMovimentado = 0
  for (const l of cats) {
    const v = porCentro(() => zeros12())
    for (let m = 0; m < fim; m++) {
      valorMovimentado += Math.abs(l.meses[m])
      const r = repartir(l.meses[m], pesosFicticios(l.g, m + 1))
      for (const c of CENTROS) v[c][m] = r[c]
    }
    porCat.set(l, v)
  }

  // 2. Taxa de antecipação: sai da árvore; no Monde ela foi lançada no CSC.
  const taxaCat = cats.find(l => l.categoria_id === CATEGORIA_TAXA_ANTECIPACAO)
  const taxaMonde = porCentro(() => zeros12())
  if (taxaCat) for (let m = 0; m < fim; m++) taxaMonde.csc[m] = taxaCat.meses[m]

  // 3. Recebíveis antecipados sintéticos sobre a maior categoria de receita.
  const receita = cats
    .filter(l => l.categoria_id !== CATEGORIA_TAXA_ANTECIPACAO)
    .reduce<DreLinha | null>((a, l) => (a === null || l.total > a.total ? l : a), null)
  const recebiveis: RecebivelAntecipado[] = []
  const eventos: EventoAntecipacao[] = []
  const meses = MESES_ANTECIPACAO.filter(m => m <= fim)
  meses.forEach((a, idx) => {
    if (!receita) return
    const base = Math.max(0, receita.meses[a - 1])
    const antecipado = Math.round((base * FRACAO_ANTECIPADA) / 100) * 100
    if (antecipado <= 0) return
    for (const [dono, fd] of DONOS) {
      for (const [desloc, fv] of VENCIMENTOS) {
        const valor = Math.round(antecipado * fd * fv * 100) / 100
        recebiveis.push({ dono, mesAntecipacao: a, mesVencimento: a + desloc, valor })
        const lr = porCat.get(receita)!
        lr[dono][a - 1] -= valor
        if (a + desloc <= fim) lr[dono][a + desloc - 1] += valor
      }
    }
    const identificado = recebiveis.filter(r => r.mesAntecipacao === a).reduce((s, r) => s + r.valor, 0)
    const ultimo = idx === meses.length - 1
    const dd = (d: number) => `${ano}-${String(a).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    // Duas antecipações no mês (Asaas e Blimboo). A última do ano vem com recebíveis ainda não
    // baixados no Monde (identificação parcial) e com a taxa ainda não lançada; nas demais o Monde
    // lançou exatamente a taxa do registro (a nota soma registro − Monde, regra do protótipo).
    const partes: Array<[string, number, number]> = [['Asaas', 0.7, 8], ['Blimboo', 0.3, 22]]
    for (const [conta, f, dia] of partes) {
      const ident = Math.round(identificado * f * 100) / 100
      const extra = ultimo && conta === 'Asaas' ? Math.round(ident * 0.35 / 100) * 100 : 0
      const valor = ident + extra
      const taxaRegistro = -Math.round(valor * 0.021 * 100) / 100
      eventos.push({
        data: dd(dia), conta, valor, identificado: ident, taxaRegistro,
        taxaMonde: ultimo && conta === 'Asaas' ? 0 : taxaRegistro,
        motivo: extra > 0 ? 'recebíveis ainda não baixados no Monde' : undefined,
      })
    }
  })

  // 4. Árvore de cada centro pelas fórmulas vivas.
  const formula = new Map(blocos.map(b => [b.chave, b.formula]))
  const arvores = porCentro(c => {
    const memo = new Map<string, number[]>()
    const folha = (chave: string): number[] => {
      const v = zeros12()
      for (const l of cats) {
        if (l.g !== chave || l.categoria_id === CATEGORIA_TAXA_ANTECIPACAO) continue
        const s = porCat.get(l)![c]
        for (let m = 0; m < 12; m++) v[m] += s[m]
      }
      return v
    }
    const bloco = (chave: string, pilha: Set<string> = new Set()): number[] => {
      const pronto = memo.get(chave)
      if (pronto) return pronto
      const f = formula.get(chave)
      let v: number[]
      if (!f || f.length === 0 || pilha.has(chave)) v = folha(chave)
      else {
        v = zeros12()
        const dentro = new Set(pilha).add(chave)
        for (const filho of f) bloco(filho, dentro).forEach((x, m) => { v[m] += x })
      }
      memo.set(chave, v)
      return v
    }
    return empresa.linhas
      .filter(l => !(l.t === 'cat' && l.categoria_id === CATEGORIA_TAXA_ANTECIPACAO))
      .map((l): DreLinha => {
        const ms = l.t === 'cat' ? porCat.get(l)![c] : bloco(l.chave ?? '')
        return { ...l, meses: ms, prev_corrente: null, venc: 0, total: ms.reduce((s, x) => s + x, 0) }
      })
  })

  let semCentro = 0
  for (const l of cats) for (let m = 0; m < fim; m++) semCentro += Math.abs(porCat.get(l)!.sem_centro[m])

  return {
    ano,
    hoje: empresa.hoje,
    relacao: empresa.relacao,
    mes_corrente: empresa.mes_corrente,
    arvores,
    recebiveis,
    taxaMonde,
    eventos,
    cobertura: { valorMovimentado, semCentro },
  }
}
