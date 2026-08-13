# Briefing v5.6.3 — Espelho auto-curativo para venda retida (rota 2 do tripwire)

**Tipo:** PATCH · **Migration:** `0250` (aditiva: RPC nova service_role-only) · **ADR:** nenhum
previsto · **Base:** `main` @ v5.6.2 · **Branch:** `feat/v5-6-3-espelho-autocurativo` · **Rota A
curta** (investigação e decisão no chat de 2026-08-13).

## Contexto — o caso medido

O tripwire da v5.4.5 acendeu para ago/26: **venda 73580** (06/08, R$ 7.372,92, 1 item ativo)
foi espelhada como **Corporativo** e depois **reclassificada para "Welcome"** na origem. Como
Welcome é exclusão de escopo aplicada NA ESCRITA, o upsert nunca mais a toca — a linha velha
fica congelada somando. É o resíduo declarado da v5.4.5 (1º caso medido) e é **classe
recorrente**: correção do campo "Setor" é rotina operacional (só ago/26 tem 6 Welcome + 2 sem
setor na listagem). Cancelamento já se auto-cura desde a v5.4.5; reclassificação não.

## Decisões do Yan (chat, firmes)

- **Rota 2 (estrutural):** a reconciliação diária passa a CURAR o `sobrando` — não haverá
  cirurgia manual; a 73580 se cura na primeira rodada pós-merge.
- **Remoção física com log** (não marcação): espelho fiel é espelho — a venda que deixou de ser
  espelhável SAI de `monde.venda`; o rastro fica no log da rodada e em `ingest_control`.

## Desenho

No modo `reconciliacao` do route (que já cobre um mês-calendário inteiro por rodada), depois do
`ingestWindow` e ANTES do tripwire:

1. `ingestWindow` passa a expor **`espelhaveis_ids`** (sale_ids das vendas transformadas) —
   aditivo no `IngestResult`.
2. Função PURA `decidirRemocao` (em `reconciliacao.ts`, testável): recebe os sale_ids do
   espelho no mês + os espelháveis da rodada + a integridade da apuração, e devolve a lista a
   remover OU o motivo do bloqueio. **Guardas fail-closed, todas obrigatórias:**
   - `erros === 0` — venda que falhou no detalhe NÃO está nas espelháveis e seria deletada
     indevidamente; qualquer erro bloqueia a cura inteira (fica para a próxima rodada);
   - `conta_fecha` e `sem_sale_id === 0` — apuração íntegra;
   - **teto de remoções por rodada** (`TETO_REMOCOES_RECONCILIACAO = 20`): listagem truncada da
     API faria o mês inteiro parecer retido — acima do teto, não remove nada e o tripwire acende
     com o motivo;
   - venda do espelho **sem sale_id** nunca entra na lista de remoção.
3. RPC nova **`monde_ingest_remover_vendas(p_sale_ids text[], p_from date, p_to date)`**
   (migration `0250`, aditiva — DELETE vive no CORPO, como o TRUNCATE de
   `monde_ingest_limpar_staging`): remove de `monde.venda` (itens por CASCADE) SÓ os sale_ids
   pedidos E dentro da janela (cinto duplo), devolvendo o detalhe do que removeu
   (numero/setor/valor) para o log. `SECURITY DEFINER`, service_role-only, `search_path` vazio.
4. Route: remove → `monde_refresh_mv` → recontagem do espelho → tripwire apura já CURADO, com
   campo novo `removidas` no mês (e `ultima_remocao` gravada em `ingest_control` com o detalhe).

## Invariantes

1. **Fail-closed sempre:** qualquer dúvida na apuração ⇒ nenhuma remoção; o tripwire continua
   sendo o alarme (comportamento atual preservado).
2. A cura roda **só na reconciliação** (mês-calendário completo) — nunca no incremental (janela
   de 7 dias não prova ausência).
3. Migration aditiva mínima; verificação da RPC **via REST/service_role** com sale_id
   inexistente (prova assinatura/shape sem remover nada — lição v5.6.0).
4. Testes: `decidirRemocao` (puro) cobre guardas/teto/caso feliz; `reconciliacao.test.ts` no
   molde existente. A RPC NÃO entra no bloco F7 vivo (é DML — mesmo tratamento de
   `promover_carga_vendas`).

## Gates

`tsc`+lint por edição; `build`+`test` no fechamento; migration via `db:migrate -- --aditiva`;
**revisor** e **revisor-db** antes do fechamento. Sem UI — sem verificador visual.

## Verificação pós-merge (registrar no out-briefing)

O deploy entra e a PRÓXIMA reconciliação (03h0x SP, 3 rodadas) cura ago/26: conferir
`monde_ingest_status` → tripwire `sobrando: 0` + `removidas: 1` no mês, venda 73580 fora do
espelho e o Corporativo de ago/26 caindo R$ 7.372,92. A suíte volta a 100% (o teste do
tripwire deixa de acusar).

## Fronteira

**Fora:** pauta ao provedor (§8 v5.4.5, segue pendente e complementar); mudanças na mv;
qualquer mudança de janela do incremental; UI.
