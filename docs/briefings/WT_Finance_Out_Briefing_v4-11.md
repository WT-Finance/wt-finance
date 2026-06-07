# WT Finance — Out-Briefing v4.11

**Data:** 2026-06-05 · **Branch:** `feat/v4-11` · **Versão:** 4.10.1 → **4.11.0** (MINOR)
**Tema:** Padrão unificado de card-tabela (3 abas) + histórico de versões clicável para a diretoria.

---

## Missões implementadas

| # | Missão | Resultado |
|---|--------|-----------|
| M1 | Padrão de card-tabela | Componente base `CardTabela` (`@/components/shared/card-tabela`) + utilitária `.card-tabela-vermais` (Ver mais neutro→cor da aba) + `CARD_TABELA_TH`. Aplicado a **5 card-tabela** (decisão do usuário): Próximos Casamentos, Mix por Produto, Top Vendedores, Vendas em Aberto, Receita Negativa. Sem subtítulo na página; `#` só em ranking; "no período" só onde aplica; header caixa-normal ~11px terciária; `table-fixed`+`colgroup`; `fmtBRL2` no Resultado Previsto. Documentado em `/admin/design-system`. |
| M2 | version clicável + modal | `ModalCentral` (shell central rolável, X/Esc/clique-fora; padrão do `modal-confirmacao-upload`, sem `position:fixed` problemático). `VersionHistory` torna o `version X.Y.Z` da sidebar clicável (hover sublinha, não muda cor) e abre o modal lendo o `CHANGELOG_DIRETORIA`. |
| M3 | CHANGELOG_DIRETORIA + retroativo | Módulo TS tipado `src/data/changelog-diretoria.ts` (`versao`, `data`, `itens[]` com tipo). Populado **granular v4.0→v4.11** (19 entradas, datas reais, todas as entregas), em **linguagem de negócio**. **Conteúdo retroativo a revisar pelo Yan.** |
| M4 | Registros | ADR-0103 estendido (regra de cor de cash-flow) + CLAUDE.md (ritual do changelog da diretoria no workflow + DoD). |
| M5 | Fechamento | version 4.11.0, CHANGELOG.md [4.11.0], 1ª entrada v4.11 no CHANGELOG_DIRETORIA, design-system, gates, PR. |

---

## Migration
- **Nenhuma.** Changelog é arquivo + frontend; card-tabela é frontend.

## ADR
- **Nenhum novo.** **ADR-0103 estendido**: o cash-flow tem dois contextos de cor deliberados — identidade turquesa/mostarda nos **cards de página** de Weddings vs semântica `--positive`/`--negative` no **drawer de operação**. Registrado como **regra, não dívida**, para evitar "correções" futuras indevidas.

---

## Decisões (do usuário)
1. **Escopo do card-tabela → 5 cards** (os 3 nomeados + Vendas em Aberto + Receita Negativa), para consistência total na página de Trips/Corp; preservando os comportamentos próprios (badge de contagem na cor da aba, alerta de venda >30d, cor do badge de receita negativa).
2. **Formato do CHANGELOG_DIRETORIA → módulo TS** (`src/data/changelog-diretoria.ts`): tipado, versionado, sem parsing, fácil de manter; consumido direto pelo modal.

---

## Histórico retroativo (M3) — a revisar
- 19 entradas, da v4.0 (marco zero) à v4.11, **granular** (cada versão/patch é uma entrada), com a **data real** de cada entrega (out-briefings + CHANGELOG.md; v4.2 destilada do CHANGELOG/commits, data 2026-05-27).
- **Linguagem de negócio** (efeito/implicação, não mecanismo). Patches técnicos com descrição genérica honesta.
- **Pedido:** Yan revisa o conteúdo (tom e fidelidade) antes do merge — risco 3 do briefing.

---

## Gates
- ✅ `npx tsc --noEmit` zero erros.
- ✅ `npx next build` limpo (1 falha transitória de rede ao buscar Google Fonts; passou no retry).
- ✅ `npm run lint`: arquivos tocados sem problema NOVO. Permanecem apenas baseline pré-existente do React Compiler (`sidebar.tsx`: `set-state-in-effect`; `design-system/page.tsx`: `no-unescaped-entities` no exemplo de `subtitulo="..."`), idênticos ao `main`.
- ⏳ Smoke (pós-merge / preview): card-tabela nas 3 abas sem regressão em Weddings; version clicável abre o modal; histórico carrega desde v4.0; hover do version sublinha.

## Pendências / follow-up
- **Conteúdo retroativo do changelog** — aguarda revisão do Yan (linguagem de negócio).
- **Cor do drawer vs cards de cash-flow** — RESOLVIDA como regra (ADR-0103 estendido); não é mais dívida.
- Herdadas: ranking de vendedores por range (RPC dedicada); qualidade do dado de Trips/Corp; dívida de cor incremental (`historico-12m`, `RitmoDiario`, `HistoricoMensal`); curadoria ERP (v4.9.x); Posição por Conta / RPA / Custos Internos.
- Roadmap: evoluir Trips/Corp com conteúdo específico → v5.0 (aba Geral) → DRE evolutiva.

## CLAUDE.md
- Adicionado ao workflow (passo 6) + DoD: ritual de gerar a entrada no `CHANGELOG_DIRETORIA` a cada versão/patch, em linguagem de negócio (efeito, não mecanismo), todas as entregas.

## Arquivos
**Novos:** `src/components/shared/card-tabela.tsx`; `src/components/shared/modal-central.tsx`; `src/components/layout/version-history.tsx`; `src/data/changelog-diretoria.ts`; `docs/briefings/WT_Finance_Out_Briefing_v4-11.md`.
**Modificados:** `src/app/globals.css` (`.card-tabela-vermais`); `src/components/performance/{mix-produto-table,top-vendedores-card,performance-content}.tsx`; `src/components/weddings/{proximos-casamentos-card,vendas-em-aberto-card,vendas-receita-negativa-card}.tsx`; `src/components/layout/sidebar.tsx`; `src/app/admin/design-system/page.tsx`; `docs/adr/0103-paleta-de-cores-canonica.md`; `CLAUDE.md`; `package.json`; `CHANGELOG.md`.
