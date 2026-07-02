# WT Finance — Out-Briefing v4.33.2 · Refino de tabelas + padrão de cabeçalho

**Data:** 2026-07-02 · **Branch:** `feat/v4-33-2-refino-tabelas` (base `main` @ v4.33.1) · **Versão:** 4.33.1 → **4.33.2** (PATCH)
**Tema:** Refinos de UI de tabelas (transversal) + padronização do cabeçalho no Design System + rótulos de permissão. **1 migration destrutiva (`0168`) — aplicação HUMANA.** **Merge e deploy ficam com o usuário.**

## Missões

### M1 — Emissão (Faturamento): botões à direita + fim da barra horizontal
- Resumos (Boletos/Notas) à esquerda e botões **“Emitir boletos”/“Emitir notas fiscais”** à direita, na **mesma linha** (`flex justify-between`).
- Coluna **Status** `w-36`→`w-28` e `min-w` da tabela `62rem`→`54rem` → **elimina a barra de rolagem horizontal** na revisão. (`table-fixed` mantém a quebra do texto na coluna Nota.)

### M2 — Cabeçalho de tabela padronizado (toda a plataforma)
- Removido `uppercase tracking-wide` dos 4 arquivos que divergiam do padrão da **Lista de Operações**: `faturamento-corp.tsx`, `calculadora-rateio.tsx`, `gerencial/import-drawer.tsx` (2 theads), `composicao-lancamentos.tsx` → todos com **`font-medium` + cor terciária**, sem caixa alta/negrito. (As outras ~23 tabelas já seguiam o padrão.)
- **Registrado no Design System §7** (`src/app/admin/design-system/page.tsx`) como padrão único de cabeçalho + o padrão de scroll interno com cabeçalho fixo. Também anotado no **CLAUDE.md** (Convenções).

### M3 — Scroll interno com cabeçalho fixo (Cadastro + Base de Dados do Gerencial)
- `cadastro-clientes.tsx` e `gerencial/base-dados-tab.tsx`: container `overflow-x-auto` → **`overflow-auto max-h-[70vh]`** e `<thead>` → **`sticky top-0 z-10 [&_tr]:bg-white`** — a tabela rola por dentro e o cabeçalho (rótulos + filtros) fica fixo.

### M4 — Rótulos de permissão (Usuários e Acessos)
- `src/lib/auth/areas.ts` (AREA_INFO.rotulo): “Performance — X” → **“Performance/X”** (Geral/Trips/Weddings/Corporativo); “Fluxo de Caixa Gerencial” → **“Gerencial”**.
- Migration **`0168_rotulo_areas.sql`** — `UPDATE app.rbac_areas SET rotulo` para essas 5 áreas (o modal lê o rótulo do banco; `AREA_INFO` é só fallback). **Destrutiva por classificação (UPDATE em dado existente) → aplicação humana** (`npm run db:migrate -- --destrutiva`). Só muda texto exibido — não toca `area`/`grupo`/`ordem`/permissões. Reversão no rodapé da migration.
- **Acervo de Documentos NÃO entra** — o rótulo vive na branch **v4.34.0** (PR #160), fora do `main`. Renomeá-lo lá.

### M5 — Fechamento
v4.33.2, CHANGELOG, CHANGELOG_DIRETORIA, este out-briefing. Sem ADR novo (convenção registrada no DS §7 + CLAUDE.md).

## Invariantes — auto-auditoria
1. **Lógica de emissão intacta** ✅ — nenhum arquivo de `src/lib/asaas`/Server Actions tocado; só apresentação.
2. **Migration só de rótulo** ✅ — `0168` só faz `UPDATE ... rotulo`; não altera chave/FK/permissões; reversível; **não aplicada pelo agente**.
3. **Sem regressão de dados** ✅ — nenhuma outra migration; nada de dado alterado além do texto de rótulo (que o humano aplica).
4. **Paridade RBAC preservada** ✅ — só rótulos mudaram; as chaves (`AREAS` ↔ `rbac_areas`) e o teste de paridade não mudam.

## Gate de fechamento
`npx tsc --noEmit` → 0 · `npm run lint` → limpo · `npm test` → verde · `npm run build` → exit 0. **A migration 0168 NÃO foi aplicada** (destrutiva → aplicação humana).

## CHECKPOINT do Yan
1. **Emissão:** botões à direita alinhados ao resumo; sem barra de rolagem horizontal na tabela de revisão.
2. **Cabeçalhos:** conferir que as tabelas (Emissão, Rateio, drawers do Gerencial, Composição) estão sem caixa alta, como a Lista de Operações.
3. **Scroll interno:** Cadastro de Clientes e Base de Dados do Gerencial rolam por dentro com o cabeçalho fixo.
4. **Permissões:** aplicar a migration `0168` (`npm run db:migrate -- --destrutiva`) e conferir os novos rótulos no modal de Usuários e Acessos.

## Arquivos
- **Apresentação:** `faturamento-corp.tsx`, `calculadora-rateio.tsx`, `gerencial/import-drawer.tsx`, `composicao-lancamentos.tsx`, `cadastro-clientes.tsx`, `gerencial/base-dados-tab.tsx`, `admin/design-system/page.tsx`.
- **RBAC:** `src/lib/auth/areas.ts` + `supabase/migrations/0168_rotulo_areas.sql` (destrutiva, aplicação humana).
- **Docs/versão:** `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `CLAUDE.md`, `package.json`/`package-lock.json`, este out-briefing.
