# ADR-0155 — Colaboração segura na Base de Dados: diário append-only + desfazer auditado + realtime por broadcast + trava otimista

- **Status:** aceito (v5.2.1)
- **Data:** 2026-07-23
- **Contexto de origem:** um usuário apagou toda a Base de Dados do Fluxo de Caixa Gerencial (`analytics.gerencial_lancamentos`) sem reversão possível; e edições simultâneas de dois usuários podiam se atropelar sem ninguém ver. Escopo: só o Gerencial, mas com **desenho generalizável** (o padrão nasce pronto para promover a outras tabelas editáveis).

## Decisão

Quatro camadas em volta da tabela, sem tocar o contrato de quem só edita (invariante: "Gerencial continua idêntico"). Todas **aditivas** (migrations 0199–0202).

### 1. Diário de alterações genérico e APPEND-ONLY (0199)
- Tabela única `financeiro.diario_alteracoes` (`tabela_alvo`, `operacao` I/U/D, `registro_id`, `dados_antes`/`dados_depois` jsonb, `usuario_id`/`usuario_nome`, `lote_id`, `origem_undo`, `criado_em`).
- Uma **função de trigger genérica** (`financeiro.fn_diario_alteracoes`) anexada como `AFTER INSERT/UPDATE/DELETE FOR EACH ROW`. Genérica: serve qualquer tabela cuja PK seja a coluna `id`.
- **Autor:** `auth.uid()` (nulo em operação de sistema/service_role, ex.: importação) + nome **denormalizado** no momento do fato (retenção total — sobrevive à exclusão do usuário).
- **Lote:** `txid_current()` — agrupa todas as linhas de uma transação (a "ação"). Uma exclusão em massa (um `DELETE ... WHERE id = ANY`) = N linhas no mesmo lote → o painel agrupa por lote.
- **Imutável:** RLS liga na tabela; nenhum GRANT a anon/authenticated; só o trigger (SECURITY DEFINER dono `postgres`) escreve; leitura só via RPC SECURITY DEFINER. **Nenhum UPDATE/DELETE no diário — nem pelo desfazer.**

### 2. Desfazer com VERIFICAÇÃO e AUDITADO (0200)
- Núcleo interno `financeiro.reverter_diario(ids[])` aplica o **inverso** em transação: DELETE revertido → reinsere o "antes" (com o id original); UPDATE revertido → restaura o "antes" **se a linha não mudou depois** (`to_jsonb(atual) IS DISTINCT FROM dados_depois` → conflito, avisa, **não força**); INSERT revertido → apaga (se não mudou). **Reversão de lote = atômica** (tudo-ou-nada).
- **Undo auditado:** as escritas da reversão disparam o mesmo trigger (0199) → **novas** entradas no diário (append-only), carimbadas com `origem_undo` = lote revertido, via GUC transacional `app.diario_undo_de` (`set_config(..., is_local := true)`). Nunca se apaga histórico.
- **Permissões:** ação **própria unitária** = quem tem `financeiro/gerencial`; ação de **terceiro** OU **restauração em massa** (lote > 1 linha) = **só admin** (`admin/acessos`). Predicado com `auth.uid()` e `usuario_id` anuláveis via `IS DISTINCT FROM` (NULL não vaza).

### 3. Realtime por BROADCAST, não postgres_changes (0201)
- Escolha: **broadcast** por trigger `SECURITY DEFINER` (`realtime.send`), statement-level (uma mensagem por statement, com a contagem — a exclusão em massa é 1 mensagem "N linhas").
- **Por quê não postgres_changes:** exigiria reabrir acesso direto à tabela — incluí-la na publication `supabase_realtime`, criar policy de SELECT para `authenticated` e re-conceder `GRANT SELECT` de tabela — desfazendo o fechamento deliberado da migration 0120/ADR-0108 e criando uma **segunda regra de autorização** divergente do `exigir_acesso` (risco de dessincronizar). O broadcast mantém a tabela sem grant/policy.
- **Autorização do canal privado:** policy em `realtime.messages` que reusa o RBAC — `app.pode_assinar_area(area)` (booleano, checa `ativo` + área via `app.permissoes_de`), com `GRANT` a `authenticated` para a policy poder avaliá-lo. Sem `USING (true)`.
- **Fail-safe:** erro de realtime é engolido no trigger (`EXCEPTION WHEN OTHERS`) — a **escrita nunca quebra**; a verdade auditável é o diário. No cliente, falha de assinatura degrada em silêncio (a página segue). O cliente ignora as **próprias** mudanças (por `usuario_id`).
- **Dependência de checkpoint:** a autorização de canal privado no projeto **hospedado** é um toggle de dashboard/Management API, fora do versionamento.

### 4. Trava otimista via `atualizado_em` (0202)
- **Token de versão = `atualizado_em`** (não uma coluna `versao` nova): a coluna **já existe** (0094) e **já é mantida por trigger** BEFORE UPDATE a cada edição; é a escolha mais aditiva e detecta qualquer alteração posterior. Comparação por instante (timestamptz), exata no round-trip via `::text`.
- O read (`get_gerencial_lancamentos`) expõe o token; os overloads de update/delete/bulk conferem a versão esperada **na cláusula WHERE** (atômico, sem TOCTOU) e distinguem **conflito** de **inexistente**. Token nulo = sem trava (retrocompat). Vale para unitário e lote (bulk recebe um mapa id→versão).

## Consequências
- **Generalizável:** para levar o padrão a outra tabela editável (`gerencial_saldos`, `metas`, …), basta anexar o trigger genérico e (se quiser realtime) um trigger de broadcast + policy de canal reusando `app.pode_assinar_area`. Escopo futuro — o desenho já nasce pronto.
- **Retenção total, sem expurgo** (decisão do Yan). O diário cresce; índices `(tabela_alvo, criado_em desc)` e `(lote_id)` sustentam o painel.
- **Fricção proporcional:** exclusão em massa E restauração em massa exigem confirmação forte (padrão dos uploads); unitária continua leve.
- **Risco assumido:** o trigger de diário é transacional (falha → rollback da escrita). Mantido simples e à prova de falha em runtime para `gerencial_lancamentos`; a auditoria completa (capturar toda mudança) prevalece sobre "nunca falhar".

## Alternativas descartadas
- **`postgres_changes` para o realtime** — reabriria acesso direto à tabela (ver §3).
- **Coluna `versao` inteira** para a trava — exigiria coluna + trigger novos sem ganho prático sobre `atualizado_em` (ver §4).
- **Diário best-effort (engolir erro do INSERT de auditoria)** — deixaria buracos no histórico, derrotando o propósito de recuperação do incidente.
