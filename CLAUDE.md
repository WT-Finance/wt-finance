# CLAUDE.md — Janus (core)

Janus (ex-WT Finance), plataforma financeira interna do Welcome Group. Este arquivo é o **core**
do harness: o que TODA sessão precisa saber. O conhecimento situacional vive nas **skills do
projeto** (`.claude/skills/` — o harness as lista no startup; a descrição de cada uma diz quando
usá-la) e os procedimentos recorrentes nos **rituais invocáveis** (`/nova-versao`,
`/fechamento-versao`, `/pos-merge`). **Regra de ouro: antes de implementar numa área, LER a
skill do domínio** (banco-e-rpc, contrato-rpc-front, ui-design-system, tabela-densa, graficos,
react-padroes, email, ingestao-planilhas, orquestracao).

## Stack

Next.js 16 · React 19 · TypeScript estrito · Tailwind 4 · shadcn/ui · Recharts ·
Supabase (Postgres + PostgREST) · Vercel. Repositório: `WT-Finance/wt-finance`.

## Comandos essenciais

```bash
npm run dev / build / lint / test / seed
npx tsc --noEmit                      # typecheck — NÃO existe "npm run typecheck"
npm run db:migrate -- --aditiva [--fora-de-ordem]   # backup-gate rede → push (autônomo sob allow)
npm run db:migrate -- --destrutiva    # backup-gate rede → push COM CONFIRMAÇÃO HUMANA (TTY)
npx supabase migration list           # local vs remote (read-only, seguro)
```

O CLI do Supabase não é global — sempre `npx supabase ...`.

## Regime de trabalho (default: autônomo)

Dentro do escopo do briefing da versão: **autonomia técnica total** (modelo de dados, organização
de código, caminho de implementação); não se pergunta o operacional. Três invariantes que nenhum
prompt afrouxa:

- **Auto-auditoria adversarial antes de declarar concluído** — verificar a realidade contra o
  prompt, inclusive contra erros do próprio briefing; divergiu, **parar**.
- **Merge humano é a única fronteira de entrada em produção.** Nunca mergear, nunca deployar.
- **Decisão de produto é do usuário.** Na dúvida se é técnico ou produto, **é produto**:
  registrar/perguntar, não decidir.

**Checkpoints** (parar no meio e aguardar) são exceção, pedidos explicitamente pelo briefing;
sem pedido, a confirmação do usuário acontece ao final de todas as missões.

## Workflow de versão

**Rotas de entrada** (na dúvida entre A e B, é A):
- **Rota A (produto):** decisão de produto aberta ou tela nova/alterada → planejado no Chat →
  briefing `.md` em `docs/briefings/` → `/nova-versao <vX-Y>` (worktree + briefing no 1º commit +
  carta de orquestração + plan mode para validar briefing×repo).
- **Rota B (técnica):** sem decisão de produto → plan mode direto na sessão.
- **Rota C (patch trivial):** direto, com gates.

**Implementação:** pesquisar antes de codar (adotar/estender > construir — reinventar o que já
existe é a causa-raiz histórica de divergência); ler as skills do domínio ANTES de editar;
um commit por missão com `git add` de arquivos específicos (nunca `-A`); reportar progresso pelo
chat (sem arquivo de relatório).

**Gates ESCALONADOS:** `npx tsc --noEmit` + `npm run lint` ao fim de **cada missão**;
`npm run build` + `npm test` na **fronteira de fase** e no **fechamento**; smoke das áreas
afetadas no fechamento. Quem roda gate é a sessão principal, serializado.

**Fronteira de fase:** atualizar o estado em disco (plano da versão/WORKING-CONTEXT) e `/clear`.
Não usar `/compact` estratégico (perde detalhe de forma não-determinística; disco não).

**Revisão:** `revisor` (sempre) e `revisor-db` (se migration/RPC) antes dos gates de fechamento;
`verificador-visual` (se UI) após os gates. CRÍTICO/ALTO corrigem antes de fechar; MÉDIO/BAIXO
endereçam ou registram no out-briefing.

**Fechamento:** `/fechamento-versao` (DoD integral: gates, revisores, out-briefing,
CHANGELOG.md + CHANGELOG_DIRETORIA, version bump, ADRs com numeração real, WORKING-CONTEXT, PR).
**Pós-merge:** `/pos-merge` (pull na raiz + limpeza da worktree).

## Banco de dados — essência

- **Produção DIRETA, sem staging.** O wrapper `npm run db:migrate` roda o backup-gate antes do
  push — é **rede de recuperação, não autorização** (runbook `docs/runbooks/db-backup-gate-runbook.md`).
- **ADITIVA** (CREATE, ADD COLUMN anulável, RPC nova, índice, GRANT/REVOKE): autônoma sob gate +
  **declaração prévia no header** — e só se materializa com o `allow` do settings (ver "terceira
  camada" abaixo).
- **DESTRUTIVA** (DROP, TRUNCATE, ALTER que remove/reescreve, UPDATE/DELETE em dado existente):
  **SEMPRE confirmação humana em TTY**. O wrapper aborta em stdin não-TTY/EOF (ADR-0131) — o
  agente **não consegue** aplicar destrutiva, por construção. Não tentar.
- **`db push` empurra TODO o conjunto pendente:** NUNCA escrever migration destrutiva na pasta
  `supabase/migrations/` antes da hora de aplicá-la (custou caro: v5.2.0 dropou bases por arrasto).
- **RPC nova:** `SECURITY DEFINER` + `app.exigir_acesso` inline + REVOKE/GRANT explícitos.
  Verificação pós-push **via REST com service_role** — `db query` NÃO executa o corpo.
- Detalhes, precedentes e mapa de fontes de dados: **skill `banco-e-rpc`** (ler antes de
  qualquer migration/RPC).

## Subagentes — resumo

A sessão principal (**Fable 5 recomendado**, não cravado no settings versionado) orquestra:
pensa, julga, delega e **serializa git/build/banco/servidor**. Subagentes (**Sonnet**, frontmatter)
executam sob delegação autocontida com campo **"Skills a ler"** (caminhos de SKILL.md — o
subagente lê no próprio contexto; nunca colar conteúdo). Subagentes são **editores puros**:
nunca rodam git, banco, build ou servidor. Arquivos disjuntos rodam em paralelo; mesmo arquivo
sequencia; arquivo-ímã (tokens/globals/config) tem dono único. A Carta completa é a
**skill `orquestracao`** (o `/nova-versao` a carrega).

## Salvaguardas e camadas de proteção

**Barreiras duras (nunca, independentemente do prompt):**
- **Não fazer merge de PR. Não fazer deploy** (Vercel é automático no merge).
- **Não aplicar migration DESTRUTIVA sem confirmação humana** — o gate é rede, não autorização.
- **Não pular a auto-auditoria adversarial** antes de declarar concluído.
- **Subagentes não rodam git/build/banco/servidor** — só editam arquivos.
- **Não decidir produto.** Fronteira de produto para e pergunta.
- **Ação externa irreversível** (e-mail real, cobrança) só em MODO TESTE fail-closed — a virada
  para o modo real é decisão humana (skill `email`).

**Disciplina (regra do projeto):**
- Não editar config de gate para silenciar erro — corrigir o código (alteração legítima =
  checkpoint com o usuário).
- Não expandir escopo além do briefing — achado novo vira registro no out-briefing.
- **Verificar consumidores reais antes de remover** qualquer objeto (grep no app E em
  `supabase/seed/`) — "órfão" pelo briefing já teve uso vivo (v4.17.1).
- Não remover worktree com trabalho não-merjado. Não usar `git add -A` cego.
- Não confiar na numeração de ADR/migration do briefing — verificar `docs/adr/` e
  `supabase/migrations/` reais.
- Addendum a PR/versão já mergeado vira **patch novo**, nunca commit tardio.

**Hooks do harness (enforcement mecânico, `.claude/hooks/` + `.claude/settings.json`):**
- **`protecao-config` (PreToolUse — BLOQUEIA)** — 6 alvos: `eslint.config.*`, `tsconfig*.json`,
  `.prettierrc*`, `eslint-rules/`, **`.claude/hooks/`** (os hooks não se desarmam) e
  **`settings.json`** (qualquer caminho `.claude/settings.json` — **inclusive o global do
  usuário**; proteção deliberada). O escape `WT_PERMITIR_CONFIG=1` é variável de ambiente da
  sessão que **o agente não alcança por design**: o protocolo é propor o diff + comando prontos
  e o humano aplicar. Escape geral de emergência: `WT_DESLIGAR_HOOKS=1` (registrado no out-briefing).
- **`gate-stop` (Stop — BLOQUEIA)** — varre `console.log` e o shorthand inválido `-[--token]`
  em `.ts/.tsx` de `src/` a cada resposta.
- **`contexto-sessao` (SessionStart)** — injeta `docs/WORKING-CONTEXT.md` na sessão nova.

**Terceira camada — permissões do harness (classificador):** além das regras do projeto e dos
hooks existe o classificador do modo auto do Claude Code, regido pelo `~/.claude/settings.json`
do usuário. Regra de `allow` **explícita e estreita** dispensa o classificador; sem regra, um
comando que escreve pode ser **negado seco** (sem prompt). A autonomia ADITIVA de banco depende
das regras de `allow` aplicadas pelo usuário (handoff humano; o `deny` de `npx supabase db push`
cru protege o backup-gate). Mudança nessas regras é sempre ato humano.

**Protocolo D5 — o harness barrou um passo que as regras do projeto autorizam:**
1. **NÃO contornar** — o caminho alternativo geralmente fura uma rede (ex.: `db push` cru pula
   o backup-gate; `db query` cria drift no histórico).
2. **Completar tudo** o que não depende do passo barrado.
3. **Deixar o ambiente pronto** para o humano executar (comando exato, pré-condições posicionadas).
4. **Sinalizar** no PR, no out-briefing e no WORKING-CONTEXT.
5. **Declarar o que ficou não-verificado** por causa do bloqueio.

## Manutenção deste arquivo e do harness

Aprendizado novo passa pela **régua de 5 destinos**, nesta ordem de preferência:
1. **Enforcement mecânico** (lint `wt/*`, hook, regra de permissão) — o que dá para segurar por
   máquina não vira prosa;
2. **Deletar** — se o enforcement já cobre integralmente;
3. **Core (este arquivo)** — só o que TODA sessão precisa (critérios: permanente + transversal +
   custou caro), teto de **180 linhas**;
4. **Skill de domínio** — conhecimento situacional de uma área;
5. **Ritual** — procedimento recorrente.

Adicionar é também podar. Convenção de **banco** mudou → atualizar a skill `banco-e-rpc` **e** o
checklist inline do `revisor-db` (decisão D-12; item do `/fechamento-versao`). Toda alteração
neste arquivo e nas skills passa pelo PR — o usuário revisa antes do merge.
