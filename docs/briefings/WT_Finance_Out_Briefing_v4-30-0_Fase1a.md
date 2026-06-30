# WT Finance — Out-Briefing v4.30.0 · Faturamento Corporativo Fase 1a

**Data:** 2026-06-30 · **Branch:** `feat/v4-30-0-faturamento-fase1a` (base `main` @ v4.29.0) · **Versão:** 4.29.0 → **4.30.0** (MINOR · READ-ONLY)
**Tema:** Pipeline + tela de revisão do Faturamento Corporativo, **deliberadamente SEM Asaas**. Migration 0161 (aditiva, só catálogo RBAC + regate). **ADR-0134.** **Merge e deploy ficam com o usuário.**

## O que é (e o que NÃO é)
Primeira metade da Fase 1 do Faturamento: importar a planilha crua → cruzar cada cliente com a base de pessoas (`buscar_pessoas`, v4.29.0) → **tela de revisão**. A fase **termina na revisão**. **NÃO há:** chamada ao Asaas, `src/lib/asaas/`, chave de API, emissão, migration de escrita, tabela de registro, botão que dispare. A emissão de boletos (irreversível) é a **Fase 1b** (v4.31.0).

## Missões

### M0 — RBAC novo (migration 0161, aditiva — aplicada, gate VERDE)
Área `financeiro/faturamento-corp` (rótulo "Faturamento Corporativo", grupo Financeiro, ordem 32): `INSERT` em `app.rbac_areas` + grant **só aos roles administradores** (têm `admin/acessos`) — gate APERTADO, **não** a todos (≠ 0143). `areas.ts` (AREAS + AREA_INFO + `areasDaRota` preciso) + nav (`sidebar.tsx`, FINANCEIRO_SUBS). `buscar_pessoas` teve o gate **estendido** (CREATE OR REPLACE aditivo) para `exigir_acesso(['admin/uploads','financeiro/faturamento-corp'])` (OR) — o consumidor de faturamento passa, o de upload segue. **Verificado:** área presente, concedida a 2 roles admin, gate estendido. Paridade `AREAS` ↔ `app.rbac_areas` mantida (teste verde).

### M1 — Pipeline (parser + cruzamento)
- `src/lib/faturamento/parse-faturamento.ts` (client, `@e965/xlsx`): crua (Número, Emissão, Pessoa, Vencimento, Valor Final, **Fatura Cliente Nº**). Coerção canônica: `toNum` no Valor Final, `toIsoDate` nas datas, **`toStr`/string no `Fatura Cliente Nº`** (TEXT — será o `externalReference`/idempotência da 1b). Detecção de coluna tolerante; obrigatórias (Pessoa/Valor Final/Vencimento/Fatura Cliente Nº) via o helper compartilhado da v4.29.0.
- **Transformações do R:** o script legado NÃO está no repo nesta fase. Com o enriquecimento vindo de `buscar_pessoas`, as transformações necessárias se resumem à coerção de formato (data/valor) — feita pela coerção canônica. Confirmar transformações extras se/quando `docs/faturamento-legado/` for commitado (nenhuma aparenta necessária).
- `actions.ts`: `cruzarFaturamento(nomes)` (gated `financeiro/faturamento-corp`) → `buscar_pessoas`. `classificar.ts` (puro/testável): **pronta** (casou + tem CPF/CNPJ) / **sem_dados_fiscais** (casou, falta CPF/CNPJ) / **nao_identificado** (não casou). TRIM nos dois lados; homônimos sinalizados.

### M2 — Tela de revisão (entrega central)
Aba "Faturamento Corporativo" em Financeiro. Upload → dropzone + **spinner 2 fases** ("Lendo a planilha…" → "Cruzando com a base de pessoas…") → tabela: **Pessoa · Valor · Vencimento · Fatura Cliente Nº · Cruzamento (status + faltam) · Emitir (toggle)**. Resumo no topo (total, R$ total, prontas, sem dados, não identificadas). Cabeçalho **sem ícone**; verde Corporativo via `SETOR_COLORS` (token, sem cor crua). **SEM botão de emitir** — placeholder claro ("a emissão vem na Fase 1b"); o toggle "Emitir" é só pré-seleção local, sem efeito.

### M3 — Fechamento
v4.30.0, CHANGELOG, CHANGELOG_DIRETORIA, ADR-0134, este out-briefing.

## Invariantes — auto-auditoria adversarial (4 céticos, todos VERDE)
1. **ZERO Asaas / ZERO escrita-no-mundo / ZERO botão de emitir** — sem `src/lib/asaas`, sem fetch externo, sem chave; migration só catálogo RBAC; cruzamento read-only; crua não persiste; sem disparo.
2. **RBAC apertado + paridade** — área própria gateia página + action; grant só a admins; `gerencial`/`fluxo-caixa` NÃO veem; `buscar_pessoas` regate OR; paridade verde.
3. **Pipeline + classificação** — `Fatura Cliente Nº` TEXT; TRIM; classificação correta.
4. **UI/DS** — dropzone + spinner 2 fases; sem ícone no título; cores via token; sem botão de emitir.

## Gate de fechamento
- `npx tsc --noEmit` → **0** · `npm run lint` → **limpo** · `npm test` → **272/272** (+7 `classificar.test` + 1 contrato `buscar_pessoas`) · `npm run build` → **limpo** (rota `/financeiro/faturamento-corp`).
- Migration 0161 aplicada (backup-gate VERDE); área/grant/regate verificados.

## Contagem de faturas por estado de cruzamento
A contagem real (quantas **prontas** / **sem dados fiscais** / **não identificadas**) sai ao subir a crua REAL — é o resumo no topo da tela. Como a maioria dos cadastros da base não tem dados fiscais completos (confirmado na v4.29.0), espera-se um volume relevante em "faltam dados fiscais": **é exatamente o que esta fase expõe, antes de custar na 1b.**

## Conferência do Yan (pós-preview)
Subir a planilha crua real → ver a tela classificar as faturas, conferir que **nada é emitido** (sem botão) e que os **dados fiscais faltantes aparecem** (quantas faturas vêm sem CNPJ/endereço — informa a 1b). Confirmar que só quem tem `financeiro/faturamento-corp` vê a aba.

## Fronteira / fora de escopo
- **FORA (Fase 1b):** Asaas, `src/lib/asaas/`, `ensure_customer`, emissão de boletos, tabela de registro (migration de escrita), idempotência, botão de emitir, confirmação de emissão. **FORA (fases 2–4):** notas fiscais, download de PDFs, e-mails.

## Arquivos
- **Novos:** `supabase/migrations/0161_area_faturamento_corp.sql`; `src/lib/faturamento/{tipos,parse-faturamento,classificar,classificar.test}.ts`; `src/app/financeiro/faturamento-corp/{page,actions}`; `src/components/financeiro/faturamento-corp.tsx`; `docs/adr/0134-...md`; este out-briefing.
- **Modificados:** `src/lib/auth/areas.ts`, `src/components/layout/sidebar.tsx`, `src/lib/schemas-rpc.ts` (buscarPessoasSchema), `src/lib/rpc-contrato.test.ts`; `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`/`package-lock.json` (4.30.0).
