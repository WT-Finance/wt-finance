# Anexo v6.0.0 / M6 — desenho do log, alarmes, vigia e tela (Frente E)

> **O que é.** O desenho que a M6 implementa, escrito antes do código. Escrito em 2026-09-24.
> Migration livre: **0280**. ADR livre: **0176**.

---

## 1. O que existe hoje (medido, não presumido)

Cinco crons, todos `pg_cron` + `pg_net` chamando rotas da Vercel — declarados em
`0182` (`monde-ingest-incremental`, `*/15`), `0236` (`monde-reconciliacao-1/2/3`, 06:05/06:20/06:35
UTC) e `0244` (`cdi-ingest-mensal`, dia 3 às 09:00 UTC). Rotas: `/api/monde/ingest` e
`/api/cdi/ingest`, autenticadas por `CRON_SECRET` (isentas em `src/proxy.ts`).

**Não há histórico de falha por execução em lugar nenhum.** `cron.job_run_details` diz
`succeeded` porque o que ele mede é o `SELECT net.http_post(...)` — que só **enfileira**; a resposta
HTTP real fica em `net._http_response`, que tem **TTL de 6 horas**; `monde.ingest_control` guarda
só o último valor, sobrescrito a cada rodada. E **não há alarme ativo**: o tripwire da v5.4.4 e o
alerta de sync da v5.1.11 só aparecem para quem abrir a tela.
(Evidência: `docs/investigacao-v6-ingestao-parte2.md` §D3, medido no banco em 21/09.)

## 2. Decisões do Yan (24/09) — embutir, não rediscutir

| # | Decisão |
|---|---|
| 1 | Alarme de **ano fechado alterado dispara em QUALQUER mudança** (não há limiar em R$) |
| 2 | **Sem alarme de baseline** nesta versão. A "sujeira conhecida" (914 títulos sem conta, datas impossíveis por base, lançamentos sem vencimento) continua aparecendo no resultado de cada carga, só não dispara e-mail. `ingestao.baseline` **não é criada** |
| 3 | Alarme de **carga esperada que não chegou: mecanismo pronto, DESLIGADO** até a RPA existir (v6.1). Liga-se por configuração, sem código novo |
| 4 | Alarmes em **MODO TESTE**, destino `EMAIL_TESTE_DESTINO` = conta do Yan. A virada para destinatários reais é decisão dele |

**Achado que motivou a decisão 2:** dos três números de baseline que o briefing declara, só um se
reproduz nos anexos de 21/09 — os **914** títulos de Aberto com `conta` vazia. O "93 sem data" não
corresponde a nenhuma contagem mensurável, e o "3 lançamentos fora das vizinhas" hoje é **1** (o
`Número` literal `"NA"`, medido na M4).

## 3. O modelo de dados (migration 0280, aditiva)

### Por que os crons NÃO gravam em `ingestao.carga`

O briefing diz que sim. Não gravam, por três motivos técnicos:
1. `ingestao.carga.base` tem `CHECK` com as cinco bases de upload; um cron não é nenhuma delas.
   Alargar o `CHECK` exige `DROP CONSTRAINT` + `ADD CONSTRAINT`, que o classificador do gate lê
   como **destrutivo**.
2. As colunas de `ingestao.carga` são de **arquivo** (arquivos com sha256, checksums, diff, datas
   rejeitadas). Uma execução de cron não tem nenhuma delas.
3. A cadência é outra: o incremental roda 96 vezes por dia; a carga de arquivo, uma.

O que o briefing quer — "o resultado dos crons fica no mesmo lugar, e a tela mostra tudo" — sai
igual com uma tabela irmã e uma RPC de leitura que junta as duas.

### As tabelas

- **`ingestao.execucao`** — uma linha por execução de processo agendado: `id`, `processo`
  (`monde-incremental`, `monde-reconciliacao`, `cdi-mensal`, `ingestao-vigia`), `iniciado_em`,
  `concluido_em`, `status` (`em_curso` | `ok` | `pulado` | `erro`), `resultado jsonb`, `erro`,
  `duracao_ms`. **`pulado` é status próprio** — o incremental do Monde devolve "PULADO (lock
  ocupado)" quando outra ingestão está em curso, e isso é um cron **saudável** que esperou a vez;
  contá-lo como falha faria o vigia alarmar exatamente quando o sistema está trabalhando.
- **`ingestao.alarme`** — um **incidente**, não um disparo: `id`, `tipo`, `chave` (o que está em
  alarme: o processo, a base, o `carga_id`), `aberto_em`, `resolvido_em`, `notificado_em`,
  `detalhe jsonb`. `UNIQUE (tipo, chave) WHERE resolvido_em IS NULL` — um incidente aberto por
  vez. **É o que impede o sistema de alarme de virar spam**: com o incremental fora do ar por um
  dia, o vigia (a cada 15 min) veria o problema 96 vezes, e mandaria 96 e-mails. Com incidente,
  manda **um** ao abrir e, opcionalmente, um ao resolver. O teto do Office 365 é 30 mensagens por
  minuto e 3 conexões simultâneas por caixa — alarme sem deduplicação esbarra nele no primeiro dia
  ruim.
- **`ingestao.expectativa`** — configuração: `alvo` (processo ou base), `tipo` (`processo` |
  `base`), `tolerancia` (intervalo), `ativo boolean`, `descricao`. **Nasce com todas as linhas
  `ativo = false`** — decisão 3 para as bases; e, para os processos, porque o registro de execução
  só passa a existir em produção **depois do deploy** (§6).

### As RPCs

Todas `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE`/`GRANT` explícitos e `COMMENT` citando
`service_role`, no molde da 0276:
- `ingestao_execucao_abrir(processo)` / `ingestao_execucao_concluir(id, status, resultado, erro)`;
- `ingestao_alarme_abrir(tipo, chave, detalhe)` → devolve se o incidente é **novo** (é o que decide
  se manda e-mail) — idempotente pelo índice único, **sem** a corrida `check-then-insert` que a
  0276 tinha (usar `ON CONFLICT` ou tratar `unique_violation`);
- `ingestao_alarme_resolver(tipo, chave)` / `ingestao_alarme_marcar_notificado(id)`;
- `ingestao_soma_por_ano(base)` → `{ano: {linhas, centavos}}` da base **viva** (insumo do alarme de
  ano fechado; ver §4);
- `ingestao_painel()` → últimas cargas, últimas execuções, alarmes abertos, expectativas — **esta
  é de leitura para a TELA**, então leva `app.exigir_acesso(ARRAY['admin/uploads'])` **inline** e
  `GRANT` a `authenticated`.

E o **cron `ingestao-vigia`** (`*/15`), no molde da 0182 (URL e segredo lidos do Vault, os mesmos
`monde_app_url`/`monde_cron_secret`), criado **inativo** (`cron.alter_job(..., active := false)`):
a rota que ele chama só existe em produção depois do merge; ativo antes disso, ele bateria num 404
a cada 15 minutos — o próprio padrão de "cron sem resultado" que a M6 existe para detectar.

## 4. Os alarmes

| Alarme | Quando | Chave do incidente |
|---|---|---|
| **checksum falho** | carga rejeitada por `CHECKSUM_FALHOU` (ou outra rejeição de conteúdo) | `carga_id` |
| **ano fechado alterado** | carga aplicada mexeu em ano anterior ao corrente (qualquer valor — decisão 1) | `base` + `ano` |
| **par novo na bandeja** | carga do Demonstrativo trouxe pares novos (`pares_novos > 0`) | `carga_id` |
| **processo sem resultado** | processo com expectativa ativa sem execução `ok`/`pulado` dentro da tolerância | `processo` |
| **carga esperada não chegou** | base com expectativa ativa sem carga aplicada dentro da janela | `base` |

Os três primeiros nascem **na carga** (`carga.ts`, depois de concluir); os dois últimos, **no
vigia**. Nenhum deles derruba nada: alarme é camada adicional, e falha ao enviar vira log, nunca
exceção (skill `email` §1).

**"Ano fechado" = ano anterior ao corrente, em São Paulo.** A mudança é medida comparando, ano a
ano, o que a carga nova traz contra o que a base viva tem — é o `diff.por_ano` e
`anos_fechados_alterados` que o contrato §2.3 já prevê e a M4 deixou para cá. Coluna de ano por
base: Demonstrativo `ano`; Movimentação `movimentacao`; Aberto `vencimento`; Vendas `data_venda`;
Operação `data_final`. Grandeza: contagem **e** soma (`valor`; em Vendas, `valor_total`) — mudar
qualquer uma das duas dispara.

⚠️ **O diff por ano tem de comparar a MESMA grandeza dos dois lados** — a lição mais cara da M4, que
apareceu em três lugares diferentes. Em Vendas a base conta venda distinta e o parser conta linha
de item; em Operação o aplicador descarta placeholder. O "depois" de cada ano é o que a **base** vai
ter, não o que o parser leu.

**O vigia vigia a si mesmo, até onde dá:** ele grava a própria execução em `ingestao.execucao`, e a
tela mostra "última verificação: há N minutos". Se o vigia parar, **ninguém recebe e-mail** — esse
limite é estrutural (quem vigia o vigia) e fica escrito na tela, não escondido.

## 5. E-mail (skill `email`, lida antes de desenhar)

Função nova **na camada** `src/lib/email/` — `enviarAlarmeIngestao` —, nunca lib paralela:
- **MODO TESTE fail-closed (§7):** em teste, TODO destinatário vira `EMAIL_TESTE_DESTINO`; sem
  ele, o envio é **recusado** com motivo, nunca cai para o destinatário real. O override mora **na
  função**, não no chamador — um caminho novo herda a trava sem poder esquecê-la. Destinatários
  reais vêm de `INGESTAO_ALARME_DESTINOS` (lista separada por vírgula) e só são usados em modo real.
- **Fan-out por `enviarFanOut`** (concorrência 2, retry só em falha transitória) — nunca
  `Promise.all` sobre destinatários (v5.3.4).
- **Nunca lança**; devolve `{ok, erro}`; o chamador loga. **Sempre `await`** — em serverless,
  fire-and-forget não envia (v4.25).
- **E-mail interno:** lockup duplo `[JANUS] | [WELCOME GROUP]`. Layout em tabelas + inline —
  `docs/email-layout-guide.md` antes de montar o template.
- **Cada tipo de alarme ganha teste que EXIGE o conteúdo** no corpo (a base, o ano, o valor, o
  `carga_id`), não só o assunto (skill `email`, lição da v5.9.0).

## 6. Ordem de ativação (o que só vale depois do deploy)

| O quê | Quando passa a valer |
|---|---|
| tabelas, RPCs, tela, alarmes de carga | ao aplicar a 0280 e subir o código (local já na M6) |
| rotas do Monde e do CDI gravando execução | **depois do deploy** (M9) — são rotas da Vercel |
| cron `ingestao-vigia` | ativar **depois do deploy** (M9), `cron.alter_job(active := true)` |
| expectativas dos processos | ativar **depois do deploy** e **depois** da primeira execução registrada de cada um |
| expectativas das bases | **quando a RPA existir** (decisão 3) |

## 7. Tela `/admin/ingestao`

Últimas cargas (status, base, origem, quem, quando, linhas, checksums, diff), execuções recentes dos
processos, alarmes abertos, e a linha "última verificação do vigia". Área RBAC: **`admin/uploads`**
— as mesmas pessoas que carregam são as que precisam ver o log; criar área nova seria decisão de
acesso sem motivo.

**Botão de reprocesso.** O contrato §7 diz "repetir o passo 3 com os mesmos `path`s" — e isso
**não funciona** com o desenho da M4: o `carga_id` viaja dentro do caminho do objeto, e
`ingestao_carga_abrir` é idempotente por `carga_id`, então repetir com os mesmos paths devolveria a
resposta guardada em vez de reprocessar. O reprocesso da tela **copia** os objetos da carga antiga
para caminhos novos sob um `carga_id` novo (mesmos bytes, mesmo sha256) e roda o passo 3 normal —
todo invariante preservado. A contradição no contrato fica registrada para o Yan (candidata a
errata 3), porque ela afeta a RPA.

## 8. Prova da missão

1. **Carga rejeitada gera linha + e-mail**: uma carga com checksum falso vira linha `rejeitada`
   em `ingestao.carga`, incidente aberto em `ingestao.alarme` e e-mail em
   `EMAIL_TESTE_DESTINO`, com o conteúdo exigido.
2. **Processo sem resultado gera alarme**: com uma expectativa ativada de forma controlada, o vigia
   rodado localmente abre o incidente, manda **um** e-mail, e **não** manda o segundo na rodada
   seguinte (deduplicação). Depois a expectativa volta a inativa e o incidente é resolvido.
3. Lógica de decisão do vigia e dos alarmes de carga como **função pura**, com teste exaustivo.
4. `revisor-db` na 0280; `revisor` na missão; conferência visual da tela no Chrome.
