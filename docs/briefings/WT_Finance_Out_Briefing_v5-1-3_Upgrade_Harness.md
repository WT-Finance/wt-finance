# Out-Briefing — v5.1.3 · Upgrade do Harness

- **Tipo:** PATCH de harness/tooling — **não toca produto, banco nem UI**. Execução linear.
- **Base:** `main` @ v5.1.2 (`22e6559`).
- **Branch/worktree:** `patch/v5-1-3` (worktree em `.claude/worktrees/patch-v5-1-3` — o harness deste
  ambiente isola em `.claude/worktrees/`; branch/commits/PR idênticos à convenção `.worktrees/`).
- **Migration:** nenhuma. **ADR:** 0150 (processo). **Data:** 2026-07-14.
- **Fonte dos padrões:** repositório ECC (vencedor do hackathon Anthropic, fev/2026), **adaptados**
  ao método Janus — **nada do ECC foi instalado** (sem plugin/npm/marketplace).

---

## Missões implementadas

### M0 — Numeração e preparo
- Versão real em produção: **v5.1.2** (PR #180) → esta é **v5.1.3** (próximo patch da linha 5.1).
- Último ADR real: **0149** → este é **ADR-0150**. Última migration: **0180** (nenhuma nesta versão).
- Worktree funcional criada (base = main HEAD; `node_modules`/`.env.local` symlinkados; `supabase/.temp/` copiado).

### M1 — Agentes `revisor` e `revisor-db`
- Inspecionados os agentes existentes: `explorador` (`tools: Read, Glob, Grep`) e `implementador`
  (`tools: Read, Write, Edit, Glob, Grep`) **já estavam no mínimo por papel** — nenhuma correção
  de frontmatter necessária, corpo intocado.
- Criados `.claude/agents/revisor.md` (A1) e `.claude/agents/revisor-db.md` (A2), **byte a byte**
  dos anexos. Frontmatter YAML validado nos 4 (`js-yaml`): `model: sonnet`, `tools` mínimos por papel.
- **Verificação do formato `tools` (parecer do revisor):** a forma `tools: ["Read","Glob","Grep"]`
  (array) dos agentes novos foi confirmada **efetiva** contra a doc oficial do Claude Code — o parser
  valida cada entrada e **falha em erro** se alguma não resolver; **nunca herda todas as ferramentas
  em silêncio**. Read-only por capability garantido.

### M2 — Hooks determinísticos
- Criados `.claude/hooks/protecao-config.mjs` (A3), `gate-stop.mjs` (A4), `contexto-sessao.mjs` (A5),
  byte a byte dos anexos (o comentário do `protecao-config` foi depois atualizado — ver Parecer).
- **Caminho real das regras `wt/*` (M2.2):** `no-cor-hardcoded` e `no-tailwind-var-shorthand` são
  **inline em `eslint.config.mjs`** (cobertos pela regex `/(^|\/)eslint\.config\.[cm]?js$/`);
  `no-coercao-reimpl` vive em **`eslint-rules/no-coercao-reimpl.mjs`** (coberto por `/(^|\/)eslint-rules\//`).
  **Proteção funcionalmente completa sem ajuste de regex** — a placeholder já casava o caminho real.
- **`.claude/settings.json` criado** com o fragmento A6 (só a chave `hooks`, sem `_comentario`).
  **Não existia `settings.json` versionado antes** (só `settings.local.json`, pessoal) — nenhuma
  chave pré-existente perdida.
- **Matriz de testes (invocação direta, payload sintético via stdin):**

| Hook | Cenário | Esperado | Resultado |
|---|---|---|---|
| protecao-config | `eslint.config.mjs` | exit 2 + msg | ✅ exit 2 |
| protecao-config | `src/lib/fmt.ts` | exit 0 | ✅ exit 0 |
| protecao-config | `eslint.config.mjs` + `WT_PERMITIR_CONFIG=1` | exit 0 | ✅ exit 0 |
| protecao-config | `.claude/settings.json` | exit 2 | ✅ exit 2 |
| protecao-config | `.claude/hooks/gate-stop.mjs` | exit 2 | ✅ exit 2 |
| protecao-config | `eslint-rules/no-coercao-reimpl.mjs` | exit 2 | ✅ exit 2 |
| protecao-config | `tsconfig.json` | exit 2 | ✅ exit 2 |
| protecao-config | `WT_DESLIGAR_HOOKS=1` | exit 0 | ✅ exit 0 |
| gate-stop | src sujo (`console.log`+`text-[--brand]`), sem `stop_hook_active` | exit 2, 2 achados | ✅ exit 2 (2 achados) |
| gate-stop | `stop_hook_active: true` | exit 0 | ✅ exit 0 |
| gate-stop | arquivo limpo (`[var(--token)]`) | exit 0 | ✅ exit 0 |
| gate-stop | nenhum `src/` modificado | exit 0 | ✅ exit 0 |
| contexto-sessao | `docs/WORKING-CONTEXT.md` presente | imprime conteúdo | ✅ |
| contexto-sessao | ausente | exit 0 silencioso | ✅ |

- O arquivo temporário de teste do `gate-stop` (`src/__probe_gate_stop__.tsx`) foi **removido** (não commitado).

### M3 — `docs/WORKING-CONTEXT.md`
- Criado a partir do template A7, **preenchido com a verdade real** (versão 5.1.2, migration 0180,
  ADR 0149→0150; bloqueios e filas extraídos dos out-briefings v5.x). Uma página, sem placeholder residual.
- Atualizado no fechamento (M5.5) para o estado pós-entrega (v5.1.3; hooks ativos a partir da próxima sessão).

### M4 — CLAUDE.md
- **Rota A**: `CLAUDE.md` substituído pelo anexo A0 (byte a byte). `git diff` confere **exatamente as
  9 edições** de M4 e nada além (69 inserções / 6 deleções, todas nos pontos de inserção; nenhuma linha
  pré-existente perdida fora deles). Referências internas ("passo 6", "Workflow §4", §1–§7) preservadas.

### M5 — ADR, ensaio do protocolo e fechamento
- **ADR-0150** criado (numeração real; formato coerente com os ADRs existentes).
- **Ensaio do protocolo (dry-run real):** o `revisor` foi despachado sobre o diff desta própria versão
  (contexto limpo, read-only) — parecer abaixo. Como não há migration, o `revisor-db` **não** foi acionado
  (correto por protocolo).
- **Gates:** `tsc` 0 erros · `lint` exit 0 · `test` **414 passed** (32 arquivos) · `build` OK.
- Bump `package.json` 5.1.2→5.1.3 (`src/lib/version.ts` deriva de `package.json` — nada a editar).
  `CHANGELOG.md` (entrada técnica) + `CHANGELOG_DIRETORIA` (linguagem de negócio, tipo `melhoria`).

---

## Parecer da revisão (ensaio do protocolo — `revisor`)

**Veredito: APROVADO COM RESSALVAS** · **CRÍTICO: 0 · ALTO: 0 · MÉDIO: 2 · BAIXO: 2.**

### MÉDIO — endereçados
1. **Formato `tools` (array) dos agentes novos × string dos existentes — risco ao invariante read-only.**
   → **Endereçado por verificação:** confirmado na doc oficial do Claude Code que a forma array
   `tools: ["Read","Glob","Grep"]` restringe de fato (valida cada entrada, falha em erro se não resolver;
   nunca herda todas as ferramentas). Conteúdo dos anexos **mantido byte a byte** (como o prompt exige);
   a garantia de capability está provada.
2. **Comentário "ATENÇÃO" órfão em `protecao-config.mjs` lia como TODO pendente.**
   → **Endereçado:** comentário atualizado para registrar a verificação do caminho `wt/*` (dentro da
   margem permitida M2.2 — comment-only, **lógica intacta**; hook reverificado após a mudança).

### BAIXO — endereçados
1. **"Os 4 agentes passam a ter tools mínimos" podia sugerir que os 4 mudaram.** → Redação de ADR-0150
   e CHANGELOG.md tornada precisa: 2 novos read-only + 2 existentes **inspecionados, sem mudança**.
2. **Commit M1 não registrou a inspeção de `explorador`/`implementador`.** → Registrado aqui: a inspeção
   ocorreu; ambos já tinham `tools` mínimos, nenhuma alteração aplicada (traceability fechada).

### Fora do escopo (registro, não bloqueia) — requer atenção do usuário
- **CLAUDE.md afirma "Orquestrador: Opus — fixado em `.claude/settings.json`", mas esse arquivo não
  existia** (só `settings.local.json`, pessoal, sem `model`). O `settings.json` criado nesta versão contém
  **apenas a chave `hooks`** — **nenhum `model` fixado**. Fixar (ou não) o `model` do orquestrador no
  `settings.json` versionado é **decisão do usuário** (fora do escopo deste patch; já registrado no ADR-0150).
  **→ Ver "Pendências / decisão do usuário".**

O parecer completo (com itens verificados sem achado) está no transcript do ensaio; o resumo acima é fiel.

---

## Pendências / decisão do usuário

- **`model` do orquestrador no `settings.json`:** o `settings.json` versionado nasceu nesta versão só com
  `hooks`. Se você quer o Opus **fixado no arquivo versionado** (como o CLAUDE.md afirma), diga — adiciono
  `"model": "opus"` (ou o valor que preferir) num patch/commit dedicado. Hoje o `model` não está fixado em
  nenhum `settings.json` versionado.
- **Bootstrapping:** os hooks só disparam sozinhos **a partir da próxima sessão** (o Claude Code lê
  `settings.json` no início). Nesta missão foram instalados e testados por invocação direta.

## Escopo fechado — achados registrados (não implementados)
- Nenhuma ideia nova de hook/agente foi implementada (escopo fechado). Sem achados adicionais de escopo.

## Arquivos criados / modificados

**Novos:**
- `.claude/agents/revisor.md`, `.claude/agents/revisor-db.md`
- `.claude/hooks/protecao-config.mjs`, `.claude/hooks/gate-stop.mjs`, `.claude/hooks/contexto-sessao.mjs`
- `.claude/settings.json`
- `docs/WORKING-CONTEXT.md`
- `docs/adr/0150-revisao-contexto-separado-e-hooks.md`
- `docs/briefings/WT_Finance_Out_Briefing_v5-1-3_Upgrade_Harness.md` (este arquivo)

**Modificados:**
- `CLAUDE.md` (substituído pelo A0 — 9 edições)
- `package.json` (5.1.2 → 5.1.3)
- `CHANGELOG.md`, `src/data/changelog-diretoria.ts`

## Aprendizado permanente para o CLAUDE.md
- Nenhum novo — o CLAUDE.md já foi **atualizado por esta própria versão** (protocolo de revisão, hooks,
  memória de sessão, pesquisar-antes-de-codar, compactação estratégica). Sem aprendizado adicional a destilar.

## Definition of Done
- [x] `npm run build` limpo · [x] `npx tsc --noEmit` 0 erros · [x] `npm run lint` sem warnings · [x] `npm test` verde (414)
- [x] Parecer do `revisor` emitido; MÉDIO/BAIXO endereçados (CRÍTICO/ALTO: nenhum). `revisor-db` N/A (sem migration).
- [x] Sem migration (nada a aplicar) · [x] ADR-0150 registrado (número real)
- [x] `CHANGELOG.md` + `CHANGELOG_DIRETORIA` com a entrada · [x] `package.json`/`version.ts` em 5.1.3
- [x] Out-briefing gerado (com Parecer + matriz de testes) · [x] `docs/WORKING-CONTEXT.md` atualizado
- [x] CLAUDE.md avaliado (já atualizado pela versão) · [ ] Worktree limpa (após merge) · [ ] PR aberto (a seguir)
