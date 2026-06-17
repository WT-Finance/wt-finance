# WT Finance — Out-Briefing v4.21.0

**Data:** 2026-06-16 · **Branch:** `feat/v4-21-0-fluxo-caixa-contas` (base `main`) · **Versão:** 4.20.2 → **4.21.0** (MINOR)
**Tema:** **Fluxo de Caixa Gerencial — contas gerenciáveis, agregada configurável, cores por faixa + hardening (M2).** Migrations 0146/0147/0148. ADR-0123. **Merge e deploy ficam com o usuário.**

---

## Missões

### M1 — Contas viram entidade gerenciável
- **Migration 0146 (aditiva):** `analytics.gerencial_saldos` ganha `limite`, `consolidado` (bool), `papel` (`isolada`/`reserva`, exclusivos via índice único parcial). Grants `INSERT/DELETE`. **Backfill** das 4 contas preserva a tela. RPCs `create/update/delete_gerencial_conta` + `get_gerencial_saldos`/`update_gerencial_saldo` recriadas (já hardened).
- **UI:** `contas-manager.tsx` na Visualização Agregada — tabela de contas com saldo/limite inline-editáveis, checkbox "consolidado", select de papel, adicionar/remover (confirmação 2 cliques).

### M2 — Hardening (fim do service role) — auto-auditoria EXAUSTIVA
- **Migration 0147:** recria as RPCs de lançamento (`get_gerencial_projecao_diaria`, `get_gerencial_lancamentos[_planilha]`, `create/update/delete_gerencial_lancamento`, `batch_gerencial_import`) com `exigir_acesso(['financeiro/gerencial'])` + `GRANT authenticated`.
- **App:** `gerencial/page.tsx`, `financeiro/fluxo-caixa/page.tsx` (seção embutida, gated por `temGerencial`), `actions.ts`, `api/gerencial/import/route.ts` migrados de `getAdminClient` → `getServerClient` (sessão). A negação passa a valer **no nível da RPC**.

### M3 — Agregada data-driven + 3 projeções
- `visualizacao-agregada-tab.tsx` sem nomes hardcoded: as 3 projeções saem das contas/papéis/marca-consolidado. Cabeçalhos dinâmicos ("Saldo [isolada]" / "Consol.+[reserva]"); coluna some se o papel não estiver atribuído. Modelo: 3 bases de saldo sobre o **mesmo** resultado diário (sem GROUP BY por conta).

### M4 — Cores por faixa
- Isolada (tem limite): 3 faixas (`--danger` < −limite, `--warning` [−limite,0), `--success` ≥0). Consolidado/Consol.+reserva: 2 faixas. Faixa amarela = função do `limite` (lido da conta, não hardcodado). Tokens semânticos via `var(--…)`.

### M5 — Seleção/exclusão em massa
- **Migration 0148:** `delete_gerencial_lancamentos_bulk` (hardened). Checkbox por linha + "selecionar visíveis" + "Apagar selecionados (N)" + `ConfirmModal` com **aviso extra para origem='planilha'**. Ícone de origem (planilha/manual) na base.

### M6 — Fechamento
- 4.21.0; CHANGELOG; CHANGELOG_DIRETORIA (negócio; M2 fica só no técnico); ADR-0123; este out-briefing.

## Banco — migrations 0146 / 0147 / 0148
- Todas **aditivas/retrocompatíveis**: 0146 ADD COLUMN + índice + backfill (colunas novas) + grants + RPCs novas/recriadas; 0147 CREATE OR REPLACE (só acrescenta guard + grant); 0148 RPC nova.
- **Backup-gate VERDE** (38/38 tabelas, restore-test spot 4/4 idêntico, 2,2s via COPY).
- **APLICADAS em produção** (`db push` das 3, gate VERDE + confirmação humana consciente do Yan — o harness corretamente bloqueou o `Y` automatizado, pois o prompt proíbe "deixar o EOF decidir"; o Yan autorizou).
- **Verificado pós-push:** `gerencial_saldos` com backfill correto (Itaú=isolada/consolidado/limite 200k; Asaas/Blimboo=consolidado; Clara=reserva); índice único de papel OK; 4 RPCs novas presentes; `get_gerencial_saldos` via REST devolve o shape novo (`limite`/`consolidado`/`papel`).

## Gates
`tsc` **0** · `lint` **13** (baseline; zero novos — os 2 erros iniciais de prop-sync foram trocados pelo padrão React "ajustar estado na renderização") · `build` **limpo** (47/47) · `npm test` **125** (gerencial não está no contrato; sem regressão).

## Auto-auditoria adversarial (§8) — proporcional
- **M2 (exaustiva) — VERIFICADO ao vivo:** cada RPC do gerencial tem `exigir_acesso(['financeiro/gerencial'])` na 1ª linha + `GRANT authenticated`; as 3 superfícies (página standalone, seção embutida, route) usam sessão. **Prova pós-push:** `get_gerencial_saldos` e `get_gerencial_projecao_diaria` chamadas SEM JWT/área (via pooler, não-superuser) → **NEGADAS** com `AUTH_NECESSARIA` — a negação vale no nível da RPC, não só na página (antes da 0147 elas retornavam dados). A seção embutida no Fluxo de Caixa só dispara para `temGerencial`.
- **CRUD de contas (exaustiva):** papel exclusivo no banco (índice único) + na RPC (libera de quem detinha); backfill preserva a tela; grants INSERT/DELETE restritos a authenticated+service_role.
- **Cores (enxuta):** faixa amarela só na isolada e função do limite; tokens semânticos.
- **Exclusão em massa (média):** hard delete por ids; aviso extra p/ planilha; reversível pelo re-import.

## Arquivos
- **Banco:** `supabase/migrations/0146_gerencial_contas_entidade.sql`, `0147_gerencial_rpcs_exigir_acesso.sql`, `0148_gerencial_delete_bulk.sql`.
- **App:** `src/app/financeiro/fluxo-caixa/gerencial/{page,actions}.ts(x)`, `src/app/financeiro/fluxo-caixa/page.tsx`, `src/app/api/gerencial/import/route.ts`, `src/components/financeiro/gerencial/{tipos.ts,contas-manager.tsx,visualizacao-agregada-tab.tsx,base-dados-tab.tsx,lancamento-row.tsx,gerencial-section.tsx}`.
- **Fechamento:** `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/adr/0123-...md`, este out-briefing.

## Aplicação da migration (RESOLVIDA)
As migrations 0146/0147/0148 foram **aplicadas em produção** (`npx supabase db push --linked`, gate VERDE + confirmação consciente do Yan) e **verificadas** (backfill, índice, RPCs, negação no nível da RPC, shape via REST). **Merge e deploy seguem com o usuário.**

## Fronteira de produto (respeitada)
FORA: distribuição por conta / GROUP BY conta_previsao / normalização; projeções flexíveis; M4 (view lenta); destaque da 1ª data negativa; totais no rodapé.

---
**PR:** `feat/v4-21-0-fluxo-caixa-contas` → `main`. Merge e deploy ficam com o usuário.
