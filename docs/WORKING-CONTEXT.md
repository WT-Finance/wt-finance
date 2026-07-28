# WORKING-CONTEXT — Janus

Última atualização: 2026-07-28 (12h20) · v5.3.1 (DRE: Resumo Executivo + Decomposição dos Lançamentos por bloco — implementada, gates verdes, **migration 0209 escrita e revisada mas NÃO APLICADA**; PR draft)

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente).
> Atualizado como parte do out-briefing de TODA versão/patch (DoD). Manter curto:
> o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- Versão em produção (main): `5.3.0` (#193 mergeado 24/07)
- Versão em execução (worktree/branch ativa): `feat/v5-3-1-resumo-decomposicao` (PR draft).
  **Fecha a adaptação do modelo da controladoria.** Duas peças em `/financeiro/dre`:
  (1) **Resumo Executivo** — 6 linhas-chave × 6 colunas (2 anos cheios + Δ, 2 YTDs + Δ, **Δ em
  REAIS**) dentro do MESMO card, abaixo da tabela, **ancorado no ANO CORRENTE** (não acompanha a
  pill de ano — decisão do Yan, confirmada ao vivo); custo de rede ZERO (a página já buscava os 3
  anos e o Resumo reusa o MESMO `consolidadoAnos` do Consolidado).
  (2) **Decomposição dos Lançamentos** — o card da Composição adaptado a **barras horizontais
  agrupadas por BLOCO da estrutura viva** (não pelo grupo nativo do Monde), pills de período dentro
  do card, movido para a TopSection "Regime de Caixa" (a TopSection própria foi **aposentada**).
- **Gates: tsc 0 / lint limpo / 500 testes** (489 pré-existentes + 11 novos do helper) — **exceto
  os 3 casos novos de contrato**, que falham só por falta da migration (`PGRST202`).
- ⚠️ **MIGRATION 0209 NÃO APLICADA:** `npm run db:migrate` foi **bloqueado pelo classificador de
  permissões do harness**. Não foi contornado (`db push` cru ou `db query` puraria o backup-gate /
  criaria drift no histórico). **As cópias untracked 0950–0954 já estão POSICIONADAS** na worktree
  para o `--fora-de-ordem` funcionar. Passo-a-passo no §7.1 do out-briefing.
- Último ADR registrado: `0156` — **emendado** na v5.3.1 (raciocínio da troca de fonte da
  Decomposição: grupo nativo × bloco curado). **Nenhum ADR novo** (é refinamento).
- ⚠️ **Aditiva nova ainda precisa de `--aditiva --fora-de-ordem`** + cópias untracked das 0950–0954
  (v5.4.0/PR #191 ocupam o topo do remoto), **removidas antes do merge** — até a v5.4.0 renumerá-las.
- **Reconciliação PROVADA** (não afirmada): a agregação `tipo='realizado'` + `dre_categoria_map`
  fecha com as colunas da tabela em **delta 0,00 nos 18 blocos analíticos** (jan..jul/2026); a soma
  dos 18 (R$ 144.102,08) é exatamente o `REX` YTD que o Resumo exibe na tela. A igualdade virou
  **caso vivo em `rpc-contrato.test.ts`** (contra o mês fechado anterior, derivado de `hojeSP()` —
  não apodrece com o tempo).
- **Vercel (infra, standing):** deploy de repo privado de org exige plano Pro — pendência de billing
  do Yan, herdada da v5.2.0.

## Bloqueios vigentes

- **v5.3.1 — DOIS bloqueios, na ordem:**
  1. **Aplicar a 0209** (`npm run db:migrate -- --aditiva --fora-de-ordem`, da raiz da worktree),
     depois **verificar VIA REST com service_role** (introspecção por `db query` NÃO executa o corpo
     — foi assim que `max(uuid)` chegou a produção na v5.2.1), rodar
     `npx vitest run src/lib/rpc-contrato.test.ts` e **remover as cópias 0950–0954**.
  2. **Checkpoint do Yan:** Resumo contra a **planilha da controladoria** (contra a tabela já está
     conferido); trocar as pills da Decomposição conferindo a reconciliação das barras (só após 1);
     conferir rótulos — **3 dos 18 blocos vêm do seed em CAIXA ALTA** e são exibidos fiéis ao dado
     (title-case automático mangularia siglas/preposições); ajuste, se quiser, é **no editor da
     estrutura**, não em código. Decisões de produto abertas: centavos na barra (hoje reais, com o
     valor exato no `title`) e a posição do "Editar estrutura", que agora fica abaixo do Resumo.
  Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-3-1_Resumo_Decomposicao.md`.
- **Herdado da v5.3.0 (segue aberto):** conceder a área `financeiro/dre` às roles no editor de
  acessos; decisão dos **vencidos em aberto no Total do ano** (o dado já viaja por linha); e a
  **convenção do Δ% do Consolidado** — denominador em MÓDULO, então prejuízo→lucro lê como +118,2%
  (melhora) e não −118,2%; trocar = uma linha.
- **Faturamento roda em MODO TESTE** — o flip de produção (Asaas produção + `EMAIL_MODO=real`)
  é decisão do Yan, fora do código. A dupla trava do modo real está construída, não acionada.
- **Virada Monde APLICADA (v5.1.4):** as 7 funções PURA-mv leem o espelho Monde; cron `*/15` ATIVO.
  O upload de Excel é fallback dormente MAS ainda é a única fonte de: `get_mix_produto`/`get_cagr`
  (Performance) e as telas de Weddings (subsetor/pipeline/prejuízos). **NÃO parar o upload**
  (Scope B resolve — ver filas).
- **`SMTP_*` na Vercel** — sem eles, as notificações por e-mail degradam em silêncio.
- **% Rec no Cadastro de Metas** — alvos de %Rec nascem vazios; cards mostram "—" até o Yan digitar.
- Favicon/símbolo Janus adiado (reprovado no gate de legibilidade 16/32px).

## Filas ativas (próximos passos já decididos)

- **Fuso das pills de período (candidato REAL, achado na v5.3.1):** `resolverPeriodoCompleto`
  (`src/lib/periodo.ts`) **não ancora em `hojeSP()`** — recebe `new Date()` cru e resolve os presets
  com `date-fns` no fuso do processo. Se o runtime rodar em UTC, entre ~21h e a meia-noite de SP as
  pills "Este mês"/"Este ano" viram o mês/ano **antes da hora**. Mesma classe do fix sistêmico
  0152/ADR-0125, que cobriu só o lado do Postgres. Transversal (Fluxo de Caixa **e** DRE).
- **Limpeza de RPC órfã:** `get_decomposicao_grupo`/`get_decomposicao_categoria` ficaram sem
  consumidor vivo com a v5.3.1 (o card desta página era o único). DROP exige a verificação de
  consumidores reais de sempre — app **e** `supabase/seed/` (é onde a v4.17.1 se enganou).
- **v5.3.x refino da DRE:** vencidos no Total do ano; drag-and-drop no editor; guarda de saída para
  navegação por link; divisão ver/editar da permissão; mover `historico-alteracoes` para `shared/`.
  Achado registrado, não implementado (é produto): na visão Consolidado o CONJUNTO DE LINHAS vem do
  ano da URL — os valores é que vêm por ano marcado.
- **Renumeração das 0950–0954 (v5.4.0/PR #191)** + `migration repair` — no checklist de merge da
  v5.4.0; até lá, toda aditiva usa `--fora-de-ordem` + cópias untracked.
- **Monde — Scope B (APOSENTAR o upload manual de Vendas):** viável (item-level já no espelho);
  construir fato/mv item-level e repontar as 6 funções que leem `analytics.fato_venda` direto.
- **Saúde da sincronização Monde:** alerta ATIVO por e-mail; detectar falha SILENCIOSA (200 sem
  vendas).
- restore-test COMPLETO do backup-gate (follow-up ADR-0116).
- `CRON_SECRET` em comparação constant-time (BAIXO, v5.1.7).
- Casos de contrato pendentes de outras áreas: `solicitar_acesso_admin`, `monde_ingest_status`.
- Tokenização do `zinc` (follow-up v4.26) — e junto dela os **hex intermediários das paletas** da
  Decomposição (`#7E9658` etc.), que o lint não pega porque vão em `style={{}}`, não em classe.
- Consolidação das 3 pills de período (dívida opcional) — `PeriodoFilterPillsUrl` ainda hand-rola as
  classes em vez de usar `PILL_FILTRO` de `@/components/shared/botoes`.
- Metas por Vendedor — próxima capacidade planejada (escopo a confirmar).

## Cuidados desta fase (o que uma sessão nova precisa saber AGORA)

- **Hooks do harness ATIVOS** (protecao-config / gate-stop / contexto-sessao). Config de gate é
  bloqueada; `WT_PERMITIR_CONFIG=1` só após checkpoint. Escape geral: `WT_DESLIGAR_HOOKS=1`.
- **`.claude/settings.json` versionado tem só `hooks`** — o `model` do orquestrador não é fixado.
- **Protocolo de revisão:** `revisor` (sempre) e `revisor-db` (se migration/RPC) ANTES dos gates.
  Na v5.3.1 cada um pegou **um ALTO real**: o Resumo sumia no fail-safe da tabela apesar de ter
  fonte própria; e faltava o caso de contrato da RPC nova. O revisor também pegou uma **afirmação
  falsa** que o orquestrador havia escrito no header da migration.
- **RPC que já existe e aceita o parâmetro certo pode ter a SEMÂNTICA errada — MEÇA antes de reusar**
  (regra nova no CLAUDE.md, nascida desta versão). Quando dois números ficam lado a lado na mesma
  tela, a igualdade entre eles vira caso de contrato, não nota de rodapé.
- **A DRE tem DOIS recortes independentes na mesma seção:** o `?ano=` da tabela e o
  `?preset=&from=&to=` das pills da Decomposição. É de propósito (o card é autocontido).
- **Diário/undo é GENÉRICO** (`reverter_diario` lê `tabela_alvo`; allowlist = trigger anexado).
  Tabela editável nova: PK `id` + `CREATE TRIGGER ... fn_diario_alteracoes()` + wrappers de área
  própria (molde: `dre_estrutura_*`, 0206).
- **Estrutura da DRE é DADO** (`financeiro.dre_bloco`/`dre_categoria_map`): fórmulas por CHAVE,
  bandeja = dim sem map, excluída = estado explícito. **Atenção:** a Receita Bruta é `RB_H` com
  `tipo:'blocoH'`, NÃO `'tot'` — filtrar totalizadores por `t==='tot'` a deixa de fora; e `formula`
  (que distinguiria agregador de folha) **não viaja** no payload de `get_dre_mensal`.
- `monde.*` é a fonte viva das telas executivas/Metas; Weddings/mix/CAGR ainda vêm do upload.

---
Regra de manutenção: item resolvido SAI (não é log). Aprendizado permanente NÃO fica
aqui — vai para o CLAUDE.md pelo critério das três condições (permanente, transversal,
custou caro).
