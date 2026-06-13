# WT Finance — Out-Briefing v4.17.1

**Data:** 2026-06-13 · **Branch:** `fix/v4-17-1-aposentadoria-f2` (base `main`) · **Versão:** 4.17.0 → **4.17.1** (PATCH)
**Tema:** **Aposentadoria da fase 2 da F2-real** — o resíduo único deferido na v4.17.0. Executada agora porque Yan confirmou a **2ª carga real de Vendas**. Remoção de código morto + 1 RPC órfã. **Merge e deploy ficam com o usuário.**

---

## Origem
A v4.17.0 deferiu a "fase 2" porque o gatilho (≥2 cargas reais de Vendas sem incidente) não estava atingido (só 1 carga visível). Yan confirmou a 2ª carga → o resíduo vira este PATCH próprio (CLAUDE.md: addendum pós-merge = patch novo, nunca commit tardio no escopo fechado).

## Investigação (read-only, com verificação adversarial)
Workflow de 7 agentes (finders por dimensão + céticos por candidata) + greps dirigidos. **Achado decisivo da verificação adversarial:** `truncate_dynamic_tables` e `inserir_lote_raw`, que o briefing classificava como "soltas/órfãs" para DROP, **têm consumidor vivo** — `npm run seed` (`supabase/seed/seed.ts` linhas 50/82/99/126). Dropá-las quebraria o seed. `safe_drop_after_verify = []` (zero RPCs de Vendas seguras para drop sem migrar o seed).

## Decisões (Yan)
1. **`admin_definir_usuario_ativo` → DROP** (segue o briefing). Órfã após remover `definirAtivo`; era a capacidade de (des)ativar usuário no banco, **fora da UI desde a v4.14.1**. É remoção de capacidade — reversível (corpo na 0119).
2. **`truncate_dynamic_tables` + `inserir_lote_raw` → KEEP.** Seed depende; a exposição de segurança de `truncate_dynamic_tables` **já foi fechada na v4.17.0/M1** (REVOKE anon). Migrar o seed ao pipeline atômico = mais risco que valor agora (script destrutivo, difícil de validar sem banco scratch) → fica para um follow-up.

## Removido (app — não-destrutivo, tsc/lint/test verdes antes do DROP)
- Rota `src/app/api/admin/upload-vendas/route.ts` (vestigial; zero chamadores).
- Lib `src/lib/carga/vendas.ts` (`carregarVendas` + `ResultadoCargaVendas`; só a rota importava).
- Rota `src/app/api/admin/upload-status/route.ts` (duplicata órfã de `getLancamentosStatusAction`; **a RPC `get_upload_status` permanece** — 3 chamadores vivos).
- `src/app/admin/acessos/actions.ts`: `gerarLinkAcesso` (+ helper `origemRequest` + import `headers`), `definirAtivo`.
- `src/components/admin/acessos/tipos.ts`: `ResultadoLink` (`ResultadoAcao` é compartilhado → mantido).
- Entrada órfã `admin_definir_usuario_ativo` no `src/types/database.ts` (mapa manual honesto).

## Banco
- **Migration 0137** — `DROP FUNCTION IF EXISTS public.admin_definir_usuario_ativo(uuid, boolean)`. Destrutiva porém reversível (corpo na 0119); não toca dados. Declaração prévia no header. Backup do dia (`2026-06-13-pre-v4-17`) cobre o estado.

## Mantido / intacto
- Pipeline atômico de Vendas (`limpar_staging_vendas`/`inserir_lote_staging`/`validar_carga_staging`/`promover_carga_vendas`).
- Recovery trio (`transform_raw_to_analytics`/`regenerar_dim_operacao_weddings`/`refresh_all_materialized_views`).
- `truncate_dynamic_tables`, `inserir_lote_raw` (seed-only), `get_upload_status`, rota `upload-lancamentos` (caminho real de Lançamentos).

## CLAUDE.md
- Bullet "Ingestão de Vendas tem UM parser só": rota servidor + `carregarVendas` removidas (fase 2 concluída); legacy RPCs marcadas como **seed-only**.
- Bullet do magic link: gerador "Link de acesso" sob demanda removido; modelo v4.14 é senha provisória.

## Caveat de dados (honesto)
A 2ª carga real de Vendas **não é visível na produção** via `raw.vendas_excel` (`carregado_em` único em 2026-06-12, 45.233 linhas, 1 arquivo). O patch procede sob a **confirmação explícita de Yan** das 2 cargas. Nada aqui depende da contagem de cargas para correção — só o gatilho de "quando aposentar".

## Gates
- App: `tsc` 0 · `lint` 13 (baseline, zero novos) · `npm test` 118 · `build` (a confirmar no fechamento).
- Pós-DROP: verificar via REST/SQL que `admin_definir_usuario_ativo` não existe mais e nada vivo quebrou.

## Pendência registrada (follow-up)
- **Migrar `seed.ts` ao pipeline atômico** e então dropar `truncate_dynamic_tables`/`inserir_lote_raw` — se/quando valer o risco. Hoje são seed-only e sem exposição.

---

**PR:** `fix/v4-17-1-aposentadoria-f2` → `main`. Merge e deploy ficam com o usuário.
