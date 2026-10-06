# Out-briefing — v6.2.2 · Segurança: alertas do Dependabot

**Branch:** `fix/v6-2-2-seguranca-deps` · **Rota:** C (patch técnico; pedido do Yan em 06/10: "seguir com o
patch de segurança" após o aviso do push da v6.2.1) · **Migrations:** N/A · **ADR:** N/A · **Fechada em:** 06/10/2026

## 1. Resumo

Os 4 alertas abertos do Dependabot no `main` foram tratados: 3 corrigidos por versão e 1 (sem versão
corrigida publicada) eliminado pela remoção da ferramenta que o trazia. Nenhum código de `src/` mudou.
O `npm audit` passou de 13 achados (9 high) para **5 high, todos uma única cadeia sem correção publicada**
(`braces`, só lint local), aceita como risco pelo Yan.

| Alerta | Severidade | Pacote | Escopo | Advisory | Tratamento |
|---|---|---|---|---|---|
| #59 | high | `sharp` (via `next`) | runtime, transitivo | GHSA-wq5f-xc86-pv6w — librsvg | 0.35.4 → **0.35.5** (+ `@img/sharp-libvips-*` 1.3.3 → 1.3.4) |
| #56 | high | `source-map-js` (via `postcss`, Tailwind, Vite) | transitivo | GHSA-68fv-2mgg-jv7q — DoS | 1.2.1 → **1.2.2** |
| #57 | moderate | `smol-toml` (via `knip`) | dev, transitivo | GHSA-r4xh-jqrq-34v2 — DoS | 1.8.0 → **1.9.0** |
| #58 | moderate | `sprintf-js` (via `depcheck` → `js-yaml` 3 → `argparse` 1) | dev, transitivo | GHSA-hp3w-g68c-fv3c — DoS; **sem versão corrigida** | **`depcheck` removido** (decisão do Yan) |
| — | high (`npm audit`) | `braces` (via `eslint-config-next` → `fast-glob` 3.3.1 → `micromatch`) | dev, transitivo | GHSA-vfj7-8cjw-p6xm — DoS; **sem versão corrigida** | **risco aceito** (decisão do Yan) |

## 2. Decisões técnicas

- **`npm audit fix` sem `--force`** para os três corrigíveis: cabem nas faixas já declaradas (`^0.35.4`,
  `^1.2.1`, `^1.8.0`) — só o lockfile muda, sem `overrides`. 706 = 706 entradas nesse passo.
- **Exposição real do #59 era nula:** `next.config.ts` sem bloco `images` (nem `dangerouslyAllowSVG`, nem
  `remotePatterns`), então o otimizador só atende arquivos de `public/` e SVG não passa pelo `sharp`; o
  librsvg exigiria SVG controlado por terceiro. O bump é obrigatório pela superfície do pacote.
- **`sprintf-js` e `braces` não têm versão corrigida** (as últimas publicadas, 1.1.3 e 3.0.3, estão na faixa).
  O `--force` do `npm audit` "corrigiria" rebaixando `depcheck` e `eslint-config-next` 16 → 14 —
  descartado. Opções levadas ao Yan: remover o `depcheck`, aceitar o risco, ou `overrides` de `argparse` 2.
  **Decisão: remover o `depcheck`.**
- **Paridade antes de remover:** o `depcheck` achava só o falso positivo do Tailwind (D6-001), ele mesmo e
  o `knip`. O `knip` **não rodava** — o `knip@6` recusava a config inteira pelas chaves `"//"` usadas como
  comentário (B-40). Com a mesma config sem os comentários, o knip acusou exatamente o `depcheck` como não
  usado. Por isso o B-40 entrou neste patch: a premissa "o knip cobre o papel do depcheck" só é verdade com
  o knip funcionando. **`knip.json` → `knip.jsonc`**, mesmas exceções, comentários reais.
- `node_modules` da worktree por `npm ci` real (lockfile mudando).

## 3. Arquivos

`package.json` (sem `depcheck`; version 6.2.2), `package-lock.json` (família `sharp`, `smol-toml`,
`source-map-js`; −63 pacotes da árvore do `depcheck`), `knip.json` → `knip.jsonc`, `docs/estado-do-projeto.md`,
`docs/backlog-v6.md` (B-40 riscado), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing,
`docs/WORKING-CONTEXT.md`.

## 4. Gates e prova

- `npx tsc --noEmit` ✓ · `npm run lint` ✓ · `npm run build` ✓ (sem avisos) — rodados depois de cada um dos
  dois passos (bump dos três; remoção do `depcheck`).
- `npm test`: **1.964 passaram, 6 skipped**; 1 arquivo vermelho — `oraculo-demonstrativo.test.ts` (fixture
  `demonstrativo-cru.xlsx` perdida, B-38). **Controle:** idêntico ao fechamento da v6.2.1 no mesmo dia.
- **Smoke do servidor de produção** (`next start`): `/login` 200; `/`, `/solicitacoes`, `/financeiro/dre`,
  `/admin/ingestao` 307 → `/login?next=…`; `/api/ingestao/vigia` 401; **`/_next/image` de um PNG de
  `public/logos` → 200 `image/webp` 64×12**, exercitando o `sharp` 0.35.5/libvips 1.3.4 de verdade. Log sem
  erro nem aviso.
- `npx knip --include dependencies,unlisted,unresolved,binaries` → exit 0, sem achados.
- Lockfile: proveniência `registry.npmjs.org` + `integrity` sha512 nas 30 entradas alteradas; na remoção,
  63 saem, 0 entram, 0 mudam de versão. `npm audit`: só a cadeia `braces` (5 high).

## 5. Parecer da revisão

**revisor — 1ª passada (`f970723`): APROVADO COM RESSALVAS.** 0 CRÍTICO/ALTO, 2 MÉDIO, 4 BAIXO.

| Achado | Endereçamento |
|---|---|
| M estado final não é "audit = 0"; #58/`braces` abertos | Endereçado pela decisão do Yan (§2) e registrado aqui e no CHANGELOG |
| M working tree adiante do commit revisado (bump + changelogs) | Esperado: era o fechamento ainda não commitado |
| B CHANGELOG citava out-briefing ainda inexistente | Este arquivo |
| B "sem `src/` alterado" impreciso (changelog-diretoria) | Corrigido: "nenhum código de `src/`" |
| B `source-map-js` rotulado "build" | Corrigido (também via `postcss` do `next`) |
| B cadeia do `braces` incompleta | Corrigido |

Recomendações do revisor que orientaram a decisão: remover o `depcheck` (custo-benefício), conferindo
antes com o `knip`; aceitar o `braces`.

**revisor — 2ª passada (`10adb73`, remoção + `knip.jsonc`): APROVADO COM RESSALVAS.** 0 CRÍTICO/ALTO/MÉDIO, 3 BAIXO.
Confirmado: nenhum dos 63 removidos é importado por `src/`, `scripts/`, `supabase/seed/` ou configs (grep
de ~30 nomes); versões hoistadas que ficaram (`js-yaml`, `semver`, `minimatch`, `micromatch`…) **idênticas
ao main**; `knip.jsonc` com as mesmas 6 + 2 exceções e nome suportado pelo knip 6 (`constants.js`, parser
`.jsonc`); nenhuma referência viva a `depcheck`/`knip.json` em CLAUDE.md, skills, hooks ou README.

| Achado | Endereçamento |
|---|---|
| B ADR-0173 e CHANGELOG antigo citam `knip.json` | Mantidos: registro histórico (ADR aceito não se reescreve) |
| B esta linha apontava para seção inexistente | Corrigido (este parágrafo) |
| B paridade provada só nas categorias de dependência do knip | Registrado — é o que o `depcheck` fazia; o knip completo (arquivos/exports) não foi rodado nesta versão |

**revisor-db / verificador-visual:** N/A.

## 6. Pendências — o que só o Yan tem

- Os alertas do Dependabot fecham sozinhos depois do merge (o GitHub lê o `main`): #56, #57, #58, #59.
- 🔴 **`braces`** não tem alerta no Dependabot hoje (só no `npm audit`). Se aparecer, dispensar com motivo
  "tooling, sem correção, entrada não confiável inalcançável" — ou aguardar a correção upstream.
- Risco residual: sem release notes locais da 0.35.5 do `sharp`/libvips 1.3.4; provado só o caminho real
  (PNG pelo `next/image`).

## Advisor

| Agente | Consultas | Mudaram o rumo |
|---|---|---|
| Orquestrador | 0 | — |
| revisor | 0 | — |

Custo: pendência do Yan (`/usage`).
