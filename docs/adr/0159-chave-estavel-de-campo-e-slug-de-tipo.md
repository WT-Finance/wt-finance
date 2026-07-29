# ADR-0159 — Chave estável de campo + slug de tipo: o cadastro de tipos gera o contrato

> **Numeração definitiva no merge (2026-07-28)** — nasceu na faixa provisória 0950+
> (v5.4.0 em paralelo às v5.2.0/v5.3.0) e foi renumerado pelo checklist de merge.

- **Data:** 2026-07-21
- **Status:** aceito
- **Versão:** v5.4.0

## Contexto

O editor de tipos de Solicitações salva campos com **apaga-e-recria** (`admin_solic_salvar_tipo`
faz `DELETE FROM solicitacao_campo` + re-INSERT): os `campo_id` **mudam a cada edição do tipo**.
Para a UI isso é invisível (ela relê os campos), mas um **contrato externo** keyed por `campo_id`
quebraria silenciosamente na primeira edição — a família de bug "dado errado parecendo certo".
Além disso, tipos eram identificados só por `id`/nome (nome é editável).

## Decisão

1. **Slug estável no tipo** (`solicitacao_tipo.slug`, único, gerado do nome na criação,
   **imutável depois**): é o identificador do tipo no contrato externo.
2. **Chave estável por campo** (`solicitacao_campo.chave`, única por tipo, minúscula
   `[a-z0-9_]`): gerada do rótulo na criação do campo; a UI a reenvia (read-only) a cada salvar,
   então ela **sobrevive ao apaga-e-recria**; o payload externo referencia `campos: {chave: valor}`,
   nunca IDs.
3. **Retrofit por RPC, não por UPDATE na migration**: tipos/campos existentes ganham slug/chave
   via `api_retrofit_contratos()` (service-only), executada pelo orquestrador após o push. Motivo:
   o classificador do db-gate marca `UPDATE` top-level como destrutivo (fail-closed, correto) —
   e este é dado NOVO em coluna NOVA, sem sobrescrever nada; a RPC explícita preserva a migration
   como aditiva **sem burlar o gate**.
4. **Flags de contrato no tipo**: `exposto_via_api` (só tipos marcados aparecem/aceitam criação
   externa) e `exige_referencia_conclusao` (concluir pede um dado externo — ex.: nº do Monde — que
   viaja no callback); `api_roles_permitidas` (as roles que o disparo externo pode endereçar).

## Consequências

- Editar um tipo (renomear, reordenar, adicionar campo) **não muda** chaves preexistentes — o
  contrato externo não quebra. (Provado por teste: editar tipo preserva chaves.)
- O `GET /api/externo/tipos` (descoberta) e o documento de contrato derivam do MESMO cadastro —
  não há segunda fonte da verdade.
- Renomear um CAMPO mantém a chave original (a chave nasce do rótulo mas não o segue) — o rótulo
  é exibição; a chave é contrato.
