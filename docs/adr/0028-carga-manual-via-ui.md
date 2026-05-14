# ADR 0028 — Carga manual via UI em vez de automação

**Status:** Aceito  
**Data:** Maio/2026  
**Versão:** v3.4-1

## Contexto

Os dados do dashboard (Vendas + Lançamentos) precisam ser atualizados periodicamente. Havia três opções:
- **Opção A:** Script CLI manual (estado anterior para Vendas via `npm run seed`)
- **Opção B:** Cron/webhook automático
- **Opção C:** Página de upload manual via UI (`/admin/uploads`)

## Decisão

**Opção C — página `/admin/uploads`** com fluxo de confirmação (Nível 2: preview + modal antes de executar).

## Motivo

- Automação (cron/webhook) cria dependência de infraestrutura externa e risco de falha silenciosa. Um cron que falha às 3h sem alertar é pior que upload manual.
- Upload manual dá controle total a Yan: ele decide quando os dados estão prontos, especialmente antes de reuniões ou apresentações.
- Custo operacional é consciente e aceito: a frequência de atualização atual não justifica automação.
- Opção C resolve também a falta de UI para carga de Lançamentos (que antes não tinha nenhuma interface).

## Consequências

- Yan precisa lembrar de atualizar manualmente quando tiver dados novos.
- A automação pode entrar em versão futura se a frequência aumentar.
- A página não tem proteção de auth nesta versão (v3.4 é ainda sem login). Quando login entrar (v4), a rota `/admin/uploads` será protegida automaticamente.
