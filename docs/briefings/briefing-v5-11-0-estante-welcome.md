# Briefing v5.11.0 — Gestão de Pessoas: Estante Welcome

**Tipo:** MINOR *(módulo novo na seção existente Gestão de Pessoas)* · **Migrations:** **aditivas** (schema `estante` novo — 2 tabelas + RPCs), numeração a partir de **0271** · **ADR:** **0174** (empréstimo como razão append-only sem movimentação de abertura; dois níveis de permissão; tomador = usuário da plataforma) · **Base:** `main` (`ec112be`, merge da v5.10.3) · **Branch:** `feat/v5-11-0-estante-welcome` · **ADR livre seguinte:** 0175

## Objetivo

A empresa tem uma estante de livros e ninguém sabe quem está com o quê — o livro some da prateleira e não há registro. Entra a **Estante Welcome**: um cadastro dos livros disponíveis e um **razão append-only de empréstimos e devoluções** que responde "este livro está na estante? se não, com quem está desde quando?". Cada colaborador registra ele mesmo que pegou e que devolveu; o catálogo (incluir, alterar, excluir livro) fica com quem administra a estante.

Segundo módulo da seção **Gestão de Pessoas**, irmão do Inventário de Ativos (v5.6.0) — mesmo padrão arquitetural, deliberadamente.

## Modelo de dados (firme — embutir, não rediscutir)

O razão é a fonte da verdade. **Disponibilidade e portador são derivados da última movimentação, nunca colunas em `estante.livro`.**

- **`estante.livro`** — só identidade e ficha: `titulo` (obrigatório), `autor`, `editora`, `ano`, `isbn`, `obs`, `arquivado_em` (nulo = na estante), auditoria (`criado_em`, `criado_por`, `atualizado_em`). **Não tem** `status`, `disponivel` nem `portador_id`.
- **`estante.movimentacao`** — append-only. `livro_id` (FK), `tipo` (enum `emprestimo` | `devolucao`), `usuario_id` (uuid → `app.rbac_usuarios.user_id` — **quem está com o livro**, dado de negócio), `data_movimentacao` (date), `obs`, `registrado_por` (uuid **da sessão**, auditoria), `criado_em`.
- **Um registro = um exemplar** (decisão do Yan). Duas cópias do mesmo título são dois registros em `estante.livro`; disponibilidade é binária por registro. Sem coluna de quantidade — o caminho de volta, se um dia a estante crescer, é um `ADD COLUMN`, puramente aditivo.
- **Sem tabela de categoria/gênero.** YAGNI para uma estante de escritório: busca livre por título e autor resolve. Promove-se a tabela no dia em que alguém pedir filtro por gênero.

**Estado derivado:** `DISTINCT ON (livro_id) ... ORDER BY data_movimentacao DESC, criado_em DESC`. Última movimentação `emprestimo` ⇒ **emprestado** ao `usuario_id` dela; última `devolucao` ⇒ **disponível**; **nenhuma movimentação** ⇒ **disponível**.

## Invariantes (inegociáveis)

1. **Estado derivado, fonte única.** Nenhuma coluna espelho de status/portador em `estante.livro`, nem "cache".
2. **Livro nasce SEM movimentação.** Divergência deliberada do Inventário (onde todo ativo nasce com uma abertura `cadastro`): um livro colocado na prateleira não é um evento de empréstimo, e ausência de razão já significa "disponível" sem ambiguidade. Um tipo `cadastro` aqui seria cerimônia sem informação.
3. **Append-only.** Movimentação não se edita nem se deleta: só `obs`, pelo diário genérico da 0199. Registro errado se conserta com **movimentação nova** — devolveu por engano, registra o empréstimo de novo.
4. **`registrado_por` vem da sessão, `usuario_id` é o dado de negócio.** Colunas distintas: auditoria versus quem está com o livro. Nenhum input de "registrado por" na UI.
5. **Devolução de livro alheio exige gestão.** Usuário com `gestao-pessoas/estante` só registra a devolução do livro que **ele mesmo** pegou (erro `DEVOLUCAO_DE_OUTRO`); quem tem `gestao-pessoas/estante/gestao` devolve qualquer um — o caso real de alguém sair de férias com o livro. Aprovado pelo Yan no brainstorming.
6. **Excluir livro sem apagar rastro.** `estante_remover_livro` apaga de verdade **só** enquanto o livro nunca teve movimentação; a partir da primeira, **arquiva** (`arquivado_em`) e some da estante com o histórico intacto. A RPC devolve qual dos dois aconteceu, e a UI conta a verdade ao usuário. Apagar um livro com razão apagaria o registro de quem o levou.
7. **A barreira é o banco.** Todas as regras (já emprestado, não emprestado, arquivado, título obrigatório, devolução alheia) vivem nas RPCs. As Server Actions **só traduzem** o erro para uma frase — duplicar validação no TS cria uma segunda verdade que envelhece.
8. **RBAC em dois níveis**, molde de Acervo/Solicitações: `gestao-pessoas/estante` = ver e movimentar; `gestao-pessoas/estante/gestao` = o catálogo, **incluindo** a de uso (a página faz OR das duas). RPCs `SECURITY DEFINER` com `app.exigir_acesso` inline; RLS deny-by-default; REVOKE/GRANT explícitos. **Gate inicial apertado no seed** (só os roles que já têm `admin/acessos`); o admin libera os demais pelo editor.
9. **Não-regressão do Inventário na rota.** `areasDaRota` hoje manda **todo** `/gestao-pessoas` para `gestao-pessoas/inventario`. A regra tem de ser desdobrada **por rota** — se ficar como está, a Estante nasce gated pela área errada e um usuário só de Estante não entra.
10. **Leitura consistente.** Ficha + histórico do livro numa única transação (receita do `get_dre_mensal`), imune a empréstimo concorrente no meio.
11. **Tema neutro de plataforma** (ADR-0103): tokens semânticos, pills e foco neutro. **Zero hex** em componente.
12. **Fail-safe:** RPC falhou ⇒ seção degrada (omite), página viva.
13. **Migrations aditivas**, numeradas na hora (`git mv`), backup-gate, verificadas **executando via REST/service_role** — introspecção não prova execução.

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Banco (0271 + 0272).** Schema `estante`: enum `tipo_movimentacao`, `livro`, `movimentacao`, índices, triggers do diário genérico, RLS deny-by-default; as duas áreas RBAC novas em `app.rbac_areas` + seed apertado em `app.rbac_role_permissoes`. RPCs gated: `estante_listar_livros` (catálogo + estado derivado + nome do portador + busca) · `estante_detalhe_livro` (ficha + histórico, transação única) · `estante_criar_livro` · `estante_atualizar_livro` · `estante_remover_livro` (apaga ou arquiva) · `estante_registrar_movimentacao` · `estante_listar_movimentacoes`. Estrutura e RPCs podem vir na mesma migration ou em duas — declarar na numeração real. | emprestar um livro já emprestado ⇒ `JA_EMPRESTADO`; devolver livro disponível ⇒ `NAO_EMPRESTADO`; devolver livro de outro sem gestão ⇒ `DEVOLUCAO_DE_OUTRO`, **com** gestão ⇒ passa; livro sem nenhuma movimentação aparece **disponível**; inserir devolução com data anterior ao empréstimo e conferir que o estado derivado responde pela ordenação `(data_movimentacao, criado_em)`; remover livro virgem apaga, remover livro com razão arquiva e o histórico continua legível |
| **M2** | **Rota + permissão + sidebar.** Duas áreas novas em `src/lib/auth/areas.ts` (`AREAS`, `AREA_INFO`); **desdobrar `areasDaRota`** por rota dentro de `/gestao-pessoas` (invariante 9); sub-item "Estante Welcome" em `GESTAO_PESSOAS_SUBS` (ícone Lucide distinto de `Boxes`); `requireArea` na page; `loading.tsx`. | **fronteira de fase:** usuário só com `gestao-pessoas/inventario` continua entrando no Inventário e **não** vê a Estante; usuário só com `gestao-pessoas/estante` vê a Estante e **não** o Inventário; paridade banco↔app das áreas passa no teste de contrato |
| **M3** | **Acervo.** Aba *Acervo*: tabela densa (título, autor, ano, pill de estado — "Disponível" ou "Com Fulano desde 12/09" — e ação na linha), busca livre por título/autor, filtro por estado. Drawer da ficha com os dados do livro e o razão daquele exemplar. Modais de cadastro/edição e a remoção (com a frase certa para apagar × arquivar), **só** para quem tem gestão. | quem não tem gestão não vê botão de cadastrar/editar/excluir **nem** alcança a action; tabela sticky e formato de data pelos primitivos do DS; livro sem autor não vira `null` na tela |
| **M4** | **Movimentação + histórico.** Ação rápida na linha ("Peguei este livro" / "Devolvi") com confirmação e `obs` opcional; data padrão hoje, retroativa liberada. Aba *Histórico*: razão completo, filtro por tipo, busca, clique abre a ficha do livro. | pegar e devolver o mesmo livro 3× em sequência e conferir o estado derivado a cada passo; o botão que aparece na linha é o coerente com o estado (livro emprestado a outro não oferece "Peguei"); erro do banco chega ao usuário como frase, não como mensagem crua de Postgres |
| **M5** | **Fechamento.** Bump v5.11.0; CHANGELOG; CHANGELOG_DIRETORIA ("a empresa passou a ter registro de quem está com cada livro da estante"); **ADR-0174**; out-briefing com prints; WORKING-CONTEXT. | — |

## Gates

Escalonados: `tsc --noEmit` + lint ao fim de cada missão; `build` + `test` na fronteira da M2 (navegação/RBAC), após a M4 e no fechamento. Testes de tabela das RPCs cobrindo os casos da auto-auditoria da M1. Migrations com backup-gate + verificação **executando** via REST/service_role. **revisor** sempre; **revisor-db** obrigatório (há migration e RPC), antes da aplicação; **verificador-visual** nas duas abas + drawer + modais, depois dos gates e dos revisores.

## Checkpoint do Yan

**(seed/RBAC)** confirmar quem recebe cada um dos dois níveis no dia da subida. **(final)** cadastrar 3–5 livros reais; pegar um pela própria conta e conferir que a estante mostra "Com Yan desde hoje"; tentar devolver, por uma conta sem gestão, um livro que outra pessoa pegou e confirmar a recusa; devolver esse mesmo livro com a conta de gestão; excluir um livro nunca emprestado (some) e um livro com histórico (arquiva, histórico legível); abrir o Inventário de Ativos e confirmar que a navegação e a permissão não regrediram; passe por teclado nas duas abas.

## Fronteira

**Fora desta versão:** fila de espera / reserva; alerta e prazo de devolução; capa do livro (Storage); categoria ou gênero; avaliação/nota; notificação por e-mail; múltiplas cópias sob um mesmo título; import de planilha; ISBN consultado em API externa; QR code e etiqueta; empréstimo para pessoa de fora da plataforma. Tudo isso é v5.11.x ou v6 se fizer falta — **nada além do básico** foi decisão explícita do Yan no brainstorming.

## Skills a ler (antes de implementar)

- `.claude/skills/banco-e-rpc/SKILL.md`
- `.claude/skills/contrato-rpc-front/SKILL.md`
- `.claude/skills/ui-design-system/SKILL.md`
- `.claude/skills/tabela-densa/SKILL.md`
- `.claude/skills/react-padroes/SKILL.md`

## Referência viva

O Inventário de Ativos é o irmão mais velho e o molde a copiar: `supabase/migrations/0247_*.sql` e `0248_*.sql` (estrutura e RPCs), `src/app/gestao-pessoas/inventario/actions.ts` (tradução de erro), `src/components/gestao-pessoas/inventario/` (abas, drawer, modais, status badge).
