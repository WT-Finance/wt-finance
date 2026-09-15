# ADR-0174 — Estante Welcome: razão de empréstimos

- **Status:** aceito
- **Data:** 2026-09-15
- **Versão:** v5.11.0 (Gestão de Pessoas · Estante Welcome)
- **Contexto:** schema `estante` novo (migrations `0271`/`0272`), segundo módulo da seção **Gestão
  de Pessoas**, rota `/gestao-pessoas/estante`. Irmão deliberado do Inventário de Ativos
  (ADR-0167) — mesmo padrão arquitetural de razão append-only com estado derivado — com quatro
  divergências que este ADR registra para não parecerem descuido.

## O problema

A empresa tem uma estante de livros e ninguém sabe quem está com o quê: o livro some da
prateleira e não há registro. A pergunta de negócio é "este livro está na estante? se não, com
quem está desde quando?" — a mesma forma da pergunta que o Inventário já resolve para
equipamentos, com uma peculiaridade: aqui o "detentor" é sempre um usuário da própria plataforma,
nunca um terceiro externo.

## Decisão 1 — Razão append-only com estado derivado, e SEM movimentação de abertura

`estante.livro` guarda só identidade e ficha (`titulo`, `autor`, `editora`, `ano`, `isbn`, `obs`,
`arquivado_em`). **Não tem** `status`, `disponivel` nem `portador_id`. Disponibilidade e portador
são derivados da última movimentação em `estante.movimentacao`
(`DISTINCT ON (livro_id) ... ORDER BY data_movimentacao DESC, criado_em DESC`): última
`emprestimo` ⇒ emprestado ao `usuario_id` dela; última `devolucao` ⇒ disponível; **nenhuma
movimentação** ⇒ disponível.

Esta última cláusula é a divergência deliberada do Inventário. Lá (Decisão 5 do ADR-0167), todo
ativo nasce com uma movimentação `cadastro` na mesma transação, porque o cadastro **ramifica** —
o ativo pode nascer em uso ou em estoque, e algo tinha de gravar qual dos dois. Aqui não há
ramificação: um livro posto na prateleira é sempre e só "disponível", e a ausência de qualquer
razão já significa isso sem ambiguidade nenhuma. Uma movimentação de abertura (um tipo `cadastro`
no enum `tipo_movimentacao`) seria cerimônia sem informação — um registro que não muda a resposta
de nenhuma consulta, só existiria para imitar o molde do irmão mais velho. `estante.livro` nasce
sem razão nenhuma, e a RPC de listagem trata "zero movimentação" como o caminho normal, não como
rede de segurança.

## Decisão 2 — Um registro é um exemplar; sem coluna de quantidade

Duas cópias do mesmo título são dois registros em `estante.livro`, cada um com sua própria cadeia
de movimentações. Não existe coluna de quantidade nem de exemplares disponíveis — a
disponibilidade é sempre binária por registro, como a de um único objeto físico (que é o que um
livro é).

O caminho de volta, se a estante um dia crescer a ponto de precisar controlar quantidade por
título, é puramente aditivo (`ADD COLUMN` numa tabela nova de "cópias"), não uma reescrita do
modelo atual. Decisão do Yan no brainstorming: YAGNI para uma estante de escritório.

## Decisão 3 — Dois níveis de permissão, e por que devolver o livro de outro é ato de gestão

`gestao-pessoas/estante` alcança ver o catálogo e movimentar (pegar/devolver). Mas devolver o
livro de **outra pessoa** exige `gestao-pessoas/estante/gestao` — sem essa área, a RPC recusa com
`DEVOLUCAO_DE_OUTRO` mesmo que o usuário tenha a área básica.

A razão não é burocracia: é o caso real de alguém sair de férias, ou da empresa, com o livro na
mochila. Sem esse desenho, o livro ficaria "emprestado" para sempre — ninguém além do próprio
portador poderia fechar o ciclo, e o portador pode não estar disponível para fazê-lo. A devolução
em nome de outra pessoa é deliberadamente um ato de **gestão** da estante, não uma ação que
qualquer colaborador comum executa sobre o empréstimo de um colega.

**A devolução NÃO exige que o portador tenha cadastro ativo em `app.rbac_usuarios`.** Isto é o
caso de quem já saiu da empresa: o `usuario_id` gravado na movimentação de empréstimo continua
válido para fins de leitura (é FK, não um filtro de `ativo = true`), e a RPC de devolução verifica
gestão/identidade do livro emprestado, não o estado de conta do portador original. Se a verificação
exigisse portador ativo, um livro emprestado por um ex-colaborador ficaria irrecuperável pelo
próprio desenho do sistema — a única saída seria mexer diretamente no banco.

## Decisão 4 — Excluir livro vira arquivar a partir da primeira movimentação

`estante_remover_livro` apaga de verdade **só** enquanto o livro nunca teve nenhuma
movimentação. A partir da primeira, a RPC **arquiva** (`arquivado_em`) em vez de apagar, e o livro
some do catálogo ativo com o histórico intacto — a RPC devolve qual dos dois aconteceu (`excluido`
| `arquivado` | `ja_arquivado`), e a UI conta a verdade ao usuário em vez de uma frase genérica.

O `ON DELETE RESTRICT` da FK `estante.movimentacao.livro_id → estante.livro.id` é o backstop: se a
regra de negócio na RPC falhasse por algum caminho não previsto, o próprio banco recusaria o
`DELETE` de um livro com razão associada. Apagar um livro com movimentações apagaria o registro de
quem o levou — o mesmo raciocínio de "append-only" da Decisão 1, aplicado à ficha e não só ao
razão.

## Decisão 5 — Premissa a não perder: `estante.movimentacao` é tecnicamente elegível ao undo genérico

O diário genérico da migration `0199` (usado para permitir edição de `obs` sem reabrir a
movimentação em si) foi anexado a `estante.movimentacao` do mesmo jeito que a outras tabelas de
razão do projeto. Isso torna a tabela **tecnicamente elegível** a `financeiro.reverter_diario` —
o que contradiria o append-only desta versão, já que reverter uma movimentação por essa via seria
um `DELETE`/`UPDATE` disfarçado sobre um registro que deveria só ganhar companhia, nunca sumir.

Hoje isso é **inofensivo**: achado do `revisor-db` durante a revisão da 0272, confirmado por
leitura das RPCs de undo existentes — todas filtram `tabela_alvo` por lista literal, e nenhuma
lista inclui `estante.*`. Não há, hoje, nenhum caminho de código que exercite essa elegibilidade.

Registrado aqui, e não em código, porque não há nada para codificar contra um risco que ainda não
existe: **qualquer RPC de undo genérica futura que itere sobre `tabela_alvo` a partir do catálogo
do diário precisa excluir `estante.movimentacao` explicitamente**, ou reintroduzir um filtro por
lista que a mantenha de fora por padrão. Quem escrever essa RPC deve ler esta decisão antes.

## Decisão 6 — Data futura recusada, retroativa liberada

`estante_registrar_movimentacao` recusa `data_movimentacao` no futuro (`DATA_FUTURA`) e aceita
livremente qualquer data passada, inclusive anterior à última movimentação registrada.

A assimetria é proposital. Retroativa é o caso normal (alguém esqueceu de registrar que pegou o
livro há três dias e corrige agora) e o estado derivado já lida com ela pela própria ordenação
`(data_movimentacao DESC, criado_em DESC)` — não precisa de trava nenhuma. Data futura é diferente:
sem o teto, uma movimentação datada amanhã se tornaria, a partir de amanhã, a "última" por
`data_movimentacao` e permaneceria assim indefinidamente, **congelando** o estado derivado do
livro num valor que a régua normal de correção do sistema ("erro se conserta com movimentação
nova") não resolve — uma movimentação nova de hoje continuaria perdendo em data para a futura.
Não há saída pela via já prevista, o que a torna qualitativamente diferente de qualquer outro erro
de digitação de data.

## Consequências

- **Positivas.** O modelo copia o molde já validado do Inventário (razão + estado derivado),
  reduzindo a superfície de decisão nova a quatro pontos genuinamente distintos: sem abertura, sem
  quantidade, devolução como ato de gestão em dois níveis, e exclusão que vira arquivamento. Um
  leitor que já conhece o ADR-0167 lê este em minutos.
- **Negativas.** A elegibilidade de `estante.movimentacao` ao undo genérico (Decisão 5) é uma
  dívida de desenho aceita conscientemente, não fechada em código — depende de quem escrever a
  próxima RPC de undo genérica ler este ADR.
- **Risco residual conhecido.** Se o dia vier em que a estante precisar de múltiplas cópias por
  título (Decisão 2) ou de reserva/fila (fora de escopo desta versão), ambos os caminhos de volta
  são aditivos e não exigem revisitar o modelo aqui descrito.

## Referências

- Migrations: `0271` (schema `estante`, tabelas, RLS, áreas RBAC), `0272` (as 7 RPCs gated).
- Briefing: `docs/briefings/briefing-v5-11-0-estante-welcome.md`.
- Molde de referência: ADR-0167 (Inventário de Ativos), `supabase/migrations/0247_*.sql` e
  `0248_*.sql`.
