# WT Finance — Out-Briefing v4.28.0

**Data:** 2026-06-24 · **Branch:** `feat/v4-28-0-calculadora-rateio` (base `main` @ v4.27.3) · **Versão:** 4.27.3 → **4.28.0** (MINOR)
**Tema:** Calculadora de Rateio (Financeiro) — importa uma fatura, cruza `Venda Nº` → Setor Macro, rateia o valor por setor. **READ-ONLY** (não grava). **1 migration ADITIVA** (a RPC de cruzamento) · **ADR-0132**. **Merge e deploy ficam com o usuário.**

## Resumo
Aba nova no sidebar de Financeiro, sob a permissão **`financeiro/gerencial`** (reusa a área — **sem RBAC novo**). O usuário importa a fatura de um fornecedor (xlsx); o sistema cruza cada linha pelo número da venda com a base, busca o Setor Macro e rateia o valor total entre os setores (proporcional, **linha a linha**, **com sinal**). Só exibe — nada é gravado.

## Missões

### M1 — RPC de cruzamento (migration 0159, aditiva)
`public.cruzar_vendas_setor(p_vendas text[]) RETURNS jsonb`, `STABLE SECURITY DEFINER`, `SET search_path=''`. Lê `analytics.vw_vendas_agregadas` (1 linha por venda, `venda_no`→`setor_macro` direto) com `WHERE venda_no = ANY(p_vendas)`; devolve os pares **encontrados**. Gate: `exigir_acesso(ARRAY['financeiro/gerencial'])` + `REVOKE FROM PUBLIC, anon` + `GRANT TO authenticated, service_role`. Modelo: `get_vendas_em_aberto` (0114) com o wrapper RBAC atual (0121). **Verificado via REST** (service role): `71408/72012/72019/72030→Corporativo`, `71971→Lazer`; número inexistente não volta (→ "Não identificado" por diferença); `[]`→`[]`. Schema `cruzarVendasSetorSchema` + caso no `rpc-contrato.test.ts` (safeParse contra a RPC viva).

### M2 — Núcleo do rateio + cruzamento (engine)
- `src/lib/rateio/tipos.ts` — `SetorLogico` (Corporativo|Lazer|Weddings|Não identificado), `SETORES_REAIS`, `ehSetorReal`, tipos de linha/balde/resultado.
- `src/lib/rateio/calcular.ts` — **puro/isomórfico**: cada linha com valor → 1 dos 4 baldes (fallback "Não identificado" total); linhas sem valor → `ignoradas`; `%` = balde/total; `fecha` = `|total − soma(baldes)| < 0.005`. Fechamento por construção.
- `src/lib/rateio/calcular.test.ts` — 7 testes: fechamento, **Lazer não cai em Não identificado**, Não identificado explícito (venda nula/ausente), multi-linha da mesma venda, ignoradas, pct (sinal/zero), 4 baldes na ordem fixa.
- `src/app/financeiro/calculadora-rateio/actions.ts` — server action `cruzarVendasSetor` (`requireAreaAction('financeiro/gerencial')` → RPC via `getServerClient`; `parseRpc`). O arquivo **não** sobe; só os números distintos.

### M3 — Aba: import da fatura + exibição
- `src/lib/rateio/parse-fatura.ts` — leitura client-side com `@e965/xlsx` (padrão de `parse-vendas-produto.ts`, **sem Web Worker** — fatura ~41 linhas). Detecção por **nome exato** `Venda Nº`/`Valor`; coluna faltante → mensagem clara. `Venda Nº` via `toNum`→`Math.trunc`→`String` (casa com a base text numérica); `Valor` via `toNum` (BRL com sinal). Coerção **canônica** (sem reimplementar).
- `src/components/financeiro/calculadora-rateio.tsx` — UI: upload → cruzamento → resumo por setor (cor `SETOR_COLORS`, rótulo **Trips←Lazer só aqui**, valor com sinal + %, barra proporcional) + **Total e fechamento de conta evidentes** + aviso de `ignoradas` + lista linha-a-linha (toggle). Primitivos `Card`/`FaixaMensagem`.
- `src/app/financeiro/calculadora-rateio/page.tsx` — Server Component com `requireArea('financeiro/gerencial')`.
- Nav: item em `FINANCEIRO_SUBS` (sidebar, ícone `Calculator`, área `financeiro/gerencial`) + match preciso em `areasDaRota` (`/financeiro/calculadora-rateio` → `['financeiro/gerencial']`, antes do catch `/financeiro`).

### M4 — Fechamento
Versão 4.28.0; CHANGELOG; CHANGELOG_DIRETORIA (capacidade nova, linguagem de negócio); ADR-0132; este out-briefing.

## Invariantes — auto-auditoria adversarial (6 céticos independentes, todos VERDE)
1. **`Lazer` interno, `Trips` só na tela** — provado ponta a ponta (RPC/parser/cálculo/mapa usam `Lazer`; `Trips` só no `ROTULO`). Venda de lazer **não** cai em "Não identificado".
2. **Fechamento de conta** — partição exaustiva e disjunta; soma dos 4 baldes = total; setor inesperado da RPC é absorvido pelo guard `ehSetorReal` → "Não identificado" (sem perda).
3. **"Não identificado" explícito** — sem descarte silencioso; sempre renderizado; `ignoradas` contadas e exibidas.
4. **Read-only + segurança** — migration só DDL/GRANT (STABLE, só SELECT); app não grava; gate em 4 camadas; quem não tem `financeiro/gerencial` é negado em todas (sidebar/página/action/RPC), inclusive quem só tem `financeiro/fluxo-caixa`.
5. **Cast int→text + parse** — casamento robusto via `toNum`; nome exato de coluna; sem violar `wt/no-coercao-reimpl`.
6. **DS sem cor crua** — cores via `SETOR_COLORS` (tokens); primitivos reusados; sem hex/classe de cor crua; página sem `py` próprio.

## Migrations / ADRs
- Migration **0159** (aditiva) — aplicada via `npm run db:migrate -- --aditiva`; backup-gate **VERDE** (restore-test prod×restaurado idêntico, 4 tabelas); push concluído; RPC verificada via REST.
- **ADR-0132** — acesso à base por RPC read-only de cruzamento sobre `vw_vendas_agregadas`; `Lazer` lógico / `Trips` exibição.

## Gate de fechamento
- `npx tsc --noEmit` → **0** em `src/`.
- `npm run lint` → **limpo** (mantém o verde).
- `npm test` → **254/254** (16 arquivos; +7 `calcular.test` + 1 contrato vivo `cruzar_vendas_setor`).
- `npm run build` → **limpo** (exit 0; rota `/financeiro/calculadora-rateio` registrada).
- Auto-auditoria adversarial (6/6 `ok`).

## Decisões menores (registradas)
- **Linhas sem `Venda Nº`/`Valor` válido:** linha com `Valor` mas sem venda casável → **"Não identificado"** (preserva o fechamento); linha **sem `Valor`** parseável → **`ignoradas`** (não carrega dinheiro; contagem exibida). Linha 100% vazia é pulada.
- **Lista as linhas:** sim — além do resumo por setor, há um toggle "Ver as N linhas" (linha/venda/setor/valor), útil para conferir o "Não identificado".
- **`setor_macro` no schema:** `z.string()` (tolera drift da RPC); a conservação é garantida pelo guard de runtime `ehSetorReal`, não pelo tipo (sugestão não-bloqueante da auditoria).

## Fronteira / fora de escopo
- **FORA:** gravar lançamento/histórico do rateio (frente futura, com migration de **escrita** e cautelas de dado); conversão de moeda (Valor já em BRL); área RBAC própria (reusa `financeiro/gerencial`).
- **Conferência do Yan (pós-preview):** importar a fatura real, ver o rateio fazer sentido, conferir "Trips" (não "Lazer") na tela e o fechamento de conta.

## Arquivos
- **Novos:** `supabase/migrations/0159_cruzar_vendas_setor.sql`; `src/lib/rateio/{tipos,calcular,parse-fatura,calcular.test}.ts`; `src/app/financeiro/calculadora-rateio/{page,actions}.tsx?`; `src/components/financeiro/calculadora-rateio.tsx`; `docs/adr/0132-...md`; este out-briefing.
- **Modificados:** `src/lib/schemas-rpc.ts` (schema), `src/lib/rpc-contrato.test.ts` (caso), `src/lib/auth/areas.ts` (`areasDaRota`), `src/components/layout/sidebar.tsx` (nav), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`/`package-lock.json` (4.28.0).
