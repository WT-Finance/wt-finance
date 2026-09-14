# Out-briefing — v5.10.0 · Limpeza de fechamento da v5

**Tipo:** MINOR (Rota A) · **Branch:** `chore/v5-10-0-limpeza-fechamento-v5` ·
**Briefing:** `docs/briefings/briefing-v5-10-0-limpeza-fechamento-v5.md` ·
**Spec da execução:** `docs/auditoria-v5/relatorio-triado.md` ·
**ADR:** `0173` · **Migrations:** `0269` (aditiva) e `0270` (destrutiva), ambas aplicadas ·
**PRs:** #263 (Fase 1, auditoria) · parte 1/2 (mergeada) · parte 2/2 (este fechamento)

Uma versão sem funcionalidade nova: audita, tria e executa. A regra de ouro foi **zero mudança de
comportamento observável** — e o que a versão descobriu sobre si mesma virou a Decisão 2 do
ADR-0173: **o relatório APONTA, o commit PROVA.**

---

## 1. Contagens antes × depois

### Arquivos e linhas

| | antes | depois |
|---|---|---|
| commits de missão | — | **50** (sem merges, antes do commit de fechamento) |
| arquivos tocados | — | **257** · **+34.350 / −17.944** linhas |
| arquivos **removidos** | — | **121** |
| arquivos adicionados | — | 65 |

Por área (`e6f3c9e..HEAD`):

| área | arquivos | linhas |
|---|---|---|
| `src/` | 56 | +1.541 / −2.108 → **−567 líquidas** |
| `supabase/` | 11 | +713 / −235 |
| `scripts/` | 3 | +8 / −236 |
| `docs/` | 170 | +24.741 / −10.514 |
| `.claude/` | 8 | +280 / −26 |

As entradas em `src/` são teste novo e schemas Zod, não código de produção. As de `docs/` são o
relatório da auditoria (145 achados em 10 dimensões), que é insumo permanente.

### Documentação

| | antes | depois |
|---|---|---|
| `docs/briefings/` | 164 | **72** (só v5) |
| `docs/audits/` | 9 | **0** (pasta removida) |
| `docs/superpowers/` | 3 | **0** (pasta removida) |
| `docs/runbooks/` | 5 | **3** |
| `docs/design-system.md` | 496 linhas | **0** |
| `docs/WORKING-CONTEXT.md` | 1.252 linhas | **~232** |
| `docs/adr/` | 153 | 153 (ADR não sai — regra 4 do briefing) |

### Banco

| migration | conteúdo |
|---|---|
| **0269** (aditiva) | `REVOKE` em **8** funções que dependiam de *default privileges* (ACL default = EXECUTE para `PUBLIC`, que inclui `anon`) · **31** `COMMENT ON FUNCTION` nas RPCs centrais · **1** `CREATE OR REPLACE` (`app.exigir_acesso`, extraída do catálogo vivo, trocando só o texto do `RAISE` para "Janus") · `NOTIFY pgrst` |
| **0270** (destrutiva, TTY humano) | **13** `DROP FUNCTION` · **2** `DROP TABLE` (`app.meta_subsetor` e `_historico`, provadas vazias no ato) · **1** `DROP CONSTRAINT` (o `CHECK` de ±100%, mantendo o de ±5%) |

A 0270 carrega um **bloco-guarda** que aborta a transação se qualquer alvo sobreviver ao `DROP` —
`DROP FUNCTION IF EXISTS` com assinatura errada é **no-op silencioso**, e um rascunho tinha
justamente isso (`…projecao_diaria__nucleo(integer, integer)` contra o real `(integer)`).

### Dependências

| | antes | depois |
|---|---|---|
| `next` / `eslint-config-next` | 16.2.9 | **16.3.4** (veio da v5.9.7, 2 CVEs *critical* de RCE) |
| `@supabase/ssr` | ^0.10.2 | ^0.10.3 |
| novas devDeps | — | **`knip`**, **`depcheck`**, `@typescript-eslint/parser` |
| `package.json` `name` | `wt-finance-temp` | **`janus`** |
| `engines.node` | ausente | **`>=20.9.0`** (piso, não pin — a Vercel escolhe o LTS) |

Majors represados, com o motivo, em B-02/B-03/B-04: `nodemailer` 9→10, `vitest` 3→5,
`typescript` 5.9→7, `eslint` 9→10.

### Testes

| | antes | depois |
|---|---|---|
| testes | **1.207** | **1.220** |
| arquivos de teste | 72 | **74** |
| `skip` silencioso | possível | **0** (sonda reprova se aparecer) |
| tempo da suíte | **103,13 s** | **88,60 s** |

A queda de ~14 s **não** é otimização: é efeito de a base de Vendas estar vazia (incidente da
§6), com menos linhas para os casos de contrato percorrerem. Voltará ao patamar anterior depois
do repovoamento — não tome como ganho.

### Repositório

| | antes | depois |
|---|---|---|
| branches remotas | 137 | **17** |
| branches locais | 41 | **8** |
| worktrees em disco | 4 | 2 |

Critério: `--merged` para o remoto, e `-d` (que **recusa** branch não-mergeada) no local. Nenhum
commit se perdeu. As 16 não-mergeadas que ficaram estão tabeladas no `WORKING-CONTEXT.md`, cada
uma com o motivo.

---

## 2. O spike de tipagem (D4-001) — o resultado que mudou uma convenção

**A pergunta:** adotar o `gen types` por cima do `src/types/database.ts` custa quanto?

**A medição:** `npx supabase gen types typescript --linked` por cima, `tsc --noEmit` → **4 erros
TS2322**, todos em passagem de `null` para parâmetro de RPC (`admin/acessos/actions.ts:108`,
`weddings/operacoes/route.ts:43,44,46`).

**A leitura correta, que só apareceu ao investigar os 4:** não eram custo de adoção **nem**
código assumindo não-nulo. Eram o **inverso** — código passando `NULL` corretamente contra um
tipo que perdeu essa informação. O `gen types` **não modela nulidade de parâmetro**: toda função
Postgres aceita `NULL`, mas o gerador emite o tipo base. Nos 4 pontos, o arquivo manuscrito era
**mais preciso** que o gerado.

**A decisão (ADR-0173, Decisão 1):** adotar assim mesmo. Perde-se precisão em 4 parâmetros e
ganha-se cobertura de ~160 RPCs que **não tinham tipo nenhum** — o arquivo era manuscrito na era
M1 e cobria ~55 de ~215 funções. A convenção "congelado + helper de tipagem frouxa" **morre**: ela
não continha a tipagem frouxa, ela a tornava o caminho **majoritário** (3 em cada 4 chamadas). O
arquivo passa a ser regenerado e commitado junto do bump sempre que a versão criar ou alterar RPC
— passo novo do `/fechamento-versao`.

Adoção com `tsc` limpo e suíte verde. Os helpers existentes ficam como **legado vivo** (trocá-los
é B-06/B-07); helper novo não se cria.

---

## 3. Tabela E7 — os cinco `MÉDIA` de 13/06, verificados com evidência atual

Bloco 2 da versão: só verificação, nenhuma edição de código.

| id | achado de 13/06 | veredito | evidência |
|---|---|---|---|
| **E7-M2** | Páginas do Fluxo de Caixa usariam `getAdminClient` (service role) para LEITURA, contornando o RBAC | **FECHADO na v4.21.0** | Nenhuma página de `src/app/financeiro/**` lê dado de negócio por service role: todas fazem `requireArea` → `getServerClient`. Sobram 2 usos em `src/lib/`, ambos pós-guard e sobre **metadado** (timestamp), em RPC que é `REVOKE FROM authenticated` por desenho — não é bypass, é função nunca exposta |
| **E7-M3** | Staging de Vendas sem lock permitiria corrupção em uploads concorrentes | **FECHADO pela `0135`** (v4.17.0, mesma data da auditoria) | A premissa era correta: a staging é compartilhada, sem `lote_id`. A correção serializa o pipeline — as 3 RPCs abrem com `pg_advisory_xact_lock(4017001)`, a MESMA chave. Sem isolamento por lote: a proteção é 100% do advisory lock |
| **E7-M6** | Export da Lista de Operações truncaria em 200 linhas | **FECHADO na v4.17.0** · **1 achado NOVO** | O teto de 200 é real e em duas camadas, e **morderia hoje** (238 linhas vivas). Mas o export não reusa a chamada da tela: tem loop próprio paginando até cobrir o total. **O novo:** o `catch {}` de `lista-operacoes.tsx:440` engole tudo, inclusive o `throw` da linha 431 — falha de página intermediária entrega planilha **parcial sem aviso** → **B-24** |
| **E7-M15** | `src/lib/supabase/admin.ts` sem `import 'server-only'` | **FECHADO na v4.17.0** (commit `0c20065`) | É a **linha 1** do arquivo. Conferido por segundo ângulo: `server-only` está no `package.json`, e nenhum importador tem `'use client'` — o guard não está só presente, está **sem violação** |
| **E7-M17** | Anexos commitados continuariam sob prefixo `tmp/` | **FECHADO na v4.17.0** (`0136`) | O binário é **movido** (`storage.move`) para `sol/<id>/…` e só então o caminho é reescrito. Ordem correta: mover primeiro, sincronizar depois. **Correção ao parecer do explorador:** `move` e `UPDATE` não são atômicos, então a falha residual não é "só metadado" — seria anexo **inalcançável pelo download**. Improvável e sem incidente; não vira item |

**A conclusão que vale mais que os cinco:** os cinco **já estavam fechados**, quatro na v4.17.0 e
um na v4.21.0. A auditoria de 13/06 era o **plano** dessas correções, não uma lista pendente. Ler
um relatório antigo como inventário de dívida teria gerado cinco investigações inúteis — e é
exatamente por isso que o D8-005 mandou apagar as listas de prioridade vencidas e guardar as
medições.

---

## 4. O que foi para o backlog v6

`docs/backlog-v6.md` fechado com **30 itens**, dos quais **3 já saíram riscados** por terem sido
resolvidos durante esta própria versão.

**Fechados na v5.10.0 (ficam como registro, não reabrir):** ~~B-05~~ tipagem (executada — ADR-0173
Decisão 1) · ~~B-12~~ índice do `v_estado_atual` (**premissa falsa**: o índice existe e tem 102
scans; o explorador leu a view e não o catálogo) · ~~B-15~~ `describe.concurrent` (**medido e
descartado**: 43,32 / 40,95 / 57,70 s — variância de 17 s contra ganho de 2,4 s; o tempo é
latência de rede, não CPU) · ~~B-21~~ `design-system.md` (aposentado).

**Bloco novo — Retomada do Scope B** (decisão do Yan: não se tria item a item): **B-25**
`transformSale` erra 100% dos positivos em `contrato` e `taxa_servico`, com a regra certa já
identificada (99,97% / 99,99%) · **B-26** as 8 decisões abertas, que são de **produto** ·
**B-27** `monde.venda.raw` defasado em estrutura (527 de 28.250 vendas com o ramo `financial`) —
pré-requisito, não consequência. Desbloqueio: pedir **receita por produto** ao provedor.

**Achados desta versão:** **B-24** falha parcial silenciosa (o `catch {}` do export + o
`avisoParcial` que a UI não lê) · **B-28** os 3 símbolos de orfandade **ambígua** que o grep não
resolve (um é Server Action, e `'use server'` faz do arquivo superfície de rede) · **B-29**
verificar a skill `react-padroes` contra o repo · **B-30** o `protecao-config` não intercepta
escrita por Bash (casa só `Edit|Write|MultiEdit`).

**Permanecem:** B-01 tokenização do `zinc` (1.675 ocorrências) · B-02/03/04 majors · B-06/B-07
schemas Zod faltando · B-08 `allSettled` posicional · B-09/B-10/B-11 desempenho · B-13 fixtures
reais · B-14 sonda de `skipIf` · B-16 CI · B-17/B-18/B-19/B-20 convenções e renome · B-22/B-23
baseline de schema e `harness-base`.

---

## 5. Parecer da revisão

**`revisor` — Bloco 6 (documentação):** aprovado com 3 ressalvas, todas corrigidas antes dos gates.
- **CRÍTICO:** o `WORKING-CONTEXT.md` afirmava que a terceira camada de permissões estava
  configurada, contradizendo a própria lista de pendências 100 linhas acima. Conferido no disco:
  não estava. Corrigido lá **e** no `CLAUDE.md`, que repetia a afirmação no presente.
- **ALTO:** B-05 seguia aberto no backlog apesar de a versão o ter executado.
- **BAIXO:** quadro de estado duplicado em README e `estado-do-projeto.md` §11 — o §11 fica como
  dono único.

**`revisor` — fechamento (hook + permissões):** **3 CRÍTICOS e 1 ALTO**, todos confirmados ao vivo
antes de corrigir, e todos **no código de segurança que esta versão introduziu**:
- **CRÍTICO 1:** o hook apagava **todo** texto entre aspas antes de casar. Isso vale para
  `git commit -m "…"` e é **falso** para `bash -c 'git add -A'`, `sh -c`, `eval`, `ssh host '…'` —
  a remoção apagava o próprio comando e o hook liberava. Pior que não ter hook, porque dá confiança
  injustificada. **Correção:** neutralizar só o argumento de `-m`/`--message`; as aspas restantes
  viram espaço, deixando o conteúdo do interpretador visível ao scanner.
- **CRÍTICO 2:** `git add -- .` e `git add -- :/` passavam — o `--` idiomático escapava do padrão.
- **CRÍTICO 3:** `git add -vA` passava, porque o cluster de flags exigia `a` **minúsculo** sem flag
  `i` — **e o `CLAUDE.md` afirmava cobrir `-vA`**. Documentação errando a favor da falsa confiança.
- **ALTO:** a bateria tinha 21 casos (o README dizia 22) e **nenhum** dos três buracos. Subiu para
  **31**, cobrindo os três, com o histórico no cabeçalho.
- **MÉDIO endereçado:** `Bash(git worktree:*)` cobria `git worktree remove`, que o `CLAUDE.md`
  proíbe com trabalho não-mergeado → virou `list` + `add`; `remove` volta a pedir confirmação.
- **MÉDIO registrado, não resolvido:** a proteção de `main` no `deny` depende de casamento
  **textual** — `git push` sem argumento com upstream em `origin/main`, ou `git push origin HEAD`
  estando em `main`, não são cobertos. É limitação do mecanismo do harness; a barreira dura do
  core segue valendo por disciplina. Documentado no próprio artefato.
- **BAIXO registrado:** o cluster de flags pode dar falso positivo em nome de arquivo com hífen
  inicial e letra `a` (ex.: `-abc`); o `.` de uma extensão quebra o token e serve de guarda natural.

**A lição do segundo parecer, e ela é a mais cara da versão:** *caso de teste que nasce depois da
regex só confirma a regex.* A bateria existia precisamente para pegar esses três casos e não pegou,
porque eu testei o que já sabia que funcionava. Os casos que valem são os que um adversário
tentaria.

**`revisor-db`:** rodou nos Blocos 3 e 5, antes de cada aplicação. Achados endereçados: a
assinatura errada no `DROP` (no-op silencioso), o header que dizia "nove funções" quando eram 13,
um `COMMENT` em que eu repetia um achado **falso** do relatório (o `v_estado_atual` "sem índice"),
e — o mais importante — o **ALTO** de que a 0270 removia `get_my_profile`, que o ADR-0107 havia
**reservado para decisão futura do usuário**. Não era descuido (o Yan a listou nominalmente), mas a
primeira redação tratou os ADRs só pela pergunta "isto é executável?" e passou por cima do
**conteúdo** da decisão. Registrado na Decisão 3 do ADR-0173.

**`verificador-visual`:** **N/A declarado.** A parte 2 não toca UI; as remoções de componente da
parte 1 foram mergeadas e deployadas antes deste fechamento.

---

## 6. O incidente — 306.261 linhas apagadas em produção

Durante o Bloco 5, uma varredura minha chamou **todas** as RPCs sem argumento obrigatório para
conferir quais devolviam 500. Entre elas havia funções de **TRUNCATE**, e produção foi zerada em 10
tabelas: `raw.lancamentos_movimentacao` (92.506), `analytics.fato_venda_item` (48.147),
`raw.vendas_excel` (48.147), `analytics.fato_lancamento_operacao` (41.091),
`raw.titulos_em_aberto` (36.756), `analytics.fato_venda` (29.106), `analytics.dim_pagante`
(7.033), `raw.demonstrativo_competencia` (3.294), `analytics.dim_produto` (117),
`analytics.dim_vendedor` (64).

**O erro de raciocínio:** tratei "chamar tudo" como leitura. Num banco onde a RPC é a **superfície
de escrita**, disparar uma função sem saber o que ela faz é executar comando arbitrário. O corpo de
todas elas estava no catálogo que eu mesmo havia exportado, e eu não olhei.

Reportado de imediato; backup íntegro; script de restore preparado e **não executado**
(`supabase/patches/RESTORE-incidente-varredura-rest.mjs`). Decisão do Yan: repovoar pelo **upload
manual**. 🔴 **Ordem obrigatória: Lançamentos por Operação primeiro** — as 238 linhas sobreviventes
de `dim_operacao_weddings` são regeneradas a partir da tabela de fatos, e subir outra base antes as
apagaria.

Lição promovida à skill `banco-e-rpc`. **Não existe enforcement mecânico para ela** — é o risco
residual mais relevante que a versão deixa em aberto.

---

## 7. Pendências

**Ação sua, agora:** recopiar os **dois** arquivos corrigidos no fechamento (hook e settings) —
comando único no `docs/auditoria-v5/atos-humanos/README.md`, Ato 2. O que está instalado hoje é a
versão com os 3 falsos negativos.

**Ação sua, quando puder:** os 5 uploads manuais do repovoamento (ordem acima) · `git pull
--ff-only` no checkout raiz, que está duas versões atrás · decidir o commit órfão `b869bb9`
(PR próprio ou descarte) · conceder a área `financeiro/dre` às roles.

**Registrado e não resolvido:** `Bash(npm run *)` amplo no `settings.local.json` da raiz (o `deny`
cobre o caso perigoso) · a lacuna de casamento textual na proteção de `main` · B-30 · o risco
residual do incidente.

**Ato 3 (E5) — nada a aplicar.** O achado estava errado: `superpowers@superpowers-marketplace`
5.1.0 já está `✘ disabled` e não carrega desde 28/07; a global é 6.3.0, não 6.2.0. Medido, o
always-on custa ~688 tokens (barato); o que dói é o disparo em bloco (~50 mil somando as 14
skills), e isso é **mandato do plugin**, não duplicação. Vira decisão de custo.

---

## 8. Aprendizado — régua de 5 destinos

| destino | o quê |
|---|---|
| **1. Enforcement mecânico** | hook **`protecao-git-add`** (a regra "não usar `git add -A` cego" sai da prosa) · **9 `deny`** no settings global, incluindo o `db push` cru que fura o backup-gate · **23 `allow`** versionados no projeto · `knip.json` nomeando as 3 classes de falso positivo de análise estática |
| **2. Deletar** | 121 arquivos, 16 objetos de banco, 153 branches — cada exclusão com grep de prova no ato, transcrito no commit |
| **3. Core (`CLAUDE.md`, 177/180 linhas)** | a seção "Terceira camada" reescrita para o que **existe**, com o `protecao-git-add` na lista de hooks |
| **4. Skill de domínio** | `banco-e-rpc`: a orfandade varre `docs/runbooks/` e `docs/adr/` (lição do `getPool`), e a lição do incidente · `ingestao-planilhas` §5: operação da carga, migrada do runbook v4-15 · `ui-design-system` §1.3: token de fundo ≠ token de tinta (contraste) · `contrato-rpc-front` §1: reescrita para o `database.ts` gerado |
| **5. Ritual** | `/fechamento-versao` ganha o passo de **regenerar e commitar o `database.ts`** quando a versão cria ou altera RPC |

**As três convenções novas, no ADR-0173:** o relatório **aponta**, o commit **prova** (Decisão 2) ·
**medição fica, opinião sai** como critério de documentação (Decisão 4) · **`Emendado por:` ≠
`Supersedido por:`** — o primeiro preserva decisão vigente, o segundo manda descartá-la (Decisão 5).

---

## 9. Gates

```
npm run build   ✓
npx tsc --noEmit ✓  0 erros
npm run lint     ✓  0 warnings novos
npm test         ✓  1.220 / 1.220 · 74 arquivos · 88,60 s
```

**Migrations:** 0269 e 0270 aplicadas e verificadas via REST/service_role (o `db query` não executa
o corpo). Nenhuma destrutiva pendente em `supabase/migrations/` — o que resta em
`supabase/patches/` é o script de restore (não executado) e os dois `.sql` de pré-condição do
Bloco 5, que são consulta.
