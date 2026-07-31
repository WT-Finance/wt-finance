# Janus — API Externa de Solicitações · Contrato do integrador

> **Versão do contrato:** v5.4.0 · julho/2026
> **Público:** equipes de plataformas internas do Welcome Group que criam solicitações no Janus
> (primeiro integrador: TARS/CRM). **Este documento substitui qualquer levantamento anterior
> como fonte da integração.** O Janus é o dono do formato; a plataforma de origem se adapta a
> este contrato. A fonte viva do contrato é o endpoint de descoberta (`GET /tipos`) — este
> documento o espelha; em caso de dúvida, o que a descoberta devolve é a verdade.
>
> **Versão viva na própria plataforma:** este contrato também é exibido dentro do Janus, em
> **Solicitações → Documentação API** (botão na tela inicial do módulo) — a página reflete o cadastro real
> dos tipos (sempre atualizada). Este arquivo é a cópia estável para compartilhar com o
> integrador.

---

## 1. Conceitos em 30 segundos

- Uma **solicitação** é uma tarefa aberta para uma **equipe** (role) do Janus, com campos
  definidos pelo **tipo** (cadastro do Janus). Estados possíveis: `aberta` →
  `concluida` | `rejeitada` | `cancelada`. **Não existe estado "aprovado"** nem estados
  intermediários — se a sua plataforma tem um conceito próprio de aprovação, ele vive do seu
  lado; para o Janus a solicitação está aberta até alguém concluí-la, rejeitá-la ou cancelá-la.
- Cada plataforma integradora recebe uma **chave de API** com uma **lista de tipos autorizados**.
- **Toda solicitação tem um solicitante humano**: o `solicitante_email` do disparo (seção 4) precisa
  ser de alguém já cadastrado e ativo no Janus, e é essa pessoa que fica como solicitante — ela
  acompanha o pedido em "Minhas solicitações", recebe os e-mails e pode cancelá-lo pela tela. A
  procedência não se perde: para quem atende, o pedido aparece com o selo **"via integração X"**
  (ex.: "via integração TARS") ao lado do solicitante.
- Toda mudança de estado gera um **callback** HTTP para a sua URL cadastrada (seção 6).

## 2. Autenticação

- Toda chamada leva o header **`x-api-key: <segredo>`**. O segredo é entregue **uma única vez**
  na criação da chave (o Janus guarda apenas o hash — não há como recuperá-lo; perdeu → revoga
  e gera outra).
- Chave revogada recusa **imediatamente** (`401`). Todas as chamadas são registradas em log.
- Limite de payload: **64 KB** por requisição (`413` acima disso).

## 3. Descoberta — `GET /api/externo/tipos`

Devolve os tipos que a **sua chave** pode abrir, com o formulário de cada um. **Chame este
endpoint antes de montar o POST** — ele é a verdade do contrato; o exemplo abaixo é o estado
real em 30/07/2026:

```json
{
  "ok": true,
  "tipos": [
    {
      "slug": "abatimento_de_creditos",
      "nome": "Abatimento de créditos",
      "destinos": [
        { "id": 1, "nome": "Administrador" }, { "id": 2, "nome": "Diretoria" },
        { "id": 3, "nome": "Financeiro" },    { "id": 4, "nome": "Geral" },
        { "id": 5, "nome": "Gestor" },        { "id": 6, "nome": "Recursos Humanos" }
      ],
      "campos": [
        { "chave": "venda_que_originou_o_credito",          "rotulo": "Venda que originou o crédito",          "tipo_campo": "texto_curto", "obrigatorio": true, "opcoes": null, "data_permite_passado": true },
        { "chave": "motivo_do_abatimento",                  "rotulo": "Motivo do abatimento",                  "tipo_campo": "texto_longo", "obrigatorio": true, "opcoes": null, "data_permite_passado": true },
        { "chave": "venda_em_que_o_credito_sera_utilizado", "rotulo": "Venda em que o crédito será utilizado", "tipo_campo": "texto_curto", "obrigatorio": true, "opcoes": null, "data_permite_passado": true }
      ]
    }
  ]
}
```

> **Os `id` das equipes acima são ilustrativos** — use os que a SUA chamada devolver.

> **Nota sobre slugs:** os exemplos deste documento valem após a limpeza de histórico da
> v5.4.0 — o tipo hoje exposto tem slug `abatimento_de_creditos` (sem sufixo numérico). A
> página **Documentação da API** dentro da própria plataforma sempre mostra os slugs e campos
> **vivos** do cadastro no banco — em caso de dúvida, ela é a fonte.

- **`slug`** identifica o tipo e **`chave`** identifica cada campo — ambos **estáveis**: o Janus
  garante que edições no cadastro (renomear rótulos, reordenar, adicionar campos) **não mudam**
  slugs/chaves existentes. Programe contra eles, nunca contra rótulos.
- **`destinos`** lista **todas as equipes do Janus** — são os valores válidos para o campo
  `destinatario` (seção 4). Qualquer equipe cadastrada no Janus pode receber solicitações via
  API, desde que o disparo a nomeie corretamente; não há lista restrita por tipo.
- `tipo_campo` ∈ `texto_curto · texto_longo · numero · moeda · data · selecao`.
  Campo `data` com `data_permite_passado: false` recusa datas anteriores a hoje (fuso
  São Paulo). Campos de anexo não são expostos via API nesta versão.

## 4. Criar — `POST /api/externo/solicitacoes`

```json
{
  "tipo": "abatimento_de_creditos",
  "chave_idempotencia": "pedido-b1e2c3d4",
  "solicitante_email": "camila@welcometrips.com.br",
  "titulo": "DW | Ana & Bruno — abatimento de crédito",
  "destinatario": "Financeiro",
  "data_limite": "2026-08-15",
  "campos": {
    "venda_que_originou_o_credito": "72549",
    "motivo_do_abatimento": "Crédito de hospedagem cancelada, a ser usado na nova reserva do casal.",
    "venda_em_que_o_credito_sera_utilizado": "73104"
  },
  "referencia_origem": "b1e2c3d4-…"
}
```

Resposta (`201` na criação; `200` quando idempotente — seção 5):

```json
{ "ok": true, "id": 123, "status": "aberta",
  "destinatario": { "id": 4, "nome": "Financeiro" },
  "solicitante": { "email": "camila@welcometrips.com.br", "nome": "Camila Souza" },
  "idempotente": false }
```

Regras:

- **`solicitante_email` é obrigatório** e precisa ser o e-mail de uma pessoa **já cadastrada e
  ativa** no Janus (comparação sem diferenciar maiúsculas/minúsculas e sem espaços nas pontas).
  Essa pessoa vira a **solicitante de verdade** do pedido: ela vê a solicitação em "Minhas
  solicitações", recebe os e-mails de movimentação (criada, concluída, rejeitada, cancelada) e
  pode cancelá-la pela própria tela do Janus. A procedência não se perde — a tela mostra um selo
  `via integração <PLATAFORMA>` ao lado do solicitante. E-mail sem cadastro ativo →
  `SOLICITANTE_INVALIDO`; ausente → `SOLICITANTE_OBRIGATORIO` (422 nos dois casos) — não há
  fallback: **cadastre a pessoa no Janus antes de disparar pela API.**
- **`destinatario` é obrigatório e é sempre uma equipe** (role) — pelo **nome exato**
  (case-insensitive) ou pelo **`id`** numérico devolvido em `destinos` (o id é estável; o nome
  pode ser renomeado no Janus — prefira o id). Equipe inexistente → **erro estruturado, nunca
  fallback**. O destinatário **resolvido é ecoado** na resposta e nos callbacks — exiba-o
  ("aberto para a equipe X") e detecte erro de fila no primeiro disparo. Errou a fila?
  **Cancele e recrie** (não existe reatribuição via API).
- **`data_limite`** (`AAAA-MM-DD`) é obrigatória — é o prazo da tarefa (ex.: o prazo de
  pagamento do abatimento).
- **`campos`** é um objeto `{chave: valor}` com **valores string**. Números/moeda aceitam vírgula
  ou ponto decimal (`"1500,00"` ou `"1500.00"`). Chave desconhecida → erro `CAMPO_DESCONHECIDO`
  (nada é ignorado silenciosamente). A validação é **idêntica** à do formulário humano do Janus:
  o que a tela recusa, a API recusa.
- **`titulo`** (recomendado): o texto curto que identifica a solicitação nas listas do Janus —
  inclua o contexto (ex.: o casamento). `referencia_origem`: o id do registro no SEU sistema;
  volta em todos os callbacks.

## 5. Idempotência e retry

- `chave_idempotencia` é **obrigatória** e única por chave de API. Recomendação: use o id do
  registro de origem (ex.: `pedido_id`).
- Reenviar com a mesma `chave_idempotencia` **não duplica**: devolve `200` com o **mesmo `id`**
  e `"idempotente": true` (e não reenvia e-mails). Retry com backoff é seguro e bem-vindo.

## 6. Callbacks (mudanças de estado → sua URL)

O Janus envia `POST` à **URL de callback** cadastrada na sua chave, com o header
**`x-callback-secret: <segredo de saída>`** (valide-o!). Quatro eventos:

| Evento | Quando | Campos extras |
|---|---|---|
| `solicitacao.criada` | criação via API confirmada | — |
| `solicitacao.concluida` | equipe concluiu | — |
| `solicitacao.rejeitada` | equipe rejeitou | `justificativa` |
| `solicitacao.cancelada` | cancelada (pela origem ou no Janus) | — |

Payload:

```json
{ "evento": "solicitacao.concluida", "solicitacao_id": 123,
  "referencia_origem": "b1e2c3d4-…", "tipo": "abatimento_de_creditos",
  "status": "concluida", "destinatario": { "id": 4, "nome": "Financeiro" },
  "ocorrido_em": "2026-07-25T14:03:00-03:00" }
```

> O Janus não pede nem devolve uma referência do SEU lado na conclusão — a
> conciliação entre a solicitação e o lançamento correspondente (ex.: no seu
> ERP/CRM) é responsabilidade da sua plataforma. Use `solicitacao_id` (ou o seu
> próprio `referencia_origem`, ecoado em todo callback) para casar os dois lados.

- **Entrega at-least-once:** responda `2xx` rápido (só enfileire do seu lado). Você **pode
  receber o mesmo evento mais de uma vez** — deduplique por `evento + solicitacao_id`.
- Sem `2xx`, o Janus retenta com backoff exponencial (2, 4, 8… minutos, teto 4 h) até 8
  tentativas; depois marca como esgotado (visível no log da chave, no admin do Janus).
- Não há callback de "aprovado" — não existe esse estado (seção 1).

## 7. Cancelar — `POST /api/externo/solicitacoes/{id}/cancelar`

- Só cancela solicitações **criadas pela sua chave** e **ainda abertas**.
- Já concluída/rejeitada/cancelada → `409` com `CONFLITO_ESTADO: <status atual>` — o conflito é
  **reportado, não aplicado** (o estado do Janus não muda; sincronize o seu lado pelo callback).

## 8. Erros

Formato de todo erro: `{ "ok": false, "erro": { "codigo": "...", "mensagem": "..." } }`.

| Código | HTTP | Significado |
|---|---|---|
| `AUTH_AUSENTE` / `AUTH_INVALIDA` / `CHAVE_INVALIDA` | 401 | Sem chave, chave errada ou revogada |
| `TIPO_NAO_AUTORIZADO` | 403 | Tipo existe mas não está na whitelist da sua chave |
| `NAO_ENCONTRADA` | 404 | Solicitação inexistente **ou de outra chave** |
| `CONFLITO_ESTADO` | 409 | Cancelamento de solicitação não-aberta |
| `PAYLOAD_EXCEDE_LIMITE` | 413 | Corpo acima de 64 KB |
| `JSON_INVALIDO` / `PAYLOAD_INVALIDO` | 400/422 | Corpo não é JSON válido / shape errado |
| `TIPO_INVALIDO` | 422 | Slug inexistente, arquivado ou não exposto |
| `IDEMPOTENCIA_OBRIGATORIA` | 422 | Falta `chave_idempotencia` |
| `DESTINATARIO_OBRIGATORIO` / `DESTINATARIO_INVALIDO` | 422 | Sem destinatário / equipe inexistente |
| `SOLICITANTE_OBRIGATORIO` / `SOLICITANTE_INVALIDO` | 422 | Sem `solicitante_email` / e-mail sem cadastro ativo no Janus |
| `DATA_LIMITE_OBRIGATORIA` | 422 | Falta `data_limite` |
| `CAMPO_DESCONHECIDO` | 422 | Chave de campo que o tipo não tem |
| `CAMPO_OBRIGATORIO` / `VALOR_INVALIDO` | 422 | Validação de campo (mesmas regras da tela) |
| `TIPO_EXIGE_ANEXO` | 422 | Tipo tem anexo obrigatório (indisponível via API nesta versão) |
| `ERRO_INTERNO` | 500 | Falha inesperada (tente novamente com backoff) |

## 9. Fora desta versão (não peça, ainda)

Anexos via API · estados/eventos de aprovação · assinatura HMAC de callbacks (hoje: segredo em
header) · reatribuição de destinatário · **criar em nome de quem ainda não tem cadastro no Janus**
(o `solicitante_email` precisa existir e estar ativo; cadastrar a pessoa antes é pré-condição
deliberada da integração).

---

*Dúvidas do contrato: Yan (Financeiro/Janus). O cadastro do tipo (campos, opções, equipes
válidas) é gerido no Janus — mudanças ADITIVAS (campo novo opcional) não quebram a integração;
o `GET /tipos` sempre reflete o vigente.*
