# Out-Briefing — v5.6.3 · Espelho auto-curativo (rota 2 do tripwire)

**Data:** 2026-08-13 · **Branch:** `feat/v5-6-3-espelho-autocurativo` · **Base:** main @ v5.6.2 ·
**Migration:** `0250` (aditiva, **APLICADA** 13/08, gate verde) · **ADR:** nenhum ·
**Briefing:** `briefing-v5-6-3-espelho-autocurativo.md` (1º commit; nasceu da investigação da
venda 73580 no chat de 13/08).

## 1. O que foi entregue

O modo `reconciliacao` da ingestão Monde passou a **curar** o mês reconciliado: vendas do
espelho que ficaram FORA do conjunto que a rodada provou espelhável (reclassificadas para
Welcome/sem-setor na origem, ou sumidas da listagem) são **removidas com auditoria** —
`monde_ingest_remover_vendas` (0250), log da rodada, `ingest_control.ultima_remocao` e campo
`removidas` no tripwire. Caso motivador: **venda 73580** (ago/26, R$ 7.372,92,
Corporativo→Welcome) — se cura na primeira rodada pós-deploy.

**Guardas fail-closed** (qualquer uma bloqueia a cura inteira; o tripwire segue acusando e a
próxima rodada tenta de novo):
- app (`podeCurar`, 6 casos de teste): rodada vazia da API · erros de detalhe/transform ·
  venda sem sale_id na listagem · **paridade contagem×ids** · conta que não fecha;
- SQL (RPC 0250): conjunto provado vazio nunca autoriza · só a janela do mês · sale_id NULL
  nunca é candidata · **teto de 20 remoções/rodada**.

## 2. Parecer da revisão — 3 CRÍTICOs pegos ANTES da aplicação

**`revisor-db`: CORREÇÕES NECESSÁRIAS → corrigido e re-verificado.**
- **CRÍTICO:** `monde.venda.sale_id` é **uuid** e a assinatura usava `text[]` — o CREATE
  passaria e a RPC estouraria `operator does not exist: uuid = text` em TODA chamada real,
  engolida pelo try/catch da cura: a versão nasceria morta e muda (mesma classe do
  `max(uuid)` da v5.2.1/0203). Corrigido: assinatura `uuid[]` (PostgREST faz o binding de
  `string[]` pela função de input do tipo).
- MÉDIO/BAIXOs: sem índice composto (irrelevante no volume; registrado) · sem bloco DOWN
  (função nova, DROP trivial) · demais itens do checklist limpos (CASCADE só em venda_item;
  atomicidade sob o lock de ingestão; 3 ramos de retorno com shape único).

**`revisor`: CORREÇÕES NECESSÁRIAS → corrigido.**
- **CRÍTICO 1:** API vazia-mas-consistente (`total=0`, sem erro HTTP) passava por `podeCurar`
  e, com conjunto vazio, TODO o mês virava candidato — num mês novo (≤ teto) a cura apagaria
  tudo **e a recontagem pós-cura apagaria o próprio alarme**. Corrigido em DOIS cintos:
  rodada vazia bloqueia no app + conjunto vazio bloqueia na RPC.
- **CRÍTICO 2:** venda válida cujo DETALHE veio sem `sale_id` contava em `espelhaveis` mas
  saía de `espelhaveis_ids` — a linha antiga dela (com sale_id real) viraria candidata.
  Corrigido: guarda de **paridade contagem×ids**.
- ALTO: superfície que gera a lista de sobrevivência sem teste → helper `idsEspelhaveis`
  extraído + `ingest.test.ts`. MÉDIO: fórmula `conta_fecha` unificada (`contaFecha`).
  MÉDIO aceito/registrado: cursor avança antes da cura (falha na cura re-tenta no ciclo
  seguinte do mesmo mês, ≤1 dia — desenho declarado). BAIXO registrado: desvio de desenho
  vs briefing (lista de candidatas calculada na RPC, não em TS — sem round-trip extra;
  invariantes preservadas).

**Achado PRÉ-EXISTENTE registrado (fora do escopo, fica para decisão futura):**
`monde_ingest_promover` (0178) faz `SET sale_id = EXCLUDED.sale_id` incondicional — detalhe
sem `sale_id` num mês em que o `raw_hash` MUDOU sobrescreveria o sale_id real com NULL
(corrupção silenciosa da coluna; sem risco de DELETE indevido — NULL nunca é candidata).
Mesma raiz do CRÍTICO 2; candidato a hardening em versão futura.

## 3. Gates e verificação

`build` ✅ · `tsc` ✅ · `lint` ✅ · **917/918** — a única falha é o PRÓPRIO tripwire
(`sobrando: 1`, ago/26), que esta versão cura pós-deploy; vermelho esperado e declarado.
16 testes novos no módulo monde (46 no total do módulo).

**Migration 0250 APLICADA** (backup-gate verde; única pendente). **Verificação REST pós-push
executando o corpo** (db query não executa): array vazio → `{bloqueado:true, candidatas:0}` ·
ago/26 + 1 uuid aleatório → `{bloqueado:true, candidatas:263}` (teto segurou; **nada foi
removido**) · janela futura → `{candidatas:0}`. Os dois cintos provados ao vivo.

## 4. Verificação pós-merge (fica para o Yan/próxima sessão)

O deploy entra no merge e a reconciliação das ~03h0x (3 rodadas) cura ago/26. Conferir de
manhã: `monde_ingest_status` → tripwire com `sobrando: 0` e `removidas: 1` em 2026-08;
`ingest_control.ultima_remocao` com a venda 73580; Corporativo de ago/26 caindo R$ 7.372,92
nos painéis; suíte 918/918.

## 5. Registros

- A pauta ao provedor do Monde (§8 do briefing v5.4.5) segue pendente e COMPLEMENTAR — o
  filtro por data de alteração mataria a classe na fonte.
- Remoção é o comportamento de espelho fiel (fonte da verdade = API); auditoria via log +
  `ultima_remocao` + `removidas` no tripwire, decisão do Yan no chat.
