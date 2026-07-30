# WORKING-CONTEXT — Janus

Última atualização: 2026-07-30 · v5.4.0 (API Externa de Solicitações) — PR #191 reconciliado com a v5.3.4 e PRONTO para o merge do Yan

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente; se o hook
> faltar, ler manualmente). Atualizado como parte do out-briefing de TODA versão/patch (DoD).
> Manter curto: o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- Versão em produção (main): **`5.3.4`** (#201 mergeado 30/07 às 12h46) — bug relatado em produção: os e-mails de
  notificação das Solicitações chegavam de forma **intermitente**. Causa-raiz **provada** por log de
  produção (`3/5 enviados`): o fan-out fazia `Promise.allSettled` sobre TODOS os destinatários com
  transporter **sem pool** = uma conexão SMTP por destinatário ao mesmo tempo, e o **Office 365
  recusa acima de 3 simultâneas por mailbox** (`432 4.3.2`). Quem ficava sem e-mail variava a cada
  disparo. Corrigido com `enviarFanOut` compartilhado (concorrência ≤ **`MAX_CONEXOES_SMTP` = 2**,
  abaixo de 3 de propósito) + retry só de falha **transitória** (nunca 5xx nem `EAUTH`). O `catch {}`
  **mudo** de `notificarMovimentacao` passou a logar — foi o silêncio que atrasou o diagnóstico.
  Guard novo mede o **pico de envios simultâneos** e foi visto **reprovando** o código antigo.
  Skill `email` corrigida (a orientação antiga, "`allSettled` em paralelo", **induzia ao bug**).
  Sem migration, sem UI. 541 testes. Out-briefing:
  `docs/briefings/WT_Finance_Out_Briefing_v5-3-4_Email_Intermitente.md`. Worktree e branch já
  limpas (`/pos-merge` executado).
  **Pós-merge:** o Yan relatou que "parece estar funcionando" (30/07, pouco depois do merge) — o
  sintoma cessou. A prova DURA segue valendo quando houver oportunidade: uma movimentação com role
  de 5+ membros e o log mostrando `5/5` (ou nenhuma linha de falha). **Ainda aberto:** o limite de
  **30 msgs/min** do Office 365 — role com 30+ membros ativos encosta nele, e a saída seria de
  PRODUTO (um e-mail com todos em cópia em vez de N), decisão do Yan.
- A v5.3.3 (#199 mergeado 28/07 às 17h18) foi o patch de Rota C que
  isentou `fonts/` no matcher do `src/proxy.ts` (por PREFIXO de diretório, nunca por extensão — a
  lição S11): as telas SEM sessão voltaram a renderizar Avenir, onde o proxy respondia `307`/HTML
  do login no lugar do `.otf` e o browser caía em fonte de sistema. **As telas afetadas eram 3:
  `/login`, `/solicitar-acesso`, `/auth/confirm`** — `/trocar-senha` exige sessão e nunca esteve no
  escopo (o registro da v5.3.2 supunha que estava). Guard mecânico novo em `src/proxy.test.ts`
  (32 casos) fixa as duas bordas do matcher; 525 testes. Out-briefing:
  `docs/briefings/WT_Finance_Out_Briefing_v5-3-3_Fontes_Avenir.md`. Worktree e branch já limpas
  (`/pos-merge` executado).
- **O HARNESS NOVO REGE desde a v5.3.2** (#197 mergeado 28/07 às 16h26) — a v5.3.3 foi o primeiro
  patch nativo dele e o ritual ganhou a rota C (ADR-0157, sem migrations, nada muda nas telas): CLAUDE.md **518 → 162
  linhas** (core) + **9 skills internas** + **3 rituais** (`/nova-versao`, `/fechamento-versao`,
  `/pos-merge`) + agentes com "Skills a ler" + **`verificador-visual`** (MCP Playwright em
  `.mcp.json`) + 2 skills externas vendoradas + permissões da terceira camada APLICADAS pelo Yan
  no settings global. Provas: inventário sem órfãos (`docs/harness/inventario-claude-md.md`),
  sonda de disparo (`docs/harness/sonda-disparo.md`), baseline −45,6% na porção do projeto.
  Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-3-2_Reformulacao_Harness.md` (a seção
  "o que muda para a próxima sessão" é leitura obrigatória da 1ª sessão nativa). Nenhuma versão em
  curso: as worktrees da v5.3.2 e da v5.3.3 já foram limpas; a única branch de versão viva é a da
  **v5.4.0** (PR #191 — checklist de merge executado, PRONTO para o merge do Yan).
- A v5.3.1 fechou a adaptação do modelo da controladoria na DRE: Resumo Executivo (ancorado no
  ANO CORRENTE — não acompanha a pill de ano, é intencional) + Decomposição por BLOCO da
  estrutura viva (pills próprias dentro do card). Migration 0209 aplicada e verificada; 493
  testes verdes.
- Último ADR registrado: **`0161`** (v5.4.0: 0158 categoria de confiança da API externa ·
  0159 chave estável de campo · 0160 destinatário sem fallback · 0161 outbox). Próximo livre: 0162.
- Última migration: **`0216`** (v5.4.0: 0210–0214 renumeradas + `migration repair`; 0215 e 0216 são
  os dois rounds de decisões do Yan — extirpação da referência de conclusão e destino livre por
  tipo). **Próxima migration livre: `0217`.** Aditiva nova volta ao `--aditiva` normal.
- **v5.4.0 (PR #191) PRONTO:** reconciliado com o main da v5.3.4 (inclusive alinhando as rotas
  externas ao "nunca em silêncio" do fan-out). Falta só o merge. **Pós-merge:** patch destrutivo
  das 3 colunas órfãs (SQL no out-briefing, TTY do Yan) + criar a chave da integração na tela
  "API externa" e entregar `docs/api-externa-solicitacoes.md` ao integrador.
- **Vercel (infra, standing):** deploy de repo privado de org exige plano Pro — pendência de
  billing do Yan, herdada da v5.2.0.

## Bloqueios vigentes

- **Validação do allow em sessão CLI interativa** (residual da v5.3.2): confirmar que `npm run
  lint` e `db:migrate -- --aditiva` passam SEM consulta ao classificador na primeira sessão
  interativa do Yan (validação headless já exercitada no pós-merge; se não valer no interativo,
  suspeito registrado: issue #18846 do Claude Code).
- **Licença da Avenir LT Std × exposição pública dos `.otf` (BAIXO, achado do revisor na v5.3.3):**
  com a isenção do matcher, os 5 `.otf` passaram a ser baixáveis por visitante anônimo — antes só
  com sessão, e por acidente. Não é falha de autenticação (fonte usada em página pública é sempre
  alcançável pelo browser); é **conferir os termos da licença comercial** (ADR-0039). Se o Welcome
  Group quiser limitar, o caminho é subsetting/`woff2` com `Access-Control`/referrer, não voltar a
  quebrar a fonte no login. **Decisão do Yan.**
- **Conceder a área `financeiro/dre` às roles** no editor de acessos (herdado da v5.3.0). Sem
  isso a aba do Demonstrativo existe mas só admin a enxerga.
- **Conferir o Resumo Executivo contra a planilha da controladoria** (do Yan; contra a tabela já
  está provado).
- **Decisões de produto abertas na DRE:** centavos na barra; posição do "Editar estrutura";
  3 blocos do seed em CAIXA ALTA (ajuste é no editor da estrutura, não em código); vencidos em
  aberto no Total do ano; convenção do Δ% do Consolidado (denominador em módulo).
- **Órfão de documentação:** commit `b869bb9` (relatório delta DRE×Monde + errata) vive só em
  `origin/docs/investigacao-dre-competencia-monde` e na worktree `investigacao-dre-monde`.
  Decidir: PR próprio ou descarte. **Não remover essa worktree antes de decidir.**
- **Faturamento roda em MODO TESTE** — flip de produção é decisão do Yan (dupla trava construída).
- **Virada Monde APLICADA (v5.1.4):** 7 funções PURA-mv no espelho; upload ainda é a única fonte
  de `get_mix_produto`/`get_cagr` e das telas de Weddings. **NÃO parar o upload** (Scope B resolve).
- ~~**`SMTP_*` na Vercel**~~ — **RESOLVIDO na prática (provado na v5.3.4):** o log de produção
  `[email] notificação de solicitação: 3/5 enviados` só existe com SMTP configurado (sem as
  variáveis, `getConfigSmtp()` devolve `null` e nada é tentado). Segue valendo o cuidado geral: a
  camada de e-mail é fallback-safe e **degrada** — por isso o caller agora loga (v5.3.4).
- **% Rec no Cadastro de Metas** — alvos nascem vazios; cards mostram "—" até o Yan digitar.
- Favicon/símbolo Janus adiado (reprovado no gate de legibilidade 16/32px).

## Filas ativas (próximos passos já decididos)

- **Piloto do harness novo (prova 3):** a v5.3.3 já rodou **nativa** (`/nova-versao` +
  `/fechamento-versao`) e o harness se sustentou de ponta a ponta na Rota C — o ritual ganhou a
  rota explícita (patch sem briefing, sem plan mode, passo das cópias 0950–0954 condicionado a
  tocar banco). Falta a prova numa versão **de produto** (Rota A, com briefing e várias missões);
  rollback trivial segue sendo revert do CLAUDE.md/skills.
- **Ambiente (recomendações da v5.3.2, ação do Yan):** desativar o plugin **superpowers
  duplicado** (projeto v5.1.0; o global 6.2.0 fica) — ele induz disparo-em-bloco das skills;
  limpar allows amplos/efêmeros do `.claude/settings.local.json` (`Bash(npx supabase *)`,
  `Bash(node *)`, PIDs).
- **v5.4.0 (PR #191): checklist de merge EXECUTADO** (renumeração `0210–0214`/ADRs `0158–0161` +
  `migration repair` + proxy.ts conferido + gates). Falta só o merge do Yan. Pós-merge: configurar
  roles do tipo "Abatimento de créditos" + criar a chave TARS na tela (segredo exibido 1×) e
  entregar `docs/api-externa-solicitacoes.md` ao Vitor; decidir o tipo homônimo (id 9).
- **Fuso das pills de período (candidato REAL):** `resolverPeriodoCompleto` (`src/lib/periodo.ts`)
  não ancora em `hojeSP()` — runtime em UTC vira "Este mês/ano" antes da hora (~21h SP).
  Transversal (Fluxo de Caixa e DRE).
- **Limpeza de RPC órfã:** `get_decomposicao_grupo`/`get_decomposicao_categoria` sem consumidor
  vivo desde a v5.3.1. DROP exige verificação de consumidores reais (app E `supabase/seed/`).
- **v5.3.x refino da DRE:** drag-and-drop no editor; guarda de saída; divisão ver/editar da
  permissão; mover `historico-alteracoes` para `shared/`; Consolidado — conjunto de linhas vem
  do ano da URL (produto).
- **Monde — Scope B (aposentar o upload):** fato/mv item-level + repontar as 6 funções restantes.
- **Saúde da sincronização Monde:** detectar falha SILENCIOSA (200 sem vendas).
- restore-test COMPLETO do backup-gate (follow-up ADR-0116) · `CRON_SECRET` constant-time (BAIXO).
- Casos de contrato pendentes: `solicitar_acesso_admin`, `monde_ingest_status`.
- Tokenização do `zinc` + hex intermediários das paletas da Decomposição (vão em `style={{}}`).
- Consolidação das 3 pills de período (`PeriodoFilterPillsUrl` → `PILL_FILTRO`).
- Metas por Vendedor — próxima capacidade planejada (escopo a confirmar).
- Dependabot: 19 vulnerabilidades no default branch (10 high) — triagem pendente.

## Cuidados desta fase (o que uma sessão nova precisa saber AGORA)

- **O harness novo REGE a partir do merge da v5.3.2:** CLAUDE.md é core (162 linhas); o
  situacional está nas **skills** (`.claude/skills/` — ler a do domínio ANTES de implementar);
  procedimentos são **rituais** (`/nova-versao`, `/fechamento-versao`, `/pos-merge`). Delegação
  a subagente leva o campo **"Skills a ler"**. Gates escalonados: tsc+lint por missão;
  build+test por fase/fechamento. Fronteira de fase = estado em disco + `/clear`.
- **Terceira camada CONFIGURADA:** o settings global do Yan agora tem `allow` estreito (gates,
  git/gh, 2 invocações aditivas do db:migrate, `mcp__playwright`) e `deny` do `db push` cru.
  Bloqueio inesperado → **protocolo D5** (5 passos, no core). A validação a quente está pendente
  da 1ª sessão CLI (ver Bloqueios).
- **Hooks ATIVOS** (protecao-config 6 alvos incl. settings global / gate-stop /
  contexto-sessao) — detalhes no core §Salvaguardas.
- **Versão que toca UI:** despachar `verificador-visual` após gates e revisores (`next dev` é
  do orquestrador; tela autenticada exige credencial de teste na delegação). ⚠️ **O MCP Playwright
  não sobe em sessão de background/headless** (v5.3.3): o agente volta com **NÃO VERIFICADO** por
  falta das ferramentas `browser_*` — comportamento correto dele, não fabricar é o certo. Saída
  usada e provada na v5.3.3: o orquestrador roda um script headless com o **Chromium que o próprio
  MCP já instalou** (`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome` + `playwright-core`
  do cache do npx), medindo status/`content-type` de rede, console, `document.fonts.check()`,
  largura comparada com o fallback, anel de foco por Tab e screenshot. Fora do repo, sem tocar
  `node_modules`. Em sessão interativa, preferir o agente.
- **Protocolo de revisão:** `revisor` (sempre) e `revisor-db` (se migration/RPC) ANTES dos
  gates. Na v5.3.1 cada um pegou um ALTO real; na v5.3.2 o verificador-visual pegou o ALTO das
  fontes Avenir na estreia.
- **RPC que já existe pode ter a SEMÂNTICA errada — MEÇA antes de reusar** (skill banco-e-rpc);
  dois números lado a lado na mesma tela = caso de contrato.
- **A DRE tem DOIS recortes independentes na mesma seção** (o `?ano=` da tabela e as pills da
  Decomposição) — é de propósito. **Estrutura da DRE é DADO** (`dre_bloco`/`dre_categoria_map`;
  Receita Bruta é `RB_H`/`tipo:'blocoH'`, não `'tot'`). **Diário/undo é genérico** (molde
  `dre_estrutura_*`, 0206).
- `monde.*` é a fonte viva das telas executivas/Metas; Weddings/mix/CAGR ainda vêm do upload.

---
Regra de manutenção: item resolvido SAI (não é log). Aprendizado permanente NÃO fica
aqui — vai para o CLAUDE.md/skills pela régua de 5 destinos (core §Manutenção).
