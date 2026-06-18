# WT Finance — Out-Briefing v4.22.2

**Data:** 2026-06-17 · **Branch:** `feat/v4-22-2-fuso-horario` (base `main`) · **Versão:** 4.22.1 → **4.22.2** (PATCH)
**Tema:** Correção de fuso horário **em toda a plataforma** — "hoje"/"este mês" no fuso de São Paulo. Migration 0152. ADR-0125. **Merge e deploy ficam com o usuário.**

> Follow-up sistêmico registrado na v4.22.1: a 0151 corrigiu só a projeção do Gerencial; esta versão fecha o resto.

---

## Causa-raiz
A sessão do Postgres (Supabase) roda em **UTC**. `CURRENT_DATE`/`now()::date`/`date_trunc('month', CURRENT_DATE)` em RPCs devolvem o "hoje" de **UTC**, que a partir das ~21h de São Paulo (UTC−3) **já é o dia seguinte**.

## Auditoria (ground-truth das definições VIVAS do banco)
Dump de **174 funções** + views + matviews + rolconfig + defaults (via `pg_get_functiondef`, não só os arquivos de migration). Padrão de "hoje/este-mês" encontrado em **~15 funções + 1 view** (`financeiro.vw_proximos_vencimentos`): calendário de liquidez (`eh_hoje`), próximos lançamentos/casamentos, KPIs (mês/ano corrente, dias encerrados), idade de vendas em aberto, cortes de mês Weddings/Performance, classificação `a_vencer`, projeção `__nucleo`. **Constatações que tornam a correção segura:**
- `timestamptz` = instante absoluto; o fuso do role muda só o **offset textual** do ISO, não o valor; o app exibe via `Intl`/`fmtDataSP`.
- `to_char`/`::text` de coluna **DATE** é independente de fuso (quase todo render de data é sobre DATE).
- Defaults `now()` (criado_em/atualizado_em) são `timestamptz` (instantes) — inalterados.

## Decisão — Approach A (autorizada pelo Yan)
**Migration 0152 (aditiva):** `ALTER ROLE anon|authenticated|service_role SET timezone = 'America/Sao_Paulo'` + `NOTIFY pgrst, 'reload config'`. O PostgREST aplica o `rolconfig` do papel da requisição a cada chamada (mesmo mecanismo do `statement_timeout` — ADR-0122/0145), então `CURRENT_DATE`/`now()` refletem SP em **todas** as RPCs, atuais e futuras. **`postgres` não foi alterado** (migrations/seed seguem UTC). **Reversível** (`RESET timezone`). ADR-0125.

Alternativa **B (cirúrgico por função)** rejeitada: verbosa, propensa a esquecer alguma (split wrapper/`__nucleo`) e função nova reintroduziria o bug.

## Auto-auditoria adversarial
Revisão em 3 dimensões (renderização de timestamp / lógica-UTC e cargas / app-side split e envio de datas), com verificação adversarial dos achados → **0 regressões confirmadas**.

## Verificação
- **rolconfig confirmado** (via `pg_roles`): `anon`/`authenticated`/`service_role` agora têm `TimeZone=America/Sao_Paulo` (ao lado do `statement_timeout` existente). Referência no momento: hoje-SP=2026-06-17 vs `current_date`(UTC)=2026-06-18.
- **Mecanismo:** idêntico ao `statement_timeout` por role já provado neste projeto (anon=3s/auth=8s/service=0 valem porque o PostgREST aplica o rolconfig por requisição). Não foi possível sondar o efeito via service key diretamente (os `__nucleo` não são expostos pelo PostgREST — `PGRST125`); a confirmação visual definitiva é o **Calendário de Liquidez ("é hoje")** no preview do PR.
- **Backup-gate VERDE** antes do push (38/38 tabelas, restore-test spot 4/4 idêntico).

## Gates
`tsc --noEmit` **0** · `lint` **13** (= baseline) · `next build` **limpo** (47/47) · `npm test` **131**.

## Arquivos
**Novos:** `supabase/migrations/0152_timezone_sao_paulo_roles.sql`, `docs/adr/0125-timezone-plataforma-via-role.md`, este out-briefing.
**Modificados:** `package.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `CLAUDE.md` (lição de fuso atualizada: app roles em SP, `postgres`/migrations em UTC).
**Sem mudança de código de app** (a correção é 100% de configuração de role no banco). As conversões `AT TIME ZONE` explícitas pré-existentes (projeção 0151, `criar_solicitacao`) ficam como defesa-em-profundidade.

## Pendências / fora de escopo
- Confirmação visual em produção pós-deploy (Calendário de Liquidez, KPIs do mês) — esperado correto.
- Sem outras pendências de fuso conhecidas (a auditoria cobriu as definições vivas).
