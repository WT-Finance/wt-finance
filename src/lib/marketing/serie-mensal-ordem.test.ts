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
//
// Desde a v6.5.0 o gráfico vive no componente COMPARTILHADO (`shared/grafico-mensal-por-ano.tsx`, também
// usado pelo Financeiro · Geral); `marketing/gastos/serie-mensal.tsx` é só o adaptador. A sonda lê o
// compartilhado — é lá que a cura mora — e confere que o adaptador continua delegando a ele.

const FONTE = readFileSync(join(process.cwd(), 'src/components/shared/grafico-mensal-por-ano.tsx'), 'utf8')
const ADAPTADOR = readFileSync(join(process.cwd(), 'src/components/marketing/gastos/serie-mensal.tsx'), 'utf8')

describe('Despesas mensais — a ordem das barras não depende da ordem de montagem', () => {
  it('o BarChart mensal tem `key` derivada do conjunto de anos (remonta quando ele muda)', () => {
    const abertura = FONTE.match(/<BarChart\s+key=\{chaveDosAnos\}[^>]*data=\{dadosMensais\}/)
    expect(abertura).not.toBeNull()
    expect(FONTE).toMatch(/const chaveDosAnos = anosCarregados\.join\(/)
  })

  it('os <Bar> saem de `anosCarregados`, ordenado por ano CRESCENTE mesmo com a entrada fora de ordem', () => {
    const fatia = (ano: number) => ({ ano, recorte: recortePadrao(ano, '2026-10-08'), linhas: [] })
    expect(serieMensalMultiAno([fatia(2026), fatia(2024), fatia(2025)]).anos).toEqual([2024, 2025, 2026])
    // O compartilhado ordena por ano ele mesmo (não confia na ordem de quem chama) e deriva os Bars daí.
    expect(FONTE).toMatch(/\[\.\.\.series\]\.sort\(\(a, b\) => a\.ano - b\.ano\)/)
    expect(FONTE).toMatch(/anosCarregados = useMemo\(\(\) => ordenadas\.map\(s => s\.ano\)/)
    expect(FONTE).toMatch(/anosCarregados\.map\(\(ano, i\) => \(\s*<Bar/)
  })

  it('o adaptador de Marketing delega ao compartilhado, com o eixo invertido (despesa negativa sobe)', () => {
    expect(ADAPTADOR).toMatch(/<GraficoMensalPorAno[\s\S]*\binvertido\b[\s\S]*\/>/)
  })
})
