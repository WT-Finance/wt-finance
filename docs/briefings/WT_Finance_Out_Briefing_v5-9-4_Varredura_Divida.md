# Out-Briefing v5.9.4 — Varredura de dívida: acessibilidade, RBAC e higiene

**PATCH** · branch `fix/v5-9-4-varredura-divida` · migration **`0267` (aditiva) APLICADA em
09/09 ~21h45** · **ADR-0172** (novo) + **Emenda ao ADR-0099** · **1193 testes** (de 1185) · base:
`origin/main` na v5.9.3 (`15574ea`)

Rota A: briefing `docs/briefings/briefing-v5-9-4-varredura-divida.md` (1º commit `a9ef415`), validado
contra o repo em plan mode por três exploradores antes de qualquer edição. Sete commits, um por missão.

---

## 1. O que foi entregue

**[A] Banco — `0267`, dois `CREATE OR REPLACE` a partir do catálogo vivo (zero drift em relação às
0178/0121, conferido por `pg_get_functiondef`):**
- **A1** `public.monde_ingest_promover()`: `sale_id=COALESCE(EXCLUDED.sale_id, d.sale_id)` no
  `ON CONFLICT DO UPDATE`. Nada mais no upsert muda.
- **A2** `public.get_executiva_kpis(...)`: `PERFORM app.exigir_acesso(app.areas_do_setor(p_setor) ||
  ARRAY['metas/acompanhamento'])`. Grants redeclarados sem `anon`.

**[B] Front:**
- **B1** primitivo `GatilhoAjuda` (`src/components/ui/gatilho-ajuda.tsx`, `'use client'`).
- **B3** sonda `src/components/ui/gatilho-ajuda.test.ts` — vista vermelha ANTES da varredura (§2.2),
  verde depois.
- **B2** **13** call-sites migrados (7 spans + 6 buttons — o briefing contava 7 + 2; ver §2.1).
- **B4** `NOTA_FLOAT_TEORICO`/`FRASE_NAO_APLICACAO_REAL` em `src/lib/weddings/textos.ts` (3 usos em 2
  arquivos); `rendimentoFloatSchema`/`taxasCdiSchema` em `src/lib/weddings/schemas-float.ts` com
  `parseRpc` na route da operação e em `weddings-content.tsx`, degradação preservada.

**[C] Higiene e docs:** parser órfão e 6 assets de `public/` removidos (greps no ato, §4);
Emenda ao ADR-0099; **ADR-0172** as-built da API externa; 0158–0161 com
`Status: Supersedido por ADR-0172`.

---

## 2. O que a validação e a medição mudaram no caminho

### 2.1 O briefing contava 7 + 2; eram 7 + 6 (M2/M4)

A sonda, escrita antes da varredura, enumerou **6** `<button>` copiando a receita, não 2: além de
`tabela-dre` e `resumo-executivo`, também `grade-proporcao`, `cascata-card`,
`gestao-pessoas/inventario/visao-geral-tab` e `weddings/lista-operacoes` (`AjudaHeader`). Todos
migraram — a regra (b) da sonda existe exatamente para que a receita não fique duplicada. O `span` de
`faturamento-corp` era de fato o **oitavo defeito**: o `Tooltip` envolvia `{titulo}` + span com
`aria-hidden`, sem nenhum elemento focável — o `focus-within` nunca disparava.

Duas divergências menores do briefing, ambas resolvidas pelos fatos: a função é
`public.monde_ingest_promover` (não `monde.`), e o `GRANT` original da 0121 concedia a `anon` — quem
revogou de todas as RPCs foi a **0133** (a 0122 ainda a preservava na allow-list; achado MÉDIO do
`revisor-db` sobre a nota do header, corrigido).

### 2.2 A sonda, vermelha e depois verde (B3)

Saída da 1ª rodada (`npx vitest run src/components/ui/gatilho-ajuda.test.ts`), já com o primitivo
excluído da varredura (a 1ª versão pegava o próprio comentário de cabeçalho do primitivo, que cita
`>?</span>` como texto — falso positivo corrigido antes de valer):

```
× nenhum <span>?</span> de ajuda fora do primitivo
  src/app/financeiro/fluxo-caixa/page.tsx:71
  src/components/financeiro/faturamento-corp.tsx:749
  src/components/financeiro/posicao-projetado.tsx:252
  src/components/financeiro/ranking-caixa.tsx:58
  src/components/financeiro/repasse-mensal.tsx:130
  src/components/financeiro/tempo-vida-caixa.tsx:117
  src/components/solicitacoes/modal-nova-solicitacao.tsx:136
× nenhum <button>?</button> de ajuda duplicando a receita fora do primitivo
  src/components/financeiro/dre/cascata-card.tsx:43
  src/components/financeiro/dre/grade-proporcao.tsx:220
  src/components/financeiro/dre/resumo-executivo.tsx:263
  src/components/financeiro/dre/tabela-dre.tsx:2019
  src/components/gestao-pessoas/inventario/visao-geral-tab.tsx:27
  src/components/weddings/lista-operacoes.tsx:130
Tests  2 failed (2)
```

Depois da M4: `Tests 2 passed (2)`; `grep -rn ">?</span>" src/` vazio.

### 2.3 A2: por que no `PERFORM` e não no helper (checkpoint do Yan, resolvido no plano aprovado)

`app.areas_do_setor` tem **15 RPCs consumidoras**, todas na `0121`: `get_executiva_kpis`,
`get_mix_produto`, `get_mix_setor`, `get_prejuizos`, `get_ranking_vendedores_range`,
`get_tendencia_margem`, `get_vendas_em_aberto`, `get_vendas_receita_negativa`,
`get_decomposicao_variacao`, `get_historico_12m_setores`, `get_historico_mensal`, `get_kpis`,
`get_ranking_produtos`, `get_ranking_vendedores`, `get_ritmo_diario`. Ampliar o helper daria
`metas/acompanhamento` às outras 14. A mudança ficou no `PERFORM` do wrapper, e o caso de contrato
afirma que o helper segue devolvendo `['performance/weddings']` / `['executiva','performance']`.

### 2.4 Prova comportamental da 0267 — transação REVERTIDA contra produção

Script `prova-0267.mjs` (fora do repo, `pg` direto, `BEGIN … ROLLBACK`), rodado uma vez após a
aplicação:

```
A1 alvo: venda 74260, sale_id=f356d6a1-41a2-4abc-81af-af0836c01ccf
A1 promover → {"ok":true,"itens":2,"ignoradas":0,"inseridas":0,"atualizadas":1}
A1 depois: sale_id=f356d6a1-41a2-4abc-81af-af0836c01ccf raw_hash=hash-ensaio-v594
A1 OK — sale_id PRESERVADO, linha atualizada (raw_hash novo)
A2 get_executiva_kpis (só-Metas) → OK, chaves: vendas, periodo, receita, margem_pct, faturamento, periodo_yoy…
A2 get_mix_setor (só-Metas) → negada como esperado: PERMISSAO_NEGADA: requer uma de [executiva, performance]
ROLLBACK — nada persistiu
```

REST pós-push: `get_executiva_kpis` com `service_role` → **200**; com `anon` → **401**. Backup-gate
VERDE (58 tabelas, restore-test 3/3). Casos de contrato do catálogo vivo (`rpc-contrato.test.ts`,
bloco "hardenings da v5.9.4") passando.

### 2.5 Tokens do primitivo

`border-zinc-300 text-zinc-400` → `border-wt-border-strong text-text-subtle` (mesma luminosidade; o
`@theme` mapeia a borda como `--color-wt-border-strong`, não `--color-border-strong` como o plano
supunha — fato do codebase, ajustado pelo implementador). O "?" passa a seguir a decisão pendente de
contraste do `--text-subtle` (v5.9.3, §7 daquele out-briefing).

---

## 3. Migrations e ADRs

- **`0267_promover_coalesce_sale_id_e_metas_le_kpis.sql`** — aditiva (classificador: `aditiva`, sem
  motivos), APLICADA 09/09 com gate verde. Única pendente na hora do push; nenhuma worktree irmã tinha
  0267; remoto conferido via `git log --all`. **Próxima livre: 0268.**
- **ADR-0172** `0172-api-externa-de-solicitacoes-as-built.md` — fonte: código e migrations vivas
  (0210–0227), não os quatro ADRs antigos. **Próximo livre: 0173.**
- **ADR-0099** — `## Emenda (09/09/2026, v5.9.4) — a metade que faltava: VALOR`.
- **ADR-0158, 0159, 0160, 0161** — `Status: Supersedido por ADR-0172 (as-built; este texto fica como
  histórico)`. Corpo intocado.

---

## 4. Arquivos (por missão / commit)

| Commit | Arquivos |
|---|---|
| `a9ef415` briefing | `docs/briefings/briefing-v5-9-4-varredura-divida.md` |
| `bae1740` M2 sonda | `src/components/ui/gatilho-ajuda.test.ts` |
| `d9805b7` M3 primitivo | `src/components/ui/gatilho-ajuda.tsx`, `.claude/skills/ui-design-system/SKILL.md` (§2), `docs/design-system.md`, `src/app/admin/design-system/page.tsx` |
| `7e1bf78` M1 banco | `supabase/migrations/0267_…sql`, `src/lib/rpc-contrato.test.ts` (bloco 0267) |
| `aaae131` M4 varredura | `src/app/financeiro/fluxo-caixa/page.tsx`; `src/components/solicitacoes/modal-nova-solicitacao.tsx`; `src/components/financeiro/{ranking-caixa,repasse-mensal,tempo-vida-caixa,posicao-projetado,faturamento-corp}.tsx`; `src/components/financeiro/dre/{tabela-dre,resumo-executivo,grade-proporcao,cascata-card}.tsx`; `src/components/gestao-pessoas/inventario/visao-geral-tab.tsx`; `src/components/weddings/lista-operacoes.tsx`; `src/lib/weddings/textos.ts` |
| `5eb33c8` M5 caronas | `src/lib/weddings/schemas-float.ts` (+`.test.ts`), `src/components/weddings/drilldown-drawer.tsx`, `src/app/api/dashboard/weddings/operacao/[id]/route.ts`, `src/components/performance/weddings-content.tsx`, `src/lib/rpc-contrato.test.ts` (2 linhas em `CONTRATOS_PARSE_RPC`) |
| `958b405` M6 higiene/docs | removidos: `src/lib/carga/parse-contas-pagar-receber.ts`, `public/{file,globe,next,vercel,window}.svg`, `public/apple-touch-icon.png`; `docs/adr/0099-*.md`, `docs/adr/0172-*.md`, `docs/adr/0158..0161` |
| M7 fechamento | `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`, este out-briefing, `docs/WORKING-CONTEXT.md` |

Greps de órfão no ato (orquestrador, além do subagente): `parse-contas-pagar-receber` /
`parseContasPagarReceberFile` / `ContaPagarReceberRaw` → **0** referências fora do arquivo; cada um
dos 6 assets → **0** em `src/`, `next.config.ts`, `package.json`; ícone Apple vivo = `src/app/apple-icon.png`.

---

## 5. Parecer da revisão

**`revisor-db` (0267): APROVADA COM RESSALVAS — zero CRÍTICO/ALTO.** Verificou alias `d` correto e
sem ambiguidade; `WHERE d.raw_hash IS DISTINCT FROM …` intacto; `text[] || text[]` compatível com
`exigir_acesso(text[])`; `metas/acompanhamento` existe (0175/0184); classificação aditiva (corpos `$$`
excisados pelo tokenizer); efeito no espelho auto-curativo estritamente positivo (0250 já exclui
`sale_id IS NULL` das candidatas a remoção); numeração sem colisão entre worktrees.

| Sev. | Achado | Como foi endereçado |
|---|---|---|
| MÉDIO | Nota DOWN citava "0178 linhas 206-244" — o corpo vai até 282 (REVOKE/GRANT). | **Corrigido** no header antes de aplicar. |
| MÉDIO | Header atribuía a revogação de `anon` à 0122; foi a **0133** (a 0122 preservava `get_executiva_kpis` na allow-list). | **Corrigido** no header antes de aplicar. |

**`revisor` (código): APROVADO — zero CRÍTICO/ALTO/MÉDIO.** Verificou os 13 call-sites (props
preservadas, imports de `Tooltip` removidos só quando sem outro uso, `aria-label` coerente com o que
cada "?" explica), a sonda (sem falso positivo/negativo no estado atual), degradação do float
(`null` → mesmo caminho), `schemas-float.test.ts` provando o que diz (erro logado, não engolido),
ADR-0172 spot-checked contra `http.ts` e migrations 0217/0223/0226, zero `console.log` novo.

| Sev. | Achado | Como foi endereçado |
|---|---|---|
| BAIXO | Prosa "15 consumidoras" (teste) × "outras 14" (migration). | Consistente: 15 inclui a própria `get_executiva_kpis`; 14 são as outras. Registrado. |
| BAIXO | Briefing fala em "três pontos" da nota; a constante é consumida em 2 arquivos (3 usos). | O 3º ponto (Margem Potencial) está em `lista-operacoes.tsx` junto com a coluna. Registrado. |

**Conferência visual ao vivo** (Claude in Chrome na sessão do Yan, `next dev` na worktree, porta 3001;
o `verificador-visual` depende do MCP Playwright, indisponível nesta sessão): **14 dos 17 gatilhos**
exercitados — Fluxo de Caixa (NCG, Runway, Saldo de repasse: 3), DRE (Resumo Competência/Caixa, Ponte,
Proporção, Prefixo ×2, Decomposição, Maiores variações: 8), Weddings (Margem a.a., Rend. Teórico,
Margem Poten.: 3). Balão abre ao acionar e **permanece com o mouse longe** (é o foco); mesma bolinha,
mesmo lugar; na última coluna da Lista abre para dentro da tela; clicar no "?" não reordena.
**Não exercitados ao vivo:** modal de nova solicitação (Data limite), Faturamento Corp
(Status/Boleto/Nota fiscal) e inventário de Gestão de Pessoas — ficam para o Yan (§7).

---

## 6. Aprendizado — régua de 5 destinos

1. **Enforcement mecânico (destino 1):** a sonda `gatilho-ajuda.test.ts` é o item que justifica a
   versão — a regra "button, nunca span" estava na skill desde a v5.4.2 e voltou duas vezes. Mesmo
   molde da `cabecalho-pagina.test.ts` (v5.9.3): sondas de fonte são o destino 1 possível sem tocar
   config protegida. **Detalhe que custou uma rodada:** o arquivo dono da receita canônica fica FORA
   da varredura por caminho — o comentário de cabeçalho dele cita o anti-padrão como texto.
2. **Já coberto:** `CREATE OR REPLACE` do catálogo vivo, numeração entre worktrees, REST com
   service_role — a skill `banco-e-rpc` já tinha tudo; foi seguida, não estendida.
3. **Core:** nada. Nenhum aprendizado desta versão é transversal e caro o bastante.
4. **Skill `ui-design-system` §2:** reescrita para prescrever o primitivo (feito na M3). Nada a
   acrescentar em `banco-e-rpc`/`revisor-db` — convenção de banco não mudou.
5. **Ritual:** nada novo. Observação operacional (não vira regra): a guarda de worktree do harness
   barra `heredoc`/comandos compostos que mencionam `git`; o caminho é Write/Edit + comandos simples.

Aprendizado de MÉTODO desta versão: **provar comportamento de RPC que escreve sem escrever em
produção** = `pg` direto em transação revertida, uma vez, no ato da aplicação (§2.4), enquanto o
caso de contrato que fica na suíte lê o **catálogo** (`pg_get_functiondef`). O teste permanente
reprova a próxima `CREATE OR REPLACE` escrita da migration de origem; a prova comportamental fica
registrada aqui.

---

## 7. Pendências

- 🔴 **Yan — checkpoint final do briefing:** Tab até um "?" nas três telas não exercitadas ao vivo
  (modal de nova solicitação; Faturamento Corp, cabeçalhos Status/Boleto/Nota fiscal; Gestão de
  Pessoas → Inventário); abrir `/metas` com um usuário que tenha só `metas/acompanhamento` e ver os
  MetaCards preenchidos; conferir que o inventário Monde segue reconciliando na rodada seguinte
  (tripwire verde); ler o ADR-0172 contra o que está em produção.
- `RpcFrouxa` redeclarado 3× (`api/dashboard/weddings/operacao/[id]/route.ts`, `api/cdi/ingest/route.ts`,
  `performance/weddings-content.tsx`) — candidato a helper compartilhado (fora do escopo).
- `public/favicon.ico` sem referência (o vivo é `src/app/favicon.ico`) — não estava no briefing; sai
  numa próxima higiene.
- Herdadas da v5.9.3: contraste do `--text-subtle` (≈2,5:1) — decisão do Yan; agora o "?" também
  segue esse token; tokenização dos ~400 `zinc-*` e lint `zinc`.

## 8. Fronteira (fica fora)

`reverter_diario` robusto a múltiplos toques; alarme por soma nas bases de caixa; hooks do
`harness-base`; fonte Avenir pública; qualquer mudança de comportamento em RPC além de A1/A2.
