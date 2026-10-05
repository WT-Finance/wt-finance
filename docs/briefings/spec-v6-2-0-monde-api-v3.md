# v6.2.0 — Espelho Monde na API oficial v3 (Rota B)

> **Rota B** — plano aprovado pelo Yan em 05/10/2026 na sessão; esta spec é o rastro em disco (CLAUDE.md, "Workflow de versão").

## Contexto

A `monde-data` (intermediária do TTARS) foi desligada em 02/10/2026 00:00 e responde HTTP 410. O espelho
`monde.*` (fonte de produção de Metas, Comparação e Performance/Executiva desde a v5.1.4) está parado
desde 01/10 23:45; o cron do Janus bate no 410 a cada 15 min. Yan obteve a chave própria da API oficial
(`MONDE_V3_API_KEY`, já em base64, em `.env.local` e em Production na Vercel) e as instruções da troca.
Objetivo: o espelho volta a sincronizar pela v3 **com as mesmas colunas, os mesmos valores e a mesma
semântica de hoje** — zero mudança em RPC de leitura, MV ou tela.

## Fatos medidos (sonda read-only de 05/10 + paridade offline sobre 3.003 vendas do espelho)

- **O `raw` guardado já É o payload de `GET /sales/{id}` da v3** (diff da 74833 fresca × guardada: só
  custom_fields editados depois). O TTARS só acrescentava nomes resolvidos. ⇒ oráculo de paridade offline.
- Regras do transform, todas provadas contra as colunas gravadas (jul–set/2026, 2.140 vendas, 4.604 itens):
  `total_final_value=totals.final_amount`, `total_revenue=totals.revenue`, `sale_id=id`, `venda_numero=
  String(sale_number)` (**número** na v3), item `valor_total=totals.amount` (100%), `status`, `canceled_at`,
  `passageiros=len(passengers)`, `product_kind` = nome do array (já é o valor gravado), ordem dos itens =
  ordem dos arrays do manual. Setor = custom_field **id 7** (valor é o rótulo; 2140/2140); vendedor
  Weddings = custom_field **id 11** `??` nome do seller; `operacao_propria = intermediary == null` (100%).
  Nomes: `GET /people/{id}.name` (pagante PJ usa `name`, não `legal_name` — 3/3; sellers 34/34).
  `produto`: hotel `accommodation_kind ?? 'Hospedagem'`; aéreo 'Passagem aérea'; seguro 'Seguro viagem';
  locação 'Locação de veículo'; pacote `package_name`; others/operations `trim(/products/{id}.name)`
  (813 itens no catálogo, 17 páginas; os 58 "Outros" restantes são o resíduo jun–set e se corrigem).
  Datas: hotel check_in/out; aéreo min..max `segments[].departure_date`; seguro/pacote begin/end; locação
  pickup/dropoff; others/operations departure/arrival (100% em todos). `canceled_at` vem como DATA →
  gravar meia-noite de Brasília (`T00:00:00-03:00`), como o espelho já tem.
- **⚠️ Divergência com a instrução recebida:** a lista `/sales` é ordenada por **criação**
  (`created_at`/`sale_number` desc, 0 inversões em 300) e **não** por `sale_date` (41 inversões). A venda
  74632 (data 01/08, criada 23/09) está na posição 242. "Parar quando `sale_date` passar do início do
  período" perderia vendas — o mesmo furo da v5.4.4. **O corte será por `created_at`.**
- Atraso data×criação (12 meses): mediana 0, p99 11 d, **máx 53 d**; criadas até **16 d antes** da data.
- Canceladas só com `status=opened,closed,canceled` (6/300 na amostra); o espelho tem 23 canceladas.
- Paginação por cursor funciona (`?cursor=<next_cursor>`, keyset — imune a venda nova no topo).
- Limite: 51 GETs espaçados em 1,3 s, zero 429. `totals` da lista × do detalhe: 220/240 iguais sem
  `balance`; as 20 diferentes mudaram de fato desde 01/10.

## Desenho

**Cabeçalho como índice de mudança (instrução do Yan: "só abra /sales/{id} de venda nova ou com status/
totals diferente").** Nova tabela `monde.venda_cabecalho` guarda o cabeçalho de cada venda da lista e o
estado da última leitura do detalhe. Chave de mudança = hash de `status + final_amount + revenue +
products + discount + fees` (**sem `balance`**, que mexe a cada pagamento e não toca coluna nenhuma).

Fluxo de toda invocação (lock existente, orçamento de ~240 s dentro do `maxDuration=300`):
1. **Varredura de cabeçalhos** por cursor, `status=opened,closed,canceled`, até `created_at < corte`:
   - incremental (*/15): corte = hoje − 7 d (~5 páginas);
   - reconciliação (06:05/06:20/06:35, um mês por vez como hoje): corte = início da janela de 3 meses
     − 20 d (~55 páginas, ~72 s) — cobre o atraso máximo medido.
2. **Fila de detalhe** = cabeçalhos nunca lidos ou com hash ≠ hash da última leitura (+ "revisita":
   com sobra de orçamento, re-lê os detalhes mais antigos da janela de 3 meses — cobre edição de Setor/
   fornecedor que não mexe no cabeçalho; ~150 sobras × 96 ticks/dia ≫ ~2.600 vendas).
3. Detalhe → nomes (cache `monde.pessoa`; falta → `/people/{id}`) → catálogo (cache
   `monde.produto_catalogo`; id desconhecido → recarrega `/products`) → `transformSale` → **staging →
   `monde_ingest_promover` → `monde_refresh_mv` existentes, sem mudança**.
4. Grava classificação (`espelhada | welcome | sem_setor | erro`) + hash lido no cabeçalho.
5. Parou por orçamento ⇒ o restante fica na fila do próximo tick (execução `ok` se progrediu).

**Cliente HTTP** (`client.ts`): base `https://web.monde.com.br/api/v3`, `Authorization: Basic
${MONDE_V3_API_KEY}` (sem recodificar), `Content-Type: application/json`; limitador serial ≥1,3 s
(substitui o `mapPool(…, 8)`); 429 ⇒ espera (`Retry-After` ou 5 s) e repete, contando no orçamento;
`server-only`; nunca loga chave/URL completa. `MONDE_API_KEY`/`MONDE_API_URL` antigos deixam de ser lidos.

**Cura e tripwire** passam a apurar o mês **pela tabela de cabeçalhos**: `apiTotal` = cabeçalhos do mês
vistos na última varredura profunda; `lidas` = classificados contra o hash **atual**; pendentes bloqueiam
a cura com motivo próprio. `podeCurar`/`avaliarMes`/`mesclarTripwire` (puras) ficam; muda só quem as
alimenta. Teste fixa que a query da lista carrega os três status (sem eles a cura apagaria canceladas).

**`raw_hash`** passa a ser nosso: sha256 do JSON canônico (chaves ordenadas) + `VERSAO_TRANSFORM` 2→3.
Cada venda re-lida reescreve uma vez e a idempotência volta.

**Semente (sem chamar a API):** a migration popula `monde.pessoa` com os pares id→nome já gravados (o
mais recente por id) e `monde.venda_cabecalho` (estado "lido") a partir do `raw` do espelho — então a
1ª varredura só enfileira vendas novas/alteradas desde 01/10, não ~2.600. Política de staleness do cache
de pessoa: TTL 30 d re-buscado com sobra de orçamento (resíduo aceito: o TTARS resolvia ao vivo).

**Histórico:** vendas fora da janela de 3 meses ficam **congeladas como estão** (inclui o `raw` de formato
antigo de 2025 e os hashes do TTARS) — decisão, não omissão; re-ler 30 mil vendas custaria ~11 h de API.

**Modos manuais da rota:** `auditoria` e `window` reimplementados sobre a varredura (por `created_at`,
com teto de orçamento e `parcial:true`); `backfill` vira "enfileirar mês M" resumível pelo mesmo cursor.

## Arquivos

- `supabase/migrations/0290_monde_v3_cabecalho_e_caches.sql` (ADITIVA): 3 tabelas novas + semente por
  INSERT nas tabelas novas + RPCs `SECURITY DEFINER` service_role-only (upsert de cabeçalho, fila,
  marcar lido, apuração do mês, get/upsert de pessoa e catálogo) com REVOKE/GRANT explícitos.
- `src/lib/monde/client.ts` (reescrito), `schemas.ts` (Zod v3: lista, detalhe, pessoa, produto,
  custom_fields — tolerante como hoje; `sale_number` via coerce string), `transform.ts` (regras acima,
  recebe resolvedor de nomes; `VERSAO_TRANSFORM=3`; hash canônico), `ingest.ts` (varredura + fila +
  orçamento), novo `src/lib/monde/nomes.ts` (cache pessoa/catálogo/custom_fields), `auditoria.ts`,
  `reconciliacao.ts` (só o alimentador), `src/app/api/monde/ingest/route.ts`.
- Testes: `transform.test.ts`/`ingest.test.ts`/`reconciliacao.test.ts` com fixture **sintética** no
  formato v3 (sem CPF/nome real); teste da query com 3 status; teste do limitador/429.
- `.env.example` (`MONDE_V3_API_KEY`), `src/types/database.ts` regenerado, ADR-0181, CHANGELOGs,
  out-briefing, WORKING-CONTEXT, skill `banco-e-rpc` + checklist do `revisor-db` se a convenção mudar.
- Spec deste plano commitada em `docs/briefings/` no 1º commit (rastro da Rota B).

## Missões

1. Worktree `feat/v6-2-0-monde-api-v3` (copiar `.env.local` com a chave); spec commitada.
2. Migration 0290 + `revisor-db` → `npm run db:migrate -- --aditiva` → verificação REST/service_role.
3. Client + schemas + nomes + transform (+ testes) — paridade offline antes de seguir.
4. Ingest/route/reconciliação/auditoria (+ testes).
5. Gates, `revisor`, carga real, fechamento (`/fechamento-versao`, PR draft; merge é do Yan).

## Verificação

- **Paridade (aceite):** script em `$CLAUDE_JOB_DIR/tmp` (fora do repo — dados com CPF) roda o transform
  novo sobre o `raw` de jul–set/2026 + nomes do cache e compara **toda coluna** de `venda`/`venda_item`
  (exceto `raw`/`raw_hash`) com o gravado: zero diferença ou cada uma explicada (esperadas: "Outros"→
  nome real, nomes de cadastro renomeados).
- Gates por missão (`tsc`, `lint`) e de fechamento (`build`, `test`).
- **Ensaio pré-merge SEM escrita:** script local roda varredura + detalhe + transform das vendas de
  out/2026 contra a API real e só compara/imprime (não chama staging/promover) — código não mergeado
  não escreve no espelho de produção.
- **Carga real em produção** após o merge/deploy (checklist no PR, executada no `/pos-merge`): `mode=window` de out/2026 com sessão admin; `monde_ingest_status`
  mostra `max_data ≥ 2026-10-05` e `ultima_sincronizacao` andando; reconciliação de setembro com
  tripwire `conta_fecha=true`, `sobrando=0`; contagem por mês igual à da lista da API; alarmes do vigia
  (`monde-incremental`/`monde-reconciliacao`) resolvem sozinhos.
- Logs da Vercel: zero 410/429 nos ticks do cron.
