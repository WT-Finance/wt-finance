# ADR-0062 — Padrão de upload em lotes universal

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v4.0-m3

## Contexto

A v3.x tinha upload apenas para a planilha de Vendas por Produto (`raw.vendas_excel`). A v4.0 introduziu 3 novas fontes de dados financeiros: Lançamentos, Vendas por Forma de Pagamento e CAP/CAR. Cada fonte tem estrutura de colunas diferente, mas o fluxo de upload é idêntico: selecionar arquivo Excel → pré-visualizar → confirmar → truncar tabela raw → inserir em lotes.

Sem um padrão unificado, cada fonte exigiria seu próprio componente React com lógica duplicada de lote, confirmação, tratamento de erro e feedback visual.

## Decisão

Padronizar o pipeline de upload em 4 etapas fixas para todas as fontes:

1. **Parse client-side** com `xlsx` — leitura e transformação do Excel no browser, sem envio de arquivo para o servidor
2. **Lotes de 1.000 linhas** — envio em batches via Server Actions para evitar timeout e limites de payload do Supabase
3. **Server Actions com RPCs `SECURITY DEFINER`** — cada fonte tem um par de RPCs públicas (`truncar_*` + `inserir_lote_*`) no schema `public` que acessam as tabelas `raw.*` (necessário pela restrição PostgREST — ver ADR-0061)
4. **Modal de confirmação antes de truncar+inserir** — exibe contagem de linhas detectadas e avisa que a operação substitui todos os dados atuais

Implementação dividida em dois componentes:

- **`CardUpload`** em `src/app/admin/uploads/page.tsx` — cobre as fontes operacionais (`tipo: 'vendas' | 'lancamentos'`), com lógica de parse e RPCs específicas por tipo tratada internamente nos handlers da página.
- **`CardUploadFinanceiro`** em `src/app/admin/uploads/financeiro/page.tsx` — cobre as três fontes financeiras, iterando sobre um array de configuração `FONTES` (com `key`, `label` e `descricao`). A lógica de parse e RPCs também é tratada internamente por `switch` no handler, não via props de colunas/mapeamento.

Fontes suportadas na v4.0:
- Vendas por Produto (`raw.vendas_excel`) — existia desde v3.x, padronizada → `CardUpload`
- Lançamentos por Operação (`raw.lancamentos`) — nova → `CardUpload`
- Lançamentos por Categoria (`raw.lancamentos_financeiro`) — nova → `CardUploadFinanceiro`
- Vendas por Forma de Pagamento (`raw.vendas_pagamento`) — nova → `CardUploadFinanceiro`
- CAP/CAR (`raw.contas_pagar_receber`) — nova → `CardUploadFinanceiro`

## Consequências

- Qualquer nova fonte de dados pode ser adicionada configurando `CardUpload` com as props corretas, sem modificar a infraestrutura de lotes ou RPCs
- O modal de confirmação previne truncamento acidental — especialmente importante porque a operação é destrutiva (TRUNCATE sem rollback manual)
- O parse client-side mantém arquivos Excel fora do servidor; o payload para o Supabase são apenas os dados tabulares em JSON
- A exigência de pré-tratamento por Yan (ex.: unir abas CAP e CAR antes do upload) é uma limitação conhecida — não foi automatizada nesta versão
