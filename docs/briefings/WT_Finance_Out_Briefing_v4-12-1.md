# WT Finance — Out-Briefing v4.12.1

**Data:** 2026-06-09 · **Branch:** `feat/v4-12-1` · **Versão:** 4.12.0 → **4.12.1** (PATCH)
**Tema:** Saneamento técnico pós-v4.12 — unificação dos parsers de Vendas (P1) e expansão da validação de contrato Zod às RPCs críticas (P2). Fonte: `docs/audits/2026-06-09-escopo-proximo-patch-pos-v4-12.md`. **Escopo: só P1 + P2.** P3/P4/P5 ficam registrados para a próxima.

---

## Missões implementadas

| # | Missão | Resultado |
|---|--------|-----------|
| M1 | Parser único de Vendas (P1) | Núcleo de parsing extraído para `src/lib/carga/vendas-parser.ts` (isomórfico). Os dois caminhos consomem-no: UI (`parse-vendas-produto.ts`) e API Route (`carga/vendas.ts`, que antes tinha parser próprio **sem** `operacao_propria`). Casamento de cabeçalho tolerante (acento/caixa/espaço) + aviso de coluna não-mapeada nos dois caminhos. **Migration 0118**: `inserir_lote_staging`/`promover_carga_vendas` passam a gravar `operacao_propria`. +12 testes. |
| M2 | Zod nas RPCs críticas (P2) | Padrão `parseRpc` estendido de 1 → 8 RPCs (uma schema por RPC, `.passthrough()`, invariantes-chave). Drift → log + `null` (degrada para `ErroCarregamento`/HTTP 500; nunca quebra a tela). |
| M3 | Fechamento | 4.12.1, CHANGELOG, CHANGELOG_DIRETORIA, este out-briefing, nota na CLAUDE.md, gates, PR. |

---

## O achado que mudou o M1 (decisão de escopo do usuário)

Ao investigar o P1 descobriu-se que os dois caminhos de Vendas divergiam em **parser E pipeline**, e que:

1. A **API Route `/api/admin/upload-vendas` é vestigial** — nenhum `fetch` na app a chama. Logo, a ingestão atômica da v4.12 (0116) **não protege o upload real** (a UI usa o pipeline antigo, não-atômico, via Server Actions em `actions.ts`).
2. As funções `inserir_lote_staging`/`promover_carga_vendas` (0116) **omitiam `operacao_propria`** — a coluna existe na staging (`LIKE raw.vendas_excel`) mas nunca era preenchida. Portanto **unificar só o parser (TS) não fecharia a porta**: o SQL ainda descartaria a coluna.

→ Premissa "sem migration" do prompt **não se sustentava**. O usuário escolheu a **Opção A**: parser único (TS) **+ migration 0118** (grava `operacao_propria` no pipeline atômico), mantendo os dois pipelines como estão. Os caminhos "migrar a UI ao atômico" e "fechar o F2 do caminho real" ficam registrados como follow-up (P-itens da próxima auditoria).

---

## Migration

| # | O quê | Verificação |
|---|-------|-------------|
| **0118** | `CREATE OR REPLACE` de `inserir_lote_staging` e `promover_carga_vendas` para incluir `operacao_propria` (22 colunas). Não-destrutiva (só substitui funções; `ALTER ... ADD COLUMN IF NOT EXISTS` defensivo na staging). | _A confirmar:_ aplicação via `db push` pende de confirmação do usuário (produção direta). Pós-push: `inserir_lote_staging` HTTP 204 (não-destrutiva); `promover_carga_vendas` **não** rodado em produção (destrutivo — coberto por lógica + a validação/rollback da 0116). |

## RPCs cobertas por Zod (M2)
`get_executiva_kpis`, `get_tendencia_margem`, `get_ranking_vendedores_range`, `get_vendas_em_aberto`, `get_vendas_receita_negativa`, `get_operacoes_weddings`, `get_carteira_weddings` — somadas à semente `get_mix_produto` (8 no total). Mantido em `unwrapRpcComErro` o `get_executiva_kpis` de `performance-content` (preserva a flag de erro que alimenta o `ErroCarregamento`).

## Correção pós-M2 (mesmo PR) — HTTP 500 na Lista de Operações
Após a entrega, a Lista de Operações (Weddings) retornava **HTTP 500**. Root cause (depurado via REST anon×service + `safeParse` dos dados reais): a RPC `get_operacoes_weddings` retorna 200 em ~0,3s (anon) — **não** era timeout nem erro de RPC. O `operacoesWeddingsSchema` (M2) exigia `passageiros_raw` (`z.string().nullable()`), mas a RPC **nunca emite esse campo** (o tipo TS `OperacaoItem` o declarava por engano; o componente nem o lê). `undefined` reprova em `.nullable()` → `parseRpc` → `null` → a rota retorna 500. O `unwrapRpc` antigo tolerava a mentira de tipo em silêncio; a validação do M2 a expôs.

**Fix:** `passageiros_raw: z.string().nullable().optional()` (reflete o contrato real). **Varredura completa**: os 7 schemas do M2 foram validados contra o retorno REAL de cada RPC (via REST service role) — só `operacoesWeddingsSchema` divergia, e só nesse campo (todas as 233 operações). **Guard de regressão:** novo bloco em `rpc-contrato.test.ts` roda cada schema do M2 contra a RPC viva (`safeParse().success`), fechando a lacuna que deixou `get_operacoes_weddings` fora do contrato. Suíte 47 → **54**.

## ADRs
- **Nenhum ADR novo.** A unificação é aplicação dos ADRs **0098/0099** (parser tolerante + `Date` nativo); a validação de shape é o padrão do **ADR-0105/F7**. (O prompt deixou o ADR a critério; a unificação não introduz premissa arquitetural nova.)

## Gates
- `npx tsc --noEmit`: **0 erros** (a index signature do `.passthrough()` é atribuível aos tipos nominais — sem ajuste necessário).
- `npm test`: **54/54** (35 → 47 com o parser; +7 contract tests do fix pós-M2 = 54).
- `npm run lint`: **13 problemas** (10 erros + 3 warnings) — **baseline inalterado** (React Compiler P3; nenhum novo de M1/M2).
- `npm run build`: **limpo**.

## Arquivos modificados
**M1:** `src/lib/carga/vendas-parser.ts` (novo), `src/lib/carga/vendas-parser.test.ts` (novo), `src/lib/carga/parse-vendas-produto.ts`, `src/lib/carga/vendas.ts`, `supabase/migrations/0118_staging_operacao_propria.sql` (novo).
**M2:** `src/lib/schemas-rpc.ts`, `src/app/executiva/page.tsx`, `src/app/performance/weddings/actions.ts`, `src/components/performance/performance-content.tsx`, `src/components/performance/weddings-content.tsx`, `src/components/weddings/kpi-principal-drawer.tsx`, `src/app/api/dashboard/executiva/kpis/route.ts`, `src/app/api/dashboard/performance/tendencia-margem/route.ts`, `src/app/api/dashboard/weddings/operacoes/route.ts`, `src/app/api/dashboard/weddings/carteira/route.ts`.
**M3:** `package.json`, `src/lib/version.ts` (deriva da `package.json`), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `CLAUDE.md`, este out-briefing.

## CLAUDE.md — aprendizado permanente adicionado
- Convenção: **"Ingestão de Vendas tem UM parser só"** — os dois caminhos (UI real/não-atômico × API Route atômica/vestigial) consomem `vendas-parser.ts`; paridade de colunas garantida por parser + SQL; **F2 segue aberto para a UI** (a v4.12 só tornou atômico o caminho vestigial). Custou caro (investigação) e é transversal a ingestões futuras.

## Pendências / follow-up (para a próxima auditoria)
- **F2 do caminho real (UI):** migrar `/admin/uploads` (Server Actions, `actions.ts`) para o pipeline atômico (staging/promover) **ou** remover a API Route vestigial — hoje há dois pipelines, e o atômico não cobre o upload usado.
- **P3/P4/P5** do escopo: não tocados, conforme o prompt.
- **Validação Zod incremental:** RPCs fora da lista das 8 (ex.: `get_mix_setor`, `get_prejuizos`, `get_sumario_subsetor`, `get_proximos_casamentos`, `get_vendas_em_aberto_weddings`) seguem sem schema — expandir conforme tocadas.
