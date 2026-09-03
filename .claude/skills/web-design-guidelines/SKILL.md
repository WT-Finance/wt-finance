---
name: web-design-guidelines
description: Web Interface Guidelines da Vercel — checklist de acessibilidade, interações (teclado, foco, touch targets), formulários, animação, performance percebida e microdetalhes de UI. Use ao revisar código de UI (o revisor roda este checklist quando o escopo toca UI) e ao construir tela/fluxo novo com interações ricas (foco, drag, modal, formulário). Cobre o vazio real do DS do Janus (acessibilidade); em conflito com o DS (tokens, primitivos, cores), o DS do Janus SEMPRE vence.
---

# Web Design Guidelines (Vercel Web Interface Guidelines)

Fonte vendorada: [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines)
@ `4e799d4` (2026-07; MIT — licença em `references/LICENSE`). Ao atualizar, re-copiar
`references/AGENTS.md` do repo oficial e registrar o novo SHA aqui.

## Como usar

1. **Revisão de UI** (uso principal — o `revisor` roda isto quando o escopo toca UI):
   ler `references/AGENTS.md` (150 linhas, regras MUST/SHOULD/NEVER) e verificar os arquivos
   do escopo contra elas. Reportar por severidade no formato padrão do parecer: violação de
   MUST/NEVER → ALTO; SHOULD → MÉDIO/BAIXO. Saída concisa, alto sinal-ruído.
2. **Construção de tela nova** com interações ricas (foco, teclado, modal, formulário, drag):
   ler o AGENTS.md ANTES de implementar, junto da skill `ui-design-system`.

## Fronteira com o DS do Janus (regra de precedência)

O DS do Janus (`ui-design-system`, `tabela-densa`, `graficos`) rege **tokens, cores,
primitivos, espaçamento e formatação** — nesses temas, o DS **vence** qualquer sugestão
divergente destas guidelines. Este checklist cobre o que o DS **não** cobre: acessibilidade
(ARIA, teclado, foco, contraste), semântica de HTML, comportamento de formulário, touch
targets, animação acessível (`prefers-reduced-motion`) e performance percebida. Se uma regra
daqui pedir mudança estrutural no DS (ex.: outro anel de foco), **não aplicar por conta** —
registrar e perguntar (fronteira de produto/DS).

## Armadilha recorrente: `disabled` nativo REMOVE do tab-order

Decidir "não escondo o controle, explico por que está bloqueado" e implementar com `disabled`
é contraditório: `disabled` tira o elemento do tab-order, então quem navega por teclado
**passa direto** e nunca descobre que o controle existe — muito menos o motivo. E `title`,
que é o reflexo natural para explicar, só é percebido no hover: serve a quem usa mouse.

```tsx
// ERRADO: a explicação existe e é inalcançável por teclado
<button disabled={bloqueado} title={motivo} aria-label={`Excluir ${nome}`}>

// CERTO: inerte MAS focável, com o motivo no nome acessível e descrito
<button
  aria-disabled={bloqueado}
  onClick={() => { if (!bloqueado) agir() }}
  aria-label={bloqueado ? `Não é possível excluir ${nome}: ${motivo}` : `Excluir ${nome}`}
  aria-describedby={bloqueado ? idMotivo : undefined}
>
{bloqueado && <span id={idMotivo} className="sr-only">{motivo}</span>}
```

`aria-disabled` não bloqueia o clique por si — o handler precisa checar o estado. Em troca, o
elemento continua na ordem de tabulação e anuncia o porquê. (Custou caro na v5.9.1: o botão
de excluir anexo bloqueado por campo obrigatório; achado MÉDIO do `revisor`.)

**Quando `disabled` nativo é o certo:** controle temporariamente inerte por operação em curso
(salvando, enviando), em que não há motivo a comunicar além do próprio spinner visível.

## Referência

- `references/AGENTS.md` — as regras completas (Interactions, Forms, Feedback, Navigation,
  Content, Accessibility, Performance, Design). Ler sob demanda; não colar em delegações.
