# Out-Briefing v5.9.7 — Atualização de segurança do `next`

**Tipo:** PATCH · **Rota C** (o prompt do Yan é a spec; sem briefing em `docs/briefings/`) · **Branch:**
`fix/v5-9-7-next-cve` · **Base:** `main` (v5.9.6, `a970135`) · **Migration:** nenhuma · **ADR:** nenhum ·
**Código de produção:** intocado · **Testes:** 1207 (mantidos).

Fechamento em 10/09/2026. Merge humano pendente.

## 1. O que foi feito

`next` 16.2.9 tinha **2 CVEs *critical* de RCE** (execução remota em host Windows; Image Optimization com
AVIF). O fix é **minor** — dentro do que um patch de segurança pode fazer sem tocar a fronteira de major.

1. **`next` e `eslint-config-next` → 16.3.4**, versões **exatas** (`--save-exact`, estilo já usado no
   `package.json`). Fecha os 2 *critical* e as high/moderate da faixa `>=16.0.0 <16.3.3`.
2. **Transitivas em cascata**, por `npm update` **nomeado**, **sem `--force`**, sem tocar dependências
   diretas: `postcss`/`sharp` (vieram no bojo do `next`), `brace-expansion`, `browserslist`, `js-yaml`
   (3 DoS *high*), `@babel/core`, `baseline-browser-mapping`. `esbuild` desceu para 0.28.2 via `tsx`.

## 2. `npm audit`: 13 → 4

| antes | depois |
|---|---|
| 1 *critical*, 7 *high*, 3 *moderate*, 2 *low* (13) | 0 *critical*, 1 *high*, 2 *moderate*, 1 *low* (**4**) |

As 4 restantes **exigem major** e ficaram FORA por decisão explícita do prompt:

| pacote | sev | fix | destino |
|---|---|---|---|
| `nodemailer` 9.0.1 | high | major 10 (breaking) | patch próprio (auditoria v5.10.0 D6-004) |
| `vitest` 3.2.6 + `@vitest/mocker` | moderate | major 5 (breaking; path traversal só em dev) | patch próprio (auditoria v5.10.0 D6-005) |
| `esbuild` (via `vite`←`vitest`) | low | sai junto com o `vitest` 5 | resolve com o `vitest` 5 |

Confirmado que `nodemailer` e `vitest` continuam em 9.0.1 e 3.2.6 (nenhum foi tocado). O `docs/backlog-v6.md`
que consolida esses itens é rascunho da v5.10.0 e vive na branch do PR #263 (ainda no GATE 1, não mergeado);
por isso este out-briefing referencia os achados D6-004/D6-005 diretamente, e não o arquivo.

## 3. Prova

- **Gates:** `tsc --noEmit` ✅ · `lint` ✅ · `build` ✅ · `npm test` **1207/1207** ✅ — todos com o `next` novo.
- **`proxy.ts` (camada 1)** — as CVEs incluíam bypass de proxy, então a camada 1 foi verificada dirigidamente
  no `next dev` real (porta 3457). Sem sessão via `curl`, com sessão via browser:

| caso | resultado |
|---|---|
| `/`, `/financeiro/dre`, `/metas`, `/trocar-senha`, `/admin/acessos` sem sessão | 307 → `/login?next=…` ✅ |
| `/api/dashboard/setores` sem sessão | 401 `AUTH_NECESSARIA` ✅ |
| `/api/dashboard/setores.png` sem sessão (furo S11 — path com ponto) | 401 `AUTH_NECESSARIA` ✅ (não escapa) |
| `/login`, `/solicitar-acesso`, `/auth/confirm` | 200 ✅ |
| `/api/monde/ingest`, `/api/cdi/ingest` com Bearer errado | 401 do **handler** (`requireAreaApi`), proxy deixa passar ✅ |
| `/api/externo/solicitacoes` sem sessão | 401 (auth por chave no handler) ✅ |
| `/fonts/avenir/*.otf`, `/logos/*` | fora do matcher (404 do arquivo, sem redirect) ✅ |
| usuário logado em `/login` | 307 → `/` ✅ (browser) |
| `/financeiro/dre` com sessão | renderiza a DRE ✅ (browser, screenshot) |

Nenhuma regressão de enforcement. O tempo de `proxy.ts` no log ficou em 7–20 ms.

## 4. Nota sobre `AGENTS.md`

O `next dev` 16.3.4 reescreveu `AGENTS.md` (bloco `nextjs-agent-rules`): acrescentou uma linha sobre
resolução de path em monorepo e uma instrução dizendo que o próprio bloco é regravado pelo `next dev` e
**deve ser commitado com o trabalho** para manter a árvore limpa. Segui a instrução do arquivo. Sem efeito
em runtime.

## 5. Fora de escopo (registrado, não tocado)

- `nodemailer` 10 e `vitest` 5 (majors) → backlog v6 B-02/B-03.
- A auditoria da v5.10.0 (PR #263) segue no GATE 1; este patch não toca `docs/auditoria-v5/`. A "frente única"
  da v5.10.0 admite um patch de segurança como exceção — quando a Fase 2 da v5.10.0 rodar, o `next@16.3.4`
  já estará no `main` e o achado **D6-003** estará resolvido (anotar na triagem).

## 6. Gates e disciplina

Nenhum arquivo de config de gate editado. Nenhuma migration escrita. `db:migrate` não invocado (patch sem
banco). Merge/deploy é do Yan.
