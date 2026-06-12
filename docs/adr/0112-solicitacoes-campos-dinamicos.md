# ADR-0112 — Módulo de Solicitações: modelo de dados e campos dinâmicos

**Data:** 2026-06-12 · **Versão:** 4.16.0 · **Status:** aceito

## Contexto

Módulo de solicitações internas (spec v4.16.0 §2): tipos configuráveis pelo admin com
**campos dinâmicos** (7 tipos: texto_curto, texto_longo, numero, moeda, data, selecao,
anexo), abertura por qualquer autenticado, destinatário XOR usuário/role, ciclo de vida
com transições legais e visibilidade por papel. Exigência crítica: **valores gravados
imutáveis e legíveis mesmo após editar/arquivar o tipo**; validação **server-side** como
fonte de verdade.

## Decisão

### Modelo de dados (schema `app`, RLS deny-by-default)
- `solicitacao_tipo` (nome, arquivado) + `solicitacao_campo` (definição viva, ordenada:
  rotulo, tipo_campo, obrigatorio, opcoes p/ seleção).
- `solicitacao` guarda as **respostas como SNAPSHOT JSONB** (`respostas` =
  `[{campo_id,rotulo,tipo_campo,obrigatorio,opcoes,valor}]`) capturado **na abertura**.
- `solicitacao_anexo` (metadados; binário no Storage — ver ADR-0113).
- Transição terminal única na própria linha (`status`, `decidido_por`, `decidido_em`,
  `justificativa`) — sem tabela de eventos (não há reabertura na v1; uma só transição).

### Por que SNAPSHOT (e não tabela de valores normalizada nem FK viva)
A definição do tipo MUDA (admin edita/arquiva). Se os valores referenciassem a definição
viva, editar o tipo alteraria/quebraria solicitações antigas. Gravar rótulo+tipo+valor no
ato da abertura torna cada solicitação **autocontida e imutável** — o drawer renderiza o
histórico fielmente sem depender do estado atual do tipo. `solicitacao_campo` só serve
para **renderizar o formulário de abertura** e **validar naquele momento**.

### Validação dinâmica server-side (fonte de verdade)
`criar_solicitacao` (SECURITY DEFINER) percorre os `solicitacao_campo` vivos do tipo e
valida o payload: obrigatório presente, `numero/moeda` numérico, `data` AAAA-MM-DD,
`selecao` ∈ opções, `anexo` obrigatório tem ≥1 arquivo. Payload que burle o cliente é
**rejeitado com erro explícito**. A matriz de ciclo de vida (§2.2) e o XOR do destinatário
também são enforçados no banco (RPCs + CHECK constraints), não só na UI.

### Enforcement
Tabelas RLS-fechadas (`ENABLE RLS` + `REVOKE ALL`, sem policy permissiva). Todo acesso por
RPC `SECURITY DEFINER` que chama `app.exigir_acesso()` (login+ativo) e filtra por
`app.uid_jwt()`/`app.tem_area('solicitacoes')`. Área nova `solicitacoes` = gestão (ver
todas + administrar tipos); a página de abertura/minhas/caixa é de **qualquer autenticado**
(areasDaRota null). Grants `EXECUTE` explícitos (default privileges revogam — 0122/0124).

## Alternativas consideradas
- **Tabela de valores normalizada (`solicitacao_valor`):** rejeitada — exige FK para a
  definição viva (quebra imutabilidade ao editar o tipo) ou duplicar a def por valor; o
  snapshot JSONB resolve com menos superfície e leitura trivial.
- **Validação só no cliente / zod no client:** rejeitada — o projeto não tem zod client
  e a spec exige o servidor como fonte de verdade (param de auditoria adversarial).
- **EAV clássico:** rejeitado — complexidade sem ganho para o volume (centenas/ano).
- **Reabertura / tabela de eventos:** fora da v1 (spec); uma transição terminal cabe na linha.

## Consequências
- Editar/arquivar um tipo **não altera** solicitações já abertas.
- Render do board/drawer não faz N+1 caro (snapshot já traz tudo; helpers agregam em 1 query).
- Migração aditiva (schema novo); rollback = reverter deployment (estruturas ficam inertes).
- Fase 2 (fora do escopo): reabertura, comentários, reatribuição, notificação externa.
