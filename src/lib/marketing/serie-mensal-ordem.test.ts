import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { serieMensalMultiAno } from './agregacao'
import { recortePadrao } from './periodo'

// Sonda ESTÁTICA do bug "barras do mais recente à ESQUERDA" (3ª rodada da v6.3.0). O Recharts 3 dá a
// posição de cada <Bar> pela ordem de REGISTRO no store do gráfico (push na montagem), não pela ordem
// do JSX. Com a página navegando no mesmo pathname, o gráfico segue montado e o <Bar> de um ano mais
// antigo, ligado depois, entrava no FIM do registro — saindo à direita do mais recente. Nenhum teste de
// unidade enxerga isso (é ordem de store), então a sonda trava a CURA: o gráfico mensal tem de
// remontar quando o conjunto de anos muda (`key` do BarChart derivado dos anos).

const FONTE = readFileSync(join(process.cwd(), 'src/components/marketing/gastos/serie-mensal.tsx'), 'utf8')

describe('Despesas mensais — a ordem das barras não depende da ordem de montagem', () => {
  it('o BarChart mensal tem `key` derivada do conjunto de anos (remonta quando ele muda)', () => {
    const abertura = FONTE.match(/<BarChart\s+key=\{chaveDosAnos\}[^>]*data=\{dadosMensais\}/)
    expect(abertura).not.toBeNull()
    expect(FONTE).toMatch(/const chaveDosAnos = serie\.anos\.join\(/)
  })

  it('os <Bar> saem de `serie.anos`, que é CRESCENTE mesmo com as fatias fora de ordem', () => {
    const fatia = (ano: number) => ({ ano, recorte: recortePadrao(ano, '2026-10-08'), linhas: [] })
    expect(serieMensalMultiAno([fatia(2026), fatia(2024), fatia(2025)]).anos).toEqual([2024, 2025, 2026])
    expect(FONTE).toMatch(/serie\.anos\.map\(\(ano, i\) => \(\s*<Bar/)
  })
})
