# Briefing v5.9.5 — Desfazer em lote: `reverter_diario` robusto a múltiplos toques por linha

**Tipo:** PATCH *(correção de RPC viva; confirmar numeração no `/nova-versao` — sai depois ou antes da v5.9.4, são disjuntas exceto pela numeração de migration)* · **Migration:** **1 aditiva** (`CREATE OR REPLACE` de `financeiro.reverter_diario` + guard no salvar do caixa; numerar na hora — a v5.9.3 tomou a `0266` e a v5.9.4 toma a seguinte) · **ADR:** nenhum novo; **emenda datada ao ADR-0168** (que registra o fato "a `0251` não é revertível") + correção do comentário da `0260` · **Base:** `main` · **Branch:** `fix/v5-9-5-reverter-diario-multiplos-toques` · **Rota A** (planejado no Chat; sem decisão de produto aberta — este briefing entra como spec no 1º commit)

## Objetivo

O desfazer em lote aborta quando o lote tocou a mesma linha mais de uma vez. Hoje isso só atinge lotes de **migration**; a correção fecha a classe antes que um caminho de UI a alcance, e alinha os dois editores de estrutura (caixa e competência), que hoje se protegem de forma diferente.

## Evidência medida (09/09/2026, produção)

Um único lote em toda a base viola a premissa: **`lote_id = 132178`, 43 toques para 38 linhas** — `usuario_id` NULL, `criado_em` 2026-08-19 18:03, tabelas `financeiro.dre_bloco` e `financeiro.dre_categoria_map`. É a aplicação da `0251` (v5.7.0), e os 5 toques excedentes são as chaves tocadas duas vezes: `LOP`, `INV_H`, `RAIR`, `FIN`, `IMOB`.

**Conclusão que calibra a urgência:** nenhum lote de origem humana tem duplicata — `lote_id = txid_current()`, e uma migration inteira vira um lote só. Isto é **dívida preventiva**, não defeito ativo para usuários.

## O defeito, em duas camadas

**(1) Ordem.** `reverter_diario` percorre `ORDER BY id` (ASC). Numa cadeia de dois toques na mesma linha, a entrada mais antiga é conferida primeiro e seu `dados_depois` guarda o estado **intermediário**, que não bate com o atual → `RAISE` → a transação inteira cai sem reverter nada. Processar **DESC** resolve para as três formas de cadeia:

| Cadeia no lote | ASC (hoje) | DESC |
|---|---|---|
| U(A→B), U(B→C) | aborta na 1ª entrada | C≡C → volta a B; B≡B → volta a A |
| I(→B), U(B→C) | aborta | volta a B; depois DELETE |
| U(A→B), D(B→) | aborta (linha não existe) | reinsere B; depois volta a A |

**(2) Coluna volátil — DESC sozinho NÃO basta.** `fn_diario_alteracoes` grava `to_jsonb(NEW)`, a linha **inteira**, incluindo `atualizado_em`; e as três reversões deixam esse carimbo avançar de propósito (o `SET` exclui a coluna e o BEFORE trigger carimba `now()`; o ramo `D` exclui do INSERT). Logo, no segundo passo de qualquer cadeia, a linha volta ao conteúdo certo **com carimbo novo**, e a comparação contra o `dados_depois` da entrada anterior acusa diferença e aborta de novo.

**Correção:** a checagem de conflito passa a comparar **sem as colunas voláteis** — `v_atual - 'atualizado_em'` contra `e.dados_depois - 'atualizado_em'`, nos ramos `I` e `U`. A lista de colunas ignoradas vira uma **constante única no corpo** (hoje ela já existe implícita, e repetida, nos dois `NOT IN` das listas de SET/INSERT — as três ocorrências devem falar a mesma coisa).

**A guarda não afrouxa:** alteração real de conteúdo por terceiro continua reprovando. Deixa de reprovar apenas a linha idêntica com carimbo novo, que nunca foi conflito.

## Simetria dos dois editores (decisão de desenho)

A `0260` (competência) tem um guard que a `0208` (caixa) não tem: recusa payload com a mesma `categoria_id` duas vezes no lote. Ele opera **no payload da RPC de salvar** — migration não passa por RPC, escreve direto na tabela. Portanto os dois mecanismos são **complementares, não redundantes**: o guard cobre o caminho da UI, a correção do `reverter_diario` cobre o caminho da migration.

**Decisão:** o guard **fica** e é **portado para o salvar do caixa** (linha duas vezes no mesmo payload é cliente confuso, e o último toque venceria em silêncio). Mas a **justificativa muda**: o comentário atual da `0260` diz que ele protege o desfazer — depois desta versão isso deixa de ser verdade, e o comentário nos dois lugares passa a dizer o que ele realmente faz (rejeitar payload ambíguo).

## Invariantes (inegociáveis)

1. **Atomicidade preservada:** qualquer conflito real continua derrubando a transação inteira, sem reversão parcial. É a semântica de "desfazer lote".
2. **Fail-closed preservado:** a allowlist estrutural (tabela sob o trigger), o cast `::regclass`, os três ramos I/U/D e as mensagens de conflito ficam como estão. Esta versão muda **ordem** e **escopo da comparação**, nada mais.
3. **A `0251` NÃO deve ser revertida.** A correção torna o lote 132178 tecnicamente revertível; a estrutura da DRE está viva, estável e já comunicada à liderança desde 19/08. Registrar como aviso na emenda do ADR-0168.
4. **Corpo extraído do catálogo vivo** (`pg_get_functiondef`), nunca da `0206`; diff conferido linha a linha.
5. **Ver o defeito antes de corrigir:** o teste exercita a função **atual** e a vê **abortar** nas três cadeias, antes de aplicar. Guard que não foi visto reprovando não vale.
6. **Reversão continua auditada:** `origem_undo` + `app.diario_undo_de` seguem como estão (a reversão é gravada no diário marcada como reversão de qual lote — já desenhado, não mexer).
7. **Todos os chamadores enumerados antes de aplicar** (`dre_estrutura_desfazer_lote`/`_linha` do caixa, `dre_comp_estrutura_desfazer_lote`/`_linha` da competência, e o que mais o grep achar) — a mudança de ordem afeta quem passa array; quem passa um id só é indiferente.

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Reprodução:** em transação **revertida**, montar três lotes sintéticos numa tabela sob o regime do diário (U→U, I→U, U→D) e provar que a função atual **aborta** nos três. Enumerar os chamadores de `reverter_diario`. | as 3 mensagens de conflito capturadas e transcritas no out-briefing |
| **M2** | **Migration aditiva:** `CREATE OR REPLACE reverter_diario` com (a) `ORDER BY id DESC`, (b) comparação sem colunas voláteis via constante única, (c) comentário de cabeçalho explicando as duas mudanças; + guard de payload duplicado no salvar do **caixa** (molde da `0260`), com a justificativa reescrita nos dois lugares. `revisor-db` **antes** de aplicar. | ensaio em transação revertida: os 3 lotes de M1 revertem até o estado original; conflito REAL (terceiro alterou conteúdo) continua abortando |
| **M3** | **Testes permanentes:** caso de contrato via REST cobrindo cadeia de 2 toques revertida com sucesso, conflito real recusado, lote parcialmente conflitante não reverte nada (atomicidade), e o guard novo do caixa recusando payload duplicado. | suíte sobe; nenhum teste antigo de desfazer muda de expectativa |
| **M4** | **Fechamento:** v5.9.5; CHANGELOG; CHANGELOG_DIRETORIA (uma linha: desfazer em lote passa a funcionar mesmo quando a mesma linha foi alterada duas vezes na mesma operação); **emenda datada ao ADR-0168** (a `0251` deixa de ser irrevertível por limitação técnica, mas **não deve** ser revertida — e por quê); comentário da `0260` corrigido; WORKING-CONTEXT. | — |

## Gates

`tsc`+`lint` por missão (o toque em TS é mínimo ou nulo); `build`+`test` na fronteira e no fechamento. `revisor-db` obrigatório na M2 antes de aplicar; `revisor` ao fim. Verificação pós-aplicação via **REST/service_role** (`db query` não executa o corpo). Sem `verificador-visual` — não há mudança de UI.

## Checkpoint do Yan

Conferir o parecer do `revisor-db` sobre a comparação sem coluna volátil (é a única mudança que toca a semântica da guarda); confirmar a decisão de **portar** o guard para o caixa em vez de removê-lo da competência; ler a emenda do ADR-0168 antes de fechar. Depois do merge, um desfazer real pela UI de cada editor (lote de 2–3 linhas) para provar que o caminho normal não regrediu.

## Fronteira

**Fora:** qualquer mudança no trigger `fn_diario_alteracoes` (gravar linha inteira é o desenho, e mudar isso invalidaria o histórico existente); reverter de fato o lote 132178; unificar os dois editores de estrutura num só (as árvores divergem de propósito — ADR-0170); UI de histórico/desfazer; `harness-base` (item 33, outro repositório).

## Skills a ler (antes de implementar)

- `.claude/skills/banco-e-rpc/SKILL.md` (inclui a lição da v5.7.0 sobre esta função)
- `.claude/skills/contrato-rpc-front/SKILL.md` (só se algum contrato mudar — não deve)

## Aprendizado a registrar (régua de 5 destinos)

**Comparar a linha INTEIRA contra um snapshot é frágil quando a própria reversão altera uma coluna.** A classe é "coluna volátil em checagem de conflito" — carimbos de tempo, tokens de trava, contadores. Destino 4: skill `banco-e-rpc`, junto da lição existente sobre `reverter_diario`.

## Commits sugeridos

1. `test(db): reproduz o aborto do desfazer em lote com dois toques na mesma linha`
2. `fix(db): reverter_diario processa DESC e ignora coluna volatil na checagem de conflito`
3. `fix(db): guard de payload duplicado tambem no editor de estrutura do caixa`
4. `chore(release): v5.9.5`
