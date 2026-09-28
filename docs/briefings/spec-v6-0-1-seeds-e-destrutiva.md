# v6.0.1 — Seeds no caminho único de ingestão + destrutiva do legado (GATE 3)

## Context

A v6.0.0 (PR #279, em produção desde 28/09) trocou a ingestão das cinco bases para o caminho único:
rota `/api/ingestao/{base}` → parser do cru no servidor → staging → `promover_carga_*` atômica com
checksum do arquivo, pela credencial `ingestor`, com log em `ingestao.carga`. A destrutiva do GATE 3
(apagar o caminho legado `truncar_*`/`inserir_lote_*`) foi adiada para cá porque exige que nada vivo
chame o legado.

O mapa de consumidores (catálogo vivo + código, 28/09) mostrou: **nenhum código de produção chama o
legado** — mas **os dois seeds chamam quase tudo**:
- `npm run seed` (`supabase/seed/seed.ts`): `truncate_dynamic_tables` → `inserir_lote_raw` (Vendas
  TRATADO via `parse-excel.ts`) → `loadMetas` → `transform_raw_to_analytics` → `carregarLancamentos`
  (`src/lib/carga/lancamentos.ts`: `truncar_lancamentos` + `inserir_lote_lancamentos`) →
  `refresh_all_materialized_views` → `registrar_ingestao_log` (escreve `audit.ingestao_log`).
- `supabase/seed/seed-fluxo-caixa.ts` (manual, `npx tsx`): `truncar_*`/`inserir_lote_*` de
  Movimentação e Aberto (TRATADOS) → `regenerar_fluxo_caixa`.

**Decisão do Yan (28/09): migrar os seeds primeiro, depois apagar o legado inteiro.** A promoção nova
exige os checksums do arquivo CRU, então o seed passa a carregar os crus — pelo mesmo contrato do
card e da futura RPA.

## Abordagem

### M0 — Spike (antes de reescrever qualquer coisa)

Provar que `processarCarga` roda fora do Next: `tsx --require <preload que neutraliza server-only>`
importando `src/lib/ingestao/carga.ts` e rodando uma conferência (`confirmar:false`) de uma base com a
fixture. O caminho `carga.ts → auth/sessao.ts → next/navigation` já falhou na M7 sob
`--conditions=react-server`; sem a condição ninguém provou. **Se `next/navigation` quebrar**, a saída
é extrair de `processarCarga` a parte pós-autenticação (passos 3–10) num módulo sem dependência de
Next, compartilhado pela rota e pelo seed — refatoração pequena do núcleo, que eu reporto antes de
fazer (muda o "sem tocar no núcleo" deste plano).

### M1 — Seed como cliente do contrato (sem tocar no núcleo da ingestão)

`supabase/seed/seed.ts` reescrito para, em cada base presente num diretório (default
`supabase/seed/data/`; `--dir <pasta>`, ex. `tests/fixtures/ingestao`), fazer exatamente o que o card
faz: sha256 → `caminhoCru` + `urlAssinadaDeUpload` (`src/lib/ingestao/storage.ts`) → `PUT` no bucket →
`processarCarga` (`src/lib/ingestao/carga.ts`) com `origem: 'manual'`, na **ordem do grafo**
(`src/lib/ingestao/grafo.ts`): Vendas → Movimentação → Aberto → Operação (mesmo dia do Aberto, 409
senão) → Demonstrativo. Metas (`loadMetas`) continua como hoje.
- Arquivos reconhecidos pelos **nomes canônicos do manifesto** (`scripts/ingestao/fixtures-manifest.json`:
  `vendas-cru-*.xlsx`, `movimentacao-cru.xlsx`, `aberto-cru.xlsx`, `operacao-cru.csv`,
  `demonstrativo-cru.xlsx`); base ausente = pulada com aviso.
- **Default = conferência** (`confirmar: false`: parse + checksums + diff, NADA aplicado); aplicar
  exige `--aplicar`. O seed de hoje zera e recarrega produção sem perguntar — o novo não faz isso por
  engano (não há staging; o seed aponta para produção). Cabeçalho do arquivo e `--help` dizem em
  destaque: **`--aplicar` SUBSTITUI a base de produção pelos arquivos do diretório** — com as fixtures
  de 21/09 isso regrediria as bases, que hoje são de 28/09.
- **Conferência não deixa lixo:** ao final de uma conferência o seed remove os crus que subiu
  (`removerCru`, `storage.ts`) — a conferência não abre linha de carga, e o cron de retenção que
  recolheria os órfãos está desligado até o Yan decidir.
- Identidade: `usuarioId` = o usuário de máquina `ingestor@janus.interno`, `chaveId` null (a
  credencial que aplica já é o `ingestor`; a linha de carga fica honesta sobre quem foi).
- `server-only`: o seed roda fora do Next; um preload CommonJS mínimo (`supabase/seed/sem-server-only.cjs`)
  neutraliza só esse pacote no `require` (o `tsx` compila para CJS). `npm run seed` ganha o `--require`.
- `seed-fluxo-caixa.ts` deixa de existir: Movimentação e Aberto passam a ser bases do seed único
  (entrada dele sai de `knip.json`).
- **Deleções de código (para aprovar junto):** `supabase/seed/seed-fluxo-caixa.ts`,
  `supabase/seed/parse-excel.ts` (só o seed usa) e a função `carregarLancamentos` de
  `src/lib/carga/lancamentos.ts` (só o seed usa; o tipo que `parse-lancamentos.ts` importa dali muda
  de arquivo). **`src/lib/carga/parse-lancamentos.ts` FICA** — o card de uploads usa
  `LANCAMENTOS_COLUNAS` (a linha "Colunas obrigatórias" da tela). Qualquer outro órfão que aparecer no
  ato é reportado, não apagado.

### M2 — Destrutiva `0286` (GATE 3)

Escrita em `supabase/patches/` e só movida para `supabase/migrations/` na hora de o Yan aplicar
(`db push` empurra todo o pendente). Cada DROP cita o commit que removeu a última referência e a prova
(invariante 8):
- `truncar_demonstrativo_competencia()`, `truncar_lancamentos()`, `truncar_lancamentos_movimentacao()`,
  `truncar_titulos_em_aberto()`;
- `inserir_lote_demonstrativo_competencia(jsonb)`, `inserir_lote_lancamentos(jsonb)`,
  `inserir_lote_lancamentos_movimentacao(jsonb)`, `inserir_lote_titulos_em_aberto(jsonb)`,
  `inserir_lote_raw(jsonb)`;
- `promover_carga_vendas()` (a sem argumentos; a `(jsonb, uuid)` fica);
- `truncate_dynamic_tables()` (só zera as tabelas de Vendas, o que a promoção nova já faz);
- `registrar_ingestao_log(text, text, integer, text)` e `audit.ingestao_log` (10 linhas de seed, sem
  FK, sem trigger, único escritor é o seed; o log vivo é `ingestao.carga`). O schema `audit` fica
  vazio, não é apagado.

**Fica, de propósito:** todo o caminho novo (`limpar_staging_*`, `inserir_lote_staging*`,
`validar_carga_*`, `promover_carga_*(jsonb, uuid)`, `transform_raw_to_analytics`,
`regenerar_fluxo_caixa`) e o de **Pessoas** (fora do contrato, decisão 11).

Antes de escrever: dump do corpo vivo de cada objeto (o rollback é recriá-los a partir dele) e
`pg_depend`/prosrc/cron de novo no ato. `revisor-db` antes. Aplicação: **Yan, em TTY**,
`npm run db:migrate -- --destrutiva` (backup-gate 79/79 + restore-test).

**Por que aplicar ANTES do merge ainda cumpre o GATE 3** (vai no header da 0286): o GATE 3 exige que
o código que referencia cada objeto já tenha saído de produção. Desde a v6.0.0 (deployada em 28/09)
nenhum código deployado chama o legado — o único consumidor são os seeds, que rodam na máquina do Yan
e não sobem para a Vercel, e eles saem nesta mesma versão. **Consequência aceita (frente única):**
entre o DROP e o merge, o `main` ainda tem `rpc-contrato.test.ts`/`credencial-ingestor.test.ts`
esperando as funções — o `npm test` com banco de qualquer outra sessão no `main` fica vermelho nesse
intervalo.

### M3 — Testes, tipos, docs

- Testes que conferem existência do legado: `src/lib/rpc-contrato.test.ts` (listas em ~716–721 e
  ~925–928), `src/lib/ingestao/credencial-ingestor.test.ts` (~58–62, ~75), sonda
  `src/lib/ingestao/sonda-leitores-vendas-excel.test.ts` (entradas de `inserir_lote_raw`,
  `truncate_dynamic_tables`, `promover_carga_vendas()`) — as entradas saem; nenhum passa a exigir
  ausência antes da hora (os testes passam antes E depois do DROP).
- Depois da aplicação: `npx supabase gen types typescript --linked > src/types/database.ts` e
  `npm run db:baseline` (ambos commitados).
- Skills `ingestao-planilhas` (§5 seed) e `banco-e-rpc`; `docs/backlog-v6.md` (B-31 feito);
  WORKING-CONTEXT; out-briefing v6.0.1; `CHANGELOG.md`; changelog da diretoria (linha genérica
  honesta); bump `6.0.1`.

## Arquivos

- Reescrito: `supabase/seed/seed.ts`, `package.json` (script `seed`).
- Novo: `supabase/seed/sem-server-only.cjs`, `supabase/patches/0286_*.sql` (→ `supabase/migrations/`).
- Removidos: `supabase/seed/seed-fluxo-caixa.ts`, `supabase/seed/parse-excel.ts`, a função
  `carregarLancamentos` (`src/lib/carga/lancamentos.ts` sai se nada mais ficar nele).
  `parse-lancamentos.ts` fica (o card usa).
- Ajustados: os três testes acima, `knip.json`, skills, docs.
- Reuso: `processarCarga`, `caminhoCru`, `urlAssinadaDeUpload`, `sha256Hex`, `ORDEM`/arestas de `grafo.ts`,
  `loadMetas` (`src/lib/carga/metas.ts`).

## Verificação

1. `npm run seed -- --dir tests/fixtures/ingestao` (conferência, contra produção). Critério por base
   = **checksums conferindo e nada aplicado**; o diff só informa (a produção hoje é das cargas de
   28/09, não de 21/09):
   - Vendas: 12 checksums; Movimentação: 149; Aberto: 96; Demonstrativo: 557 (diff ≠ 0 é o esperado —
     a produção tem o export de 28/09); Operação: 1 de cruzamento e **0 datas fora da faixa** (parser
     pós-`semNaDoR`; a M9 mostrou 41 porque rodou com o parser anterior);
   - nada aplicado: nenhuma linha `aplicada` nova em `ingestao.carga`, contagens das bases iguais antes
     e depois, e os crus da conferência removidos do bucket.
2. `tsc`, `lint`, `build`, `npm test` antes e depois do DROP.
3. Depois da aplicação pelo Yan: REST com service_role em cada função dropada ⇒ 404 (`PGRST202`);
   o caminho novo segue respondendo; teste de drift verde com o baseline regenerado; `npm test` verde.
   `scripts/credencial/derivar-allowlist.mjs` rodado de novo: a allowlist do `ingestor` sai só com
   `promover_carga_vendas(jsonb, uuid)` — prova de que a allowlist derivada se corrige sozinha.
4. `revisor` (seed + testes) e `revisor-db` (0286) antes; auto-auditoria depois das correções.
