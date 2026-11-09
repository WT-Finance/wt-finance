import { chaveDeLinha } from '@/lib/dre/identidade'
import { chaveMemoria, type VisaoTabela } from './visoes'

// ── Exportar a DRE por centro (v6.5.1) — módulo PURO ─────────────────────────
// A planilha leva a VISÃO DA TELA, com todas as linhas (categorias abertas) e a memória no
// fim. Em Lado a lado: uma aba por centro (a Mensal dele) mais a consolidada. AOA puro — o
// componente só passa para a lib de planilha, como a exportação da Empresa.

export interface AbaExport {
  nome: string
  linhas: Array<Array<string | number | null>>
  larguras: number[]
}

const arred = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100) / 100)

/** Rótulo de cada coluna na planilha. Com mais de um grupo (Lado a lado: um por mês + o acumulado), o
 *  grupo vai junto — senão o cabeçalho repetiria "Trips" doze vezes. Coluna presa (Total/AV) fica como está. */
function rotulosExport(v: VisaoTabela): string[] {
  const rot = (c: VisaoTabela['colunas'][number]) => c.rotuloExport ?? c.rotulo
  if (v.grupos.length <= 1) return v.colunas.map(rot)
  const grupoDe: string[] = v.grupos.flatMap(g => Array.from({ length: g.span }, () => g.rotulo))
  let i = 0
  return v.colunas.map(c => (c.fixa ? rot(c) : `${grupoDe[i++] ?? ''} · ${rot(c)}`))
}

export function abaDaVisao(nome: string, v: VisaoTabela): AbaExport {
  const cab = ['Conta', ...rotulosExport(v)]
  const linhas: AbaExport['linhas'] = [cab]
  for (const l of v.linhas) {
    const k = chaveDeLinha(l)
    linhas.push([l.rotulo, ...v.colunas.map(c => (k ? arred(v.valores[c.id]?.[k]) : null))])
  }
  linhas.push([])
  linhas.push(['Memória (fora das somas)'])
  for (const m of v.memoria) {
    const k = chaveMemoria(m)
    linhas.push([m.rotulo, ...v.colunas.map(c => (c.tipo === 'valor' ? arred(v.valores[c.id]?.[k]) : null))])
  }
  return { nome: nome.slice(0, 31), linhas, larguras: [46, ...v.colunas.map(c => (c.tipo === 'valor' ? 16 : 9))] }
}

export function nomeArquivoCentro(rotulo: string, ano: number, geradoEm: string): string {
  const slug = rotulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
  return `dre-caixa-${slug}-${ano}-${geradoEm}.xlsx`
}
