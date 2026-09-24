# WORKING-CONTEXT — Janus

> **O que é este arquivo.** O estado **agora**: o que está em voo, o que está bloqueado, o que uma
> sessão nova precisa saber antes de tocar em qualquer coisa. O hook `contexto-sessao` o injeta no
> começo de toda sessão.
>
> **Regra de manutenção: item resolvido SAI.** Isto não é log. O histórico por versão vive no git e
> nos out-briefings de `docs/briefings/`; o aprendizado permanente vai para `CLAUDE.md` ou para uma
> skill, pela régua de 5 destinos. Como o sistema funciona é `docs/estado-do-projeto.md`; o que
> ficou para a v6 é `docs/backlog-v6.md`.

Última atualização: 2026-09-24.

---

## Em voo

**v6.0.0 — Fundação da ingestão**, na própria branch (`feat/v6-0-0-fundacao-ingestao`). A v5.12.0
entrou antes dela, como pedido: a v6 precisa mesclar a `main` — conflito só de texto (este
arquivo, a skill `banco-e-rpc`, changelogs e `package.json`); a v6 não toca `src/lib/monde/`.

**Produção na v5.12.0** (PR #275, mergeado 24/09 às 15:44; deploy Vercel no ar às 15:44).

> 🔴 **Pós-merge da v5.12.0 — dois atos, os dois do Yan:**
> 1. **Junho não se corrige sozinho.** A reconciliação noturna cobre os 3 últimos meses (jul–set);
>    junho precisa de UMA chamada, logado como admin (o deploy já está no ar):
>    `https://wt-janus.vercel.app/api/monde/ingest?mode=window&from=2026-06-01&to=2026-06-30`
> 2. **Conferir em 25/09**, depois da reconciliação das 03h, o Comparativo de Metas (Weddings):
>    "Meta de Assessorias" de jun · jul · ago · set deve mostrar **5 · 4 · 2 · 4**. Consulta de
>    conferência no out-briefing da v5.12.0, §5.

> 🔴 **Pendência do Yan, uma só, herdada da v5.11.0:** decidir se `PRIORIDADE_INICIAL`
> (`src/lib/auth/areas.ts`) passa a incluir as áreas da Estante. Hoje um colaborador cujo **único**
> acesso fosse `gestao-pessoas/estante` veria o item na sidebar mas cairia em `/sem-acesso` ao abrir
> `/`. O buraco é **pré-existente** — Inventário, Acervo e `solicitacoes/basico` têm o mesmo —, mas a
> Estante é o primeiro módulo com cara de "única área do colaborador comum". Mexer ali altera o
> redirect inicial de TODA a plataforma, por isso ficou para decisão, não para autonomia.

> 🔴 **Decisão aberta: ambiente de teste próprio.** O gatilho da skill `banco-e-rpc` §6 foi
> **tocado** na v5.11.0 — são agora **quatro** arquivos de teste que escrevem em produção (três em
> transação revertida + a exceção commitada da API externa). O caso novo reforça o argumento a
> favor do ambiente próprio em vez de enfraquecê-lo: as travas de permissão da Estante só são
> testáveis por conexão direta assumindo identidade JWT, porque o `service_role` faz bypass do
> `exigir_acesso`. Um ambiente com usuários controlados resolveria sem tocar produção.

> **A role `verificador` foi adiada para a v6** por bloqueio operacional. (Ela chegou a ser
> planejada como v5.11.0 — há um `docs/briefings/briefing-v5-11-0-role-verificador.md` **untracked
> na raiz** com esse nome; o número v5.11.0 foi para a Estante Welcome, então aquele briefing está
> com nome defasado e precisa ser renumerado quando for retomado.) O risco
> de varredura de produção com `service_role` fica **aceito por decisão do Yan** até lá — o item
> segue em `docs/backlog-v6.md`. O que **não** dependia da role já foi feito na v5.10.3: o script de
> varredura com a chave de serviço saiu do repositório, a conexão direta de leitura trava em
> `READ ONLY` e a sonda mantém o inventário de `SUPABASE_DB_URL` fechado, por conexão.

**O `npm audit` do repositório está em ZERO vulnerabilidades** — as três últimas versões foram
patches de segurança encadeados: v5.9.7 (`next`), v5.10.1 (`vitest`/`esbuild`) e v5.10.2
(`nodemailer`). Não há dívida de CVE aberta.

---

## Verdade atual

| | |
|---|---|
| Produção | **v5.11.0** (PR #273, mergeado 15/09 às 12:55) |
| Última migration aplicada | **0272** · próxima livre: **0273** |
| Último ADR | **0174** (aceito) · próximo livre: **0175** |
| Suíte | **1.247 testes**, 76 arquivos, ~78 s no `vitest` 5, zero `skip` silencioso |

A v5 está encerrada: auditada, triada e limpa. O que ficou para a v6 está em `docs/backlog-v6.md` (30 itens); como o sistema funciona, em `docs/estado-do-projeto.md`.

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

> **Fechado na v5.10.0, não reabrir** (detalhe no out-briefing
> `docs/briefings/WT_Finance_Out_Briefing_v5-10-0_Limpeza_Fechamento_V5.md`): os **atos humanos 1 e
> 2** — a terceira camada de permissões existe e está no repositório (9 `deny` no settings global,
> 23 `allow` + o hook `protecao-git-add` no do projeto, bateria de 31 casos) · o
> `.claude/settings.json` da raiz, que estava com **JSON inválido desde 28/07** · as **conferências
> visuais** represadas da v5.3.x à v5.9.5 · as duas **comunicações à liderança** (critério da DRE de
> 19/08 e o tripwire da v5.4.5).
>
> **Ato 3 (E5): nada a aplicar** — `superpowers@superpowers-marketplace` 5.1.0 já está `✘ disabled`
> e não carrega desde 28/07. O custo always-on é de ~688 tokens; o que dói é o disparo em bloco
> (~50 mil somando as 14 skills), e isso é **mandato do plugin**, não duplicação. Vira **decisão de
> custo** sua: medir numa sessão nova e, se o bloco disparar, pagar ou
> `claude plugin disable superpowers@claude-plugins-official`. **Não remova a marketplace** — o
> `episodic-memory` vem dela e está habilitado. Enquanto a decisão não sai,
> `docs/harness/sonda-disparo.md` fica.

**Lição que vale guardar:** config só vale depois de `JSON.parse` **mais** exercício ao vivo. Um
settings que não parseia não avisa — ele simplesmente não vale, e leva junto os hooks declarados
nele. Foi o que aconteceu na raiz por seis semanas.

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

🔴 **O checkout raiz continua atrasado — precisa de `git pull --ff-only`, agora até a v5.10.3
(`main@ec112be`).** Não dá para fazer daqui: a sessão é isolada na worktree e o harness recusa
`git -C` apontando para o checkout compartilhado (protocolo D5 — não se contorna). Comandos prontos,
para rodar **da raiz**:

```bash
cd /home/yan-wt/projects/wt-finance
git pull --ff-only
git worktree remove .claude/worktrees/feat-v5-10-3-role-verificador --force
git worktree prune
git branch -d feat/v5-10-3-role-verificador
```

⚠️ Se o `pull` abortar por colisão de untracked em `docs/briefings/briefing-v5-10-3-*.md`, é o
modo de falha conhecido (o briefing untracked da raiz virou rastreado no merge): conferir que são
idênticos com `git show origin/main:<caminho> | diff - <caminho>`, **mover** para fora do repo — e
só então puxar. Nunca `reset`.

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
- ✅ **A terceira camada está ATIVA desde 13/09** (v5.10.0): 9 `deny` no `~/.claude/settings.json`
  global (incluindo `supabase db push` cru, que fura o backup-gate) e 23 `allow` + os hooks no
  `.claude/settings.json` do projeto, que é **versionado** — e por isso vale em toda worktree, ao
  contrário do `settings.local.json`, que é git-ignored e por diretório (foi essa diferença que
  negou dois comandos legítimos em 10/09). `deny` vence `allow` em qualquer nível, e hook
  `PreToolUse` roda **antes** do fluxo de permissão. Bloqueio inesperado → **protocolo D5**.
- **Hooks ativos:** `protecao-config` (6 alvos, incluindo o settings global), **`protecao-git-add`**
  (stage cego), `gate-stop`, `contexto-sessao`.
