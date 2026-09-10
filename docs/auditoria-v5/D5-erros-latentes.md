# D5 — Erros latentes

Explorador D5 (Sonnet, read-only) por grep + leitura. Skills lidas: `react-padroes`, `contrato-rpc-front`,
`email`. Formato: `README.md` desta pasta.

| id | achado | evidência | risco | esforço | ação proposta | classe | triagem | nota |
|---|---|---|---|---|---|---|---|---|
| D5-001 | `Promise.allSettled` com índice **posicional dinâmico** (array montado por `.map()` sobre anos + 2 chamadas fixas, lido por `resultados[i]`/`resultados[anosDre.length]`/`resultados[OFFSET_COMP+i]`) — já mordeu 2× (v5.7.1, v5.8.0); hoje fortemente comentado/guardado, mas uma 3ª chamada inserida fora do fim volta a deslocar tudo em silêncio | `src/app/financeiro/dre/page.tsx:133-165` (comentários nas linhas 121,138,150 documentam o risco) | médio | L | substituir o array posicional por `Map`/objeto chave→resultado antes de indexar, eliminando o offset aritmético | documentar | | candidato a backlog v6 (redesenho, não patch) |
| D5-002 | `aprovarSolicitacao`: após criar o usuário, chama `supabase.rpc('admin_decidir_solicitacao', …)` sem checar o `error` do retorno (SDK não lança) **e** o `try/catch` só pega exceção de rede — se a RPC falhar (RLS/negação), só loga e retorna sucesso: a solicitação nunca sai de "pendente" e ninguém é avisado | `src/app/admin/acessos/actions.ts:198-203` | médio | S | destruturar `{ error }`, logar e sinalizar no retorno (`avisoParcial`) em vez de engolir | corrigir | | sem teste local que exercite este caminho → pela regra 1 do briefing, corrigir só com cobertura |
| D5-003 | `admin_marcar_trocar_senha` chamado sem NENHUMA verificação de retorno — se falhar, o usuário é criado mas a senha provisória nunca é marcada para troca obrigatória, e nada acusa | `src/app/admin/acessos/actions.ts:113` | médio | S | destruturar `{ error }` e logar (mesmo padrão do resto do arquivo) | corrigir | | mesmo bloco de D5-002 — corrigir junto |
| D5-004 | 4 arquivos com `describe.skipIf` fazem ~153–180 casos desaparecerem em silêncio se `.env.local`/creds faltarem (`rpc-contrato` ~140, `contrato-api-externa` 34, `reverter-diario` 7, `virada-paridade` 1) — classe v5.4.3; hoje "0 skipados" só porque o `.env.local` está carregado; não há sonda que **force** falha se `ON` virar `false` onde deveria haver creds | `src/lib/rpc-contrato.test.ts:48,64…` (`ON=Boolean(HOST && KEY)`); `src/lib/api-externa/contrato-api-externa.test.ts:120`; `src/lib/dre/reverter-diario.test.ts:80,194`; `src/lib/monde/virada-paridade.test.ts:20` | baixo | S | meta-teste (molde v5.9.6) que falhe quando `REQUIRE_CONTRACT=1` e `ON` for `false`, ou reporte skipados vs. baseline (= D7-004) | documentar | | `sonda-teste-escreve-banco.test.ts` NÃO tem `skipIf` — sempre roda |
| D5-005 | Grep de `TODO\|FIXME\|XXX\|HACK` em `src/` não encontra NENHUM marcador real — as 39 ocorrências são a palavra portuguesa "TODO/TODOS" em comentários (`TODO ano`, `TODO valor`) | `src/lib/carga/coercao.ts:89`; `src/app/financeiro/dre/page.tsx:178`; `src/lib/rpc-contrato.test.ts:879` | baixo | S | nenhuma ação de código; corrigir a metodologia do inventário (`\bTODO:` com contexto de marcador) | documentar | | achado sobre o PROCESSO, não sobre o código |
| D5-006 | `catch {}` mudo em 3 componentes de filtro de período ao gravar preset no `localStorage` — silencioso por desenho (quota/modo privado); perde só a persistência do filtro | `src/components/shared/periodo-filter-url.tsx:54,62`; `periodo-filter-pills-url.tsx:62,71`; `periodo-pills-url.tsx:63,71` | baixo | S | nenhuma — best-effort de UI consistente nos 3 call-sites | documentar | | |
| D5-007 | `getBenchmarks` não checa `error` do `.rpc('get_dashboard_config')`, mas todo caminho cai em fallback estático (`?? MARGEM_OK`) — degradação correta por construção | `src/lib/config.ts:20-26` | baixo | S | nenhuma — intencional | documentar | | |

## Síntese

O risco real de D5 não é volume de `catch` mudo (o app segue o padrão certo na maior parte, inclusive onde a lição v5.3.5/v5.9.1 foi aplicada) — são dois pontos em `admin/acessos/actions.ts` (criação de acesso) onde o erro da RPC é descartado sem checagem e sem teste que os proteja. O segundo risco é estrutural: a DRE ainda depende de índice posicional numa lista de tamanho variável, sobrevivendo por comentário e disciplina. `Promise.all`/`allSettled` no resto do app (7 sites) é 100% nomeado. `any`/`eslint-disable` estão justificados ("RPC fora dos tipos gerados"). Não há fire-and-forget nem TODO/FIXME reais.

## Contagem por classe

corrigir 2 · documentar 5 · apagar 0 · simplificar 0 · decidir 0 — **total 7**.

## Achei, não vou agir

- `console.error`/`console.warn` em Server Actions/routes fora dos dois pontos de `admin/acessos` — todos já retornam erro estruturado ao chamador.
- `Promise.all`/`allSettled` nomeado nos demais 7 sites (`carregar.ts`, `route.ts` do weddings, `uploads/page.tsx`, `estrutura/page.tsx`, `estrutura-competencia/page.tsx`, `fluxo-caixa/page.tsx`, `gerencial/page.tsx`).
- `any`/`eslint-disable` em `faturamento-corp`, `performance-content.tsx`, `kpi-principal-drawer.tsx`, `onboarding.ts` — comentados; a duplicação do cast em vez de helper único é achado de D4 (D4-009/010).

## Riscos fora do escopo

- `faturamento-corp/actions.ts` e `cadastro-actions.ts` duplicam `(db.rpc as any)` em ~15+ call-sites em vez de um helper único — tratado em D4-009.
