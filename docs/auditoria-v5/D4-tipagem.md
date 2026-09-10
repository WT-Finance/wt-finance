# D4 — Tipagem

Explorador D4 (Sonnet, read-only) sobre `_insumos/database.gerado.ts` × `src/types/database.ts`
(`database.diff`) e grep de `RpcFrouxa`/`as unknown as`/`.rpc(`. Skill lida: `contrato-rpc-front`.
Formato: `README.md` desta pasta.

**Achado estrutural prévio (corrige a premissa do briefing):** `src/types/database.ts` não é um
`gen types` "congelado com furos" — é um arquivo **manuscrito da era M1** (linha 1: "Tipos gerados
manualmente com base nas migrations da M1"), com schemas hoje não expostos (`raw`, `analytics`,
`app`, `audit`, `financeiro`; o PostgREST expõe `public`+`graphql_public`). Seu `public.Functions`
lista **55 RPCs** (a mais recente ≈ v4.13–4.18); o banco real tem **≈215** em `public.Functions`
(~40 delas `__nucleo`). O congelado cobre **~25%** da superfície — o helper de tipagem frouxa é o
caminho **principal** (3 em 4 chamadas), não a exceção.

| id | achado | evidência | risco | esforço | ação proposta | classe | triagem | nota |
|---|---|---|---|---|---|---|---|---|
| D4-001 | Congelado cobre ~55/≈215 RPCs reais (≈25%); nenhuma das 55 foi removida/renomeada no banco (checagem de existência, não de assinatura) | `src/types/database.ts:427-597` vs `_insumos/database.gerado.ts:48-905` | baixo | L | decidir: regenerar `database.ts` inteiro (e adaptar os 32 call-sites tipados) vs. manter congelado+helper como convenção declarada | decidir | | |
| D4-002 | Amostra de assinatura (`get_operacoes_weddings`, 9 args) idêntica entre congelado e gerado — sem drift nos casos checados; não exaustivo | `src/types/database.ts:513-526` vs `_insumos/database.gerado.ts:511-538` | baixo | S | registrar como não-exaustivo | documentar | | |
| D4-003 | `public.Tables`/`Views` vazios em ambos os arquivos — todo acesso é via RPC (RLS deny-by-default); nada a regenerar aí | `_insumos/database.gerado.ts:33-38,905-911` | baixo | S | nenhuma | documentar | | |
| D4-004 | ≈40 RPCs `*__nucleo` no banco real duplicam quase toda `get_*`/`gerencial_*` — origem viva ou resíduo? (cruzar com D2-001/D2-002) | `_insumos/database.gerado.ts` grep `__nucleo` | médio | S | tratado em D2 | documentar | | |
| D4-005 | `RpcFrouxa` (6 ocorrências / 3 call-sites): `get_taxas_cdi` validado por `parseRpc(taxasCdiSchema)`; `get_rendimento_float` validado por `parseRpc(rendimentoFloatSchema)`; `cdi_ingest_upsert` não validado mas o retorno só é ecoado como log | `src/components/performance/weddings-content.tsx:68,90`; `src/app/api/dashboard/weddings/operacao/[id]/route.ts:36,71`; `src/app/api/cdi/ingest/route.ts:82-88` | baixo | S | nenhuma — padrão são | documentar | | |
| D4-006 | `mix-produto/route.ts` faz `data as unknown as MixProduto` sem `parseRpc`, embora `mixProdutoSchema` exista e já seja usado por outro consumidor da MESMA RPC | `src/app/api/dashboard/performance/mix-produto/route.ts:27-31`; `src/lib/schemas-rpc.ts:40-43`; `src/components/performance/performance-content.tsx:118` | médio (validação pode rejeitar dado hoje aceito) | S | `parseRpc(mixProdutoSchema, res, 'get_mix_produto')` — só com teste de contrato | corrigir | | |
| D4-007 | 8 route handlers castam `data as unknown as T` sem `parseRpc` e **sem schema Zod existente**: `cagr` (`get_cagr`), `prejuizos` (`get_prejuizos`, 2×), `mix-setor`, `weddings/pipeline`, `weddings/sumario-subsetor`, `weddings/proximos`, `kpi-historico` (`get_historico_mensal`), `setores` (`get_setores_macro`) | `src/app/api/dashboard/performance/cagr/route.ts:13`; `.../prejuizos/route.ts:35,37`; `.../mix-setor/route.ts:31`; `.../weddings/pipeline/route.ts:26`; `.../weddings/sumario-subsetor/route.ts:29`; `.../weddings/proximos/route.ts:26`; `.../kpi-historico/route.ts:26`; `src/app/api/setores/route.ts:17` | médio | M | schema Zod por RPC + `parseRpc`, um por vez, com teste de contrato | corrigir | | |
| D4-008 | `weddings/operacao/[id]/route.ts:57` faz `detalhe.data as unknown as DrilldownOperacao` sem `parseRpc` — a mesma função já valida o vizinho `get_rendimento_float` | `src/app/api/dashboard/weddings/operacao/[id]/route.ts:43,57` | médio | S | `drilldownOperacaoSchema` + `parseRpc`; teste de contrato | corrigir | | |
| D4-009 | `faturamento-corp/actions.ts`: **26 usos de `(db.rpc as any)`** (ou `db: any`) — padrão paralelo, não-documentado, mais frouxo que `RpcFrouxa`/`BoundRpc`; `any` apaga toda checagem de args/retorno; zero `parseRpc` em toda a superfície de faturamento | `src/app/financeiro/faturamento-corp/actions.ts` (ex. linhas 31,126,134,146,230,249,356,490,510,595,630,641,652,706,717,722,789,821) | médio | L | migrar para o helper documentado (`BoundRpc`); schemas depois | corrigir | | |
| D4-010 | Mais 8 `(x.rpc as any)` fora de faturamento-corp: `onboarding.ts` (2), `performance-content.tsx` (3), `kpi-principal-drawer.tsx` (5, comentado como decisão consciente), `faturamento-corp/page.tsx` (1), `cadastro-actions.ts` (1), `calculadora-rateio/actions.ts` (1) | `src/lib/onboarding.ts:16,29`; `src/components/performance/performance-content.tsx:40,108,110`; `src/components/performance/kpi-principal-drawer.tsx:281-295`; `src/app/financeiro/faturamento-corp/page.tsx:21`; `.../cadastro-actions.ts:17`; `.../calculadora-rateio/actions.ts:22` | baixo | M | padronizar para `as unknown as BoundRpc` (cosmético, sem mudar comportamento) | simplificar | | |
| D4-011 | Helpers locais `Rpc`/`RpcFrouxa` tipados com `data: any` (não `unknown`) em 2 route handlers de ingestão | `src/app/api/gerencial/import/route.ts:16`; `src/app/api/monde/ingest/route.ts:54` | baixo | S | `any`→`unknown` na assinatura do helper local | simplificar | | |
| D4-012 | ≈45 dos 75 `as unknown as` são o padrão sancionado (definição/uso de `BoundRpc`/`RpcFrouxa`/`Rpc`/`AdminRpc` em `rpc-metas.ts`, `rpc-dre.ts`, `rpc-patrimonio.ts`, `rpc-fluxo.ts`, `api-externa/{http,rpc}.ts`, `solicitacoes/rpc.ts`, `acessos/pendencias.ts`, `admin/uploads/actions.ts` (18 call-sites), `financeiro/fluxo-caixa/**`, `solicitar-acesso/actions.ts`, `sessao.ts`, `ultima-sincronizacao.ts`, `ultima-carga-movimentacao.ts`, `carga/{metas,lancamentos}.ts`) | grep `as unknown as` em `src/**` | baixo | S | nenhuma — skill `contrato-rpc-front` §1 | documentar | | |
| D4-013 | ≈15 `as unknown as` restantes são narrowing comum (worker `self`, `Record<string,…>` de import, evento Recharts, `Response` em teste) — sem relação com RPC | `src/lib/carga/parse.worker.ts:39`; `src/lib/carga/parse-{lancamentos-movimentacao,titulos-em-aberto}.ts`; `src/components/charts/mix-setor-chart.tsx:77`; `src/lib/gerencial/import-types.ts:149`; `src/components/financeiro/gerencial/base-dados-tab.tsx:345` | baixo | S | nenhuma | documentar | | |
| D4-014 | `src/lib/dre/schemas.ts`: os 10 schemas "unused export" do knip são **sub-schemas compostos internamente** nos schemas-pai (que SÃO usados via `parseRpc` nas telas de DRE) — export supérfluo, não chamada sem validação (= D1-017) | `src/lib/dre/schemas.ts:13-291` (ex. linha 87 `linhas: z.array(dreLinhaSchema)`) | baixo | S | remover `export` (tratado em D1-017) | simplificar | | |
| D4-015 | 32 arquivos chamam `.rpc(` direto e tipado contra o congelado (RPC antiga) — a `Database` type ainda serve para essas ~55 | grep `\.rpc\(` em `src/**` (30 arquivos com padrão frouxo + 32 com chamada tipada) | baixo | S | nenhuma | documentar | | |

## Síntese

O `database.ts` "congelado" é manuscrito da M1 e cobre só 55 de ≈215 RPCs (~25%); o helper frouxo é o caminho majoritário. Os 3 usos de `RpcFrouxa` estão corretos. O problema real está em **34 usos de `(x.rpc as any)`** — segundo padrão não-documentado, concentrado em `faturamento-corp/actions.ts` (26, zero `parseRpc`) — e em **9 route handlers** que castam `data` sem `parseRpc`, um deles (`mix-produto`) com schema já pronto e não usado.

## Contagem por classe

decidir 1 · corrigir 4 · simplificar 3 · documentar 7 · apagar 0 — **total 15**.

## Achei, não vou agir

- Varredura assinatura-por-assinatura das 55 RPCs do congelado (só 1 amostra) — resolvida automaticamente se D4-001 for "regenerar".
- Os ~40 `*__nucleo` — pertence a D2.
- `kpi-principal-drawer.tsx`: dos 5 `as any`, 2 confirmados com `parseRpc` a jusante, 3 não checados individualmente.

## Riscos fora do escopo

- `faturamento-corp/actions.ts` (D4-009) tem 800+ linhas e zero `parseRpc` — a maior área sem rede de contrato do projeto (cruzar com D7).
