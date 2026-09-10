# D7 — Testes

Explorador D7 (Sonnet, read-only) sobre `_insumos/vitest-tempos.limpo.txt` e `vitest-por-arquivo.txt`
(baseline de hoje: 72 arquivos, **1207 testes**, 0 skip, 103 s) + leitura. Skill lida: `banco-e-rpc` §6.
Formato: `README.md` desta pasta.

| id | achado | evidência | risco | esforço | ação proposta | classe | triagem | nota |
|---|---|---|---|---|---|---|---|---|
| D7-001 | `rpc-contrato.test.ts` (54 s, 140 testes = metade do tempo da suíte) faz 1 `fetch` por `it`, serial, sem `describe.concurrent`; nenhum bloco muta estado global (RBAC é só leitura/probe) — paralelizável sem mudar o que se prova | `src/lib/rpc-contrato.test.ts:64-1916` (26 blocos `describe.skipIf(!ON)`); `_insumos/vitest-por-arquivo.txt:1` | baixo | M | marcar os `describe` independentes como `.concurrent`, medir o ganho | simplificar | | |
| D7-002 | Inventário dos 5 arquivos que tocam banco direto: todos cumprem o contrato §6 (transação por caso, `lock_timeout`, `skipIf`, sem `COMMIT`) — nenhuma violação | `src/lib/dre/reverter-diario.test.ts` (7 casos, `emTransacaoRevertida` por caso); `src/lib/monde/virada-paridade.test.ts` (1); `src/lib/api-externa/contrato-api-externa.test.ts` (exceção: fixture `ZZ_TESTE_API_V540` commitada em `beforeAll`/apagada em `afterAll`, 34 `it`); `src/lib/rpc-contrato.test.ts` declarado `SOMENTE_LEITURA` na sonda | baixo | S | nenhuma | documentar | | |
| D7-003 | Sonda `sonda-teste-escreve-banco.test.ts` enumera exatamente os 2 que escrevem-e-revertem (`reverter-diario`, `virada-paridade`) + 1 exceção commitada (`contrato-api-externa`) — contagem do gatilho §6 = **3**; reavaliação de ambiente de teste é no 4º | `src/lib/sonda-teste-escreve-banco.test.ts:62-65,136-140`; skill §6 linhas 589-595 | baixo | S | nenhuma | documentar | | |
| D7-004 | Sem `SUPABASE_DB_URL`/`.env.local`, ~180 casos somem em silêncio (`rpc-contrato` ~140 em 26 blocos, `contrato-api-externa` 34 num único `skipIf(!ON \|\| !RPC_PRONTA)`, `reverter-diario` 7, `virada-paridade` 1) — lição v5.4.3; "0 skip" hoje só porque o `.env.local` estava carregado (= D5-004) | `_insumos/vitest-tempos.limpo.txt`; `src/lib/rpc-contrato.test.ts:64…`; `src/lib/api-externa/contrato-api-externa.test.ts:120` | médio | M | contador explícito de `skipIf` resolvidos para skip no output, para a suíte nunca parecer verde por omissão | documentar | | |
| D7-005 | `get_dre_competencia_mensal` (9–15×) e `dre_estrutura`/`get_operacoes_weddings` (6×) são chamados repetidamente em `rpc-contrato.test.ts`, mas cada chamada prova um invariante DIFERENTE — não há duplicação real de mesma RPC+args+asserção | `src/lib/rpc-contrato.test.ts:1545-1848` | baixo | S | nenhuma | documentar | | |
| D7-006 | Testes de parser usam matriz **inline** convertida em bytes `.xlsx` reais (`aoa_to_sheet`+`write`) — exercitam o parser de verdade, mas o conteúdo é inventado; nenhum diretório `__fixtures__`/arquivo `.xlsx`/`.csv` real existe no repo (padrão diferente do que resolveu o ×1000 da v5.5.2) | `src/lib/faturamento/parse-clientes-corp.test.ts:6-12`; `src/lib/carga/parse-fluxo-caixa-valor-nativo.test.ts`, `parse-demonstrativo-competencia.test.ts`, `parse-pessoas.test.ts`, `vendas-parser.test.ts`; `Glob __fixtures__` = 0 | médio | L | avaliar corpus de arquivos reais anonimizados (trabalho de captura, não limpeza) | decidir | | |
| D7-007 | Nenhum teste de módulo morto: cruzando os 21 "Unused files" do knip com `*.test.ts`, nenhum órfão tem teste próprio mantendo-o vivo | `_insumos/knip.txt:1-22`; `Glob src/components/weddings/margem-drawer*.test.ts*` = 0 | baixo | S | nenhuma | documentar | | |
| D7-008 | Sem flakiness por relógio: os arquivos com `new Date()`/`hojeSP()` mockam (`vi.useFakeTimers`+`vi.setSystemTime`) ou usam data como parâmetro fixo de contrato | `src/lib/solicitacoes/format.test.ts:42-58`; `src/lib/cdi/serie-sgs.test.ts:7`; `src/lib/rpc-contrato.test.ts` | baixo | S | nenhuma | documentar | | |
| D7-009 | Nenhum `it.todo`/`it.skip`/teste vazio; os 2 `expect(true).toBe(true)` são legítimos (checam a EXISTÊNCIA do gate `REQUIRE_CONTRACT=1`) | `src/lib/rpc-contrato.test.ts:588`; `src/lib/api-externa/contrato-api-externa.test.ts:789` | baixo | S | nenhuma | documentar | | |
| D7-010 | Dois arquivos com o MESMO nome (`decomposicao-variacao.test.ts`) em módulos não relacionados — `src/lib/decomposicao-variacao.ts` (`gerarTextoDecomposicao`) vs `src/lib/dre/decomposicao-variacao.ts` (`montarDecomposicao`/`narrativaVariacao`) — colisão de nome que engana leitura/grep | `src/lib/decomposicao-variacao.test.ts:1-2`; `src/lib/dre/decomposicao-variacao.test.ts:1-4` | baixo | S | renomear um dos dois (ex.: `decomposicao-texto.ts`) — cruzar com D9 | decidir | | |

## Síntese

A suíte de banco (5 arquivos) está limpa: contrato §6 cumprido, sonda exata, gatilho em 3/4. `rpc-contrato.test.ts` concentra metade do tempo por ser 140 requisições HTTP seriais, não por redundância — `describe.concurrent` é ganho real sem mudar o que se prova. O maior risco estrutural é o volume de testes que desaparecem em silêncio sem `.env.local` (~180) — eco da v5.4.3, sem enforcement visível. Parsers usam bytes `.xlsx` reais mas conteúdo sempre sintético — dívida conhecida desde a v5.5.2.

## Contagem por classe

documentar 7 · simplificar 1 · decidir 2 · apagar 0 · corrigir 0 — **total 10**.

## Achei, não vou agir

- Os 45 testes de `email.test.ts` e 38 de `av.test.ts` não abertos individualmente (tempo agregado < 300 ms).
- Ganho real de `describe.concurrent` não medido (Fase 2, se triado).
- `promover_carga_vendas` (RPC destrutiva) só tem contrato estrutural de shape (`rpc-contrato.test.ts:597-609`) — prova comportamental em transação revertida seria um 4º arquivo (dispara o gatilho §6); observação, não achado.

## Riscos fora do escopo

- Qualquer 4º arquivo que passe a escrever-e-reverter dispara a reavaliação de ambiente de teste próprio — decisão que não é desta dimensão.
