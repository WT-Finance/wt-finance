# ADR 0034 — Situação da Venda como coluna estruturada

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.6-m5

## Contexto

Para implementar o componente "Vendas em Aberto", era necessária uma forma confiável de identificar vendas pendentes de finalização. As alternativas avaliadas foram:

1. Inferir status a partir de outros campos (pagamentos parciais, data de evento no futuro, ausência de entradas)
2. Adicionar coluna explícita `situacao` preenchida no tratamento da planilha original

A opção 1 produzia falsos positivos: vendas com data futura podem já estar completamente pagas; vendas com pagamentos parciais podem ser a situação normal para aquele produto.

## Decisão

Adicionar coluna `situacao TEXT CHECK (situacao IN ('Aberta', 'Fechada'))` em `raw.vendas_excel` (migration 0038). O campo é preenchido manualmente na planilha Excel antes da importação.

**Domínio do campo:**
- `Aberta` — venda registrada mas não finalizada/entregue
- `Fechada` — venda completa, finalizada
- `NULL` — valor ausente; tratado como `Aberta` pelo RPC até reimportação com campo preenchido

**Mitigação de risco:** Registros anteriores à migration ficam com `NULL`. O RPC `get_vendas_em_aberto_weddings` trata `NULL` como `Aberta`, o que inicialmente superestima o volume. A correção acontece naturalmente à medida que as planilhas são reimportadas com a coluna preenchida.

## Decisões pendentes (não bloqueiam v3.6)

- Tratamento de vendas canceladas (campo separado ou valor adicional em `situacao`?)
- Pagamentos parciais: considerar `Aberta` ou `Fechada`?
- Critério de fechamento: manual (planilha) ou automático (regra por data/pagamento)?

Estas decisões serão tomadas com a equipe comercial após uso real do componente.

## Consequências

**Positivas:**
- Fonte de verdade explícita e auditável para status de venda
- Sem ambiguidade: o time comercial decide o status, não o sistema

**Negativas / trade-offs:**
- Depende de disciplina de preenchimento na planilha Excel
- Período de transição com dados `NULL` até reimportação completa
