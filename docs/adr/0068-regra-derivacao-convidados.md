# ADR-0068 — Regra de derivação da coluna Convidados

**Status:** Aceito  
**Data:** 2026-05-26  
**Versão:** v4.2  

## Contexto

A gestora de Weddings solicitou uma coluna "Convidados" na lista de operações para saber quantas pessoas se hospedaram em cada casamento. O ERP registra passageiros nas linhas de Diárias de Hospedagem como string separada por vírgula no campo `passageiros`. A mesma pessoa pode aparecer em múltiplas linhas (diferentes datas, diferentes diárias), exigindo dedupe.

## Decisão

A coluna Convidados na lista de operações Weddings é **derivada** (não armazenada) a partir do agregado de passageiros únicos das linhas de Diárias de Hospedagem da operação.

**Algoritmo formal:**

Para cada operação Weddings:
1. Encontrar todos os `venda_n` vinculados à operação via `analytics.fato_lancamento_operacao`
2. Filtrar `raw.vendas_excel` onde `venda_numero IN (venda_n's)` AND `produto = 'Diárias de Hospedagem'`
3. Para cada linha com `passageiros` preenchido: `split(',')` → lista de nomes
4. Para cada nome: trim → lowercase → remoção de acentos (`unaccent` via pg_catalog) → colapso de espaços múltiplos → adicionar ao set único
5. Convidados = tamanho do set

**Normalização em SQL:**
```sql
regexp_replace(
  lower(pg_catalog.unaccent(trim(nome))),
  '\s+', ' ', 'g'
) AS nome_norm
```

**Comportamento na UI:**
- `convidados > 0`: exibir número
- `convidados = 0`: exibir 0 em `var(--text-muted)` com tooltip "Sem passageiros cadastrados nas Diárias desta operação"

Implementado como função SECURITY DEFINER `public.contar_convidados_operacao(p_operacao TEXT) RETURNS INTEGER` em migration 0073.

## Consequências

**Positivas:**
- Convidados é calculado dinamicamente — sempre reflete o estado atual do raw
- Sem coluna de armazenamento para manter sincronizada com atualizações do raw
- Normalização agressiva previne inflação por variações cosméticas ("João Silva" vs "joão silva")

**Limitações conhecidas:**
- Noivos contam como convidados (aparecem como passageiros nas próprias Diárias — não distinguíveis sem marcação adicional no ERP)
- Variações ortográficas reais ("João da Silva" vs "João Silva") são contadas como pessoas diferentes — comportamento conservador
- Valores serão NULL/0 até Yan fazer upload do Excel com a coluna `passageiros` preenchida
- Performance: O(n) por operação com n = lançamentos de Diárias; se lista completa for lenta (<2s), considerar materialização
