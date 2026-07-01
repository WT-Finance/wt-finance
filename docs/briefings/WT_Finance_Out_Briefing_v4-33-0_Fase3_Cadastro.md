# WT Finance — Out-Briefing v4.33.0 · Faturamento Corporativo Fase 3 (Cadastro de Clientes)

**Data:** 2026-07-01 · **Branch:** `feat/v4-33-0-faturamento-fase3-cadastro` (base `main` @ v4.32.0) · **Versão:** 4.32.0 → **4.33.0** (MINOR)
**Tema:** Cadastro gerenciável de clientes corporativos (a planilha paralela vira base na plataforma), reusando o padrão do Fluxo de Caixa Gerencial. Estrutura de abas (Emissão preservada + Cadastro novo). **Cadastro é REFERÊNCIA (Visão A).** Migration **0164** (escrita aditiva). **ADR-0137.** **Merge e deploy ficam com o usuário.**

## O que é
Duas abas em Faturamento Corporativo: **Emissão** (Fases 1a/1b/2, **byte-idêntica**) e **Cadastro de Clientes** (esta fase). O cadastro guarda situação/dias/regras/% juros-multa/destinatários por cliente, importável da planilha e editável na tela; **import substitui só a fatia de planilha e mantém os manuais**; **nome único** impede duplicados. Cadastro é referência — a Emissão **não** aplica as regras.

## Missões

### M1 — Tabela + RPCs (migration 0164, escrita aditiva — aplicada, gate VERDE)
- `app.cliente_corporativo` (schema `app`, RLS deny-by-default): campos TEXT (empresa, situacao, faturar_em, vencimento, obs, pct_juros, pct_multa, destinatarios, forma_pgto, contato_whats), origem ('planilha'/'manual'), auditoria. **UNIQUE em `app.norm_nome(empresa)`** = trim + minúsculo + **colapso de espaços** (endurecido além do "TRIM+minúsculo" do spec — a auto-verificação mostrou que "Acme Ltda" ≠ "Acme  Ltda" sem colapso).
- Helper `app.norm_nome(text)` IMMUTABLE (indexável).
- RPCs (`SECURITY DEFINER` + `exigir_acesso('financeiro/faturamento-corp')` + GRANT authenticated): `importar_clientes_corp` (DELETE origem='planilha' + INSERT, transação; **reporta** colisões com manual + duplicados na planilha, não quebra), `inserir_cliente_corp` (manual; nome duplicado → reporta), `atualizar_cliente_corp` (1 campo, whitelist; renome duplicado → reporta), `excluir_cliente_corp`, `apagar_clientes_corp`, `listar_clientes_corp`, `buscar_cliente_corporativo` (lookup read-only, scaffolding p/ Fase 4).
- **Verificado no banco (REST + pg):** inserir manual; duplicado (case/espaço) rejeitado; import [Beta, colide-manual, dup-planilha, vazio] → inseridos + colisoes_manual + duplicadas_planilha; reimport troca planilha e **mantém manual**; lookup por nome trimado; teardown limpo.

### M2 — Estrutura de abas + parser + UI
- **Wrapper** `faturamento-corp-content.tsx` (molde `gerencial-section.tsx`, a11y role=tab): Emissão → `<FaturamentoCorp>` **byte-idêntico**; Cadastro → `<CadastroClientes>`. `page.tsx` renderiza o wrapper (mantém `requireArea` + `asaasAmbiente()`/`asaasConfigurado()`; carrega o cadastro SSR via `listar_clientes_corp`).
- **Parser** `parse-clientes-corp.ts` (molde `parse-pessoas.ts`, client-side): COL_MAP por nome (normalizeHeader); **ENVIAR PARA → destinatarios, IGNORA EMAIL 1-6**; `toStr` em tudo; obrigatória **EMPRESA**; situação normalizada. +4 testes.
- **Tabela editável** `cadastro-clientes.tsx` (molde `base-dados-tab.tsx` + `lancamento-row.tsx`): EditableCell inline (texto; situação com badge + select); filtro origem + situação + busca por empresa; Nova linha (manual, inline, reporta duplicado); Importar (parse client-side → `importarClientesCorp`, mostra resultado: inseridos/colisões/duplicadas); Apagar (respeita filtro de origem, ConfirmModal); estado otimista + `router.refresh()`.
- **Actions** `cadastro-actions.ts` (gated): importar/inserir/atualizar/excluir/apagar.

### M3 — Fechamento
v4.33.0, CHANGELOG, CHANGELOG_DIRETORIA, ADR-0137, este out-briefing.

## Invariantes — auto-auditoria adversarial reforçada (Workflow, 6 céticos + síntese)
Rodou ANTES de fechar. Com julgamento (verifiquei cada "bloqueante"):
1. **NÃO-REGRESSÃO da Emissão** ✅ — `FaturamentoCorp` byte-idêntico vs `main` (git diff vazio, confirmado pelo cético); wrapper só adiciona pills. **Endurecido:** o SSR do cadastro na `page.tsx` foi envolvido em `try/catch` → fallback `[]` (uma falha ao listar o cadastro NÃO derruba a página nem a aba Emissão).
2. **Nome único** ✅ VERDE — UNIQUE normalizado (`app.norm_nome`: trim+minúsculo+colapso) em TODOS os caminhos (inserir/rename/import-vs-manual/dup-planilha) + índice no banco; provado.
3. **Import mantém manual** ✅ — `DELETE origem='planilha'` + INSERT, atômico; manuais intocados (provado). **Achado "delete sem guard de origem" REFUTADO:** apagar uma linha **manual** é ação de usuário autorizada e obrigatória (adicionar manual → poder excluir); restringir a `origem='planilha'` quebraria isso. É o padrão do Gerencial (delete por id). O invariante real ("**import** preserva manual") vale.
4. **Visão A** ✅ VERDE — emissão hermética: `faturamento-corp.tsx`/`actions.ts` NÃO importam nem consomem o cadastro (grep 0 matches); nada interpreta OBS/juros/multa; `buscar_cliente_corporativo` é só scaffolding.
5. **Destinatários como texto + segurança** ✅ VERDE — só a string do "ENVIAR PARA" (ignora EMAIL 1-6), sem split/validação; RPCs gated (exigir_acesso + REVOKE anon + GRANT authenticated), app não exposto, RLS deny-by-default, whitelist no atualizar, page lista via sessão authenticated.
6. **Parser/UI** ✅ — **Endurecido:** removido o `router.refresh` por-edição/por-delete (fica no update otimista local, como o Gerencial) → elimina os riscos de transições aninhadas e corrida de edição apontados. Refresh mantido só em import/apagar/inserir (onde os ids mudam).

## Gate de fechamento
- `npx tsc --noEmit` → **0** · `npm run lint` → **limpo** · `npm test` → **300** (+4 do parser) · `npm run build` → exit 0.
- Migration 0164 aplicada (backup-gate VERDE); RPCs verificadas via REST + pg (import/UNIQUE/colisão/lookup).

## CHECKPOINT do Yan (antes do merge)
1. Importar a planilha real → ver os 241 clientes, os destinatários, editar um cliente inline.
2. Adicionar um cliente **manual** e **reimportar** a planilha → o manual **sobrevive**, os de planilha são substituídos.
3. Tentar **nome duplicado** (import ou manual) → impedido/reportado.
4. **NÃO-REGRESSÃO (o crítico):** confirmar que a aba **Emissão** emite boletos e notas exatamente como na v4.32.0 (idempotência, falha parcial, ambiente, status de NF — tudo idêntico). Só ganhou uma aba por cima.

## Fronteira / fora de escopo
- **FORA (Fase 4 — envio):** consumir o cadastro (split dos destinatários, filtro só-ativos), enviar via M365 (throttling 30/min), anexar boleto+nota (resolve a pendência do PDF). Usa o `buscar_cliente_corporativo` desta fase.
- **FORA (Visão B, futuro):** aplicar as regras do cadastro automaticamente no faturamento.
- **FORA sempre:** produção (só após todas as fases); unificar com `raw.pessoas` (coexistem, casam por nome).

## Nota operacional
O `docs/briefings/WT_Finance_Briefing_v4-33-0_Fase3_Cadastro.pdf` versionado no repo estava **corrompido** (5 bytes `acode` prependidos ao header + páginas em branco). Trabalhei com a versão íntegra do Downloads do Yan (via `/mnt/c`). Vale recommitar a versão boa.

## Arquivos
- **Novos:** `supabase/migrations/0164_cliente_corporativo.sql`; `src/lib/faturamento/parse-clientes-corp.ts` (+ `.test.ts`); `src/app/financeiro/faturamento-corp/cadastro-actions.ts`; `src/components/financeiro/cadastro-clientes.tsx`; `src/components/financeiro/faturamento-corp-content.tsx`; `docs/adr/0137-...md`; este out-briefing.
- **Modificados:** `src/app/financeiro/faturamento-corp/page.tsx` (wrapper de abas + SSR do cadastro); `CHANGELOG.md`; `src/data/changelog-diretoria.ts`; `package.json`/`package-lock.json` (4.33.0). **`faturamento-corp.tsx` INALTERADO** (não-regressão).
