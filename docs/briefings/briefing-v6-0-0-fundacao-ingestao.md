# JANUS · Briefing v6.0.0 — Fundação da ingestão: contrato, atomicidade, log e credencial de máquina

**MAJOR** · **Migrations:** várias aditivas (role `verificador`, role `ingestor`, log de carga, RPCs de promoção atômica, baseline de schema) + **1 DESTRUTIVA por último** (aposentar `truncar_*`/`inserir_lote_*` das bases migradas e a rota morta) em TTY do Yan · **ADRs:** 3 novos — "Separação entre credencial de verificação e de aplicação" (herdado da v5.11.0), "Contrato de ingestão servidor a servidor", "Checksum do arquivo como gate de carga" — numerar **no remoto** · **Base:** `main` após os merges pendentes (v5.9.5, v5.10.2, v5.10.3; `git pull --ff-only` na raiz) · **Branch:** `feat/v6-0-0-fundacao-ingestao` · **Rota A** · **FRENTE ÚNICA** — nenhuma outra versão em voo

*A plataforma passa a receber o export CRU do Monde e a fazer sozinha o que hoje os scripts R fazem — sem navegador, com credencial de máquina, carga atômica, checksum do próprio arquivo como condição e log de cada execução. Nenhuma RPA nesta versão: o que nasce aqui é o contrato que as RPAs (v6.1+) vão honrar. Para quem usa as telas, nada muda — invariante provado. Para quem carrega, o R sai do caminho.*

---

> ## ⛔ GATE 0 — O contrato se publica ANTES do código
> O §4 deste briefing (rota, autenticação, payload, resposta) é congelado no 1º commit da versão como `docs/contratos/ingestao-v1.md`. O Yan constrói a metade "entregar" das RPAs contra ele em paralelo. Mudança no contrato depois disso é decisão de produto e volta ao Chat.

> ## ⛔ GATE 1 — Oráculo cru↔tratado por base, VERDE antes de qualquer parser substituir o atual
> Para cada base, o parser novo lê o **export cru** do anexo e tem de reproduzir **célula a célula** o arquivo **tratado** do anexo (saída do script R), com as divergências conhecidas do §2 enumeradas e justificadas no teste. Já foi provado em Python nas cinco; em TS tem de ser provado de novo. Parser sem oráculo verde não entra.

> ## ⛔ GATE 2 — Prova adversarial das duas credenciais
> `verificador` chamando `truncar_*` ⇒ `PERMISSAO_NEGADA`. `ingestor` chamando RPC fora da sua allowlist ⇒ `PERMISSAO_NEGADA`; chamando a rota com chave revogada ⇒ 401. `service_role` continua funcionando fora do agente. Transcrito no out-briefing. Barreira não vista negando não vale.

> ## ⛔ GATE 3 — Destrutiva
> Escrita depois que o código que referenciava cada objeto saiu e foi **deployado**; fora de `supabase/migrations/` até a hora; TTY do Yan; backup-gate + restore-test.

## 1. Objetivo

Automatizar extração e ingestão exige que uma máquina escreva no Janus sem poder destruir nada — e o incidente de 12–13/09 mostrou que a superfície de escrita é a RPC. Esta versão constrói, nesta ordem, o que falta para isso: (1) credenciais separadas por papel, com `EXECUTE` por allowlist; (2) um caminho de ingestão **sem navegador**; (3) parser único por base, no servidor, lendo o cru; (4) carga atômica com o checksum do arquivo como condição; (5) log e alarme de toda carga, inclusive dos crons existentes; (6) ordem de carga como contrato. Aproveita para fechar dívida que só se pagava junto: filtro Welcome, `Intermediário`, parser duplicado de Lançamentos, XLSX de contas a pagar/receber, baseline de schema.

## 2. Estado medido (setembro/2026 — não presumir; a evidência está em `docs/investigacao-v6-ingestao.md` e `-parte2.md` e nos anexos)

### 2.1 As seis bases

| Base | Parse hoje | Atômica? | Alarme? | Tabela de destino | Checksum disponível no cru (descartado hoje) | Oráculo cru↔tratado (Python) |
|---|---|---|---|---|---|---|
| Demonstrativo (Competência) | cliente, `*Rows` puro, `raw:true` | não (truncar + N lotes + provisionar) | contagem+soma, **no cliente** | `raw.demonstrativo_competencia` (3.334) | **557** (556 subtotais + Total Geral) | 26.672 células, **0** divergências |
| Vendas por Produto | cliente, `raw` ausente | **sim** (`promover_carga_vendas`) | nenhum | `raw.vendas_excel` (48.652) | **5 por arquivo** (linhas + 4 somas) | 1.021.692 células, 10 divergências explicadas |
| Lançamentos por Movimentação | cliente, `*Rows` puro, `raw:true` | não | nenhum | `raw.lancamentos_movimentacao` (94.667) | **148** (15 grupos + 133 categorias) + total | 1.230.671 células, 30 divergências (todas em datas já corrompidas) |
| Lançamentos por Venc. em Aberto | cliente, `*Rows` puro, `raw:true` | não | nenhum | `raw.titulos_em_aberto` (36.176) | **95** (15 + 80) + total | 434.112 células, **0** |
| Lançamentos por Operação | **dois parsers** (cliente `parse-lancamentos.ts` + servidor `lancamentos.ts`, rota morta), **zero testes** | não | nenhum | `analytics.fato_lancamento_operacao` (41.745), **sem raw** | **nenhum** — só cruzamento com as vizinhas | n/a (fonte é scrape web) |
| Pessoas | cliente | sim | nenhum | `raw.pessoas` (64.104, parada desde 30/06) | — | fora do escopo |

### 2.2 Fatos que governam o desenho

- **Não existe caminho de ingestão sem navegador.** `parseArquivoEmWorker` roda em web worker; só linhas parseadas viajam. Mas os núcleos `*Rows` são puros, `File`/`Blob` existem em Node ≥ 20 e duas rotas já recebem arquivo no servidor. Falta a rota, não o parser.
- **Autenticação de máquina já existe duas vezes:** `x-api-key` com hash em `app.api_chave` + `app.api_chamada_log` (API externa, ADR-0172) e `Bearer $CRON_SECRET` (monde/cdi). **Adotar a primeira.**
- **Não existe log de carga.** Nenhuma tabela registra quem/quando/quanto para os 6 cards; `audit.ingestao_log` tem 10 linhas de seed e nenhum consumidor; nenhuma `raw.*` está sob o diário; o rastro dos crons evapora em 6h (`pg_net.ttl`) e `cron.job_run_details` diz `succeeded` quando só enfileirou.
- **Molde de atomicidade pronto:** `promover_carga_vendas` — TRUNCATE + `INSERT…SELECT` + regenerar **dentro** de uma função, `pg_advisory_xact_lock`. Nas outras quatro, truncar / N lotes / regenerar são requisições HTTP separadas: janela real de base vazia.
- **Anos fechados se mexem.** Entre o export de 25/08 e o de 21/09 do Demonstrativo: 2024 +15.555,70; 2025 +25.264,42. Lançamento retroativo é normal no Monde. Sob cadência diária, a plataforma reapresenta histórico sozinha.
- **O export traz o mês corrente parcial** (setembro/26: 77 linhas, 21 dias). Classe do CDI (v5.5.x): filtro de negócio na LEITURA.
- **Sujeira sistemática no cru:** espaço nas pontas em 17% de `Produto` (Vendas) — a classificação `Setor Micro` só funciona porque o `readxl` apara por padrão; `\xa0` e tabs em `Pessoa`/`Fornecedor`/`Descrição`; datas com ano 920, 1900, 1901, 2006, 2049 (Vendas 5, Movimentação 55, Aberto 7). O `readxl` devolve NA; o SheetJS devolve `Date` válido (e deslocado um dia abaixo de 1900).
- **`raw` no `sheet_to_json` não diverge nestes arquivos** (medido no SheetJS 0.20.3, 48.862 linhas, 5 colunas monetárias, dois modos: 0 diferenças — células do Monde sem formato numérico). Unificar por convenção, não por defeito ativo.
- **Vendas por Produto é a única fonte de receita por produto.** A API do Monde não tem `revenue` no item (payload cru conferido); as 4 combinações testadas reconstroem 26,8% das vendas. Pedido 8.2 ao fornecedor **ainda não enviado** — é ato do Yan e é o gate da substituição. Fora desta versão.
- **Teto de 30 mil linhas por pesquisa é do relatório de Vendas**, não do sistema (Movimentação veio com 94.816 linhas num arquivo). `25-26.xlsx` está em 82% do teto.
- **Lançamentos por Operação:** a lista de operações deriva de Vendas (`Produto = "Contrato de casamento"` → 243 operações); a lista manual tem **242** — `W -  Ingrid e Rodrigo - DDMMAA` (espaço duplo) está fora, e `W - Camila e Bruno -  02SET23` só entra por patch manual comentado no script. Os 8 XLSX de contas a pagar/receber (2021–2028) servem só para `Vencimento`; a base **Aberto** cobre **4.001 dos 4.008** lançamentos sem liquidação (99,8%) com `Vencimento` idêntico em 4.927/4.928 — e a única divergência é a Aberto mais atual. 571 lançamentos aparecem em mais de uma operação (11.603 linhas); 1.135 de 24.489 divergem em valor contra as vizinhas, concentrados em "Reembolso" — **causa não provada, pergunta para a gerente, não bloqueia**.
- **Oráculo REX da v5.8.0 é relacional** (não literal) — conferido. Os 141 pares do seed `dre_comp_map` são idênticos, par a par, ao export de 21/09.
- **Pendências herdadas já resolvidas:** 0254 aplicada; agendamento CDI = migration 0244, job vivo. **Ainda pendentes:** `COALESCE` da A1 v5.9.4 no corpo vivo de `monde_ingest_promover`; raiz atrás do remoto.

## 3. Decisões do Yan (firmes — embutir, não rediscutir)

1. **Frente única**, tudo nesta versão.
2. **Cadência-alvo diária** (decisão de negócio). A versão entrega o mecanismo; a cadência é configurada, não hardcoded.
3. **Dado pessoal de Vendas (`CPF`, `CNPJ`, `E-mail`) só no cru do Storage**, nunca em tabela. Bucket com acesso restrito e retenção declarada.
4. **A role `verificador` (briefing v5.11.0) entra aqui** como Frente A1, sem alteração de conteúdo — o briefing dela é anexo e vale como spec da frente; o que ele diz "próximo livre 0271/0174" é **stale**, conferir.
5. **Allowlist explícita** para as duas roles, por assinatura, derivada mecanicamente — nunca heurística de volatilidade.
6. **Autenticação da rota = molde da API externa** (`x-api-key`, hash em `app.api_chave`), não `CRON_SECRET`.
7. **`Intermediário` volta a ser carregado** (o `mutate(= NA)` do script era resíduo).
8. **Filtro `Welcome` sai da ingestão e vai para o transform.** Raw guarda o arquivo inteiro (checksum passa a fechar); `transform_raw_to_analytics` exclui `Setor Macro = Welcome` num `WHERE` nomeado e testado; **nenhum número a jusante muda** (210 linhas, 470.320,84 de Valor Total, 5.242,80 de Receitas — provar por diff de `fato_venda` antes/depois).
9. **Vendas aceita N arquivos por carga, um por ano**, junção no servidor. Checksum por arquivo + reconciliação do conjunto. Sem sobreposição de `Venda Nº` entre arquivos (invariante).
10. **Os 8 XLSX de contas a pagar/receber se aposentam.** `Vencimento` da Operação vem da base Aberto (fallback Movimentação). Os 3 lançamentos em nenhuma das duas ficam com `Data_Final` nula, como hoje.
11. **Pessoas fica fora** (parada, viva). **Operação entra** na fundação (rota, atomicidade, log, tabela raw nova) mas **não** ganha extração automática nesta versão.
12. **Scripts R só se aposentam depois do oráculo verde em TS.** Ficam em `docs/legado/scripts-r/` como referência histórica, com o out-briefing apontando o teste que os substitui.
13. **Datas fora de faixa são rejeitadas e reportadas, nunca convertidas.** Faixa: `[2015-01-01, hoje + 5 anos]` como constante nomeada. Linha rejeitada vai para o log; a carga **não** falha por isso (é sujeira conhecida do Monde, corrigida lá), mas o número de rejeitadas é baseline monitorado.
14. **Mês corrente parcial:** entra na base, é **marcado na leitura** (coluna do mês com sufixo "· parcial" no cabeçalho da tabela densa e nos cards que somam YTD). Nada de DELETE, nada de filtro na escrita.

## 4. Contrato de ingestão v1 (congelar em `docs/contratos/ingestao-v1.md` — GATE 0)

```
POST /api/ingestao/{base}
  base ∈ { demonstrativo-competencia | vendas-produto | lancamentos-movimentacao |
           lancamentos-aberto | lancamentos-operacao }

Headers
  x-api-key: <chave do ingestor>            (hash em app.api_chave; escopo = base)
  x-ingestao-origem: rpa-pad | rpa-cloud | manual | reprocesso
  x-ingestao-idempotencia: <uuid>           (mesma chave → mesma resposta, sem recarregar)

Body: multipart/form-data
  arquivo[]  : 1..N arquivos CRUS do Monde (xlsx; csv só para lancamentos-operacao)
  extraido_em: ISO-8601 (momento da extração no Monde, informado pelo chamador)
  observacao : texto livre opcional

Fluxo no servidor (uma transação por carga, ou nada)
  1. autentica; resolve escopo da chave → base
  2. grava cada arquivo no bucket `ingestao-cru/{base}/{aaaa}/{mm}/{uuid}-{n}.xlsx`; sha256
  3. parse (núcleo *Rows compartilhado com o card de upload); rejeita datas fora de faixa (contando)
  4. extrai checksums do arquivo (§5.C) e confere contra as linhas parseadas
  5. reconcilia o conjunto (Σ arquivos = linhas parseadas; Vendas: sem Venda Nº repetido entre arquivos)
  6. diff contra a carga anterior (linhas, soma, por ano; pares novos na bandeja)
  7. promover_carga_{base}(lote) — atômica; regenerar dentro
  8. grava linha em ingestao.carga (§5.E) e dispara alarmes
  Qualquer falha em 3–7 → 422 com o motivo estruturado; base anterior intacta; linha de carga com status=rejeitada.

Resposta 200
  { carga_id, base, status: "aplicada",
    arquivos: [{ nome, sha256, linhas, checksums_conferidos, checksums_falhos }],
    parse:    { linhas, rejeitadas_por_data, pares_novos },
    diff:     { linhas: ±, soma: ±, por_ano: {...}, anos_fechados_alterados: [...] },
    alarmes:  [ ... ] }

Erros: 401 chave inválida/revogada · 403 chave sem escopo para a base · 409 carga em andamento
       (advisory lock) · 413 acima do limite · 422 rejeitada (motivo) · 500 nunca silencioso (linha de
       carga com status=erro)
```

O **card de upload em `/admin/uploads` chama a mesma rota** (com a sessão do usuário em vez de chave), passa a aceitar o cru e a exibir a resposta acima. Um único caminho; o cliente deixa de parsear.

## 5. Frentes

### A — Credenciais (A1 = briefing v5.11.0 inteiro; A2 = espelho para escrita)

**A1 `verificador`:** exatamente o briefing anexo (`CREATE ROLE verificador NOLOGIN`, `GRANT … TO authenticator`, `REVOKE ALL` + `ALTER DEFAULT PRIVILEGES`, allowlist derivada de `rpc-contrato.test.ts` por `oid`, usuário `verificador@janus.interno` com todas as áreas de leitura, JWT em `SUPABASE_VERIFICADOR_KEY`, runbook de rotação, sondas C1/C2 vistas reprovando por mutante). **`app.exigir_acesso` não muda** — se precisar, PARE.

**A2 `ingestor`:** mesma anatomia; allowlist = **só** as `promover_carga_*` das cinco bases (nem leitura, nem `truncar_*`, nem `inserir_lote_*`). Usuário `ingestor@janus.interno` com área `admin/uploads` apenas. A **chave da rota** é registro em `app.api_chave` com escopo por base (uma chave pode ter várias bases; a RPA de Lançamentos por Categoria usa uma chave com duas). Revogar a chave ⇒ 401 imediato; desativar o usuário ⇒ `PERMISSAO_NEGADA` na RPC — duas alavancas, escrever as duas no runbook.

### B — Rota e Storage

Rota do §4. Bucket `ingestao-cru` privado; policy só `service_role` + leitura por `admin`; retenção declarada no ADR (proposta: 24 meses, revisar). Limite por arquivo e por carga como constantes. Rota `api/admin/upload-lancamentos` e `lancamentos.ts` (parser servidor duplicado) **saem** — grep de chamadores no ato.

### C — Parsers (um por base, no servidor, molde do Demonstrativo)

Regras comuns: descoberta posicional de colunas (`normalizeHeader` + coluna de rótulo = a que tem conteúdo nas linhas de dado; **nunca** mapa literal por posição); `raw:true` em todos; `trim` explícito que também remove `\xa0` e tabs; guarda de faixa de data (decisão 13); guarda estrutural (colunas de rótulo ≠ campos, formato largo) que **aborta** a carga; núcleo `*Rows` puro compartilhado com o card.

| Base | Do script R para o parser (e o que muda de propósito) |
|---|---|
| Demonstrativo | porte 1:1 de `tratamento_demonstrativo_v1.R` (cabeçalho = linha com mais rótulos não numéricos; valor = última coluna com conteúdo; varredura por nível; `Mês Nº` e `Competência` derivados). 4.426 células mescladas: o valor está na âncora. |
| Vendas | remove linha de totais **depois de lê-la como checksum**; `Intermediário` preservado; `Semana`/`Mes`/`Setor Macro`/`Setor Micro`/`Contrato`/`Taxa de Serviço` **só se a plataforma os lê** — enumerar consumidores em `raw.vendas_excel`/transform; os que ninguém lê **não se portam** (registrar). `Mes` se portado é por número→nome fixo, nunca locale. Classificação `Setor Micro` sobre string aparada, com sonda que injeta `"Transporte Rodoviario "` e exige `Extras`. **Não** filtra Welcome. N arquivos. |
| Movimentação / Aberto | um parser, layout autodetectado (14/15 colunas) **mas por nome de coluna normalizado, não por vetor de tipos posicional**; linhas de outline lidas como checksums antes de descartar (regex `^(Grupo de Categoria|Categoria)\s*:\s*(.+?)\s*\((\d+),\s*(-?R\$[^)]+)\)$`); movimentações futuras preservadas. |
| Operação | CSV do scrape como está hoje (`Análise de Operações`), mais `Vencimento` resolvido no servidor por `Número` contra `raw.titulos_em_aberto` → `raw.lancamentos_movimentacao`; `Data_Final = coalesce(Liquidação, Vencimento)`; `Status` calculado **na leitura** (depende de "hoje"), não gravado. Nova `raw.lancamentos_operacao` espelhando o CSV; `fato_lancamento_operacao` passa a derivar dela no `promover`. Lista de operações **derivada** de `raw.vendas_excel` (`Produto = 'Contrato de casamento'`), aparada com `str_squish`, exposta por RPC de leitura para a futura RPA — a lista manual morre. |

**Oráculos permanentes (GATE 1)** — fixtures em `tests/fixtures/ingestao/` são os anexos §9; cada teste enumera as divergências conhecidas: Vendas — 8.470 células de trim, 5 de `\xa0`, 5 datas; Movimentação — 30 datas ano 1900. Tudo o mais: idêntico.

### D — Carga atômica com checksum como gate

Uma `promover_carga_{base}` por base, molde `promover_carga_vendas`: staging → validações → TRUNCATE + `INSERT…SELECT` + `regenerar_*`/`provisionar_*` **dentro** da mesma função, `pg_advisory_xact_lock` por base, `SET LOCAL lock_timeout`. Recebe o lote **e** os checksums extraídos; confere **no banco** (não só no servidor) e `RAISE` se não fechar — a base anterior fica. Idempotente por `carga_id`.

Checksums por base: Demonstrativo 557 (tolerância 0,005 — o pivot arredonda na exibição); Vendas 5 por arquivo; Movimentação 148 + total; Aberto 95 + total; Operação **cruzamento**: 100% dos `Número` com `Liquidação` nula devem existir em Aberto ∪ Movimentação (hoje 4.005/4.008 — os 3 conhecidos ficam como baseline) e `Vencimento` deve coincidir; ausência acima do baseline é alarme, não bloqueio.

`truncar_*` e `inserir_lote_*` das bases migradas saem na **destrutiva** (GATE 3), depois que o card deixou de chamá-las e foi deployado.

### E — Log, alarme, cadência

`ingestao.carga` (uma linha por execução: `carga_id`, base, origem, chave/usuário, `extraido_em`, `recebido_em`, arquivos jsonb com sha256, linhas, somas, checksums conferidos/falhos, rejeitadas por data, pares novos, diff jsonb, status, erro, duração). `ingestao.baseline` (por base: sem-conta=914, sem-data=93, lançamentos-fora-das-vizinhas=3 … — valores declarados, alarme quando o desvio passa de limiar). Cobertura derivada do dado (min/max), nunca do nome do arquivo (o nome mente: "2026" contém 2024–2026).

**Crons entram no log:** `monde-ingest-incremental`, as três reconciliações e o CDI passam a gravar resultado em `ingestao.carga` (origem `cron`), e o `pg_net` deixa de ser a única evidência. Falha de cron sem linha em N minutos = alarme.

**Alarmes** (e-mail via nodemailer, destinatários em config): checksum falho · ano fechado alterado acima de R$ X (constante) · baseline desviou · par novo na bandeja · carga esperada não chegou até H (cadência diária configurada) · cron sem resultado. **Tela** `/admin/ingestao`: últimas cargas, diff, alarmes, botão de reprocesso do cru.

### F — Ordem de carga como contrato

Grafo declarado em código (`src/lib/ingestao/grafo.ts`, testado): `vendas-produto` → {`lancamentos-movimentacao`, `lancamentos-aberto`} → `lancamentos-operacao`; `demonstrativo-competencia` independente. A rota **recusa (409)** carga de Operação se Aberto do dia ainda não entrou; o `promover` de Vendas recalcula a lista de operações; `regenerar_dim_operacao_weddings` roda no `promover` de Operação, não antes.

### G — Leitura

Mês parcial marcado (decisão 14) na DRE de competência **e** nas seções de caixa que somam o mês corrente. Carimbo "base carregada em DD/MM/AAAA" em toda TopSection que lê base carregada (hoje só a competência tem). Filtro Welcome no transform (decisão 8).

### H — Baseline de schema e drift (B-22)

`supabase db dump --schema-only` versionado como `supabase/baseline/schema-v6.sql`; teste de contrato compara catálogo vivo × baseline (tabelas, colunas, funções por assinatura, grants das duas roles) e reprova drift. Regenera no `/fechamento-versao` junto com `database.ts`.

## 6. Invariantes (inegociáveis)

1. **Zero mudança de número em qualquer tela** (baseline: suíte pós-merges + snapshot de `fato_venda`, `fato_fluxo`, `vw_dre_competencia`, `get_dre_mensal` por ano antes/depois). Exceções visíveis: sufixo "parcial", carimbo de data, `Intermediário` preenchido.
2. **`app.exigir_acesso` não muda.**
3. **Um parser por base**, no servidor; o card não parseia. Grep de `parseArquivoEmWorker` ⇒ vazio ao fim.
4. **Carga é atômica ou não é**: em nenhum momento uma base fica vazia ou parcial para leitores.
5. **Checksum falho nunca aplica.** Nem com flag, nem manual — a via de exceção é reprocessar o cru após corrigir na origem.
6. **Nenhum dado pessoal de Vendas em tabela** (decisão 3); sonda estática reprova coluna `cpf|cnpj|email` em `raw.vendas_excel` e no parser.
7. **Segredos fora do versionado**; `.env.example` só com nomes.
8. **Todo `DROP` na destrutiva cita o commit que removeu a última referência** e a prova (grep vazio + REST 404/negado).
9. **Suíte inteira roda com `SUPABASE_VERIFICADOR_KEY`**, contagem igual ou maior, 0 skip.
10. **Os scripts R permanecem até o oráculo TS da sua base ficar verde** — e o out-briefing nomeia o teste que os substitui.

## 7. Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M0** | Abertura; **GATE 0**: `docs/contratos/ingestao-v1.md` congelado; Carta; ímãs declarados (`rpc-contrato.test.ts`, `promover_*`, `uploads/page.tsx`). | contrato commitado antes de qualquer código |
| **M1** | **A1 `verificador`** — as 7 missões do briefing v5.11.0, sem alteração. | GATE 2 parte 1 transcrita |
| **M2** | **A2 `ingestor`** + `app.api_chave` com escopo por base + runbook (2 alavancas). | chave revogada ⇒ 401; usuário inativo ⇒ negada |
| **M3** | **Parsers** (Frente C) com fixtures dos anexos; **GATE 1** por base; sondas: trim, `\xa0`, faixa de data, formato largo, colunas ≠ campos — todas **vistas reprovando por mutante**. | 5 oráculos verdes; divergências enumeradas nos testes |
| **M4** | **Storage + rota** (Frente B); card de upload passa a chamar a rota; `parseArquivoEmWorker`, `lancamentos.ts` e rota morta saem. | upload manual do cru pelo card funciona nas 5; grep vazio |
| **M5** | **Atomicidade** (Frente D): 4 `promover_carga_*` novas + Vendas para N arquivos + Operação com `raw` nova e `Vencimento` das vizinhas. `revisor-db` antes. Ensaio em transação revertida: checksum falso ⇒ RAISE, base intacta. | snapshot de fatos antes/depois idêntico (invariante 1) |
| **M6** | **Log, baseline, alarmes, crons no log, tela `/admin/ingestao`** (Frente E). | carga rejeitada gera linha + e-mail; cron sem resultado gera alarme em teste |
| **M7** | **Grafo** (F) + **leitura** (G): mês parcial, carimbos, Welcome no transform. | diff `fato_venda` = 0 linhas; 409 na Operação sem Aberto |
| **M8** | **Baseline de schema** (H). | drift sintético (coluna a mais no catálogo) reprova |
| **M9** | **Deploy intermediário**; rodar uma carga manual real de cada base pelo card com o cru de hoje; comparar com a produção pré-versão. | 5 cargas aplicadas, diff ≈ 0 contra o estado anterior (exceto `Intermediário`) |
| **M10** | **GATE 3 — destrutiva** (`truncar_*`, `inserir_lote_*` migradas, rota morta, `audit.ingestao_log` se órfã). TTY do Yan. | REST das funções removidas ⇒ 404; nada 500 |
| **M11** | **Fechamento:** v6.0.0; CHANGELOG; CHANGELOG_DIRETORIA (duas linhas: "a plataforma passa a ler direto os relatórios do Monde, sem planilha intermediária; o mês em curso aparece marcado como parcial"); 3 ADRs; skills `ingestao-planilhas` (checksum como gate, trim, faixa de data, descoberta posicional) e `banco-e-rpc` (duas roles, allowlist); `estado-do-projeto`; `backlog-v6` atualizado; scripts R para `docs/legado/`; out-briefing com as três provas (GATEs 1–3) transcritas e os números antes/depois. | — |

## 8. Gates, checkpoint, fronteira

**Gates escalonados:** `tsc`+`lint` por missão; `build`+`test` após M3, M5, M8 e no fechamento. `revisor-db` em M1, M2, M5, M10. `revisor` em cada frente. `verificador-visual`/Chrome MCP em `/admin/uploads`, `/admin/ingestao`, `/financeiro/dre`. Verificação de RPC via REST com a credencial nova; **`db query` não executa o corpo**.

**Checkpoint do Yan:** (M0) ler o contrato como quem vai escrever a RPA contra ele · (M1/M2) assistir às duas provas adversariais · (M3) abrir os 5 testes de oráculo e conferir as divergências enumeradas contra o que este briefing lista · (M5) parecer do `revisor-db` sobre os `promover` · (M9) as 5 cargas reais e o diff · (M10) destrutiva em TTY · (final) enviar o pedido 8.2 ao fornecedor do Monde; comunicar à liderança a cadência diária e a reapresentação de histórico (junto das duas comunicações já pendentes); olhar o `<select id="id">` da página de operações e anotar se o valor é estável; levar à gerente os 571 lançamentos em duas operações e os "Reembolsos" divergentes.

**Fronteira (fora):** qualquer RPA (v6.1+: Lançamentos por Categoria → Demonstrativo → Vendas → Operação, esta só depois do id) · Vendas via API (fornecedor) · Pessoas · carga incremental por janela (Movimentação cresce ~2.000 linhas/mês — futuro) · `STABLE` nos ~191 `VOLATILE` · mudar `fn_diario_alteracoes` · unificar editores de estrutura · CSV da DRE · qualquer tela nova além de `/admin/ingestao`.

## 9. Anexos (fixtures dos oráculos — copiar para `tests/fixtures/ingestao/`)

| Base | Cru | Script R (referência, vai para `docs/legado/`) | Tratado (oráculo) |
|---|---|---|---|
| Demonstrativo | `demostrativo_de_resultado.xlsx` (3.896×17, export 21/09) | `tratamento_demonstrativo_v1.R` | `Demonstrativo_por_Competencia_tratado.xlsx` (3.334×8, Σ 508.964,10) |
| Vendas | `23.xlsx`, `24.xlsx`, `25-26.xlsx` (12.626 / 11.770 / 24.472 linhas c/ totais) | `ajuste_vendas_teste.R` | `VendasPorProduto_tratada.xlsx` (48.652×21) — **atenção:** tem Welcome filtrado e `Intermediário` zerado; o oráculo da v6 compara **antes** do filtro e **com** `Intermediário` (derivar do cru: 48.862 linhas) |
| Movimentação | `Lancamentos_por_Categoria_2026__movimentação_.xlsx` (94.817×15) | `tratamento_lancamentos_v2.R` | `Lancamentos_por_Movimentacao_tratada.xlsx` (94.667×13, Σ 717.710,74) |
| Aberto | `Lancamentos_por_Categoria_2026__venc_em_aberto_.xlsx` (36.273×14) | idem | `Lancamentos_por_Vencimento_em_Aberto_tratada.xlsx` (36.176×12, Σ −33.479.830,06) |
| Operação | `Análise_de_Operações_21-09.csv` (41.750×8) + `Lista_de_Operações.csv` (242) | `Extração_Casamentos.R` + `Análise_Casamentos2.R` | `Lançamentos_por_Operação.csv` (41.750×12) — o oráculo da v6 exige `Vencimento` ≡ este arquivo em ≥ 4.927/4.928 e nomeia o 203048 |
| Credencial | — | `briefing-v5-11-0-role-verificador.md` | — |

**Somas por ano do Demonstrativo (export 21/09), para o teste relacional REX ≡ Σ linhas:** 2024 = 224.299,47 · 2025 = 464.892,94 · 2026 (jan–set) = −180.228,31.

## 10. Aprendizados a registrar (régua de 5 destinos)

- **O arquivo já carrega a prova; descartar linha de totais/outline sem ler é jogar fora o checksum.** → skill `ingestao-planilhas` + o gate mecânico da Frente D (destino 1).
- **Regra de negócio pendurada em default de biblioteca** (`trim_ws` do `readxl`) é regra invisível. → sonda de mutante (destino 1) + skill.
- **Chave de junção que é rótulo digitado por humano** quebra por espaço. → skill; resolver por id quando existir.
- **Rastro de execução com TTL não é log.** → Frente E (mecânico).
- **Nome de arquivo não é fonte de cobertura.** → skill.

## 11. Skills a ler

`.claude/skills/ingestao-planilhas/SKILL.md` · `banco-e-rpc` · `contrato-rpc-front` · `ui-design-system` · `tabela-densa` · `email` · `orquestracao` (Carta, antes de despachar)

## 12. Commits sugeridos

1. `docs(v6-0-0): briefing + contrato de ingestao v1` — **GATE 0**
2. `feat(db): role verificador com allowlist por assinatura` (+ os da v5.11.0)
3. `feat(db): role ingestor + api_chave com escopo por base`
4. `test(ingestao): fixtures reais e oraculos cru↔tratado das 5 bases` (vermelhos)
5. `feat(ingestao): parsers no servidor — <base>` (um por base; oráculo verde no mesmo commit)
6. `feat(api): rota de ingestao + storage do cru; card de upload passa a usar a rota`
7. `feat(db): promover_carga_* atomicas com checksum como gate`
8. `feat(ingestao): log de carga, baseline, alarmes, crons no log, tela /admin/ingestao`
9. `feat(ingestao): grafo de dependencia; mes parcial marcado; welcome no transform`
10. `chore(db): baseline de schema + teste de drift`
11. `chore(db): drop de truncar_/inserir_lote_ migradas e rota morta — destrutiva` — **GATE 3**
12. `chore(release): v6.0.0`
