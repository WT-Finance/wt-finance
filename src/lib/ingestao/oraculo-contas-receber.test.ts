import { describe, it, expect } from 'vitest'
import { parseContasReceberRows, type ContaReceberCru } from './parsers/contas-receber'
import { lerMatrizXlsx, fixturesAusentes, motivoDoPulo, EXIGIR_FIXTURES } from './fixtures-oraculo'

// ── Oráculo do arquivo REAL de Contas a receber (v6.4.0, GATE 1 / M1) ────────────────────────
//
// Sem tratado: o oráculo são os NÚMEROS conferidos na M1 (`docs/auditoria/v6-4-0-m1-export-contas-receber.md`)
// — a linha de total do próprio export (contagem e Σ), a contagem por situação e as 21 inadimplentes em
// aberto, que a API do Monde também confirma. Molde de `oraculo-vendas.test.ts`/`oraculo-operacao.test.ts`,
// com uma diferença: o arquivo é lido por `lerMatrizXlsx` (a MESMA leitura da rota) e passa pelo parser
// real — nenhuma matriz montada à mão, que passaria por cima de `raw`/`cellDates` (skill
// `ingestao-planilhas` §3).
//
// 🔒 DADO PESSOAL: `Pessoa`, `Descrição` e `Operação Própria` do export carregam nomes de pessoas.
// Este teste só afirma CONTAGENS, SOMAS e números de título — nenhuma asserção, mensagem de falha ou
// `toEqual` carrega o valor dessas colunas (um relatório com nome de pessoa já travou um push, v6.3.0).
// Ao ampliar o teste, não coloque linha inteira (`slice` de `linhas`) numa mensagem de `expect`.

const CRUS = ['contas-receber-cru-24.xlsx', 'contas-receber-cru-25-26.xlsx'] as const
const [ARQ_24, ARQ_25_26] = CRUS
const AUSENTES = fixturesAusentes([...CRUS])

/** "Hoje" FIXO (data da conferência da M1, 15/10/2026): a faixa de datas é ancorada no fim do ano de
 *  hoje + 5 (2031-12-31), então o veredito sobre vencimento 2049 não depende de quando a suíte roda. */
const HOJE = new Date(Date.UTC(2026, 9, 15))

// O que a M1 mediu (tabela "Decisões do Yan — GATE 1"). Dinheiro em CENTAVOS inteiros.
const TITULOS_24 = 10_354
const CENTAVOS_24 = 2_392_530_737        // 23.925.307,37
const TITULOS_25_26 = 28_603
const CENTAVOS_25_26 = 7_306_215_205     // 73.062.152,05
const INADIMPLENTES_EM_ABERTO = 21
const CENTAVOS_INADIMPLENTES_EM_ABERTO = 19_976_774   // 199.767,74
// 25-26: 15 datas zero (1899/1900) + 7 emissões antigas (2000–2006) abaixo do piso de 2015 (errata 1) = 22.
const EMISSOES_INVALIDAS_25_26 = 22
const EM_ABERTO_25_26 = 4_830

function centavosDe(linhas: readonly ContaReceberCru[]): number {
  let c = 0
  for (const l of linhas) c += Math.round(l.valor_final * 100)   // valor_final JÁ é 2 casas
  return c
}

it('as fixtures do oráculo estão presentes (ou o pulo está declarado)', () => {
  if (EXIGIR_FIXTURES) {
    expect(AUSENTES, `REQUIRE_FIXTURES=1 e ${motivoDoPulo(AUSENTES)}`).toEqual([])
  } else if (AUSENTES.length > 0) {
    expect(motivoDoPulo(AUSENTES)).toContain('fixture(s) ausente(s)')
  } else {
    expect(AUSENTES).toEqual([])
  }
})

describe.skipIf(AUSENTES.length > 0)('oráculo — Contas a receber (arquivos reais, 2 faixas de vencimento)', () => {
  const arquivos = CRUS.map((nome) => ({ nome, rows: lerMatrizXlsx(nome) }))
  const resultado = parseContasReceberRows(arquivos, { hoje: HOJE })

  function ok() {
    if (!resultado.ok) throw new Error(`${resultado.codigo}: ${resultado.mensagem}`)
    return resultado
  }
  const doArquivo = (nome: string) => ok().linhas.filter((l) => l.arquivo_origem === nome)

  it('o parse dos dois arquivos fecha — 1 checksum por arquivo, ao centavo, contra a linha de total do export', () => {
    const r = ok()
    expect(r.checksums).toHaveLength(2)
    const [c24, c25] = r.checksums
    expect(c24).toMatchObject({
      escopo: 'arquivo', chave: [ARQ_24], campo: 'valor_final',
      linhasDeclaradas: TITULOS_24, linhasApuradas: TITULOS_24,
      centavosDeclarados: CENTAVOS_24, centavosApurados: CENTAVOS_24, centavosArredondados: CENTAVOS_24,
    })
    expect(c25).toMatchObject({
      escopo: 'arquivo', chave: [ARQ_25_26], campo: 'valor_final',
      linhasDeclaradas: TITULOS_25_26, linhasApuradas: TITULOS_25_26,
      centavosDeclarados: CENTAVOS_25_26, centavosApurados: CENTAVOS_25_26, centavosArredondados: CENTAVOS_25_26,
    })
  })

  it('10.354 títulos / 23.925.307,37 em 2024 e 28.603 / 73.062.152,05 em 2025-26 — pelas LINHAS emitidas, não só pelo checksum', () => {
    const l24 = doArquivo(ARQ_24)
    const l25 = doArquivo(ARQ_25_26)
    expect(l24).toHaveLength(TITULOS_24)
    expect(centavosDe(l24)).toBe(CENTAVOS_24)
    expect(l25).toHaveLength(TITULOS_25_26)
    expect(centavosDe(l25)).toBe(CENTAVOS_25_26)
    expect(ok().linhas).toHaveLength(TITULOS_24 + TITULOS_25_26)   // 38.957
  })

  it('0 números em comum entre os dois arquivos (a guarda da carga não dispara) e Número único na união', () => {
    const n24 = new Set(doArquivo(ARQ_24).map((l) => l.numero))
    const n25 = new Set(doArquivo(ARQ_25_26).map((l) => l.numero))
    expect(n24.size).toBe(TITULOS_24)
    expect(n25.size).toBe(TITULOS_25_26)
    expect([...n24].filter((n) => n25.has(n))).toHaveLength(0)
    expect(new Set(ok().linhas.map((l) => l.numero)).size).toBe(TITULOS_24 + TITULOS_25_26)
  })

  it('nenhum Valor Final negativo (só a receber; 216 + 395 zeros legítimos) e a faixa de vencimento é contígua — nenhum aviso de lacuna', () => {
    const r = ok()
    expect(r.linhas.every((l) => l.valor_final >= 0)).toBe(true)
    expect(r.linhas.filter((l) => l.valor_final === 0)).toHaveLength(216 + 395)
    expect(r.diagnostico.lacunas).toEqual([])
    const faixas = (r.diagnostico.arquivos as { nome: string; vencimentoMin: string; vencimentoMax: string }[])
    expect(faixas.find((f) => f.nome === ARQ_24)).toMatchObject({ vencimentoMin: '2024-01-01', vencimentoMax: '2024-12-31' })
    expect(faixas.find((f) => f.nome === ARQ_25_26)?.vencimentoMin).toBe('2025-01-01')
  })

  it('21 inadimplentes em aberto somando 199.767,74 (a marcação, exatamente as da API) + 1 liquidada', () => {
    const todas = ok().linhas
    const inad = todas.filter((l) => l.conferido === 'Inadimplente')
    const emAberto = inad.filter((l) => l.liquidacao === null)
    expect(emAberto).toHaveLength(INADIMPLENTES_EM_ABERTO)
    expect(centavosDe(emAberto)).toBe(CENTAVOS_INADIMPLENTES_EM_ABERTO)
    // A recuperação: marcada Inadimplente e já liquidada (R$ 1.228,64 na M1).
    const recuperadas = inad.filter((l) => l.liquidacao !== null)
    expect(recuperadas).toHaveLength(1)
    expect(centavosDe(recuperadas)).toBe(122_864)
  })

  it('situação: em aberto 0 em 2024 e 4.830 em 2025-26; Conferido segue a distribuição medida na M1', () => {
    const l24 = doArquivo(ARQ_24)
    const l25 = doArquivo(ARQ_25_26)
    expect(l24.filter((l) => l.liquidacao === null)).toHaveLength(0)
    expect(l25.filter((l) => l.liquidacao === null)).toHaveLength(EM_ABERTO_25_26)

    const dist = (ls: readonly ContaReceberCru[]) => {
      const m: Record<string, number> = {}
      for (const l of ls) m[l.conferido ?? '(vazio)'] = (m[l.conferido ?? '(vazio)'] ?? 0) + 1
      return m
    }
    // A M1 listou "vazio 10.349" e "vazio 25.198": são 1 a mais que (títulos − marcados) porque a
    // contagem do relatório incluiu a LINHA DE TOTAL (Conferido vazio). Sem ela: 10.348 e 25.197 —
    // aqui o vazio é DERIVADO (títulos − marcados), e só os marcados são fixados.
    expect(dist(l24)).toEqual({ '(vazio)': TITULOS_24 - 6, Pendente: 6 })
    expect(dist(l25)).toEqual({
      '(vazio)': TITULOS_25_26 - (3_079 + 305 + 22), Sim: 3_079, Pendente: 305, Inadimplente: 22,
    })
  })

  it('22 emissões anuladas no 25-26 (15 data zero + 7 antes de 2015), 1 no 24 (emissão de 2014, abaixo do piso de 2015 — errata 1) — viram null, a linha permanece e o aviso conta', () => {
    const r = ok()
    expect(doArquivo(ARQ_24).filter((l) => l.emissao === null)).toHaveLength(1)
    expect(doArquivo(ARQ_25_26).filter((l) => l.emissao === null)).toHaveLength(EMISSOES_INVALIDAS_25_26)
    expect(r.datasRejeitadas.filter((d) => d.campo === 'emissao')).toHaveLength(EMISSOES_INVALIDAS_25_26 + 1)
    const avisos = r.diagnostico.avisos as string[]
    expect(avisos.some((a) => a.startsWith(`${EMISSOES_INVALIDAS_25_26 + 1} título(s) com Emissão inválida`))).toBe(true)
  })

  it('a faixa de datas recusa só vencimento ACIMA do limite (o de 2049); Liquidação nunca é recusada', () => {
    // Errata 1 do contrato: a guarda vale para toda data. O export traz 1 título em aberto com
    // vencimento 2049 (M1) — ele fica com `vencimento` null, é contado e avisado; a linha permanece.
    // (Se a contagem exata mudar numa fixture nova, fixe-a aqui depois de olhar o aviso.)
    const r = ok()
    const vencimentos = r.datasRejeitadas.filter((d) => d.campo === 'vencimento')
    expect(vencimentos.length).toBeGreaterThanOrEqual(1)
    expect(vencimentos.every((d) => d.valor >= '2032-01-01')).toBe(true)
    expect(r.datasRejeitadas.filter((d) => d.campo === 'liquidacao')).toHaveLength(0)
    expect(r.linhas.filter((l) => l.vencimento === null).length).toBeGreaterThanOrEqual(vencimentos.length)
  })

  it('lista fechada: nenhuma das 8 colunas que nunca se gravam atravessa o parser', () => {
    const campos = Object.keys(ok().linhas[0]).sort()
    expect(campos).toEqual([
      'arquivo_origem', 'conferido', 'descricao', 'emissao', 'linha_origem', 'liquidacao', 'numero',
      'operacao_propria', 'pessoa', 'valor_final', 'vencimento',
    ])
    const naoMapeadas = (ok().diagnostico.arquivos as { colunasNaoMapeadas: string[] }[])[0].colunasNaoMapeadas
    expect(naoMapeadas).toEqual(expect.arrayContaining(['Documento', 'Observações', 'Conta (Previsão)', 'Valor', 'Pendente com:']))
  })

  it('só o arquivo certo fecha: cada arquivo sozinho também passa (cada um traz a própria linha de total)', () => {
    for (const a of arquivos) {
      const r = parseContasReceberRows([a], { hoje: HOJE })
      if (!r.ok) throw new Error(`${a.nome}: ${r.codigo}`)
      expect(r.checksums).toHaveLength(1)
    }
  })

  it('mutante sobre o arquivo REAL: tirar um título do meio reprova o checksum (CHECKSUM_FALHOU)', () => {
    const rows = [...arquivos[0].rows]
    rows.splice(5, 1)   // título da linha 6 (o cabeçalho é a linha 1)
    const r = parseContasReceberRows([{ nome: ARQ_24, rows }], { hoje: HOJE })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
  })
})
