# Out-briefing — v6.0.1 · Seeds no caminho único de ingestão + destrutiva do legado (GATE 3)

Rota B (técnica). Spec aprovada: `docs/briefings/spec-v6-0-1-seeds-e-destrutiva.md` (e12722a).
Branch `fix/v6-0-1-destrutiva`. Fechamento em 28/09/2026.

## 1. Resumo em linguagem clara

A v6.0.0 trocou a carga das cinco bases por um caminho único e conferido (cru → staging → promoção
com checksum). O caminho antigo ficou no banco porque ainda tinha **um** consumidor: o `npm run
seed`, que roda na máquina do Yan. Esta versão fez duas coisas, nesta ordem (decisão do Yan,
28/09: "migrar os seeds primeiro"):

1. **O seed virou cliente do contrato de ingestão** — sobe os mesmos crus que o card sobe e passa
   pela mesma `processarCarga`. Por padrão só **confere** (nada muda no banco); `--aplicar` substitui
   as bases de produção.
2. **A destrutiva 0286 apagou o legado** — 12 funções e a tabela `audit.ingestao_log` —, aplicada
   pelo Yan em TTY. Nada que a aplicação usa foi tocado.

Para a diretoria: manutenção interna, nenhuma mudança visível.

## 2. Missões

| Missão | Commit | O quê |
|---|---|---|
| M0 — spike | (fora do repo) | `processarCarga` roda fora do Next com um preload que neutraliza só `server-only`; conferência real do Demonstrativo de 28/09 (3.342 linhas, 557/557 checksums, diff 0, cru removido). `next/navigation` não quebrou — a refatoração de núcleo prevista como plano B não foi necessária |
| M1 — seed | 0811644 | `supabase/seed/seed.ts` reescrito; preload `sem-server-only.cjs`; saem `seed-fluxo-caixa.ts`, `parse-excel.ts`, `src/lib/carga/lancamentos.ts` |
| M3 — testes | b04baff | a suíte deixa de exigir o legado, passando antes E depois do DROP |
| M2 — 0286 | f011b78 | destrutiva em `supabase/patches/` + rollback do catálogo vivo |
| docs | f34d822, c0f4749 | skills, backlog, estado-do-projeto, WORKING-CONTEXT; fixtures do oráculo recompostas |
| pós-aplicação | e338111 | 0286 movida para `migrations/`, `database.ts` + baseline regenerados, sonda limpa |
| fechamento | (este) | CHANGELOG, changelog da diretoria, bump 6.0.1, aprendizados, out-briefing |

## 3. Migration 0286 (DESTRUTIVA) — aplicada pelo Yan em TTY, 28/09

Apagou: `truncar_demonstrativo_competencia()`, `truncar_lancamentos()`,
`truncar_lancamentos_movimentacao()`, `truncar_titulos_em_aberto()`,
`inserir_lote_demonstrativo_competencia(jsonb)`, `inserir_lote_lancamentos(jsonb)`,
`inserir_lote_lancamentos_movimentacao(jsonb)`, `inserir_lote_titulos_em_aberto(jsonb)`,
`inserir_lote_raw(jsonb)`, `promover_carga_vendas()` (só a zero-arg), `truncate_dynamic_tables()`,
`registrar_ingestao_log(text, text, integer, text)` e `audit.ingestao_log` (10 linhas de log do seed
antigo; o schema `audit` fica vazio).

**Provas antes (invariante 8):**
- Cada DROP cita o commit que tirou a última referência: 029b0a5 e 7fb7097 (card, v6.0.0) e 0811644
  (seed). Grep no HEAD sobre `src supabase/seed scripts`: só comentários, chaves string da sonda e o
  espelho gerado `database.ts` — o formato da saída está no header da migration.
- Recontagem no catálogo vivo (corpo de função, policy, trigger, check, view, `cron.job`,
  `pg_depend`): nenhum alvo referenciado fora do próprio conjunto.
- Guard de efetividade por **assinatura** (`to_regprocedure`): 12 têm de sumir, 26 do caminho vivo
  (5 bases + Fluxo de Caixa + Pessoas) têm de ficar. As 38 assinaturas resolvidas no catálogo antes
  — nenhuma nula. Cinto: aborta se `audit.ingestao_log` não tiver exatamente as 10 linhas provadas.
- **Ensaio em transação revertida** contra produção: corpo inteiro sem RAISE, 0/12 alvos dentro da
  tx; depois do `ROLLBACK`, 12/12 e as 10 linhas de volta.
- Rollback: `supabase/patches/0286-rollback-corpos-vivos.sql` (`pg_get_functiondef` do catálogo vivo,
  GRANT/REVOKE lidos no ato, o COMMENT da única função que tinha, tabela + sequence + ACLs + linhas).

**Provas depois:**
- `migration list`: 0286 local = remote; o arquivo movido é byte a byte o revisado.
- Catálogo: 12/12 alvos e a tabela ausentes; 26/26 do caminho vivo presentes.
- REST com service_role (só depois de o catálogo confirmar a ausência — chamar `truncar_*` vivo por
  REST foi o incidente de 10/09): os 12 alvos → **404 PGRST202**; `get_upload_status` e as três
  `status_*` → **200**.
- `database.ts` regenerado: diff = exatamente as 12 funções. Baseline regenerado: diff = as 12
  funções, a tabela, `ultima_migration` 0286 e a allowlist do `ingestor` sem a zero-arg (20
  assinaturas). `derivar-allowlist.mjs ingestor` a partir do código: as mesmas 20.

**Por que aplicar antes do merge cumpriu o GATE 3:** nenhum código deployado chamava o legado desde
a v6.0.0; o único consumidor era o seed, que não sobe para a Vercel e saiu nesta versão.
Consequência aceita: até o merge, o `main` ainda tem testes esperando funções que saíram.

## 4. Números da conferência do seed (28/09, contra produção, arquivos = cargas aplicadas no dia)

| Base | Status | Checksums | Diff |
|---|---|---|---|
| Vendas (3 arquivos) | conferida | 12 / 0 falhos | 0 linhas |
| Movimentação | conferida | 149 / 0 | 0 |
| Aberto | conferida | 97 / 0 | 0 |
| Operação | conferida | 1 / 0 · 0 datas fora da faixa | 0 |
| Demonstrativo | conferida | 557 / 0 | 0 linhas, R$ 0,00 |

Foto de `ingestao.carga` (por status), das contagens das cinco bases e do bucket `ingestao-cru`:
**idêntica antes e depois** — nada aplicado, nenhum cru sobrou. (A spec previa 96 checksums no
Aberto; era o número dos arquivos de 21/09. Os de 28/09 têm 97.)

## 5. Divergências spec×repo e achados em voo

- **O seed da 1ª versão tinha `confirmar: !aplicar`** — o default "conferência" APLICARIA em
  produção. Pego na leitura do orquestrador antes de qualquer execução. Correção + trava:
  `assertirModoConferencia` torna fatal (interrompe o seed, preserva o cru como prova) um status
  diferente de `conferida` sem `--aplicar`.
- **A sonda de `raw.vendas_excel` ficaria vermelha antes do DROP** se as 3 chaves do legado saíssem
  junto dos outros testes (objeto vivo fora de lista fechada reprova). Ficaram até a aplicação e
  saíram em e338111.
- **O grafo roda também em conferência** (Operação exige Aberto APLICADO no dia em produção). O seed
  avisa; não é defeito, é o contrato.
- O preload `.cjs` usava `require()` e o lint reprovou — reescrito com `module.constructor`, sem
  exceção de lint.
- `load-metas.ts` ficou sem importador (o seed importa `loadMetas` direto). Não apagado — regra da
  spec: órfão novo é reportado.
- O header da 0286 afirmava que a promoção `(jsonb, uuid)` chama `validar_carga_staging`; não chama
  (é a rota, por RPC). Corrigido antes da revisão.

## 6. Parecer da revisão

**`revisor-db` (0286) — APROVADA COM RESSALVAS.** Nenhum CRÍTICO. Dois ALTOs, ambos de documentação
que contradizia a migration: `WORKING-CONTEXT` item 6 ("`truncate_dynamic_tables` fica fora") e a
skill `ingestao-planilhas` §5 ("permanecem porque o seed as usa") — **corrigidos** (f34d822). BAIXO:
o rollback não trazia COMMENT — **corrigido** (só `promover_carga_vendas()` tinha). BAIXO: mensagens
de RAISE sem acento — **registrado**, cosmético (padrão herdado da 0270). Verificado sem achado:
DROP sem CASCADE, sequence `OWNED BY`, sobrecarga distinta, contrapeso contra `rpcs-ingestor.ts`,
consumidores fora do app, numeração 0286 livre, roteiro de aplicação.

**`revisor` (seed + testes) — APROVADO COM RESSALVAS.** Nenhum CRÍTICO/ALTO. MÉDIOs:
`estado-do-projeto.md` §9 descrevia o seed antigo — **corrigido**; `load-metas.ts` órfão —
**registrado** (§8); o preload `.cjs` invisível ao knip — **endereçado** em `knip.json`; a prova
negativa do `ingestor` sobre os `truncar_*` saiu do teste (não se prova falta de privilégio em função
que vai sumir) — **registrado**: a janela fechou com a 0286 aplicada e o baseline passou a vigiar a
allowlist exata. BAIXO: em `--aplicar`, falha de upload no meio de Vendas deixa cru sem linha de
carga no bucket — **registrado** (mesmo comportamento do card; a retenção cobre órfãos após 7 dias
quando ligada).

Auto-auditoria depois das correções: a correção do `confirmar` foi reexercitada pela conferência
real (§4) com a foto do banco antes/depois.

## 7. Gates

- `tsc`, `lint`, `build`: verdes (antes e depois do DROP).
- `npm test` depois do DROP: **1.633 verdes, 6 skipped**, 1 arquivo falha —
  `oraculo-demonstrativo.test.ts`, ENOENT na fixture `demonstrativo-cru.xlsx` (§8). Nenhum arquivo
  que o oráculo exercita foi tocado nesta versão.
- Antes do DROP, os 4 arquivos de teste alterados rodaram contra o banco: 198 verdes.
- Sem UI → sem conferência visual.

## 8. Pendências e registros

**Do Yan:**
- **Fixture perdida: `demonstrativo-cru.xlsx` de 21/09.** `tests/fixtures/ingestao/` é gitignorado e
  só existia na worktree da v6.0.0, removida no pós-merge. A sessão recompôs 11 das 13 (crus do bucket
  `ingestao-cru` — cargas da M9 — e tratados das pastas do Windows, todos com sha256 do manifesto).
  Faltam o Demonstrativo cru (sobrescrito no Windows, nunca carregado pelo card) e a
  `Lista de Operações.csv` (6 casos skipped). Achar o anexo de 21/09, ou decidir trocar o manifesto
  do Demonstrativo para o export de 28/09.
- **Não verificado:** o caminho `--aplicar` do seed nunca rodou ponta a ponta. A 1ª execução real é
  do Yan, num dia em que substituir as bases seja a intenção; ela dispara os alarmes de carga.
- Custo do advisor desta versão (`/usage`).

**Registros técnicos (backlog):**
- O `describe.skipIf(AUSENTES…)` dos oráculos não protege: o corpo do `describe` lê a fixture na
  coleta e o arquivo quebra com ENOENT em vez de pular.
- `npx knip` não roda: o `knip@6` recusa as chaves `"//"` de comentário do `knip.json`
  (pré-existente).
- O COMMENT de `promover_carga_vendas(jsonb, uuid)` ainda diz que a zero-arg "fica intocada e vira
  órfã até o GATE 3" — desatualizado; troca é aditiva.
- `supabase/seed/load-metas.ts` sem importador.
- Mensagens de RAISE da 0286 sem acento.

## 9. Aprendizados (régua de 5 destinos)

- **Guard de destrutiva por assinatura, com as assinaturas provadas antes** — `to_regprocedure` dá
  NULL para "não existe" E para erro de digitação, então um alvo mal escrito passa o guard dos dois
  lados. → skill `banco-e-rpc` §1 **e** checklist do `revisor-db` (D-12).
- **Chave de allowlist/sonda do objeto que sai só sai DEPOIS do DROP.** → skill `banco-e-rpc` §1.
- **Estado gitignorado não-derivável morre com a worktree** (a fixture do oráculo). → ritual
  `pos-merge` §2: `status --ignored` e salvar fora do repo antes de remover.
- **Booleano de modo invertido em script que aponta para produção** (`confirmar: !aplicar`): não há
  lint que pegue; a defesa ficou no próprio script (assert de resultado, fatal). Destino 2 — coberto
  pela trava; registrado aqui como precedente.

## Advisor

| Agente | Consultas | Mudaram o rumo |
|---|---|---|
| Orquestrador | 2 | 2 — (1) antes do ensaio: validar as 38 assinaturas (guard cego a NULL), ensaio em tx revertida, grants reais do `ingestor`, afirmação falsa do header; (2) antes do handoff: `migration list` da worktree, o teste de COMMENT depois do DROP (conferido: a `(jsonb, uuid)` tem comentário próprio, passa), e recuperar as fixtures do bucket (11/13 voltaram) |
| implementador M1 (seed) | 3 | 1 — trocou "stub vazio" por "reportar os caminhos para `git rm`"; trouxe a ordem literal + assert contra o grafo |
| implementador M3 (testes) | 0 | — |
| implementador docs | 1 | 1 — dois trechos factualmente falsos na `banco-e-rpc` que o grep por nome não achava (fuso do seed, `dim_data`) |
| revisor / revisor-db | 0 | — |

Custo: pendência do Yan (`/usage`).
