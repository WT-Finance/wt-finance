# Out-Briefing — v5.0.0 · Metas por Setor (a abertura da major 5)

**Tipo:** MAJOR (4.40.1 → 5.0.0) · **Migrations:** 0175 (aditiva, APLICADA) + 0176 (destrutiva, PREPARADA/não-aplicada) · **ADR:** 0146 · **Base:** `main` @ v4.40.1 · **Branch:** `feat/v5-0-0-metas-por-setor` · **PR:** #175 (draft).

O acompanhamento de metas comerciais de faturamento (VT) por setor entra na plataforma, absorvendo o "Dash Comercial" provisório. A rota `/metas` (que tinha o dashboard v1 legado atrás de um "em construção") passa a ser real, com duas subabas: **Acompanhamento** e **Cadastro**.

## Missões

### M1 — Banco + módulo de ritmo (migration 0175, aditiva; backup-gate VERDE)
- `ALTER TABLE app.meta_setor ADD COLUMN pct_receita numeric(5,2)` (CHECK 0..100, inline) + `pct_receita`/`pct_receita_anterior` no `meta_setor_historico` (**tabela ativada** nesta versão).
- Área RBAC **`metas/acompanhamento`** (leitura) — INSERT aditivo; a `metas` existente vira a de edição. `areas.ts` + `areasDaRota` (`/metas` → OR; `/metas/cadastro` → só `metas`).
- RPCs inline: `metas_listar(p_ano)`, `metas_ritmo_diario(p_from,p_to,p_setor)` (leitura, areasAny), `metas_upsert(p_metas)` (escrita, só `metas`; upsert + histórico; `fonte='real'`; chave `setor_macro_id`).
- Módulo puro `src/lib/metas/ritmo.ts` (pró-rata por dias, "hoje" = última venda, régua com constantes nomeadas, alvo de %Rec ponderado por VT) + **10 testes**.
- **FONTE ÚNICA PROVADA POR TESTE** (`rpc-contrato.test.ts`): `Σ(metas_ritmo_diario.serie) === get_executiva_kpis.faturamento` para todos/Weddings/Lazer/Corporativo (mesma `mv_vendas_diarias`, mesmo JOIN/WHERE). Paridade de áreas banco↔app coberta.

### M2 — Primitivos e dívidas
- **`<Gauge>`** (`@/components/shared/gauge`): medidor semicírculo, arco em cor de identidade, tick de pace com valor, `role="img"`. Receita no DS doc.
- **`<NavGroup>`** genérico na sidebar: Performance/Financeiro migrados sem regressão + nova seção **Metas** (Acompanhamento/Cadastro). Toggle unificado (mapa `openGroups`), ativo por prefixo mais específico.
- **`kpi-principal-drawer`** realocado `weddings/` → `performance/` (pendência 14c; 3 importadores + wrapper lazy; sem mudança de contrato).
- CLAUDE.md: regra de escoteiro do `<ScrollAutoHide>`.
- **DEFERIDO (reportado): consolidação das 3 pills de período.** A variante de Weddings é baseada em **Context** (`usePeriodoFilter`, lida por `weddings-kpis-section` e `weddings-mix-section` além das pills); migrá-la para URL é **troca de comportamento em 4 dashboards vivos** e o invariante é não-regressão. Metas reusa `PeriodoFilterPillsUrl` (a base) sem criar uma 4ª variante. **Recomendação:** patch dedicado se/quando quiser a unificação.

### M3 — Acompanhamento (`/metas`)
- Server Component orquestra: `get_executiva_kpis` × 4 (Group+3 setores) + `metas_listar` (por ano do período) + `metas_ritmo_diario` × 4, tudo em `Promise.all`; `calcularRitmo` server-side por setor (Group = soma computada; %Rec Group ponderado por VT).
- UI: pills → aviso de parcialidade → card **Group** (gauge grande neutro + faixa de 3 KPIs: Faturamento+YoY / Meta do período+esperado / Receita+alvo) → 3 cards setoriais (gauge na cor do setor + Realizado/Meta/Receita) → gráfico **"Ritmo do período"** (seletor `<Tabs>` Group/Trips/Weddings/Corporativo; realizado acumulado sólido na cor do setor × meta acumulada tracejada; `ReferenceLine` "Hoje" + `ReferenceDot` do esperado; "% do esperado" na régua). `loading.tsx` (skeleton).
- Régua (`RITMO_META_ATINGIDA`/`RITMO_ATENCAO`) colore SÓ "ritmo X%"/"% do esperado". Tema group. Display "Trips" / chave "Lazer".

### M4 — Cadastro (`/metas/cadastro`, área forte `metas`)
- Grade anual 12 meses × 3 setores × [Meta VT, % Rec] + **Group computado ao vivo no cliente** (coluna read-only, fundo distinto) + total no rodapé + navegação por ano (`?ano=`).
- **Autosave por célula** (blur/Enter → loader → check) com **reversão em erro** (padrão `contas-manager`, não `lancamento-row`) + `FaixaMensagem`. Parse via `toNum` (coerção canônica). Auditoria da última alteração (`fmtDataHoraSP`). Escrita → `metas_upsert` (grava histórico).

### M5 — Aposentadoria cética do dashboard v1
- **PROVA (grep)**: `MetasDashboard.tsx`, 6 componentes `components/dashboard/*` e 5 API Routes (`/api/{kpis,ritmo-diario,ranking-vendedores,ranking-produtos,historico-mensal}`) eram consumidos SÓ pela árvore de `/metas` → **removidos** (código morto).
- **`get_historico_mensal` PERMANECE** — 2º consumidor vivo: Executiva via `/api/dashboard/kpi-historico` → `KpiDetailDrawer`. (A ROTA `/api/historico-mensal` era metas-only e saiu; a RPC fica.)
- **Migration 0176 (DESTRUTIVA)** — DROP das 4 RPCs órfãs (`get_kpis`/`get_ritmo_diario`/`get_ranking_vendedores`/`get_ranking_produtos` + `__nucleo`) — **PREPARADA mas NÃO aplicada** (destrutiva exige confirmação humana num TTY, ADR-0131). `get_historico_mensal` fora do DROP.

### M6 — Fechamento
- `package.json` → **5.0.0** (`version.ts` deriva sozinho). CHANGELOG.md + CHANGELOG_DIRETORIA (linguagem de negócio) com a entrada 5.0.0. ADR-0146. DS doc (Gauge + seção Metas).
- **Histórico da diretoria dobra a v4 sozinho:** com `APP_VERSION=5.0.0` e a 1ª entrada `5.0.0` no topo, `VersionHistory` (agrupa por major derivado, sem hardcode) mostra o grupo **"Versões 4.x — 79 versões"** colapsado. (Confirmar visualmente no checkpoint.)

## Gates
- `npx tsc --noEmit`: 0 · `npx eslint <arquivos>`: 0 · `npx next build`: OK (`/metas` e `/metas/cadastro` como rotas dinâmicas) · `npx vitest run`: **373 testes verdes** (10 do ritmo + paridade da fonte única + contrato).

## Pendências / follow-ups
- **Operacional (Yan):** aplicar a migration **0176** (destrutiva) quando conveniente — `npm run db:migrate -- --destrutiva` num terminal.
- **Produto (Yan, no checkpoint):** digitar os **% Rec** no Cadastro (hoje só `valor_meta` existe no seed; o alvo de %Rec nasce vazio → cards mostram "—" até preencher).
- **Dívida (opcional):** consolidação das 3 pills de período (patch dedicado).
- **v5.1 (fora):** Metas por Vendedor (M1/M2/M3, TPs).

## Checkpoint do Yan (antes do merge)
Metas 2026 visíveis na grade + digitar %Rec (autosave + histórico); Faturamento do Acompanhamento == Performance no mesmo período (conferência cruzada — provado por teste, confirmar na tela); gauges/régua/gráfico com seletor; usuário só-leitura barrado do Cadastro; histórico com a v4 dobrada; "está na língua da casa?".

---

## Adendo de UI (checkpoint · sobre mockups v7/v8 do Acompanhamento e v2 do Cadastro)

Ajustes decididos pelo Yan sobre a v5.0.0 ainda aberta — sem alterar o motor (fonte única, `fonte='real'`, histórico por célula, permissões, módulo de ritmo). ADR-0146 emendado; DS doc atualizado (Gauge sai, entra `<MetaProgressBar>` + padrão "edição local + salvar em lote").

**A — Acompanhamento (gauges → barras):**
- `<Gauge>` REMOVIDO (componente + usos + seção do DS). Novo primitivo **`<MetaProgressBar>`**: trilha neutra + preenchimento na cor de identidade (Group neutro), tick mudo do esperado, **tooltip escuro** no hover (`N% do período decorrido` + Esperado/Realizado + conclusão colorida `adiantado`/`abaixo do esperado`). Espessura 12px (Group) / 10px (setoriais).
- **YoY REMOVIDO** de toda a superfície de Metas (o motor ainda devolve; a superfície não exibe). Rótulo "ritmo" → "% do esperado". **Margem** = delta em **p.p. contra o alvo** de %Rec, colorido (acima=success/abaixo=danger), no lugar do ✓ binário.
- Card Group no molde v8 (label `WELCOME GROUP`, Faturamento sem YoY, `% da meta`/`% do esperado`, barra, rodapé Receita | Margem). Gráfico "Ritmo do período" mantido.
- Novo campo testado no módulo: `RitmoResultado.pctDecorrido` (% do período em dias, base do tooltip).

**B — Cadastro (autosave → salvar em lote + refinos):**
- Mecânica: **edição local** (Enter/blur confirma no cliente; célula suja = ponto âmbar; Group/Total ao vivo) + **Salvar em lote** (`salvarMetas` → um `metas_upsert` com todas as pendências; histórico segue por célula). Rodapé com **"N alterações não salvas"** + botão **Salvar** (desabilitado sem pendências). **Guarda de saída** (troca de ano `window.confirm` + `beforeunload`). Erro no salvar mantém as pendências (retry).
- **"Aplicar ao ano"** no cabeçalho de cada % Rec (popover) — preenche os 12 meses do setor como pendências (a primeira carga dos alvos em poucos gestos).
- Refinos: moldura interna da tabela; "Meta VT" → **"Faturamento"**; frase do Group removida (só o hint "Clique numa célula para editar"); linha **Total** (sem ano) em contábil pleno, no cinza do Group; título/subtítulo novos; subabas da sidebar "Acompanhamento"/"Cadastro".

**Gates do adendo:** tsc 0 · eslint 0 · next build OK · vitest **374** (10→11 no ritmo, com `pctDecorrido`). Validação visual por screenshots SSR dos componentes reais (harness local não-commitado), incluindo o tooltip escuro forçado.
