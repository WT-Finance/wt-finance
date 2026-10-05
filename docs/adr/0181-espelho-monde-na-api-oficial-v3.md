# ADR-0181 — Espelho Monde lido da API oficial v3, com índice de cabeçalhos

**Status:** aceito (v6.2.0) · **Data:** 2026-10-05 ·
**Contexto:** versão v6.2.0, "Espelho Monde na API oficial v3" (Rota B) ·
**Spec:** `docs/briefings/spec-v6-2-0-monde-api-v3.md` · **Migration:** `0290` (aditiva, aplicada em
05/10/2026) · **Código:** `src/lib/monde/{client,schemas,nomes,transform,ingest,auditoria}.ts`,
`src/app/api/monde/ingest/route.ts` · **Substitui em parte:** ADR-0149 (fonte), ADR-0164 (forma da
reconciliação) — as decisões de produto deles (exclusões, síntese, rede auto-curativa) continuam.

> Numeração conferida contra `docs/adr/`, `supabase/migrations/` e as branches não mergeadas do remoto
> em 05/10/2026 (últimos reais: ADR 0180, migration 0289).

## O problema

O espelho `monde.*` — fonte de produção de Metas, Comparação e Performance/Executiva desde a v5.1.4 —
lia a `monde-data`, uma API **intermediária do TTARS**, não a do Monde. Ela foi desligada em
**02/10/2026 00:00** e passou a responder HTTP 410 em toda chamada; o espelho parou na sincronização
de 01/10 23:45. A Welcome decidiu que cada sistema puxa direto da API oficial do Monde (v3) e emitiu uma
chave própria para o Janus (`MONDE_V3_API_KEY`).

A v3 é outra API em tudo o que a ingestão assumia (medido em 05/10/2026):

| a `monde-data` dava | a v3 dá |
|---|---|
| lista filtrada por **data da venda**, com `total` | lista inteira, **sem filtro de data** e **sem total**, ordenada por **criação** desc |
| nomes resolvidos (pagante, vendedor, fornecedor, produto, campo personalizado) | só `{ id }` — nome em `/people/{id}`, `/products/{id}`, `/custom_fields` |
| `raw_hash` pronto | nada — o hash é nosso |
| detalhe em paralelo (8) | **1 chamada a cada 1,3 s** (rajada leva 429) |
| — | sem "alterado desde" |

## Decisões

1. **O `raw` guardado já é o payload v3** (o TTARS só embrulhava `GET /sales/{id}`): o transform
   reconstrói cada coluna que o TTARS entregava e foi **provado contra o espelho** — paridade offline
   sobre jul–set/2026 (2.140 vendas, 3.474 itens): zero diferença em valores, receitas, datas, status e
   vendedor; as diferenças restantes são melhoria (o nome real no lugar de "Outros", cadastro renomeado
   no Monde, pagante que o TTARS deixava vazio). Saída do espelho, MV e RPCs de leitura **não mudam**.
2. **Índice de cabeçalhos** (`monde.venda_cabecalho`): cada varredura registra o cabeçalho da lista; só
   venda nova, com status/totais diferentes (hash sem `balance`) ou com data/número mudados vai para a
   fila de detalhe (instrução do Yan). O veredito do transform fica gravado no cabeçalho.
3. **Corte da varredura por CRIAÇÃO, não por data da venda.** A instrução recebida mandava parar quando
   `sale_date` passasse do início do período. Medido: 0 inversões de `created_at` e 41 de `sale_date`
   em 300 vendas; a 74632 (data 01/08, criada 23/09) estava na posição 242 — o corte por `sale_date` a
   perderia, o mesmo furo da v5.4.4. Margens do corte a partir do atraso medido em 12 meses: mediana 0,
   p99 11 d, máximo **53 d** depois e **16 d antes** da data da venda.
   - incremental (15 min): vendas criadas nos últimos 7 dias;
   - reconciliação (3×/dia): até o início da janela de 3 meses − 20 dias.
4. **Tudo sob orçamento de tempo** (230 s de API num `maxDuration` de 300 s): o que não cabe fica na
   fila do próximo tick. Uma janela não precisa mais terminar numa chamada só. Sobra de orçamento
   **revisita** as vendas lidas há mais tempo dentro da janela (cobre edição que não mexe no cabeçalho:
   setor, fornecedor, vendedor).
5. **Cura e tripwire apurados pela tabela de cabeçalhos**, sem reabrir detalhe, e **só com apuração
   íntegra**: varredura até o corte, zero linha inválida, zero venda do mês na fila (pendente adia a
   apuração — nunca acende o alarme como "sem sale_id"). As guardas puras de `podeCurar` e o teto de 20
   remoções seguem. A venda que a cura remove tem o cabeçalho invalidado (se voltar à lista, é relida).
6. **Nomes em cache no banco** (`monde.pessoa`, `monde.produto_catalogo`), semeados do próprio espelho
   pela 0290. Nome ausente ⇒ busca na API, e sem orçamento a venda **espera** (nunca é gravada sem
   nome); nome com mais de 30 dias ⇒ re-busca só com sobra. Os campos personalizados são achados pelo
   NOME (`Setor`, `Vendedor(a) Responsável - Grupo`); sem `Setor` a ingestão aborta.
7. **Histórico fora da janela de 3 meses fica congelado como está** — inclusive o `raw` de formato
   antigo de 2025 e os hashes do TTARS. Re-ler 30 mil vendas custaria ~11 h de API; nada lê o histórico
   por esse caminho de escrita.

## Consequências

- `VERSAO_TRANSFORM` 3 e `raw_hash` = sha256 do JSON canônico: cada venda re-lida na janela é reescrita
  uma vez (corrige de quebra o resíduo "Outros" de jun–set), e a idempotência volta.
- A venda lançada com atraso entra **pelo incremental**, por aparecer no topo da lista como recém-criada
  — mais cedo do que na v5.4.4, que dependia da reconciliação.
- Resíduo aceito: edição que não mexe no cabeçalho só é vista na revisita (dentro de ~1 dia na janela).
- `MONDE_API_URL`/`MONDE_API_KEY` deixam de ser lidas; `MONDE_V3_API_KEY` (em `.env.local` e Production).
