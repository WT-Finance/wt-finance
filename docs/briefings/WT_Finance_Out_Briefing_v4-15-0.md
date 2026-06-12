# WT Finance — Out-Briefing v4.15.0

**Data:** 2026-06-12 · **Branch:** `feat/v4-15-0-f2-real` · **Versão:** 4.14.2 → **4.15.0** (MINOR)
**Tema:** **F2-real, fase 1** — migrar o caminho REAL de upload de Vendas (Server Actions de `/admin/uploads`) ao **pipeline atômico** de carga (staging → validação → swap), fechando o F2 para a UI. Regime autônomo (validado v4.13/v4.14). ADR-0111. **Merge e deploy permanecem com o usuário.**

> Base da branch: 4.14.2 (a 4.14.3 da Missão A ainda não estava mergeada). **Rebase na main após o merge da 4.14.3**, antes do merge desta. Conflitos esperados/aceitos em `package.json`/`CHANGELOG.md`/`changelog-diretoria.ts` (4.15.0 vence o número; seções coexistem).

---

## Descoberta-chave (ajustou o plano)

O pipeline atômico (`limpar_staging_vendas` → `inserir_lote_staging` → `validar_carga_staging` → `promover_carga_vendas`) **já existe em produção** (migrations 0116/0118, v4.12/v4.12.1) e é **`service_role`-only**. As Server Actions usam `getAdminClient` (service role). Logo **a migração é rewire de aplicação — SEM migration nova**, e sem risco do `statement_timeout` de 3s (não corre como anon).

## Missões / commits

| Commit | Conteúdo |
|--------|----------|
| `feat(v4.15.0): caminho real de upload de Vendas migra ao pipeline atômico (F2-real)` | Rewire de `inserirLoteVendasAction` (limpar_staging + inserir_lote_staging; **não trunca mais a base**) e `finalizarVendasAction` (validar → loadMetas → promover atômico; erro explícito "base preservada"). Zod `cargaValidacaoSchema`/`cargaPromocaoSchema` + `parseRpc`. Testes de contrato (validar live; estruturais de promover; anon-negado estendido). Assinaturas/UX inalteradas. |
| `docs(v4.15.0): ADR-0111 + runbook + versão + changelogs + out-briefing` | ADR-0111, runbook de operação, version 4.15.0, CHANGELOG, CHANGELOG_DIRETORIA, este out-briefing. |

## Migrations / ADRs
- **Nenhuma migration** — pipeline 0116/0118 já em produção.
- **ADR-0111** (numeração real verificada; max era 0110): decisão da migração, alternativas, coexistência, plano da fase 2.

## Parâmetros de sucesso — resultado (TODOS verificados)
1. **Fluxo feliz (promove atômico, dados conferem):** ✅ round-trip dos dados atuais (45.233 linhas `raw.vendas_excel`) por `staging → validar (ok:true) → promover`. Pós-swap **idêntico**: raw 45.233 / `sum(valor_total)` 180.605.620,47 / `fato_venda` 27.305 / `fato_venda_item` 45.233 / `dim_produto` 112. `staging` truncada no fim e `ultima_atualizacao` atualizada → swap **concluído** (não abort).
2. **Adversarial (corrompido no meio → rejeitado por inteiro):** ✅ linha com data fora do range NO MEIO do lote → `validar_carga_staging` `ok:false`, `fora_do_range:1`, base intacta (27.305 → 27.305).
3. **Erro ≠ vazio:** ✅ validação/promoção reprovada retorna erro explícito ("base preservada"); nunca sucesso silencioso.
4. **Contrato Zod:** ✅ `cargaValidacaoSchema`/`cargaPromocaoSchema` + `parseRpc`; contrato live de `validar` + estruturais de `promover`.
5. **Parser único respeitado:** ✅ `vendas-parser.ts` intocado; o pipeline recebe as linhas já parseadas; Date nativo (ADR-0099) preservado; `operacao_propria` flui (0118; dims reconstruídos sem desvio no round-trip).
6. **Gates:** ✅ `tsc` 0 · `npm test` 90 (87→90) · `lint` 13 (baseline) · `build` limpo.
7. **Preview 100% funcional:** ✅ deploy READY; `/admin/uploads` protegida e servida (o fluxo de upload→promover NÃO foi re-executado pelo preview para não reescrever a produção uma 2ª vez — o pipeline foi provado direto contra a produção, acima).
8. **Timeout 3s:** ✅ N/A — as Actions correm como `service_role` (sem timeout); a promoção não passa pelo limite do anon.

## Auto-auditoria adversarial — EXECUTADA (com backup como rede)
- **Backup + restore testado (âncora):** backup lógico completo (34 tabelas, 0 falhas) em `~/wt-finance-backups/2026-06-12-pre-v4-15/`; restore de ensaio de `raw.vendas_excel` em `backup_check` → **45.233 linhas, checksum idêntico** (180.605.620,47). ✅
- **Atomicidade (carga parcial):** `promover` com linha fora do range → `RAISE` "Carga abortada" **na linha 21, ANTES do `TRUNCATE`** → base **idêntica** (raw 45.233 / fato 27.305). Zero linhas tocadas — não "algumas linhas". ✅
- **A/B (mesma planilha pelo caminho novo):** round-trip self-consistency dos dados atuais → base final byte-idêntica (count + checksum + fato + dims). ✅
- **Datas / contaminação / recarga:** datas fora do calendário barradas; `operacao_propria` preservada (dims reconstruídos sem desvio); `promover` faz substituição completa → recarga do mesmo arquivo = base idêntica, sem duplicação. ✅
- **Produção:** saudável e idêntica ao pré-teste ao final (round-trip = no-op; nenhum restore necessário).

## Auto-auditoria adversarial (foco "dado errado parecendo certo")
- **Datas (dd/mm × mm/dd, limites de junho):** o pipeline recebe `data_venda` já como date do parser (Date nativo, ADR-0099) — não há reinterpretação no caminho novo. Datas fora do calendário são barradas por `validar`/`promover` (range `dim_data`).
- **Contaminação (`operacao_propria`/`venda_n`):** `inserir_lote_staging`/`promover` copiam `operacao_propria` (0118); a regeneração da dim deriva dela — isolamento preservado.
- **Carga parcial (atomicidade):** `promover_carga_vendas` é função única (transação única) que **re-valida ANTES do truncate** e aborta com `RAISE` se houver data fora do range → a base nunca é tocada; falha após o truncate → ROLLBACK da transação. _(Teste de abort: ver Auto-auditoria executada.)_
- **Recarga:** `promover` faz **substituição completa** (truncate + reload), não append → sem duplicação; a verdade é o último arquivo.
- **A/B:** _round-trip dos dados atuais pelo caminho novo → base idêntica (ver execução)._

## Backup / âncora de reversibilidade
- Backup lógico completo NOVO em `~/wt-finance-backups/2026-06-12-pre-v4-15/` (`exportar.mjs` + `data/*.sql` + `manifest.json`; restore via `restaurar.mjs`), com restore testado. Pré-condição dos testes destrutivos.

## Coexistência / Fase 2 (fora do escopo)
- Caminho antigo intacto (rollback de aplicação: promover deployment anterior na Vercel; sem migration de desfazer).
- Fase 2 (futura v4.15.x, só após ≥2 cargas reais sem incidente): aposentar a rota vestigial `upload-vendas`, RPCs antigas de carga e RPCs órfãs de desativar usuário.

## Arquivos
- `src/app/admin/uploads/actions.ts` (rewire das 2 Actions de Vendas).
- `src/lib/schemas-rpc.ts` (2 schemas novos), `src/lib/rpc-contrato.test.ts` (contratos + anon-negado).
- `docs/adr/0111-…md`, `docs/runbooks/v4-15-upload-vendas-runbook.md`, `package.json` (4.15.0), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`.

## Achados para a fila (não implementados — escopo)
- A rota vestigial `upload-vendas` + lib `carregarVendas` agora duplicam a orquestração das Actions; candidatos a unificação na fase 2 (Actions poderiam delegar à lib).
- `validar_carga_staging` valida só range de datas + contagem; validações de negócio mais ricas (duplicatas, setores desconhecidos) são evolução futura.

## Runbook / Preview
- Runbook: `docs/runbooks/v4-15-upload-vendas-runbook.md` (carga rejeitada, inspecionar staging, rollback de aplicação, restore).

---

**PR:** `feat/v4-15-0-f2-real` → main (rebase pós-merge da 4.14.3). Merge e deploy ficam com o usuário.
