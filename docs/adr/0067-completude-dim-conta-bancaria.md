# ADR-0067 — Completude automática de dim_conta_bancaria

**Status:** Aceito  
**Data:** 2026-05-26  
**Versão:** v4.1  

## Contexto

Em v4.1, o checkpoint de KPIs da Abordagem B encontrou 51 contas presentes em `raw.lancamentos` mas ausentes de `financeiro.dim_conta_bancaria`. Isso causava `conta_bancaria_id IS NULL` em `fato_lancamentos`, excluindo R$ 512K de entradas do Bloco 1 via INNER JOIN.

Contas ausentes incluíam: todos os cartões WCLARA-*, CCAB-*, VISA WT, e também contas não-cartão como TBO (gateway de turismo), Conta Investimento XP e "Banco Itau, Caixa" (erro de cadastro ERP). Todas foram inseridas manualmente em migration 0067, mas o problema era estrutural: novas contas aparecem no ERP ao longo do tempo e ficariam ausentes da dimensão até nova migration manual.

## Decisão

`regenerar_financeiro_lancamentos()` (chamada após cada upload de Lançamentos) passa a executar um **INSERT idempotente** como passo 0, sincronizando `dim_conta_bancaria` com todas as contas distintas de `raw.lancamentos` que ainda não existam na dimensão.

Classificação automática no INSERT:
- `LIKE 'WCLARA - %'` ou nome exato de cartão conhecido → `tipo='cartao_credito'`, `eh_cartao_credito=TRUE`
- Qualquer outra conta nova → `tipo='outro'`, `eh_cartao_credito=FALSE`

O administrador pode atualizar `tipo` e `eh_cartao_credito` manualmente após o INSERT. `ON CONFLICT (conta) DO NOTHING` garante que contas já catalogadas (inclusive com tipo customizado) não sejam sobrescritas.

Implementado em migration 0069.

## Consequências

**Positivas:**
- Falha estrutural eliminada: novas contas do ERP são absorvidas automaticamente a cada upload
- `fato_lancamentos.conta_bancaria_id` tende a 100% de preenchimento para lançamentos liquidados após cada regeneração
- Contas novas recebem classificação conservadora (`tipo='outro'`, `eh_cartao_credito=FALSE`) — pior caso é incluir uma conta-cartão no Bloco 1 como não-cartão, que pode ser corrigido via UPDATE manual

**Trade-offs:**
- Contas com nomes compostos gerados por erro ERP (ex: `"WCLARA - A, WCLARA - B"`) são inseridas como entradas separadas na dimensão — não há como deduplicar automaticamente sem parsing de lógica de negócio
- Contas de tipo 'outro' inseridas automaticamente devem ser revisadas periodicamente pelo administrador para classificação correta de tipo e `eh_cartao_credito`
