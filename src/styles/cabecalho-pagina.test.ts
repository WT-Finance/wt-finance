import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Raiz do repo calculada a partir DESTE arquivo (não do cwd do runner) — mesma
// cautela do `tokens.test.ts`, que resolve `tokens.css` via `import.meta.url`.
const RAIZ_REPO = fileURLToPath(new URL('../../', import.meta.url))

// ── Sonda: cabeçalho de página tem UM padrão de cor (v5.9.3/M1) ────────────────
// Título de página: `text-xl font-semibold text-text-primary`. Subtítulo de página
// (o `<p>` logo abaixo do `<h1>`): `text-text-subtle`. A causa-raiz histórica de
// divergência visual foi cada tela reinventar a própria cor (`zinc-900`/`zinc-400`
// direto, ou `style={{ color: 'var(--text-muted)') }}` — o lint `wt/no-cor-hardcoded`
// só enxerga CLASSE, não `style`). Esta sonda varre o código-fonte (sem DOM — mesmo
// molde de `nav-model.test.ts`) e reprova qualquer cabeçalho fora do padrão.
//
// Não é alvo: label/hint/célula/ícone em zinc (fora do par h1+p do topo da tela).

const RAIZES = ['src/app', 'src/components']

function arquivosTsx(dir: string): string[] {
  const resultado: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) resultado.push(...arquivosTsx(caminho))
    else if (entrada.isFile() && caminho.endsWith('.tsx')) resultado.push(caminho)
  }
  return resultado
}

const ARQUIVOS = RAIZES.flatMap(raiz => arquivosTsx(join(RAIZ_REPO, raiz)))

type Violacao = { arquivo: string; linha: number; motivo: string }

function varrer(caminhoAbsoluto: string): Violacao[] {
  const violacoes: Violacao[] = []
  const arquivo = relative(RAIZ_REPO, caminhoAbsoluto).replace(/\\/g, '/')
  const linhas = readFileSync(caminhoAbsoluto, 'utf8').split('\n')

  linhas.forEach((linha, idx) => {
    const h1 = linha.match(/<h1\b[^>]*>/)
    if (!h1) return
    const tagH1 = h1[0]

    if (/zinc-/.test(tagH1)) {
      violacoes.push({ arquivo, linha: idx + 1, motivo: '<h1> com classe zinc-* (esperado text-text-primary)' })
    }

    // Subtítulo de página: <p> em até 3 linhas depois do <h1>.
    const janela = linhas.slice(idx + 1, idx + 4)
    const idxP = janela.findIndex(l => /<p\b/.test(l))
    if (idxP === -1) return
    const linhaP = janela[idxP]
    const tagP = (linhaP.match(/<p\b[^>]*>/) ?? [linhaP])[0]

    if (/zinc-400|text-text-secondary|text-text-muted/.test(tagP)) {
      violacoes.push({
        arquivo, linha: idx + 2 + idxP,
        motivo: '<p> de subtítulo fora do padrão (esperado text-text-subtle)',
      })
    }

    const blocoCompleto = [linha, ...janela.slice(0, idxP + 1)].join('\n')
    if (/style=\{\{\s*color/.test(blocoCompleto)) {
      violacoes.push({
        arquivo, linha: idx + 1,
        motivo: 'cor de cabeçalho via style={{ color... }} — deve ser classe (o lint só enxerga classe)',
      })
    }
  })

  return violacoes
}

describe('cabeçalho de página — título e subtítulo usam token do DS (v5.9.3/M1)', () => {
  it('nenhum <h1>/<p> de cabeçalho usa zinc-*, text-text-secondary ou text-text-muted, nem style inline', () => {
    const violacoes = ARQUIVOS.flatMap(varrer)

    const mensagem = violacoes
      .map(v => `${v.arquivo}:${v.linha} — ${v.motivo}`)
      .join('\n')

    expect(violacoes, mensagem).toEqual([])
  })
})
