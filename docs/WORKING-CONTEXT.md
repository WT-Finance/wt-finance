# WORKING-CONTEXT — Janus

> **O que é este arquivo.** O estado **agora**: o que está em voo, o que está bloqueado, o que uma
> sessão nova precisa saber antes de tocar em qualquer coisa. O hook `contexto-sessao` o injeta no
> começo de toda sessão.
>
> **Regra de manutenção: item resolvido SAI.** Isto não é log. O histórico por versão vive no git e
> nos out-briefings de `docs/briefings/`; o aprendizado permanente vai para `CLAUDE.md` ou para uma
> skill, pela régua de 5 destinos. Como o sistema funciona é `docs/estado-do-projeto.md`; o que
> ficou para a v6 é `docs/backlog-v6.md`.

Última atualização: 2026-09-10.

---

## Em voo

**v5.10.0 — Limpeza de fechamento da v5.** Branch `chore/v5-10-0-limpeza-fechamento-v5`, worktree
`.claude/worktrees/chore+v5-10-0-limpeza-fechamento-v5`. Briefing:
`docs/briefings/briefing-v5-10-0-limpeza-fechamento-v5.md`. Spec da execução:
`docs/auditoria-v5/relatorio-triado.md` — **só item marcado `agir agora` é escopo**.

Blocos 1 a 5 entregues e **mergeados no PR 1**; a migration aditiva **0269** e a destrutiva
**0270** estão aplicadas em produção. Em curso: o **Bloco 6 (documentação)** e, depois dele, o
fechamento (bump, CHANGELOG, ADR-0173, PR 2).

**Próximo passo:** concluir o Bloco 6, rodar os gates completos e abrir o PR 2.

---

## Verdade atual

| | |
|---|---|
| Produção | **v5.9.7** (patch de segurança do `next` 16.3.4) |
| Última migration aplicada | **0270** · próxima livre: **0271** |
| Último ADR | **0173** (em rascunho nesta versão) · próximo livre: **0174** |
| Suíte | **1.220 testes**, 74 arquivos, zero `skip` silencioso |

Frente única: nenhuma outra branch de feature enquanto a v5.10.0 corre.

---

## ⚠️ Incidente aberto — 306.261 linhas a repovoar

Em 10/09/2026 uma varredura REST minha chamou todas as RPCs sem argumento obrigatório para
conferir quais devolviam 500. Entre elas havia funções de **TRUNCATE**, e produção foi zerada em
10 tabelas: `raw.lancamentos_movimentacao` (92.506), `analytics.fato_venda_item` (48.147),
`raw.vendas_excel` (48.147), `analytics.fato_lancamento_operacao` (41.091),
`raw.titulos_em_aberto` (36.756), `analytics.fato_venda` (29.106), `analytics.dim_pagante`
(7.033), `raw.demonstrativo_competencia` (3.294), `analytics.dim_produto` (117),
`analytics.dim_vendedor` (64).

O backup está íntegro e o script de restore está pronto e **não executado**
(`supabase/patches/RESTORE-incidente-varredura-rest.mjs`, backup `2026-09-10-pre-migration-221044`).
Decisão do Yan: **repovoar pelo upload manual**, não pelo restore.

> 🔴 **Ordem obrigatória do repovoamento: Lançamentos por Operação PRIMEIRO.** As 238 linhas
> sobreviventes de `analytics.dim_operacao_weddings` são regeneradas a partir da tabela de fatos;
> subir qualquer outra base antes faz a regeneração rodar contra fato vazio e apagá-las.

**A lição, já promovida à skill `banco-e-rpc`:** num banco onde a RPC é a superfície de escrita,
disparar uma função sem saber o que ela faz é executar comando arbitrário — não é leitura. O corpo
de todas elas estava no catálogo que eu mesmo havia exportado.

---

## Pendências do Yan

**Atos humanos com diff pronto** (`docs/auditoria-v5/atos-humanos/`, o agente não alcança):
1. `settings.json` do projeto — o `deny` de `npx supabase db push` cru (hoje ele passa **por fora**
   do backup-gate e aplica todo o pending, inclusive destrutiva estacionada) e os `allow` estreitos
   dos gates.
2. Hook `PreToolUse` contra `git add -A` / `-a` (com 22 casos de teste escritos).
3. Desativar o plugin **`superpowers` duplicado** (global v6.2.0 + cópia do projeto v5.1.0): hoje
   toda sessão invoca as skills em bloco, com custo de contexto. Enquanto não resolvido,
   `docs/harness/sonda-disparo.md` fica no repositório (é a medição do sintoma).

> **Fechado em 10/09 pelo Yan:** as conferências visuais represadas da v5.3.x à v5.9.5 (anexar em
> "Outros", aprovar solicitação, Tab nos gatilhos de ajuda, cabeçalhos das ~25 telas, desfazer real
> nos três editores) e as comunicações à liderança — a mudança de critério da DRE de 19/08 e o
> tripwire da v5.4.5 para 2026-08. Saíram da fila; não reabrir por leitura de out-briefing antigo.

**Decisões abertas:**
- Commit órfão `b869bb9` (relatório delta DRE×Monde + errata), só em
  `origin/docs/investigacao-dre-competencia-monde`: PR próprio ou descarte?
- Conceder a área `financeiro/dre` às roles no editor de acessos — sem isso, só admin vê a aba.
- Conferir o Resumo Executivo contra a planilha da controladoria.
- Licença da **Avenir LT Std**: os 5 `.otf` são baixáveis por visitante anônimo desde a isenção do
  matcher. Não é falha de auth (fonte de página pública sempre é alcançável) — é conferir os termos
  da licença comercial (ADR-0039). Limitar exige subsetting/`woff2`, não voltar a quebrar a fonte no
  login.
- Produto, na DRE: centavos na barra; 3 blocos do seed em CAIXA ALTA (ajuste é no editor da
  estrutura, não em código); vencidos em aberto no Total do ano; convenção do Δ% do Consolidado.
- **Faturamento roda em MODO TESTE.** O flip para produção é decisão sua (dupla trava construída).
- Metas por Vendedor — próxima capacidade planejada, escopo a confirmar.
- **% Rec no Cadastro de Metas:** alvos nascem vazios e os cards mostram "—" até serem digitados.

**Higiene de repositório — PODADA em 10/09** (autorizada pelo Yan): saíram **120 branches remotas**
e **33 locais**, todas já mergeadas no `main`; remoto foi de 137 para 17 refs, local de 41 para 8.
Removidas também as worktrees `docs+pos-merge-v5-9-6` e `fix+v5-9-7-next-cve` (zero commits fora do
`main`). Nenhum commit se perdeu: tudo o que saiu já estava no `main`.

O que **sobrou de propósito** e por quê:

| ref | por que ficou |
|---|---|
| `docs/investigacao-dre-competencia-monde` | guarda o commit órfão `b869bb9` — **decisão sua**: PR próprio ou descarte |
| `docs/pauta-provedor-monde` | pauta a levar ao provedor do Monde; desbloqueia o Scope B |
| `feat/v5-4-4-metas-subsetor-weddings` | é o PR #213, fechado no Bloco 5. A **worktree local ficou**: tem 16 commits fora do `main`, e a regra da casa é não remover worktree com trabalho não-mergeado. As RPCs que ela chamava já não existem (0270), então a branch não aplica — mas a decisão de descartá-la é sua |
| `fix/v5-4-4-agendamento-pos-merge`, `fix/upload-lancamentos-vercel-limit`, `fix/kpi-color-dropdown-label` | não-mergeadas; conferir se têm algo vivo antes de apagar |
| `test/rebrand-janus-sidebar` | superada pela v4.40.0, mas não-mergeada — descarte é decisão sua |
| `feat/v3-5-m1/m2/m3`, `feature/v3-4-6`, `feat/v4-2`, `revert/v4-auth-para-v3-3` | de maio, era v3/v4; candidatas óbvias a descarte |
| `vercel/install-vercel-speed-insights-9x2sex`, `worktree-docs+investigacao-coercao-milhar` | resíduo de bot e de nomenclatura antiga |

🔴 **O checkout raiz continua em `main@885da65`, duas versões atrás — precisa de `git pull
--ff-only`** (não dá para fazer daqui: esta sessão é isolada na worktree).

---

## Bloqueios vigentes

- **Validação do `allow` em sessão CLI interativa** (residual da v5.3.2): confirmar que
  `npm run lint` e `db:migrate -- --aditiva` passam sem consulta ao classificador na primeira
  sessão interativa. A validação headless já foi exercitada.
- **Sem CI.** Os gates são disciplina local (item B-16 do backlog v6).
- **Dependabot:** 7 alertas no branch default (1 high, 5 moderate, 1 low) — triagem pendente. A
  rotina está declarada em `docs/estado-do-projeto.md` §10.

---

## Dívidas técnicas conhecidas (fora do backlog v6)

- **`financeiro.dre_comp_map` está órfã de leitura** desde a `0260`: o de-para vivo é
  `dre_comp_par`. Não foi removida porque `DROP` é destrutivo, e ela ainda é fonte do seed inicial
  e alvo do teste de paridade contra os anexos. Removê-la numa destrutiva futura.
- **`resolverPeriodoCompleto`** (`src/lib/periodo.ts`) não ancora em `hojeSP()`: com runtime em UTC,
  "Este mês/ano" vira antes da hora (~21h SP). Transversal — Fluxo de Caixa e DRE.
- **`financeiro/posicao-projetado.tsx`** pode migrar para o primitivo
  `components/shared/slider-horizonte.tsx` (extraído na v5.4.2 com a mesma geometria). Hoje são
  duas cópias; migração incremental, quando a tela for tocada.
- Consolidação das 3 pills de período (`PeriodoFilterPillsUrl` → `PILL_FILTRO`).
- Casos de contrato faltando: `solicitar_acesso_admin`, `monde_ingest_status`.
- Restore-test **completo** do backup-gate (follow-up do ADR-0116) · `CRON_SECRET` constant-time.
- **Saúde da sincronização do Monde:** o tripwire mensal da v5.4.4 pega espelho divergindo da API,
  mas **mês fora da janela de 3 meses da reconciliação continua descoberto**.

---

## Scope B (aposentar o upload de Vendas) — leia os dois relatórios

Está inteiro no backlog v6 (**B-25/26/27**), mas o resumo evita redescobrir:

- `docs/investigacoes/2026-08-04-scope-b-item-level-e-pessoas.md` — item-level **é** repontável (a
  premissa do "subconjunto do Excel" foi refutada: a regra é `status='active'`, e espelho ≡
  raw-ativo em 28.450/28.450 vendas ao centavo). **Duas exceções:** `get_prejuizos` não tem paridade
  (a receita por item do espelho é *alocação* do `total_revenue`, então perda dentro de venda
  lucrativa some) e `get_pipeline_weddings` precisa de um de-para `operation_id → nome` que a API só
  cobre em 17%. **Pessoas não troca de fonte:** `people` expõe 5 dos 17 campos e nenhum de
  endereço/fiscal.
- `docs/investigacoes/2026-08-04-metas-subsetor-e-de-para-monde.md` §4 — o de-para de produto
  **medido**: repontar hoje casaria só 46% do faturamento de Weddings; 4 regras de `kind` cobrem
  57%, e a curadoria real são ~22 descrições.

⚠️ **Os dois números parecem discordar e não discordam — medem coisas diferentes.** Os 46%/57% são
cobertura por `product_kind` **sozinho**, e por kind só se resolvem os 5 tipos que mapeiam 1:1 — em
Weddings, `others` concentra R$ 23,9 Mi (~42%) e o kind não diz qual categoria é. O `CASE` do outro
relatório usa **kind + descrição**, e para `others`/`operations` a descrição **já é** a categoria do
Excel, casando item a item em 9.419 pares. Quem for repontar precisa das duas pernas.

**Desbloqueio:** pedir **receita por produto** ao provedor do Monde.

**Enquanto isso: NÃO parar o upload.** `monde.*` é a fonte viva das telas executivas e de Metas,
mas Weddings, `get_mix_produto` e `get_cagr` ainda vêm do upload.

---

## Cuidados que uma sessão nova precisa saber AGORA

- **Verificação visual em background: use o MCP do Chrome (`claude-in-chrome`), não o
  `verificador-visual`.** O MCP do Playwright **não sobe** em sessão de background/headless — o
  agente volta com "NÃO VERIFICADO" por falta das ferramentas `browser_*`, e não fabricar é o
  comportamento certo dele. O caminho provado (estreou na v5.5.0 e pegou 2 defeitos que
  tsc/lint/build/744 testes deixaram passar, um deles só visível no hover): o orquestrador sobe o
  `next dev`, abre `localhost:3000` no Chrome real e navega, faz zoom, arrasta slider e passa o
  mouse. **Limite duro: o agente não faz login** — a sessão tem de já existir no Chrome. Em sessão
  interativa, preferir o agente `verificador-visual`.
- **`revisor` sempre, `revisor-db` se houver migration ou RPC**, antes dos gates de fechamento.
  Não é formalidade: cada um já pegou um ALTO real.
- **RPC que já existe pode ter a semântica errada — MEÇA antes de reusar.** Dois números lado a
  lado na mesma tela são um caso de contrato.
- **`src/types/database.ts` é GERADO** (ADR-0173). RPC nova ou alterada ⇒ regenerar e commitar
  junto do bump. Não crie helper de tipagem frouxa novo; os que existem são legado vivo.
- **A DRE tem dois recortes independentes na mesma seção** (o `?ano=` da tabela e as pills da
  Decomposição) — é de propósito. **A estrutura da DRE é DADO** (`dre_bloco`/`dre_categoria_map`;
  Receita Bruta é `RB_H`/`tipo:'blocoH'`, não `'tot'`), e o diário/undo é genérico (molde
  `dre_estrutura_*`, migration 0206).
- **Terceira camada configurada:** o settings global tem `allow` estreito e `deny` do `db push`
  cru. Bloqueio inesperado → **protocolo D5** (5 passos, no core). **Hooks ativos:**
  `protecao-config` (6 alvos, incluindo o settings global), `gate-stop`, `contexto-sessao`.
