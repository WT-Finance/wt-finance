# ADR 0035 — Layout da Visão Geral priorizando narrativa de diretoria

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.6-m3

## Contexto

A Visão Geral da aba Weddings tinha componentes em ordem sem narrativa coerente: KPIs → Subsetor → Mix → Carteira → Prejuízos → Próximos Casamentos. A ordem refletia a ordem de implementação histórica, não a ordem de leitura natural para a diretoria.

O público primário em reuniões estratégicas precisa ver primeiro o panorama agregado, depois ações e composição imediata, depois estrutura analítica, e por fim exceções operacionais.

## Decisão

Nova ordem dos componentes na Visão Geral:

```
1. KPIs (6 cards)                          — panorama agregado
2. Próximos Casamentos | Mix por Produto   — ação + composição imediata (50/50)
3. Composição por Subsetor                 — estrutura analítica (100%)
4. Carteira: Vendas × Entregas             — par estratégico (100%)
5. Vendas em Aberto | Vendas com Prejuízo  — exceções operacionais (50/50)
```

Pares horizontais (50/50) em desktop ≥1024px via `grid lg:grid-cols-2`. Empilhamento responsivo em telas menores.

## Justificativa

A diretoria vê primeiro o panorama agregado (KPIs), depois ações e composição imediata (Próximos + Mix), depois estrutura analítica (Subsetor + Carteira como par estratégico), e por fim listas de exceções operacionais (Aberta + Prejuízo). Cada par horizontal carrega análise complementar.

## Consequências

**Positivas:**
- Narrativa alinhada com fluxo de leitura executivo
- Seções de exceção operacional ficam no final (úteis para Yan no dia a dia, sem distrair diretoria)

**Negativas / trade-offs:**
- Carteira fica na quarta posição — se diretoria não comentar sobre ela, reconsiderar posição na v3.7 (ver apêndice v3.6)
