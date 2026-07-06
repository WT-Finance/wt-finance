# WT Finance — Out-Briefing v4.37.1 · Aviso de data com direção (Solicitações)

**Data:** 2026-07-06 · **Branch:** `feat/v4-37-1-solicitacoes-aviso-direcao` (base `main` @ v4.37.0) · **Versão:** 4.37.0 → **4.37.1** (PATCH)
**Tema:** No editor de tipos de Solicitação, o aviso do campo de **data** ganha **direção** — avisar quando a data está **a mais de** X dias no futuro (comportamento atual) **ou a menos de** X dias (prazo curto). Escolha do Yan: as **duas opções**, preservando os tipos já configurados. **Migration 0171 (aditiva) · estende ADR-0118 · sem novo ADR.** Merge e deploy ficam com o usuário.

## Contexto
A regra de data por campo (v4.19.0/ADR-0118) só avisava `diasEntre(hoje, data) > X` — "a mais de X dias". O correto/desejado inclui o sentido inverso (prazo curto). Optou-se por um **seletor de direção** (não trocar o sentido fixo), para **não mudar** o comportamento dos tipos já existentes.

## Mudanças (1 migration + as camadas)
- **Migration 0171 (aditiva):** `ALTER TABLE app.solicitacao_campo ADD COLUMN data_aviso_direcao text NOT NULL DEFAULT 'acima' CHECK (IN ('acima','abaixo'))` + `CREATE OR REPLACE` das 3 RPCs que leem/gravam o campo (`solic_tipos_abertura`, `admin_solic_listar_tipos` emitem; `admin_solic_salvar_tipo` persiste). `criar_solicitacao` **intocada** (o aviso é só de UI; o servidor não enforça). Aplicada via `npm run db:migrate -- --aditiva` (backup-gate VERDE); coluna + RPCs verificadas (22 campos existentes → `'acima'`).
- **Schema** (`src/lib/solicitacoes/schemas.ts`): `data_aviso_direcao: z.enum(['acima','abaixo']).optional()` na `campoDefSchema`.
- **Editor** (`editor-tipo.tsx`): `Select` "a mais de / a menos de" ao lado do nº de dias; sufixo "dias no futuro / de hoje"; default `'acima'` no seed/adicionar/salvar. `comoLinhas` repopula via spread (sem mudança).
- **Action** (`admin/solicitacoes/actions.ts`): forward de `data_aviso_direcao` no payload.
- **Render** (`campos-dinamicos.tsx`): `mostraAviso = direcao==='abaixo' ? dias < X : dias > X`; texto condicional ("a menos de X dias de hoje" / "a mais de X dias no futuro").

## Invariantes / retrocompatibilidade
- **Nenhum tipo existente muda:** default `'acima'` = comportamento idêntico ao atual (aviso "a mais de X"). Só tipos novos/editados escolhem o sentido.
- **Aviso é só de UI** (não bloqueia o envio) — como antes; o único bloqueio server-side (data no passado) continua vindo do `data_permite_passado` (0140), intocado.
- **Contrato preservado:** a chave nova sobrevive ao `campoDefSchema` (teste em `rpc-contrato.test.ts`); direção inválida é rejeitada pelo enum.

## Gate de fechamento
`npx tsc --noEmit` → **0** · `npm test` → verde (rpc-contrato **48**, com os 2 casos novos de direção) · `eslint` nos arquivos alterados → **0** · `npm run build` → exit 0. Migration 0171 aplicada (backup-gate VERDE) e verificada.

## Arquivos
- **Banco:** `supabase/migrations/0171_solic_campo_aviso_direcao.sql` (aditiva).
- **App:** `src/lib/solicitacoes/schemas.ts`, `src/components/admin/solicitacoes/editor-tipo.tsx`, `src/app/admin/solicitacoes/actions.ts`, `src/components/solicitacoes/campos-dinamicos.tsx`, `src/lib/rpc-contrato.test.ts`.
- **Versão/docs:** `package.json`/`package-lock.json` (4.37.1), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing.
