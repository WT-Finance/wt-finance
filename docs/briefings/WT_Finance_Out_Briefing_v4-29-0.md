# WT Finance — Out-Briefing v4.29.0

**Data:** 2026-06-26 · **Branch:** `feat/v4-29-0-base-pessoas-colunas-obrigatorias` (base `main` @ v4.28.0) · **Versão:** 4.28.0 → **4.29.0** (MINOR)
**Tema:** Base de Pessoas (Monde) na Atualização de Dados + aviso de colunas obrigatórias nas 5 bases. **Migration 0160 (aditiva) · ADR-0133.** Pré-requisito da Fase 1 do Faturamento. **Merge e deploy ficam com o usuário.**

## Frente 1 — Base de Pessoas (nova)

### M1 — Tabela + RPCs (migration 0160, aditiva — aplicada, gate VERDE)
`raw.pessoas` (+ `raw.pessoas_staging` UNLOGGED): 17 campos **TEXT** (nome, razao_social, cnpj, cpf, cep, inscricao_estadual/municipal, email, endereco, numero, complemento, bairro, cidade, uf, pais, telefone, celular) + `carregado_em`. RLS deny-by-default. Pipeline **atômico** (modelo 0116/Vendas): `limpar_staging_pessoas` → `inserir_lote_staging_pessoas` (TRIM no nome) → `validar_carga_pessoas` (não-destrutivo) → `promover_carga_pessoas` (TRUNCATE+cópia numa transação; **aborta se staging vazia**). `status_pessoas` + `buscar_pessoas(text[])` (lookup read-only por nome trimado, `STABLE SECURITY DEFINER` + `exigir_acesso(['admin/uploads'])` + GRANT authenticated; modelo `cruzar_vendas_setor`). **Verificado end-to-end via REST + pg:** validar→ok, promover→1, TRIM provado (nome com espaço casou no lookup trimado), zeros preservados (`00111222000133`/`04602529925`/`66035145`/`00010`/`0012345`), vazias→null; linha-teste limpa (base de prod permanece vazia, total 0).

### M2 — Parser + validação + UI
`src/lib/carga/parse-pessoas.ts`: `@e965/xlsx`, COL_MAP das 17 colunas (casamento por `normalizeHeader`, tolerante a acento), **`toStr` em tudo** (documentos como texto, nunca `toNum`), pula linha 100% vazia. **Valida as 17 COLUNAS no cabeçalho** (não as células) via o helper compartilhado. Worker: `parse.worker.ts` registra `'pessoas'`. 3 server actions (`getPessoasStatusAction`/`inserirLotePessoasAction`/`finalizarPessoasAction`, `requireAreaAction('admin/uploads')` + `getAdminClient`). `page.tsx`: entrada `Pessoas` em `BASES` (batch 500), wirada em todos os pontos (BaseKey, status/estados/linhasRef, `carregarStatus`, handlers). Teste `parse-pessoas.test.ts` (xlsx em memória): 17 colunas com células vazias → importa; falta uma → erro listando-a; TRIM; documentos com zero preservado.

## Frente 2 — Aviso de colunas obrigatórias (transversal, 5 bases)

### M3 — Lista REAL de obrigatórias, DERIVADA do código (não assumida)
| Base | Obrigatórias (derivadas do parser) | Comportamento hoje |
|---|---|---|
| **Vendas por Produto** | **nenhuma** | parser **tolerante** (`normalizeHeader` + só `console.warn` de não-mapeadas) — não rejeita por coluna |
| **Lançamentos por Operação** | `Operacao`, `Valor`, `Tipo` | `headers.includes(col)` exato |
| **Lançamentos por Categoria** | `Vencimento`, `Valor` | `headers.some(h => COL_MAP[h] === campo)` sobre `['vencimento','valor']` |
| **Fluxo de Caixa (CAP/CAR)** | `Tipo`, `Status`, `Valor Final` (alias `Valor_Final`) | idem sobre `['tipo','status','valor_final']` |
| **Pessoas** | as **17** colunas | novo |

### M4 — Helper compartilhado + aviso na UI
`src/lib/carga/colunas-obrigatorias.ts`: `validarColunasObrigatorias(headers, requisitos)` (set-membership sobre headers trimados; `aceitos` lista as variantes que satisfazem o requisito) + `mensagemColunasFaltando`. Os 3 parsers que rejeitam trocaram o loop inline pela chamada ao helper — **com `requisitos` derivados do próprio COL_MAP** (`aceitos = chaves do COL_MAP que mapeiam ao campo`), **exatamente equivalente** a `headers.some(h => COL_MAP[h] === campo)`. Vendas **não** ganhou trava (lista vazia; card mostra "reconhecidas automaticamente"). O card exibe as obrigatórias de cada base; a mensagem de falta ficou amigável.

## Invariantes — auto-auditoria adversarial (4 céticos independentes, todos VERDE)
1. **NÃO-REGRESSÃO das 4 bases** — re-derivação independente provou equivalência EXATA do conjunto aceito/rejeitado; Vendas byte-idêntico (diff vazio); aliases preservados; só a mensagem mudou.
2. **Pessoas valida COLUNAS, não células** — célula vazia → null (nunca rejeita); documentos via `toStr` (nunca `toNum`), tabela TEXT; TRIM no nome (ingestão + lookup).
3. **Carga atômica + segurança** — abort-antes-do-truncate (base nunca vazia); `validar` não escreve; `buscar_pessoas` read-only + anon barrado em 2 camadas; migration aditiva.
4. **Worker + lotes + wiring** — `pessoas` no worker; `page.tsx` wirado sem cair no bucket errado; card com obrigatórias; actions gated.

## Migrations / ADRs
- Migration **0160** (aditiva) — aplicada via `npm run db:migrate -- --aditiva` (backup-gate VERDE); RPCs verificadas via REST.
- **ADR-0133** — base de pessoas como fonte cadastral + validação de 17 colunas + aviso transversal derivado dos parsers.

## Gate de fechamento
- `npx tsc --noEmit` → **0** em `src/`.
- `npm run lint` → **limpo**.
- `npm test` → **264/264** (18 arquivos; +7 helper, +3 parser de pessoas).
- `npm run build` → **limpo** (exit 0; `/admin/uploads` compilada).
- Auto-auditoria adversarial 4/4 `ok` + verificação end-to-end no banco vivo.

## Conferência do Yan (pós-preview)
1. Subir a `pessoas.xlsx` real (ver o card com a contagem de pessoas e os documentos com zeros à esquerda). 2. **Não-regressão:** reimportar uma planilha conhecida-boa de cada uma das 4 bases existentes — todas seguem aceitando como antes (ponto crítico).

## Fronteira / fora de escopo
- **FORA:** o Faturamento em si (frente seguinte; `buscar_pessoas` é o scaffolding read-only); unificar com `analytics.dim_pagante`; integração direta com o Monde; mudar as regras de validação das 4 bases além de torná-las explícitas.

## Arquivos
- **Novos:** `supabase/migrations/0160_base_pessoas.sql`; `src/lib/carga/colunas-obrigatorias.ts` (+ `.test`); `src/lib/carga/parse-pessoas.ts` (+ `.test`); `docs/adr/0133-...md`; este out-briefing.
- **Modificados:** `src/lib/carga/parse-lancamentos.ts`, `parse-lancamentos-financeiro.ts`, `parse-fluxo-caixa-titulos.ts` (helper), `parse.worker.ts`; `src/app/admin/uploads/actions.ts`, `page.tsx`; `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`/`package-lock.json` (4.29.0).
