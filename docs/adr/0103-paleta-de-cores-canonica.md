# ADR-0103 — Paleta de cores canônica (cor por contexto semântico)

**Status:** Aceito
**Data:** 2026-06-04 · **Atualizado:** 2026-06-05 (v4.11 — regra de cor de cash-flow formalizada nas Consequências)
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
| **Cash-flow** (entrada/saída/resultado) | Semântica: `var(--positive)`/`var(--negative)` via `fluxoColors` (drawer de operação, Financeiro). **Exceção — cards de cash-flow da visão principal de Weddings** (Fluxo de Caixa Mensal, Acumulado de Recebimentos e Pagamentos): **identidade visual** turquesa/mostarda (`--chart-fluxo-entrada/saida`). | Decisão v4.10: nesses cards a id visual Welcome prevalece sobre a semântica. Sem colisão (Weddings é dourado; Trips/Corp não têm cash-flow). Resultado/ponto negativo seguem `--text-primary`/`--danger`. |
| Composição interna (subsetor) | `var(--subsetor-*)` (fallback `var(--brand)` via `subsetorColor` de `@/lib/config`) | Só Weddings; identidade fixa, NÃO herda a aba |
| Breakdown cross-setor | `var(--setor-*)` (`SETOR_COLORS`) | Só Executiva / futura aba Geral |
| Cauda "Outros" / texto neutro em Mix | tokens de texto (`--text-muted`/`--text-subtle`) | Elimina cinzas Tailwind crus |

**As duas cores por setor (papéis distintos):**
- **Destaque** `--brand` (via `[data-theme]`): dentro da aba de um setor, as séries de dado usam o destaque, que herda a cor da aba automaticamente.
- **Identidade** `--setor-*`: só em gráficos cross-setor (recorte por setor macro).

## Consequências

- **Cash-flow:** a semântica `--positive`/`--negative` (verde sage / terracota) via `fluxoColors` (`chart-theme.ts`) é usada no **drawer de operação** (Caixa Acumulado por Mês) e no **Financeiro**. **Decisão v4.10 (revisão):** os **cards de cash-flow da visão principal de Weddings** — *Fluxo de Caixa Mensal* e *Acumulado de Recebimentos e Pagamentos* — voltaram à **identidade visual Welcome** turquesa (`--chart-fluxo-entrada` #0091B3, Pantone 632) / mostarda (`--chart-fluxo-saida` #D9A23F), por melhor alinhamento à id visual. Os tokens `--chart-fluxo-*` foram restaurados em `tokens.css` para esse fim. Sem colisão: esses gráficos são de Weddings (`[data-theme=weddings]`, `--brand` dourado) e Trips/Corp não têm cash-flow.
- **Cash-flow tem DOIS contextos de cor — REGRA deliberada, NÃO dívida a corrigir** (formalizado na v4.11). São papéis distintos e intencionais: **IDENTIDADE** turquesa/mostarda (`--chart-fluxo-*`) nos **cards de PÁGINA de Weddings** (coesão com a identidade visual da área) vs **SEMÂNTICA** `--positive`/`--negative` no **drawer de operação** (contexto analítico de leitura entrada/saída). **Não unificar um no outro:** uma sessão futura NÃO deve "corrigir" a identidade dos cards para a semântica, nem a semântica do drawer para a identidade — ambos estão certos no seu contexto. (Esta linha encerra a antiga pendência "cor do drawer vs cards de cash-flow".)
- **Margem = `--brand-deep`** em todo lugar (`tendencia-margem-chart`), unificando com o drawer rico.
- **Fallback de subsetor = `--brand`** (central, via `subsetorColor`); removido o `#BA7517` hardcoded local de `weddings-kpis-section` e `sumario-subsetor`.
- **Risco de recriar a colisão:** uma sessão futura que hardcode `#0091B3` para série principal em Trips reintroduz o problema. Por isso: tudo via token; cash-flow em verde/terracota; e onde série principal coexistir com cash-flow numa tela de Trips, validar contraste (usar `--brand-deep` se preciso).
- **Convenção `--text-tertiary`:** o briefing citou `--text-tertiary`; o design system tem a escala primary/secondary/muted/subtle — usou-se `--text-muted` (terciário semântico existente), sem criar token duplicado.

## Extensão v4.14.1 — setor × plataforma

Regra que fecha a ambiguidade de "cor geral":

> **Cada setor usa sua cor de destaque nas SUAS abas** (Weddings `#BD965C`, Trips `#0091B3`,
> Corporativo `#0D5257`). **As telas de plataforma** — autenticação (`/login`, `/trocar-senha`,
> `/solicitar-acesso`, `/auth/*`), `/sem-acesso`, `/admin/*` e demais rotas não-setoriais —
> **usam o tema neutro do Group**. **Nenhuma cor de setor atua como cor geral.** O wordmark
> **WT FINANCE é dinâmico**: cor do setor dentro das abas de setor, neutro no resto.

**Implementação:** o `theme-provider` já resolve toda rota não-`/performance/*` para `[data-theme="group"]`
(neutro). Mas o `:root` tem `--brand: #BD965C` como default (Weddings), que daria **flash dourado**
nas telas de plataforma antes da hidratação do provider. Por isso essas telas **não usam
`var(--brand)`** — usam **tokens neutros dedicados, independentes de `[data-theme]`**:
`--action-primary` (#3F4144, botão/realce institucional Cool Gray escuro), `--action-primary-fg`,
`--focus-ring` (anel de foco neutro), e a utilitária `.foco-neutro` (`globals.css`) para o foco de
inputs/selects/checkboxes. Tela de plataforma nova **nasce com esses tokens** — nunca `#BD965C` nem
`var(--brand)`. (v4.14.1: as telas de auth/admin, nascidas fora da identidade, foram trazidas a ela.)

---

## Extensão v4.18.0 — token de AÇÃO ADMINISTRATIVA (gestão)

As telas de plataforma ganharam um token semântico de **ação administrativa** para os botões de
**gestão/supervisão** (Ver todas / Gerenciar solicitações, só para admin): `--gestao` (#BA7517, borda/realce),
`--gestao-soft` (#FAEEDA, fundo) e `--gestao-fg` (#633806, texto) — em `tokens.css`, consumidos pela pill
`PILL_GESTAO`/`PILL_GESTAO_STYLE` (`botoes.ts`) e documentados em `/admin/design-system`.

É **família Amber, mas DISTINTO do `--warning`** (status "Pendente") — embora visualmente próximos, são
papéis diferentes: `--warning` é STATUS (semáforo), `--gestao` é AÇÃO administrativa. Mantê-los separados
garante que, se um dia o `--warning` mudar de tom, os botões de gestão **não mudem junto**. Também distinto
do dourado de Weddings (`--brand`). Regra inalterada: nenhum hex em componente — sempre via token.
