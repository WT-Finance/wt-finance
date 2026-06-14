# Runbook — Backup-gate de migrations

O backup-gate é uma **rede de recuperação** que roda **antes** de aplicar migration em produção (sem
staging). Bloqueia se o backup não estiver completo + restaurável + fiel à produção. **NÃO substitui a
confirmação humana de migration destrutiva** — é rede, não autorização. O `db push` cru pula a rede; use
o wrapper.

## Como aplicar uma migration

```bash
# Aditiva / retrocompatível (CREATE, ADD COLUMN anulável, RPC nova, índice, GRANT/REVOKE):
npm run db:migrate -- --aditiva --label pre-vX-Y      # gate verde ⇒ aplica (auto)

# Destrutiva (DROP / TRUNCATE / ALTER que remove/reescreve coluna ou dado; UPDATE/DELETE):
npm run db:migrate -- --destrutiva --label pre-vX-Y   # gate verde ⇒ aplica COM confirmação humana

# Sem flag → trata como destrutiva (exige confirmação). Heurística: se a migration pendente cheira
# a destrutiva, exige confirmação mesmo sob --aditiva.
```

O wrapper: **(1)** gera backup do dia em `~/wt-finance-backups/<AAAA-MM-DD>-<label>/`, **(2)** roda o gate
(completude + restore-test SPOT do subconjunto-chave), **(3)** se verde: aditiva **aplica**; destrutiva
**pede a confirmação humana** no prompt do `db push` (não auto-confirma). Vermelho → aborta, **nada** é aplicado.

- `--reuse <dir>` → re-verifica um backup existente sem gerar outro (re-run / diagnóstico).
- O restore-test do gate é o **subconjunto-chave** (`KEY_TABLES` em `verificar.mjs`). O modo **completo**
  (`--full`, todas as tabelas) é follow-up — mais lento.

Só verificar, sem aplicar:
```bash
npm run db:gate -- --label pre-vX-Y           # backup + gate (rede), sem push
node scripts/db-gate/verificar.mjs <dir>      # re-verifica um backup (spot); --mode=full p/ completo
```

## Como ler um relatório VERMELHO

O gate imprime um relatório e grava `gate-report.json` no diretório do backup. Vermelho vem com
o(s) **motivo(s)**:
- `tabela(s) viva(s) ausente(s) do backup` → o exportador não cobriu uma tabela nova → backup
  **incompleto**. Conferir os schemas em `scripts/db-gate/lib.mjs` (`SCHEMAS`).
- `arquivo .sql ausente para: …` → o `.sql` de uma tabela do manifest sumiu do diretório.
- `export incompleto (ok=false)` → o export parou no meio (linhas exportadas ≠ origem).
- `<tabela>: prod(…) ≠ restaurado(…)` → o restaurado **não bate** com a produção viva (count ou
  checksum) → backup não é fiel (corrompido, truncado, ou produção mudou após o dump).
- `<tabela>: falha no restore-test — …` → erro ao recriar/inserir no schema descartável.

**Vermelho = não aplique.** Refaça o backup, investigue a causa, só então reaplique.

## Como recuperar a partir de um backup (após uma destrutiva dar errado)

```bash
# restaura UMA tabela na ORIGINAL (TRUNCATE + INSERTs do dump):
node scripts/db-gate/../../  # (ferramenta de restauração: restaurar.mjs ao lado do backup)
node ~/wt-finance-backups/<dir>/restaurar.mjs ~/wt-finance-backups/<dir>/data/<schema>.<tabela>.sql
```
O dump exclui colunas **geradas** (o schema as recomputa). Restaurar na tabela original repõe os
dados; as MVs/derivadas se regeneram via as RPCs de recuperação (ver CLAUDE.md › dim_data).

## Sensibilidade e local dos artefatos

- O dump contém **todo o dado**, incluindo `app`/auth/RBAC — é o **artefato mais sensível** do
  projeto. Vive **só** em `~/wt-finance-backups/` (fora do repositório; **nunca** commitar).
- **Durabilidade (assunção atual / risco residual):** os backups vivem apenas na máquina local —
  se a máquina morrer, perdem-se. Cópia para destino durável (bucket privado encriptado) é
  **follow-up** decidido pelo Yan; até lá, o gate protege contra migration ruim, não contra perda
  da máquina.

## Duração e escala

- Backup do dia: ~minutos (export via Management API).
- **Restore-test SPOT (subconjunto-chave): ~246s (~4 min)** medido (~46k linhas: fato_lancamentos 19k +
  fato_venda 27k + dim_operacao_weddings + rbac_usuarios). **Falha rápido** em backup incompleto (~8s, sem
  restaurar). Aceitável para rodar antes de uma migration.
- **Gargalo = latência por-chamada da Management API** (um corpo HTTP por chamada), não o volume. O
  verificador **batela** vários INSERTs por chamada (até ~500KB) para reduzir round-trips.
- ⚠️ **Escala / follow-ups:** o modo **completo** (`--full`, todas as 38 tabelas) leva ~10-15 min hoje e
  cresce com o banco — é follow-up (e seria a base para um dia dispensar a confirmação destrutiva). O ganho
  real de performance seria restaurar via **conexão Postgres direta** (`COPY`), que dependeria da connection
  string do banco (hoje o projeto só usa PostgREST/Management API). Decisões do Yan.
