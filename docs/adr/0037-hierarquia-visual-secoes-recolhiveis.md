# ADR 0037 — Hierarquia visual de seções recolhíveis

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.6-m1

## Contexto

Na implementação v3.5, os cabeçalhos das seções recolhíveis (Visão Geral, Visão Analítica por Operação) ficaram visualmente sutis: texto cinza claro, centralizados, chevron pequeno (~10px). Em screenshots do dashboard, os cabeçalhos passavam despercebidos, comprometendo a sensação de hierarquia e a usabilidade do recolhimento.

O mockup original previa cabeçalhos visualmente proeminentes.

## Decisão

Cabeçalhos de seções recolhíveis (`TopSection`) adotam padrão de alta visibilidade:

- **Chevron grande (20px)** à esquerda, indica estado expandido/recolhido via rotação (0° → 90°)
- **Label bold**, texto `zinc-800` em `text-base`
- **Fundo levemente colorido:** gradient `from-[#FBF1E1] to-transparent` com hover `from-[#f3e3c8]`
- **Faixa lateral em `#BD965C`** (`border-l-4`) como âncora visual da marca Weddings
- **Padding generoso:** `px-5 py-4` para presença visual adequada
- **Implementação:** `<details open>` nativo com `group-open:rotate-90` no SVG do chevron

Seções internas (`Section`) mantêm estilo mais discreto: chevron 16px, texto `zinc-700`, sem fundo colorido.

## Justificativa

O recolhimento de seção é um gesto de organização de alto nível. Um cabeçalho que não se destaca remove a possibilidade prática de usar o recurso. A hierarquia visual clara (`TopSection` proeminente → `Section` discreta → card com subtítulo) orienta o olhar sem precisar de instrução.

## Consequências

**Positivas:**
- Cabeçalho impossível de ignorar em screenshot
- Comportamento recolhível visualmente óbvio
- Consistência com paleta oficial Weddings (`#BD965C`, `#FBF1E1`)

**Negativas / trade-offs:**
- Fundo colorido usa Tailwind arbitrary values (`from-[#FBF1E1]`), que funcionam em Tailwind v4 mas devem ser registrados se migrar para JIT com config explícita
