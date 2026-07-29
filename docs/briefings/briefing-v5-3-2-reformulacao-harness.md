# Briefing v5.3.2 — Reformulação do Harness

> **Formato.** Este é o primeiro briefing no formato novo: arquivo `.md` único, commitado em
> `docs/briefings/`, sem par de prompt — o "como executar" vive no CLAUDE.md e nas skills
> (que esta versão cria; por isso, excepcionalmente, este briefing carrega mais procedimento
> que os futuros). Kickoff: sessão principal em **Fable 5**, plan mode, validar este briefing
> contra o repo real antes de editar qualquer coisa.
>
> **Numeração.** v5.3.2 — patch da linha v5.3, entrando ANTES do merge da v5.4.0 para que o
> harness novo já valha nas próximas versões (precedente: v5.1.3, upgrade de harness como
> patch). Confirmar contra `src/lib/version.ts` e o estado real das branches; a v5.4.0
> permanece em branch própria e a renumeração das provisórias segue pós-v5.3, intocada.
> Esta versão **não contém migrations**. ADR novo: verificar numeração real em `docs/adr/`.

---

## 1. Contexto e objetivo

O workflow do Janus foi construído incrementalmente desde a v4.x e acumulou: um CLAUDE.md de
~504 linhas carregado integralmente em toda sessão (custo fixo de tokens + risco documentado
de regras se perderem em arquivo longo), canon duplicado entre CLAUDE.md e agentes, rituais
recorrentes executados a partir de prosa, e — revelado pelo incidente da v5.3.1 — uma camada
de permissões do harness (classificador do modo auto) que nega passos que as regras do
projeto autorizam, porque nunca foi configurada.

**Objetivo:** reformular o harness em cinco frentes — (F1) camada de permissões e protocolo
de bloqueio; (F2) CLAUDE.md core enxuto + skills internas com progressive disclosure;
(F3) rituais invocáveis; (F4) subagentes revisados + verificador visual novo + orquestrador
Fable; (F5) skills externas + MCP de browser — ganhando tokens por sessão, aderência às
regras, velocidade de entrega e autonomia real, **sem afrouxar nenhuma barreira de
irreversibilidade**.

## 2. Decisões já tomadas (não relitigar)

| # | Decisão | Racional |
|---|---|---|
| D-01 | Briefing único `.md` **salvo** em `docs/briefings/` (sem commit manual — o `/nova-versao` o inclui no primeiro commit da branch da versão); par docx+prompt extinto; `.docx` só sob demanda para governança | O "como" migra para o harness; PDF é caro de ler; fonte única no repo, histórico via PR da própria versão |
| D-02 | Rotas de trabalho: A (produto → planejado no Chat → briefing.md), B (técnica → plan mode direto), C (patch trivial → direto) | Régua: qualquer decisão de produto aberta ou tela nova/alterada → A; na dúvida, A |
| D-03 | CLAUDE.md core ~150 linhas / 8 seções; conhecimento situacional em skills; régua de 5 destinos (hook/deletar/core/skill de domínio/ritual) | CLAUDE.md é RAM, skills são disco; arquivo inchado degrada aderência |
| D-04 | Gates escalonados: `tsc`+`lint` por missão; `build`+`test` por fase e fechamento | `build` é o gate lento e raramente pega o que tsc+lint não pegam; `gate-stop` segue cobrindo o barato por resposta |
| D-05 | `/clear` + re-ancoragem em disco (WORKING-CONTEXT/plano) na fronteira de fases substitui o `/compact` estratégico | Compactação perde detalhe de forma não-determinística; arquivo em disco não |
| D-06 | Permissões: `allow` exato para `db:migrate --aditiva` (2 invocações) + suíte de gates; `deny` para `npx supabase db push` cru; **sem** deny de `--destrutiva` (redundante — barreira é estrutural no wrapper) | Incidente v5.3.1; liberar aditiva é baixo risco por construção (wrapper re-classifica SQL e aborta sem TTY) |
| D-07 | Regras vivem em `~/.claude/settings.json`, aplicadas **pelo Yan** (handoff formal); escape `WT_PERMITIR_CONFIG=1` permanece inalcançável pelo agente (opção D6-c do briefing v5.3.1) | Mudança de config de gate é sempre ato humano; ADR-0131 ("EOF jamais confirma") |
| D-08 | Protocolo D5 (harness barrou passo autorizado) vira doutrina no core | Comportamento de salvaguarda precisa de carga garantida, não probabilística |
| D-09 | Skills externas: `skill-creator`, `frontend-design` (oficial), `web-design-guidelines` (Vercel), `web-artifacts-builder` | frontend-design com brief explícito em tela nova/M0; web-design-guidelines cobre acessibilidade (vazio real do DS) via revisor |
| D-10 | MCP de browser entra nesta versão (não follow-up); conferência visual vira subagente `verificador-visual` | Duas quebras graves recentes só foram pegas a olho; screenshots morrem no contexto do subagente |
| D-11 | **Não** criar `revisor-ui`; checklist da web-design-guidelines dobra no `revisor` quando o escopo toca UI | Evitar proliferação de agentes |
| D-12 | `revisor-db` mantém checklist inline (trade-off aceito: manutenção dupla com a skill `banco-e-rpc`, mitigada por nota cruzada + item no `/fechamento-versao`) | Banco é onde skill que não dispara custa mais (produção direta) |
| D-13 | Orquestrador = sessão principal em **Fable 5** (recomendado, não cravado no settings versionado); subagentes seguem Sonnet no frontmatter; Carta do Orquestrador = skill `orquestracao` com carga determinística via `/nova-versao` | Subagente não despacha subagente; modelo caro pensa/julga, Sonnet executa em volume |
| D-14 | Salvaguardas intocadas: destrutiva com humano, merge humano, auto-auditoria adversarial, subagentes editores puros, `protecao-config` (proteção do settings global vira **deliberada**) | Velocidade vem de fechar loops de verificação, não de remover barreiras de irreversibilidade |

## 3. Pré-requisitos (antes do kickoff)

1. **Yan aplica o settings** (handoff formal — conteúdo exato na Missão F1/M1, que o prepara;
   se preferir, aplicar direto deste briefing, §M1). Verificar empiricamente se o settings
   global recarrega a quente ou exige restart da sessão; anotar o resultado para a doc.
2. **PR #195 (v5.3.1) resolvido**: aplicar a 0209 (`npm run db:migrate -- --aditiva
   --fora-de-ordem`, da worktree da v5.3.1, cópias 0950–0954 já posicionadas), testes de
   contrato verdes, merge. Pendência de versão anterior não entra neste escopo (regra do
   projeto: escopo não cruza PR).

## 4. Missões

### F1 — Camada de permissões e protocolo de bloqueio

**M1 — Preparar o handoff do settings (entregável para o Yan, não aplicação).**
Gerar diff/JSON pronto para colar em `~/.claude/settings.json`:

```json
"permissions": {
  "defaultMode": "auto",
  "allow": [
    "Bash(npm run db:migrate -- --aditiva)",
    "Bash(npm run db:migrate -- --aditiva --fora-de-ordem)",
    "Bash(npm run build)",
    "Bash(npx tsc --noEmit)",
    "Bash(npm run lint)",
    "Bash(npm test)",
    "Bash(git add *)",
    "Bash(git commit *)",
    "Bash(git push *)",
    "Bash(gh pr create *)",
    "Bash(npx supabase migration list)"
  ],
  "deny": [
    "Bash(npx supabase db push)",
    "Bash(npx supabase db push *)"
  ]
}
```

Validar a sintaxe de curinga contra o schema real da versão instalada do Claude Code
(o briefing v5.3.1 registrou [?] em `cmd *` vs `cmd:*`); ajustar se necessário. Acrescentar
ao handoff as regras de allow para as tools do MCP de browser (M13, mesmo pacote).
**Critério:** JSON validado + instrução de aplicação em bloco único no chat; Yan aplica e
confirma; uma chamada de `npm run lint` passa sem consulta ao classificador.

**M2 — `.gitignore`:** adicionar `.claude/settings.local.json`. **Critério:** entrada
presente; `git status` limpo com um settings.local de teste presente.

**M3 — Correções de doc da camada de permissões** (entram no core novo, M4): escopo real
do `protecao-config` (6 alvos, incluindo `.claude/hooks/` e `settings.json` global —
proteção deliberada; escape inalcançável pelo agente por design; handoff = diff + comando
pronto), subseção "terceira camada" (classificador; autonomia aditiva condicionada ao
`allow`), e protocolo D5 (5 passos: não contornar; completar o que não depende; deixar
pronto; sinalizar redundante; declarar o não-verificado). Adaptar dos rascunhos §9 do
briefing da v5.3.1. **Critério:** os três textos presentes no core.

### F2 — CLAUDE.md core + skills internas

**M4 — Reescrever o CLAUDE.md** nas 8 seções aprovadas (identidade/stack; comandos; regime;
workflow com Rotas A/B/C + gates escalonados + `/clear` de fase; banco-essência; subagentes
resumido com ponteiro para a carta; salvaguardas com as adições de M3; manutenção com a
régua de 5 destinos). Alvo ~150 linhas (teto rígido: 180). **Critério:** arquivo dentro do
teto; `/context` confirma carga; nenhuma barreira dura removida (diff revisado linha a linha
no PR).

**M5 — Inventário sem órfãos (prova 1 da migração).** Tabela linha-a-linha do CLAUDE.md
atual → destino (core / skill X / ritual Y / hook-permissão / deletar). "Deletar" exige
apontar o enforcement que cobre (lint/hook/deny). Entregável: `docs/harness/inventario-claude-md.md`.
**Critério:** 100% das linhas com destino explícito; zero conteúdo perdido sem justificativa.

**M6 — Criar as 9 skills internas** em `.claude/skills/<nome>/SKILL.md`, usando a
`skill-creator` (instalada em M12) como guia de estrutura: `banco-e-rpc`,
`contrato-rpc-front`, `ui-design-system`, `tabela-densa`, `graficos`, `react-padroes`,
`email`, `ingestao-planilhas`, `orquestracao` (a Carta — rascunho aprovado no planejamento;
partir dele). Descrições escritas como **regra de roteamento** (gatilhos da tabela aprovada).
Corpo ≤ 500 linhas por skill; conteúdo migrado do CLAUDE.md atual **sem perda dos
precedentes "custou caro"** (podem ser comprimidos, não omitidos). Nota cruzada
`banco-e-rpc` ↔ `revisor-db` (D-12). Caso fronteiriço a decidir na escrita: timestamptz→SP
em `ingestao-planilhas` vs `ui-design-system` (decisão técnica, autonomia do Code).
**Critério:** 9 skills presentes, frontmatter válido, aparecem no startup da sessão.

### F3 — Rituais invocáveis

**M7 — `/nova-versao <vX-Y>`** (skill com `disable-model-invocation: true`): cria worktree
+ symlinks + `supabase/.temp` + posiciona cópias 0950–0954 (bloco marcado
`<!-- REMOVER na renumeração pós-v5.3 -->`) + lê `docs/briefings/briefing-<versão>.md` da
raiz do main (o arquivo pode estar untracked — worktree NÃO herda untracked; a skill o
**copia para a worktree e o inclui no primeiro commit da versão**, garantindo histórico via
PR sem commit manual do usuário) + **carrega a skill `orquestracao`** + entra em plan mode
para validação briefing×repo.
**M8 — `/fechamento-versao`**: o DoD integral como procedimento, com gates escalonados,
despacho de revisores, out-briefing com Parecer, WORKING-CONTEXT, CHANGELOG.md +
CHANGELOG_DIRETORIA (regra da data real), version bump, avaliação de aprendizado pela régua
de 5 destinos, item "convenção de banco mudou? atualizar skill E revisor-db", PR.
**M9 — `/pos-merge`**: limpeza de worktree a partir da raiz do main.
**Critério (M7–M9):** invocação manual de cada um em ambiente de teste executa o
procedimento ponta a ponta sem depender de prosa do CLAUDE.md antigo.

### F4 — Agentes

**M10 — Revisar os 4 agentes existentes:**
- Todos: atualizar identidade para "Janus"; delegação passa a incluir campo **"Skills a
  ler"** (caminhos de SKILL.md; o agente lê no próprio contexto — nunca conteúdo colado).
- `explorador`: skills como mapa de navegação antes de grep; orçamento de saída ~40 linhas
  salvo pedido; papel nomeado de validador briefing×repo na Rota A.
- `implementador`: remover o bloco "Contexto técnico" (convenções); adicionar "leia as
  skills listadas antes de editar" + rastreabilidade (qual skill cobriu cada decisão
  não-óbvia) no retorno. As 5 regras duras intactas.
- `revisor`: "Falhas silenciosas" permanece inline (identidade); "Convenções que o lint NÃO
  pega" e itens TS/dados migram para revisão **contra as skills do escopo** listadas na
  delegação; novo item condicional: escopo toca UI → rodar checklist `web-design-guidelines`.
- `revisor-db`: checklist inline mantido (D-12); só nota cruzada + identidade.
**Critério:** frontmatters válidos; nenhum agente contém canon de construção duplicado
(exceção documentada: revisor-db); delegação-teste com "Skills a ler" funciona.

**M11 — Criar `verificador-visual`** (`.claude/agents/verificador-visual.md`): Sonnet;
tools = Read + tools do MCP de browser (navegar, screenshot) — sem Write/Edit/Bash; **não
sobe servidor** (orquestrador inicia/derruba o `npm run dev`, serializado, e passa a URL);
insumos = URLs/telas afetadas + o que deveria existir (briefing/mockup) + estados a
exercitar (incluindo carregamento real, não só render estático); parecer no formato padrão
por severidade, screenshots descritos textualmente. Posição no fluxo: após gates e
revisores, antes do checkpoint humano. **Critério:** arquivo presente; delegação-teste em
tela existente retorna parecer com screenshot exercitado.

### F5 — Skills externas + MCP de browser

**M12 — Instalar as 4 skills externas** (`skill-creator`, `frontend-design`,
`web-design-guidelines`, `web-artifacts-builder`) pelo caminho canônico de cada uma
(plugin/marketplace oficial ou cópia para `.claude/skills/`, a decidir pelo método mais
estável — autonomia técnica). **Critério:** as 4 listadas no startup; prompt-teste de tela
nova dispara `frontend-design`.

**M13 — MCP de browser:** instalar Playwright MCP (preferência; fallback Chrome DevTools
MCP se o ambiente WSL2 impuser) em escopo de projeto; validar headless no WSL2 (browsers
instalados, screenshot funciona contra `next dev`); regras de `allow` das tools no pacote
de handoff do M1. Registrar no core a nuance de serialização (servidor é do orquestrador).
**Critério:** `verificador-visual` navega e fotografa uma tela real do Janus em dev.

### F6 — Verificação e fechamento

**M14 — Sonda de disparo (prova 2).** Bateria de prompts-teste por skill interna (mínimo 2
por skill: um que deve disparar, um vizinho que não deve) + teste de carga da carta via
`/nova-versao`. Registrar resultados em `docs/harness/sonda-disparo.md`. Descrição que
falhar → reescrever e re-testar antes do merge. **Critério:** 100% das skills disparam no
prompt-alvo; carta carrega em sessão de versão.

**M15 — Medição de baseline.** Registrar no out-briefing: tokens de startup de sessão
(via `/context`) antes × depois da migração do CLAUDE.md. **Critério:** número registrado;
expectativa de redução substancial (não é gate, é evidência).

**M16 — Fechamento** via `/fechamento-versao` (o ritual estreia fechando a própria versão):
out-briefing, CHANGELOG.md, CHANGELOG_DIRETORIA (descrição genérica honesta — "melhorias
internas de engenharia", diretoria não vê harness), version bump, ADR da reformulação
(numeração real verificada), PR. **Critério:** DoD adaptado completo (sem itens de
migration, N/A declarado).

## 5. Fases e dependências

- **Fase 1:** M1–M2 (+ pré-requisitos com o Yan). M1 destrava autonomia imediatamente.
- **Fase 2:** M5 (inventário) → M4 + M6 em paralelo por arquivos disjuntos (core e skills
  derivam ambos do inventário) → M3 entra no M4.
- **Fase 3:** M7–M9 (dependem das skills e do core).
- **Fase 4:** M12 → M10–M11 (revisor referencia web-design-guidelines; verificador-visual
  depende do M13) → M13 pode rodar em paralelo com M10.
- **Fase 5:** M14–M16.
- Fronteira de cada fase: atualizar estado em disco + `/clear` (estreando D-05).

## 6. Checkpoints (exceção justificada — versão meta)

1. **Fim da Fase 1:** confirmação do Yan de settings aplicado e comportamento verificado.
2. **Fim da Fase 2:** inventário (M5) + diff do CLAUDE.md apresentados ANTES de seguir —
   o core é a peça de maior risco; aprovação humana aqui é barata e evita retrabalho.
3. Demais fases: autonomia padrão; confirmação ao final.

## 7. Fronteiras de produto (parar e perguntar)

- Qualquer corte de conteúdo do CLAUDE.md sem destino claro na régua (inventário não
  resolve → pergunta, não decide).
- Conflito entre skill externa e o DS do Janus (ex.: frontend-design sugerindo fugir dos
  tokens): o DS vence; se a skill externa precisar de ajuste/wrapper, perguntar.
- Qualquer mudança em hook existente (não está no escopo; `protecao-config` bloqueia por
  design — se parecer necessária, é checkpoint, não contorno).
- Renumeração v5.4.0/provisórias: fora deste escopo; não tocar.

## 8. Fora de escopo (registrar, não implementar)

Loops autônomos estilo Ralph/`--yolo` (incompatível com produção direta); Agent Teams;
dynamic workflows (candidato futuro: Escopo B e migrações incrementais em massa);
`/goal` como gate declarativo (avaliar após estabilizar o novo DoD); renumeração de
migrations/ADRs provisórios; automação das cópias 0950–0954 no wrapper (morre na
renumeração); tokenização do cinza `zinc`; piloto do novo harness (= primeira versão de
produto subsequente, com rollback trivial via revert do CLAUDE.md — prova 3, registrada
aqui como plano, executada fora).

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Skill não dispara e convenção "some" | Sonda M14 pré-merge; o que é crítico permanece coberto por lint/hook/deny (régua destino 1–2); piloto como prova final |
| Drift `revisor-db` ↔ `banco-e-rpc` | Nota cruzada + item no `/fechamento-versao` (D-12) |
| Curinga de permissão com sintaxe errada | Validação empírica no M1 contra o schema da versão instalada |
| MCP de browser instável no WSL2 | Fallback Chrome DevTools MCP; se ambos falharem, registrar achado e degradar conferência visual para humana (estado atual — sem regressão) |
| Core novo omite barreira dura | Checkpoint 2 com diff linha a linha + inventário sem órfãos |

## 10. Definition of Done (adaptações desta versão)

DoD padrão com: itens de migration = N/A declarado; parecer do `revisor` sobre M4/M6/M10
(convenções desta vez são o próprio objeto); sonda M14 verde; baseline M15 registrado;
out-briefing com seção "o que muda para a próxima sessão" (a próxima sessão de versão será
a primeira nativa do harness novo).
