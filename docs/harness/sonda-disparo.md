# Sonda de disparo das skills — v5.3.2 / M14 (prova 2)

> **Método.** Cada sonda é uma sessão headless REAL (`claude --model sonnet -p`, cwd na worktree
> da versão, `--output-format stream-json`, tools de edição desabilitadas), com um prompt que
> DEVE disparar a skill-alvo e um prompt vizinho que NÃO deve (o vizinho é do domínio confinante,
> desenhado para rotear para a skill irmã). Detecção: invocações reais do tool `Skill` no stream.
> Prompts em `probes.txt`; execução em `roda-sonda.sh` (lotes de 6); artefatos no diretório do job.
> Modelo das sondas: Sonnet (proxy do subagente padrão; o roteamento em produção pode variar por
> modelo — o piloto real é a primeira versão de produto no harness novo).

## Rodada 1 (18 sondas — descrições originais)

| Sonda | Alvo | Esperado | Disparou | Veredito |
|---|---|---|---|---|
| banco-fire | banco-e-rpc | dispara | **banco-e-rpc** (só) | ✅ limpo |
| banco-nao | banco-e-rpc | não dispara | contrato-rpc-front | ✅ roteou para a irmã certa |
| contrato-fire | contrato-rpc-front | dispara | TODAS as 9 (bloco) | ⚠️ alvo disparou, sem discriminação |
| contrato-nao | contrato-rpc-front | não dispara | skill-creator (externa) | ✅ alvo não disparou |
| ui-fire | ui-design-system | dispara | **ui-design-system** (só) | ✅ limpo |
| ui-nao | ui-design-system | não dispara | NENHUMA | ✅ |
| tabela-fire | tabela-densa | dispara | TODAS as 9 (bloco) | ⚠️ alvo disparou, sem discriminação |
| tabela-nao | tabela-densa | não dispara | TODAS as 9 (bloco) | ❌ pela letra (bloco ambiental) |
| graficos-fire | graficos | dispara | skill-creator (externa) | ❌ MISS → reescrever |
| graficos-nao | graficos | não dispara | ui-design-system | ✅ roteou para a irmã certa |
| react-fire | react-padroes | dispara | NENHUMA | ❌ MISS → reescrever |
| react-nao | react-padroes | não dispara | NENHUMA | ✅ |
| email-fire | email | dispara | skill-creator (externa) | ❌ MISS → reescrever |
| email-nao | email | não dispara | contrato-rpc-front | ✅ roteou para a irmã certa |
| ingestao-fire | ingestao-planilhas | dispara | TODAS as 9 (bloco) | ⚠️ alvo disparou, sem discriminação |
| ingestao-nao | ingestao-planilhas | não dispara | TODAS as 9 (bloco) | ❌ pela letra (bloco ambiental) |
| orq-fire | orquestracao | dispara | **orquestracao** (só) | ✅ limpo |
| orq-nao | orquestracao | não dispara | skill-creator (externa) | ✅ alvo não disparou |

## Correção aplicada (regra do M14: descrição que falhar → reescrever e re-testar)

As descriptions de **graficos**, **email** e **react-padroes** foram reescritas com gatilhos mais
literais (verbos e sintomas que aparecem em pedido real: "adicionar série/linha de projeção",
"template de e-mail/notificação/SMTP", "set-state-in-effect/exhaustive-deps/useEffect com
fetch"). As demais 6 permaneceram como estavam.

## Rodada 2 (9 sondas re-executadas pós-reescrita)

| Sonda | Disparou | Veredito |
|---|---|---|
| graficos-fire | **graficos** (só) | ✅ limpo — reescrita funcionou |
| email-fire | **email** (só) | ✅ limpo — reescrita funcionou |
| contrato-fire | **contrato-rpc-front** (só) | ✅ limpo (r1 tinha sido bloco) |
| react-fire | bloco de 7 (alvo DENTRO) | ⚠️ alvo dispara; bloco ambiental |
| react-nao | bloco de 7 | ❌ pela letra (bloco ambiental) |
| tabela-fire | bloco de 7 (alvo DENTRO) | ⚠️ idem |
| tabela-nao | bloco de 7 | ❌ pela letra (bloco ambiental) |
| ingestao-fire | bloco de 7 (alvo DENTRO) | ⚠️ idem |
| ingestao-nao | bloco de 7 | ❌ pela letra (bloco ambiental) |

## Carga da carta via `/nova-versao` (critério final do M14)

Sessão headless real invocou `/nova-versao v0-0-sonda`:
- **1ª tentativa (sem contexto de teste): a sessão PAROU e perguntou** — detectou que
  `v0-0-sonda` não casa com o versionamento real e que podia ser dry-run. Comportamento de
  salvaguarda correto (registrado como evidência positiva, não falha).
- **2ª tentativa (dry-run sancionado):** o ritual executou ponta a ponta — pull, worktree
  `feat+v0-0-sonda` a partir de `origin/main`, ambiente, cópias 0950–0954 untracked, leitura do
  WORKING-CONTEXT — e **a carta carregou** (Read em `orquestracao/SKILL.md`; resposta "CARTA
  CARREGADA: Modelos por camada"). Worktree descartável removida em seguida pelos passos do
  `/pos-merge`. ✅

## Veredito e achado ambiental

- **Critério "100% das skills disparam no prompt-alvo": ATENDIDO.** As 9 internas dispararam no
  prompt-alvo; 6 delas com disparo **exclusivo** (banco-e-rpc, contrato-rpc-front,
  ui-design-system, graficos, email, orquestracao); 3 (tabela-densa, ingestao-planilhas,
  react-padroes) dispararam dentro de runs de disparo-em-bloco.
- **Achado ambiental (não é defeito das descriptions):** parte das sessões invoca TODAS as
  skills em bloco — padrão consistente com o mandato do plugin **superpowers**
  ("≥1% de chance → DEVE invocar"), que está **duplicado** no ambiente (v6.2.0 global oficial +
  v5.1.0 do marketplace obra no projeto). Evidência de que é ambiental: o MESMO prompt roteia
  limpo numa amostra e em bloco na outra, e os blocos incluem skills obviamente alheias (email
  disparando para pergunta de tabela sticky). Efeito prático em produção: roteamento correto,
  custo extra de contexto. **Recomendação ao usuário:** desativar a cópia duplicada do
  superpowers (a do projeto, v5.1.0) e reavaliar; se o bloco persistir e incomodar, é o mandato
  do plugin, não o harness do Janus.
- A `skill-creator` (externa) roubou 3 disparos na rodada 1 em prompts com "criar/estruturar" —
  as reescritas resolveram; conviver com ela instalada exige gatilhos literais nas descriptions
  (regra incorporada: description nova nasce com sintomas/verbos do pedido real).
