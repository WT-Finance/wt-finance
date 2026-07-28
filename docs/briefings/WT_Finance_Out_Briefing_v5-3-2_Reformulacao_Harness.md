# Out-Briefing — v5.3.2 · Reformulação do Harness

Data: 2026-07-28 · Branch: `feat/v5-3-2-reformulacao-harness` · PR: draft (merge do Yan)
Briefing: `docs/briefings/briefing-v5-3-2-reformulacao-harness.md` (1º no formato novo — `.md`
único commitado no 1º commit da versão, D-01) · ADR: **0157** · **Sem migrations** (itens de
banco do DoD: N/A declarado).

## 1. O que foi implementado (F1–F6, M1–M16)

### F1 — Camada de permissões e protocolo de bloqueio
- **M1** — Handoff do settings entregue em bloco único no chat, com sintaxe **validada contra a
  doc oficial** (CLI 2.1.220): `Bash(cmd *)` = prefixo com fronteira de palavra; string sem `*` =
  match exato; **deny vence allow em qualquer escopo**; allow explícito e estreito **dispensa o
  classificador** do modo auto (o mecanismo que faltou no incidente da v5.3.1); permissões
  recarregam a quente segundo a doc. Bloco: allow para gates
  (`build`/`tsc`/`lint`/`test`), git (`add`/`commit`/`push`), `gh pr create`,
  `npx supabase migration list`, as 2 invocações exatas de `db:migrate -- --aditiva` e
  `mcp__playwright`; deny para `npx supabase db push` (cru e com args). **Aplicado pelo Yan**
  (sem reinício de sessão; a validação a quente numa sessão CLI fica para a primeira sessão
  nativa — critério "lint sem consulta ao classificador" a observar lá).
- **M2** — `.gitignore`: `.claude/settings.local.json`, correção do bug da linha 51
  (`.agentsskills/` — entradas coladas sem newline), `/agent/`, `/brag-output/`, symlinks de
  skills de vídeo em `.claude/skills/` (sem trailing slash — symlink não casa `dir/`) e
  `.playwright-mcp/`. Testado com `git check-ignore -v` (regra do repo vence a global) e skill
  de projeto comprovadamente rastreável.
- **M3** — Os três textos entraram no core §Salvaguardas: escopo REAL do `protecao-config`
  (6 alvos, incl. `.claude/hooks/` e `settings.json` global — proteção deliberada; escape
  inalcançável pelo agente), subseção **terceira camada** (classificador; autonomia aditiva
  condicionada ao allow) e **protocolo D5** em 5 passos. Fonte: WORKING-CONTEXT do PR #196 +
  out-briefing v5.3.1 §7.1 + `protecao-config.mjs` (os rascunhos do planejamento não estavam no
  repo; derivação aprovada pelo Yan no plan mode).

### F2 — CLAUDE.md core + skills internas
- **M5** — Inventário sem órfãos (`docs/harness/inventario-claude-md.md`): 100% das 518 linhas
  do CLAUDE.md v5.3.1 em faixas contíguas 1–518 (verificação mecânica), 79 blocos, contagem por
  destino primário reconciliada (regra declarada). **1 única deleção seca** (o `/compact`
  estratégico → D-05). Corrigido pós-parecer do checkpoint 2 (11 linhas órfãs absorvidas;
  resumo quantitativo reconciliado).
- **M4** — CLAUDE.md core: **518 → 162 linhas** (`wc -l` final: 162; teto 180), 8 seções.
  Nenhuma barreira dura removida (diff revisável linha a linha no PR). Ajustes do parecer:
  fallback do `contexto-sessao` (ler WORKING-CONTEXT manualmente se o hook faltar) e Rota B
  gera spec commitada.
- **M6** — 9 skills internas em `.claude/skills/` (linhas): banco-e-rpc (394, com nota cruzada
  D-12), ui-design-system (270), contrato-rpc-front (192), email (188), react-padroes (185),
  ingestao-planilhas (169), tabela-densa (132), orquestracao/Carta (107), graficos (87).
  Descriptions como regra de roteamento (testadas na sonda M14; 3 reescritas pós-rodada 1).
  Caso fronteiriço timestamptz→SP decidido: exibição em ui-design-system, parse em
  ingestao-planilhas, fuso de banco em banco-e-rpc, com cross-links mútuos.

### F3 — Rituais invocáveis
- **M7** `/nova-versao` (`disable-model-invocation: true`) — worktree + ambiente + cópias
  0950–0954 (bloco marcado `<!-- REMOVER na renumeração pós-v5.3 -->`) + briefing copiado da
  raiz e commitado como 1º commit + carta + plan mode. **Testado ponta a ponta** em versão
  descartável (v0-0-teste) e de novo via sessão headless (v0-0-sonda, ver M14).
- **M8** `/fechamento-versao` — DoD integral como procedimento (revisores → gates → banco N/A →
  docs → régua de 5 destinos, incl. item D-12 → PR). **Estreou fechando esta própria versão.**
- **M9** `/pos-merge` — pull ff-only + verificação de trabalho não-merjado + remoção + prune +
  reconciliação da data do CHANGELOG_DIRETORIA (via PR de docs, precedente #196). Passos
  não-destrutivos testados no descartável.

### F4 — Agentes
- **M10** — 4 agentes revisados: identidade Janus; campo **"Skills a ler"** nos insumos da
  delegação (agente lê no próprio contexto; nunca conteúdo colado); `explorador` com skills
  como mapa + orçamento ~40 linhas + papel de validador briefing×repo (Rota A); `implementador`
  sem o bloco "Contexto técnico" (canon vive nas skills) + rastreabilidade no retorno (5 regras
  duras intactas); `revisor` revisa CONTRA as skills do escopo + checklist `web-design-guidelines`
  quando toca UI ("Falhas silenciosas" permanece inline); `revisor-db` com checklist 100% inline
  (D-12) + nota cruzada.
- **M11** — `verificador-visual` criado (Sonnet; Read + 19 tools `mcp__playwright__*`; sem
  Write/Edit/Bash; não sobe servidor — o orquestrador serializa o dev server e passa a URL;
  parecer padrão por severidade com screenshots descritos; nota sobre credenciais de teste).
  **Delegação-teste real** (sessão aninhada, `/login` em `next dev`): navegou, exercitou foco
  por teclado, fotografou 5 estados e devolveu parecer — com um **achado ALTO real** (ver §4).

### F5 — Skills externas + MCP de browser
- **M12** — `skill-creator` e `frontend-design`: já instaladas como plugins globais oficiais
  (registrado; nada a fazer). `web-artifacts-builder` vendorada íntegra de
  **anthropics/skills@b29e7cf**; `web-design-guidelines` embrulhada como skill sobre
  **vercel-labs/web-interface-guidelines@4e799d4** (AGENTS.md verbatim + MIT em `references/`),
  com regra de precedência explícita: **o DS do Janus vence** em tokens/cores/primitivos; o
  checklist cobre acessibilidade/interações (vazio real do DS).
- **M13** — `.mcp.json` na raiz (escopo de projeto): `@playwright/mcp` (chromium, `--headless
  --isolated`). Validação WSL2: handshake JSON-RPC real (initialize → tools/list → navigate →
  screenshot), **24 tools**, browser `chrome-for-testing` headless shell instalado pelo
  instalador do próprio MCP. Nuance de serialização registrada no core/carta (servidor é do
  orquestrador). Artefatos de runtime (`.playwright-mcp/`) no `.gitignore`.

### F6 — Verificação e fechamento
- **M14** — Sonda de disparo (`docs/harness/sonda-disparo.md`): 18 sondas reais + 9 re-testes.
  Resultado: 100% das skills disparam no prompt-alvo (6 com disparo EXCLUSIVO); 3 descriptions
  reescritas e re-testadas (graficos, email, react-padroes — as duas primeiras passaram a
  disparo exclusivo). Carta carregada via `/nova-versao` em sessão real. Achado ambiental
  documentado (ver §4).
- **M15** — Baseline de startup (medição real, `claude -p` na raiz × worktree, mesmo prompt):
  porção específica do projeto (cache_creation do 1º request) **59.747 → 32.479 tokens
  (−45,6%)**; contexto total do 1º request 83.901 → 56.633 (−32,5%). Ressalvas de método: o
  "antes" inclui a listagem dos 18 symlinks de skills de vídeo presentes na raiz (estado real
  atual); o "depois" lista as 14 skills do projeto; a parcela comum de harness (24.154 de
  cache_read) é idêntica dos dois lados. Não é gate — é evidência.
- **M16** — Este fechamento, executado pelo `/fechamento-versao` (estreia). Gates: build limpo,
  tsc 0, lint limpo, **493/493 testes** (os 3 casos de contrato da 0209 agora verdes — a
  migration foi aplicada no ciclo da v5.3.1). Bump 5.3.2; CHANGELOG.md; CHANGELOG_DIRETORIA
  (entrada genérica honesta, hora real de autoria 15:58 −03, reconciliar no `/pos-merge`).

## 2. Parecer da revisão

Nesta versão houve **três instâncias de revisão** (as convenções eram o próprio objeto):

**(a) Checkpoint 2 — parecer do Yan (com revisão do Chat): APROVADO COM RESSALVAS.**
2 MÉDIOS corrigidos ANTES da Fase 3: (1) 11 linhas em branco órfãs entre faixas do inventário —
absorvidas, contiguidade 1–518 re-verificada mecanicamente; (2) resumo quantitativo que não
reconciliava (87 × 79) — recontado por destino primário com regra declarada (79 = 79).
3 BAIXOS incluídos: fallback do `contexto-sessao` no core, Rota B gera spec commitada,
`wc -l` final registrado (core = **162 linhas**).

**(b) `revisor` (contexto separado, escopo integral): APROVADO COM RESSALVAS.**
- **ALTO — resolvido por corrida, sem correção necessária:** o parecer apontou que ADR-0157 e
  CHANGELOG citavam `docs/harness/sonda-disparo.md` sem o arquivo existir. O revisor leu a
  árvore ANTES do commit `469405b`, que é exatamente o commit do arquivo (a sonda M14 estava em
  execução em paralelo). Estado final verificado: o artefato está commitado e o claim é
  verdadeiro.
- **MÉDIO (corrigido):** cross-link da `ui-design-system` para `frontend-design` sem sinalizar
  que é plugin externo não-versionado — anotado explicitamente ("se não aparecer na listagem,
  siga sem ela").
- **MÉDIO (corrigido):** `web-artifacts-builder` vendorada sem fonte+SHA registrados no próprio
  diretório — criado `FONTE.md` (anthropics/skills@b29e7cf; SKILL.md original intocado, íntegra
  preservada).
- **BAIXO (corrigido):** loop das cópias 0950–0954 no `/nova-versao` sem guarda de erro do
  `git show` (risco de `.sql` VAZIO silencioso) — guarda `|| { rm; PARAR }` adicionada com a
  justificativa no texto.
- **BAIXO (registrado, não tocado):** `:USERPROFILE*` no `.gitignore` (linha 50) é fragmento
  pré-existente de intenção desconhecida — não ignora nada; fica para o Yan confirmar a
  intenção (regra: não remover sem pedido).
- **BAIXO (registrado):** claims de medição (baseline M15, 24 tools do MCP) não reproduzíveis
  pelo revisor (read-only) — método e comandos documentados em §1/M15 deste out-briefing.
- Sem achados: barreiras duras comparadas linha a linha com a v5.3.1 (todas preservadas + 1
  adicionada); inventário amostrado em 8 faixas contra os destinos reais; frontmatters dos 5
  agentes; verificador-visual sem Write/Edit/Bash; CHANGELOG_DIRETORIA em linguagem de negócio
  com hora não-redonda; ADR-0157 sem colisão de número.

**(c) `verificador-visual` (delegação-teste da estreia):** parecer APROVADO COM RESSALVAS para
a tela `/login` — 1 ALTO real (fontes Avenir, ver §4), itens OK: identidade neutra sem dourado,
labels acessíveis, anel de foco por teclado, 0 erros de console.

`revisor-db`: **N/A** (versão sem migration/RPC).

## 3. O que muda para a próxima sessão (a 1ª nativa do harness novo)

1. **Abrir versão:** `/nova-versao <vX-Y>` faz worktree, ambiente, cópias 0950–0954, briefing no
   1º commit, carrega a Carta e entra em plan mode. Não seguir mais a prosa antiga de worktrees.
2. **O CLAUDE.md agora é core (162 linhas):** o situacional está nas skills — a regra de ouro é
   LER a skill do domínio antes de implementar (as descriptions roteiam; a listagem do startup é
   o índice). Delegações a subagentes levam o campo **"Skills a ler"** (caminhos, nunca conteúdo).
3. **Gates escalonados:** tsc+lint por missão; build+test por fase e fechamento. Fronteira de
   fase = estado em disco + `/clear` (não `/compact`).
4. **Autonomia aditiva de banco está destravada** pelo allow do settings global (aplicado); o
   deny protege o backup-gate. Bloqueio inesperado do harness → protocolo D5 do core (5 passos).
5. **Versão que toca UI ganha conferência visual:** subir `next dev` (orquestrador), despachar
   `verificador-visual` após gates e revisores. Telas autenticadas precisam de credencial de
   teste na delegação.
6. **Fechar versão:** `/fechamento-versao`. Pós-merge: `/pos-merge`.
7. **Primeira sessão CLI nova:** observar se `npm run lint` e as invocações aditivas passam SEM
   consulta ao classificador (valida o hot-reload do settings na prática) e registrar.

## 4. Achados e pendências registradas (fora do escopo — não implementados)

- **[ALTO — produto/plataforma] Fontes Avenir quebradas em telas não-autenticadas:** o proxy de
  auth intercepta `/fonts/avenir/*.otf` (307 → HTML do login), o browser falha o decode
  (`OTS parsing error`) e cai em fonte de sistema — identidade tipográfica quebrada no `/login`
  (e provavelmente `/solicitar-acesso`, `/trocar-senha`). Achado do `verificador-visual` na
  delegação-teste. Correção provável: isentar `/fonts/*` no matcher do `proxy.ts` (mexer em
  proxy é fora deste escopo).
- **[MÉDIO — ambiente] Plugin superpowers duplicado** (global 6.2.0 oficial + projeto 5.1.0
  obra-marketplace): induz disparo-em-bloco de skills em parte das sessões (custo de contexto;
  roteamento segue correto). Recomendação: desativar a cópia do projeto e reavaliar a sonda.
- **[MÉDIO — ambiente] `settings.local.json` do projeto poluído:** allows amplos
  (`Bash(npx supabase *)`, `Bash(node *)`) e efêmeros (PIDs, `Bash(:)`). O deny global cobre o
  `db push`, mas vale a limpeza manual.
- **[BAIXO] Dependabot:** 19 vulnerabilidades abertas no default branch (10 high) — aviso do
  GitHub no push; não relacionado a esta versão.
- **[BAIXO] Issue aberto no Claude Code (#18846)** sobre regras Bash de settings não aplicadas
  em algumas versões — se o allow não surtir efeito na primeira sessão CLI, é esse o suspeito.
- **[REGISTRO] Skills de vídeo (18 symlinks) em `.claude/skills/` da raiz:** agora ignoradas no
  git; seguem funcionais. Se um dia atrapalhar a listagem de startup, mover é decisão do Yan.

## 5. Arquivos modificados/criados

- `CLAUDE.md` (reescrito, 518→162) · `.gitignore` · `.mcp.json` (novo) · `package.json` (5.3.2)
- `.claude/skills/` — 14 skills (9 internas + 3 rituais + 2 vendoradas)
- `.claude/agents/` — 4 revisados + `verificador-visual.md` (novo)
- `docs/harness/` (novo) — `inventario-claude-md.md`, `sonda-disparo.md`
- `docs/adr/0157-reformulacao-harness-core-skills-rituais.md` (novo)
- `docs/briefings/briefing-v5-3-2-reformulacao-harness.md` (1º commit) + este out-briefing
- `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/WORKING-CONTEXT.md`

## 6. DoD (adaptado — versão sem migrations)

- [x] build limpo · tsc 0 · lint sem warnings novos · **493/493 testes**
- [x] Parecer do `revisor` sobre M4/M6/M10 (ver §2) · revisor-db N/A (sem migration/RPC)
- [x] Smoke: rituais testados ponta a ponta; verificador-visual exercitado em tela real
- [x] Migrations: **N/A declarado** (nenhuma; 0950–0954 intocadas; renumeração fora do escopo)
- [x] ADR 0157 (numeração real verificada) · CHANGELOG.md · CHANGELOG_DIRETORIA (hora real)
- [x] `package.json` 5.3.2 (`version.ts` deriva) · Out-briefing (este) · WORKING-CONTEXT
- [x] Sonda M14 verde (100% disparo no alvo) · Baseline M15 registrado (−45,6% na porção do projeto)
- [x] CLAUDE.md avaliado — a régua de 5 destinos passa a REGER a manutenção (core §8)
- [ ] Worktree limpa (após o merge, via `/pos-merge`)
- [x] PR draft aberto (merge e deploy ficam com o Yan)
