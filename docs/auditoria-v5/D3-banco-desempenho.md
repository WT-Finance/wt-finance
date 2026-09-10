# D3 — Banco: desempenho

Explorador D3 (Sonnet, read-only) sobre `_insumos/catalogo-indices.txt`, `catalogo-relacoes.txt`,
`catalogo-funcoes-def.txt` e leitura dos `page.tsx`. Skills lidas: `banco-e-rpc`, `contrato-rpc-front`.
Formato: `README.md` desta pasta. Estatísticas de uso (`idx_scan`, `seq_scan`) são **indício, não prova**
(podem ter sido zeradas em restart); `DROP INDEX` é destrutiva.

| id | achado | evidência | risco | esforço | ação proposta | classe | triagem | nota |
|---|---|---|---|---|---|---|---|---|
| D3-001 | Índice `fato_fluxo_venda_idx` (`financeiro.fato_fluxo`, coluna `venda_no`) nunca lido, 1.128 kB, na maior tabela do domínio financeiro (129.262 linhas, 33 MB) | `_insumos/catalogo-indices.txt:39` (`idx_scan:0`); `_insumos/catalogo-relacoes.txt:949` | médio | S | medir de novo e, se confirmado, `DROP INDEX` em destrutiva v6 | decidir | | |
| D3-002 | Índice `lanc_mov_liquidacao_idx` (`raw.lancamentos_movimentacao`, coluna `liquidacao`) nunca lido, 848 kB, tabela com 92.506 linhas / 27 MB | `_insumos/catalogo-indices.txt:50`; `_insumos/catalogo-relacoes.txt:1357` | médio | S | mesma ação de D3-001 | decidir | | |
| D3-003 | Dois índices pequenos `idx_scan=0` em tabelas grandes: `idx_raw_vendas_excel_contrato_venda` (parcial, `raw.vendas_excel`, 48.147 linhas) e `idx_fato_lancamento_operacao_venda` (parcial em `venda_n`, `analytics.fato_lancamento_operacao`) — este último é **subconjunto exato** do índice não-parcial `idx_lancamento_venda_n` na MESMA coluna, que tem uso (`idx_scan=1`) | `_insumos/catalogo-indices.txt:270,1293` vs `:1315` | baixo | S | avaliar `DROP` do parcial redundante na v6; remedir o de `vendas_excel` | decidir | | |
| D3-004 | 10 tabelas grandes com `seq_scan` alto e razão `seq_tup_read/seq_scan` próxima do tamanho da tabela (full scan repetido): `monde.venda` (7.775×, ~97%), `monde.venda_item` (6.696×, ~97%), `raw.vendas_excel` (35.672×, ~82%), `financeiro.fato_fluxo` (7.315×, ~88%), `analytics.fato_lancamento_operacao` (4.660×, ~93%), `raw.lancamentos_movimentacao` (4.778×), `analytics.fato_venda` (1.945×, ~75%), `analytics.fato_venda_item` (1.732×, ~66%), `raw.titulos_em_aberto` (198×, ~80%), `raw.pessoas` (814×, ~58%) | `_insumos/catalogo-relacoes.txt` (`seq_scan`/`seq_tup_read`/`n_live_tup`) | baixo | L | identificar via `EXPLAIN` + grep de chamadores quais RPCs leem sem filtro (ingest/comparação Monde×upload são suspeitos); decidir filtro/índice | decidir | | |
| D3-005 | `/metas`: `buscarUltimaSincronizacaoMonde()` roda em `await` SEQUENCIAL FORA do `Promise.all` que já paraleliza as ~11 RPCs do carregamento — juntar ao `Promise.all` não muda resultado (fail-safe por construção) | `src/lib/metas/carregar-acompanhamento.ts:34-56` | baixo | S | mover a chamada para dentro do `Promise.all` existente | simplificar | | |
| D3-006 | Recomputação por carregamento: `patrimonio.v_estado_atual` (0248) é VIEW não-materializada com `DISTINCT ON (ativo_id) … ORDER BY … DESC` sobre TODA `patrimonio.movimentacao`, sem índice de suporte (só PK) — recalculada em cada `patrimonio_listar_ativos`, `patrimonio_resumo`, `patrimonio_registrar_movimentacao`. Hoje inofensivo (6 linhas), mas não escala | `supabase/migrations/0248_patrimonio_rpcs.sql:93-105`; `_insumos/catalogo-funcoes-def.txt:1201,1216`; `_insumos/catalogo-relacoes.txt:1306` (`n_live_tup:6`) | baixo | L | dívida v6: índice `(ativo_id, data_movimentacao DESC, criado_em DESC, id DESC)` ou materializar quando crescer | decidir | | |
| D3-007 | `/metas` dispara ~11-12 RPCs por carregamento (`get_executiva_kpis`×4 painéis + `metas_ritmo_diario`×4 + `metas_listar`×1-2 + `get_sumario_subsetor`×1) — "uma RPC por setor"; amplificador: auto-refresh de 300 s em `/metas` e **60 s em `/metas/tv`** (`router.refresh()`), uma TV 24/7 refaz o conjunto a cada minuto | `src/lib/metas/carregar-acompanhamento.ts:34-56`; `src/components/metas/metas-auto-refresh.tsx:19`; `src/components/metas/tv/tv-tela.tsx:73` (`intervaloMs={60_000}`) | baixo | L | redesenho: `get_executiva_kpis`/`metas_ritmo_diario` aceitarem `p_setor` como array → backlog v6 | decidir | | |

## Síntese

O achado mais concreto é `/metas` (D3-005/D3-007): já paralelo, mas "uma RPC por setor" × auto-refresh de 60 s no Modo TV multiplica ~11 RPCs por minuto por tela ligada — candidato real a redesenho (v6), com um ajuste trivial imediato (`Promise.all`). D3-006 confirma o padrão do briefing (`v_estado_atual`/`patrimonio_listar_ativos`) com evidência de código. Os achados de índice (D3-001/002/003) são estatística de uso — remedir antes de qualquer `DROP`. D3-004 é o potencialmente mais custoso (dezenas de MB varridos repetidamente) mas exige investigação de chamador fora do timebox. DRE, Gerencial, Executiva e Weddings já usam um `Promise.all`/`allSettled` único por página — nenhuma serialização evitável ali.

## Contagem por classe

decidir 6 · simplificar 1 · apagar 0 · corrigir 0 · documentar 0 — **total 7**.

## Achei, não vou agir

- **Item 5 (RPC de leitura com loop N-queries):** nenhuma. Todo `FOR … IN SELECT` do catálogo pertence a RPCs de **escrita** (`batch_gerencial_import`, `inserir_lote_*`, `dre_*_estrutura_salvar`, `metas_*_upsert`, `monde_ingest_lote`, `api_retrofit_contratos`, `criar_solicitacao(_externa)`, `admin_solic_salvar_tipo`).
- D3-004 não aprofundado por chamador exato — fica para o `EXPLAIN` da v6.
- Índices `idx_scan=0` de schemas gerenciados pelo Supabase (`auth`, `storage`, `realtime`, `cron`) — fora do domínio.

## Riscos fora do escopo

- Nenhuma policy permissiva ou `coalesce` ausente nas funções lidas (`patrimonio_*`, `get_executiva_kpis` usam `exigir_acesso` inline corretamente; `patrimonio_registrar_movimentacao` faz `coalesce(v_status,'')` antes de comparar).
