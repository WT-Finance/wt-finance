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

## Referência

- `references/AGENTS.md` — as regras completas (Interactions, Forms, Feedback, Navigation,
  Content, Accessibility, Performance, Design). Ler sob demanda; não colar em delegações.
