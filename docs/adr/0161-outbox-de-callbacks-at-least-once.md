# ADR-0161 — Outbox de callbacks at-least-once: movimentação nunca quebra por entrega

> **Numeração definitiva no merge (2026-07-28)** — nasceu na faixa provisória 0950+
> (v5.4.0 em paralelo às v5.2.0/v5.3.0) e foi renumerado pelo checklist de merge.

- **Data:** 2026-07-21
- **Status:** aceito
- **Versão:** v5.4.0

## Contexto

A origem externa precisa saber quando a solicitação muda de estado (criada, concluída — com a
referência externa —, rejeitada — com justificativa —, cancelada). Um POST direto no momento da
movimentação teria dois defeitos: (a) se o assinante estiver fora do ar, a movimentação falharia
ou o evento se perderia; (b) callback aqui é **dado de negócio** (o estado da origem depende
dele — ex.: registrar a saída real no extrato do casal), não decoração — o padrão best-effort
puro do e-mail (v4.25) não basta: precisa de **persistência e retry**.

## Decisão

1. **Tabela outbox** (`app.api_outbox`): evento, solicitacao_id, chave destinatária, payload
   pronto, tentativas, próximo retry, status (`pendente`/`entregue`/`esgotado`), último erro.
2. **Enfileiramento DENTRO das RPCs de movimentação** (`criar_solicitacao_externa`,
   `solic_concluir/rejeitar/cancelar`), na MESMA transação da movimentação — o evento nunca se
   perde nem nasce sem a movimentação. Enfileira **só para solicitações de origem externa** (as
   internas não geram callback).
3. **Entrega desacoplada**: um processador lê a fila e faz o POST na `callback_url` da chave com
   header `x-callback-secret` (segredo de saída da chave). **Mecânica em duas pontas**:
   tentativa **inline best-effort** logo após a movimentação (latência boa no caminho feliz;
   falha é ignorada — o item continua pendente) + **varredura por pg_cron** (`*/5 min` → rota
   `/api/externo/outbox/processar`, autenticada por `CRON_SECRET`, mesmo molde do Monde/ADR-0153)
   com **backoff exponencial** (2^tentativas minutos, teto 8 tentativas → `esgotado`, visível no
   log). Escolhi pg_cron+rota (e não after-hook puro) porque sobrevive a deploy/restart e já é o
   padrão de agendamento do projeto (0182).
4. **Idempotência do lado do assinante**: o payload carrega `evento` + `solicitacao_id` (+
   `chave_idempotencia` original na criação) — reentrega do mesmo evento é segura por contrato.
5. Sucesso = resposta **2xx**; qualquer outra coisa agenda retry. Payload:
   `{ evento, solicitacao_id, referencia_origem, tipo, status, destinatario, justificativa?,
   referencia?, ocorrido_em }`.

## Consequências

- Concluir/rejeitar/cancelar **jamais** falham por causa do assinante — a UI humana não sente a
  integração (invariante do briefing).
- Entrega é **at-least-once**: o assinante PODE receber duplicado (documentado no contrato; o
  CRM deduplica por evento+id).
- MVP assina com segredo compartilhado em header (HMAC de corpo fica registrado como v2 — ADR-0158).
- O segredo de saída fica em claro em `app.api_chave.callback_segredo` (necessário para enviar);
  aceito no MVP: tabela RLS-fechada, schema não exposto, acesso só por RPC service-only.

## Emenda (2026-07-28)

O trecho do item 5 sobre `referencia?` no payload de `solicitacao.concluida` foi **REMOVIDO** por
decisão de produto do Yan, pós-implementação: o conceito "conclusão exige referência externa"
(que alimentava essa chave do payload — ver ADR-0159) foi EXTIRPADO. `solic_concluir` voltou à
assinatura de 1 parâmetro na migration **0215** (aditiva; `DROP` da versão de 2 parâmetros da
0213 é troca de assinatura, não perda de dado) e o payload de `solicitacao.concluida` deixou de
carregar a chave `referencia`. A mecânica da outbox em si (tabela, enfileiramento na mesma
transação, entrega inline+cron, backoff exponencial, idempotência do lado do assinante) é
**inalterada** — só o conteúdo do payload de UM evento específico mudou. A coluna
`app.solicitacao.referencia_conclusao` fica **órfã e inerte** até um patch destrutivo separado,
pós-merge (skill `banco-e-rpc`), fazer o `DROP COLUMN`.

## Emenda (2026-07-31) — o callback deixou de ser a ÚNICA forma de saber o desfecho

Decisão do Yan, ao ler a explicação dos campos de callback na tela de chaves: *"não seria mais
fácil para o nosso lado criarmos um endpoint de consulta no Janus?"*. Sim — e a razão é mais forte
que conveniência.

**O que estava errado no desenho.** A outbox entrega at-least-once com retry e backoff, e **desiste
após 8 tentativas** (`esgotado`). Isso é correto para uma fila, mas era terminal para a informação:
sem nenhuma rota de leitura, um endpoint do integrador fora do ar por algumas horas fazia o evento
se perder **para sempre**, sem caminho de reconciliação. E, antes disso, havia uma dependência dura
pior: se o integrador não construísse e hospedasse um receptor de webhook, ele criava pedidos no
Janus e **nunca** ficava sabendo o que aconteceu com eles — um risco de lançamento que não estava
nas nossas mãos.

**O que muda (migration 0221, aditiva):** `public.consultar_solicitacoes_externas(p_chave_id,
p_solicitacao_id, p_referencia_origem)` — leitura pura, escopada à chave — e duas rotas:
`GET /api/externo/solicitacoes/{id}` (item) e `GET /api/externo/solicitacoes?referencia_origem=…`
(coleção, buscando pelo id do próprio integrador). O escopo é o MESMO do cancelamento
(`origem_chave_id = p_chave_id` dentro do WHERE): solicitação de outra chave — ou aberta na tela por
um humano, que não tem origem — responde 404, sem distinguir "não existe" de "não é seu".

**Consequências:**

- O contrato ficou **autossuficiente**: criar → consultar → cancelar, tudo por chamada do
  integrador. O callback continua e continua sendo o melhor caminho para reagir na hora, mas
  **deixou de ser pré-requisito** — quem não quiser hospedar webhook opera 100% por consulta.
- A desistência da fila (`esgotado`) deixou de ser perda de informação: virou perda de
  *pontualidade*. O estado real está sempre disponível para consulta, sem prazo de validade.
- A recomendação ao integrador passa a ser a COMBINAÇÃO: callback para reagir na hora, consulta como
  rede de reconciliação. Está escrita no contrato (`docs/api-externa-solicitacoes.md`) e na página
  de documentação dentro da plataforma.
- `referencia_origem` **não é única** no Janus (só o par chave + `chave_idempotencia` é), então a
  busca por ela devolve **coleção** mesmo com um resultado — devolver "o primeiro" faria o
  integrador conciliar contra o pedido errado. Sem resultado é `200` com lista vazia (busca sem
  retorno), não 404 (recurso inexistente).
- Fora de escopo por decisão explícita: a consulta **não** devolve os valores dos campos preenchidos
  (o integrador acabou de enviá-los) e **não** existe listagem "tudo o que esta chave criou" — isso
  seria outra funcionalidade (paginação, ordenação, volume) e não foi pedida.

## SUPERADO (2026-07-31) — os callbacks foram REMOVIDOS; o Janus não faz chamadas de saída

Este ADR está **superado por inteiro** — não emendado. Decisão do Yan, no mesmo dia da emenda
acima: *"se os callbacks forem desnecessários com o endpoint de consulta vamos removê-los, nós
somos donos do formato, não devemos precisar mandar nada de volta, os outros sistemas que devem nos
consultar"*, confirmada depois de eu expor o trade-off: *"vamos seguir com a remoção"*.

**O raciocínio que muda a conclusão.** A emenda anterior tratava a consulta como REDE para o
callback. Olhando de novo, a ordem se inverte: o push era a única peça que obrigava o **outro lado**
a construir e proteger infraestrutura (endereço público, validação de segredo, tolerância a evento
repetido), e a única que nos obrigava a manter fila, cron de 5 minutos, backoff e um segredo por
chave. Com a consulta existindo, essa máquina inteira servia apenas para adiantar em minutos uma
informação que já estava disponível — ao custo de um modo de falha próprio (`esgotado`) e de uma
superfície de rede de saída.

**O que foi removido** (migration **0222**, aditiva, + patch destrutivo separado, TTY do Yan):
`app.api_outbox` (0 linhas), `app.api_outbox_enfileirar`, `public.api_outbox_reivindicar`,
`public.api_outbox_resultado`, o cron `api-outbox-processar`, as colunas
`app.api_chave.callback_url`/`callback_segredo`, a rota `/api/externo/outbox/processar`,
`src/lib/api-externa/outbox.ts`, a entrega inline nas rotas de escrita, os dois campos nos modais de
chave e a seção de Callbacks das duas cópias da documentação. Cinco funções pararam de enfileirar —
três delas do fluxo HUMANO (`solic_concluir`, `solic_rejeitar`, `solic_cancelar`), onde a única
mudança foi deixar de chamar o enfileirador.

**O que fica valendo do ADR original:** nada da mecânica de entrega. O que sobrevive é o princípio
que a motivou — *movimentação não pode quebrar por causa de integração* — e ele fica satisfeito de
forma mais simples: não há entrega nenhuma acoplada à movimentação.

**O preço, registrado para não ser descoberto depois:** a pontualidade passa a ser inteiramente
responsabilidade da plataforma de origem. Enquanto ela não consultar, ninguém do lado dela sabe — e
do nosso lado nada parece errado, porque não está. Se um integrador futuro precisar de reação em
segundos, o caminho é reintroduzir push para ele, não presumir que a consulta cobre esse caso.

**Ordem obrigatória na aplicação:** a 0222 (funções param de usar a fila) ANTES do patch destrutivo
(drop). O patch tem guarda que aborta se a 0222 não estiver aplicada — sem ela, dropar o
enfileirador deixaria as três RPCs humanas chamando função inexistente e a tela de Solicitações
quebraria na primeira conclusão.
