# Escopo de Patch — Auditoria Técnica pós-v4.11

**Data:** 2026-06-08 · **Baseline:** 4.11.0 · **Status:** Proposta — **nada implementado** (lista para priorização).

Auditoria técnica do WT Finance feita após a v4.11, com verificação direta no código. Os 13 achados foram agrupados em **5 missões temáticas**. Este documento é o escopo para o próximo ciclo de correções — cada item traz severidade, localização (`arquivo:linha`), evidência e a **direção** de correção (não o código).

> **Nota de versionamento:** parte do escopo é correção/polimento (PATCH), mas **M1 (auth)** e **M5 (testes)** são capacidades novas e provavelmente justificam um **MINOR** (ex.: v4.12). Sugestão de fatiamento ao final.

---

## Resumo dos achados

| # | Severidade | Categoria | Achado | Missão |
|---|-----------|-----------|--------|--------|
| F1 | 🔴 Crítica | Segurança | Rotas administrativas destrutivas sem autenticação | M1 |
| F2 | 🟠 Alta | Banco | Pipeline de upload destrutivo e não-atômico (truncate antes do transform) | M1 |
| F3 | 🟠 Alta | Performance | Top Vendedores: fan-out N+1 + risco de timeout anon (3s) | M3 |
| F4 | 🟠 Alta | Qualidade | Sem testes automatizados num sistema financeiro | M5 |
| F5 | 🟡 Média | Correção | Erros de RPC engolidos como "vazio" | M2 |
| F6 | 🟡 Média | Correção | Fuso horário em `new Date('YYYY-MM-DD')` | M2 |
| F7 | 🟡 Média | Qualidade | Type-safety frouxa nas respostas de RPC (`as unknown as`, `as any`) | M4 |
| F8 | 🟡 Média | Correção | Truncamento silencioso de listagens (`max_rows`/`LIMIT`) | M2 |
| F9 | 🟡 Média | Frontend | React Compiler: componente criado em render + `setState` em effect | M4 |
| F10 | 🟢 Baixa | Segurança | Sem headers de segurança/CSP; `bodySizeLimit: 200mb` | M1 |
| F11 | 🟢 Baixa | Frontend | Logos via máscara CSS sem fallback | M4 |
| F12 | 🟢 Baixa | Qualidade | Código atrás de flags permanentes (`MOSTRAR_*=false`) | M4 |
| F13 | 🟢 Baixa | Qualidade | Dois changelogs técnicos (raiz vs `docs/`) | M4 |

---

## M1 — Endurecimento de segurança (admin + ingestão)

**Objetivo:** nenhuma rota destrutiva acessível sem autenticação; ingestão resistente a falha parcial. **Maior risco do produto.**

### F1 · 🔴 Crítica — Rotas administrativas destrutivas sem autenticação
- **Onde:** `src/app/api/admin/upload-vendas/route.ts:6-42`, `src/app/api/admin/upload-lancamentos/route.ts`, `src/app/api/gerencial/import/route.ts`; UI em `/admin/uploads`.
- **Problema:** não há middleware nem nenhuma checagem de auth no projeto (`grep` por `getUser`/`getSession`/`401`/`cookies()` = vazio). Um `POST` com `modo=executar` chama `carregarVendas(..., 'executar')`, que **trunca e recarrega a base de produção**. Qualquer um com a URL apaga/substitui os dados.
- **Evidência:** `upload-vendas/route.ts` recebe o arquivo e executa sem qualquer verificação de identidade.
- **Contexto:** o ADR-0029 admitiu admin sem auth de forma deliberada; o risco (destrutivo + público + sem rate-limit/CSRF) hoje merece revisão.
- **Direção:** autenticação real (Supabase Auth + `middleware.ts` protegendo `/admin/**` e `/api/admin/**` + `gerencial/import`); na falta dela, no mínimo um segredo de admin server-side + allowlist e proteção CSRF; idealmente separar "preview" (leitura) de "executar" (destrutivo, atrás de login).

### F2 · 🟠 Alta — Pipeline de upload destrutivo e não-atômico
- **Onde:** RPCs de carga (`truncate_dynamic_tables`, `transform_raw_to_analytics`) acionadas por `src/lib/carga/*`; documentado no `CLAUDE.md`.
- **Problema:** `truncate_dynamic_tables` (CASCADE) roda **antes** do transform. Se o transform falha (ex.: data fora do range fixo de `dim_data`), os fatos ficam **vazios em produção** (os dados crus sobrevivem em `raw`). Sem transação envolvendo truncate+transform nem rollback. Já custou caro (migration 0100).
- **Direção:** validar pré-condições (ex.: range de datas vs `dim_data`) **antes** de truncar; carregar em staging e fazer troca atômica (rename/transaction), de modo que uma falha nunca deixe a base vazia. Candidato natural a um pipeline durável com etapas idempotentes + retry/compensação.

### F10 · 🟢 Baixa — Headers de segurança ausentes
- **Onde:** `next.config.ts` (sem `headers()`; `experimental.serverActions.bodySizeLimit: '200mb'`).
- **Problema:** sem HSTS, `frame-ancestors`/X-Frame-Options, `Content-Security-Policy`, etc. `bodySizeLimit` de 200MB é generoso (uploads reais vão por API Route com limite próprio de 50MB/10MB).
- **Direção:** adicionar `headers()` com cabeçalhos de segurança; reavaliar o `bodySizeLimit`.

---

## M2 — Confiabilidade do dado exibido

**Objetivo:** o que a diretoria vê é fiel — erro ≠ vazio, datas corretas, "há mais" sinalizado. Correções localizadas, alto valor / baixo custo.

### F5 · 🟡 Média — Erros de RPC engolidos como "vazio"
- **Onde:** padrão `res.error ? null : res.data` (~12 ocorrências; ex.: `performance-content.tsx`, rotas de dashboard).
- **Problema:** uma falha de RPC (timeout, permissão, RPC quebrada) vira "sem dados" silenciosamente — indistinguível de um período legitimamente vazio. A diretoria pode interpretar número errado/ausência como real.
- **Direção:** distinguir estado de erro de estado vazio na UI (mensagem/indicador de falha); logar/observar erros de RPC.

### F6 · 🟡 Média — Fuso horário em `new Date('YYYY-MM-DD')`
- **Onde:** `src/components/weddings/proximos-casamentos-card.tsx:52`; `src/components/weddings/kpi-principal-drawer.tsx:77-87` (e outros pontos de período).
- **Problema:** `new Date('YYYY-MM-DD')` é parseado como **UTC** (meia-noite UTC = 21h do dia anterior em −03), podendo deslocar 1 dia em comparações/horizontes. Os helpers de `fmt.ts` já parseiam por `split` (seguros), mas a lógica de período/horizonte usa `new Date` direto.
- **Direção:** padronizar parsing local (por componentes da string, como em `fmt.ts`) também na lógica de período/horizonte; centralizar num helper.

### F8 · 🟡 Média — Truncamento silencioso de listagens
- **Onde:** `max_rows=1000` do PostgREST + `LIMIT` fixos nas RPCs (ex.: `get_vendas_em_aberto` LIMIT 50; rankings).
- **Problema:** listagens grandes truncam sem sinalizar "há mais", podendo passar leitura parcial como total.
- **Direção:** retornar/expor total vs exibido (alguns cards já fazem) e revisar os limites conforme o dado cresce.

---

## M3 — Performance e escala

**Objetivo:** reduzir fan-out e risco de timeout anon (3s) nas telas que crescem com o dado.

### F3 · 🟠 Alta — Top Vendedores: fan-out N+1 + risco de timeout
- **Onde:** `src/components/performance/performance-content.tsx` (`fetchTopVendedores` → `mesesNoIntervalo`).
- **Problema:** chama `get_ranking_vendedores` **1× por mês** do intervalo (até 36) e agrega no client. Conforme o dado cresce, o conjunto de chamadas pesa; e qualquer RPC de UI que passe de **3s** (timeout do role `anon`) estoura `57014` **só pelo front**.
- **Direção:** RPC única `get_ranking_vendedores_range(p_from, p_to, p_setor)` que agrega no banco (pendência já registrada); revisar outras RPCs de listagem/agregação quanto ao orçamento de 3s.

---

## M4 — Qualidade de código e robustez

**Objetivo:** reduzir dívida que vira bug silencioso. Incremental.

### F7 · 🟡 Média — Type-safety frouxa nas respostas de RPC
- **Onde:** `as unknown as <Tipo>` (~68 ocorrências) e `(db.rpc as any)` (~8), espalhados.
- **Problema:** o retorno real das RPCs não é validado contra o tipo; um drift entre RPC e tipo passa silencioso até virar bug de exibição/cálculo.
- **Direção:** validar com **Zod** (já é dependência) as respostas das RPCs críticas, e/ou regenerar `src/types/database.ts` e tipar as RPCs novas (hoje em `as any`).

### F9 · 🟡 Média — React Compiler: padrões de risco no baseline
- **Onde:** `src/components/weddings/weddings-kpis-section.tsx` (`SubsetorCard` definido **durante o render** — `react-hooks/static-components`); `src/components/layout/sidebar.tsx` e seções com `setState` síncrono em `useEffect` (hidratação de `localStorage` — `react-hooks/set-state-in-effect`).
- **Problema:** criar componente em render pode causar remount/perda de estado e re-renders; `setState` síncrono em effect gera cascading renders/flash. Hoje são "baseline" aceito, mas são riscos reais.
- **Direção:** extrair os componentes para fora do render; inicializar a partir de `localStorage` via `useState(initializer)`/`useSyncExternalStore` em vez de `setState` em `useEffect`.

### F11 · 🟢 Baixa — Logos via máscara CSS sem fallback
- **Onde:** `src/components/layout/version-history.tsx` (logo Claude) e `sidebar.tsx` (logo Corp recolorido) usam `mask-image`.
- **Problema:** navegadores muito antigos não renderizam `mask-image` (logo some). Baixo risco no público interno.
- **Direção:** fallback (`@supports`) ou aceitar o risco conscientemente.

### F12 · 🟢 Baixa — Código atrás de flags permanentes
- **Onde:** `MOSTRAR_SECOES_LEGADAS`, `MOSTRAR_CAGR`, `MOSTRAR_VENDAS_DIAGNOSTICO` (`= false`).
- **Problema:** dívida controlada (código morto recuperável). Decidir voltar ou remover.
- **Direção:** revisar caso a caso; remover o que não voltará.

### F13 · 🟢 Baixa — Dois changelogs técnicos
- **Onde:** `CHANGELOG.md` (raiz) vs `docs/changelog.md` + `docs/bugs-resolvidos.md`.
- **Problema:** risco de divergência/duplicação.
- **Direção:** consolidar num só (ou definir claramente o papel de cada).

---

## M5 — Rede de testes

### F4 · 🟠 Alta — Sem testes automatizados
- **Problema:** um sistema financeiro sem nenhuma suíte de testes. Cálculos sensíveis (margem, agregações, regime caixa-banco, datas) sem rede de proteção — e já houve bugs de cálculo/data (inversão dia/mês ADR-0099; contaminação `venda_n` v4.9.2).
- **Direção (faseada):**
  1. **Unit** dos helpers puros: `src/lib/fmt.ts`, `src/lib/periodo.ts`, `src/lib/carga/*` (parsers), `decomposicao-variacao.ts`.
  2. **Contrato** das RPCs críticas via REST (já há o padrão de verificação por service role) — fixar shape e invariantes.
  3. **Smoke e2e** mínimo das telas vivas (carrega sem erro, KPIs renderizam).
- **Nota:** estrutural (introduz ferramental de teste) — provavelmente MINOR.

---

## Sequência sugerida

1. **M1 (segurança)** — maior risco real; F1 + F2 juntos (endurecimento de admin/ingestão). F10 entra de carona.
2. **M3 (performance)** + **M2 (confiabilidade)** — correções localizadas, alto valor / baixo custo; bom para um PATCH rápido.
3. **M5 (testes)** — estrutural; começar pelos helpers puros (maior retorno por esforço).
4. **M4 (qualidade)** — incremental, conforme se toca em cada arquivo.

**Fatiamento de versão sugerido:**
- **PATCH** (ex.: 4.11.1): M2 + M3 + itens baratos de M4 (F12/F13).
- **MINOR** (ex.: 4.12): M1 (auth = capacidade) + M5 (testes = ferramental novo), por serem mudanças de premissa/infra.

---

*Gerado a partir de auditoria com verificação direta no código (baseline 4.11.0). Nenhuma correção foi implementada — este documento é insumo de priorização.*
