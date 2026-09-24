# Out-briefing — v5.12.0 · Espelho Monde: nome do produto pelo catálogo

**Rota B (técnica)** — defeito de produção sem decisão de produto. Pedido do Yan em 24/09/2026:
corrigir como v5.12.0, **antes** do merge da v6.0.0 em voo. Este documento é também a spec
(rastro em disco da rota técnica).

Branch `fix/v5-12-0-produto-monde` · sem migration · sem ADR novo · 1.251 testes / 76 arquivos.

---

## 1. O defeito

Achado na investigação de 24/09 sobre o que há de novo na API do Monde.

- A API passou a mandar, **desde jun/2026**, rótulo genérico em `products[].description` nos tipos
  `others`/`operations` (`"Outros"`, `"Operação própria"`). O nome do catálogo foi para
  `products[].product_name_resolvido`.
- A própria resposta anuncia (`campos_que_saem`, `campos_que_saem_em: 2026-10-01`) a remoção de
  `products[].description`, `data_inicio`, `data_fim` e `payments[].method`.
- `transform.ts` gravava `produto = description`. O único leitor de `monde.venda_item.produto` é
  `get_contratos_casamento_mes` (0249, `TRIM(vi.produto) ILIKE 'contrato de casamento%'`), que
  alimenta a barra **"Meta de Assessorias"** do Comparativo de Metas.

**Medido em produção (read-only):**

| mês | contratos no espelho | contratos na API (`resource=products`) | itens others/operations degradados |
|---|---|---|---|
| 2026-05 | 5 | 5 | 0 |
| 2026-06 | **0** | 5 | 237 / 237 |
| 2026-07 | **0** | 4 | 266 / 266 |
| 2026-08 | **0** | 2 | 245 / 245 |
| 2026-09 | **0** | 4 | 191 / 191 |

Antes de junho o espelho está íntegro porque foi gravado quando `description` ainda trazia o nome.

## 2. O segundo defeito, que tornava o primeiro irrecuperável

`monde_ingest_promover` (0267, `WHERE d.raw_hash IS DISTINCT FROM EXCLUDED.raw_hash`) só
reescreve venda cujo `raw_hash` muda. O `raw` do Monde dessas vendas não mudou ⇒ **corrigir o
transform sozinho não tocaria nenhuma das 939 linhas**; só vendas novas sairiam certas. O ADR-0149
(`:119-122`) já registrava a lacuna e o caminho: "um futuro bump de versão de transform no
`raw_hash`".

## 3. O que foi feito (M1 — commit `2b28b55`)

| arquivo | mudança |
|---|---|
| `src/lib/monde/schemas.ts` | `zProduct.product_name_resolvido` declarado (nullable/optional). |
| `src/lib/monde/transform.ts` | `produto = product_name_resolvido ?? description ?? null` (`nomeDoProduto`). `raw_hash` gravado = `hashComVersao(sale.raw_hash)` = `<hash>#t<VERSAO_TRANSFORM>`, `VERSAO_TRANSFORM = 2`. |
| `src/lib/monde/transform.test.ts` | 4 casos: nome do catálogo vence "Outros"; fallback a `description`; `null` sem os dois; formato do hash. |

**Alternativas descartadas:**
- *UPDATE de `raw_hash = NULL` nas vendas afetadas* — destrutiva (humano em TTY) e, pior, se aplicada
  antes do deploy o cron de 15 min re-promoveria com o transform velho.
- *Migration corrigindo `produto` direto* — impossível: o espelho não guarda o nome do catálogo
  (`raw.others[].product` só tem `id`).
- *Parear `products[]` com `itens[]`* (onde estão `nome_do_monde` e as datas por tipo) — **não há
  chave**: `products[].id` ≠ `itens[].product_line_id` em 287/287, e a ordem difere.

## 4. Provas

- **Transform + schema REAIS sobre o payload REAL** (jun–set, 2.678 vendas, sem escrita):
  Weddings 158 · 192 · 133 · 161 vendas, **contratos 5 · 4 · 2 · 4**, 100% com hash `#t2`.
  Restam 3 itens com `produto = "Outros"` — é o nome de catálogo deles (0 nulos em 947).
- **Não degrada o que está bom:** abr–mai, 271/277 vendas com `produto` idêntico ao atual após
  `trim` (a API tirou o espaço à direita de "Transporte Rodoviario " — o leitor usa `TRIM`). As 6 que
  diferem têm 20 itens antigos sem nome resolvido e **não serão reescritas** (fora das janelas
  automáticas; nenhum backfill pré-junho é recomendado).
- **Tipos sem catálogo** (achado MÉDIO do revisor — ver §6): em 200 vendas de jan/mai/jul/set,
  `product_name_resolvido` veio nulo em **263/263** itens de `hotels`, `airline_tickets`,
  `insurances`, `travel_packages` e `car_rentals` ⇒ neles `produto` segue sendo `description`,
  sem mudança.
- Gates: `npm run build` ✅ · `npx tsc --noEmit` ✅ · `npm run lint` ✅ · `npm test` ✅ 1.251 / 76.

## 5. Pós-merge — o que corrige o dado (ato do Yan)

1. **Jul–set:** automático. A reconciliação noturna (0236: 03:05/03:20/03:35 SP) cobre os 3 últimos
   meses e reescreve cada venda uma vez. O incremental (15 min, 7 dias) cobre a borda.
2. **Junho:** UMA chamada, logado como admin, depois do deploy:
   `https://wt-janus.vercel.app/api/monde/ingest?mode=window&from=2026-06-01&to=2026-06-30`
3. **Conferência** (read-only), no dia seguinte:
   ```sql
   select to_char(v.data_venda,'YYYY-MM') mes,
          count(distinct v.id) filter (where trim(vi.produto) ilike 'contrato de casamento%') contratos,
          count(*) filter (where vi.produto in ('Outros','Operação própria')) genericos
   from monde.venda_item vi join monde.venda v on v.id = vi.venda_id
   where v.setor_macro = 'Weddings' and vi.status = 'active' and v.data_venda >= '2026-06-01'
   group by 1 order by 1;
   ```
   Esperado: contratos **5 · 4 · 2 · 4**; genéricos ≈ 0 (os 3 de catálogo "Outros").

## 6. Parecer da revisão (`revisor`, contexto separado)

**APROVADO COM RESSALVAS.** Sem CRÍTICO/ALTO. `revisor-db`: N/A (sem migration/RPC).

- **MÉDIO — fallback aplicado a todos os `product_kind`, mas a medição trazida só cobria
  others/operations.** Endereçado: a medição dos demais tipos existia e foi trazida (§4, 263/263
  nulos ⇒ comportamento idêntico ao anterior). O comentário do código descreve esse fato medido.
- **BAIXO — reescrita em massa no 1º ciclo.** Verificado pelo revisor: tripwire, `podeCurar`,
  `avaliarMes` e `TETO_REMOCOES_RECONCILIACAO` operam sobre contagem de linhas, não sobre
  atualizadas/inseridas; o volume por invocação não muda (a reconciliação já lê o mês inteiro
  dentro do `maxDuration`). Os logs do 1º ciclo vão mostrar "atualizadas" ≈ "lidas" — esperado.
- Consumidores de `raw_hash`: só o `ON CONFLICT … IS DISTINCT FROM` do promover (comparação
  textual; o sufixo não quebra nada). `rpc-contrato.test.ts` testa a cláusula, não o formato.

## 7. Pendências e registro (fora do escopo)

- **`data_inicio`/`data_fim` passam a gravar `null` a partir de 2026-10-01.** Sem leitor hoje. Os
  substitutos (`check_in`/`pickup_date`/`begin_date`/`departure_date` e pares de fim) só existem em
  `itens[]`, sem chave para `products[]`. O `raw` guardado tem as datas nativas por item ⇒
  reconstruível quando a Onda 4 de Weddings (`get_pipeline_weddings`, data do evento) for feita —
  e aí o caminho natural é consumir `itens[]`/`resource=products` como fonte do item.
- **`produto` dos tipos sem catálogo vira `null` depois de 2026-10-01** (hoje: "Passagem aérea",
  "Seguro viagem", nome do quarto). Sem leitor; o tipo está em `product_kind`. Aceito.
- `payments[].method` sai em 01/10 — sem uso no código.
- Novidades da API que **não** entraram (investigação de 24/09, memória `ref_monde_api_mudancas_2026_09`):
  `resource=products`, `resource=attachment`, `synced_since`, `payments[].conta` (títulos do
  cliente), `operation_product_name_resolvido`. Nenhuma substitui por inteiro uma ingestão manual.
- **v6.0.0:** vai precisar mesclar a `main`. Conferido em `origin/feat/v6-0-0-fundacao-ingestao`
  (24/09): a v6 **não toca `src/lib/monde/`**; já altera `docs/WORKING-CONTEXT.md` e
  `.claude/skills/banco-e-rpc/SKILL.md` (conflito provável, só de texto) e vai alterar
  `package.json`, `CHANGELOG.md` e `changelog-diretoria.ts` no fechamento dela (topo dos arquivos —
  resolução trivial, v6.0.0 acima da 5.12.0).

## 8. Aprendizado (régua de 5 destinos)

- "Mudou a transformação do espelho ⇒ subir `VERSAO_TRANSFORM`, e medir o que a reescrita grava
  contra o que já está lá" → **skill `banco-e-rpc`** (situacional, domínio espelho). Enforcement
  mecânico não cabe: não há como a máquina saber que a saída mudou para um mesmo `raw`.
- "API de terceiro muda o campo antes da data anunciada" → mesma skill, mesmo parágrafo.
