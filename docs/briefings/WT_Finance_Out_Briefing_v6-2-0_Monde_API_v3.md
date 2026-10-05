# Out-briefing — v6.2.0 · Espelho Monde lido da API oficial v3

**Rota B** · spec `docs/briefings/spec-v6-2-0-monde-api-v3.md` · ADR-0181 · migration 0290 (aditiva,
APLICADA em 05/10/2026) · branch `feat/v6-2-0-monde-api-v3`.

## 1. Resumo em linguagem clara

Em 05/10 o Yan notou que a última atualização do Monde era de 01/10. A causa não era instabilidade: a
`monde-data` — que **não** era a API do Monde, e sim uma intermediária do TTARS — foi **desligada em
02/10 às 00:00** e passou a responder HTTP 410 a toda chamada, com um aviso apontando a API oficial. O
espelho (fonte de Metas, Comparação e Performance/Executiva) ficou parado desde 01/10 23:45.

Esta versão liga o Janus direto na **API oficial do Monde, v3**, com a chave própria que o Yan obteve. O
espelho continua produzindo **as mesmas colunas com os mesmos valores** (provado sobre 2.140 vendas);
nenhuma tela, RPC de leitura ou view mudou. O que mudou é como a ingestão conversa com o Monde, porque a
v3 é outra API: não filtra por data, lista por ordem de criação, não diz o que mudou, manda só ids
(sem nomes) e aceita uma chamada a cada 1,3 s.

Achado colateral do diagnóstico (já resolvido pelo Yan no mesmo dia): **nenhum alarme de ingestão saía
por e-mail desde 01/10 ~16:28** — produção estava em `EMAIL_MODO=real` sem `INGESTAO_ALARME_DESTINOS`. O
Yan criou a variável; os 17 pendentes saíram às 10:45 de 05/10.

## 2. Divergências pedido × realidade e decisões

| # | Instrução recebida | Realidade medida (05/10) | O que foi feito |
|---|---|---|---|
| D1 | Lista: "pare quando `sale_date` passar do início do período" | A lista vem ordenada por **criação** (`created_at`/`sale_number` desc: 0 inversões em 300; `sale_date`: 41). A 74632 (data 01/08, criada 23/09) está na posição 242 — o corte por `sale_date` a perderia (o furo da v5.4.4) | Corte por `created_at`, com margens do atraso medido em 12 meses (máx. 53 d depois, 16 d antes) |
| D2 | "page começa em 1 … até has_next_page" | `next_cursor` funciona como `?cursor=` (keyset) | 1ª página `page=1`, demais por cursor — imune a venda nova no topo durante a varredura |
| D3 | `attachment`, `bills`, `refunds` | Nenhum consumidor no Janus | Fora do escopo (nada usava pela `monde-data`) |
| D4 | — | O `raw` guardado **já é** o payload v3 | Usado como oráculo de paridade offline e como semente do índice e do cache de nomes |

Todas as demais instruções seguidas como vieram (endereço, Basic sem recodificar + `Content-Type`, só
servidor, `size` 50, 1,3 s + 429, três status, `/sales/{id}` por UUID, produtos por tipo, nomes em
`/people/{id}`, detalhe só de venda nova/alterada, horário de Brasília sem fuso).

## 3. Missões

| Missão | Commit | Conteúdo |
|---|---|---|
| M1 | `74d2f2e` | spec commitada |
| M2 | `c9c69c6` | migration 0290 + `database.ts` + baseline |
| M3 | `71b271f` | `client`, `schemas`, `nomes`, `transform` v3 + testes; paridade offline |
| M4 | `a11ab01` | `ingest`, `auditoria`, `route` + testes; `.env.example` |
| M5 | `2d91ef0` + fechamento | correções do revisor, ensaio sem escrita, docs |

## 4. Migration 0290 (aditiva — APLICADA em 05/10/2026, backup-gate VERDE)

`monde.venda_cabecalho` (índice de mudança), `monde.pessoa`, `monde.produto_catalogo`,
`monde.cabecalho_hash` e 10 RPCs service_role-only. Semente por INSERT só nas tabelas novas: 2.802
cabeçalhos "já lidos" (todo `raw` v3 do espelho) e 1.616 pessoas (pagante, vendedor fora do campo 11,
fornecedor só quando não há ambiguidade). Ensaiada duas vezes em transação revertida contra produção;
verificada pós-push por REST/service_role (corpos executam; `marcar` inválido → P0001; `anon` → 42501).
`database.ts` regenerado (diff = só as 10 RPCs) e baseline de schema regenerado no mesmo commit.

## 5. Provas

- **Paridade offline** (transform novo × colunas gravadas, mesmo `raw`), jul–set/2026: 2.140/2.140 vendas
  parseadas, 0 excluídas indevidamente, 3.474 itens. **Zero diferença** em `valor_total`, `receitas`,
  `status`, `canceled_at`, datas, passageiros, `total_final_value`, `total_revenue`, `setor`, **vendedor**
  (chave de Metas), `operacao_propria`, `taxa_servico`. Diferenças restantes, todas melhoria: 99 itens
  "Outros" → nome real do catálogo; 41 fornecedores renomeados no Monde; 19 fornecedores e 8 pagantes
  (+9 documentos) que o TTARS gravava vazios.
- **Ensaio pré-merge SEM escrita** (código da worktree × API real × banco só leitura): 153 vendas criadas
  desde 28/09 → 152 espelháveis, 1 Welcome, **0 erro**; 233 chamadas, **0 × 429**. Das 103 já no espelho,
  as diferenças são edições reais feitas no Monde depois de 01/10 (8 canceladas, 13 receitas ajustadas,
  1 produto acrescentado, 1 vendedor trocado — este último é exatamente o caso que a revisita cobre).
- **B3 do revisor-db** (o hash não "explode" a fila): dos 150 cabeçalhos já indexados na lista de 05/10,
  27 mudaram (edições reais) — sem divergência por formato de número.

## 6. Parecer da revisão

**revisor-db (0290, antes de aplicar):** 0 CRÍTICO · 2 ALTO · 5 MÉDIO · 7 BAIXO.
- A1 (ALTO) `marcar` aceitava classificação NULL → venda fora da cura sem bloquear. **Corrigido**: lança.
- A2 (ALTO) mudança de `sale_date` não reenfileirava. **Corrigido**: `registrar` zera `lido_hash`.
- M1 semente de fornecedor por posição → **só sem ambiguidade** (1 item por tipo dos dois lados).
- M2 CPF perdido na linha vencedora → doc não nulo mais recente. M3 erros na ponta da fila → por `lido_em`.
- M4 relógio do app → `registrar` devolve `now()` do banco. M5 pós-cura incoerente → `monde_cabecalho_invalidar`.
- B4 endurecido. B1/B2/B3/B5/B6/B7 aceitos (inofensivos ou cobertos por Zod/teste; B3 medido, ver §5).

**revisor (diff completo):** APROVADO COM RESSALVAS · 0 CRÍTICO · 0 ALTO · 8 MÉDIO · 8 BAIXO.
- M1 ordem pós-cura → rastro e refresh antes do `invalidar`. **Corrigido.**
- M2 espera de 429 sem teto (mataria a função e prenderia o lock) → nunca passa do prazo. **Corrigido.**
- M3 erro transitório marcado por venda → `ErroTransitorio` para o tick sem marcar. **Corrigido.**
  Resíduo: venda que dá **404 permanente** no detalhe fica `erro` e impede o `done` de `window`/`backfill`
  daquele intervalo — raro (lista e detalhe divergentes); registrado.
- M4 re-busca vazia apagava nome bom → mantém o antigo. **Corrigido.**
- M5 mês adiado como `ok` → execução `erro` com o motivo. **Corrigido.**
- M6 `window`/`backfill` re-varriam do topo → marcador de varredura concluída. **Corrigido.**
- **M7 ACEITO (risco registrado):** a cura só enxerga o que foi criado até 20 dias antes do início da
  janela. Venda criada mais de 20 d antes da própria data viraria candidata à remoção. Máximo medido em
  12 meses: 16 d; teto de 20 remoções por rodada e `ultima_remocao` registram qualquer caso.
- M8 venda "venenosa" no lote → `sale_date` validado no parse + bissecção do lote. **Corrigido.**
- BAIXOS corrigidos: validação de `from/to/max`, comentários de `server-only`, README. Aceitos: TTL de
  pessoa só reescreve o espelho quando o `raw` muda (nome não entra no hash — por desenho); bloco com
  orçamento esgotado nos nomes é relido inteiro no tick seguinte; catálogo parcial coberto por
  `/products/{id}`; `finally` de registro pode mascarar `OrcamentoEsgotado` (raro); execução
  `monde-incremental` fica `ok` mesmo com varredura parcial (só o marcador `ultimo_incremental` para).

Auto-auditoria adversarial depois das correções: sem achado novo.

## 7. Gates (05/10, worktree)

Estado final (depois das correções do revisor e dos docs): `npm run build` verde · `npx tsc --noEmit` 0
erro · `npm run lint` 0 erro / 0 warning · `npm test` **1.911 passaram + 6 skipped** (107 arquivos;
`src/lib/monde` 94/94) — 1 arquivo vermelho **pré-existente**: `oraculo-demonstrativo.test.ts` (fixture
`demonstrativo-cru.xlsx` perdida, B-38; idêntico à v6.1.1/v6.1.2). Fixtures do oráculo copiadas de
`~/projects/arquivo-worktrees-janus/fixtures-ingestao/` (sem elas, mais 3 arquivos ficam vermelhos por ENOENT).
Sem UI tocada → sem `verificador-visual`.

## 8. Pendências

> 🔴 **Yan — após o merge (checklist de produção, no `/pos-merge`):**
> 1. Esperar 1–2 ticks do cron (15 min) e conferir `monde_ingest_status`: `max_data ≥ 2026-10-05`,
>    `ultima_sincronizacao` andando; logs da Vercel sem 410/429.
> 2. Os alarmes `monde-incremental`/`monde-reconciliacao` do vigia devem resolver sozinhos (o de
>    reconciliação só depois de uma apuração íntegra — pode levar até a madrugada seguinte).
> 3. Opcional: `?mode=window&from=2026-10-01&to=2026-10-05` com sessão admin para forçar a releitura da
>    lacuna, e a reconciliação de setembro com tripwire `conta_fecha=true`, `sobrando=0`.
> 4. Confirmar que `EMAIL_MODO=real` em produção foi intencional — ele vale também para faturas.

- Alarme `cdi-mensal` aberto desde 01/10: o processo nunca registrou execução OK (fora do escopo).
- `oraculo-demonstrativo` segue vermelho até a fixture de 21/09 ser recomposta (B-38).
- `MONDE_API_URL`/`MONDE_API_KEY` podem ser removidas da Vercel depois do merge (nada mais as lê).

## 9. Aprendizados (régua de 5 destinos)

- **"Verificar conexão" com dado parado: chame a API e leia o corpo do erro antes de olhar o código.**
  O 410 trazia o diagnóstico inteiro. → memória (`ref_monde_api_mudancas_2026_09`), não core.
- **Payload cru guardado é oráculo de migração de fonte**: o `raw` do espelho permitiu provar a paridade
  do transform novo sobre 2.140 vendas sem chamar a API. → skill `banco-e-rpc` (§2, espelho Monde).
- **Instrução de integração é hipótese até medir**: a regra de parada da lista estava errada e
  reintroduziria o furo da v5.4.4. → já coberto pelo core ("verificar a realidade contra o prompt").
- **Alarme que não sai é alarme que não existe**: o vigia detectou tudo e nada chegou por e-mail por
  falta de uma variável. → pendência de enforcement (proposta, não feita: o vigia registrar no próprio
  `ingestao.execucao` quando o envio é recusado fail-closed por configuração).

## Advisor

Consultas da sessão principal: 4 (antes do diagnóstico final; antes de desenhar; antes do plano;
reconciliação após a sonda). Mudaram o rumo: 3 — exigir prova em produção do 410 antes de concluir; sondar
antes de planejar (revelou a ordem por criação e o `raw` como oráculo); fechar `canceled_at`/PJ/cursor.
Custo: pendência do Yan (`/usage`).
