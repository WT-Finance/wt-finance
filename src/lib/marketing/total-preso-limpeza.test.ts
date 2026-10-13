import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// Sonda ESTÁTICA (o projeto não tem ambiente DOM nos testes): o hook do total preso escreve
// `transform` direto nas células, e o React — que não sabe desse estilo — REAPROVEITA células entre
// renders. O rótulo do ano no cabeçalho tem a mesma key aberto e recolhido, mas só leva
// `data-total-ano` quando aberto: uma limpeza por esse atributo deixava o translateX antigo no ano
// RECOLHIDO, e o ano "sumia" do cabeçalho (bug visto pelo Yan duas vezes, v6.3.0). A limpeza tem de
// varrer TODA célula (th, td) antes de remedir.

const fonte = readFileSync(
  path.join(process.cwd(), 'src/components/marketing/gastos/use-total-preso.ts'),
  'utf8',
)

describe('useTotalPreso — limpeza do deslocamento antes de remedir', () => {
  it('varre todas as células (th, td), não só as marcadas data-total-ano', () => {
    expect(fonte).toMatch(/querySelectorAll<HTMLElement>\('th, td'\)/)
  })

  it('a limpeza geral vem ANTES da coleta das células de total', () => {
    const limpeza = fonte.indexOf("querySelectorAll<HTMLElement>('th, td')")
    const coleta = fonte.indexOf("querySelectorAll<HTMLElement>('[data-total-ano]')")
    expect(limpeza).toBeGreaterThan(-1)
    expect(coleta).toBeGreaterThan(limpeza)
  })
})

// O BLOCO "Total + %" prende junto: a "%" (cabeçalho de baixo, corpo e rodapé) tem de levar
// `data-total-ano` (para receber o transform) E `data-total-pct` (para NÃO receber a sombra à esquerda,
// que é do bloco), e o hook mede a largura do bloco até a borda direita da "%".
const tabela = readFileSync(
  path.join(process.cwd(), 'src/components/marketing/gastos/tabela-categorias.tsx'),
  'utf8',
)

describe('useTotalPreso — bloco Total + % (a "%" move junto, sem sombra própria)', () => {
  it('as células da "%" (th, td do corpo, td do rodapé) levam data-total-ano e data-total-pct', () => {
    const marcadas = tabela.match(/data-total-ano=\{a\.ano\} data-total-pct=""/g) ?? []
    expect(marcadas).toHaveLength(3)
  })

  it('o hook mede a borda direita da "%" e só exclui a sombra dela', () => {
    expect(fonte).toMatch(/\[data-total-pct\]/)
    expect(fonte).toMatch(/fim - total\.offsetLeft/)
    expect(fonte).toMatch(/dataset\.totalPct !== undefined/)
  })
})
