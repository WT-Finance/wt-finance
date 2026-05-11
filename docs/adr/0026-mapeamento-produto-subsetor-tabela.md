# ADR 0026 — Mapeamento produto→subsetor como tabela editável

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.4-1

## Contexto

A v3.4 introduz 4 subsetores de Weddings (COMERCIAL, CONVIDADOS, PRODUÇÃO, PLANEJAMENTO). Cada produto vendido precisa ser classificado em um subsetor para gerar o Sumário por Subsetor (Bloco 2.1) e a Decomposição no drill-down (Bloco 2.3).

Havia duas opções:
- **Caminho 1:** Hardcoded no código (objeto/switch em TypeScript)
- **Caminho 2:** Tabela `analytics.dim_produto_subsetor` no banco, editável via SQL

## Decisão

**Caminho 2 — tabela no banco.**

## Motivo

Produto novo ou renomeado exigiria deploy no Caminho 1. Com a tabela, Yan atualiza via SQL no Supabase Studio sem tocar no repositório. Produto sem mapeamento cai em `NÃO_CLASSIFICADO` com alerta visual — não quebra nada, apenas sinaliza que há classificação pendente.

A tabela tem `produto_normalizado` (UPPER+TRIM) para lookup robusto mesmo que o nome venha com variação de caixa nos dados.

## Consequências

- Produto novo sem mapeamento: aparece como `NÃO_CLASSIFICADO` nos gráficos com alerta laranja até ser classificado via `INSERT INTO analytics.dim_produto_subsetor`.
- Mapeamento é retroativo (Abordagem A): o mapeamento atual vale para todo o histórico. Não há vigência temporal por produto.
- Sem UI de gerenciamento nesta versão: edição via SQL no Studio. UI pode entrar em versão futura se a frequência de edição justificar.
