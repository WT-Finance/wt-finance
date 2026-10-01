# ADR-0180 — API Externa com área RBAC própria (`api-externa`)

**Status:** aceito (v6.1.1) · **Data:** 2026-10-01 ·
**Contexto:** patch v6.1.1, "Ajustes de navegação, cabeçalho de Performance e Exportar do DRE" ·
**Spec:** `docs/briefings/spec-v6-1-1-ajustes-navegacao-dre.md` · **Migration:** `0289` (aditiva,
aplicada em 01/10/2026) · **Código:** `src/lib/auth/areas.ts`, `src/components/layout/nav-model.ts`,
`src/app/admin/api-externa/**` · **Runbook:** `docs/runbooks/chaves-rpa-runbook.md`

> Numeração conferida contra `docs/adr/` e contra todas as refs do remoto em 01/10/2026 (últimos
> reais: ADR 0179, migration 0288 antes desta versão).

## O problema

A tela `/admin/api-externa` nasceu na v5.4.0 como apêndice de Solicitações: emitia as chaves da API
pull de solicitações e configurava quais tipos ficam expostos. Por isso a gestão era protegida pela
área `solicitacoes` (gestão de Solicitações) — no guard da tela, nas server actions e nas RPCs
`api_*` (`app.exigir_acesso(ARRAY['solicitacoes'])`). Desde a v6.1.0 a mesma tela emite as **chaves
das RPAs de ingestão** (`escopoBases`), que nada têm a ver com Solicitações. Resultado: quem
administra as RPAs precisava do poder de gerir Solicitações, e quem gere Solicitações podia emitir
chave de carga de dados.

## Decisão (do Yan, 01/10/2026)

1. **Seção própria na sidebar** — grupo "API Externa" com as subabas *Chaves* e *Documentação*. Os
   atalhos que ficavam dentro de Solicitações saem.
2. **Área RBAC própria `api-externa`** (grupo *Administração*, ordem 56):
   - libera a tela de chaves, as actions e as 7 RPCs exclusivas da API externa
     (`api_chave_listar`, `api_chave_registrar` ×2, `api_chave_revogar`, `api_log_listar`,
     `api_robo_registrar`, `admin_solic_tipo_api_config`), que passam a exigir **só** `api-externa`;
   - `admin_solic_listar_tipos`, compartilhada com Gerenciar solicitações, aceita
     `solicitacoes` **ou** `api-externa`. Consequência aceita: quem tem só `api-externa` lê o catálogo
     de tipos (inclusive arquivados) — a seção "Tipos expostos" precisa dele;
   - a Documentação aceita `api-externa` **ou** `solicitacoes/documentacao` (leitor/integrador sem
     poder de gestão continua lendo); `solicitacoes` sozinha deixa de abrir a documentação.
3. **Ninguém perde acesso no deploy:** a 0289 concede `api-externa` a toda role que tinha
   `solicitacoes` (em 01/10/2026: Administrador e Financeiro), **exceto roles de máquina**
   (`Máquina · %`) — a de verificação lê só áreas fora da Administração (invariante de
   `rpc-contrato.test.ts`). A partir daí as duas áreas são independentes no editor de roles.
4. **Corpos do catálogo vivo:** as 9 funções foram recriadas a partir de `pg_get_functiondef`
   trocando só a linha do `exigir_acesso`, com um guard `DO $$` de efetividade (assinaturas,
   sobrecargas, corpo com a área, backfill) que aborta a transação se a intenção não se cumprir.

## Alternativas descartadas

- **Manter `solicitacoes`** e só mover a navegação — barato, mas perpetua o acoplamento que o
  problema descreve.
- **Superset temporário** (`ARRAY['solicitacoes','api-externa']` + 2ª migration para estreitar) — o
  backfill prévio já garante a compatibilidade nos dois sentidos; a 2ª migration seria uma etapa a
  mais sem ganho. Brecha residual: role que ganhar `solicitacoes` pelo editor entre a aplicação
  (01/10) e o deploy fica sem `api-externa` — conferir no merge.

## Consequências

- O editor de roles passa a mostrar "API Externa" no grupo Administração; conceder a área é ato do
  admin.
- O rótulo vivo de `solicitacoes/documentacao` ("Solicitações (documentação)", grupo Solicitações)
  não mudou — renomear exige UPDATE (destrutiva, humano) e ficou como pendência.
- Precedente: área nova = INSERT em `app.rbac_areas` + par em `AREAS`/`AREA_INFO` no mesmo commit
  (paridade testada contra produção), como 0217/0247/0271.
