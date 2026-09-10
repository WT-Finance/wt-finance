# Briefing v5.9.4 — Varredura de dívida: acessibilidade, RBAC e higiene

**Tipo:** PATCH · **Migration:** **1 aditiva** (dois `CREATE OR REPLACE`; toma o próximo número livre — a v5.9.3 tomou a `0266`, então provavelmente `0267`; **conferir no banco e nas worktrees irmãs na hora**) · **ADR:** **1 novo** (as-built da API externa, consolidando 0158–0161 — próximo livre `0172`, conferir no remoto) + **1 emenda** (ADR-0099) · **Base:** `main` **após o merge da v5.9.3** · **Branch:** `fix/v5-9-4-varredura-divida` · **Rota A** (uma decisão de produto embutida: item 19)

> ## ⚠️ Sequência
> Abrir **depois** do merge da v5.9.3. Ela toca 17 cabeçalhos de tela e o `page.tsx` da DRE; esta versão toca `app/financeiro/fluxo-caixa/page.tsx` e `ranking-caixa.tsx`. Em paralelo, seria conflito previsível — e a numeração da migration colidiria (lição paga três vezes na v5.9.0).

## Objetivo

Fechar de uma vez a dívida pequena e verificada na limpeza de 09/09/2026, agrupada em três frentes: **[A] banco** (dois hardenings de RPC), **[B] front** (varredura de classe dos gatilhos de ajuda + sonda que impede a reincidência, com caronas), **[C] higiene e docs** (código morto, assets órfãos, dois registros arquiteturais devidos). O item que justifica a versão é a **sonda** da frente B: o mesmo defeito já voltou duas vezes depois de estar escrito na skill.

**Fora, de propósito** (versões próprias ou decisão de negócio): `reverter_diario` robusto a múltiplos toques; alarme por soma nas bases de caixa; hooks do `harness-base`; fonte Avenir pública; tokenização dos `zinc-*`.

## Frente A — Banco (decisões firmes)

**A1 — `monde.monde_ingest_promover`:** trocar `sale_id = EXCLUDED.sale_id` (linha 37 da definição viva, incondicional) por **`sale_id = COALESCE(EXCLUDED.sale_id, monde.venda.sale_id)`**. Motivo: detalhe que chega sem `sale_id` num mês cujo `raw_hash` mudou sobrescreve o `sale_id` real com NULL — corrupção silenciosa, e NULL nunca é candidata à cura da v5.6.3. Nenhuma outra linha do `ON CONFLICT` muda.

**A2 — RBAC de `get_executiva_kpis`:** quem tem só `metas/acompanhamento` passa a poder ler a RPC (hoje vê "—" nos MetaCards e no Comparativo). **Decisão de produto do Yan (09/09): aceito** que isso expõe o payload executivo inteiro do setor a quem tem só a área de Metas.
- Hoje a RPC chama `app.exigir_acesso(app.areas_do_setor(p_setor))`, e o helper devolve só `performance/<setor>` por setor e `['executiva','performance']` no `ELSE`.
- **Antes de escolher ONDE mexer, enumerar os consumidores de `app.areas_do_setor`** (grep nas migrations + `pg_depend`/busca no catálogo). Se a RPC for a única consumidora, ampliar o helper; se houver outras, ampliar **no `PERFORM` da RPC** (`areas_do_setor(p_setor) || ARRAY['metas/acompanhamento']`) para não alargar acesso de RPCs que ninguém pediu. Registrar a escolha no out-briefing.

**Regras da migration:** corpos extraídos do **catálogo vivo** (`pg_get_functiondef`), nunca da migration de origem; `revisor-db` **antes** de aplicar; verificação **via REST/service_role** (`db query` não executa o corpo); classificação aditiva confirmada pelo `classificarSql` antes do `db:migrate -- --aditiva`.

## Frente B — Front: gatilhos de ajuda e caronas

**B1 — Primitivo único.** Extrair um `GatilhoAjuda` (nome a alinhar com a skill `ui-design-system` §2) em `src/components/ui/` com a receita canônica: `<button type="button">` + `foco-neutro` + `aria-label` no formato `"${rótulo}: ${texto}"` + o visual atual (círculo de 12px, borda, "?"). É o dono único da forma; call-sites não reimplementam.

**B2 — Varredura dos sete call-sites**, todos para o primitivo: `solicitacoes/modal-nova-solicitacao.tsx:136` · `financeiro/ranking-caixa.tsx:58` · `financeiro/repasse-mensal.tsx:130` · `financeiro/tempo-vida-caixa.tsx:117` · `financeiro/posicao-projetado.tsx:252` · `app/financeiro/fluxo-caixa/page.tsx:71` (`KpiCelula`) · `financeiro/faturamento-corp.tsx:749` — este tem `aria-hidden`: **conferir se já existe gatilho acessível ao lado**; se existir, só o visual migra para o primitivo; se não, é o oitavo defeito. Os dois pontos já corrigidos na v5.7.0 (`tabela-dre`, `resumo-executivo`) também passam a usar o primitivo (senão a receita continua duplicada).

**B3 — Sonda (régua, destino 1).** Teste que varre `src/app/**` e `src/components/**` e reprova qualquer `>?</span>` — molde: `cabecalho-pagina.test.ts` (v5.9.3) / `nav-model.test.ts`. **Vista reprovando** (7 vermelhos, com os caminhos enumerados na saída) **antes** da B2, depois verde. Sem a sonda, a versão não fecha.

**B4 — Caronas (mesma frente, arquivos disjuntos):**
- As 3 ocorrências de `"não representa aplicação real"` viram **uma constante** em `src/lib/weddings/` (ex.: `NOTA_FLOAT_TEORICO`), consumida pelos três pontos (coluna, drawer, gráfico).
- **Schemas Zod** para as duas RPCs do float que hoje passam sem contrato: `get_rendimento_float` (`app/api/dashboard/weddings/operacao/[id]/route.ts:42`, via `chamarRpc`) e `get_taxas_cdi` (`components/performance/weddings-content.tsx:67`, via `RpcFrouxa` bind). Skill `contrato-rpc-front`; **preservar o comportamento de degradação** documentado na route ("degrada, não derruba"). Casos de contrato via REST para ambas.

## Frente C — Higiene e docs

**C1 — Código morto:** excluir `src/lib/carga/parse-contas-pagar-receber.ts` (órfão confirmado: zero importadores; reconfirmar com grep no ato, e levar junto teste/fixture exclusivos dele se houver).

**C2 — Assets órfãos em `public/`:** `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` saem. `apple-touch-icon.png` **só depois de grep** em `src/`, `app/layout*`, `manifest`/metadata e `next.config` — se referenciado, fica e o item encerra como "não órfão".

**C3 — Emenda datada ao ADR-0099:** o título fala em "valor" mas o corpo decide só sobre datas; a emenda registra a metade que faltava e aponta para o tratamento de valor consolidado na v5.5.2 (leitura dupla nativo/string; `raw` no `sheet_to_json`, não no `read`). Não reescrever o texto original.

**C4 — ADR as-built da API externa** (número novo, `0172` a confirmar): consolida o modelo **como construído** que os ADRs 0158–0161 descrevem em cadeia de emendas — e corrige o fato de que o 0158 ainda diz "autor = robô", falso. Fonte de verdade: **código e catálogo vivos** (RPCs da API, tabelas, whitelist única, outbox removida) + out-briefing da v5.4.0, nunca os quatro ADRs antigos. Os quatro **não são apagados**: ganham cabeçalho "Superseded by ADR-0172" e ficam como histórico.

## Invariantes (inegociáveis)

1. **Migration aditiva**, corpos do catálogo vivo, `revisor-db` antes, REST depois. Nenhuma outra RPC muda de comportamento (A2 escolhe o ponto de mudança justamente para isso).
2. **A sonda é vista reprovando antes de valer.** Fecha a versão em vermelho se sobrar um `>?</span>`.
3. **Zero regressão visual/funcional** nos sete pontos: mesmo lugar, mesmo tamanho, tooltip abre no hover **e no foco** (é para isso que o `button` existe).
4. **Exclusões só com grep de importadores/referências no ato** — órfão de memória não é órfão de fato.
5. **ADRs antigos preservados** com marcador de superseded; o ADR novo descreve o as-built, não o planejado.
6. **Degradação das RPCs do float preservada** ao introduzir schema — `parseRpc` que falha vira o mesmo caminho de "sem dado", não erro novo na tela.
7. **Formatação e tokens via DS** no primitivo — nada de `zinc-*` novo (as ocorrências atuais nos spans **saem** com eles).

## Missões (paralelizáveis por arquivos disjuntos; ímãs de dono único: `ui/` do primitivo → B1 antes de B2; `rpc-contrato.test.ts` → só a sessão principal)

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Banco:** enumerar consumidores de `areas_do_setor`; migration aditiva com A1 + A2 (corpos do catálogo vivo); `revisor-db`; aplicar; REST. Sessão principal: casos de contrato — (a) `promover` com detalhe sem `sale_id` **preserva** o `sale_id` existente; (b) `areas_do_setor`/RPC aceita `metas/acompanhamento`; (c) negação a anon inalterada. | `pg_get_functiondef` pós-aplicação contém o `COALESCE`; sessão só-Metas (ou `exigir_acesso` simulado) passa |
| **M2** | **Sonda B3** — escrever, rodar, **ver 7 vermelhos** com os caminhos. | saída enumera exatamente os 7 (ou 8) call-sites |
| **M3** | **Primitivo B1** em `ui/` + registro na skill/DS doc (uma linha: "gatilho de ajuda = `GatilhoAjuda`, nunca span"). | tab-order alcança; leitor de tela lê `"${rótulo}: ${texto}"` |
| **M4** | **Varredura B2** (7 + os 2 da v5.7.0) para o primitivo; conferência do `aria-hidden` em `faturamento-corp`. Sonda fica verde. | grep `>?</span>` vazio; tooltip abre no foco em cada ponto |
| **M5** | **Caronas B4:** constante da nota; schemas Zod + `parseRpc` nas duas RPCs; casos de contrato via REST. | 3 pontos exibem a mesma string; degradação preservada (teste com payload inválido cai em "sem dado") |
| **M6** | **Higiene C1+C2** (com greps no ato) e **docs C3+C4**. | `npm run build` limpo após exclusões; ADRs antigos com marcador; ADR novo confere com catálogo vivo |
| **M7** | **Fechamento:** v5.9.4; CHANGELOG; CHANGELOG_DIRETORIA (uma linha: ajuda acessível por teclado em toda a plataforma; quem tem só Metas passa a ver os números dos cards); out-briefing com a saída da sonda vermelha→verde e o ponto escolhido em A2; WORKING-CONTEXT (migration aplicada, próxima livre). | — |

## Gates

Escalonados: `tsc`+`lint` por missão; `build`+`test` nas fronteiras (após M1; após M4) e no fechamento (baseline: a suíte pós-v5.9.3). `revisor` sempre; `revisor-db` na M1 antes de aplicar. `verificador-visual` nos sete pontos se disponível; senão, modelo "entregar → Yan confere no ar → ajustar".

## Checkpoint do Yan

**(A2)** validar o ponto escolhido — helper ou `PERFORM` — à luz da lista de consumidores. **(final)** navegar por Tab até um "?" em cada tela tocada e ver o tooltip abrir; abrir `/metas` com um usuário que tenha só Metas (ou simular) e ver os MetaCards preenchidos; conferir que o inventário Monde segue reconciliando após a A1 (tripwire verde na rodada seguinte); ler o ADR as-built contra o que está em produção.

## Fronteira

**Fora:** `reverter_diario` (16 — versão própria, com a assimetria do guard da `0260` × `0208`); alarme por soma nas bases de caixa (21 — feature, oracle próprio); hooks do `harness-base` (33 — trabalho no template, Rota B lá); fonte Avenir pública (24' — decisão de negócio pendente); tokenização dos ~400 `zinc-*` e lint `zinc` (fronteira da v5.9.3); qualquer mudança de comportamento em RPC além de A1/A2.

## Skills a ler (antes de implementar)

- `.claude/skills/banco-e-rpc/SKILL.md`
- `.claude/skills/contrato-rpc-front/SKILL.md`
- `.claude/skills/ui-design-system/SKILL.md` (§2 — a receita do gatilho)
- `.claude/skills/react-padroes/SKILL.md`
- `.claude/skills/orquestracao/SKILL.md` (Carta, antes de despachar)

## Commits sugeridos

1. `fix(db): promover preserva sale_id (coalesce) + metas/acompanhamento lê get_executiva_kpis`
2. `test(ui): sonda reprova gatilho de ajuda em span`
3. `feat(ui): primitivo GatilhoAjuda acessivel`
4. `fix(ui): varredura dos gatilhos de ajuda para o primitivo`
5. `chore(weddings): nota teorica unica + schemas zod das rpcs do float`
6. `chore: remove parser orfao e assets de template; docs: emenda adr-0099 + adr as-built da api externa`
7. `chore(release): v5.9.4`
