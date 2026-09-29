# WORKING-CONTEXT — Janus

> **O que é este arquivo.** O estado **agora**: o que está em voo, o que está bloqueado, o que uma
> sessão nova precisa saber antes de tocar em qualquer coisa. O hook `contexto-sessao` o injeta no
> começo de toda sessão.
>
> **Regra de manutenção: item resolvido SAI.** Isto não é log. O histórico por versão vive no git e
> nos out-briefings de `docs/briefings/`; o aprendizado permanente vai para `CLAUDE.md` ou para uma
> skill, pela régua de 5 destinos. Como o sistema funciona é `docs/estado-do-projeto.md`; o que
> ficou para a v6 é `docs/backlog-v6.md`.

Última atualização: 2026-09-29 (v6.1.0 fechada — PR aguardando merge; 0287/0288 já aplicadas).

---

## Aguardando merge — v6.1.0 "Entrega das RPAs" (PR #283, branch `feat/v6-1-0-entrega-rpa`)

Out-briefing `docs/briefings/WT_Finance_Out_Briefing_v6-1-0_Entrega_RPA.md`; ADR-0179. Cliente de entrega
`scripts/rpa/entregar-ingestao.ps1` (PAD chama com uma linha), quatro chaves por RPA (`rpa-vendas` 265,
`rpa-lancamentos` 266, `rpa-operacao` 267, `rpa-demonstrativo` 268 — runbook `docs/runbooks/chaves-rpa-runbook.md`),
errata 4 do contrato. **Migrations 0287 e 0288 JÁ APLICADAS** (aditivas, compatíveis com o código v6.0.1).
**GATE etapa 1 feito em 29/09:** as cinco bases aplicadas pelo robô (`rpa-pad`, chave certa, checksums
fechando) e a chave de Operação recusada em Vendas (403).

> 🔴 **Yan — depois do merge: GATE etapa 2** — uma carga de Operação pela RPA com `-Log` (conferência e depois
> `-Aplicar`), para ver `diff.puladas` e o conjunto de operações ao vivo; a sessão confere `ingestao.carga` e
> vê negando em produção a origem amarrada e o 403 da API de Solicitações.

> 🔴 **Yan — conferir com a gerente a mudança de 2025 no Demonstrativo** (alarme `ano_fechado_alterado` de
> 29/09 17:28 UTC): mesmas 1.248 linhas, Σ de R$ 470.395,76 para R$ 469.600,56 (−R$ 795,20) — lançamento de
> competência 2025 que mudou no Monde.

> ℹ️ As 201 linhas da Darlene e Adnan já saíram da produção (carga de 29/09 pelo card já foi o CSV da RPA).

---

## Em produção — v6.0.1 "Seeds no caminho único + destrutiva do legado" (PR #281, mergeado 28/09 às 12:40)

Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v6-0-1_Seeds_Destrutiva.md`. O `npm run seed` é
cliente do contrato de ingestão v1 (default CONFERÊNCIA; `--aplicar` substitui a base em produção) e a
destrutiva **0286** (aplicada pelo Yan em TTY em 28/09, antes do merge) apagou as 12 funções do caminho
legado e `audit.ingestao_log`. Banco e `main` voltaram a concordar. **Não verificado:** `npm run seed --
--aplicar` nunca rodou ponta a ponta — a 1ª execução real é do Yan e dispara os alarmes de carga.

> 🔴 **Yan — uma fixture do oráculo se perdeu: `demonstrativo-cru.xlsx` de 21/09.** `tests/fixtures/ingestao/`
> é gitignorado (Vendas cru tem CPF/CNPJ) e só existia na worktree da v6.0.0, removida no pós-merge. Em
> 28/09 a sessão recompôs 11 das 13 conferindo o sha256 do manifesto: os crus de Vendas, Movimentação,
> Aberto e Operação vieram do bucket `ingestao-cru` (cargas da M9, 25/09) e os tratados, das pastas do
> Windows. Faltam o **Demonstrativo cru** (o export de 21/09 foi sobrescrito e não foi carregado pelo
> card) e a `Lista de Operações.csv` (auxiliar; sem ela 6 casos do oráculo de Operação ficam `skipped`).
> Efeito: `oraculo-demonstrativo.test.ts` falha com ENOENT — o `describe.skipIf(AUSENTES…)` não protege,
> porque o corpo do `describe` lê o arquivo na coleta. Saídas: achar o anexo de 21/09 (e-mail, OneDrive)
> e rodar `JANUS_ANEXOS_DIRS=… node scripts/ingestao/fixtures.mjs`, ou decidir trocar o manifesto do
> Demonstrativo para o export de 28/09 (o que está em produção hoje).
> **As 11 recompostas estão salvas FORA do repo** em `~/projects/arquivo-worktrees-janus/fixtures-ingestao/`
> (sha256 conferido contra o manifesto em 28/09). Numa worktree nova:
> `JANUS_ANEXOS_DIRS=~/projects/arquivo-worktrees-janus/fixtures-ingestao node scripts/ingestao/fixtures.mjs`
> — funciona a partir da v6.1.0, quando o script passou a achar também pelo nome canônico. Antes dela, a
> instrução falhava ("13 faltando"): o script só procurava pelo nome de origem do export.

---

## v6.0.0 "Fundação da ingestão" (PR #279, mergeado 28/09 às 09:43) — o que ela deixou em aberto

Tudo o que a versão fez, provou e decidiu: out-briefing
`docs/briefings/WT_Finance_Out_Briefing_v6-0-0_Fundacao_Ingestao.md` e anexos `docs/briefings/anexo-v6-0-0-*.md`.
Deploy conferido em 28/09: `/api/ingestao/{vigia,retencao}` respondem 401 sem credencial,
`/api/ingestao/{base}/upload-url` responde 405 a GET, `/admin/ingestao` pede login. O log de execução já
grava em produção (1ª execução `ok` do `monde-incremental` às 12:45 UTC, dois minutos depois do merge).

**Pós-merge feito em 28/09:**
- ✅ Cron **`ingestao-vigia` LIGADO** (`ingestao_vigia_definir(true)` → HTTP 200; `cron.job.active = true`).
- ✅ Expectativa **`monde-incremental` LIGADA** (tinha execução OK; tolerância 45 min).
- ✅ **1ª rodada do vigia em produção: 28/09 13:00:03 UTC, `ok`**, 288 ms, 9 expectativas avaliadas, zero
  alarme; `pg_cron` = `succeeded`. Prova ponta a ponta de que o cron chama a rota e grava resultado.
- ✅ Expectativa **`ingestao-vigia` LIGADA** logo depois (quem vigia o vigia; tolerância 45 min).
- ✅ Limpeza do cru **simulada em produção**: 0 expirados, 0 órfãos (as cópias órfãs de 24/09 só vencem os
  7 dias em 01/10). O cron `ingestao-retencao` **segue DESLIGADO** — ligar é decisão do Yan (apaga arquivo).
- ✅ Baseline de schema regenerado (única diferença: `cron.ingestao-vigia.active false → true`).
- ✅ Data do changelog da diretoria reconciliada ao merge real (28/09 09:43).

> 🔴 **Pós-merge da v6.0.0 — o que falta, e de quem:**
> 1. ✅ Worktree da v6.0.0 removida (conferido em 28/09).
> 2. **Yan — confirmar `SUPABASE_INGESTOR_SENHA` no ambiente Production da Vercel.** Sem ela a carga
>    LANÇA por desenho (fail-closed). A sessão não consegue ler as envs (403).
> 3. ✅ Aberto e Operação recarregados no mesmo dia pelo card (28/09 13:46 e 13:50 UTC), junto das outras três bases.
> 4. **Sessão, depois da 1ª execução OK de cada um:** ligar as expectativas `monde-reconciliacao` (roda
>    06:05 UTC — a partir de 29/09) e `cdi-mensal` (dia 3 — a partir de 03/10), com
>    `ingestao_expectativa_definir('<processo>', true)`. As das bases, só quando a RPA existir.
> 5. **Yan decide — ligar a limpeza do cru** (`SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE
>    jobname = 'ingestao-retencao'), active := true);`, como `postgres`). A partir de 01/10 ela apaga as
>    cópias órfãs e, a partir de 25/12, os crus de mais de 3 meses. Depois de ligar: `npm run db:baseline`.
> 6. ✅ v6.0.1 aberta — ver "Em voo" acima. (O out-briefing da v6.0.0 dizia que `truncate_dynamic_tables`
>    ficaria fora por causa do seed; o seed migrou na própria v6.0.1, e ela entra na 0286.)

> 🔴 **Decisões e conversas do Yan que a v6.0.0 deixou** (detalhe no out-briefing §12; backlog B-31 a B-36):
> cartas de crédito com vencimento 2049 (convenção de "sem prazo"? — com a gerente) · pipeline de
> Weddings órfão (`venda_n` agora preenchido daria R$ 49,1 Mi) · os dois avisos do cruzamento de Operação
> (1 × 86) · guarda de data de Vendas ainda cobra Welcome · idempotência por chave com `carga_id` novo ·
> aposentar/portar Pessoas (fecha o invariante 3) · pedido 8.2 ao fornecedor do Monde · comunicar à
> liderança a cadência diária e a reapresentação de histórico · o `<select id>` da página de operações ·
> os 571 lançamentos em duas operações e os "Reembolsos" divergentes, com a gerente.

> 🔴 **Pós-merge da v5.12.0 — falta um ato do Yan:**
> 1. ✅ **Junho reprocessado em 24/09** (janela manual: 670 lidas · 652 atualizadas · 0 erros).
>    Conferido no banco: **5 contratos**, 178/178 itens com hash `#t2`.
> 2. **Conferir em 25/09**, depois da reconciliação das 03h (que cobre jul–set), o Comparativo de Metas (Weddings):
>    "Meta de Assessorias" de jun · jul · ago · set deve mostrar **5 · 4 · 2 · 4**. Consulta de
>    conferência no out-briefing da v5.12.0, §5.

> 🔴 **Pendência do Yan, uma só, herdada da v5.11.0:** decidir se `PRIORIDADE_INICIAL`
> (`src/lib/auth/areas.ts`) passa a incluir as áreas da Estante. Hoje um colaborador cujo **único**
> acesso fosse `gestao-pessoas/estante` veria o item na sidebar mas cairia em `/sem-acesso` ao abrir
> `/`. O buraco é **pré-existente** — Inventário, Acervo e `solicitacoes/basico` têm o mesmo —, mas a
> Estante é o primeiro módulo com cara de "única área do colaborador comum". Mexer ali altera o
> redirect inicial de TODA a plataforma, por isso ficou para decisão, não para autonomia.

> 🔴 **Decisão aberta: ambiente de teste próprio.** O gatilho da skill `banco-e-rpc` §6 foi
> **tocado** na v5.11.0 — são agora **cinco** arquivos de teste que escrevem em produção (quatro em
> transação revertida — o último, `promover-carga-checksum.test.ts`, da v6.0.0/M5 — + a exceção commitada da API externa). O caso novo reforça o argumento a
> favor do ambiente próprio em vez de enfraquecê-lo: as travas de permissão da Estante só são
> testáveis por conexão direta assumindo identidade JWT, porque o `service_role` faz bypass do
> `exigir_acesso`. Um ambiente com usuários controlados resolveria sem tocar produção.

**O `npm audit` do repositório está em ZERO vulnerabilidades** — as três últimas versões foram
patches de segurança encadeados: v5.9.7 (`next`), v5.10.1 (`vitest`/`esbuild`) e v5.10.2
(`nodemailer`). Não há dívida de CVE aberta.

---

## Verdade atual

| | |
|---|---|
| Produção | **v6.0.1** (PR #281, mergeado 28/09 às 12:40) · banco na **0288** (v6.1.0 aplicada antes do merge) |
| Última migration aplicada | **0288** (v6.1.0 — o "antes" do diff de Operação dentro da promoção) · próxima livre: **0289** |
| Último ADR | **0179** (v6.1.0 — cliente de entrega das RPAs e operações puladas) · próximo livre: **0180** |
| Suíte | **1.804 verdes + 6 skipped**, 104 arquivos; 1 falha por fixture ausente (`oraculo-demonstrativo`, B-38) — fechamento da v6.1.0, 29/09 |

A v5 está encerrada: auditada, triada e limpa. O que ficou para a v6 está em `docs/backlog-v6.md` (30 itens); como o sistema funciona, em `docs/estado-do-projeto.md`.

---

## ✅ Incidente de 10/09 (306.261 linhas zeradas) — encerrado

As dez tabelas foram repovoadas pelo upload manual em 21/09 (decisão do Yan: não pelo restore) e as
cinco cargas da v6.0.0 em 25/09 confirmaram as contagens. A lição está na skill `banco-e-rpc`: num
banco em que a RPC é a superfície de escrita, disparar uma função sem saber o que ela faz é executar
comando arbitrário. O script de restore não executado segue em `supabase/patches/` como referência.

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
