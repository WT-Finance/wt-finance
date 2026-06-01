# ADR-0094 — Substituição total uniforme na área de upload

**Status:** Aceito
**Data:** 2026-06-01
**Contexto:** As bases de upload do admin usam substituição total (TRUNCATE+INSERT), mas a área estava inconsistente: `/admin/uploads` (Vendas por Produto, Lançamentos por Operação) tinha aviso forte (modal "vai apagar N e carregar M"), enquanto a página separada `/admin/uploads/financeiro` (Lançamentos por Categoria, CAP/CAR, Forma de Pagamento) tinha aviso fraco (só "N linhas válidas"). Como é produção direta (sem staging), o usuário podia apagar todo o histórico sem perceber. A carga incremental foi avaliada: o diagnóstico de chaves mostrou que só Fluxo de Caixa tem chave única confiável (numero); as demais têm duplicatas/nulos. Oferecer três estratégias de carga diferentes confundiria a diretoria.

## Decisão

Manter **substituição total (TRUNCATE+INSERT) como estratégia única** de todas as bases, padronizar o **aviso forte** (modal explícito com contagem antes/depois) em todas, e **unificar** num único menu `/admin/uploads`:

- Trazer Lançamentos por Categoria (`raw.lancamentos`) e CAP/CAR (`raw.fluxo_caixa_titulos`) para o menu, reusando parsers e RPCs existentes (`truncar_*`/`inserir_lote_*`/`contar_*`, `regenerar_financeiro_lancamentos`).
- Página dirigida por configuração de bases, com texto explicativo por base ("substitui toda a base; importe sempre o arquivo completo").
- Remover a base morta **Vendas por Forma de Pagamento** (`raw.vendas_pagamento`: 0 linhas, 0 consumidores) — código + tabela + RPCs (migration 0102).
- **Remover** a página `/admin/uploads/financeiro` (redirect para `/admin/uploads`) — evita bases duplicadas em dois lugares.

## Insumo preservado

O diagnóstico de chaves (Fluxo de Caixa = chave única; demais com duplicatas/nulos) fica como insumo do futuro projeto de RPA, que resolverá de fato a dor de atualização (extração + carga automática, eliminando o upload manual centralizado).

## Justificativa

Uma estratégia só + aviso forte uniforme + menu único é o modelo mais simples e seguro para produção direta. Carga incremental não se justifica sem chaves confiáveis e seria fonte de confusão; a solução real é RPA, não mais uma estratégia de upload manual.
