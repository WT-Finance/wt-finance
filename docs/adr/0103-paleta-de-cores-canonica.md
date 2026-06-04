# ADR-0103 — Paleta de cores canônica (cor por contexto semântico)

**Status:** Aceito
**Data:** 2026-06-04
**Extensão de:** ADR-0095 (padrão de gráficos / primitivos `@/components/charts`)
**Contexto:** A investigação adversarial da v4.9.x → v4.10 mapeou o uso de cor nas séries de dado e encontrou divergências reais — inclusive no próprio Weddings: cash-flow com duas paletas (drawer em `--positive`/`--negative`, cards hardcodando `#0091B3`/`#D9A23F`); margem ora `#6366f1` ora `--brand-deep`; fallback de subsetor hardcoded `#BA7517` divergindo do fallback central `--brand`; cinzas Tailwind crus no Mix por Produto. Além disso, há **duas cores por setor** que se confundiam: o **destaque** (`--brand`, cor da aba, resolvido por `[data-theme]`) e a **identidade** (`--setor-*`/`SETOR_COLORS`, para breakdown cross-setor). E uma **colisão**: `--brand` sob `[data-theme=trips]` (`#0091B3`) era idêntico ao antigo `fluxoColors.entrada` (`#0091B3`).

## Decisão

**Regra mestra:** cor por **contexto semântico**, SEMPRE via token CSS, NUNCA hex literal num componente. Tabela canônica única:

| Contexto | Cor canônica | Observação |
|---|---|---|
| Série principal única | `var(--brand)` | Herda a aba via `[data-theme]` (Weddings dourado, Trips turquesa, Corp verde-escuro) |
| Ênfase secundária | `var(--brand-deep)` | Mesma herança, tom mais profundo |
| Multi-série YoY | Faturamento `var(--brand)` / Receita `var(--text-secondary)` | Cor = métrica; traço = período (sólido atual / tracejado anterior) |
| **Margem** | `var(--brand-deep)` | Elimina o indigo `#6366f1` solto |
| **Cash-flow** (entrada/saída/resultado) | `var(--positive)` / `var(--negative)` via `fluxoColors` | Semântica fixa, idêntica em todas as abas; elimina `#0091B3`/`#D9A23F` **e a colisão de Trips** |
| Composição interna (subsetor) | `var(--subsetor-*)` (fallback `var(--brand)` via `subsetorColor` de `@/lib/config`) | Só Weddings; identidade fixa, NÃO herda a aba |
| Breakdown cross-setor | `var(--setor-*)` (`SETOR_COLORS`) | Só Executiva / futura aba Geral |
| Cauda "Outros" / texto neutro em Mix | tokens de texto (`--text-muted`/`--text-subtle`) | Elimina cinzas Tailwind crus |

**As duas cores por setor (papéis distintos):**
- **Destaque** `--brand` (via `[data-theme]`): dentro da aba de um setor, as séries de dado usam o destaque, que herda a cor da aba automaticamente.
- **Identidade** `--setor-*`: só em gráficos cross-setor (recorte por setor macro).

## Consequências

- **Cash-flow canônico = `--positive`/`--negative`** (verde sage / terracota), centralizado em `fluxoColors` (`chart-theme.ts`). Os tokens `--chart-fluxo-entrada/saida` (azul/mostarda) foram removidos — eliminam a colisão com `--brand` de Trips na origem. Telas que mudaram de cor visualmente (Weddings): card **Fluxo de Caixa Mensal** e gráfico **Caixa Acumulado** (drawer da operação já estava em verde/terracota; agora os cards o acompanham). Mudança intencional, listada no out-briefing.
- **Margem = `--brand-deep`** em todo lugar (`tendencia-margem-chart`), unificando com o drawer rico.
- **Fallback de subsetor = `--brand`** (central, via `subsetorColor`); removido o `#BA7517` hardcoded local de `weddings-kpis-section` e `sumario-subsetor`.
- **Risco de recriar a colisão:** uma sessão futura que hardcode `#0091B3` para série principal em Trips reintroduz o problema. Por isso: tudo via token; cash-flow em verde/terracota; e onde série principal coexistir com cash-flow numa tela de Trips, validar contraste (usar `--brand-deep` se preciso).
- **Convenção `--text-tertiary`:** o briefing citou `--text-tertiary`; o design system tem a escala primary/secondary/muted/subtle — usou-se `--text-muted` (terciário semântico existente), sem criar token duplicado.
