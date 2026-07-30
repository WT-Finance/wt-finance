# ADR-0160 — Destinatário vem do disparo, sem fallback; destino externo é sempre ROLE

> **Numeração definitiva no merge (2026-07-28)** — nasceu na faixa provisória 0950+
> (v5.4.0 em paralelo às v5.2.0/v5.3.0) e foi renumerado pelo checklist de merge.

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
   *(Superado pela Emenda abaixo: a restrição por `api_roles_permitidas` do tipo foi revogada
   — `DESTINATARIO_NAO_PERMITIDO` não existe mais; `DESTINATARIO_INVALIDO` continua valendo
   para role inexistente.)*
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

## Emenda (2026-07-29)

A decisão **nuclear** desta ADR permanece integral: o destinatário vem do **disparo**, é
**obrigatório**, é **validado** contra as roles existentes, é **ecoado** na resposta/callbacks,
e **nunca** tem fallback.

O que foi **revogado**: a restrição adicional por TIPO (`api_roles_permitidas` — "a role
resolvida precisa estar na lista autorizada DESTE tipo"). Razão, decisão do Yan: o fluxo humano
de Solicitações nunca restringiu destino por tipo — na tela, qualquer tipo pode ser endereçado
a qualquer equipe. Manter a API mais estrita que a UI era uma assimetria sem justificativa de
produto, e o Janus é o dono do formato (não há uma regra de negócio externa exigindo essa
restrição). A partir de agora, **qualquer equipe cadastrada no Janus** é destino válido via API,
desde que o disparo a nomeie corretamente (por id ou por nome, como já valia) — a validação
"role existe" permanece; só a checagem extra "e está na lista deste tipo" cai.

Comportamento removido na migration `0216_api_destino_livre.sql`. A coluna
`app.solicitacao_tipo.api_roles_permitidas` fica ÓRFÃ a partir dessa migration — o `DROP` dela
fica para o mesmo patch destrutivo pós-merge que já vai remover as duas colunas órfãs da
migration `0215` (`exige_referencia_conclusao`/`referencia_conclusao`).
