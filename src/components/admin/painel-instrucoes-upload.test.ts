import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PainelInstrucoesUpload from './painel-instrucoes-upload'
import { INSTRUCOES_UPLOAD } from '@/lib/ingestao/instrucoes-upload'

// Render no servidor do painel "Ver instruções" (v6.1.3), para as seis bases — a única prova
// automatizada de que o painel monta sem erro de runtime (a conferência visual depende de login).
// `.test.ts` (o include do vitest) ⇒ `createElement`, sem JSX.

function render(aberto: boolean, base: keyof typeof INSTRUCOES_UPLOAD) {
  return renderToStaticMarkup(
    createElement(PainelInstrucoesUpload, { id: 'p', aberto, instrucoes: INSTRUCOES_UPLOAD[base] }),
  )
}

describe('PainelInstrucoesUpload', () => {
  it.each(Object.keys(INSTRUCOES_UPLOAD) as (keyof typeof INSTRUCOES_UPLOAD)[])(
    '%s: renderiza as colunas e as seções',
    (base) => {
      const html = render(true, base)
      for (const c of INSTRUCOES_UPLOAD[base].colunas.itens) {
        // O markup escapa `&`, `<` etc.; nenhum rótulo de coluna tem esses caracteres hoje.
        expect(html).toContain(`>${c}</li>`)
      }
      for (const titulo of ['De onde vem o arquivo', 'Atenção', 'Passo a passo', 'Bom saber']) {
        expect(html).toContain(titulo)
      }
    },
  )

  it('fechado: o conteúdo continua montado, mas inert (fora do tab-order)', () => {
    const fechado = render(false, 'vendas')
    expect(fechado).toMatch(/^<div id="p" inert=""/)
    expect(fechado).toContain('Passo a passo')
    expect(render(true, 'vendas')).not.toContain('inert')
  })
})
