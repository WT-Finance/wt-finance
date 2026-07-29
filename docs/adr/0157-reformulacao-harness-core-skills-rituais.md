# ADR-0157 — Reformulação do harness: core enxuto, skills de domínio, rituais invocáveis, permissões em três camadas e verificação visual

- **Status:** aceito (v5.3.2)
- **Contexto:** o workflow do Janus foi construído incrementalmente desde a v4.x e acumulou um
  CLAUDE.md de 518 linhas carregado integralmente em toda sessão (custo fixo de tokens + risco
  documentado de regra se perder em arquivo longo), canon duplicado entre CLAUDE.md e agentes,
  rituais recorrentes executados a partir de prosa e — revelado pelo incidente da v5.3.1 — uma
  camada de permissões do harness (classificador do modo auto do Claude Code) que negava passos
  que as regras do projeto autorizam (`npm run db:migrate -- --aditiva`), porque nunca fora
  configurada.

## Decisão

1. **CLAUDE.md vira CORE (~160 linhas, teto 180, 8 seções):** só o que TODA sessão precisa.
   Conhecimento situacional migra para **skills de domínio** em `.claude/skills/` (9 internas:
   banco-e-rpc, contrato-rpc-front, ui-design-system, tabela-densa, graficos, react-padroes,
   email, ingestao-planilhas, orquestracao) com descrições escritas como **regra de roteamento**.
   Migração provada por **inventário sem órfãos** (`docs/harness/inventario-claude-md.md` —
   100% das linhas com destino; precedentes "custou caro" preservados) e por **sonda de disparo**
   (`docs/harness/sonda-disparo.md`). Manutenção passa pela **régua de 5 destinos**
   (enforcement mecânico → deletar → core → skill → ritual).
2. **Procedimentos recorrentes viram rituais invocáveis:** `/nova-versao` (abertura; carrega a
   Carta e entra em plan mode; `disable-model-invocation`), `/fechamento-versao` (DoD integral)
   e `/pos-merge` (limpeza + reconciliação da data do changelog). O `/compact` estratégico foi
   substituído por `/clear` + re-ancoragem em disco na fronteira de fase (D-05 — compactação
   perde detalhe de forma não-determinística; disco não).
3. **Permissões em três camadas, com protocolo de bloqueio:** além das regras do projeto e dos
   hooks, o classificador do modo auto é regido por `allow`/`deny` no `~/.claude/settings.json`
   do usuário — allow **estreito e explícito** para a suíte de gates, git/gh e as 2 invocações
   aditivas do `db:migrate`; `deny` para `npx supabase db push` cru. As regras são **aplicadas
   pelo humano** (handoff formal; o hook `protecao-config` protege o settings — inclusive o
   global — por design). O **protocolo D5** (não contornar → completar o resto → deixar pronto →
   sinalizar → declarar o não-verificado) vira doutrina de core. Liberar aditiva é baixo risco
   por construção: o wrapper re-classifica o SQL e aborta destrutiva sem TTY (ADR-0131).
4. **Agentes:** delegações ganham o campo **"Skills a ler"** (o subagente lê os SKILL.md no
   próprio contexto; nunca conteúdo colado). `implementador` perde o canon duplicado e ganha
   rastreabilidade; `revisor` revisa contra as skills do escopo + checklist de acessibilidade
   (`web-design-guidelines`) quando toca UI; `revisor-db` mantém o checklist **inline**
   (decisão D-12 — banco é onde skill que não dispara custa mais; drift mitigado por nota
   cruzada + item do `/fechamento-versao`). Novo agente **`verificador-visual`** (Sonnet,
   read-only, MCP Playwright; o orquestrador serializa o servidor dev) — roda após gates e
   revisores, antes do checkpoint humano.
5. **Skills externas e MCP:** `web-artifacts-builder` (anthropics/skills@b29e7cf) e
   `web-design-guidelines` (vercel-labs/web-interface-guidelines@4e799d4) vendoradas em
   `.claude/skills/` com fonte+SHA registrados; em conflito com o DS do Janus, **o DS vence**.
   MCP Playwright em `.mcp.json` (escopo de projeto), chromium headless validado no WSL2.
6. **Gates escalonados (D-04):** `tsc`+`lint` por missão; `build`+`test` por fase e no
   fechamento; `gate-stop` cobre o barato por resposta. Rotas de entrada de trabalho (D-02):
   A (produto → briefing.md → `/nova-versao`), B (técnica → plan mode, plano vira spec
   commitada), C (patch trivial).

## Salvaguardas intocadas

Destrutiva com humano em TTY; merge/deploy humanos; auto-auditoria adversarial; subagentes
editores puros; fronteira de produto; `protecao-config` (agora deliberadamente cobrindo o
settings global). Velocidade vem de fechar loops de verificação, não de remover barreiras.

## Consequências

- Startup de sessão: porção específica do projeto caiu de ~59,7k para ~32,5k tokens (−45,6%,
  medição real em `claude -p`; total do 1º request 83,9k → 56,6k).
- Risco novo assumido: convenção que vivia "sempre carregada" agora depende do disparo da skill.
  Mitigações: descrições-gatilho testadas (sonda M14, 18 sondas), o que é crítico permanece sob
  enforcement mecânico (lint `wt/*`, hooks, deny) ou no core, e o piloto real é a primeira
  versão de produto subsequente (rollback trivial: revert do CLAUDE.md/skills).
- Manutenção dupla deliberada e documentada: `banco-e-rpc` ↔ checklist inline do `revisor-db`
  (D-12).
- O achado do verificador-visual na estreia (fontes Avenir 307→HTML via proxy em telas
  não-autenticadas) fica registrado como pendência de produto/plataforma — fora deste escopo.

## Referências

- Briefing: `docs/briefings/briefing-v5-3-2-reformulacao-harness.md` (decisões D-01…D-14).
- Inventário: `docs/harness/inventario-claude-md.md` · Sonda: `docs/harness/sonda-disparo.md`.
- ADR-0131 (EOF aborta), ADR-0116 (backup-gate), v5.1.3/ADR-0150 (harness anterior).
