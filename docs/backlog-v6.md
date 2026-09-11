# Backlog v6

Fechado na **v5.10.0** (10/09/2026), ao fim da limpeza de encerramento da v5. Reúne o que a auditoria
classificou como "grande demais para limpeza" — esforço `L`, redesenho, major de dependência, decisão de
arquitetura ou de produto — mais os achados que nasceram durante a própria limpeza. Rastro completo por
item: `docs/auditoria-v5/relatorio-triado.md` (a coluna `nota` diz o que foi provado no ato).

**Como ler:** item riscado (~~B-nn~~) foi **fechado durante a v5.10.0**, por correção, por medição ou por
se revelar premissa falsa — fica aqui como registro para ninguém reabrir. Item vivo tem risco e esforço.
Nada neste arquivo está em andamento; é fila, não plano.

| # | item | origem | risco | esforço | por que é v6 e não limpeza |
|---|---|---|---|---|---|
| B-01 | Tokenizar o cinza neutro (`zinc-*`: 1.675 ocorrências / 137 arquivos; 4 primitivos de `ui/` como alavanca — `button` com 8 tonalidades). **Inclui D9-007**: o `kpi-detail-drawer` pinta grade e eixo com hex cru — `stroke="#f1f5f9"` contra `--chart-grid: #e4e4e7`, e `fill: '#a1a1aa'` contra `--chart-axis-tick: #52525b`. **NÃO criar token novo com os valores atuais**: dois tokens para "cor de grade" com valores diferentes institucionalizam a divergência. É decisão de PALETA — aquele gráfico está mais claro que todos os outros e alguém precisa decidir qual é o certo | D9-001/005/006/007 | médio | L | reestrutura paleta; muda cor visível; exige verificação de contraste |
| B-02 | `nodemailer` 9 → 10 (4 CVEs moderate/high: bypass de allow-list de domínio, DoS) | D6-004 | médio | L | major com breaking; ação externa irreversível (skill `email`) |
| B-03 | `vitest` 3 → 5 (CVE moderate em `@vitest/mocker`) | D6-005 | médio | L | major; config e reporters mudam |
| B-04 | Majors pendentes: `typescript` 5.9 → 7, `eslint` 9 → 10, `@types/node` 20 → 22, `@supabase/ssr` 0.10 → 0.12 | D6-007/008 | alto | L | quebram regras/config; fora do escopo por briefing |
| B-05 | Regenerar `src/types/database.ts` (manuscrito da M1, cobre ~25% das RPCs) e adaptar os 32 call-sites tipados — OU declarar oficialmente "congelado + helper" como convenção | D4-001, D1-022 | médio | L | decisão de arquitetura; toca dezenas de arquivos |
| B-06 | `faturamento-corp/actions.ts`: 26 `(db.rpc as any)` → helper `BoundRpc` + schemas Zod + testes de contrato (maior área sem rede de contrato) | D4-009 | médio | L | 800+ linhas; validação nova pode rejeitar dado hoje aceito |
| B-07 | 8 route handlers de `/api/dashboard/*` sem schema Zod (`cagr`, `prejuizos`, `mix-setor`, `pipeline`, `sumario-subsetor`, `proximos`, `kpi-historico`, `setores`). **Inclui D4-008** (`get_operacao_weddings`, o drilldown): exige `VisaoFinanceira` (14 campos) + `DecomposicaoSubsetorItem` + `AcumuladoMensalItem` + `RendimentoFloatOperacao`, e não há caso de contrato hoje. ⚠️ **Retorno em UNIÃO**: a RPC devolve o drilldown OU um objeto `{ error }` que a rota converte em **404** (`weddings/operacao/[id]/route.ts:57-60`) — exige união DISCRIMINADA; um `parseRpc` estrito aplicado ANTES dessa checagem transformaria o 404 em 500 | D4-007/008 | médio | M | schema novo por RPC + teste de contrato cada; o do drilldown é o mais caro |
| B-08 | DRE: `Promise.allSettled` com índice posicional dinâmico → `Map` chave→resultado | D5-001 | médio | L | redesenho do carregamento da página (já mordeu 2×) |
| B-09 | `/metas`: `get_executiva_kpis`/`metas_ritmo_diario` aceitarem `p_setor[]` (hoje ~11 RPCs por carregamento; Modo TV refaz a cada 60 s) | D3-007 | baixo | L | muda assinatura de RPC; contrato novo |
| B-10 | Full scans repetidos em 10 tabelas grandes (`monde.venda`, `raw.vendas_excel`, `financeiro.fato_fluxo`…): `EXPLAIN` por chamador, filtro/índice | D3-004 | baixo | L | investigação; pode virar índice novo (aditiva) |
| B-11 | Índices `idx_scan=0` em tabelas grandes (`fato_fluxo_venda_idx` 1,1 MB, `lanc_mov_liquidacao_idx` 0,8 MB, parcial redundante em `fato_lancamento_operacao`) — remedir e dropar | D3-001/002/003 | médio | S | estatística é indício; `DROP INDEX` é destrutiva |
| ~~B-12~~ | ~~`patrimonio.v_estado_atual`: criar índice de suporte~~ — **PREMISSA FALSA, corrigida no Bloco 3 pelo `revisor-db`.** O índice **já existe**: `mov_ativo_ordem_idx (ativo_id, data_movimentacao DESC, criado_em DESC)`, criado na 0247, cobre as três primeiras colunas do `ORDER BY` do `DISTINCT ON` da view e está **em uso** (102 scans no catálogo em 10/09/2026). O achado D3-006 dizia "sem índice de suporte (só a PK existe)" — o explorador leu a definição da view mas não o catálogo de índices. Sobra apenas a questão de materializar SE o volume crescer (hoje 6 linhas), que não é dívida e sim gatilho futuro | D3-006 | — | — | **fechado por verificação**; recriar o índice seria redundante | hoje 6 linhas; padrão não escala |
| B-13 | Corpus de fixtures de arquivo REAL anonimizado para os parsers (hoje só matriz inline → bytes) | D7-006 | médio | L | trabalho de captura, não limpeza (lição v5.5.2) |
| B-14 | Contador/sonda para `skipIf` — a suíte não pode parecer verde com ~180 casos pulados | D5-004, D7-004 | baixo | S | pode entrar na v5.10.0 se triado `agir agora` |
| ~~B-15~~ | ~~`describe.concurrent` em `rpc-contrato.test.ts`~~ — **MEDIDO E DESCARTADO na v5.10.0**. 23 dos 25 blocos viraram `.concurrent` e as medidas foram: **43,32 s** (antes) · **40,95 s** (depois, 1ª) · **57,70 s** (depois, 2ª). A variância entre rodadas idênticas (~17 s) é 7× o suposto ganho (2,4 s): o tempo é **latência das 140 requisições contra produção**, não CPU local. Revertido. Só volta a fazer sentido junto de um **ambiente de teste próprio** (o gatilho já previsto na skill `banco-e-rpc` §6) — sem isso, `concurrent` só adiciona carga simultânea em RPC de produção | D7-001 | — | — | **fechado por medição, não por opinião** |
| B-16 | CI de PR (`.github/workflows`: `tsc` + `lint` + `test`) — hoje os gates são 100% disciplina local | D10 (risco) | médio | M | infra nova; decisão do Yan (custo de minutos) |
| B-17 | Lint `wt/*` para cor hardcoded em prop/`style` (Recharts `stroke=`/`fill=` com hex) | D9-007 | baixo | M | regra nova de lint; hoje 1 ocorrência |
| B-18 | Hook PreToolUse para `git add -A`/`-a` (régua item 1; poda do `CLAUDE.md`) | D8-022 | baixo | S | ato humano (`.claude/hooks/` protegido) |
| B-19 | Convenção única de prefixo de RPC (`get_*` 97 / `admin_*` 19 / `solic_*` 19 / verbo-substantivo ~60) | D9-018 | baixo | L | renomear RPC = destrutiva + todos os chamadores; provavelmente nunca |
| B-20 | Renomear o repositório `WT-Finance/wt-finance` → Janus (quebra remotes/worktrees); `package.json name`; `localStorage` `wt-finance-*` com migração de chave | D9-011/014, D10-006 | médio | M | ato do Yan no GitHub; fora desta versão por invariante 5 |
| ~~B-21~~ | ~~`docs/design-system.md` × página `/admin/design-system`~~ — **RESOLVIDO na v5.10.0**: o `.md` foi aposentado (a página é a referência única; o *porquê* que ela não carrega foi para a skill `ui-design-system` §1.3 e §3) | D8-014 | — | — | fechado, não vai para a v6 |
| B-22 | Baseline de schema + checagem de drift (decisão do Yan: virada v6) | briefing, invariante 6 | — | M | fora por decisão |
| B-23 | `harness-base`: extrair hooks e aprendizados (pós-versão, outro repositório) | briefing | — | M | fora por decisão |
| B-24 | **"A operação falhou pela metade e a tela não conta"** — uma superfície de aviso para falha parcial, cobrindo os dois casos abertos: (a) `lista-operacoes.tsx:440`, o `catch {}` do export engole tudo, inclusive o `throw new Error(HTTP …)` da linha 431, e o usuário baixa planilha PARCIAL (ou nenhuma) sem aviso — só o spinner some; (b) o `avisoParcial` de `ResultadoCriarUsuario` (v5.10.0/D5-002/003) existe no servidor e no tipo, mas `modal-convidar.tsx` e `aba-solicitacoes.tsx` não o leem no ramo `ok:true`. São o MESMO assunto e cabem num patch de UI único | E7-M6 (novo) + MÉDIO do revisor no Bloco 1 | médio | M | exige decidir a superfície (toast? banner? inline?) — decisão de produto, não limpeza |


---

## Retomada do Scope B (Monde item-level e Pessoas)

Bloco único, por decisão do Yan em 10/09: o Scope B não se tria item a item agora — ou se retoma inteiro,
com o provedor do Monde na conversa, ou não se toca. O que a Fase 1 apurou e que evita redescobrir:

| # | item | origem | por que é um bloco, não itens soltos |
|---|---|---|---|
| B-25 | **`transformSale` erra 100% dos positivos em `contrato` e `taxa_servico`.** A regra correta já está identificada — derivar **pelo produto** — com acerto medido de **99,97%** e **99,99%** | E2 | corrigir isoladamente muda número de tela sem que ninguém tenha decidido a nova definição |
| B-26 | **As 8 decisões abertas do Scope B**: margem por produto ser alocação (e não medição); `operation_id` curado precisa de dono; Pessoas depende de pedido ao provedor; ordem das ondas; `get_prejuizos` sem paridade; cadência de sincronização de Pessoas; vocabulário `receitas_alocadas` | E3 | são decisões de PRODUTO — o agente registra, não decide |
| B-27 | **`monde.venda.raw` está defasado em ESTRUTURA**: só **527 de 28.250** vendas têm o ramo `financial`. Qualquer DRE viva pela API exige backfill ou re-sync antes | E4 | pré-requisito de infraestrutura de dados: bloqueia B-25/B-26, não é consequência deles |

**Desbloqueio conhecido:** pedir **receita por produto** ao provedor do Monde (registrado desde a
investigação do Scope B). Sem isso, a alocação continua sendo alocação.

---

## Achados da v5.10.0 que não couberam na limpeza

| # | item | origem | risco | esforço | por que ficou |
|---|---|---|---|---|---|
| B-28 | **Três símbolos de orfandade AMBÍGUA** que o D1-023 não resolveu — têm definição e nenhum uso, mas apagar exige julgamento, não grep: `atualizarObsMovimentacao` (é **Server Action**; o `'use server'` torna o arquivo uma superfície de rede, então "sem chamador em `src/`" não prova morte), `SumarioExecutivoSkeleton` (skeleton de rota pesada — a convenção manda que exista mesmo sem uso corrente) e `CLIENTES_COLUNAS`. Decidir um a um, com o critério, em vez de varrer | D1-023 | baixo | S | 3 símbolos, 3 razões diferentes; varredura automática erraria nos três |
| B-29 | **Verificar a skill `react-padroes` contra o repo**, como se fez com `ingestao-planilhas` na v5.10.0: cada afirmação conferida, lição falsa **apagada** (não emendada). É a metade que faltou do invariante 4 | D8-021 | baixo | S | timebox; a skill é grande e a verificação é leitura linha a linha |

---

## Registro dos achados E1–E8 (leitura dos 20 arquivos de `docs/audits`, `superpowers` e `harness`)

Estes achados nasceram da leitura dos documentos que a v5.10.0 **apagou** no D8-005. Ficam registrados
aqui para que a exclusão dos arquivos não leve junto o que eles renderam — é a condição que a própria
triagem impôs ao grupo "SAEM".

| id | achado | destino |
|---|---|---|
| E1 | Perda silenciosa por setor fora da dim (o "A1" da auditoria de 13/06) | **encerrado** — a migration `0132` já fechava; verificado no catálogo vivo em 10/09 |
| E2 | `transformSale`: `contrato` e `taxa_servico` erram 100% dos positivos | → **B-25** |
| E3 | As 8 decisões abertas do Scope B | → **B-26** |
| E4 | `monde.venda.raw` defasado em estrutura (527/28.250 com ramo `financial`) | → **B-27** |
| E5 | Plugin **`superpowers` duplicado** (global v6.2.0 + cópia do projeto v5.1.0): as sessões invocam todas as skills em bloco, com custo de contexto em **toda** sessão | **ato humano, em aberto** — desativar a cópia do projeto e reavaliar; se o bloco persistir, é mandato do plugin e não duplicação. Enquanto não resolvido, `docs/superpowers/sonda-disparo.md` **não é apagado** (é a medição do sintoma) |
| E6 | Tokens CSS mortos — dimensão que a D9 não varreu | **fechado sem mudança**: varredura dos 61 tokens de `tokens.css` deu **zero mortos**; os 3 suspeitos são usados como classe Tailwind e `--primary-bg` sequer existe |
| E7 | Cinco `MÉDIA` de 13/06 com estado desconhecido (M2, M3, M6, M15, M17) | **fechado no Bloco 2**: os cinco já estavam corrigidos — quatro na v4.17.0, um na v4.21.0. A auditoria de 13/06 era o **plano** dessas correções, não uma lista pendente. Rendeu 1 achado novo → **B-24** |
| E8 | **Segurança de dependência não tem dono**: `next` com advisory HIGH e fix em minor apareceu **3×** (28/05, 13/06, 10/09); o `skipIf` silencioso, 2× | **parcialmente fechado**: a rotina periódica (`npm audit` + `npm outdated` no fechamento de cada minor) está declarada em `docs/estado-do-projeto.md` e no ritual `/fechamento-versao`. O automatismo — CI de PR — continua aberto em **B-16**, porque depende de decisão de custo do Yan |
