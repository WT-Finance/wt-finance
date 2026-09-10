import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Raiz do repo calculada a partir DESTE arquivo (não do cwd do runner) — mesma cautela do
// `cabecalho-pagina.test.ts`. Este arquivo mora em `src/components/ui/`, um nível mais fundo
// que aquele (`src/styles/`), daí `../../../` em vez de `../../`.
const RAIZ_REPO = fileURLToPath(new URL('../../../', import.meta.url))

// ── Sonda: gatilho de ajuda "?" só pelo primitivo GatilhoAjuda (v5.9.4) ─────────────────
// O defeito já voltou DUAS VEZES depois de estar escrito na skill `ui-design-system` §2
// ("o gatilho é <button type="button">, NUNCA <span>"): a v5.4.2 pegou o achado ALTO do
// revisor num call-site, a v5.7.0 reintroduziu em código NOVO e foi pega de novo. Convenção
// em prosa não segura sozinha — cada tela nova reimplementa a mesma receita (bolinha 12px +
// "?" + Tooltip) do zero, span OU button, porque não existe um primitivo para importar. Esta
// sonda é o enforcement mecânico (régua de 5 destinos, destino 1: "o que dá para segurar por
// máquina não vira prosa"): varre o código-fonte (sem DOM — mesmo molde de
// `cabecalho-pagina.test.ts`/`nav-model.test.ts`) e reprova QUALQUER gatilho de ajuda que não
// passe pelo primitivo `GatilhoAjuda` (`src/components/ui/gatilho-ajuda.tsx`).
//
// O que É alvo: a tag `<span>`/`<button>` cujo ÚNICO conteúdo imediato é o "?" literal — a
// afordância de ajuda em si (com espaço/quebra de linha tolerados entre a tag e o "?", porque
// o Prettier quebra atributo longo e o "?" fica em linha própria).
//
// O que NÃO é alvo: qualquer "?" de texto corrido ("Excluir X? Esta ação..."), optional
// chaining (`?.`) ou ternário (`cond ? a : b`) — nenhum desses casa o padrão
// `>` seguido (só de espaço/quebra) por `?` seguido (só de espaço/quebra) por `</span>`/
// `</button>`. E o próprio primitivo `gatilho-ajuda.tsx`, que é a receita CANÔNICA, não a
// duplicação dela.

const RAIZES = ['src/app', 'src/components']
const PRIMITIVO = 'src/components/ui/gatilho-ajuda.tsx'

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
const FORA_DO_PRIMITIVO = ARQUIVOS.filter(a => relative(RAIZ_REPO, a).replace(/\\/g, '/') !== PRIMITIVO)

type Violacao = { arquivo: string; linha: number; motivo: string }

function ocorrencias(caminhoAbsoluto: string, padrao: RegExp, motivo: string): Violacao[] {
  const arquivo = relative(RAIZ_REPO, caminhoAbsoluto).replace(/\\/g, '/')
  const texto = readFileSync(caminhoAbsoluto, 'utf8')
  const linhaDe = (pos: number) => texto.slice(0, pos).split('\n').length
  return [...texto.matchAll(padrao)].map(m => ({ arquivo, linha: linhaDe(m.index), motivo }))
}

describe('gatilho de ajuda — só pelo primitivo GatilhoAjuda (v5.9.4)', () => {
  it('nenhum <span>?</span> de ajuda fora do primitivo', () => {
    // O primitivo fica fora também aqui: o comentário de cabeçalho dele cita `>?</span>`
    // como o anti-padrão que a sonda pega — texto, não JSX (falso positivo na 1ª rodada).
    const violacoes = FORA_DO_PRIMITIVO.flatMap(a => ocorrencias(
      a, />\s*\?\s*<\/span>/g,
      'gatilho de ajuda em <span> — inacessível por teclado; usar <GatilhoAjuda>',
    ))
    const mensagem = violacoes.map(v => `${v.arquivo}:${v.linha} — ${v.motivo}`).join('\n')
    expect(violacoes, mensagem).toEqual([])
  })

  it('nenhum <button>?</button> de ajuda duplicando a receita fora do primitivo', () => {
    const violacoes = FORA_DO_PRIMITIVO
      .flatMap(a => ocorrencias(
        a, />\s*\?\s*<\/button>/g,
        'receita do gatilho duplicada fora do primitivo; usar <GatilhoAjuda>',
      ))
    const mensagem = violacoes.map(v => `${v.arquivo}:${v.linha} — ${v.motivo}`).join('\n')
    expect(violacoes, mensagem).toEqual([])
  })
})
