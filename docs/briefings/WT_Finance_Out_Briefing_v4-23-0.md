# WT Finance — Out-Briefing v4.23.0

**Data:** 2026-06-18 · **Branch:** `feat/v4-23-0-import-por-fatia` (base `main` @ v4.22.4) · **Versão:** 4.22.4 → **4.23.0** (MINOR)
**Tema:** Importação do Fluxo de Caixa Gerencial — sincronização por fatia do originador, dedup por linha idêntica, coluna Originador e preview navegável. Migration 0154 (aditiva). ADR-0126. **Merge e deploy ficam com o usuário.**

---

## Problema

A importação da planilha de curadoria era uma **sincronização global**: `computeImportDiff` comparava contra TODAS as linhas `origem='planilha'` e `batch_gerencial_import` removia (`DELETE ... AND origem='planilha'`) toda linha de planilha **ausente** da planilha enviada (manuais preservadas). Com **dois importadores**, cada um apagava as linhas de planilha do outro (**deleção mútua**) — não havia coluna de autoria para distinguir de quem era cada linha.

## Missões implementadas

### M1 — Coluna Originador (migration 0154 + captura + leitura/UI)
- `analytics.gerencial_lancamentos` ganha `originador_id UUID` + `originador_nome TEXT` (backfill NULL).
- `batch_gerencial_import` e `create_gerencial_lancamento` carimbam o usuário da sessão (`Sessao.userId`/`nome`, vindos de `requireAreaApi`/`requireAreaAction`).
- `get_gerencial_lancamentos` expõe `originador_nome`; `get_gerencial_lancamentos_planilha` expõe `originador_id`.
- UI: coluna **"Originador"** (só leitura) na base, **após Vencimento**, com filtro por nome; Vencimento encolhido para abrir espaço. Distinta do ícone de origem (planilha/manual). "+ Nova linha" mostra "—" e ganha o originador no salvar (server-side).

### M2 — Sincronização por fatia (`computeDiffPorFatia` + rota)
- Diff **puro/testável** que sincroniza `planilha × fatia` **POR CONTAGEM** (multiset), não por presença: 2+2 = mantém 2; planilha→1 remove 1; →3 adiciona 1.
- A **fatia** é só as linhas `origem='planilha' AND originador_id = importador`. A rota (`route.ts`) escopa por `sessao.userId` antes do diff → a linha do colega **nunca entra**.
- Backstop no banco: `DELETE`/`UPDATE` do `batch_gerencial_import` com `AND origem='planilha' AND originador_id = p_originador_id`.

### M3 — Dedup por linha idêntica + toggle
- Identidade = **6 campos normalizados** (tipo, pessoa, valor 2dp, vencimento, descrição, conta; reusa `normalizarChaveConta` → trim/caixa/acento). Chave **lógica de 4 campos** pareia leftovers e **preserva o id** na correção (`aAtualizar`).
- Toggle **"Manter duplicadas"** no preview: OFF (padrão) colapsa idênticas dentro da planilha; ON mantém as duas. Reanalisa o preview ao alternar.

### M4 — Preview navegável
- 4 grupos (**adicionar/atualizar/manter/remover**) expansíveis em formato de tabela, **acordeão (1 aberto por vez)**; **"a remover" aberto por padrão**.
- Proteção pontual por linha em "a remover": desmarcar = **não remover neste commit** (reaparece na próxima importação; **não vira manual**). Enviado como `protegidos[]` (só subtrai remoções). Outros 3 grupos só leitura.

### M5 — Fechamento
Versão 4.23.0, CHANGELOG, CHANGELOG_DIRETORIA (linguagem de negócio), ADR-0126, este out-briefing.

## Invariante central (critério de aceite) — PROVADO

> Importar como A nunca adiciona, altera ou remove linha de outro originador. A fatia do colega é intocável.

**Dupla barreira:** (1) rota filtra a fatia por `sessao.userId`; (2) RPC reforça `AND originador_id = p_originador_id` no DELETE/UPDATE; o commit **recomputa o diff no servidor** (não confia no cliente; inputs do cliente = arquivo, `manterDuplicadas`, `protegidos[]`).

**Teste vivo de duas fatias (executado em produção, dados de teste deletados — 0 resíduo):** criadas fatias A (2 linhas) e B (2 linhas); importou-se como A passando **adversarialmente** os ids de B em `p_remover_ids` **e** `p_atualizar`. Resultado: **B byte-idêntico** antes×depois (`removidos=1` só A, `atualizados=1` só A — B barrado pelo guard e pela contagem honesta); fatia de A auto-corrigiu (A2 removido, A1 atualizado, 1 nova). 11/11 asserções verdes.

**Linhas antigas sem originador (NULL):** não pertencem à fatia de ninguém → nunca removidas (`NULL = uuid` → falso, nos dois guards).

## Auto-auditoria adversarial (2 revisores) — achados endereçados
- **Chave de centavos:** `v2` usava `toFixed(2)` (arredondamento não confiável / colisão). Corrigido para arredondar aos centavos antes de formatar; teste de `1234.5 == 1234.50` e `100.00 ≠ 100.01`.
- **Assimetria de normalização:** `chaveLogica` keyava `tipo` cru enquanto normalizava `pessoa` — violava a regra de identidade ("X" == "X "). Corrigido (`norm(tipo)`); teste de tipo com caixa/espaço.
- **Contagem `v_atualizados`:** incrementava mesmo em UPDATE de 0 linhas (guard exclui) → contagem desonesta. Corrigido com `GET DIAGNOSTICS` na migration.
- **Confirmado SEGURO:** recompute server-side; `protegidos[]` só subtrai; NULL fail-closed; assinaturas de DROP/REVOKE/GRANT batem na linhagem 0096→0147→0150→0154; SECURITY DEFINER + `exigir_acesso` + anon nunca concedido; sem mutação de input; sem no-op update; pareamento 2a/2b determinístico, id preservado.

## Banco — migration 0154
- **ADITIVA / retrocompatível:** `ADD COLUMN` anulável (backfill NULL); RPCs ganham parâmetros de originador; guard de isolamento adicionado. NÃO escreve em dado pré-existente. `DROP`+`CREATE` nas 2 RPCs de escrita por **mudança de assinatura** (CREATE OR REPLACE não adiciona parâmetro) — corpos na migration (reversível).
- ⚠️ O heurístico do db-gate marca destrutiva (`DROP FUNCTION` + literais `UPDATE`/`DELETE` nos corpos). **APLICADA em produção (2026-06-18) sob confirmação humana consciente** (AskUserQuestion) do Yan; **backup-gate VERDE** (38/38 tabelas, restore-test 4/4 checksums idênticos; backup em `~/wt-finance-backups/2026-06-18-v4-23-0-import`). Registrada remote (`migration list`: 0154 local|remote|time).
- **Verificado via REST/pg:** `create_gerencial_lancamento` (nova assinatura, ecoa `originador_nome`, criado+deletado); `get_gerencial_lancamentos` (chave `originador_nome` presente); `batch_gerencial_import` + `get_gerencial_lancamentos_planilha` (pelo teste de isolamento).

## Agregada intocada
A versão mexe só na **ingestão**. As 3 projeções sobre saldo inicial e o cálculo do fluxo **não mudam**; `conta_previsao` segue fora da matemática da projeção.

## Gates
`tsc --noEmit` **0** · `lint` **12** (≤ baseline 13; nenhum nos arquivos tocados) · `next build` **limpo** · `npm test` **144** (131 baseline + 13 novos de `import-types.test.ts`, dos quais 3 de hardening).

## Arquivos
**Novos:** `supabase/migrations/0154_gerencial_originador_e_fatia.sql`, `src/lib/gerencial/import-types.test.ts`, `docs/adr/0126-import-gerencial-sincronizacao-por-fatia.md`, este out-briefing.
**Modificados:** `src/lib/gerencial/import-types.ts` (diff por fatia + chaves), `src/app/api/gerencial/import/route.ts` (escopo da fatia, `manterDuplicadas`/`protegidos`, originador no batch), `src/components/financeiro/gerencial/import-drawer.tsx` (preview navegável), `src/components/financeiro/gerencial/lancamento-row.tsx` (campo + célula Originador), `src/components/financeiro/gerencial/base-dados-tab.tsx` (coluna + filtro Originador), `src/app/financeiro/fluxo-caixa/gerencial/actions.ts` (originador no createLancamento), `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`.

## Pendências / fora de escopo (achados → registro, não implementação)
- **Guard `NaN`/valor não-finito em `v2`:** latente (o parser rejeita NaN antes); deixado fora para não pôr `throw` num núcleo puro. Registrado.
- **`originador_nome` denormalizado:** rótulo de exibição; se renome de usuário precisar refletir em linhas antigas, exigiria JOIN em `app.rbac_usuarios` (custo N+1 vs timeout 8s) — mantida a denormalização.
- Fora de escopo (briefing): agregada por conta; modo "sincronizar global"; filtro de valor por faixa; cards mobile; view lenta da agregada; importação multi-aba; histórico de importações.
