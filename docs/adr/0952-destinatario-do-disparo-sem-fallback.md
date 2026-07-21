# ADR-0952 — Destinatário vem do disparo, sem fallback; destino externo é sempre ROLE

> **Numeração PROVISÓRIA (faixa reservada 0950+, v5.4.0).** Renumeração no checklist de merge.

- **Data:** 2026-07-21
- **Status:** aceito
- **Versão:** v5.4.0

## Contexto

Quem recebe uma solicitação criada por outra plataforma? Um default silencioso ("cai numa fila
padrão") esconde erro de configuração e cria solicitações órfãs — ninguém percebe que o disparo
está errado. Decisão do Yan no briefing: **o disparo informa; o Janus valida; erro é estruturado,
nunca fallback**.

## Decisão

1. `destinatario` é **OBRIGATÓRIO** no `POST /api/externo/solicitacoes` e é sempre uma **ROLE**
   (equipe), nunca usuário nominal — integração não conhece pessoas, conhece filas.
2. A role é aceita por **nome exato** (case-insensitive, trim) ou **id numérico**, e validada
   contra `api_roles_permitidas` do tipo. Role inexistente, ou fora da lista do tipo → erro
   estruturado (`DESTINATARIO_INVALIDO` / `DESTINATARIO_NAO_PERMITIDO`) — **nunca** fallback.
3. O destinatário **resolvido** (`{id, nome}`) é **ECOADO** no ack da criação e nos callbacks —
   a origem consegue exibir "aberto para a equipe X" e detectar erro de fila imediatamente.
4. **Correção operacional = cancelar + recriar** (não existe "reatribuir" via API): o
   `POST /{id}/cancelar` só funciona para solicitação criada pela MESMA chave e ainda aberta.

## Consequências

- Erro de configuração aparece **no primeiro disparo**, no lado da origem, com mensagem clara.
- Renomear uma role no Janus pode quebrar disparos que usam o nome — erro estruturado no ack
  (documentado no contrato; a origem pode preferir o id, que é estável).
- O fluxo humano continua aceitando usuário OU role (XOR intacto); a restrição a ROLE vale só
  para a porta externa.
