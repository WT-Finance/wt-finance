# Out-briefing — v5.1.10 · Sombra dos cards nas seções recolhíveis

**Tipo:** PATCH · **SEM migration · SEM ADR** · base main @ v5.1.9.

## Problema

O `TopSection` (barra recolhível única da plataforma, reescrito na v5.1.9/4º round com a
animação "linha-cortina") usa `overflow-hidden` na janela de revelação. Esse clip é
**necessário para a animação vertical** (a cortina que revela `grid-template-rows` `0fr↔1fr`),
mas `overflow-hidden` clipa **nos quatro lados** — cortando a **sombra dos cards encostados nas
bordas laterais** da seção. Mais visível no hover dos cards clicáveis (`.card-clicavel:hover` =
`box-shadow: 0 0 0 1px var(--brand), 0 4px 12px -2px …` → a sombra sangra ~10px para os lados).

Era o achado **BAIXO** que o `revisor` registrou na v5.1.9 (aceito à época como imperceptível);
o Yan reportou como visível na tela de Performance/Weddings.

## Correção (1 arquivo de código)

`src/components/shared/top-section.tsx` — na janela de revelação (o `div` com `overflow-hidden`):

- **`-mx-4 px-4`** no clip: estende a região de clip 16px para **cada lado** (entrando na `px-8`
  do `<main>` — sobra folga de 16px, **sem gerar barra de rolagem horizontal**) e re-padroniza o
  conteúdo de volta 16px, de modo que **o conteúdo segue alinhado à barra** mas o clip passa a
  acomodar a sombra com folga (~6px sobre os ~10px de sangramento do hover). É o idioma CSS padrão de
  "deixar a sombra respirar dentro de um clip".
- **`inset-x-3` → `inset-x-7`** na linha-cortina: como o clip ganhou 16px de padding lateral, a
  linha precisa de 28px de inset (16 + 12) para permanecer **12px dentro do conteúdo** (posição visual
  idêntica à v5.1.9).

> Nota: comecei em 12px (`-mx-3 px-3`) e o `revisor` aprovou, mas apontou (BAIXO) que 12px cobria os
> ~10px da sombra com só ~2px de folga. Alarguei para 16px preventivamente — mesma geometria, folga
> confortável. A matemática do alinhamento e da linha-cortina foi re-verificada (cancela exato; linha
> pixel-idêntica à v5.1.9).

A folga **vertical** já vinha do `pt-6/pb-5` do corpo (cobre o sangramento vertical ~14px do hover)
— só a horizontal faltava.

**Platform-wide por construção:** o `TopSection` é o único componente de barra recolhível, então a
correção vale para todas as seções recolhíveis (Performance, Weddings, Fluxo de Caixa, Gerencial, Metas).

## Docs

- `docs/design-system.md` §Seções recolhíveis/linha-cortina: registrado o item **"folga lateral p/ a
  sombra dos cards"** como o idioma padrão — qualquer clip novo que envolva cards com sombra deve segui-lo.
- `CHANGELOG.md` [5.1.10], `changelog-diretoria.ts` (correção, linguagem de negócio), `package.json`
  (5.1.10; `version.ts` deriva), `WORKING-CONTEXT.md`.

## Gates

`npx tsc --noEmit` **0 erros** · `npx eslint` (arquivos alterados) **0** · `npm test` **415 passed** ·
`npx next build` **OK**. **revisor: APROVADO** (verificação geométrica completa do box-model contra os
valores reais do repo; 1 achado BAIXO informativo — folga apertada de 12px — endereçado alargando p/ 16px).

## Nota de estado (verificada ao vivo nesta sessão)

- **Migration 0184 (rótulos de Metas) APLICADA** — sonda ao vivo confirmou: `app.rbac_areas` já tem
  "Metas/Cadastro"/"Metas/Acompanhamento" e a 0184 consta no `schema_migrations`. O Yan aplicou após o
  merge da v5.1.9 (da raiz). Pendência da v5.1.9 **encerrada**.

## Pendências (inalteradas, herdadas)

- Faturamento em MODO TESTE (flip = decisão do Yan).
- Monde Scope B (aposentar o upload de Vendas): construir o fato/mv item-level e repontar as 6 funções
  que ainda leem `analytics.fato_venda` direto.
- `SMTP_*` na Vercel; `%Rec` no Cadastro de Metas.
- Riscos registrados da linha-cortina (v5.1.9, inalterados): popovers `absolute` não-portal sob o clip
  (follow-up createPortal); teste de contrato do `monde_ingest_status`.
