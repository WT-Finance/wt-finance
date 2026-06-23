# ADR-0129 — Enforcement de token de cor (lint + teste de presença)

**Status:** Aceito · **Data:** 2026-06-23 · **Versão:** v4.26.0 (Fase A / A3)
**Estende:** [ADR-0103](0103-paleta-de-cores-canonica.md) (paleta canônica — "cor por contexto semântico, sempre via token, nunca hex"). Não substitui; adiciona o **enforcement**.

## Contexto

O ADR-0103 já definia a regra de cor: tudo via token CSS, nunca hex/classe crua. Mesmo assim, divergências reintroduziam-se a cada versão — `emerald` em vez de `--success`, âmbar fora da paleta, hover preto cru, valores quase-pretos. Cada uma foi corrigida pontualmente e **voltava**, porque a regra dependia de **alguém lembrar** (convenção no CLAUDE.md + auditoria manual).

O mapeamento (fase 1, v4.26) revelou a tese central: **a ÚNICA divergência de cor que foi corrigida e NÃO voltou foi o shorthand `[--token]`** — exatamente a única que ganhou um **lint** (`wt/no-tailwind-var-shorthand`, v4.17.0; zero ocorrências desde então). Conclusão: a "base sólida" é **enforcement automatizado**, não convenção.

## Decisão

Operacionalizar o ADR-0103 com duas barreiras automáticas, no padrão já provado do plugin ESLint inline `wt`:

1. **Lint `wt/no-cor-hardcoded`** (irmã da `no-tailwind-var-shorthand`), nível `error`, em `src/**/*.{ts,tsx}`:
   - Classe de cor **CRUA** do Tailwind — `(bg|text|border|ring|fill|stroke|from|to|via)-(emerald|amber|red|green|blue|yellow)-\d{2,3}` → exige o token semântico do DS (`text-success`, `bg-danger-bg`, `text-warning`, `bg-action-*`, etc.).
   - **Hex em classe** — `(...)-[#rrggbb]` → exige `[var(--token)]` ou a utilitária do token.
   - **`zinc` é PERMITIDO** (cinza de UI neutro, uniforme — tokenizá-lo é decisão grande, fora do v4.26).
   - **`src/lib/email/**` é ISENTO** (via `files:` override): hex inline é obrigatório nos clientes de e-mail (Outlook não resolve CSS var; ver `docs/email-layout-guide.md`).

2. **Teste `tokens.test.ts`** (vitest): falha se um **token-âncora sumir** de `src/styles/tokens.css`, se os temas por aba pararem de redefinir `--brand`, se um token-chave não estiver exposto no `@theme`, se `--text-primary` deixar de ser `#2D2A26`, ou se o `--primary` azul legado for reintroduzido. Protege o **outro lado** da regressão (remover/renomear o token que o código consome — que degradaria telas em silêncio).

Juntas, as duas barreiras fecham o ciclo: o lint impede **reintroduzir** cor crua/hex; o teste impede **remover** o token. Ambas correm no gate de fechamento (`npm run lint` / `npm test`).

## Consequências

- **Positivas:** uma cor crua nova passa a **quebrar o lint/build** (provado com sonda na v4.26 — `text-emerald-500`/`bg-[#hex]`/`hover:bg-amber-50` sinalizados; `zinc` não). A regressão que custou caro (v4.16.1, 81 ocorrências; e os retornos de emerald/âmbar) deixa de depender de memória. Tokens expostos no `@theme` (v4.26/A1) tornam a utilitária do DS o caminho de menor atrito.
- **Custo:** ao adicionar um tom novo, é preciso criar o **token** (em `tokens.css` + expor no `@theme` se for usado como utilitária) — não dá mais para "chumbar um hex rápido". É o comportamento desejado.
- **Fora de escopo (follow-up):** os ~1.162 `zinc` (tokenizar é decisão à parte) e, depois disso, a **paleta fechada** (`@theme … initial`, que torna `bg-emerald-500` erro de _build_ — o guard-rail definitivo, só viável após zerar `zinc`).

## Alternativas consideradas

- **`eslint-plugin-tailwindcss`:** descartado — escrito para o config JS do Tailwind v3; compatibilidade problemática com o v4 (CSS-first, sem `tailwind.config.js`). O plugin inline `wt` (regex sobre `Literal`/`TemplateElement`) é mais simples e já provado no projeto.
- **Só reforçar a convenção no CLAUDE.md:** insuficiente — foi assim que as divergências voltaram. A convenção permanece (como documentação), mas o **lint** é o que segura.
