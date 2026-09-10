# Out-Briefing v5.9.5 — Desfazer em lote robusto a múltiplos toques por linha

**Tipo:** PATCH · **Branch:** `fix/v5-9-5-reverter-diario-multiplos-toques` · **Base:** `main` (v5.9.4, `6e31d35`) ·
**Migration:** `0268` (aditiva, **APLICADA** em 10/09/2026 ~10h34, backup-gate VERDE) · **ADR:** nenhum novo;
**Emenda 1 ao ADR-0168** · **Testes:** 1202 (de 1193) · **Briefing de entrada:** `briefing-v5-9-5-reverter-diario.md`
(commit `57a8348`).

Fechamento em 10/09/2026. Merge humano pendente.

## 1. O que foi entregue

| Missão | Entrega | Estado |
|---|---|---|
| **M1** Reprodução | Script ad hoc (`pg`, `BEGIN … ROLLBACK`, um `SAVEPOINT` por cenário) montou as três cadeias numa tabela do regime e viu a função ATUAL abortar nas três. Seis chamadores enumerados. | ✅ mensagens em §2.1 |
| **M2** Migration | `0268`: `CREATE OR REPLACE` ×3 a partir do **catálogo vivo** — `reverter_diario` (DESC + comparação sem colunas voláteis), `dre_estrutura_salvar` (guard de payload duplicado), `dre_comp_estrutura_salvar` (só a justificativa do guard). `revisor-db` ANTES de aplicar; ensaio da 0268 **dentro** da transação revertida antes do push; prova repetida depois. | ✅ aplicada |
| **M3** Testes permanentes | `src/lib/dre/reverter-diario.test.ts` — 9 casos: U→U, I→U, U→D revertem; conflito real recusado; atomicidade; caminho normal; sonda do catálogo; guard dos dois salvares via REST. Vista **vermelha em 6/9** contra o corpo antigo. | ✅ 1202/1202 |
| **M4** Fechamento | CHANGELOG, CHANGELOG_DIRETORIA, Emenda 1 ao ADR-0168, skill `banco-e-rpc` + checklist `revisor-db` (D-12), WORKING-CONTEXT, version 5.9.5, PR. | ✅ |

## 2. O que a validação e a medição mudaram no caminho

### 2.1 M1 — as três mensagens de conflito, capturadas contra o corpo antigo (transação revertida)

```
lote (txid) = 197522 · corpo vivo: ATUAL (ASC)
C1 U→U  → 'Conflito ao desfazer: a linha 1 foi alterada por outra pessoa depois desta edição. Recarregue e tente de novo.'   ordem 10→12 (nada revertido)
C2 I→U  → 'Conflito ao desfazer: a linha 30 foi alterada por outra pessoa depois desta criação. Recarregue e tente de novo.'  linha continua existindo
C3 U→D  → 'Conflito ao desfazer: a linha 2 não existe mais (foi excluída depois). Recarregue e tente de novo.'                 linha continua inexistente
C4 conflito real → aborta ✔ · C5 atomicidade → aborta, nada revertido ✔ · C6 normal (3 linhas, 1 toque) → ok n=3 ✔
ROLLBACK — resíduo do ensaio: 0
```

Com a 0268 (ensaiada dentro da transação e, depois, aplicada): C1 `ordem 10→10`, C2 linha removida, C3 reinserida com
`ordem 20`/`ENT_H`; C4 segue abortando; C5 aborta **apontando a linha certa** (a 3, a que o terceiro alterou — em ASC
culpava a linha 1) e a linha boa não é revertida; C6 igual.

### 2.2 Briefing dizia 4 chamadores; são 6

`dre_estrutura_desfazer_lote/_linha` (0206), `dre_comp_estrutura_desfazer_lote/_linha` (0260) **e**
`gerencial_desfazer_lote` (0203) / `gerencial_desfazer_linha` (0200). Nenhum ordena o array antes de passar
(`array_agg(id)` sem `ORDER BY`), e `reverter_diario` reordena internamente — nada mudou para eles. Nenhuma
chamada TS direta, nada no seed. REST pós-aplicação: os wrappers da DRE e do Gerencial executam (`Lote de
histórico inexistente.` para id 1).

### 2.3 "Constante única nas três listas" — não: as listas divergem de propósito

O briefing pedia que as três ocorrências da lista de colunas excluídas "falassem a mesma coisa". Elas são
**três e diferentes**: o SET do ramo U exclui `id, criado_em, atualizado_em` (preserva a identidade da linha
viva); o INSERT do ramo D exclui só `atualizado_em` (reinsere `id`/`criado_em` do snapshot). Colapsá-las
mudaria a semântica da reversão. O que as três têm em comum é `atualizado_em`, e é **só isso** que a
constante `c_volateis` nomeia — usada na comparação de conflito dos ramos I e U. O header da 0268 explica a
divergência; o `revisor-db` conferiu que as listas de SET/INSERT ficaram byte a byte.

### 2.4 "Corrigir o comentário da 0260" — sem editar a 0260

Migration aplicada é registro imutável. O comentário do guard vive no **corpo da função**, no catálogo; a
correção real é o `CREATE OR REPLACE` de `dre_comp_estrutura_salvar` na 0268, com a justificativa nova
(payload ambíguo) e a mensagem sem o sufixo "— isso quebraria o desfazer". O arquivo `0260` não foi tocado.

### 2.5 Ordem e coluna volátil: por que DESC sozinho não bastava (visto no ensaio, não no papel)

A skill previa a camada (a) — ordem. A camada (b) — `atualizado_em` avançando pelo BEFORE trigger
`fn_dre_touch_atualizado_em` no primeiro passo e acusando conflito no segundo — só apareceu ao ensaiar o
corpo com DESC em transação revertida. É o argumento definitivo pelo invariante 5 do briefing ("ver o
defeito antes de corrigir"): sem o ensaio, a 0268 teria ido para produção corrigindo metade.

### 2.6 O teste permanente escreve-e-reverte contra produção

`reverter-diario.test.ts` é o primeiro teste da suíte que faz `UPDATE`/`INSERT`/`DELETE` reais (dentro de
`BEGIN … ROLLBACK`) a cada `npm test`. Precedente parcial: `rpc-contrato.test.ts` envia lote vazio. Escolha
consciente: o comportamento que a versão corrige só existe **escrevendo**; um teste que só lê o catálogo
(também incluído, como sonda) não veria a camada (b). Mitigações: `describe.skipIf(!SUPABASE_DB_URL)`;
linhas escolhidas dinamicamente (não ids fixos); chave sintética `ZZ_TESTE_0268` no bloco; cada caso abre e
descarta a própria transação; conexão pelo pooler em **session mode** (o mesmo do backup-gate). Se a conexão
cair no meio, o Postgres descarta a transação com a sessão — sem resíduo. **Item do checkpoint do Yan.**

### 2.7 Passo 1 do `/nova-versao` (pull na raiz) — barrado pelo harness

A guarda de worktree recusa `git -C <raiz>`. A raiz já estava em `6e31d35 = origin/main`, então não havia
nada a puxar; o briefing untracked idêntico segue na raiz. Registrado sem contorno (protocolo D5).

## 3. Migrations e ADRs

- **`0268_reverter_diario_desc_e_guard_caixa.sql`** — aditiva (três `CREATE OR REPLACE` com a mesma
  assinatura; REVOKE/GRANT redeclarados como hoje; `NOTIFY pgrst`). **APLICADA** 10/09 ~10h34, backup-gate
  VERDE (58 tabelas, restore-test 3/3: `fato_venda` 29106, `dim_operacao_weddings` 238, `rbac_usuarios` 37).
  Única pendente local e remota no ato; nenhuma worktree irmã acima de 0267.
- **Emenda 1 ao ADR-0168** — a `0251` deixa de ser irrevertível por limitação técnica e **não deve ser
  revertida** (estrutura viva, alimenta a DRE por competência, comunicada à liderança desde 19/08); reverter
  seria decisão de produto nova, com briefing próprio.
- Próxima migration livre **0269**; próximo ADR livre **0173**.

## 4. Arquivos (por commit)

1. `57a8348 docs(v5-9-5): briefing da versão` — `docs/briefings/briefing-v5-9-5-reverter-diario.md`
2. `5cc1e9f test(db): reproduz o aborto…` — `src/lib/dre/reverter-diario.test.ts` (novo)
3. `eda8e2f fix(db): reverter_diario processa DESC…; guard…` — `supabase/migrations/0268_…sql` (novo)
4. `chore(release): v5.9.5` — `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`,
   `docs/adr/0168-…md` (Emenda 1), `.claude/skills/banco-e-rpc/SKILL.md`, `.claude/agents/revisor-db.md`,
   `docs/WORKING-CONTEXT.md`, este out-briefing.

Scripts temporários (fora do repo, `$CLAUDE_JOB_DIR/tmp`): `prova-0268.mjs` (com `--com-0268` aplica a
migration dentro da transação revertida), `rest-0268.mjs`.

## 5. Parecer da revisão

**`revisor-db` (0268, antes de aplicar) — APROVADA, sem CRÍTICO/ALTO.**
- BAIXO: faltava `NOTIFY pgrst, 'reload schema'` no fim (convenção das 0206/0208/0260) → **atendido**.
- BAIXO/registro: a lição da skill `banco-e-rpc` descrevia o defeito como vigente → **reescrita** (§6).
- Conferido e OK: diff linha a linha contra 0206/0208/0260 (únicas definições vivas de cada função); `jsonb -
  text[]` sem armadilha de NULL (o `IF v_atual IS NULL` filtra antes; `dados_depois` nunca é NULL em I/U;
  chave ausente é ignorada — vale para `patrimonio.movimentacao`, sem `atualizado_em`); `atualizado_por` de
  `patrimonio.ativo` continua DENTRO da comparação (não é volátil; não há touch trigger lá); trava otimista
  dos salvares intocada; DESC indiferente aos 6 chamadores; guard antes do lock e da trava; caso existente com
  `p_maps: []` não afetado; RBAC/ACLs idênticas; classificação aditiva correta.

**`revisor` (M2 + M3) — APROVADO COM RESSALVAS, sem CRÍTICO/ALTO.**
- MÉDIO: `tresLinhas()` pega sempre as mesmas 3 linhas e várias `it`s as tocam em transações abertas; dois
  `npm test` **concorrentes** (duas worktrees, mesmo banco) disputariam lock de linha e o teste **travaria**
  até o timeout do runner em vez de falhar rápido. O revisor sugeriu só registrar (o projeto serializa
  gates numa sessão); a mitigação era barata e ficou **dentro do arquivo**: `SET LOCAL lock_timeout = '5s'`
  na transação de cada caso → falha rápida e legível. Suíte reexecutada verde após a correção.
- Conferido e OK: nenhum `catch` engolindo erro (o `SAVEPOINT`/`ROLLBACK TO` captura o erro real da RPC);
  `SUPABASE_DB_URL` do projeto é o pooler em **session mode** (ADR-0119, `scripts/db-gate/lib.mjs`) — o
  cenário "transaction mode" não se aplica; queda de conexão aborta a transação junto com a sessão, sem
  resíduo; `tresLinhas` falha alto se a base tiver menos de 3 mapeadas; 6 chamadores confirmados por grep
  (a menção na `0254` é só comentário); convenções (pt-BR, tipagem, sem `console.log`, `skipIf` nos dois
  blocos); migration cobre exatamente as 3 mudanças do briefing, nada além.

## 6. Aprendizado — régua de 5 destinos

1. **Enforcement mecânico:** o teste `reverter-diario.test.ts` é o enforcement — reprova regressão de ordem,
   de comparação e a `CREATE OR REPLACE` escrita da migration de origem.
2. **Deletar:** a lição "pressupõe UM toque por linha" saiu da skill (não descreve mais a realidade).
3. **Core:** nada — não é transversal a toda sessão.
4. **Skill `banco-e-rpc`:** a lição virou a classe **"coluna VOLÁTIL numa checagem de conflito"**: compare
   sem o que a própria operação altera, e só isso; veja o guard reprovar antes de corrigir (foi isso que
   expôs a camada (b)); trocar a ordem de um loop que compara contra snapshot é mudança de semântica —
   enumere quem passa array. **Checklist inline do `revisor-db` atualizado em par (D-12).**
5. **Ritual:** observação operacional (não vira regra): a guarda de worktree também barra `source .env.local`
   dentro de comando composto e `git -C <raiz>` — o caminho é script `node` em `$CLAUDE_JOB_DIR/tmp` e
   aceitar que o passo 1 do `/nova-versao` seja verificado por leitura, não por pull.

## 7. Pendências

- 🔴 **Yan — checkpoint do briefing:** ler a Emenda 1 do ADR-0168; conferir o parecer do `revisor-db` sobre a
  comparação sem coluna volátil (§5); confirmar a decisão de **portar** o guard ao caixa em vez de removê-lo
  da competência; aceitar o teste que escreve-e-reverte contra produção a cada `npm test` (§2.6).
- 🔴 **Yan — pós-merge:** um desfazer real pela UI de cada editor (caixa e competência; lote de 2–3 linhas)
  para provar que o caminho normal não regrediu; e um no Gerencial, que também passa por `reverter_diario`.
- ⚠️ O PR de docs do pós-merge da v5.9.4 (`docs/pos-merge-v5-9-4`) e este PR editam `docs/WORKING-CONTEXT.md`
  e `src/data/changelog-diretoria.ts` — mergear um e reconciliar o outro.
- Fora do escopo, registrado: `patrimonio.ativo`/`patrimonio.movimentacao` estão sob o diário mas não têm
  wrapper `desfazer_lote/_linha` (nenhum caminho de UI desfaz patrimônio hoje).

## 8. Fronteira (fica fora)

`fn_diario_alteracoes` intocado (gravar a linha inteira é o desenho); o lote `132178` **não** foi revertido e
não deve ser; os dois editores de estrutura seguem separados (ADR-0170); nenhuma UI de histórico/desfazer
mudou; `harness-base` (outro repositório).
