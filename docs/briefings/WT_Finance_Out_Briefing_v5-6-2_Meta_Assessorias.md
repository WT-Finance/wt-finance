# Out-Briefing — v5.6.2 · Meta de Assessorias no Comparativo (Weddings)

**Data:** 2026-08-13 · **Branch:** `feat/v5-6-2-meta-assessorias` · **Base:** main @ v5.6.1 ·
**Migration:** `0249` (aditiva, **APLICADA** 13/08, gate verde) · **ADR:** nenhum ·
**Briefing:** `briefing-v5-6-2-meta-assessorias.md` (1º commit; nasceu da investigação read-only
de 11/08 que provou a identificação de "Contrato de casamento" no espelho da API).

## 1. O que foi entregue

Com **Weddings** selecionado no Comparativo de `/metas`: anel reduzido (168→132px) e, embaixo,
a **barra "Meta de Assessorias"** — contratos de casamento vendidos no mês em foco × meta fixa
**14** (`META_ASSESSORIAS_MENSAL` em `comparativo.ts`; trocar é 1 linha). Acompanha presets e
Personalizado. Demais setores: nada muda (provado por DOM: zero `progressbar`, anel 168).

**Decisões do Yan:** fonte = **API/espelho Monde** (não o upload) · **só contrato novo conta**
("Atualização de Contrato de Casamento" fora) · meta travada em 14 "por ora".

## 2. Banco — migration 0249 (APLICADA)

`get_contratos_casamento_mes(p_from, p_to)`: padrão INLINE (`exigir_acesso` nas áreas de
`metas_listar`), `STABLE`, `SECURITY DEFINER`, `search_path` vazio, REVOKE/GRANT explícitos.
Conta `COUNT(DISTINCT venda)` de itens **ativos** (filtro na leitura, regra v5.4.5) com
`TRIM(produto) ILIKE 'contrato de casamento%'` em Weddings.
**Verificação REST/service_role (executa o corpo):** 2025 = **87** (idêntico à medição direta
via `SUPABASE_DB_URL` de 11/08) · jul/26 = **4** · ago/26 = **0**. Gate de backup **verde**;
`0249` era a única pendente (nada arrastado).

## 3. Gates e revisão

`build` ✅ · `tsc` ✅ · `lint` ✅ · **910/911** (única falha: tripwire v5.4.5, dado vivo,
pré-existente — segue pendente de decisão). Casos novos: F7 (`safeParse` do schema contra a RPC
viva) + invariantes (int ≥ 0; mês ⊆ ano — sem valor absoluto fixado: cancelamento retroativo
existe).

**`revisor-db`: APROVADA** (0 CRÍTICO/ALTO). MÉDIO informativo: leitura direta de
`monde.venda_item` sem índice composto — irrelevante no volume atual (~47k itens ≪ teto 8s);
reavaliar se o espelho crescer uma ordem de grandeza. BAIXO incorporado: `STABLE`. BAIXO
registrado: `COUNT(DISTINCT venda)` subestimaria venda com 2 contratos distintos (mesmo idioma
e limitação do `vendas_count` da mv — aceito).

**`revisor`: APROVADO COM RESSALVAS.** MÉDIO corrigido: schema entrou no bloco F7 (a asserção
manual não validava o Zod em runtime). BAIXO corrigido: `duration-500` na transição da barra.
BAIXOs registrados: a RPC de assessorias entra no MESMO `Promise.all` da seção (latência dela
atrasa a seção toda — aceito pela atomicidade do estado/guard); ao trocar PARA Weddings o anel
encolhe um frame antes de a barra chegar (cosmético, refetch em curso).

## 4. Verificação visual — AO VIVO (Edge)

Weddings + Último mês: anel 132 + barra **"4 de 14"** dourada (screenshot no chat) — o 4 confere
com a REST de jul/26. Group: barra ausente do DOM, anel 168. Zero real (ago/26 = 0) exibe
"0 de 14" honesto.

## 5. Registros

- Regra por DESCRIÇÃO em namespace de texto livre: variante nova de nome no Monde vazaria em
  silêncio (limitação aceita; documentada no header da 0249 e na investigação do de-para).
- Edge case: mês em foco sem meta cadastrada ⇒ card do anel ausente ⇒ barra sem lugar (raro;
  a barra é acessório do card).
- O card "Contratos" da Visão geral segue na fonte upload (fora do escopo, como no briefing).
