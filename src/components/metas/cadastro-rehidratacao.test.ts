import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Guard do gatilho de re-hidratação do Cadastro de Metas (v5.4.4) ──────────
//
// O achado CRÍTICO da revisão desta versão: a página do Cadastro passou a ter DOIS
// quadros, cada um com seu Salvar e sua Server Action, e as duas chamam
// `revalidatePath('/metas/cadastro')` + `router.refresh()`. O refresh reexecuta o Server
// Component, que refaz as DUAS RPCs e entrega arrays NOVOS aos dois quadros — inclusive
// para aquele cujo conteúdo não mudou.
//
// Enquanto o gatilho de re-hidratação era a REFERÊNCIA do array (`metas !== metasPrev`),
// salvar um quadro re-hidratava o OUTRO e apagava, sem diálogo e sem undo, tudo o que
// estivesse digitado nele. E digitar nos dois antes de salvar é o caminho de uso CENTRAL
// da tela: a coluna Weddings do quadro de cima mostra a soma ao vivo do de baixo.
//
// O gatilho correto é o `ano` (primitivo, só muda em navegação real, que já é guardada por
// `window.confirm`). Quem zera as pendências passou a ser o Salvar, promovendo ao baseline
// apenas as linhas que ele enviou.
//
// POR QUE UM TESTE DE FONTE, e não de comportamento: a regressão é no encadeamento de
// estado do React, e o projeto não tem `@testing-library/react` (vitest roda em ambiente
// `node`). Acrescentar a dependência é decisão de tooling, não de um patch. Este guard é
// grosseiro de propósito e verifica exatamente uma coisa: que ninguém devolveu o gatilho
// para a referência do array. Se um dia houver teste de componente, este pode sair.

const ARQ = {
  'cadastro-grade.tsx':          new URL('./cadastro-grade.tsx', import.meta.url),
  'cadastro-grade-subsetor.tsx': new URL('./cadastro-grade-subsetor.tsx', import.meta.url),
  'cadastro-metas.tsx':          new URL('./cadastro-metas.tsx', import.meta.url),
} as const

const fonte = Object.fromEntries(
  Object.entries(ARQ).map(([nome, url]) => [nome, readFileSync(url, 'utf8')]),
) as Record<keyof typeof ARQ, string>

describe('Cadastro de Metas — gatilho de re-hidratação', () => {
  it.each(Object.keys(ARQ) as (keyof typeof ARQ)[])(
    '%s re-hidrata pelo ANO, não pela referência do array',
    nome => {
      const s = fonte[nome]
      expect(s, `${nome}: o guard "if (ano !== anoPrev)" desapareceu`).toContain('ano !== anoPrev')
    },
  )

  it.each(Object.keys(ARQ) as (keyof typeof ARQ)[])(
    '%s NÃO usa a referência do array como gatilho',
    nome => {
      const s = fonte[nome]
      // As duas formas exatas que causaram o bug. Um `!== <algo>Prev` sobre o array de
      // metas volta a acoplar os dois quadros pelo refresh.
      expect(s, `${nome}: gatilho por referência de \`metas\` reintroduzido`)
        .not.toMatch(/metas\s*!==\s*metasPrev/)
      expect(s, `${nome}: gatilho por referência de \`metasSubsetor\` reintroduzido`)
        .not.toMatch(/metasSubsetor\s*!==\s*metasSubPrev/)
    },
  )

  it('os dois Salvar promovem ao baseline só as linhas ENVIADAS', () => {
    // Com o gatilho no ano, o refresh não zera mais dirty/pendências — quem zera é o
    // Salvar. Se isso sair, o contador "N alteração(ões) não salva(s)" fica preso em N
    // depois de um Salvar bem-sucedido.
    for (const nome of ['cadastro-grade.tsx', 'cadastro-grade-subsetor.tsx'] as const) {
      expect(fonte[nome], `${nome}: promoção do baseline pós-Salvar desapareceu`)
        .toMatch(/const enviadas = pendentes[\s\S]{0,400}setBaseline\(/)
    }
  })
})
