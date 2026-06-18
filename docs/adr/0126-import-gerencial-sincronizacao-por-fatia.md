# ADR-0126 — Importação do Fluxo de Caixa Gerencial: sincronização por fatia do originador

**Data:** 2026-06-18 · **Versão:** 4.23.0 (MINOR) · **Status:** aceito

## Contexto

A importação da planilha de curadoria do Fluxo de Caixa Gerencial era uma **sincronização
global** contra TODAS as linhas `origem='planilha'` de `analytics.gerencial_lancamentos`:
`computeImportDiff` comparava a planilha do importador contra o conjunto inteiro e
`batch_gerencial_import` fazia `DELETE ... AND origem='planilha'` de toda linha de planilha
**ausente** da planilha enviada. As linhas manuais (`origem='manual'`) eram preservadas.

Com **mais de um importador** (cada gestor cuida da sua parte da planilha), isso causava
**deleção mútua**: ao importar, A removia as linhas de planilha de B (que não estavam na
planilha de A) e vice-versa. Não havia como saber de quem era cada linha — não existia coluna
de autoria. O modelo "uma planilha = a verdade de toda a base de planilha" não cabe num mundo
multi-importador.

## Decisão

Cada importação passa a sincronizar **apenas a fatia do próprio importador**: o conjunto de
linhas `origem='planilha'` cujo **originador é ele**. A fatia do colega nunca entra no cálculo
e nunca é tocada.

1. **Autoria (migration 0154, aditiva):** `analytics.gerencial_lancamentos` ganha
   `originador_id UUID` + `originador_nome TEXT` (backfill NULL). `batch_gerencial_import` e
   `create_gerencial_lancamento` carimbam o usuário da sessão (`requireAreaApi`/`requireAreaAction`
   → `Sessao.userId`/`nome`). Mudança de assinatura ⇒ `DROP`+`CREATE` (CREATE OR REPLACE não
   adiciona parâmetro — criaria overload). Os corpos ficam na migration (reversível).

2. **Diff por fatia, POR CONTAGEM (`computeDiffPorFatia`, puro/testável):** sincroniza
   `planilha × fatia` por **multiset** (contagem de linhas idênticas), não por presença.
   Identidade = **6 campos normalizados** (tipo, pessoa, valor 2 casas, vencimento, descrição,
   conta — `normalizarChaveConta` para trim/caixa/acento). Chave **lógica de 4 campos**
   (tipo, pessoa, valor, vencimento) pareia leftovers para **preservar o id** numa correção de
   descrição/conta (`aAtualizar`, não remove+adiciona). Toggle **"Manter duplicadas"** colapsa
   (OFF) ou mantém (ON) idênticas dentro da própria planilha.

3. **Dupla barreira de isolamento:**
   - **Rota (JS):** filtra a fatia por `a.originador_id === sessao.userId` antes do diff — a
     linha do colega **nunca entra** em `computeDiffPorFatia`.
   - **Banco (backstop):** o `DELETE`/`UPDATE` do `batch_gerencial_import` exige
     `AND origem='planilha' AND originador_id = p_originador_id`. Mesmo que um id estranho chegue,
     a linha de outro originador (ou a antiga sem originador, `NULL = uuid` → falso) **não é tocada**.
   - O commit **recomputa o diff no servidor** (não confia no diff do cliente); os únicos inputs
     do cliente são o arquivo, `manterDuplicadas` e `protegidos[]` (que só **subtrai** remoções).

4. **Linhas antigas sem originador (NULL):** não pertencem à fatia de ninguém → nunca entram em
   nenhum cálculo de remoção → nunca são auto-removidas. Custo de transição aceito (briefing):
   convergem quando o dono reimporta carimbando-as.

## Alternativas consideradas

- **Manter sincronização global + "dono da planilha":** um único responsável importa tudo.
  **Rejeitada** — o fluxo real é multi-importador (cada gestor cuida da sua parte); concentrar
  recriaria o gargalo e não resolve a deleção.
- **Isolamento só na rota (sem guard no banco):** **Rejeitada** — defesa em profundidade; a RPC
  é a fronteira real de escrita, o guard `originador_id = eu` é o backstop que torna o invariante
  verdadeiro mesmo diante de bug/abuso na camada de cima.
- **Identidade só pela chave lógica de 4 campos (sem os 6):** **Rejeitada** — não distinguiria
  duas linhas iguais em tudo menos descrição (perderia a noção de "linha idêntica" e a dedup).
- **Dedup permanente (sempre colapsar):** **Rejeitada** — há duplicatas reais legítimas; daí o
  toggle, que separa "ruído de planilha" de "duas cobranças iguais de verdade".

## Consequências

- **Invariante central:** importar como A nunca adiciona/altera/remove linha de outro originador.
  Provado com **teste vivo de duas fatias** (B byte-idêntico mesmo com os ids de B injetados
  adversarialmente em remover **e** atualizar; `removidos`/`atualizados` contam só os de A).
- **Agregada intocada:** a projeção (3 cenários sobre saldo inicial) e o cálculo do fluxo não
  mudam — a versão mexe só na ingestão.
- A auto-auditoria endureceu o núcleo: chave de centavos consistente (arredonda antes de formatar,
  evita colisão/divisão por `toFixed`), `tipo` normalizado na chave lógica, contagem honesta de
  `atualizados` via `GET DIAGNOSTICS` (não infla quando o guard exclui a linha).
- `originador_nome` é **denormalizado** (rótulo de exibição). O isolamento usa `originador_id`
  (uuid imutável de `auth.uid()`), nunca o nome — renome de usuário não afeta autorização.
