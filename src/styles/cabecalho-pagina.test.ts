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
  const texto = readFileSync(caminhoAbsoluto, 'utf8')
  const linhaDe = (pos: number) => texto.slice(0, pos).split('\n').length

  // Casa a TAG inteira (`[^>]*` atravessa quebras de linha), mesmo quebrada em várias linhas (Prettier quebra `className` longo)
  // — a 1ª versão da sonda lia linha a linha e um `<h1` com atributos multilinha passava
  // verde com `zinc-900` dentro (achado BAIXO do revisor, v5.9.3).
  for (const h1 of texto.matchAll(/<h1\b[^>]*>/g)) {
    const tagH1 = h1[0]
    const linhaH1 = linhaDe(h1.index)

    if (/zinc-/.test(tagH1)) {
      violacoes.push({ arquivo, linha: linhaH1, motivo: '<h1> com classe zinc-* (esperado text-text-primary)' })
    }

    // Subtítulo de página: o 1º <p> nas ~3 linhas seguintes ao fim da tag do <h1>.
    const fimH1 = h1.index + tagH1.length
    const fimH1Fechado = texto.indexOf('</h1>', fimH1)
    const inicioJanela = fimH1Fechado === -1 ? fimH1 : fimH1Fechado + 5
    const janela = texto.slice(inicioJanela).split('\n').slice(0, 4).join('\n')
    const p = janela.match(/<p\b[^>]*>/)
    if (!p || p.index === undefined) continue
    const tagP = p[0]
    const linhaP = linhaDe(inicioJanela + p.index)

    if (/zinc-400|text-text-secondary|text-text-muted/.test(tagP)) {
      violacoes.push({ arquivo, linha: linhaP, motivo: '<p> de subtítulo fora do padrão (esperado text-text-subtle)' })
    }

    if (/style=\{\{\s*color/.test(tagH1) || /style=\{\{\s*color/.test(tagP)) {
      violacoes.push({
        arquivo, linha: linhaH1,
        motivo: 'cor de cabeçalho via style={{ color... }} — deve ser classe (o lint só enxerga classe)',
      })
    }
  }

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
