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
