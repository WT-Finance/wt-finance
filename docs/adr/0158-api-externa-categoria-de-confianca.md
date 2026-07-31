# ADR-0158 — API externa de Solicitações: escrita autorizada por chave é uma categoria nova de confiança

> **Numeração definitiva no merge (2026-07-28)** — nasceu na faixa provisória 0950+
> (v5.4.0 em paralelo às v5.2.0/v5.3.0) e foi renumerado pelo checklist de merge.

- **Data:** 2026-07-21
- **Status:** aceito
- **Versão:** v5.4.0

## Contexto

Até aqui o Janus tinha integrações de **saída** (Asaas, e-mail) e uma de **entrada** que apenas
dispara um job interno (cron → `/api/monde/ingest`). A v5.4.0 introduz algo novo: **plataformas
internas criam registros de negócio (solicitações) no Janus via API**, autenticadas por **chave de
API** — sem `requireArea` humano no caminho. A chave *é* a autorização. Isso é uma **categoria nova
de confiança** e precisa de contorno explícito, não de exceções ad-hoc.

## Decisão

Toda a superfície externa segue um contorno único, auditável:

1. **Chave por plataforma** (`app.api_chave`): segredo armazenado **só como hash sha256**
   (irrecuperável; exibido uma única vez na criação), comparação em **tempo constante**,
   **revogação irreversível** (perdeu/vazou → revoga e cria outra).
2. **Whitelist de tipos por chave**: a chave só cria solicitações dos tipos autorizados a ela —
   verificada no servidor em TODA chamada. Tipo precisa ainda estar marcado `exposto_via_api`.
3. **Autor = usuário-robô da chave** (ADR-0109 intacto): cada chave tem um usuário de serviço
   (`rbac_usuarios` com `ativo=false`, `role_id NULL`; existe em `auth.users` por exigência de FK,
   com senha aleatória nunca revelada — `ativo=false` faz `exigir_acesso` negar qualquer sessão
   dele, então ele não opera a plataforma). Proveniência clara: a solicitação "é da Integração X".
4. **Idempotência obrigatória** (`chave_idempotencia`, índice único por chave de API): retry da
   origem devolve o MESMO resultado, nunca duplica.
5. **Marcador de origem + log**: solicitação criada via API carrega a chave criadora e a
   `referencia_origem`; `app.api_chamada_log` registra toda chamada (rota, status, timestamp).
6. **Erros estruturados, nunca silêncio**: payload inválido, tipo não autorizado, role fora da
   lista, campo desconhecido → código estável + mensagem. Limite de tamanho de payload na rota
   (64 KB). RLS deny-by-default e REVOKE/GRANT padrão do projeto em tudo.
7. **Rotas em `API_AUTH_PROPRIA`** (ADR-0153): o middleware deixa passar; o handler autentica pela
   chave. Emenda operacional: o conjunto passa a aceitar **prefixo** (`/api/externo/`) além de
   paths exatos, porque as rotas externas têm segmento dinâmico (`/{id}/cancelar`).

## Consequências

- Uma integração nova = **cadastro** (criar tipo exposto + chave com whitelist), não código.
- A lista `API_AUTH_PROPRIA` + a tabela de chaves são a superfície auditável da porta de entrada.
- Fora do MVP (registradas como v2): HMAC/assinatura criptográfica de callbacks, rate limiting
  além de payload+idempotência, painel de métricas, rotação assistida de segredo.

## Emenda (2026-07-30) — o autor deixa de ser o robô: solicitante amarrado a uma pessoa real

O **item 3 da Decisão** ("Autor = usuário-robô da chave") está **SUPERADO** por decisão de produto
do Yan, pós-implementação: *"não seria melhor se a solicitação vinda da API necessitasse de um
e-mail que já esteja cadastrado na plataforma para amarrarmos a um usuário, forçando que para que
seja possível disparar solicitação pela API antes o usuário tenha que ter cadastro na
plataforma?"*.

O que mudou (migration **0217**, aditiva): o payload de criação ganha
`solicitante_email` **obrigatório**; a RPC resolve o e-mail contra `app.rbac_usuarios`
(comparação `lower(btrim(...))`, exigindo `ativo`) e grava esse `user_id` em
`solicitacao.solicitante_id`. Sem e-mail → `SOLICITANTE_OBRIGATORIO`; e-mail sem cadastro ativo →
`SOLICITANTE_INVALIDO` (ambos 422, erro estruturado, **nunca** fallback para o robô).

**Por quê.** Com o robô como autor, a solicitação não tinha dono humano: não aparecia em "Minhas
solicitações" de ninguém, o e-mail de movimentação notificava um endereço que ninguém lê, e
**ninguém conseguia cancelá-la pela tela** (`solic_cancelar` exige `solicitante_id = uid_jwt()`).
A pessoa que pediu no sistema de origem ficava sem acompanhamento. Amarrando o pedido a uma pessoa
cadastrada, os três comportamentos passam a valer de graça — nenhuma RPC de UI mudou.

**A fronteira de confiança não afrouxa: aperta.** A chave continua sendo a autorização (item 1
intacto); o que se soma é uma **segunda** exigência de identidade — a pessoa precisa existir e
estar ativa no Janus. Cadastrar a pessoa antes de disparar é **pré-condição da integração**, e é
deliberado (era exatamente o pedido).

**Proveniência migra de "autor" para marcador + selo.** O que antes se lia no autor-robô agora se
lê em `solicitacao.origem_chave_id` (item 5, intacto) e, na interface, num selo **"via integração
X"** — `app.solic_json` passou a emitir a chave `origem` (`{ plataforma }` da chave, ou `null`
quando o pedido nasceu na tela). Sem isso, um pedido vindo do CRM ficaria indistinguível de um
aberto na tela pela própria pessoa.

O usuário-robô **continua existindo** e com a mesma configuração (`ativo=false`, `role_id NULL`) —
só muda o papel: é o **titular da chave** (FK `api_chave.robo_user_id`), não mais o autor das
solicitações. Solicitações criadas via API **antes** desta migration seguiriam com o robô como
solicitante (histórico intocado — a 0217 não faz backfill); na prática, todas foram apagadas pela
limpeza de histórico do mesmo round (patch **0218**).
