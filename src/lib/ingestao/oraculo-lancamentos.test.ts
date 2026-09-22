import { describe, it, expect } from 'vitest'
import { parseLancamentosCategoriaRows, type LancamentoCategoriaCru } from './parsers/lancamentos-categoria'
import {
  lerMatrizXlsx, porCabecalho, fixturesAusentes, motivoDoPulo, EXIGIR_FIXTURES,
} from './fixtures-oraculo'
import type { Matriz } from './parsers/comum'
import { toCentavos } from '@/lib/carga/coercao'

// ── GATE 1 · Oráculo cru ↔ tratado de Lançamentos por Categoria (as duas bases irmãs) ────────
//
// Anexo §9:
//   Movimentação: cru 94.817×15 → tratado 94.667×13, Σ 717.710,74
//   Aberto:       cru 36.273×14 → tratado 36.176×12, Σ −33.479.830,06
//
// As divergências conhecidas são ENUMERADAS, não toleradas em bloco: o teste exige que o conjunto
// de células divergentes seja exatamente o previsto. Divergência nova reprova.

const FIXTURES = [
  'movimentacao-cru.xlsx', 'movimentacao-tratado.xlsx',
  'aberto-cru.xlsx', 'aberto-tratado.xlsx',
] as const
const AUSENTES = fixturesAusentes(FIXTURES)

/** "Hoje" FIXO. A guarda de faixa de data depende de hoje+5 anos; sem fixar, o oráculo mudaria de
 *  veredito com a passagem do tempo e o teste deixaria de ser reproduzível. É a data do export. */
const HOJE = new Date(Date.UTC(2026, 8, 21))

function diaUtc(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return null
}
/** Centavos pela regra do POSTGRES (meio-para-longe-de-zero), nunca `Math.round(v*100)`.
 *
 *  Não é preciosismo: o tratado do R guarda o valor bruto (`-188,615`) e a coluna de destino é
 *  `NUMERIC(18,2)`. `Math.round(-18861.5)` devolve −18861 (desempata para +∞) e o Postgres grava
 *  −188,62. Seis linhas do anexo de Movimentação caem exatamente nesse meio-centavo — e
 *  `-188.615` é o caso que a v5.8.0 já havia medido. Um oráculo que comparasse com `Math.round`
 *  reprovaria o parser CERTO por causa do próprio comparador. */
function centavos(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  return toCentavos(v)
}
function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

interface Caso {
  nome: string
  cru: string
  tratado: string
  linhas: number
  somaReais: number
  outlinesGrupo: number
  outlinesCategoria: number
  temMovimentacao: boolean
  /** Σ(valores arredondados) − Σ(valores exatos), em centavos. Não é erro: o cru traz mais de
   *  duas casas e as duas somas são grandezas diferentes. Fica MEDIDO para que uma mudança nele
   *  seja percebida. */
  deltaArredondamentoCentavos: number
  /** Células de data que a guarda de faixa recusou, as linhas que elas afetam, e quantas são do
   *  ano 1900 — os três números que o briefing §2.2 e §5-C declaram para esta base. */
  datasRejeitadas: number
  linhasComDataRejeitada: number
  datasAno1900: number
  temVencimentoAlemDe2031: boolean
}

const CASOS: Caso[] = [
  {
    nome: 'Movimentação', cru: 'movimentacao-cru.xlsx', tratado: 'movimentacao-tratado.xlsx',
    linhas: 94_667, somaReais: 717_710.74, outlinesGrupo: 15, outlinesCategoria: 133,
    temMovimentacao: true, deltaArredondamentoCentavos: 7,
    datasRejeitadas: 56, linhasComDataRejeitada: 55, datasAno1900: 30,
    temVencimentoAlemDe2031: false,
  },
  {
    nome: 'Vencimento em aberto', cru: 'aberto-cru.xlsx', tratado: 'aberto-tratado.xlsx',
    linhas: 36_176, somaReais: -33_479_830.06, outlinesGrupo: 15, outlinesCategoria: 80,
    temMovimentacao: false, deltaArredondamentoCentavos: 0,
    datasRejeitadas: 7, linhasComDataRejeitada: 7, datasAno1900: 0,
    temVencimentoAlemDe2031: true,
  },
]

it('as fixtures do oráculo estão presentes (ou o pulo está declarado)', () => {
  if (EXIGIR_FIXTURES) {
    expect(AUSENTES, `REQUIRE_FIXTURES=1 e ${motivoDoPulo(AUSENTES)}`).toEqual([])
  } else if (AUSENTES.length > 0) {
    expect(motivoDoPulo(AUSENTES)).toContain('fixture(s) ausente(s)')
  } else {
    expect(AUSENTES).toEqual([])
  }
})

describe.skipIf(AUSENTES.length > 0)('oráculo — Lançamentos por Categoria', () => {
  for (const caso of CASOS) {
    describe(caso.nome, () => {
      const resultado = parseLancamentosCategoriaRows(lerMatrizXlsx(caso.cru), { hoje: HOJE })
      const tratado = porCabecalho(lerMatrizXlsx(caso.tratado))

      it('o parse do CRU fecha — layout descoberto e checksums de outline conferidos', () => {
        if (!resultado.ok) throw new Error(`${resultado.codigo}: ${resultado.mensagem}`)
        expect(resultado.diagnostico.layout).toBe(caso.temMovimentacao ? 'movimentacao' : 'aberto')
        expect(resultado.diagnostico.outlinesGrupo).toBe(caso.outlinesGrupo)
        expect(resultado.diagnostico.outlinesCategoria).toBe(caso.outlinesCategoria)
        // 148 (15+133) em Movimentação e 95 (15+80) em Aberto, + a linha de total do arquivo.
        expect(resultado.checksums).toHaveLength(caso.outlinesGrupo + caso.outlinesCategoria + 1)
        expect(resultado.diagnostico.totalLinhasDeclarado).toBe(caso.linhas)
        expect(resultado.diagnostico.linhasIgnoradas).toBe(0)
      })

      it('a coluna "Número" é achada pelo CONTEÚDO, não pelo índice do cabeçalho', () => {
        if (!resultado.ok) throw new Error(resultado.mensagem)
        const colunas = resultado.diagnostico.colunas as Record<string, number>
        // Cabeçalho na coluna A (0), dado na coluna C (2). Se alguém "simplificar" para ler pelo
        // índice do cabeçalho, este expect cai — e a base inteira viria vazia.
        expect(colunas.numero).toBe(2)
      })

      it('contagem de linhas idêntica ao tratado', () => {
        if (!resultado.ok) throw new Error(resultado.mensagem)
        expect(resultado.linhas).toHaveLength(caso.linhas)
        expect(tratado).toHaveLength(caso.linhas)
      })

      it('a soma bate com o tratado linha a linha, e o checksum bate com o arquivo', () => {
        if (!resultado.ok) throw new Error(resultado.mensagem)

        // (a) PARIDADE com o legado: somando as duas pontas pela mesma regra (a do Postgres,
        //     que é a que a coluna NUMERIC(18,2) aplica), os totais são idênticos.
        const meus = resultado.linhas.reduce((a, l) => a + (toCentavos(l.valor) ?? 0), 0)
        const deles = tratado.reduce((a, l) => a + (centavos(l['Valor']) ?? 0), 0)
        expect(meus).toBe(deles)

        // (b) CHECKSUM do arquivo: o total que o export declara é o arredondamento da soma dos
        //     valores EXATOS, não a soma dos valores arredondados. Os dois números são
        //     diferentes de propósito e ambos estão certos — ver `AcumuladorBruto`.
        const total = resultado.checksums.find((c) => c.escopo === 'total-arquivo')
        expect(total?.centavosDeclarados).toBe(toCentavos(caso.somaReais))
        expect(total?.centavosApurados).toBe(total?.centavosDeclarados)
        expect(total?.centavosArredondados).toBe(meus)
        expect(meus - (total?.centavosApurados ?? 0)).toBe(caso.deltaArredondamentoCentavos)
      })

      it('célula a célula contra o tratado — divergências apenas nas datas fora de faixa', () => {
        if (!resultado.ok) throw new Error(resultado.mensagem)
        const divergencias: { coluna: string; linha: number; meu: unknown; dele: unknown }[] = []
        let celulas = 0

        resultado.linhas.forEach((meu: LancamentoCategoriaCru, i) => {
          const dele = tratado[i]
          const pares: [string, unknown, unknown][] = [
            ['Grupo de Categoria',  meu.grupo_categoria,     txt(dele['Grupo de Categoria'])],
            ['Categoria',           meu.categoria,           txt(dele['Categoria'])],
            ['Número',              meu.numero,              txt(dele['Número'])],
            ['Venda Nº',            meu.venda_numero,        txt(dele['Venda Nº'])],
            ['Emissão',             meu.emissao,             diaUtc(dele['Emissão'])],
            ['Vencimento',          meu.vencimento,          diaUtc(dele['Vencimento'])],
            ['Liquidação',          meu.liquidacao,          diaUtc(dele['Liquidação'])],
            ['Pessoa',              meu.pessoa,              txt(dele['Pessoa'])],
            ['Descrição',           meu.descricao,           txt(dele['Descrição'])],
            ['Descrição Categoria', meu.descricao_categoria, txt(dele['Descrição Categoria'])],
            ["Valor", toCentavos(meu.valor), centavos(dele["Valor"])],
            ['Conta',               meu.conta,               txt(dele['Conta'])],
          ]
          if (caso.temMovimentacao) {
            pares.push(['Movimentação', meu.movimentacao, diaUtc(dele['Movimentação'])])
          }
          for (const [coluna, m, d] of pares) {
            celulas++
            if (m !== d) divergencias.push({ coluna, linha: i + 1, meu: m, dele: d })
          }
        })

        const colunasDeData = new Set(['Emissão', 'Vencimento', 'Liquidação', 'Movimentação'])
        const foraDeData = divergencias.filter((d) => !colunasDeData.has(d.coluna))

        // Nenhuma divergência pode existir fora das colunas de data. Trim, `\xa0`, acento,
        // número: tudo tem de bater exatamente.
        expect(
          foraDeData.slice(0, 20),
          `${foraDeData.length} divergência(s) FORA das colunas de data (de ${celulas} células)`,
        ).toEqual([])

        // Nas colunas de data, a única divergência aceita é a guarda de faixa agindo: eu emito
        // `null` (data impossível nunca é convertida) onde o `readxl` do legado deixou passar uma
        // data implausível. O contrário — eu com data e o R com `null` — seria defeito meu.
        const naoExplicadas = divergencias.filter((d) => colunasDeData.has(d.coluna) && d.meu !== null)
        expect(
          naoExplicadas.slice(0, 20),
          `${naoExplicadas.length} divergência(s) de data em que o parser NÃO está rejeitando`,
        ).toEqual([])

        // E toda célula de data que eu zerei tem de estar contabilizada na guarda.
        const zeradas = divergencias.filter((d) => colunasDeData.has(d.coluna) && d.meu === null)
        expect(resultado.datasRejeitadas.length).toBe(zeradas.length)
      })

      it('toda data rejeitada está FORA da faixa [2015-01-01, hoje+5a] — e é contada', () => {
        if (!resultado.ok) throw new Error(resultado.mensagem)
        expect(resultado.datasRejeitadas).toHaveLength(caso.datasRejeitadas)
        expect(new Set(resultado.datasRejeitadas.map((r) => r.linha)).size)
          .toBe(caso.linhasComDataRejeitada)
        expect(resultado.datasRejeitadas.filter((r) => r.valor.startsWith('1900')).length)
          .toBe(caso.datasAno1900)
        for (const r of resultado.datasRejeitadas) {
          const dentro = r.valor >= '2015-01-01' && r.valor <= '2031-12-31'
          expect(dentro, `${r.campo} da linha ${r.linha}: ${r.valor} deveria estar fora da faixa`).toBe(false)
        }
        // Vencimento de parcela futura legítimo (2031-07 na base de em aberto) continua DENTRO:
        // a faixa de 5 anos existe exatamente para não recusá-lo.
        const futuras = resultado.linhas.filter((l) => (l.vencimento ?? '') >= '2031-01-01')
        expect(futuras.length > 0).toBe(caso.temVencimentoAlemDe2031)
      })
    })
  }
})

// ── Sondas: cada guarda VISTA reprovando por mutante ─────────────────────────────────────────

/** Export mínimo válido no formato real: cabeçalho com "Número" na coluna A e o dado na C,
 *  duas linhas de outline com os checksums, dois lançamentos e a linha de total. */
function exportValido(): unknown[][] {
  return [
    ['Número', null, null, 'Venda Nº', 'Emissão', 'Vencimento', 'Liquidação', 'Movimentação',
      'Pessoa', 'Descrição', 'Descrição Categoria', 'Valor', 'Categoria', 'Grupo de Categoria', 'Conta'],
    ['-', 'Grupo de Categoria : Repasse (2, -R$ 300,00)', null, null, null, null, null, null, null, null, null, null, null, null, null],
    ['', '-', 'Categoria : Fatura (2, -R$ 300,00)', null, null, null, null, null, null, null, null, null, null, null, null],
    ['', '', '100', 55, new Date(Date.UTC(2026, 0, 5)), new Date(Date.UTC(2026, 0, 9)), null,
      new Date(Date.UTC(2026, 0, 9)), 'Fulano', 'Pagamento', null, -100, 'Fatura', 'Repasse', 'Itau'],
    ['', '', '101', null, new Date(Date.UTC(2026, 0, 6)), new Date(Date.UTC(2026, 0, 10)), null,
      new Date(Date.UTC(2026, 0, 10)), 'Beltrano', 'Pagamento', null, -200, 'Fatura', 'Repasse', 'Itau'],
    [null, null, null, null, null, null, null, null, 2, null, null, -300, null, null, null],
  ]
}
const HOJE_SONDA = new Date(Date.UTC(2026, 0, 31))

describe('sondas do parser de Lançamentos (mutante ⇒ reprova)', () => {
  it('CONTROLE: o export mínimo sem mutante PASSA e lê os 3 checksums', () => {
    const r = parseLancamentosCategoriaRows(exportValido() as Matriz, { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(`${r.codigo}: ${r.mensagem}`)
    expect(r.linhas).toHaveLength(2)
    expect(r.checksums).toHaveLength(3)   // 1 grupo + 1 categoria + total do arquivo
    expect(r.linhas[0].numero).toBe('100')
    expect(r.linhas[0].venda_numero).toBe('55')   // número do cru vira texto, como no tratado
  })

  it('mutante: contagem declarada no outline diverge ⇒ CHECKSUM_FALHOU', () => {
    const m = exportValido()
    m[2][2] = 'Categoria : Fatura (3, -R$ 300,00)'
    const r = parseLancamentosCategoriaRows(m as Matriz, { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
  })

  it('mutante: soma declarada no outline diverge ⇒ CHECKSUM_FALHOU', () => {
    const m = exportValido()
    m[1][1] = 'Grupo de Categoria : Repasse (2, -R$ 299,99)'
    const r = parseLancamentosCategoriaRows(m as Matriz, { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
  })

  it('mutante: total do arquivo diverge ⇒ CHECKSUM_FALHOU', () => {
    const m = exportValido()
    m[5][11] = -301
    const r = parseLancamentosCategoriaRows(m as Matriz, { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
  })

  it('a coluna deslocada é resolvida no recuo MAIS PROFUNDO do vão, não no primeiro', () => {
    // Se duas colunas do vão tiverem conteúdo nas linhas de dado, a certa é a da direita: num
    // outline o recuo cresce para a direita e a linha de dado é o nível mais fundo. Pegar a
    // primeira leria o marcador de nível intermediário no lugar do Número — e a base inteira
    // sairia com a chave errada, sem que contagem ou soma acusassem nada.
    const m = exportValido()
    m[3][1] = '·'   // marcador de recuo intermediário aparece nas linhas de dado
    m[4][1] = '·'
    const r = parseLancamentosCategoriaRows(m as Matriz, { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(`${r.codigo}: ${r.mensagem}`)
    expect((r.diagnostico.colunas as Record<string, number>).numero).toBe(2)
    expect(r.linhas[0].numero).toBe('100')
  })

  it('mutante: linha de dado que PERDE a categoria não é engolida como linha de total', () => {
    // Sem esta guarda a linha cairia no ramo do rodapé, o total do arquivo seria sobrescrito por
    // ela e o erro sairia como "checksum do total não fecha" — mandando o humano procurar no
    // lugar errado. O defeito não some (o checksum pega), mas a mensagem mente.
    const m = exportValido()
    m[4][12] = null            // a segunda linha de lançamento perde a Categoria
    m[4][13] = null            // ...e o Grupo
    const r = parseLancamentosCategoriaRows(m as Matriz, { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('perdeu a categoria')
  })

  it('mutante: coluna obrigatória ausente no cabeçalho ⇒ ESTRUTURA_INESPERADA (não some calada)', () => {
    const m = exportValido()
    m[0][11] = 'Vlr'          // "Valor" deixa de ser reconhecível
    const r = parseLancamentosCategoriaRows(m as Matriz, { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('valor')
  })

  it('mutante: linha de outline em formato desconhecido ⇒ ESTRUTURA_INESPERADA', () => {
    const m = exportValido()
    m[1][1] = 'Grupo de Categoria : Repasse — 2 itens, R$ 300,00'
    const r = parseLancamentosCategoriaRows(m as Matriz, { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
  })

  it('mutante: data fora da faixa vira null e é CONTADA — nunca convertida', () => {
    const m = exportValido()
    m[3][4] = new Date(1900, 0, 1)   // ano 1900: o SheetJS entrega Date LOCAL "válida"
    const r = parseLancamentosCategoriaRows(m as Matriz, { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(`${r.codigo}: ${r.mensagem}`)
    expect(r.linhas[0].emissao).toBeNull()
    expect(r.datasRejeitadas).toHaveLength(1)
    expect(r.datasRejeitadas[0].campo).toBe('emissao')
    expect(r.datasRejeitadas[0].valor).toBe('1900-01-01')
    // A linha PERMANECE na carga: o contrato §7 diz que a carga aplica e reporta.
    expect(r.linhas).toHaveLength(2)
  })

  it('mutante: espaço nas pontas e `\\xa0` são aparados (a regra não é default de biblioteca)', () => {
    const m = exportValido()
    m[3][8] = '  Fulano  '
    m[3][14] = '\tItau '
    const r = parseLancamentosCategoriaRows(m as Matriz, { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(r.mensagem)
    expect(r.linhas[0].pessoa).toBe('Fulano')
    expect(r.linhas[0].conta).toBe('Itau')
  })

  it('a base de 14 colunas (sem "Movimentação") é lida pelo MESMO parser', () => {
    const m = exportValido().map((linha) => linha.filter((_, j) => j !== 7))
    // a linha de total muda de posição junto com a coluna removida
    const r = parseLancamentosCategoriaRows(m as Matriz, { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(`${r.codigo}: ${r.mensagem}`)
    expect(r.diagnostico.layout).toBe('aberto')
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[0].movimentacao).toBeNull()
  })
})
