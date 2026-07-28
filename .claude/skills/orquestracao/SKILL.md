---
name: orquestracao
description: Carta do Orquestrador do Janus — como a sessão principal dirige uma versão. Modelos por camada (orquestrador pensa/julga; subagentes Sonnet executam), delegação autocontida com "Skills a ler", paralelização por arquivos disjuntos (subagentes são editores puros; git/build/banco/servidor serializados no orquestrador), protocolo de revisão (revisor, revisor-db, verificador-visual) e gates escalonados. Use ao iniciar a sessão de uma versão (o /nova-versao a carrega), ao despachar subagentes, ao planejar paralelização de missões ou ao decidir quem roda um gate.
---

# Carta do Orquestrador

A sessão principal de uma versão é o **orquestrador**: interpreta o briefing, planeja, delega,
serializa toda operação com estado e **revisa criticamente** o que os subagentes retornam antes
de integrar. O orquestrador **não faz exploração extensa nem edição em massa** — isso é trabalho
de subagente; o ruído (leituras, buscas, tentativas) morre no contexto de quem executa.

## Modelos por camada

- **Orquestrador:** Fable 5 recomendado (não cravado no `.claude/settings.json` versionado —
  escolhe-se por sessão). Modelo caro pensa, julga e escreve o que exige juízo.
- **Subagentes:** Sonnet, fixado no frontmatter de cada agente em `.claude/agents/`.
  Sonnet executa em volume sob delegação bem especificada.
- **Subagente não despacha subagente.** A árvore tem 2 níveis, sempre.

## Os agentes (`.claude/agents/`)

- **`explorador`** (read-only) — levantamento de contexto antes de implementar: mapear arquivos
  e fluxos reais, localizar padrões, verificar numeração real de ADR/migration. Na Rota A é o
  validador briefing×repo. Retorna condensado (~40 linhas); sinaliza riscos mesmo fora do escopo.
- **`implementador`** (editor puro) — escreve/edita arquivos em blocos bem especificados.
  Não roda gates; migration nova recebe o número exato e **não é aplicada** por ele.
- **`revisor`** (read-only) — revisão de contexto separado ao fim das missões de cada fase,
  ANTES dos gates de fechamento e da auto-auditoria do orquestrador. Parecer por severidade
  (CRÍTICO/ALTO/MÉDIO/BAIXO) com `arquivo:linha`.
- **`revisor-db`** (read-only) — revisão especializada de migration/RPC ANTES da aplicação e de
  qualquer checkpoint humano de banco. Checklist próprio, mantido INLINE no agente (decisão
  D-12: banco é onde skill que não dispara custa mais).
- **`verificador-visual`** (read-only + browser) — conferência visual de telas afetadas via MCP
  de browser, APÓS gates e revisores, antes do checkpoint humano. **Não sobe servidor**: o
  orquestrador inicia/derruba o `npm run dev` (serializado) e passa a URL na delegação.

## Protocolo de delegação

Subagentes **não veem o histórico da sessão** — cada delegação é autocontida:

1. **Objetivo** — o que deve existir ao final, em uma frase.
2. **Contexto** — arquivos/áreas envolvidos e achados relevantes (repassados, não presumidos).
3. **Skills a ler** — lista de caminhos `.claude/skills/<nome>/SKILL.md` pertinentes ao escopo.
   O subagente LÊ no próprio contexto; **nunca colar o conteúdo** na delegação (o caminho é
   barato, o conteúdo colado polui e desatualiza).
4. **Critério verificável de conclusão** — como saber que terminou. Subagente não roda gates,
   então o critério é de **estado dos arquivos** (o que existe/mudou).

Dúvida de produto ou de arquitetura num subagente **retorna ao orquestrador** — que decide
(se técnico) ou pergunta ao usuário (se produto; na dúvida, é produto).

## Paralelização (regra de ouro)

Paralelização = **subagentes editando arquivos disjuntos dentro da única worktree da versão**.

> **Regra crítica de segurança — subagentes são editores puros:**
> subagentes SÓ editam arquivos. NUNCA rodam `git commit`, `db push`/`db:migrate`, `next build`
> nem servidor. Isso causaria race no índice git, no banco e em portas.

- Toda operação com estado compartilhado (git, banco, build, servidor) é **serializada pelo
  orquestrador**, depois que os subagentes terminam de editar.
- Missões que tocam o **mesmo arquivo** são sequenciadas; arquivos diferentes rodam em paralelo.
- **Arquivo-ímã tem dono único:** `tokens.css`, `globals.css` e configs atraem edição de várias
  missões — designar UM dono por fase (ou o orquestrador edita), nunca dois subagentes neles.

## Protocolo de revisão

Ao fim das missões de uma fase (ou da versão, se curta), despachar em paralelo (são read-only):
- `revisor` — sempre;
- `revisor-db` — se a fase teve migration/RPC;
- `verificador-visual` — se a fase tocou UI (este roda após os gates, com o dev server do
  orquestrador de pé).

A delegação de revisão inclui: objetivo da missão revisada, lista exata de arquivos/migrations
modificados e as **skills do escopo** (campo "Skills a ler" — o revisor revisa CONTRA elas).
Achados **CRÍTICO/ALTO → correção antes dos gates de fechamento**; a correção volta ao revisor
apenas se estrutural. MÉDIO/BAIXO → endereçar ou registrar no out-briefing com justificativa.
Achado de revisor **não expande escopo** — vira correção (se dentro da versão) ou registro.

## Gates escalonados (D-04)

- **Por missão:** `npx tsc --noEmit` + `npm run lint` (rápidos; pegam quase tudo).
- **Por fase e no fechamento:** `npm run build` + `npm test` (o build é o gate lento; o
  fechamento roda o conjunto completo).
- O hook `gate-stop` cobre o barato a cada resposta (console.log, `-[--token]`).
- **Quem roda gate é SEMPRE o orquestrador**, serializado — nunca um subagente.

## Fronteira de fases (D-05)

No fim de cada fase: atualizar o estado em disco (plano da versão/WORKING-CONTEXT — o que foi
feito, decisões, próximo passo re-ancorável) e então `/clear`. **Não usar `/compact`
estratégico** — compactação perde detalhe de forma não-determinística; arquivo em disco não.
Nunca limpar contexto no meio de uma missão.

## Auto-auditoria adversarial

Antes de declarar qualquer missão/versão concluída, o orquestrador verifica a realidade contra
o prompt — inclusive contra o próprio briefing (que já errou: RPCs "órfãs" com consumidor vivo
no seed, v4.17.1). O `revisor` complementa, não substitui: ele não carrega o viés de ancoragem
de quem planejou. Divergiu → **parar** e reportar.

## Ver também

- Skill `banco-e-rpc` — antes de qualquer migration/RPC (e nota D-12 sobre o revisor-db).
- Rituais: `/nova-versao` (abre a versão e carrega esta carta), `/fechamento-versao` (DoD),
  `/pos-merge` (limpeza).
