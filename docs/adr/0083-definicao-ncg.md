# ADR-0083 — Definição operacional de NCG de curto prazo

**Status:** Aceito  
**Data:** 2026-05-27  
**Contexto:** O KPI "NCG" (Necessidade de Capital de Giro) é um conceito amplo que pode incluir estoques, ciclos financeiros longos e outras variáveis. Para uma empresa de serviços como a Welcome Group, uma definição simplificada e acionável é mais adequada.

**Decisão:** Adotar NCG de curto prazo (10 dias) como:

```
NCG (10d) = A Receber em aberto nos próximos 10 dias
           − A Pagar em aberto nos próximos 10 dias
```

**Fonte:** `raw.fluxo_caixa_titulos`  
**Filtro:** `status IN ('A Receber Futuro', 'A Pagar Futuro') AND vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '10 days'`

**Interpretação:**
- NCG positivo → previsão de receber mais do que pagar (folga de caixa)
- NCG negativo → previsão de pagar mais do que receber (precisa de capital)

**Cor do KPI:** verde (`var(--positive)`) se positivo, vermelho (`var(--negative)`) se negativo.

**Justificativa:** A janela de 10 dias é alinhada com a granularidade dos demais KPIs do Fluxo de Caixa Diário e com a navegação do Calendário de Liquidez. Definição clássica de NCG sem estoque é apropriada para o contexto de serviços (não há inventário físico).

**Consequências:** Em versões futuras, considerar NCG por operação Weddings (cruzamento com resultado_caixa esperado).
