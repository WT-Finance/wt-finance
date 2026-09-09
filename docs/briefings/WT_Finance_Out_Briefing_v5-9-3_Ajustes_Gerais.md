# Out-Briefing v5.9.3 — Ajustes gerais

**PATCH** · branch `feat/v5-9-3-ajustes-gerais` · migration **`0266` (aditiva) APLICADA em
09/09** · **sem ADR novo** · **1185 testes** (de 1171) · base: `origin/main` na v5.9.2 (`f289867`)

Rota B: o plano validado em plan mode virou a spec
(`docs/briefings/spec-v5-9-3-ajustes-gerais.md`, commit `72e1e99`). Cinco pedidos do Yan
depois de ver a v5.9.2 no ar (numeração original do pedido: 1, 2, 3, 6, 7).

---

## 1. O que foi entregue

| # | Pedido | Estado |
|---|---|---|
| 1 | Normalizar a cor de títulos e subtítulos em toda a plataforma; registrar no DS | entregue (M1) |
| 2 | "Resultado Financeiro" ao lado de "Custo dos Serviços Prestados" na grade da DRE | entregue (M2) |
| 3 | Badge vermelho numérico em "Abertas" e "Aprovadas"; "Encerradas" sem | entregue (M3) |
| 6 | Badge de solicitações de acesso pendentes na sidebar e na pill de Usuários e Acessos | entregue (M6, `0266`) |
| 7 | Inverter o padrão de ordenação de Vencimento no Gerencial | entregue (M7) |

**Decisões de produto tomadas com o Yan na abertura (09/09):** subtítulo = `--text-subtle`
(#ACA39A); alcance = cabeçalho de página **e** subtítulos de seção; item 7 = abrir em `asc`
(o default anterior já era Vencimento `desc`, data maior primeiro — "inverter" pedia confirmação).

Paralelização: **5 subagentes `implementador` em paralelo** numa única worktree (M1, M2, M3, M6,
M7 — arquivos disjuntos; `rpc-contrato.test.ts` ficou com o orquestrador porque M2 e M6 o tocam).
Revisão: `revisor` + `revisor-db` em paralelo.

---

## 2. O que a medição e a revisão mudaram no caminho

### 2.1 Três dialetos de cor, e a brecha que os deixou entrar (M1)

Não existia primitivo de cabeçalho de página. O mapeamento achou **16 telas** em
`text-zinc-900`/`text-zinc-400` inline, a DRE (v5.9.2) em `text-text-secondary` (#4B4F54 — o mais
escuro dos três, e exatamente a diferença que aparecia nos prints do Yan) e as **7 telas de auth**
em `style={{ color: 'var(--text-muted)' }}`, invisível ao lint. A página `/admin/design-system`
prescrevia "descrição em cor terciária" sem nomear token. Regra que fica: título de página
`text-text-primary`, subtítulo de página e de seção `text-text-subtle`, registrada em três lugares
(`docs/design-system.md`, skill `ui-design-system` §3, `/admin/design-system`) e **enforçada pela
sonda** `src/styles/cabecalho-pagina.test.ts` — o `eslint.config.mjs` é protegido pelo hook, então
o enforcement nasceu como teste que lê a fonte, não como regra de lint (ver §5, item ALTO).

**Escopo corrigido no fechamento:** as 4 linhas de `editor-dre.tsx` que a spec listava como
"subtítulo de seção" são **rótulos de item de lista e texto de corpo com números** ("Efeito nos
subtotais"), não subtítulos — em `--text-subtle` ficariam pouco legíveis. Ficaram em
`--text-secondary`, que o `docs/design-system.md` agora documenta como "texto secundário/H3,
nunca subtítulo". (MÉDIO do `revisor`, decisão consciente.)

### 2.2 O único grupo que pode ser positivo (M2)

`FIN` ("Resultado Financeiro") é folha viva da árvore de competência (seed `0256`, 15 categorias:
IOF, juros e multa, taxa de cartão, tarifas, rendimentos, câmbio…) e saiu de graça de
`folhasPorGrupo`. O que **não** saía de graça: a escala da grade pressupunha série ≤ 0
(`topo = Math.min(0, …)`) — um ano com resultado financeiro positivo teria o ponto **expulso do
gráfico sem erro**, o mesmo defeito silencioso que a v5.9.2 pegou em RH. A janela passou a ter
topo livre quando a série tem algum ponto positivo, e os ticks a ancorar em zero (para a marca `0`
aparecer sempre que estiver no domínio).

Medido na base viva, hoje nenhum ano é positivo:

| grupo | 2024 | 2025 | 2026* |
|---|---|---|---|
| FIN — Resultado Financeiro | −4,63% | −5,49% | −2,68% |

**Decisão do orquestrador contra o subagente:** o implementador tirou a inversão do eixo só do
FIN ("mais alto = melhor"). Revertido: numa grade de escala comparável, **"para cima" precisa
significar a mesma coisa em todos os cards** — os 8 seguem invertidos, e um FIN positivo apareceria
abaixo da linha do zero.

### 2.3 Um número em toda rota, não a lista (M6)

Não existia RPC de contagem de pedidos de acesso. Derivar do `admin_listar_solicitacoes` serviria à
pill, mas não à sidebar, que renderiza em toda rota. RPC nova `admin_acesso_solicitacoes_pendentes()`
(`0266`), gated em `admin/acessos`; a promise é criada no layout raiz **só para quem tem a área**
(o gate da RPC nega, não devolve zero — sem o filtro no TS, todo usuário sem a área dispararia um
erro por navegação). A sidebar deixou de ter o badge hardcoded no href `/solicitacoes`: virou um
mapa `badgesPorHref`. De carona, `erroCarga` de `/admin/acessos` passou a considerar a falha da
listagem, que antes virava "0 pendentes" em silêncio — com o badge vindo de outra RPC, seriam dois
números vizinhos discordando.

**Verificado via REST:** service_role executa o corpo e devolve `0`; anon recebe `401`
(`permission denied for function`). Hoje há **0 pedidos pendentes** — o badge só aparece quando
alguém pedir acesso em `/solicitar-acesso`.

---

## 3. Migrations e ADRs

- **`0266_admin_acesso_pendentes.sql`** — ADITIVA (função nova + REVOKE/GRANT + COMMENT). Aplicada
  em 09/09 via `npm run db:migrate -- --aditiva`, backup-gate VERDE (58/58 tabelas, restore-test
  3/3). Numeração conferida no banco (`migration list` até 0265), nas worktrees irmãs e no `origin`
  (nenhuma versão em voo). **Próxima livre: `0267`.**
- **ADR:** nenhum. A regra de cor é convenção do DS (`docs/design-system.md`), não decisão
  arquitetural. Próximo ADR livre segue **`0172`**.

---

## 4. Arquivos (por missão)

- **M1** — 16 páginas/componentes de cabeçalho + `dre/page.tsx` + `admin/design-system/page.tsx` +
  5 telas de auth; subtítulos de seção em `shared/top-section.tsx`, `ui/card.tsx`,
  `financeiro/collapsible-section.tsx`, `fluxo-caixa/page.tsx`, `dre/cascata-card.tsx`,
  `weddings/sumario-subsetor.tsx`; `onboarding/welcome-janus-modal.tsx` (h1 de `style` para classe,
  pego pela sonda robustecida); docs: `docs/design-system.md`,
  `.claude/skills/ui-design-system/SKILL.md`; sonda nova `src/styles/cabecalho-pagina.test.ts`.
- **M2** — `src/lib/dre/proporcao-grupos.ts` (+test), `src/components/financeiro/dre/grade-proporcao.tsx`.
- **M3** — `src/lib/solicitacoes/abas.ts` (+test, novo), `src/components/solicitacoes/board-solicitacoes.tsx`.
- **M6** — `supabase/migrations/0266_admin_acesso_pendentes.sql`, `src/lib/acessos/pendencias.ts`
  (novo), `src/app/layout.tsx`, `src/components/layout/sidebar.tsx`,
  `src/components/admin/acessos/acessos-content.tsx`, `src/app/admin/acessos/page.tsx`.
- **M7** — `src/lib/gerencial/ordenacao.ts` (+test, novo), `src/components/financeiro/gerencial/base-dados-tab.tsx`.
- **Transversal** — `src/lib/rpc-contrato.test.ts` (RPC 0266 na lista viva + negação anon; grade
  com 8 grupos), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json` (5.9.3),
  `docs/WORKING-CONTEXT.md`, este out-briefing.

---

## 5. Parecer da revisão

**`revisor-db` (0266): APROVADA, zero achados.** Verificou aditividade real, `exigir_acesso` inline
como 1ª linha (assinatura confirmada na `0133`), `SECURITY DEFINER` + `search_path ''`, grants sem
`anon`, `STABLE`, `CREATE FUNCTION` puro (função nova), índice parcial `status='pendente'` da `0125`
cobrindo o `count`, `service_role` passando o gate no contrato, e a pill continuando derivada da
listagem (mesma tabela, mesmo `status` — sem risco de discordar da RPC nova).

**`revisor` (código): APROVADO COM RESSALVAS.**

| Sev. | Achado | Como foi endereçado |
|---|---|---|
| **ALTO** | `--text-subtle` (#ACA39A) sobre branco tem contraste ≈ **2,5:1**; WCAG AA pede 4,5:1 para texto de 13–14px. A M1 espalha o token para o subtítulo de ~25 telas + 7 seções. | **Registrado, não revertido — é decisão de produto do Yan** (tomada na abertura, sem o número em mãos). Contexto: o `zinc-400` que as 16 telas já usavam tem ≈ 2,6:1 — a versão **não piora** o que estava no ar, só unifica. `--text-muted` (#75777B, ≈ 4,6:1) passaria o AA. Trocar é **uma linha** por arquivo (`text-text-subtle` → `text-text-muted`) mais a sonda; ver §7. |
| MÉDIO | As 4 linhas de `editor-dre.tsx` listadas na spec ficaram em `text-text-secondary`, sem registro da divergência. | Decisão consciente do orquestrador (rótulos de item e texto com números, não subtítulo) — registrada em §2.1. |
| BAIXO | A sonda casava `<h1` por linha; tag com atributos multilinha escapava. | **Corrigido**: a sonda casa a tag inteira com `/gs` sobre o texto do arquivo; ao ficar robusta, pegou o `<h1>` do modal de onboarding com cor via `style` — migrado para `text-text-muted` (mesmo tom). |
| BAIXO | Ticks ancorados em zero mudam as marcas dos 7 gráficos antigos quando a janela desceu por borda. | Medido na base viva: os domínios e ticks dos 7 saem **idênticos** aos da v5.9.2 (ex.: RH `[−43,14; −31,14]` ticks `−42…−33`; MKT topo −0,008 sem tick 0, como antes). Conferir na visual. |

Itens verificados sem achado pelo revisor: prova algébrica da janela livre (`amplitudeComum` é o
máximo), `contarPorAba` exaustivo e mutuamente exclusivo contra os 5 status, `/admin/acessos` é
item de 1º nível (passa pelo caminho do badge), `erroCarga` não bloqueia a tela (faixa de erro),
zero `console.log`/`-[--token]` nos arquivos tocados.

---

## 6. Aprendizado — régua de 5 destinos

1. **Enforcement mecânico:** a sonda `cabecalho-pagina.test.ts` é o destino 1 possível sem tocar
   config protegida. O destino "de verdade" é estender `wt/no-cor-hardcoded` a `zinc` — decisão
   humana (mexe em ~400 ocorrências fora dos cabeçalhos). Diff pronto, `eslint.config.mjs:45-46`:
   ```diff
   -  INICIO_CLASSE + "(bg|text|border|ring|fill|stroke|from|to|via)-(emerald|amber|red|green|blue|yellow)-\\d{2,3}\\b",
   +  INICIO_CLASSE + "(bg|text|border|ring|fill|stroke|from|to|via)-(emerald|amber|red|green|blue|yellow|zinc)-\\d{2,3}\\b",
   ```
   Aplicar exige `WT_PERMITIR_CONFIG=1` e um patch próprio para tokenizar o `zinc` restante.
2. **Skill `ui-design-system`** (destino 4): ganhou a regra de cabeçalho em §3. Vale acrescentar,
   numa próxima passada, que **"cinza claro" tem custo de contraste** — a skill hoje não fala de
   WCAG; a `web-design-guidelines` fala, mas só o revisor a lê.
3. **Skill `orquestracao`** — precedente que confirma a Carta: o subagente da M2 tomou uma decisão
   de leitura visual (eixo do FIN sem inversão) que era coerente com a skill `graficos` lida
   isoladamente, mas incoerente com a **grade** como conjunto. Delegar o contrato funcionou: ele
   relatou a decisão como não-óbvia, e o orquestrador decidiu. Nada a mudar.
4. **Durável de processo:** "inverter a ordenação" precisou de pergunta — o default que o pedido
   queria inverter já era `desc`. Ler o estado atual antes de interpretar o verbo evitou implementar
   o contrário do pedido.

---

## 7. Pendências

- 🔴 **Yan — decidir com o número em mãos (§5, ALTO):** manter `--text-subtle` (≈ 2,5:1, estética
  escolhida) ou trocar por `--text-muted` (≈ 4,6:1, passa o AA). A troca cabe num patch de uma
  linha por arquivo.
- 🔴 **Yan — conferência visual em produção após o merge:** subtítulos mais claros nas ~25 telas;
  1ª linha da grade da DRE com 2 gráficos e os 7 antigos sem marcas estranhas; badges em
  Abertas/Aprovadas (Encerradas sem); badge de acessos na sidebar e na pill (precisa de **um pedido
  pendente** — hoje há 0); Gerencial abrindo em 2024 e o 1º clique em Vencimento invertendo.
- `verificador-visual` **não foi despachado** (sem sessão autenticada no ambiente; modelo que
  funciona segue "entregar → Yan confere → ajustar", v5.4.1).
- Pré-existente, registrado: a "Caixa de entrada" conta abertas+aprovadas de **mim+role** pela RPC e
  não respeita o escopo selecionado — os três badges só somam quando o escopo é `mim_e_role`.
- Depois do merge: `/pos-merge` reconcilia a hora do CHANGELOG_DIRETORIA (`2026-09-09T15:09` é
  autoria).

## 8. Fronteira (fica fora)

Tokenizar `zinc-*` fora dos cabeçalhos · estender o lint (decisão humana) · escopo na "Caixa de
entrada" · reescrever textos históricos do changelog que dizem "sete gráficos" (história não se
edita) · h2/labels em zinc dentro das páginas.
