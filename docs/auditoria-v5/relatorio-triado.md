# Relatório de Auditoria v5 — TRIADO (GATE 1 fechado em 10/09/2026)

Triagem feita pelo Yan + Chat sobre `docs/auditoria-v5/relatorio.md` (145 achados) mais 8 achados
novos vindos da leitura dos 20 arquivos de `docs/audits|investigacoes|superpowers|harness`
(a pendência D8-005). **Este documento é a spec da Fase 2.** Achado que não está em `agir agora`
não é tocado.

## Correções de fato apuradas na triagem

- **A1 da auditoria de 13/06 (perda silenciosa de linhas com setor novo): ENCERRADO.** A migration
  `0132` acrescentou ao `validar_carga_staging` o pré-check de `setor`/`setor_micro` contra
  `dim_setor`/`dim_setor_micro`, com mensagem explícita e reprovação **antes** do swap. Verificado
  no catálogo vivo em 10/09.
- **D8-005 contava 21 arquivos; são 20** (provável dupla contagem do `.json` do baseline).
- **D1-008/D9-019 (`mockup-dados.ts`):** a condição de produto declarada no arquivo foi cumprida —
  a controladoria aposentou o dashboard antigo (decisão do Yan, 10/09). O oráculo perdeu função.

## Regras globais da triagem (aplicam-se a classes inteiras)

| # | Regra | Efeito |
|---|---|---|
| G1 | `documentar` cujo conteúdo é **check limpo** (nada a fazer) → **descartar** da fila; o fato só entra no `estado-do-projeto.md` se for útil a quem chega | resolve a maior parte dos 55 `documentar` |
| G2 | Esforço `L` ou que exige redesenho → **backlog v6** | limpeza não reestrutura |
| G3 | Todo `DROP` (função, constraint, tabela, índice) → **uma destrutiva única**, por último, após o deploy do código | GATE 2 |
| G4 | Exclusão só com **grep de prova no ato**, registrado na mensagem do commit | regra 2 do briefing |
| G5 | **Segurança de dependência sai da v5.10.0** e vira patch próprio (ver abaixo) — misturar CVE com limpeza atrasa o que é urgente | — |
| G6 | Falso positivo de ferramenta → **descartar** + anotar exceção na config da ferramenta (para a próxima auditoria não redescobrir) | D1-001/002/003, D6-001, D2-008/009 |

## Fora da v5.10.0 — três patches de segurança, nesta ordem

O Yan decidiu em 10/09 fazer os três "agora". **Não entram nesta versão** (G5) — cada um é patch
próprio, com gates completos:

1. **`next` 16.2.9 → 16.3.4** (D6-003/D6-006) — **primeiro e imediato**: 2 CVEs *critical* de RCE
   em produção hoje; fix é minor; resolve em cascata `postcss`/`sharp`. Validar o fluxo do
   `proxy.ts` (login/redirect/401) depois do bump — é a camada 1 do enforcement.
2. **`vitest` 3 → 5** (D6-005) — dev-only, mas mexe em config/reporters e na suíte inteira;
   baseline a reconfirmar (1207).
3. **`nodemailer` 9 → 10** (D6-004) — major com breaking em ação externa **irreversível**; exige
   teste de envio real em modo fail-closed (skill `email`) antes do merge.

Recorrência registrada: `next` com advisories HIGH e fix em minor apareceu **três vezes**
(28/05, 13/06 A2, 10/09 D6-003). Sempre corrigido, nunca virou rotina — ver E8.

---

## D1 — Código morto

| id | triagem | nota |
|---|---|---|
| D1-001 | descartar | falso positivo; anotar `.claude/hooks/**` no `knip.json` (ver D1-ferramenta) |
| D1-002 | descartar | idem, `scripts/db-gate/exportar.mjs` (chamada por `execFileSync`) |
| D1-003 | descartar | idem, `dre-oracle.mjs`; registrar como utilitário de verificação no `estado-do-projeto.md` |
| D1-004 | descartar | **manter** o script: regenera artefato a partir da fonte (critério do Yan). Uma linha no `estado-do-projeto.md` |
| D1-005 | **agir agora** | feito em f43d493 · prova: grep -rn "limpeza-anexos" → só auto-referências no cabeçalho |
| D1-006 | **agir agora** | feito em f43d493 · prova: grep -rn "collapsible-section|CollapsibleSection" src supabase scripts → vazio |
| D1-007 | **agir agora** | PARCIAL em f43d493 · componente apagado (prova: único hit era o comentário em dre/page.tsx:44, reescrito). O decomposicaoBlocoSchema FICA: é usado por rpc-contrato.test.ts:1058,1075,1099 — sai junto com o DROP da RPC no Bloco 5 |
| D1-008 | **agir agora** | feito em f43d493 · prova: grep -rn "mockup-dados|mockupDados" → só menção histórica em tabela-dre.tsx:7 |
| D1-009 | **agir agora** | feito em f43d493 · prova: único hit era o catálogo em admin/design-system/page.tsx:496, removido junto |
| D1-010 | **agir agora** | feito em f43d493 · prova: grep -rn "layout/header|from './header'" src → vazio |
| D1-011 | **agir agora** | feito em f43d493 · prova: grep -rn "margem-drawer|MargemDrawer" src → só uso cruzado entre os dois |
| D1-012 | **agir agora** | feito em f43d493 · prova: grep -rnE "seed/(check-andressa|diag|test-m4|test-operacoes|validate-0026|validate-m1)" em package.json src scripts supabase docs .claude CLAUDE.md → vazio. ⚠️ recontar o mapa RPC→chamadores antes do Bloco 5 |
| D1-013 | descartar | **manter** `seed-fluxo-caixa.ts` (chama RPCs vivas; único caminho de popular local) |
| D1-014 | **agir agora** | feito em a45fee4 (junto de D6-002) · declarado 8.59.1, a versão já resolvida |
| D1-015 | **agir agora** | PARCIAL em f43d493, CORRIGIDO em 4f0d0a2 · só limparTopLevel ficou interno. CORRIGE O RELATÓRIO (2×): (a) SCHEMAS, qJson, colunasNaoGeradas e pgCopyOut são importados por scripts/db-gate/exportar.mjs:19 — o knip os deu como mortos porque marcou o próprio exportar.mjs como não usado (falso positivo em cascata); (b) getPool teve o export RESTAURADO — achado ALTO do revisor: docs/runbooks/db-backup-gate-runbook.md:65 o importa no procedimento de RESTORE. LIÇÃO DE MÉTODO: consumidor vivo dentro de code-fence de Markdown não é alcançado por knip nem por grep em código — a prova de orfandade tem de varrer docs/runbooks/ e ADRs |
| D1-016 | **agir agora** | PARCIAL em f43d493 · ChartReferenceLineY apagada (0 uso; linha de doc do design-system removida junto). CORRIGE O RELATÓRIO: listMonths NÃO foi apagada — é o motor do fillMonths (fill-months.ts:56); só perdeu o export e saiu do barrel |
| D1-017 | **agir agora** | feito em f43d493 · os 10 sub-schemas perderam o export (0 consumidor externo cada); comentário de design 30-44 intocado |
| D1-018 | **agir agora** | CONCLUÍDO em 1b88b99 · CORRIGE A NOTA ANTERIOR (que era minha e estava errada): rpcFluxo, HorizonteMes, HorizonteAno, RunwaySemana e SaldoRepasse NÃO eram "usados internamente" — o lint provou 0 uso externo E 0 interno, e o grep do item 3 confirmou 0 ocorrência em código, docs/runbooks, docs/adr, docs e harness. APAGADOS (decisão do Chat, item 3). Os 6 schemas internos seguem apenas desexportados. Ao apagar rpcFluxo saíram também os imports ServerClient e RpcLike (só ele os usava) e o comentário de cabeçalho, que afirmava que estas RPCs não estão no database.ts — falso desde a adoção do gerado (ADR-0173): as 8 estão lá |
| D1-019 | **agir agora** | CONCLUÍDO em 1b88b99 · mesma correção do D1-018: CustomField, Passenger, SaleListItem, SalesListResponse e SaleDetailResponse eram mortos por inteiro, não "usados internamente". APAGADOS. Os 4 schemas (zCustomField, zPassenger, zProduct, zSaleListItem) FICAM, apenas desexportados — compõem zSalesListResponse/zSaleDetail internamente |
| D1-020 | **agir agora** | PARCIAL em f43d493 · CORRIGE O RELATÓRIO: só 2 das 4 eram mortas (formatarPeriodo, resolverPeriodoFromParams — apagadas, com os imports getMonth/getDate que ficaram órfãos). calcularPeriodoAnteriorInteligente e calcularYoYInteligente são usadas por resolverPeriodoCompleto (linhas 235-236): só perderam o export |
| D1-021 | **backlog v6** | ~29 interfaces de `types/api.ts`; junto de B-05 (tipagem) |
| D1-022 | **backlog v6** | congelado; junto de B-05 |
| D1-023 | **agir agora** | feito em f43d493 · 16 símbolos com uso interno comprovado perderam só o export. 3 ficam (só a definição, sem uso): atualizarObsMovimentacao (Server Action), SumarioExecutivoSkeleton, CLIENTES_COLUNAS → backlog |
| D1-024 | descartar | falso positivo confirmado |
| D1-025 | **agir agora** | ACHADO INVÁLIDO (decisão do Chat, item 4) · não é export duplicado: LIMITE_MESES e JANELA_LARGA_FRENTE são constantes semanticamente distintas que hoje têm o mesmo valor (36), AMBAS vivas (JANELA_LARGA_FRENTE em weddings-content.tsx:14,61,70; LIMITE_MESES em janela-fluxo.test.ts). Consolidar removeria um nome em uso. NÃO consolidado, registrado como inválido no ADR-0173 (Decisão 2) |
| D1-ferramenta | **agir agora** | feito em f43d493 · knip e depcheck como devDependencies + knip.json com as exceções (hooks, exportar.mjs, dre-oracle.mjs, gera-seed-dre-competencia.mjs, seed-fluxo-caixa.ts, Tailwind) |

## D2 — Banco: objetos

| id | triagem | nota |
|---|---|---|
| D2-001 | **agir agora** | destrutiva: DROP do wrapper + `__nucleo` |
| D2-002 | **agir agora** | destrutiva: DROP das 4 `__nucleo`; reconfirmar no ato que o wrapper não faz `EXECUTE format` |
| D2-003 | **agir agora** | destrutiva |
| D2-004 | **agir agora** | destrutiva |
| D2-005 | **agir agora** | destrutiva, **com** confirmação no ato de que nada lê `app.config` direto |
| D2-006 | **agir agora** | **manter** a função; `COMMENT ON FUNCTION` declarando "kill switch dormente — runbook v4-13" na aditiva |
| D2-007 | **agir agora** | decisão do Yan: **dropar**. Destrutiva leva as 3 RPCs **+ `app.meta_subsetor` e `app.meta_subsetor_historico`** (provar vazias no ato); depois **fechar o PR #213**. `get_sumario_subsetor` e a chave `produtos_nao_classificados` FICAM (vivas na Performance) |
| D2-008 | descartar | falso positivo do método; a correção do método vai para o `knip.json`/estado-do-projeto (mapa deve varrer policies) |
| D2-009 | descartar | idem, triggers |
| D2-010 | **agir agora** | aditiva: REVOKE/GRANT explícito nas 21 |
| D2-011 | descartar | check limpo |
| D2-012 | descartar | check limpo |
| D2-013 | **agir agora** | destrutiva: DROP de `dim_taxa_cdi_taxa_plausivel` (±100%), mantendo a de ±5% |
| D2-014 | descartar | manter separado (ADR-0170) |
| D2-015 | descartar | modelo para a aditiva |
| D2-016 | **agir agora** | escopo **fechado**: `COMMENT ON FUNCTION` nas RPCs centrais que a Fase 2 já toca + as citadas no `estado-do-projeto.md` (~20). O resto → backlog |

## D3 — Banco: desempenho

| id | triagem | nota |
|---|---|---|
| D3-001 | **backlog v6** | B-11 (remedir antes de dropar) |
| D3-002 | **backlog v6** | B-11 |
| D3-003 | **backlog v6** | B-11 |
| D3-004 | **backlog v6** | B-10 |
| D3-005 | **agir agora** | feito em 6a4db84 · buscarUltimaSincronizacaoMonde() virou o 5º elemento do Promise.all; não recebe argumento nem lê resultado das outras chamadas, e já era fail-safe → null |
| D3-006 | **backlog v6** | B-12 |
| D3-007 | **backlog v6** | B-09 |

## D4 — Tipagem

| id | triagem | nota |
|---|---|---|
| D4-001 | **agir agora (só a medição)** | CONCLUÍDO em 65f1326 + fb0fec8 (decisão do Chat, itens 1 e 2) · os 4 TS2322 foram corrigidos tratando o nulo NA FRONTEIRA, sem cast (omitir a chave nos 3 com DEFAULT NULL; sentinela "" no p_nome, com equivalência provada em nullif(trim(coalesce(p_nome,''))) no corpo da função). Depois o database.ts GERADO foi ADOTADO: tsc 0 erros, lint 0, 1217/1217. 645→1039 linhas, 255 entradas de função (o manuscrito cobria ~55). A convenção "congelado + helper" MORREU (ADR-0173, Decisão 1) e o ritual /fechamento-versao ganhou o passo de regenerar quando a versão criar/alterar RPC. ACHADO QUE INVERTE A PREMISSA: os 4 erros não eram código assumindo não-nulo — o gen types NÃO modela nulidade de PARÂMETRO, e nesses 4 pontos o arquivo manuscrito era MAIS preciso que o gerado |
| D4-002 | descartar | registrar como não-exaustivo |
| D4-003 | descartar | — |
| D4-004 | descartar | tratado em D2 |
| D4-005 | descartar | padrão são |
| D4-006 | **agir agora** | feito em a3823fd · parseRpc(mixProdutoSchema) no molde de tendencia-margem/route.ts:29-31. Caso de contrato JÁ existia (rpc-contrato.test.ts:65 e :297) — não precisou de teste novo |
| D4-007 | **backlog v6** | B-07 (8 schemas novos) |
| D4-008 | **agir agora** | BACKLOG V6, junto de B-07 (decisão do Chat, item 6) · exige VisaoFinanceira (14 campos) + DecomposicaoSubsetorItem + AcumuladoMensalItem + RendimentoFloatOperacao, e não há caso de contrato hoje. ⚠️ RETORNO EM UNIÃO: a RPC devolve o drilldown OU um objeto { error } que a rota converte em 404 (weddings/operacao/[id]/route.ts:57-60) — exige união DISCRIMINADA, e um parseRpc estrito antes dessa checagem transformaria o 404 em 500 |
| D4-009 | **backlog v6** | B-06 |
| D4-010 | **backlog v6** | junto de B-06 |
| D4-011 | **agir agora** | feito em a3823fd · os 2 helpers Rpc locais passaram a data: unknown (o de monde também tinha error: any). Consequência: gerencial/import estreita explicitamente no único ponto que lê o resumo; os ?? de fallback não mudaram |
| D4-012 | descartar | padrão sancionado |
| D4-013 | descartar | narrowing comum |
| D4-014 | descartar | = D1-017 |
| D4-015 | descartar | — |

## D5 — Erros latentes

| id | triagem | nota |
|---|---|---|
| D5-001 | **backlog v6** | B-08 (redesenho do carregamento da DRE) |
| D5-002 | **agir agora** | feito em 396f4c0 · { error } checado, avisoParcial no retorno. Teste src/app/admin/acessos/actions.test.ts com PROVA VERMELHA: revertendo a correção, 2 failed | 3 passed |
| D5-003 | **agir agora** | feito em 396f4c0 · mesmo commit e mesmo teste de D5-002 |
| D5-004 | **agir agora** | feito em 396f4c0 · sonda src/lib/sonda-skipif-silencioso.test.ts (inventário fechado dos 4 arquivos gated). PROVA VERMELHA: sem .env.local e com REQUIRE_CONTRACT=1, acusa SUPABASE_DB_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_URL. Cobre o furo do guard antigo, que só via rpc-contrato e 2 variáveis |
| D5-005 | descartar | corrigir só a metodologia do inventário |
| D5-006 | descartar | best-effort consistente |
| D5-007 | descartar | degradação por construção |

## D6 — Dependências

| id | triagem | nota |
|---|---|---|
| D6-001 | descartar | falso positivo; anotar no `depcheck` |
| D6-002 | **agir agora** | feito em a45fee4 · @typescript-eslint/parser declarado como devDependency exata 8.59.1 (era peer transitiva de eslint-config-next). Sonda que o usa: 14/14 verde |
| D6-003 | **fora — patch 1** | ver "três patches de segurança" |
| D6-004 | **fora — patch 3** | idem |
| D6-005 | **fora — patch 2** | idem |
| D6-006 | **fora — patch 1** | cascata do `next` + `audit fix` sem major |
| D6-007 | **agir agora** | feito em a45fee4 · só o patch 0.10.2 → 0.10.3; 0.12 segue em B-04 |
| D6-008 | **backlog v6** | B-04 |
| D6-009 | descartar | registrar a **rotina periódica** no `estado-do-projeto.md` (ver E8) |
| D6-010 a D6-014 | descartar | checks limpos |

## D7 — Testes

| id | triagem | nota |
|---|---|---|
| D7-001 | **agir agora** | MEDIDO E DESCARTADO (decisão do Chat, item 5) · B-15 fechado por medição no backlog. 43,32s (antes) · 40,95s (depois, 1ª) · 57,70s (depois, 2ª). A variância entre rodadas idênticas (~17s) é 7× o ganho aparente (2,4s): o tempo é latência das 140 requisições contra produção, não CPU local. Revertido. Só volta a fazer sentido junto de ambiente de teste próprio (gatilho da skill banco-e-rpc §6) |
| D7-002 | descartar | contrato §6 cumprido |
| D7-003 | descartar | sonda exata; gatilho em 3/4 |
| D7-004 | **agir agora** | feito em 396f4c0 · = D5-004 |
| D7-005 | descartar | sem duplicação real |
| D7-006 | **backlog v6** | B-13 (corpus de fixtures reais) |
| D7-007 a D7-009 | descartar | checks limpos |
| D7-010 | **agir agora** | feito em ec0916e · git mv para decomposicao-texto.ts (+ teste); os 2 consumidores atualizados (decomposicao-variacao-card.tsx:4 e o próprio teste). O irmão da DRE fica como está |

## D8 — Documentação

| id | triagem | nota |
|---|---|---|
| D8-001 | **agir agora** | apagar os 13 PDFs |
| D8-002 | **agir agora** | apagar os 76 v4.x (a citação de `v4.17.1` é por número de versão) |
| D8-003 | **agir agora** | apagar os 7 v3.x |
| D8-004 | descartar | manter os 71 da v5 |
| D8-005 | **agir agora** | **resolvido**: critério **"medição fica, opinião sai"** — ver bloco abaixo |
| D8-006 | **agir agora** | apagar `faturamento-legado/` |
| D8-007 | **agir agora** | manter os 2 citados; **apagar** os 3 sem citação (pipeline mudou na v5.1.4 — runbook desatualizado é pior que nenhum), migrando antes para a skill correspondente qualquer procedimento ainda vivo |
| D8-008 a D8-011 | **agir agora** | reescrita do `README.md` (entrega da Fase 2), lido inteiro contra o repo limpo |
| D8-012 | **agir agora** | split: `estado-do-projeto.md` (novo) + `WORKING-CONTEXT.md` enxuto ao estado |
| D8-013 | **agir agora** | resolvido por D8-014 (o arquivo sai) |
| D8-014 | **agir agora** | **aposentar `docs/design-system.md`**: a página `/admin/design-system` é código vivo e não pode mentir; migrar para a skill `ui-design-system` o que a página não carrega (o *porquê*: regra de contraste, `--warning` reprovando AA, quando usar `--warning-deep`) e declarar a página como referência única no ADR de fechamento |
| D8-015 | descartar | tokens batem |
| D8-016 | **agir agora** | manter `v3-6-apendice.md` e **documentar a exceção** de nomenclatura no ADR de fechamento (regra 4: ADR não sai) |
| D8-017 | descartar | regra 4 cumprida |
| D8-018 | **agir agora** | varredura completa dos 42 hits; marcar os que faltarem |
| D8-019 | descartar | numeração histórica |
| D8-020 | descartar | nenhuma lição falsa na amostra |
| D8-021 | **agir agora** | verificar a skill `ingestao-planilhas` (fecha o invariante 4) |
| D8-022 | **agir agora (ato humano)** | diff do hook PreToolUse para `git add -A`/`-a` pronto no PR; aplicação é do Yan (`.claude/hooks/` protegido) |
| D8-023 | descartar | sem duplicidade real |

### D8-005 resolvido — critério "medição fica, opinião sai"

**FICAM** (única fonte de números que ninguém vai refazer): `2026-08-05-v5-4-5-baseline-vendas-retidas.md` + `.json` · `2026-08-04-metas-subsetor-e-de-para-monde.md` (já declara no cabeçalho por que vive em `main`) · `2026-08-04-scope-b-item-level-e-pessoas.md` · `2026-07-27-dre-competencia-api-monde.md` · `2026-08-10-coercao-milhar-dre-fluxo.md`.

**SAEM** (valor era a lista de prioridades do momento, hoje vencida — e qualquer item precisa reverificação contra o código atual, como A1 provou): `audit-pos-v3-8.md` · `2026-05-28-audit-completo-v4-5.md` · `2026-06-08-escopo-patch-pos-v4-11.md` · `2026-06-09-escopo-proximo-patch-pos-v4-12.md` · `2026-06-13-auditoria-tecnica-projeto.md` · `2026-06-10-auto-auditoria-v4-13-auth.md` · as três de Weddings de maio (`operacoes-weddings`, `custos-negativos`, `duracao-operacoes`) · os 3 de `superpowers/` · os 2 de `harness/`.

**Condição:** só depois de E1–E8 estarem no `backlog-v6.md`, e o `sonda-disparo.md` só depois de E5 resolvido.

## D9 — Nomenclatura e resíduo

| id | triagem | nota |
|---|---|---|
| D9-001 | **backlog v6** | B-01 (1.675 ocorrências) |
| D9-002 | **agir agora** | feito em 6cb3586 · token --tooltip-bg (#27272a) reproduzindo o zinc-800 EXATO; classe passou a bg-[var(--tooltip-bg)]. Zero pixel de diferença por construção |
| D9-003 | **backlog v6** | B-01: a troca **não é 1:1** (zinc frio × border quente) — muda cor visível |
| D9-004 | **backlog v6** | B-01: 3 tonalidades + verificação de contraste |
| D9-005 | **backlog v6** | B-01: 8 tonalidades no `button` |
| D9-006 | **backlog v6** | B-01 |
| D9-007 | **agir agora** | BACKLOG V6, junto de B-01 (decisão do Chat, item 7) · NÃO criar token com os valores atuais: dois tokens para "cor de grade" com valores diferentes institucionalizam a divergência. Os quatro valores para a decisão de paleta: --chart-grid #e4e4e7 × stroke #f1f5f9; --chart-axis-tick #52525b × fill #a1a1aa. Aquele gráfico está mais claro que todos os outros e alguém precisa decidir qual é o certo |
| D9-008 a D9-010 | descartar | checks limpos / decisão vigente |
| D9-011 | **agir agora** | feito em 6cb3586 · package.json name wt-finance-temp → janus; prova: grep -rn "wt-finance-temp" → só a própria linha 2 |
| D9-012 | descartar | manter `config.toml` |
| D9-013 | descartar | manter os paths de backup |
| D9-014 | **agir agora** | feito em 6cb3586 · chave → janus-lista-operacoes-page-size COM migração one-shot (lê a antiga, grava na nova, remove a antiga); chaves viraram constantes de módulo |
| D9-015 | **agir agora** | aditiva: `CREATE OR REPLACE` do **catálogo vivo**, trocando só o texto do `RAISE` |
| D9-016 | **agir agora** | feito em 6cb3586 · cabeçalhos → Janus em 5 arquivos de charts + tokens.css; prova: grep -rn "WT Finance" nesses caminhos → vazio |
| D9-017 | descartar | histórico não se emenda |
| D9-018 | descartar | mistura histórica sem custo; renomear RPC é destrutiva + todos os chamadores ("provavelmente nunca" — B-19 pode sair do backlog) |
| D9-019 | **agir agora** | feito em f43d493 · = D1-008 |
| D9-020 | descartar | — |
| D9-021 | descartar | kebab-case 100% |

## D10 — Harness e config

| id | triagem | nota |
|---|---|---|
| D10-001 | **agir agora (ato humano)** | **criar** o `deny` de `npx supabase db push` cru + os `allow` estreitos dos gates. O `db-gate` vive no wrapper `npm run db:migrate`; `db push` direto passa **por fora** de classificação, backup-gate e restore-test, e aplica todo o pending — inclusive destrutiva estacionada. Hoje a única proteção é disciplina. Diff pronto no PR; aplicação é do Yan |
| D10-002 | **agir agora** | nota no `estado-do-projeto.md`: 14 pastas (9 domínio + 3 rituais + 2 externas) |
| D10-003 | **agir agora** | feito em 93bea0a · as 6 chaves com nome+comentário, nenhuma com valor. Duas eram segredo sem entrada de onboarding (MONDE_API_KEY, CRON_SECRET) |
| D10-004 | descartar | `.env.local` do Yan, não versionado |
| D10-005 | descartar | = D1-002 |
| D10-006 | **agir agora** | feito em 93bea0a · engines.node ">=20.9.0" (PISO, não pin — não troca o runtime da Vercel) + .nvmrc 24. O name saiu em 6cb3586 (D9-011) |
| D10-007 | descartar | coberto por D8-005 |

---

## Achados novos (leitura dos 20 arquivos de D8-005)

| id | achado | triagem | nota |
|---|---|---|---|
| E1 | A1 (perda silenciosa por setor fora da dim) | **descartar** | **encerrado pela `0132`** — verificado no catálogo vivo em 10/09 |
| E2 | `contrato` e `taxa_servico` no `transformSale` **erram 100% dos positivos**; a regra correta (pelo produto) já está identificada: 99,97% / 99,99% | **backlog v6** | bloco "retomada do Scope B" |
| E3 | As **8 decisões abertas do Scope B** (margem por produto ser alocação; `operation_id` curado com dono; Pessoas via pedido ao provedor; ordem das ondas; `get_prejuizos` sem paridade; cadência de Pessoas; vocabulário `receitas_alocadas`) | **backlog v6** | decisão do Yan em 10/09: registrar como bloco único, não triar agora |
| E4 | `monde.venda.raw` **defasado em estrutura**: só 527/28.250 vendas têm o ramo `financial` — qualquer DRE viva pela API exige backfill/re-sync | **backlog v6** | nota no bloco Scope B; evita redescobrir |
| E5 | Plugin **`superpowers` duplicado** (global v6.2.0 + projeto v5.1.0) faz sessões invocarem **todas as skills em bloco** — custo de contexto em toda sessão | **agir agora (ato humano)** | desativar a cópia do projeto e reavaliar; se o bloco persistir, é o mandato do plugin. Libera o descarte do `sonda-disparo.md` |
| E6 | **Tokens CSS mortos** (`--surface-soft`, `--surface-strong`, `--primary-bg`) — dimensão que a D9 **não varreu** | **agir agora** | CHECK LIMPO em nenhuma mudança · varredura dos 61 tokens de tokens.css: ZERO mortos. Os 3 nomeados são usados como classe Tailwind (2 usos cada: --surface-soft, --surface-strong, --teorico-soft) e --primary-bg não existe no arquivo. Sem commit por não haver o que mudar |
| E7 | Cinco `MÉDIA` de 13/06 de estado desconhecido: **M2** `getAdminClient` (service role) para leitura no Fluxo de Caixa · **M3** staging de Vendas sem lock (uploads concorrentes) · **M6** export da Lista trunca em 200 linhas · **M15** `admin.ts` sem `import 'server-only'` · **M17** anexos commitados sob prefixo `tmp/` | **agir agora (só verificar)** | uma missão curta de verificação; cada um vira `agir agora`, `backlog v6` ou `descartar` **com evidência**. Não presumir estado a partir de documento de junho |
| E8 | **Segurança de dependência não tem dono**: `next` com advisories HIGH e fix em minor apareceu 3× (28/05, 13/06, 10/09); o `skipIf` silencioso 2× | **agir agora (documentar)** | rotina periódica declarada no `estado-do-projeto.md` (`npm audit` + `outdated` no fechamento de cada minor) e CI de PR no backlog (B-16) |

---

## Sequência da Fase 2

**Bloco 0 — fora desta versão, antes dela:** patch `next@16.3.4`.

**Bloco 1 — código e arquivos** (git é a rede; prova de orfandade em cada commit): D1 (exclusões, exports, `knip.json`), D7-010, D9-002/007/014/016, E6, D3-005, D4-006/008/011, D5-002/003 (+ teste), D5-004/D7-004 (sonda de `skipIf`), D7-001 (concurrent, medindo), D4-001 (spike de tipagem), D6-002/D6-007, D9-011 + D10-006, D10-003.

**Bloco 2 — verificação:** E7 (os cinco MÉDIA de junho) → reclassificar com evidência antes de fechar a versão.

**Bloco 3 — banco, aditiva:** D2-010 (grants), D2-006 e D2-016 (comentários), D9-015 (texto do `RAISE`), `NOTIFY`. `revisor-db` antes.

**Bloco 4 — deploy intermediário:** o código sem referência aos objetos órfãos vai a produção **antes** do `DROP`.

**Bloco 5 — banco, destrutiva única (GATE 2):** D2-001 a D2-005, D2-007 (3 RPCs + 2 tabelas vazias), D2-013, e `get_decomposicao_bloco` se o mapa recontado confirmar orfandade. Backup-gate, restore-test, TTY do Yan. **Recontar o mapa RPC→chamadores depois do commit de D1-012.**

**Bloco 6 — documentação, a partir do estado limpo:** apagar docs pré-v5 (D8-001/002/003/006/007) e o grupo de D8-005 · aposentar `design-system.md` (D8-014) · `README.md` · `estado-do-projeto.md` · `backlog-v6.md` final (com E2/E3/E4/E8) · varredura dos ADRs (D8-018) · verificação da skill `ingestao-planilhas` (D8-021) · ADR de fechamento (critérios, exceção do apêndice v3-6, convenção de tipagem se o spike de D4-001 der negativo).

**Atos humanos no PR (diff pronto, aplicação do Yan):** D10-001 (`deny` do `db push` + `allow` dos gates), D8-022 (hook de `git add -A`), E5 (desativar o `superpowers` duplicado).

**Depois da versão, fora do repo:** limpar o Project do Chat (manter guia de formato + 2–3 briefings recentes) e atualizar o `harness-base` com os aprendizados, extraindo os hooks.

## Contagem da triagem

| triagem | achados |
|---|---|
| agir agora | 62 |
| backlog v6 | 21 |
| descartar | 67 |
| fora (patches de segurança) | 3 |
| **total** | **153** (145 do relatório + 8 novos) |
