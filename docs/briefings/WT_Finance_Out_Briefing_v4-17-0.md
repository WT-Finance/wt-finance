# WT Finance — Out-Briefing v4.17.0

**Data:** 2026-06-13 · **Branch:** `feat/v4-17-0-saneamento` (base `main`) · **Versão:** 4.16.2 → **4.17.0** (MINOR)
**Tema:** **Saneamento técnico** (triagem da Auditoria Técnica de 2026-06-13). Regime autônomo com fronteira de produto. Absorve a fase 2 da F2-real (v4.15.1 deixa de existir). **Merge e deploy ficam com o usuário.**

---

## Âncora de reversibilidade (cumprida)
Backup lógico completo **antes da 1ª migration**: `~/wt-finance-backups/2026-06-13-pre-v4-17/` — **38 tabelas, 0 falhas, 257.708 linhas**; **restore-test** não-destrutivo (`analytics.dim_setor_macro` 3=3 em schema scratch). Migrations aditivas/retrocompatíveis com a main viva; nenhuma escreve em dados pré-existentes. (CLAUDE.md atualizado com a âncora ratificada 2026-06-13: regime autônomo = backup do dia + declaração prévia no plano da missão.)

## Baldes (ordem vinculante) — todos fechados com gates verdes

| Balde | Commit | Conteúdo | Verificação |
|-------|--------|----------|-------------|
| **1 — Autorização** | `0c20065` | migrations 0133/0134; M1 (REVOKE anon), fail-open estreitado, badge guard, config, admin-layout, server-only, rate-limit | **Auditoria adversarial 7/7** + `has_function_privilege` (anon = só `solicitar_acesso`; app anon = 0) |
| **2 — Coerção** | `d7258d1` | `coercao.ts` único (toNum/toIsoDate/toStr); rewire 5 parsers + `fmtValor`; testes de tabela | test 97→111 |
| **3 — Carga (banco)** | `4f163d3` | migration 0135; M3 advisory lock (4017001) + aviso op_propria | lock `granted` em `pg_locks`; contrato verde |
| **3 — Export/avisos** | `e98fcad` | M6 export sem cap de 200; `avisos` no schema + surfacing na UI | tsc/test/build |
| **3 — Anexos** | `f39ffcf` | migration 0136; M17 promoção `tmp/`→`sol/<id>/` (RPC `solic_promover_anexos`) | **Auditoria de isolamento 8/8** (objeto em sol/, tmp/ órfão, terceiro negado) |
| **4 — Gates/contratos** | `01f4413` | A3 (regra ESLint), M13 (+3 schemas F7), M7 (item-schema vivo), M10 (gate online obrigatório) | regra A3 pega violação; test 111→118 |

**Gates finais:** `tsc` 0 · `npm run lint` 13 (baseline, zero novos) · `npm test` **118** · `build` limpo.

## Migrations (todas aplicadas; verificadas)
- **0133** `exigir_acesso` (fail-open + anon) + REVOKE anon + badge + rate-limit.
- **0134** fecha grant anon-via-PUBLIC nas 8 funções de `app`.
- **0135** advisory lock (limpar/inserir/promover) + aviso op_propria em `validar_carga_staging`.
- **0136** `solic_promover_anexos` (promoção de anexo).

## ADRs
- **0114** — encerramento da janela anônima (M1) + estreitamento do fail-open.
- **0115** — M8 (tipagem do `database.ts`/`BoundRpc`) **deferido pelo teto** (ver abaixo).

## Status dos dois gatilhos vinculantes
- **Aposentadoria da fase 2 (commit 5): NÃO EXECUTADA — gatilho não atingido.** O gatilho exige **2 cargas reais de Vendas sem incidente**; `raw.vendas_excel` tem **1 carga** (2026-06-12, 45.233 linhas, 1 arquivo). A 2ª não ocorreu. Logo a remoção da rota vestigial `/api/admin/upload-vendas`, das RPCs soltas do caminho legado e das actions órfãs **fica para quando a 2ª carga ocorrer** (resíduo único da fase 2). O resto do Balde 3 não dependia disso.
- **Teto do M8: ATINGIDO — M8 deferido (ADR-0115).** Os dois caminhos estouram o teto de ~8 arquivos: (a) `gen types` regenera o `database.ts` (645 linhas) + reconcilia tipos estritos nos 11 call sites; (b) remover o mapa + helper Zod toca ≥14 arquivos (11 `BoundRpc` **não-uniformes** — 8 com `data`, 2 sem, 2 dentro de componentes — + 2 client factories + `database.ts`). M8 vira P-refactor; **Baldes 1–4 intactos**. Risco residual baixo: app tem zero `.from()` e a type-safety REAL de RPC (parseRpc+Zod) foi **fortalecida** por M13/M7.

## Auditorias adversariais (regime obrigatório)
- **Balde 1 — 7/7** (REST, usuários descartáveis, 0 resíduo): anon negado em read RPC (404) e badge (401); autenticado ativo OK; **inativo negado (403)**; service_role OK; `solicitar_acesso` anon mantida (ok:true) + throttle dispara.
- **M17 — 8/8** (0 resíduo): criar+move+promover; objeto em `sol/<id>/`; `tmp/` sem o órfão; `storage_path`=sol/ no banco; **terceiro negado (403)**, solicitante OK.
- **M3** — lock presente como 1ª instrução nas 3 funções + `pg_locks` mostra a chave `4017001` *granted*. (Teste de duas cargas concorrentes por wall-clock é inviável pelo Management API one-shot, que enfileira requisições; serialização garantida pela semântica documentada do `pg_advisory_xact_lock`.)

## Fronteira de produto (respeitada)
Fluxo de Caixa (M2/M4) e o tema dos R$ 17,97M **não entraram**; nenhum indicador de não-conciliado criado. Nenhum 🔵 surgiu no escopo.

## Preview / Verificação
(Ver seção atualizada após o deploy — roteiro de smoke: login → dashboard Weddings; upload de Vendas; abrir/baixar anexo de solicitação como solicitante vs terceiro.)

## Arquivos (principais)
- **Banco:** `supabase/migrations/0133..0136`.
- **Balde 1:** `src/app/admin/layout.tsx`, `src/lib/supabase/admin.ts`.
- **Balde 2:** `src/lib/carga/{coercao,coercao.test}.ts`, `parse-lancamentos`, `lancamentos`, `parse-contas-pagar-receber`, `parse-lancamentos-financeiro`, `parse-fluxo-caixa-titulos`, `src/lib/solicitacoes/{format,format.test}.ts`.
- **Balde 3:** `src/components/weddings/lista-operacoes.tsx`, `src/lib/schemas-rpc.ts`, `src/app/admin/uploads/{actions,page}.tsx`, `src/app/solicitacoes/actions.ts`.
- **Balde 4:** `eslint.config.mjs`, `src/lib/rpc-contrato.test.ts`, `src/lib/auth/sessao.ts`.
- **Fechamento:** ADRs 0114/0115, `package.json` (4.17.0), `CHANGELOG.md`, `CHANGELOG_DIRETORIA`, runbooks v4-15/v4-16 (adendos), CLAUDE.md, este out-briefing.

---

**PR:** `feat/v4-17-0-saneamento` → `main`. Merge e deploy ficam com o usuário.
