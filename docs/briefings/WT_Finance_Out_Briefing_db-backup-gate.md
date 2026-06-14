# WT Finance — Out-Briefing · Backup-gate de migrations (núcleo mínimo)

**Data:** 2026-06-14 · **Branch:** `chore/db-backup-gate` (base `main`) · **Tipo:** tooling de processo (sem bump de versão do app) · **ADR:** 0116
**Tema:** backup-gate como **REDE de recuperação** rodada antes de aplicar migration. **A confirmação humana de migration destrutiva NÃO muda** — o gate é rede, não autorização. **Merge e deploy ficam com o usuário.**

## Reorientação (escopo reduzido — Opção 2)
A versão inicial tinha sido construída maior (restore-test COMPLETO de 38 tabelas + ativação da autonomia destrutiva no CLAUDE.md). Por decisão do Yan, **reduzimos ao núcleo mínimo**: gate como rede (manifest-check completo + restore-test **spot de subconjunto-chave**), destrutiva **mantém confirmação**, e o **modo completo + autonomia viram follow-up**. As edições de autonomia no CLAUDE.md foram **revertidas**.

## O que entrou (núcleo mínimo, validado)
- **`scripts/db-gate/`** (versionado): `lib.mjs` (Management API + retry, `contaEChecksum`), `exportar.mjs` (backup do dia; **exclui colunas geradas** — fix), `verificar.mjs` (completude + restore-test SPOT subconjunto-chave, prod×restaurado, guarda scratch-only, **fail-fast** na completude, cleanup garantido), `gate.mjs` (backup→verifica→relatório), `migrate.mjs` (wrapper).
- **`npm run db:migrate`** (`-- --aditiva` | `-- --destrutiva`) e **`db:gate`**.
- **Completude COMPLETA:** todas as tabelas vivas de produção presentes no manifest, com `.sql` e `ok`. Tabela viva ausente → vermelho (fail-fast, sem restaurar).
- **Restore-test SPOT robusto (subconjunto-chave):** `financeiro.fato_lancamentos`, `analytics.fato_venda` (FK p/ dim_data + a "grande"), `analytics.dim_operacao_weddings` (coluna gerada), `app.rbac_usuarios` (auth). Restaura num schema descartável e compara **produção × restaurado** (count + checksum). NÃO restaura as 38.
- **Wrapper:** aditiva → gate verde aplica (auto); **destrutiva → gate verde + CONFIRMAÇÃO HUMANA permanece** (não auto-confirma); heurística escala `--aditiva`→confirmação se a migration pendente cheira a destrutiva.
- **Cleanup garantido** (try/finally + DROP-IF-EXISTS no início).

## Validação (rápida, núcleo)
- **Gate SPOT VERDE:** 4 tabelas-chave batem com produção (fato_lancamentos 19225, fato_venda 27305, dim_operacao_weddings 232 [gerada], rbac_usuarios 4). **Duração ~246s (~4 min).**
- **Adversarial — fica VERMELHO quando deve:**
  - **Backup incompleto** (`.sql` removido) → VERMELHO "arquivo .sql ausente" em **~8s** (fail-fast, sem restaurar). ✓
  - **Backup corrompido** (dump truncado de uma KEY table) → VERMELHO `prod 232 ≠ restaurado 0 (VAZIA)`. ✓
  - **Bloqueio real:** `migrate --destrutiva --reuse <incompleto>` → **exit 1**, nem "CONFIRMAÇÃO HUMANA" nem "aplicando" impressos (apply nunca alcançado), "Nada tocou produção". ✓
  - **Cleanup:** scratch=0 após todos os casos. ✓
- (Da fase anterior, ainda válidos: comparação **não-circular** provada inserindo linha em produção após o dump → vermelho; e o **modo completo** chegou a rodar 38/38 verde uma vez, incl. `dim_operacao_weddings`.)

## Achado corrigido (recovery gap)
O exportador histórico **incluía colunas geradas** no INSERT → dump **não-restaurável** para
`analytics.dim_operacao_weddings` (`resultado_caixa`/`ncg`). O versionado as **exclui** (o schema recomputa
via `LIKE INCLUDING GENERATED`); o restore-test as cobre.

## CLAUDE.md (cláusula destrutiva INALTERADA)
- Documentado o wrapper `db:migrate` como caminho que roda a **rede** antes do push. **Migration destrutiva
  continua exigindo confirmação humana** (revertidas as edições de autonomia da versão inicial). Aditiva
  segue autônoma (sob gate-rede + declaração prévia). Salvaguardas/DoD/Comandos/worktree refletem isso.

## Gates do projeto
`tsc` 0 · `npm run lint` 13 (baseline, zero novos) · `npm test` 118 · `build` limpo.

## Fora do escopo / follow-ups registrados
1. **Restore-test COMPLETO** (todas as 38 tabelas; `--full` existe em código, mas não é o caminho) — incremento que um dia destravaria a autonomia destrutiva. Hoje ~10-15 min.
2. **Performance:** restore via Management API roda 1 statement/chamada (mitigado por batelagem ~500KB). Ganho real = **conexão Postgres direta** (`COPY`) — depende da connection string do banco.
3. **Durabilidade off-machine** dos backups (hoje só em `~/wt-finance-backups/`).
4. **Versionamento:** tooling sem efeito à diretoria → **sem bump de versão** e **sem entrada no CHANGELOG_DIRETORIA** (adotado).

## Arquivos
- `scripts/db-gate/{lib,exportar,verificar,gate,migrate}.mjs`; `package.json` (+`db:migrate`,`db:gate`).
- `docs/adr/0116-backup-gate-migration-destrutiva.md`, `docs/runbooks/db-backup-gate-runbook.md`, `CLAUDE.md`, este out-briefing.
- Não versionado: backups em `~/wt-finance-backups/` (artefato sensível; nunca commitado).

---
**PR:** `chore/db-backup-gate` → `main`. Merge e deploy ficam com o usuário.
