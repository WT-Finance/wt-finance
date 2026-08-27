# ADR-0169 — Solicitação: etapa "Aprovada" opcional, e por que o histórico deixou de ser derivado do status

**Status:** aceito · **Data:** 2026-08-25 · **Versão:** v5.9.0
**Migrations:** `0261` (aditiva) · `0262` (destrutiva, `supabase/patches/`)

## Contexto

O módulo de Solicitações tratava autorizar e executar como um ato só: a solicitação ficava
`aberta` até alguém concluí-la, rejeitá-la ou cancelá-la. Num pedido de pagamento os dois
momentos são distintos — aprovo hoje, pago amanhã — e não havia onde registrar o meio do
caminho. Some-se que só se anexava arquivo na **abertura**: quem respondia não tinha por onde
devolver o comprovante do pagamento efetuado a quem abriu o pedido.

A documentação da API externa afirmava, textualmente, que *"não existe estado 'aprovado' nem
estados intermediários — se a plataforma integradora tem um conceito próprio de aprovação, ele
vive do lado dela"*. Era uma promessa de contrato, e esta decisão a revoga conscientemente.

## Decisão

**1. `aprovada` é uma etapa intermediária OPCIONAL entre `aberta` e `concluida`.**
Ninguém é obrigado a passar por ela: concluir direto de `aberta` continua valendo, e nenhum
fluxo existente ganhou um passo. Só o **atendente** aprova (aprovar o próprio pedido não é
aprovação); de `aprovada` saem concluir, rejeitar e cancelar. **Não existe desfazer aprovação**
— o ciclo só anda para a frente, como sempre foi.

**2. `aprovado_por`/`aprovado_em` são COLUNAS PRÓPRIAS, não estado derivado.**
Esta é a parte não óbvia, e a razão de existir deste ADR.

`solic_movimentacoes` **nunca foi um log de eventos** — é uma projeção do estado atual. Ela
deriva a ação de `CASE s.status WHEN 'concluida' THEN 'Conclusão' …`. Funcionava porque, até
aqui, toda solicitação tinha no máximo **uma** transição depois da abertura: o estado final
carregava toda a informação sobre o que havia acontecido.

Uma etapa intermediária quebra essa equivalência. Se `aprovada` fosse apenas uma passagem de
`status`, no instante em que a solicitação virasse `concluida` **a aprovação desapareceria do
histórico**: nenhum registro de que houve aprovação, de quem aprovou, de quando. O presente
reescreveria o passado, sem erro e sem aviso.

Por isso a aprovação ganhou colunas próprias, e o histórico ganhou um **terceiro ramo** derivado
de `aprovado_em IS NOT NULL` — independente do status. Uma solicitação concluída que passou por
aprovação exibe as **três** movimentações: Abertura · Aprovação · Conclusão, com atores e
instantes distintos. `solic_aprovar` deliberadamente **não toca** `decidido_por`/`decidido_em`,
que pertencem à decisão terminal.

**3. Anexo ao longo da vida, enquanto a solicitação não estiver encerrada.**
Os dois lados anexam (o solicitante complementa; o atendente devolve o comprovante). Solicitação
encerrada segue **imutável**. ~~Não existe anexo livre: todo anexo pertence a um campo
`tipo_campo='anexo'` daquele tipo — para o comprovante, o admin cria um campo
não-obrigatório.~~ → **revertido; ver Emenda 1.**

**4. A API externa só LÊ o estado novo.** Não há endpoint para aprovar; a aprovação acontece
dentro do Janus. Uma solicitação `aprovada` continua cancelável pela chave que a criou (aprovar
autoriza, não encerra).

## Consequências

- **O contrato externo mudou.** `status` deixou de ser lista fechada. Integração que ramifica nos
  quatro valores antigos sem caminho padrão passa a cair no ramo default. Documentado com aviso
  destacado nas duas cópias do contrato (a da plataforma e o `.md` que vai ao integrador), mas
  **sem comunicação prévia ao parceiro** — decisão consciente do Yan, registrada como risco
  aceito no out-briefing.
- **Aprovada continua viva:** vence (a data-limite corre até o desfecho, não até a autorização) e
  conta como pendência na caixa de quem atende.
- **`aprovada` exige registro:** a constraint `solicitacao_aprovada_registrada` impede o estado
  sem `aprovado_por`/`aprovado_em` — aprovada anônima seria pior que não ter a etapa.
- **A `0262` é destrutiva por convenção, não por efeito.** Ela só relaxa dois CHECKs (aceita um
  superconjunto; nenhuma linha existente se torna inválida), mas passa por `DROP CONSTRAINT` — e
  a regra do projeto trata todo DROP como destrutivo. Consequência prática: **um humano em TTY é
  pré-requisito do MERGE**, não um passo pós-merge, porque o front que consome a etapa já está no
  branch e fica vivo no instante do deploy.

## Alternativas consideradas

- **Estado terminal alternativo a `concluida`** (a solicitação "termina" aprovada). Rejeitada:
  não cria o momento em que o comprovante do pagamento efetuado é anexado, que é a origem do
  pedido.
- **Flag `exige_aprovacao` por tipo.** Rejeitada por YAGNI: tornar a etapa opcional para todos
  resolve o mesmo problema sem coluna nova no cadastro nem ramificação nas RPCs.
- **Aprovador distinto do executor** (gestor aprova, financeiro executa). Rejeitada nesta versão:
  exigiria papel/área RBAC novo e campo de aprovador — versão bem maior, sem demanda atual.
- **`aprovado_em_fmt` em `solic_emails_envolvidos`** para o e-mail de aprovação. Preterida em
  favor de `solic_aprovar` devolver o instante que acabou de gravar: mesma informação, sem uma
  segunda migration, e a fonte é o próprio ato.
- **Esconder `aprovada` da API** (mapear para `aberta` na saída). Rejeitada: manteria o contrato
  antigo intacto ao custo de a API mentir sobre o estado real.

## Emenda 1 (27/08/2026) — anexo LIVRE: a decisão D7 foi revertida

**Migration `0263`** (aditiva). A versão nasceu com "não existe anexo livre; todo anexo pertence
a um campo `tipo_campo='anexo'` daquele tipo". A consequência prática só ficou visível com a
funcionalidade pronta: **num tipo que não tem campo de anexo configurado, quem responde não tem
onde pôr o comprovante** — que é o caso de uso que originou a versão inteira. A decisão fazia o
recurso depender de um passo de cadastro que ninguém tinha motivo para adivinhar, e a única
pista de que ele faltava seria a ausência de um botão.

**O que passa a valer:** `campo_id` nulo é legítimo e significa *anexo geral*. O drawer ganha um
bloco "Anexos" que aparece mesmo vazio (para quem pode anexar) — antes ele era condicionado a
`anexosGerais.length > 0`, o que criava um impasse: o bloco só existia se já houvesse anexo, e
não havia como criar o primeiro.

**O que NÃO mudou:** os campos de anexo configurados pelo admin continuam existindo e
convivendo com o bloco livre — quem exige "Nota fiscal" na abertura segue exigindo. Anexo COM
`campo_id` continua validado contra o tipo; solicitação encerrada continua imutável; só
solicitante e atendente anexam. Afrouxar o nulo não afrouxou o resto.

**Nota de arquitetura, que é o mais interessante aqui:** a estrutura **sempre permitiu**.
`app.solicitacao_anexo.campo_id` é anulável desde a `0127`, cujo comentário diz literalmente
`NULL = geral`, e o drawer já exibia esses anexos. A porta foi fechada pela validação que a
`0261` acrescentou — a `0263` apenas a reabre. Não houve dado a migrar nem coluna a criar: a
decisão de produto tinha andado *contra* uma capacidade que o modelo de dados já oferecia.
Vale como lembrete de conferir o que a estrutura já permite antes de restringi-la por decisão.

**Alcance decidido:** o bloco livre existe **só no detalhe** (pós-abertura). O formulário de
abertura continua com os campos configurados; estender o livre para a criação mexeria na RPC de
criação e no snapshot de respostas, sem demanda que o justifique agora.

## Ver também

- Briefing e out-briefing da v5.9.0 em `docs/briefings/`.
- `src/lib/solicitacoes/ciclo-de-vida.test.ts` — paridade SQL↔TS do enum e das travas de
  transição, e a guarda de que a linha "Aprovação" deriva de `aprovado_em`, não do status.
- ADR-0112 (módulo de Solicitações, decisão do snapshot de respostas).
