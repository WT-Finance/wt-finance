# ADR-0150 — Revisão de contexto separado, hooks determinísticos e memória de sessão

- **Status:** aceito (v5.1.3)
- **Data:** 2026-07-14
- **Tipo:** PATCH de harness/tooling · SEM migration · ADR de PROCESSO (não de produto) · base main @ v5.1.2
- **Fronteira:** não toca produto, banco nem UI. Instala capacidades no harness (`.claude/`,
  `CLAUDE.md`, `docs/WORKING-CONTEXT.md`). Padrões destilados do repositório ECC (vencedor do
  hackathon Anthropic, fev/2026), **adaptados** ao método já validado do Janus — sem instalar
  nada do ECC (plugin/npm/marketplace).

## Contexto

Três lacunas recorrentes no método atual:

1. **Viés de ancoragem da auto-revisão.** A auto-auditoria adversarial (invariante do projeto)
   é feita pelo mesmo contexto que planejou e escreveu — e por isso tende a não enxergar o que
   já "faz sentido" para quem escreveu. O erro que escapa é o "dado errado parecendo certo".
2. **Convenção sozinha não segura.** Precedentes caros: 81 ocorrências do shorthand Tailwind
   inválido `-[--token]` (v4.16.1) e cores cruas reintroduzidas (emerald/âmbar) apesar da
   convenção (v4.26). Só o *enforcement mecânico* (lint `wt/*`) estancou — a lição vale para
   proteger a própria config de gate e para varrer resíduos baratos a cada resposta.
3. **Sessão nova re-explora o estado.** Cada sessão redescobria versão, bloqueios e filas
   vasculhando out-briefings — custo e risco de partir de premissa velha.

## Decisão

1. **Revisão de contexto SEPARADO como gate de missão** — dois subagentes read-only novos:
   - `revisor` (sempre): revisa qualidade/segurança/aderência ao CLAUDE.md com **contexto
     limpo**, ANTES dos gates e da auto-auditoria do orquestrador. Parecer por severidade
     (CRÍTICO/ALTO/MÉDIO/BAIXO) com `arquivo:linha`.
   - `revisor-db` (quando há migration/RPC): checklist especializado de banco (RBAC inline,
     REVOKE/GRANT explícitos, `coalesce` em predicado anulável, orçamento de 8s, índices, fuso
     em migration, consumidores reais antes de DROP) — antes da aplicação e de qualquer
     checkpoint humano de banco.

   **Complementa, não substitui, a auto-auditoria adversarial.** Read-only por **capability**
   (`tools: [Read, Glob, Grep]`), não só por instrução — a pureza é garantida pelo harness.
   CRÍTICO/ALTO voltam ao implementador antes dos gates; MÉDIO/BAIXO endereçam-se ou entram no
   out-briefing com justificativa. Achado de revisor não expande escopo.

2. **Enforcement determinístico por hooks** (`.claude/hooks/*.mjs`, registrados em
   `.claude/settings.json`):
   - `protecao-config` (PreToolUse — **bloqueia**): edição em `eslint.config.*`,
     `tsconfig*.json`, `.prettierrc*`, `eslint-rules/`, `.claude/hooks/` e `.claude/settings.json`
     é barrada. Gate incômodo se corrige no código, nunca afrouxando a config. Escape legítimo:
     checkpoint com o usuário + `WT_PERMITIR_CONFIG=1`.
   - `gate-stop` (Stop — **bloqueia**): varre `console.log` residual e o shorthand `-[--token]`
     nos `.ts/.tsx` modificados de `src/`. Barato de rodar a cada resposta; `build`/`tsc`/`lint`/
     `test` seguem sendo os gates serializados de fim de missão.
   - `contexto-sessao` (SessionStart — **informativo**): injeta `docs/WORKING-CONTEXT.md`.
   - Escape geral de emergência: `WT_DESLIGAR_HOOKS=1`.

3. **Memória de sessão versionada** — `docs/WORKING-CONTEXT.md`, a "verdade atual" do projeto
   em UMA página (versão, última migration, último ADR, bloqueios, filas), atualizada no
   out-briefing de TODA versão/patch (DoD). O `contexto-sessao` a injeta em toda sessão nova.

## Justificativa

- Viés de ancoragem: a revisão de contexto limpo é a maneira barata e comprovada (ECC) de pegar
  o que a auto-revisão do mesmo contexto não vê.
- Convenção não segura sozinha (v4.16.1/v4.26): os hooks levam o enforcement mecânico para além
  do lint — protegem a config de gate contra o atalho de "afrouxar para passar" e varrem
  resíduos baratos sempre.
- Estado re-explorado: a memória versionada faz qualquer sessão (inclusive remota/headless)
  partir do estado correto sem vasculhar o repositório.

## Alternativas rejeitadas

- **Instalar o pacote/plugin do ECC:** importamos os PADRÕES, não o pacote — nada de plugin,
  npm ou marketplace externo. Read-only por capability nativa (`tools`), hooks em `.mjs` puro.
- **Confiar só na auto-auditoria:** mantém o viés de ancoragem que a revisão separada existe
  para quebrar (ela complementa, não substitui).
- **Só documentar as regras (sem hook):** já provado insuficiente (v4.16.1/v4.26) — o
  enforcement mecânico é o que segura.
- **Guardar o estado no CLAUDE.md:** o CLAUDE.md é permanente/transversal; estado transitório
  (bloqueios/filas) vive no WORKING-CONTEXT, que sai quando o item resolve.

## Consequências

- **DoD ganha o parecer da revisão:** `revisor` (e `revisor-db`, se houve migration/RPC) emitido,
  CRÍTICO/ALTO endereçados — novo checkbox.
- **Configs de gate exigem checkpoint:** alterá-las passa a exigir o usuário + `WT_PERMITIR_CONFIG=1`;
  o caminho normal é corrigir o código.
- **Out-briefing atualiza o WORKING-CONTEXT** (novo checkbox no DoD) — a próxima sessão o lê antes de explorar.
- **Hooks só valem em sessão NOVA (bootstrapping):** o Claude Code lê `settings.json` no início da
  sessão. Nesta versão eles foram instalados e testados por invocação direta (payload sintético
  via stdin); passam a disparar sozinhos a partir da próxima sessão.
- **`.claude/settings.json` nasce nesta versão** contendo apenas a chave `hooks` — não havia arquivo
  `settings.json` versionado antes (só `settings.local.json`, pessoal). Nenhuma chave pré-existente
  foi perdida. O `model` do orquestrador, se precisar ser fixado no `settings.json`, é decisão do
  usuário (fora do escopo deste patch).
- `.claude/agents/` passa a ter 4 agentes: os 2 novos (`revisor`/`revisor-db`, read-only)
  nascem com `tools` mínimos; os 2 existentes (`explorador` read-only, `implementador` editor)
  foram inspecionados e já tinham `tools` mínimos — **sem mudança**. Pureza por capability, não
  só por instrução. A forma `tools: ["Read","Glob","Grep"]` do frontmatter foi verificada como
  **efetiva** (a doc oficial do Claude Code valida cada entrada e falha em erro se alguma não
  resolver — nunca herda todas as ferramentas em silêncio).
