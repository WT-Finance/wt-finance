# ADR-0172 — API externa de Solicitações: modelo AS-BUILT

- **Data:** 2026-09-09
- **Status:** aceito
- **Versão:** v5.9.4
- **Substitui/altera:** ADR-0158, ADR-0159, ADR-0160, ADR-0161 (supersedidos)

## Contexto

Os quatro ADRs originais da v5.4.0 (0158–0161) descrevem a API externa de Solicitações como uma
**cadeia de emendas**: cada um nasceu com uma decisão e foi corrigido, uma ou mais vezes, por
decisões de produto posteriores do Yan, registradas como "Emenda" dentro do próprio arquivo. O
resultado é fiel ao histórico, mas caro de ler hoje — o 0158 ainda tem, no corpo da Decisão
original, o item 3 "Autor = usuário-robô da chave", revogado por uma emenda 9 parágrafos depois; o
0161 tem uma seção literalmente chamada "SUPERADO (2026-07-31) — os callbacks foram REMOVIDOS",
mas o campo `Status` do arquivo continua `aceito`. Um integrador novo, ou um desenvolvedor que
nunca acompanhou os 6 rounds da v5.4.0, não tem como saber, sem ler o arquivo inteiro linha a
linha, qual pedaço de cada ADR ainda vale.

Este ADR não repete essa narrativa. Ele descreve o modelo **como construído hoje** — a
**fonte de verdade é o código e as migrations vivas** (0210–0229, especialmente 0217/0221/0222–
0224/0226), não os quatro ADRs antigos. Os quatro seguem existindo como registro histórico
(marcados como supersedidos por este) — quem quiser entender COMO a decisão mudou de rumo, e POR
QUÊ, ainda vai até eles.

## Modelo como construído

### Autenticação

Toda chamada leva o header `x-api-key`. A rota resolve o segredo com `hashSegredo` (sha256,
`src/lib/api-externa/segredo.ts`) e busca por igualdade de hash via RPC `api_chave_resolver`
(`supabase/migrations/0211_api_chaves.sql`), `service_role`-only. O segredo em claro nunca é
persistido nem comparado byte-a-byte em código — só o hash é armazenado em
`app.api_chave.segredo_hash`, exibido em claro **uma única vez**, no momento da criação da chave
pela tela `/admin/api-externa`. Chave revogada ou inexistente → `401 AUTH_INVALIDA`
(`src/lib/api-externa/http.ts`, `autenticarChamada`). Revogação (`api_chave_revogar`) é
irreversível — não existe "reativar"; perdeu ou vazou o segredo, cria-se outra chave.

Toda chamada é registrada em `app.api_chamada_log` via `registrarChamada` (best-effort,
`src/lib/api-externa/http.ts`), inclusive as rejeitadas por auth ausente/inválida (`chave_id`
`null` é um valor legítimo no log).

As rotas (`src/app/api/externo/**`) estão isentas do middleware de sessão via
`API_AUTH_PROPRIA_PREFIXOS = ['/api/externo/']` em `src/proxy.ts` — o proxy deixa passar e cada
`route.ts` autentica pela chave, não por JWT Supabase (não existe sessão de usuário nesta
superfície).

### Autorização e confiança

A chave **é** a autorização — não há RBAC humano no caminho de escrita. O único controle de
alcance que resta é **por tipo, não por chave**: `app.solicitacao_tipo.exposto_via_api` (visível
e editável numa tela só). A whitelist de tipos por chave (item 2 do ADR-0158 original) foi
**removida** — migrations `0224_remove_whitelist_tipos.sql` (aditiva, 5 funções reescritas + 1
dropada, `api_chave_atualizar`) e `0226_remover_coluna_whitelist.sql` (destrutiva, `DROP COLUMN
app.api_chave.whitelist_tipos`). Uma chave ativa hoje alcança **todos** os tipos expostos — não
existe mais edição de chave: ela nasce, funciona, e é revogada (dois estados de vida, não três).

Destinatário (`destinatario` no payload de criação) é sempre uma **role** (equipe), nunca usuário
nominal — aceito por nome (case-insensitive, trim) ou id numérico, validado contra
`app.rbac_roles`. Não há restrição adicional por tipo (`api_roles_permitidas` foi removida na
`0216_api_destino_livre.sql` e a coluna dropada depois): qualquer role cadastrada é destino válido,
o mesmo espaço de escolha que a UI humana sempre teve. Sem fallback — role inexistente é
`422 DESTINATARIO_INVALIDO`, nunca um destino default silencioso.

O autor da solicitação **é uma pessoa real**, nunca o usuário-robô da chave. `criar_solicitacao_
externa` (migration `0217_api_solicitante_amarrado.sql`) exige `solicitante_email` — resolvido
contra `app.rbac_usuarios` (`ativo = true`, comparação `lower(btrim(...))`) e gravado em
`solicitacao.solicitante_id`. E-mail ausente ou sem cadastro ativo → erro estruturado
(`SOLICITANTE_OBRIGATORIO`/`SOLICITANTE_INVALIDO`), nunca fallback para o robô. O usuário-robô
(`app.rbac_usuarios`, `ativo = false`, `role_id NULL`) continua existindo, mas só como **titular
da chave** (`app.api_chave.robo_user_id`) — nunca passa em `app.exigir_acesso` (que exige
`ativo`), então nunca "loga" na plataforma e nunca mais é o solicitante de uma criação nova.

### Contrato de dados

Descoberta: `GET /api/externo/tipos` (`src/app/api/externo/tipos/route.ts`) chama `solic_tipos_
api(p_chave_id)` e devolve todos os tipos `exposto_via_api` e não arquivados — chave, rótulo e
definição de campos por `chave` estável (não por `campo_id`, que muda a cada apaga-e-recria do
editor de tipos — `solicitacao_campo.chave`, `solicitacao_tipo.slug`, ambos gerados na criação e
imutáveis depois, ADR-0159 intacto nesse ponto).

Criação: `POST /api/externo/solicitacoes` (`src/app/api/externo/solicitacoes/route.ts`), payload
validado por `zod` (`tipo`, `chave_idempotencia`, `destinatario`, `titulo?`, `campos?`,
`data_limite` (AAAA-MM-DD), `referencia_origem?`, `solicitante_email` obrigatório), chama `criar_
solicitacao_externa`. Idempotência: o par `(chave, chave_idempotencia)` é único
(`app.solicitacao`) — reenviar o mesmo par devolve o mesmo `id` (`idempotente: true`, HTTP 200) em
vez de duplicar (HTTP 201 na primeira vez). O ack devolve `destinatario` e `solicitante`
resolvidos, e o campo `origem` de `app.solic_json` carrega `{ plataforma }` da chave criadora (ou
`null` para pedido aberto na tela) — é o selo "via integração X" que a UI exibe.

Consulta: `GET /api/externo/solicitacoes/{id}` e `GET /api/externo/solicitacoes?referencia_origem=…`
(`src/app/api/externo/solicitacoes/[id]/route.ts` e `.../route.ts`), ambas via `consultar_
solicitacoes_externas` (migration `0221_api_consulta_externa.sql`), escopadas por
`origem_chave_id = p_chave_id` — solicitação de outra chave, ou aberta na tela por um humano (sem
origem), responde igual: `404 NAO_ENCONTRADA` (item) ou lista vazia (coleção), sem distinguir
"não existe" de "não é seu". `referencia_origem` não é única — a busca por ela sempre devolve
coleção, mesmo com um resultado só.

Cancelamento: `POST /api/externo/solicitacoes/{id}/cancelar`
(`src/app/api/externo/solicitacoes/[id]/cancelar/route.ts`) via `cancelar_solicitacao_externa`,
escopado à mesma chave que criou, só em estado ainda aberto. Não existe "reatribuir" pela API —
correção operacional é cancelar e recriar.

### Ciclo de vida

`aberta` → `aprovada` (opcional, v5.9.0) → `concluida` | `rejeitada` | `cancelada`. A conclusão e a
aprovação continuam sendo ação da tela/atendente — não há endpoint externo para elas. O contrato
publicado (`docs/api-externa-solicitacoes.md`) instrui o integrador a tratar `status` como valor
aberto (não uma lista fechada de 4 estados), por causa do estado `aprovada` introduzido depois.

### Observabilidade

`app.api_chamada_log` registra rota, status HTTP e detalhe de cada chamada (best-effort, nunca
derruba a resposta ao integrador — `registrarChamada`). A tela `/admin/api-externa` lista chaves
(`api_chave_listar`) e o log de uma chave (`api_log_listar`), consumidos por
`src/lib/api-externa/rpc.ts`. E-mail de notificação (criação/cancelamento) é enviado
best-effort via `getEmailsEnvolvidosSvc`/`solic_emails_envolvidos_svc` (variante service-role, sem
os guards de sessão que a RPC gated exigiria) — falha de e-mail nunca afeta a resposta HTTP.

### O que NÃO existe mais, e por quê

- **Whitelist de tipos por chave** — removida (`0224`/`0226`). Duas listas brancas em série (tipo
  exposto E tipo autorizado para a chave) produziam um `403 TIPO_NAO_AUTORIZADO` difícil de
  diagnosticar do lado do integrador, para um tipo que a própria tela mostrava como exposto. Sobra
  um controle só, visível numa tela: `exposto_via_api`.
- **Restrição de destino por tipo (`api_roles_permitidas`)** — removida (`0216`, coluna dropada
  depois). O fluxo humano nunca restringiu destino por tipo; manter a API mais estrita que a tela
  era assimetria sem razão de produto.
- **Outbox/callbacks (push do Janus para o integrador)** — removidos por inteiro
  (`0222_remove_callbacks.sql` aditiva + patch destrutivo separado): tabela `app.api_outbox`, as
  RPCs de fila, o cron `api-outbox-processar`, as colunas `callback_url`/`callback_segredo`, a
  rota `/api/externo/outbox/processar` e `src/lib/api-externa/outbox.ts`. Decisão do Yan: "somos
  donos do formato, não devemos precisar mandar nada de volta, os outros sistemas que devem nos
  consultar". O Janus **não faz nenhuma chamada de saída** para o integrador — o endpoint de
  consulta (`GET /solicitacoes/{id}` e `?referencia_origem=`) é a única forma de saber o desfecho.
- **`exige_referencia_conclusao`/`referencia_conclusao`** — o conceito "conclusão exige referência
  externa" foi extirpado (`0215`, colunas dropadas depois); a conciliação entre a solicitação e o
  registro do lado da origem é responsabilidade da plataforma integradora, não uma trava do Janus.
- **`api_chave_atualizar` / modal "Editar chave"** — dropados como consequência de a whitelist
  cair: era o único campo editável. Uma chave hoje só tem dois estados de vida: criada e revogada.

## Consequências

- Uma integração nova é **cadastro** (tipo exposto + chave), não código — a superfície auditável
  é a lista de chaves (`/admin/api-externa`) e o interruptor `exposto_via_api` por tipo.
- O contrato é **autossuficiente por consulta**: criar → consultar → cancelar, tudo por chamada do
  integrador, sem depender de o integrador hospedar receptor de webhook.
- A pontualidade da informação é **inteiramente responsabilidade da plataforma de origem**: sem
  push, quem não consultar não sabe do desfecho até perguntar. Se um integrador futuro precisar de
  reação em segundos, o caminho é reintroduzir push para ele especificamente, não presumir que a
  consulta cobre esse caso (registrado como preço aceito no ADR-0161 original).
- `docs/api-externa-solicitacoes.md` é o contrato vivo compartilhado com o integrador; a página
  "Solicitações → Documentação API" dentro do Janus espelha o mesmo cadastro em tempo real.

## Referências

- Rotas: `src/app/api/externo/solicitacoes/route.ts`, `src/app/api/externo/solicitacoes/[id]/route.ts`,
  `src/app/api/externo/solicitacoes/[id]/cancelar/route.ts`, `src/app/api/externo/tipos/route.ts`.
- Lib: `src/lib/api-externa/http.ts`, `src/lib/api-externa/segredo.ts`, `src/lib/api-externa/rpc.ts`,
  `src/lib/api-externa/consulta.ts`.
- Middleware: `src/proxy.ts` (`API_AUTH_PROPRIA_PREFIXOS`).
- Migrations: `0210_api_externa_fundacoes_tipos.sql`, `0211_api_chaves.sql`,
  `0212_api_validacao_compartilhada.sql`, `0213_api_outbox.sql` (tabela/RPCs depois removidas),
  `0215_api_config_sem_referencia.sql`, `0216_api_destino_livre.sql`,
  `0217_api_solicitante_amarrado.sql`, `0219_rpc_tipos_documentacao.sql`,
  `0220_limpeza_historico_e_slugs.sql`, `0221_api_consulta_externa.sql`,
  `0222_remove_callbacks.sql`, `0223_remover_outbox_e_colunas_orfas.sql`,
  `0224_remove_whitelist_tipos.sql`, `0225_comentario_solic_concluir.sql`,
  `0226_remover_coluna_whitelist.sql`, `0227_limpar_chave_tars.sql`.
- Doc do integrador: `docs/api-externa-solicitacoes.md`.
- Narrativa histórica (rounds 1–6, decisões e reviravoltas): `docs/briefings/WT_Finance_Out_Briefing_v5-4-0_API_Externa.md`.
- ADRs supersedidos por este: [ADR-0158](0158-api-externa-categoria-de-confianca.md),
  [ADR-0159](0159-chave-estavel-de-campo-e-slug-de-tipo.md),
  [ADR-0160](0160-destinatario-do-disparo-sem-fallback.md),
  [ADR-0161](0161-outbox-de-callbacks-at-least-once.md).
