# Bugs Resolvidos

> **Legado / congelado (até v3.x).** Correções recentes ficam no
> [`CHANGELOG.md`](../CHANGELOG.md) da raiz (seção "Corrigido") e nos out-briefings
> por versão (`docs/briefings/`). Este arquivo preserva o histórico antigo e **não
> recebe novas entradas**. (F13, v4.12.)

Registro de bugs investigados e resolvidos (ou deliberadamente adiados) no WT Finance Dashboard.

---

## V3.1-1 — Correção de Bugs Críticos (Maio 2026)

### Bug 1 — Realizado = Projeção na Aba Metas

**Sintoma:** KPI "Realizado" e KPI "Projeção" exibiam o mesmo valor durante o mês corrente.

**Causa raiz:** A query que calculava `v_du_passados` usava `data <= CURRENT_DATE`, contando o dia atual como "dia útil decorrido" mesmo antes da carga manual ser executada. No último dia útil do mês, isso resultava em `v_du_passados = v_du_total`, tornando a projeção matematicamente igual ao realizado.

**Correção:** `data < CURRENT_DATE` em `get_kpis` — conta apenas dias com carga já encerrada.

**Arquivo:** `supabase/migrations/0020_fix_bugs_criticos.sql`

---

### Bug 2 — 'WEDME' no Ranking de Vendedores

**Sintoma:** "WEDME" aparecia em 3º lugar no Ranking de Vendedores com R$ 386.336 e 71 vendas.

**Causa raiz (H1 confirmada):** A planilha de origem contém linhas com `Vendedor = 'WEDME'`, representando vendas corporativas/institucionais atribuídas a uma conta interna, não a um vendedor pessoa física. Durante a ingestão raw → analytics, essa conta virou um registro em `dim_vendedor` sem distinção de tipo.

**Correção:** Criada tabela `analytics.dim_vendedor_tipo` com tipos `pessoa_fisica` / `institucional` / `externo`. WEDME marcado como `institucional`. Query `get_ranking_vendedores` filtrada para `tipo_id = 1` (pessoa física) por padrão.

**Arquivo:** `supabase/migrations/0021_wedme_tipo.sql`

---

### Bug 3 — Gauges semicirculares na Aba Metas

**Sintoma:** O briefing v1 previa 4 gauges semicirculares (Welcome Group total + 3 setores). Eles não aparecem na v3.0.

**Investigação:** Zero arquivos com `GaugesRow`, `gauge` ou similar em `/src`. Componente nunca foi implementado na v1 — foi pulado durante o desenvolvimento inicial.

**Decisão (conforme §3.4.3 do briefing v3.1):** Não reimplementar nesta missão. A Aba Metas funciona corretamente sem os gauges. Adicioná-los agora seria scope creep. Discutir inclusão em v4 com base na demanda da diretoria.

---

### Bug 4 — YoY -100% para períodos sem dados

**Sintoma:** Quando o período atual não tem dados (ex: "Este mês" no primeiro dia útil antes da carga), KPIs exibiam "YoY -100%".

**Causa raiz:** A fórmula `(atual - anterior) / anterior * 100` retorna -100% quando `atual = 0` e `anterior > 0`. O guard existente (`CASE WHEN v_fat_yoy > 0`) protegia apenas contra divisão por zero (anterior = 0), não contra período atual vazio.

**Correção:** Adicionado guard `AND v_vendas > 0` em todos os CASE de variação (YoY e anterior) em `get_executiva_kpis`. Frontend `KpiCards.tsx` corrigido analogamente para a Aba Metas.

**Arquivo:** `supabase/migrations/0020_fix_bugs_criticos.sql`, `src/components/dashboard/KpiCards.tsx`

---

### Bug 5 — Default da Aba Executiva era 'Este mês'

**Sintoma:** Aba Executiva abria por padrão em "Este mês", resultando em tela vazia nos primeiros dias do mês quando a carga manual ainda não tinha rodado.

**Correção:** Default alterado para "Mês anterior" em `executiva/page.tsx` e `periodo-filter.tsx`.

**Reversão:** Quando a integração com RPA estiver concluída e dados forem atualizados continuamente, reverter para "Este mês". Ver ADR `docs/adr/0005_default_executiva_mes_passado.md`.
