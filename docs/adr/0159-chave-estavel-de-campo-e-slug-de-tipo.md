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

## Emenda (2026-07-28)

A parte do item 4 da Decisão referente a `exige_referencia_conclusao` foi **REMOVIDA** por
decisão de produto do Yan, pós-implementação da v5.4.0: o conceito "conclusão exige referência
externa" morreu — o Janus é dono do formato, e a conciliação entre a solicitação e o registro
correspondente do lado da origem (ex.: nº do lançamento no sistema do integrador) é
responsabilidade da PLATAFORMA DE ORIGEM, não uma trava do Janus na hora de concluir. O
comportamento (checagem + gravação da referência + chave `referencia` no callback) foi removido
na migration **0215**, aditiva — só o `solic_concluir` voltou à assinatura de 1 parâmetro (a de
2, da 0213/ADR-0161, foi `DROP`ada). A coluna `app.solicitacao_tipo.exige_referencia_conclusao`
(e `app.solicitacao.referencia_conclusao`, ver ADR-0161) ficam **órfãs e inertes** no banco —
nenhum código as lê ou escreve mais — até um patch destrutivo separado, pós-merge, fazer o `DROP
COLUMN` (skill `banco-e-rpc`: migration destrutiva não fica pré-escrita na pasta antes da hora de
aplicar). Slug estável de tipo, chave estável de campo, retrofit por RPC, `exposto_via_api` e
`api_roles_permitidas` (itens 1-3 e o restante do item 4) **permanecem intocados** — só a flag de
referência morreu.

## Emenda (2026-07-31) — exceção ÚNICA e datada à imutabilidade do slug

A invariante do item 1 ("slug **imutável** após a criação") **permanece**. Registro aqui uma
exceção única, exercida uma vez, com as condições que a tornaram segura — para que ela não seja
tomada como precedente aberto.

**O que aconteceu.** `app.slugificar` desempata slug repetido acrescentando sufixo numérico. Dois
tipos nasceram com sufixo por colidirem com tipos que **não deviam mais existir**:
`abatimento_de_creditos_2` (o `abatimento_de_creditos` original era duplicata de teste, excluída
pelo Yan no round 2) e `contas_a_pagar_2` (o `contas_a_pagar` homônimo estava **arquivado** — e
arquivado continua ocupando o slug, porque a UNIQUE não distingue arquivado de ativo). O slug
canônico só ficou livre **depois** da limpeza de histórico do round 4.

**Decisão.** O patch destrutivo **0218** renomeia os dois para a forma canônica, **na mesma
transação e depois** das exclusões, com guardas que ABORTAM se o mundo tiver mudado.

**Por que foi seguro — e a regra que fica.** O slug é o identificador que o integrador manda no
payload: renomear com um integrador ligado quebraria o contrato dele **em silêncio** (o Janus
responderia `TIPO_INVALIDO` a um payload que ontem funcionava). A exceção só se sustentou porque
**nenhuma chave de API existia ainda** (`app.api_chave` vazia) — o patch tem guarda explícita
para isso e aborta se houver qualquer chave emitida. **Regra durável: renomear slug só antes da
primeira chave existir; depois disso, nunca.** Se o slug precisar mudar com integrador ativo, o
caminho é outro — tipo novo com o slug desejado, exposição dos dois em paralelo e migração
combinada com a origem.

**Lição de origem** (esta é a parte que evita o problema em vez de remediar): o sufixo `_2` não foi
acidente do slugificador, foi **sintoma** de tipo duplicado/arquivado ocupando o nome. Ao criar um
tipo que vai ser exposto via API, conferir se o slug saiu limpo **antes** de emitir a chave —
depois, o custo é contratual.
