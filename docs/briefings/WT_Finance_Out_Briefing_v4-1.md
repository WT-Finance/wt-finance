# WT Finance — Out-Briefing v4.1

**Data:** 2026-05-26  
**Branch:** `feat/v4-1` → PR #68  
**Worktree:** `.worktrees/feat-v4-1`

---

## Contexto

v4.1 reformula o **Fluxo de Caixa** adotando **Abordagem B (regime caixa-bancário)**: gastos via cartão agora são contabilizados no momento do pagamento da fatura ao banco, não no lançamento individual do cartão. Isso alinha os KPIs com a pergunta operacional real — "quanto saiu da conta bancária neste mês?".

Este out-briefing também consolida mudanças pós-v4.0 que foram mantidas em fila até este ciclo.

---

## Parte 1 — Mudanças pós-v4.0 (main, commits d568de6 → ab96bea)

Estas mudanças foram aplicadas diretamente no `main` após o fechamento do briefing v4.0 e são incluídas aqui como registro formal.

### 1.1 Banner "Em Construção" — commits b639a20 → 64c9f76

5 seções incompletas agora exibem um banner no lugar do conteúdo real: `/executiva`, `/performance`, `/performance/trips`, `/performance/corporativo`, `/metas`.

Acesso ao conteúdo: `<url>?preview=1` (parâmetros adicionais preservados via `URLSearchParams`).

**Arquivos criados:**

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/components/shared/preview-button.tsx` | Client Component; pill do design system (`var(--brand-soft/brand/brand-deep)`); usa `usePathname` + `useSearchParams`; pai wrappeia em `<Suspense fallback={null}>` |
| `src/components/shared/em-construcao.tsx` | Server Component; props `{ children, preview: boolean }`; early return `<>{children}</>` quando preview=true; banner com `HardHat` (lucide), textos, PreviewButton, link Weddings |

**Arquivos modificados:**

| Arquivo | Mudança |
|---------|---------|
| `src/app/executiva/page.tsx` | Early return antes das queries ao banco |
| `src/app/performance/page.tsx` | Early return antes de `PerformanceContent` |
| `src/app/performance/trips/page.tsx` | Early return antes de `PerformanceContent` |
| `src/app/performance/corporativo/page.tsx` | Early return antes de `PerformanceContent` |
| `src/app/metas/page.tsx` | Wrap com `EmConstrucao` |

**Notas de design:**

- Link "Weddings" usa `#BD965C` hardcoded — `var(--brand)` não funciona pois `theme-provider.tsx` seta o tema por pathname (ex: `/trips` → `--brand` azul). O pill `PreviewButton` renderiza após o provider, então resolve corretamente para dourado/azul/teal por seção.
- Early return nas páginas de `PerformanceContent` garante zero queries ao banco no modo banner.

---

### 1.2 Fix pipeline de upload — commits 8d7a2ae → ceaa642

**Causa raiz:** Schemas `analytics` e `raw` não são expostos via PostgREST (por design, migration 0027). Chamadas `supabase.schema('analytics').from(...)` e `supabase.schema('raw').from(...)` falhavam silenciosamente em produção.

**Migração criada:** `supabase/migrations/0061_financeiro_vp_cpr_rpcs.sql`  
6 novas RPCs SECURITY DEFINER: `contar_vendas_pagamento`, `truncar_vendas_pagamento`, `inserir_lote_vendas_pagamento`, `contar_contas_pagar_receber`, `truncar_contas_pagar_receber`, `inserir_lote_contas_pagar_receber`.

Migrações 0055–0060 marcadas como aplicadas via `supabase migration repair` (tinham sido aplicadas diretamente ao banco sem tracking).

**Arquivos corrigidos:**

| Arquivo | Mudança |
|---------|---------|
| `src/app/admin/uploads/actions.ts` | `getVendasStatusAction`: `.schema('analytics')` → RPC `get_upload_status` |
| `src/lib/carga/vendas.ts` | Mesmo fix no pipeline legado |
| `src/app/admin/uploads/financeiro/actions.ts` | 4 actions: `.schema('raw')` → RPCs públicas |
| `src/app/admin/uploads/page.tsx` | Preview usa contagem de `venda_numero` únicos |

Deploy de produção trigado manualmente: `vercel deploy --prod` — deployment `dpl_2DwhuiLMPqz4JJCaN56vPBBG138J`.

---

### 1.3 Melhorias na página de Upload — commit ab96bea

| Mudança | Detalhe |
|---------|---------|
| Card "Vendas" renomeado para "Vendas por Produto" | Reflete granularidade real (uma linha por produto) |
| Drag-and-drop na zona de upload | Handlers `onDragOver`, `onDragLeave`, `onDrop` adicionados ao `CardUpload` |
| Feedback visual ao arrastar | Borda azul + fundo azul claro (`border-blue-400 bg-blue-50`) |
| Texto da zona | "Arraste ou clique para selecionar um arquivo" |
| Anti-flicker no `onDragLeave` | Usa `relatedTarget` para ignorar movimentos sobre elementos filhos |

---

## Parte 2 — v4.1: Reformulação do Fluxo de Caixa

### 2.1 Missões e status

| # | Missão | Status | Commits |
|---|--------|--------|---------|
| M0 | ADRs 0060-0064 retroativos da v4.0 | ✅ | `05da451`, `d786016` |
| M1 | Refatorar parser Lançamentos (12 colunas) | ✅ | `6576733` |
| M2 | Ingestão CAP/CAR como raw.fluxo_caixa_titulos | ✅ | `b749077`, `aeb8c75`, `e6a73e4` |
| M3 | dim_conta_bancaria.eh_cartao_credito | ✅ | `0e21327` |
| M4 | View vw_fluxo_caixa_kpis_b (Abordagem B) | ✅ | `fa042fb` |
| M5 | KPIs e gráfico Fluxo Mensal para Abordagem B | ✅ | `619ea7a`, `a934808` |
| M6 | Próximos Vencimentos v2 (CAP/CAR, Tipo+Aging) | ✅ | `98f0b3f` |
| M7 | Tooltips + revisão final | ✅ | `0cf1b4c` |
| — | ADRs 0065–0067 + fix checkpoint | ✅ | `5d78492`, `4793e9c`, `20a62a1` |

---

### 2.2 Migrações

| Migração | Conteúdo |
|----------|----------|
| `0062_create_raw_fluxo_caixa_titulos.sql` | Cria `raw.fluxo_caixa_titulos` (15 colunas), índices, grants |
| `0063_rpcs_fluxo_caixa_titulos.sql` | RPCs SECURITY DEFINER: `contar_fluxo_caixa_titulos`, `truncar_fluxo_caixa_titulos`, `inserir_lote_fluxo_caixa_titulos`, `get_fluxo_caixa_kpis_b`, `get_fluxo_caixa_mensal_b` |
| `0064_dim_conta_bancaria_eh_cartao_credito.sql` | Adiciona coluna `eh_cartao_credito BOOLEAN DEFAULT FALSE`; UPDATE em contas-cartão conhecidas; INSERT de MASTERCARD WT |
| `0065_vw_fluxo_caixa_kpis_b.sql` | Cria `financeiro.vw_fluxo_caixa_kpis_b` (4 blocos UNION ALL — versão inicial) |
| `0066_get_proximos_vencimentos_v2.sql` | Refatora `get_proximos_vencimentos` para usar CAP/CAR com `tipo` real e bucket de aging |
| `0067_complete_dim_conta_bancaria.sql` | Expande CHECK constraint de `tipo`; INSERT de 51 contas ausentes; chama `regenerar_financeiro_lancamentos()` |
| `0068_refine_vw_fluxo_caixa_kpis_b.sql` | Refina Bloco 1: entradas em cartão (valor > 0) passam a ser incluídas |
| `0069_auto_sync_dim_conta_bancaria.sql` | `regenerar_financeiro_lancamentos()` passa a executar auto-INSERT idempotente de contas novas no passo 0 |

**Pendente (não aplicar sem confirmação):** `supabase/migrations/_PENDING_drop_raw_contas_pagar_receber.sql`

---

### 2.3 Arquivos de código modificados

| Arquivo | Missão | Mudança |
|---------|--------|---------|
| `src/lib/carga/parse-lancamentos-financeiro.ts` | M1 | Nova estrutura plana 12 colunas (sem pivot de cabeçalhos) |
| `src/lib/carga/parse-fluxo-caixa-titulos.ts` | M2 | Novo parser para "Base Fluxo de Caixa.xlsx"; fix `toIsoDate` para Excel serial 0 |
| `src/app/admin/uploads/financeiro/page.tsx` | M2 | Novo card de upload para Fluxo de Caixa (CAP/CAR) |
| `src/app/admin/uploads/financeiro/actions.ts` | M2 | Server actions para fluxo_caixa_titulos |
| `src/app/financeiro/fluxo-caixa/page.tsx` | M5+M6+M7 | KPIs via `get_fluxo_caixa_kpis_b`; Próximos Vencimentos v2; tooltips |
| `src/components/financeiro/fluxo-mensal-chart.tsx` | M5 | Dados via `get_fluxo_caixa_mensal_b`; saldo tracejado em meses previstos |

---

### 2.4 ADRs registrados

| ADR | Título |
|-----|--------|
| `0060-aba-financeiro-top-level.md` | Aba Financeiro como top-level (retroativo v4.0) |
| `0061-schema-financeiro-modelo-dados.md` | Schema financeiro — modelo de dados (retroativo v4.0) |
| `0062-padrao-upload-lotes-universal.md` | Padrão upload em lotes universal (retroativo v4.0) |
| `0063-identificacao-hotel-via-fornecedor.md` | Identificação de hotel via Fornecedor (retroativo v4.0) |
| `0064-dim-hotel-normalizada.md` | dim_hotel normalizada (retroativo v4.0) |
| `0065-abordagem-b-kpis-regime-caixa-bancario.md` | Abordagem B — KPIs regime caixa-bancário |
| `0066-dim-conta-bancaria-eh-cartao-credito.md` | dim_conta_bancaria.eh_cartao_credito |
| `0067-completude-dim-conta-bancaria.md` | Completude automática de dim_conta_bancaria |

---

### 2.5 Checkpoint M5 — resultado final

**Validação jan-mai 2026 (Abordagem B, após migrations 0062–0069):**

| KPI | Esperado (spec) | Obtido | Δ |
|-----|----------------|--------|---|
| Entradas | ~R$12,69M | R$12,69M | 0,0% ✅ |
| Saídas | ~R$13,50M | R$13,57M | 0,5% ✅ |
| Saldo | ~−R$813K | ~−R$880K | 8% ⚠️ aceito |

**Divergência do saldo explicada e aceita:** A spec foi validada antes da migration 0067, quando TBO e Conta Investimento XP ainda estavam ausentes de `dim_conta_bancaria`. Sua inclusão correta adiciona ~R$70K de saídas bancárias legítimas (TBO = gateway de turismo, XP = conta de investimento). O spec era impreciso por dados incompletos — a versão atual é mais correta.

---

### 2.6 Investigação do checkpoint — raiz das divergências

Durante o checkpoint M5, a divergência inicial foi de ~59% no saldo. Investigação sistemática em 5 etapas identificou dois problemas independentes:

**Problema 1 — FK gap em dim_conta_bancaria (causa principal)**

1.067 lançamentos liquidados tinham `conta_bancaria_id IS NULL` → excluídos do Bloco 1 por INNER JOIN → R$512K de entradas faltando.

Causa: 51 contas em `raw.lancamentos` não tinham entrada em `dim_conta_bancaria`, incluindo todos os cartões WCLARA-*, CCAB-*, VISA WT, e contas não-cartão (TBO, Conta Investimento XP, "Banco Itau, Caixa").

Correção: migration 0067 faz INSERT de todas as contas ausentes com classificação manual correta.

Correção estrutural: migration 0069 adiciona passo 0 em `regenerar_financeiro_lancamentos()` — INSERT idempotente de contas novas do ERP a cada regeneração. Contas novas recebem `tipo='outro'` + `eh_cartao_credito=FALSE` como classificação conservadora; o administrador pode atualizar manualmente depois.

**Problema 2 — Regra do Bloco 1 incompleta**

A versão inicial do Bloco 1 excluía todos os lançamentos de contas-cartão. Mas lançamentos com `valor > 0` em cartão (ex: "Reembolso Fornecedor", "Desconto Obtido", "Incentivo") representam receita real — não gastos no cartão — e devem ser incluídos no regime caixa.

Confirmação empírica: inspecção de 34 faturas-cartão na CAP/CAR confirmou que `tipo` é sempre `'Saída'` — não existe "Fatura-Entrada". Portanto, incluir entradas de cartão no Bloco 1 não gera dupla contagem com o Bloco 2.

Regra refinada do Bloco 1 (migration 0068):
- **Incluir:** qualquer lançamento liquidado com `valor > 0`, mesmo em conta-cartão
- **Excluir:** lançamentos liquidados com `valor < 0` em conta-cartão (contabilizados via Fatura no Bloco 2)
- **Excluir:** lançamentos sem liquidação

---

### 2.7 Investigação da Conta Investimento XP

**Contexto:** Ao incluir "Conta Investimento XP" na migration 0067, surgiu a questão de tratar esses lançamentos separadamente por serem rendimentos de investimento, não fluxo operacional.

**Resultado:** 11 lançamentos, todos positivos (entradas), todas as categorias "Aplicações e Investimentos C" ou "Receitas e Rendimentos Financeiros", frequência semanal/quinzenal, valores R$473–R$5.249.

**Decisão v4.1:** Manter no Fluxo de Caixa como receitas não-operacionais (regime caixa — o dinheiro chegou na conta). Tratamento diferenciado (DRE) é candidato para v4.2.

---

## Parte 3 — Decisões arquiteturais da Abordagem B

### Abordagem B — 4 blocos UNION ALL

```
vw_fluxo_caixa_kpis_b
│
├── Bloco 1: fato_lancamentos liquidados
│   ├── INCLUI: valor > 0 (entradas), qualquer conta
│   └── INCLUI: valor < 0 (saídas) somente em conta NÃO-cartão
│
├── Bloco 2: raw.fluxo_caixa_titulos realizados
│   └── WHERE descricao ILIKE 'Fatura WCLARA%|CC ASAAS%|CCAB%|CCMV%|VISA WT%|MASTERCARD WT%'
│
├── Bloco 3: raw.fluxo_caixa_titulos futuros
│   └── WHERE conta_previsao NÃO é cartão (ou NULL)
│
└── Bloco 4: raw.fluxo_caixa_titulos futuros
    └── WHERE descricao ILIKE 'Fatura %' (faturas previstas)
```

### Trade-offs documentados

- KPIs (Abordagem B) ≠ Decomposição por Grupo de Categoria (Lançamentos puro). Diferença ~R$40K (~5%). Explicado via tooltip na UI.
- 725 títulos futuros na CAP/CAR sem `conta_previsao` → tratados como não-cartão (Risco 3, impacto <2%).
- Contas novas inseridas pelo auto-sync com `tipo='outro'` podem incluir incorretamente cartões não reconhecidos no Bloco 1 como não-cartão — revisão periódica recomendada.

---

## Parte 4 — Pendências v4.2+

| Item | Detalhe |
|------|---------|
| DROP `raw.contas_pagar_receber` | `_PENDING_drop_raw_contas_pagar_receber.sql` aguarda confirmação explícita de Yan |
| Conta Investimento XP | Segregar rendimentos de investimento do fluxo operacional (DRE) |
| 725 títulos futuros sem conta | Pendência cadastral ERP — impacto <2% nos KPIs futuros |
| DRE evolutiva mensal | Comparar regime caixa × regime competência |
| Conciliação Caixa × Competência | Reconciliação entre Abordagem A e Abordagem B |
| Aging por inadimplência | Top fornecedores/clientes inadimplentes |
| Margem por Operação Weddings | Análise por evento individual |
| Logos reais | PNG Welcome Group e Weddings (substituir placeholders) |

---

## Resumo de arquivos por missão

```
docs/adr/
  0060-0067 — ver §2.4

supabase/migrations/
  0061_financeiro_vp_cpr_rpcs.sql           (pós-v4.0)
  0062_create_raw_fluxo_caixa_titulos.sql   (M2)
  0063_rpcs_fluxo_caixa_titulos.sql         (M2+M4)
  0064_dim_conta_bancaria_eh_cartao_credito.sql  (M3)
  0065_vw_fluxo_caixa_kpis_b.sql            (M4)
  0066_get_proximos_vencimentos_v2.sql       (M6)
  0067_complete_dim_conta_bancaria.sql       (fix checkpoint)
  0068_refine_vw_fluxo_caixa_kpis_b.sql    (fix checkpoint)
  0069_auto_sync_dim_conta_bancaria.sql      (fix estrutural)
  _PENDING_drop_raw_contas_pagar_receber.sql (aguardando confirmação)

src/lib/carga/
  parse-lancamentos-financeiro.ts           (M1)
  parse-fluxo-caixa-titulos.ts              (M2)

src/app/admin/uploads/
  page.tsx                                  (pós-v4.0 + M2)
  actions.ts                                (pós-v4.0)
  financeiro/page.tsx                       (M2)
  financeiro/actions.ts                     (M2)

src/app/financeiro/fluxo-caixa/
  page.tsx                                  (M5+M6+M7)

src/components/financeiro/
  fluxo-mensal-chart.tsx                    (M5)

src/components/shared/
  em-construcao.tsx                         (pós-v4.0)
  preview-button.tsx                        (pós-v4.0)

src/app/executiva/page.tsx                  (pós-v4.0)
src/app/performance/page.tsx               (pós-v4.0)
src/app/performance/trips/page.tsx         (pós-v4.0)
src/app/performance/corporativo/page.tsx   (pós-v4.0)
src/app/metas/page.tsx                     (pós-v4.0)

docs/audits/
  2026-05-26-checkpoint-kpis-abordagem-b.md
```
