# ADR-0064 — dim_hotel normalizada

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v4.0-m1

## Contexto

Até a v4.0, o hotel de uma operação era armazenado como string `TEXT` na coluna `hotel` de `analytics.dim_operacao_weddings`. Queries de agrupamento por hotel faziam `GROUP BY hotel` sobre strings cruas, sem garantia de unicidade (variações de grafia poderiam gerar duplicatas) e sem possibilidade de enriquecer com metadados (cidade, país) sem alterar a tabela principal.

## Decisão

Criar a tabela `dim.dim_hotel` no schema `dim` (novo schema criado pela migration 0055) com os campos:

- `hotel_id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `nome_canonico TEXT NOT NULL UNIQUE` — nome normalizado usado nos JOINs
- `nome_completo TEXT` — nome completo opcional
- `cidade TEXT`, `pais TEXT` — preenchimento progressivo em versões futuras
- `criado_em`, `atualizado_em TIMESTAMPTZ`

A população inicial insere os valores distintos de `hotel` já materializados em `analytics.dim_operacao_weddings` (migration 0055).

A migration 0056 adiciona a coluna `hotel_id UUID REFERENCES dim.dim_hotel(hotel_id)` em `analytics.dim_operacao_weddings` e faz backfill para as operações com hotel já identificado. A função `analytics.regenerar_dim_operacao_weddings()` é atualizada para popular `hotel_id` via `LEFT JOIN dim.dim_hotel dh ON dh.nome_canonico = COALESCE(ci.hotel, hpb.hotel)`.

A coluna `hotel TEXT` é mantida em `dim_operacao_weddings` para compatibilidade com código existente — remoção planejada para v4.1.

**Migrations:** `0055_create_dim_hotel.sql`, `0056_hotel_id_fk_backfill.sql`

## Consequências

- `dim_operacao_weddings` passa a ter FK tipada para `dim.dim_hotel`, habilitando JOINs eficientes e garantindo integridade referencial
- Metadados de hotel (cidade, país) podem ser enriquecidos na tabela `dim.dim_hotel` sem tocar nas tabelas de fato
- A coluna `hotel TEXT` duplicada em `dim_operacao_weddings` é dívida técnica temporária — dois campos para o mesmo dado até a remoção na v4.1
- Novos hoteis que aparecem após um re-seed precisam ser inseridos em `dim.dim_hotel` antes de `regenerar_dim_operacao_weddings()` poder popular `hotel_id` — ausência de trigger automático de inserção nesta versão
