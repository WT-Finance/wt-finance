import { describe, it, expect } from 'vitest'
import { parseLancamentosCentroCustoRows } from './parsers/lancamentos-centro-custo'
import { lerMatrizXlsx, fixturesAusentes, motivoDoPulo, EXIGIR_FIXTURES } from './fixtures-oraculo'

// ── Oráculo do arquivo REAL de Lançamentos por Centro de Custo (v6.5.1 / M2) ─────────────────
//
// Sem tratado: o oráculo são os NÚMEROS medidos no export de 06/11/2026 (contrato
// `docs/specs/v6-5-1-m2-base-centro-custo.md` §1) — a contagem e a soma que o próprio Monde declara
// no outline de cada grupo de centro. O arquivo é lido por `lerMatrizXlsx` (a MESMA leitura da
// rota) e passa pelo parser real — nenhuma matriz montada à mão (skill `ingestao-planilhas` §3).
//
// 🔒 DADO PESSOAL: `Pessoa` e `Descrição` do export carregam nomes de pessoas. Nenhuma asserção ou
// mensagem aqui cita essas colunas — só CONTAGENS, SOMAS, números de lançamento e nomes de centro.
//
// A fixture NEGATIVA (grupo recolhido) é DERIVADA da matriz real por edição em memória e é
// SINTÉTICA: o export real de 06/11 tem os 4 grupos abertos (decisão D4).

const FIXTURE = 'centro-custo-cru-2026-11-06.xlsx'
const AUSENTES = fixturesAusentes([FIXTURE])

/** "Hoje" FIXO (data do export): a faixa de datas é ancorada no fim do ano de hoje + 5. */
const HOJE = new Date(Date.UTC(2026, 10, 6))

const TOTAL_LINHAS = 21_144
/** Por centro: [linhas, centavos] — o outline declarado pelo Monde, que o parser tem de reproduzir. */
const CENTROS: Record<string, readonly [number, number]> = {
  'WG - Corp':     [2_980, 132_529_056],
  'WG - CSC':      [1_849, -411_446_058],
  'WG - Trips':    [5_505, 154_293_764],
  'WG - Weddings': [10_810, 66_756_370],
}
const CENTAVOS_TOTAL = -57_866_868
const SEM_PCT = 362
const NUMEROS_COM_HIFEN = 242

it('a fixture do oráculo está presente (ou o pulo está declarado)', () => {
  if (EXIGIR_FIXTURES) {
    expect(AUSENTES, `REQUIRE_FIXTURES=1 e ${motivoDoPulo(AUSENTES)}`).toEqual([])
  } else if (AUSENTES.length > 0) {
    expect(motivoDoPulo(AUSENTES)).toContain('fixture(s) ausente(s)')
  } else {
    expect(AUSENTES).toEqual([])
  }
})

describe.skipIf(AUSENTES.length > 0)('oráculo — Lançamentos por Centro de Custo (arquivo real de 06/11/2026)', () => {
  const rows = lerMatrizXlsx(FIXTURE)
  const resultado = parseLancamentosCentroCustoRows(rows, { hoje: HOJE })

  function ok() {
    if (!resultado.ok) throw new Error(`${resultado.codigo}: ${resultado.mensagem}`)
    return resultado
  }

  it('o parse fecha: 21.144 linhas e 4 checksums de escopo centro, ao centavo, contra o outline do export', () => {
    const r = ok()
    expect(r.linhas).toHaveLength(TOTAL_LINHAS)
    expect(r.checksums).toHaveLength(4)
    for (const [nome, [linhas, centavos]] of Object.entries(CENTROS)) {
      const c = r.checksums.find((x) => x.chave[0] === nome)
      expect(c, `checksum de ${nome}`).toBeDefined()
      expect(c).toMatchObject({
        escopo: 'centro', campo: 'valor_centro_custo',
        linhasDeclaradas: linhas, linhasApuradas: linhas,
        centavosDeclarados: centavos, centavosApurados: centavos, centavosArredondados: centavos,
      })
    }
  })

  it('pelas LINHAS emitidas (não só pelo checksum): contagem e Σ por centro, e Σ geral = −578.668,68', () => {
    const r = ok()
    let total = 0
    for (const [nome, [linhas, centavos]] of Object.entries(CENTROS)) {
      const doCentro = r.linhas.filter((l) => l.centro_custo === nome)
      expect(doCentro, nome).toHaveLength(linhas)
      const soma = doCentro.reduce((s, l) => s + Math.round(l.valor_centro_custo * 100), 0)   // já é 2 casas
      expect(soma, nome).toBe(centavos)
      total += soma
    }
    expect(total).toBe(CENTAVOS_TOTAL)
    expect(r.linhas.reduce((s, l) => s + Math.round(l.valor_centro_custo * 100), 0)).toBe(CENTAVOS_TOTAL)
  })

  it('362 linhas com % vazio (valor líquido zero) e 242 Números com sufixo -N (texto)', () => {
    const r = ok()
    expect(r.linhas.filter((l) => l.pct_centro === null)).toHaveLength(SEM_PCT)
    expect(r.linhas.filter((l) => l.numero.includes('-'))).toHaveLength(NUMEROS_COM_HIFEN)
    expect(r.linhas.every((l) => typeof l.numero === 'string' && l.numero !== '')).toBe(true)
  })

  // Datas fora da faixa da errata 1 (piso 2015): o CAMPO sai null e a linha PERMANECE (o checksum é do
  // arquivo inteiro). Medido no export de 06/11, contado por CAUSA, não num "datas inválidas" só (lição
  // da v6.4.0): 29 Emissão (datas zero do Excel — 1899/1900 — e emissões antigas legítimas, 1963–2007) e
  // 2 Vencimento. NENHUMA em Movimentação, que é a data que a DRE de caixa usa.
  it('nenhum lançamento sem centro, todas as movimentações em 2026; datas rejeitadas só em Emissão/Vencimento', () => {
    const r = ok()
    expect(r.linhas.every((l) => l.centro_custo !== null)).toBe(true)
    expect(r.linhas.every((l) => l.movimentacao !== null && l.movimentacao.startsWith('2026-'))).toBe(true)
    const porCampo = (c: string) => r.datasRejeitadas.filter((d) => d.campo === c).length
    expect(porCampo('emissao')).toBe(29)
    expect(porCampo('vencimento')).toBe(2)
    expect(porCampo('movimentacao')).toBe(0)
    expect(r.datasRejeitadas).toHaveLength(31)
    expect(r.diagnostico.datasRejeitadas).toBe(31)
  })

  it('o valor do centro nunca é lido negativo no arquivo: o sinal vem só de Valor Movimentação', () => {
    const r = ok()
    expect(r.linhas.every((l) => l.valor_movimentacao < 0 ? l.valor_centro_custo <= 0 : l.valor_centro_custo >= 0)).toBe(true)
    expect(r.linhas.some((l) => l.valor_centro_custo < 0)).toBe(true)
  })

  it('lista fechada: só as 9 chaves do contrato atravessam o parser', () => {
    expect(Object.keys(ok().linhas[0]).sort()).toEqual([
      'centro_custo', 'emissao', 'linha_origem', 'movimentacao', 'numero', 'pct_centro',
      'valor_centro_custo', 'valor_movimentacao', 'vencimento',
    ])
  })

  it('diagnóstico: 4 centros com as contagens do outline', () => {
    const centros = ok().diagnostico.centros as { nome: string; linhas: number }[]
    expect(centros).toHaveLength(4)
    for (const [nome, [linhas]] of Object.entries(CENTROS)) {
      expect(centros.find((c) => c.nome === nome)?.linhas, nome).toBe(linhas)
    }
  })

  it('mutante sobre o arquivo REAL: tirar um lançamento do meio reprova o checksum (CHECKSUM_FALHOU)', () => {
    const copia = rows.map((l) => [...l])
    copia.splice(5, 1)
    const r = parseLancamentosCentroCustoRows(copia, { hoje: HOJE })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
  })

  // FIXTURE NEGATIVA DERIVADA — SINTÉTICA (decisão D4). O export real nunca vem com grupo recolhido;
  // aqui o outline de "WG - Corp" troca "-" por "+" e as linhas de detalhe do grupo são removidas,
  // como o Excel faz ao recolher um grupo.
  it('grupo "WG - Corp" recolhido (derivado, SINTÉTICO) ⇒ a carga é rejeitada nomeando o centro', () => {
    const cab = rows[0] ?? []
    const cNumero = cab.findIndex((h) => String(h ?? '').trim() === 'Número')
    expect(cNumero).toBeGreaterThanOrEqual(0)
    const RE = /^\s*Centro de Custo\s*:/
    let emCorp = false
    let achou = false
    const derivada: unknown[][] = []
    rows.forEach((linha, i) => {
      const copia = [...linha]
      if (i > 0) {
        const j = copia.slice(0, 3).findIndex((c) => typeof c === 'string' && RE.test(c))
        if (j >= 0) {
          emCorp = /Centro de Custo\s*:\s*WG - Corp\s*\(/.test(String(copia[j]))
          if (emCorp) { copia[0] = '+'; achou = true }
        } else if (emCorp && String(copia[cNumero] ?? '').trim() !== '') {
          return   // detalhe do grupo recolhido: some
        }
      }
      derivada.push(copia)
    })
    expect(achou).toBe(true)
    expect(derivada.length).toBeLessThan(rows.length - CENTROS['WG - Corp'][0] + 1)

    const r = parseLancamentosCentroCustoRows(derivada, { hoje: HOJE })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('WG - Corp')
  })
})
