# Out-Briefing v5.10.1 — Atualização de segurança do ambiente de testes (`vitest` 5)

**Tipo:** PATCH · **Rota C** (o prompt do Yan é a spec; sem briefing em `docs/briefings/`) · **Branch:**
`chore/v5-10-1-vitest-5` · **Base:** `main` (v5.10.0, `d5cc593`) · **Migration:** nenhuma · **ADR:** nenhum ·
**Código de produção:** intocado (nenhum arquivo de `src/` fora do changelog da diretoria) ·
**Testes:** 1.220 (idênticos à baseline, zero `skip`).

Fechamento em 13/09/2026. **Mergeada — PR #267, 14/09/2026 às 08:38** (`3d582ff`).

## 1. O que foi feito

`vitest` 3.2.6 arrastava a CVE *moderate* **GHSA-82fw-gwwq-j7x9** no `@vitest/mocker` (*path traversal* /
leitura arbitrária de arquivo via *redirect mock*, faixa afetada `2.1.0 – 4.1.10`). O fix exige **major** —
e são **dois saltos**, 3 → 4 → 5. Resolve **B-03** do `docs/backlog-v6.md` (achado **D6-005** da auditoria
da v5.10.0), que a v5.9.7 havia deixado explicitamente para "patch próprio".

1. **`vitest` `^3.2.6` → `^5.0.0`** (efetivo 5.0.0; `vite` 7.3.5 → 8.3.0 no bojo, `@vitest/mocker` 5.0.0).
2. **`@types/node` `^20` → `^24`** — **requisito duro**, não escolha: `vitest@5` declara *peer*
   `@types/node@"^22.0.0 || >=24.0.0"` e o `npm` recusa a instalação com `ERESOLVE` sem isso. Dev-only (só
   tipos, zero runtime). Escolhido `^24` e não o `latest` (26) para não descolar do runtime real — `.nvmrc`
   do repo é 24 e o Node local é v24.15.0. Resolve a fatia `@types/node` de **B-04**.
3. **`vitest.config.ts` e `vitest.setup.ts` intocados** — ver §3.

## 2. `npm audit`: 4 → 1

| antes | depois |
|---|---|
| 1 *high*, 2 *moderate*, 1 *low* (4) | 1 *high* (**1**) |

- Saiu a *moderate* do **`@vitest/mocker`** — o alvo do patch.
- Saiu **no bojo** a do **`esbuild`** (GHSA-g7r4-m6w7-qqqr), que vinha da árvore `vitest` ← `vite`.
  **A v5.9.7 previu exatamente isso** ("sai junto com o `vitest` 5") e a previsão se confirmou.
- **Nenhuma vulnerabilidade nova.**
- A *high* restante é o **`nodemailer`** (4 advisories) — dependência de **produção**, item **B-02**, fora
  do escopo deste patch dev-only por desenho explícito do prompt.

## 3. Por que nenhum ajuste de config: o cruzamento guia × repo

Os dois guias oficiais foram lidos (não se presumiu breaking change de memória) e cada mudança foi cruzada
com o uso **real** do repo. O resultado é que o risco anotado no backlog ("config e reporters mudam") **não
se materializou aqui**:

| Breaking change | Versão | Uso neste repo |
|---|---|---|
| `poolOptions` achatado, `workspace`→`projects`, `deps.inline`→`server.deps`, `maxThreads`→`maxWorkers`, `environmentMatchGlobs` removido | v4 | **Nenhum** — `vitest.config.ts` só usa `alias`, `environment`, `include`, `setupFiles`, `testTimeout` |
| reporter `basic` removido, `verbose` virou lista plana | v4 | **Nenhum** — não há reporter configurado nem flag `--reporter` |
| 3º argumento de `test()`/`describe()` tem de ser objeto | v4 | **Nenhum** |
| `vi.fn(impl).mockReset()` preserva a implementação | v4 | Nenhum `mockReset()` sobre `vi.fn(impl)` com implementação inicial da qual o teste dependa |
| `mock.invocationCallOrder` começa em 1 | v4 | **Nenhum** uso |
| **`clearMocks: true` virou o padrão** | v5 | **Redundante**: todo mock com estado já tem `mockReset()` explícito em `beforeEach` (`actions.test.ts:70`, `email.test.ts:138/249/323`, `fatura.test.ts:106`). Nenhum teste dependia do default antigo |
| `vi.mock`/`vi.hoisted` obrigatoriamente no topo | v5 | Já conformes (`email.test.ts:7`, `fatura.test.ts:7`) |
| `test.sequential`/`describe.sequential` removidos | v5 | **Nenhum** uso |
| Asserção async não-awaited passa a FALHAR | v5 | Todas as `.rejects` já `await`adas (`rpc-contrato.test.ts:1015-1017, 1035-1036`) |
| `toThrow("")` casa qualquer erro | v5 | **Nenhum** `toThrow('')` — todos sem argumento ou com regex |
| Títulos/inspeção passam a `pretty-format` | v5 | **Sem snapshots** no repo |
| Busca de config em diretório pai desabilitada | v5 | Config na raiz, encontrada normalmente |
| HTML/JSON/JUnit reporters mudam de destino | v5 | Não usados |
| Node ≥ 22.12 e Vite ≥ 6.4 | v5 | Node local 24.15.0, `.nvmrc` 24; `vite` resolvido em 8.3.0 — ver §6 |

## 4. Prova: as sondas foram vistas VERMELHAS

O prompt levantou o risco certo — uma sonda que lesse **saída ou reporter** do vitest poderia quebrar
calada numa major. **Não é o caso**: as duas fazem **análise estática do código-fonte** dos testes
(`readFileSync` + `readdirSync` + regex sobre `src/**/*.test.ts`), sem executar nada e sem ler o runner.
O formato da major não é insumo delas.

Mesmo assim, verde não prova nada — foram provadas **por mutação**, sob o `vitest` 5:

| Mutante injetado | Sonda | Resultado |
|---|---|---|
| `src/lib/zz-mutante-skip.test.ts` com `describe.skipIf` **não declarado** no `INVENTARIO` | `sonda-skipif-silencioso` | **REPROVOU** — "Teste novo usando skipIf sem entrada no INVENTARIO … `zz-mutante-skip.test.ts`" |
| `.env.local` escondido + `REQUIRE_CONTRACT=1` (o modo de falha da v5.4.3) | `sonda-skipif-silencioso` | **REPROVOU** nomeando as 3 ausentes: `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` |
| `src/lib/zz-mutante-pg.test.ts` abrindo `pg` e chamando função que grava, **sem** `BEGIN`/`ROLLBACK`/`lock_timeout`/`skipIf` | `sonda-teste-escreve-banco` | **REPROVOU em 2 casos** — o do contrato e o da lista fechada (`ESCREVEM_E_REVERTEM_HOJE`) |

Ambos os mutantes foram removidos; `git status` limpo de arquivos de teste. A sonda de escrita nunca
executou o mutante (só o arquivo da sonda foi rodado — ela lê o texto, não roda o teste).

## 5. Prova: gates e contagem

| gate | resultado |
|---|---|
| `npx tsc --noEmit` | ✅ limpo (inclusive com `@types/node` 24) |
| `npm run lint` | ✅ limpo, zero warning novo |
| `npm run build` | ✅ |
| `npm test` | ✅ **74 arquivos · 1.220 testes · 0 skip** |

**Baseline registrada ANTES de tocar em qualquer coisa** (vitest 3.2.6): 74 arquivos, 1.220 testes,
0 skip, 94,46 s. **Depois** (vitest 5.0.0): 74 arquivos, 1.220 testes, 0 skip, 72,60 s. Contagem
**idêntica** — nenhum teste sumiu nem virou `skip`. A suíte ficou ~22 s mais rápida.

A rodada foi feita **com `.env.local` presente** (copiado na criação da worktree — ele não vem no
`git worktree add`, lição da v5.4.3), então os ~180 casos de contrato **rodaram de verdade**, não se
auto-pularam.

## 6. Parecer da revisão

`revisor` despachado com contexto limpo sobre o diff. **Veredito: APROVADO COM RESSALVAS** — 1 achado
MÉDIO, 0 ALTO, 0 CRÍTICO, 0 BAIXO.

**MÉDIO — `engines.node` vs. piso real do `vitest@5`. ENDEREÇADO.** O `vitest@5` declara
`engines: { node: "^22.12.0 || ^24.0.0 || >=26.0.0" }`; o `package.json` do repo declara
`engines.node: ">=20.9.0"`. O campo `engines` do npm é **único para o pacote inteiro** e não separa
produção de dev — então um ambiente que siga literalmente o piso declarado (Node 20.9) instala sem aviso
forte e depois falha em `npm test` com erro obscuro do runner, não com "Node baixo".

Como foi endereçado: **o valor de `engines` foi mantido de propósito** (subi-lo trocaria o runtime de
produção da Vercel para resolver uma necessidade de ferramenta de teste — exatamente o efeito colateral
que o comentário da v5.10.0/D10-006 existe para evitar). O que mudou foi o **comentário `//engines`**, que
agora registra explicitamente que o piso vale para o runtime de produção, que o vitest 5 exige Node ≥ 22.12
para rodar a suíte, e que quem for rodar `npm test` precisa do Node do `.nvmrc` (24). A lacuna era textual
e foi fechada no texto.

**Itens que o revisor verificou sem achado** (resumo): escopo do diff conferido contra o `package.json` do
checkout raiz — só `vitest` e `@types/node`, ambos em `devDependencies`, **nenhuma dependência de produção
tocada**; `@vitest/mocker` resolvido para 5.0.0 e `esbuild` fora da faixa vulnerável no lock; varredura dos
breaking changes 3→4→5 contra `src/**/*.test.ts` e `scripts/**/*.test.mjs` sem uso afetado; e — respondendo
ao item 2 da delegação — **nenhum teste passando "pelos dois motivos"**: os pontos de maior risco (mocks
com estado, asserções assíncronas, `toThrow`) estão blindados por `mockReset()` e `await` **explícitos**,
não pelo default do framework.

## 7. Arquivos

| arquivo | o quê |
|---|---|
| `package.json` | `vitest` ^3.2.6 → ^5.0.0; `@types/node` ^20 → ^24; bump 5.10.0 → 5.10.1; comentário `//engines` (achado MÉDIO) |
| `package-lock.json` | resolução da árvore |
| `CHANGELOG.md` | entrada `[5.10.1]` |
| `src/data/changelog-diretoria.ts` | entrada 5.10.1 em linguagem de negócio (único arquivo de `src/` tocado; não é código de aplicação) |
| `docs/backlog-v6.md` | **B-03 riscado** (resolvido por execução) + fatia `@types/node` de B-04 |
| `docs/WORKING-CONTEXT.md` | "Em voo" = v5.10.1; tempo da suíte no vitest 5 |
| `docs/briefings/WT_Finance_Out_Briefing_v5-10-1_Vitest_5.md` | este arquivo |

## 8. Pendências e fronteira (fica fora)

- **`nodemailer` 9 → 10** (B-02, *high*, 4 advisories): dependência de **produção**, major com breaking,
  toca ação externa irreversível (skill `email`). Patch próprio. É a única vuln que resta no `npm audit`.
- **Aviso novo, não corrigido de propósito:** o `vite` 8 passou a avisar que `vitest.config.ts` usa sintaxe
  ESM sendo carregado como CommonJS (`configLoader: 'native'`, que será o default num major **futuro** do
  Vite). **Nada quebra hoje.** Não foi tocado porque (a) o prompt limitou o ajuste de config ao que a
  migração **exige**, e isto é aviso prospectivo, não exigência; e (b) a correção não é cosmética — o
  arquivo usa `__dirname` no `resolve.alias`, que **não existe** em ESM, então renomear para `.mts` ou
  declarar `"type": "module"` exige reescrever o alias e arrisca o gate inteiro num patch de segurança.
  Candidato a item de backlog v6.
- **Restante de B-04** (`typescript` 5.9 → 7, `eslint` 9 → 10, `@supabase/ssr` 0.10 → 0.12): intocado.
- **Incidente aberto das 306.261 linhas** (repovoamento por upload manual) segue como estava — este patch
  não toca banco, e `db:migrate` não foi invocado.

## 9. Aprendizado — régua de 5 destinos

Três coisas apareceram; **nenhuma vira regra nova**, e vale registrar por quê (adicionar ao core é
também podar — um patch de dependência não justifica linha nova no `CLAUDE.md`).

1. **"Sonda estática atravessa major do runner ileso; sonda que lê saída, não."** É a distinção que
   decidiu o risco desta versão. → **Destino 2 (já coberto)**: a convenção da v5.9.6 já manda a sonda
   varrer **código-fonte**, e é justamente por ela ter sido escrita assim que a major não a tocou. A
   lição confirma a convenção vigente em vez de criar outra. Fica no out-briefing.
2. **"Verde não prova sonda — prova por mutação."** → **Destino 2 (já coberto)**: a v5.9.6 já
   estabeleceu isto ("sonda precisa de caso que prove que enxerga o exemplo positivo") e as próprias
   sondas carregam um caso de autoconferência. Esta versão só **exerceu** a regra.
3. **`engines` do npm é único para o pacote e não separa produção de dev.** Armadilha real: um piso de
   produção correto pode passar a não cobrir o dev-tooling **sem nenhum erro visível na instalação**. →
   **Destino 1/2 (enforcement no lugar certo)**: registrado no próprio `//engines` do `package.json`, que
   é onde quem for mexer no piso vai ler. Não é transversal nem de toda sessão — não sobe para o core.

## 10. Gates e disciplina

Nenhum arquivo de config de gate editado. Nenhuma migration escrita. `db:migrate` não invocado (patch sem
banco). `src/types/database.ts` **não regenerado** — o passo do `/fechamento-versao` só se aplica quando a
versão cria ou altera RPC, e esta não tem banco. `revisor-db` e `verificador-visual` **N/A declarados**:
sem migration/RPC e sem UI. Merge e deploy são do Yan.
