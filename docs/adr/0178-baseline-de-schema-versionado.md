# ADR-0178 — Baseline de schema versionado

**Status:** aceito (v6.0.0) · **Data:** 2026-09-25 ·
**Contexto:** versão v6.0.0, "Fundação da ingestão" — Frente H (B-22) ·
**Briefing:** `docs/briefings/briefing-v6-0-0-fundacao-ingestao.md` §5-H, M8 · **Migrations:**
nenhuma (o baseline é gerado do catálogo vivo, não altera o banco) · **Anexo:**
`anexo-v6-0-0-m8-baseline-de-schema.md` · **Módulo:** `scripts/schema-baseline/snapshot.mjs` ·
**Teste:** `src/lib/schema-baseline.test.ts`

> Numeração conferida contra `docs/adr/` e `supabase/migrations/` na worktree (branch com `main`
> já mesclado em `81240e0`) em 25/09/2026 (últimos reais: ADR 0175, migration 0285); conferência
> contra o remoto é do orquestrador no fechamento. Sem migration nesta ADR — o commit é `438f7d2`.

## O problema

O catálogo de produção (79 tabelas, 19 views, 330 funções, as roles de plataforma e as duas roles
de máquina desta versão, `pg_default_acl`, `cron.job`, extensões) não tinha retrato nenhum
versionado no repositório. Drift entre o que o código presume e o que o banco realmente tem —
uma coluna que só existe numa branch aplicada fora de ordem, um `GRANT` esquecido, um cron
invertido — só aparecia quando quebrava algo em produção. E o backup do próprio backup-gate
cobria uma lista **fixa** de tabelas (`scripts/db-gate/lib.mjs`) que tinha ficado, com o tempo,
desalinhada do banco real: `estante`, `patrimonio`, `ingestao` e `monde` — os quatro schemas mais
recentes do projeto — estavam fora, e a checagem de completude do próprio gate lia essa mesma
lista fixa, então nunca acusava a lacuna (**completude circular**: o gate se media contra o que
ele mesmo decidia cobrir).

## Decisão

**Um retrato JSON do catálogo vivo, gerado por um módulo único, e adotado como fonte também pelo
backup-gate.**

1. **`supabase/baseline/schema-v6.json`**, gerado por `scripts/schema-baseline/snapshot.mjs` —
   módulo único que **gera** (`snapshotCatalogo`) **e** **compara** (`compararBaseline`,
   diferenças legíveis por caminho). Cobre as 79 tabelas (colunas, constraints, índices, policies,
   triggers, dono, ACL), 19 views (hash da definição), 330 funções por assinatura (retorno,
   linguagem, `SECURITY DEFINER`, volatilidade, `proconfig`, dono, ACL, hash do corpo), as roles de
   máquina `verificador`/`ingestor` (atributos, membership, configuração, **allowlist efetiva**),
   as roles de plataforma `anon`/`authenticated`/`service_role`/`authenticator` (atributos,
   membership, configuração — é onde vivem `statement_timeout` e o fuso), `pg_default_acl`,
   `cron.job` (hash do comando, **nunca o texto** — o comando carrega segredo do Vault), e
   extensões. Metadado `ultima_migration` amarra o retrato a um ponto conhecido da história.
   **Reprodutível:** gerado duas vezes seguidas é byte-idêntico.
2. **`npm run db:baseline` regenera**; `src/lib/schema-baseline.test.ts` reprova qualquer
   diferença **nomeando-a** — provado com drift sintético em memória (coluna a mais no catálogo,
   `GRANT` a menos do `ingestor`, cron invertido): o teste aponta exatamente os objetos que
   divergem, não "algo mudou".
3. **Convenção nova, mecânica desde já e citada nos três lugares certos:** migration aplicada —
   ou cron ligado/desligado — ⇒ `npm run db:baseline` **no mesmo commit**. A mesma régua que o
   ADR-0173 já havia fixado para `src/types/database.ts` ("gerado, não manuscrito, regenerado
   junto do bump que criou/alterou RPC"), agora estendida ao schema inteiro. Registrada na skill
   `banco-e-rpc` §6, no passo 5 do ritual `/fechamento-versao`, e no checklist inline do
   `revisor-db` — as três atualizadas juntas, seguindo a decisão D-12 do core (`CLAUDE.md`:
   "convenção de banco mudou → atualizar a skill `banco-e-rpc` **e** o checklist inline do
   `revisor-db`"), porque convenção de banco que muda sem as duas superfícies atualizadas volta a
   envelhecer em silêncio.
4. **O backup-gate passou a importar `SCHEMAS_PROJETO`** (decisão do Yan, 25/09) em vez de manter
   a lista fixa de 61 tabelas de `scripts/db-gate/lib.mjs`. A completude circular — o gate medindo
   sua cobertura contra a mesma lista que decide o que cobrir — fica fechada porque a lista deixa
   de ser um segundo lugar para envelhecer: `estante`, `patrimonio`, `ingestao` e `monde` (que
   ficavam de fora desde que nasceram) entram, e a fonte de verdade sobre "quais tabelas o projeto
   tem" passa a ser uma só, compartilhada entre o baseline e o gate. Provado depois da mudança:
   `npm run db:gate` standalone ⇒ 79 tabelas exportadas, completude 79/79, veredito verde (o
   backup ficou maior — o espelho do Monde soma ~80 mil linhas — e o export um pouco mais lento,
   custo aceito).

## Divergência do briefing (D12)

O briefing pedia `supabase db dump --schema-only` → `supabase/baseline/schema-v6.sql`. Isso não
roda nesta máquina: o dump usa um container e o socket do Docker está negado (usuário fora do
grupo `docker`), e não há `pg_dump` local. Adicionalmente, comparar SQL exigiria **parsear
texto** — o JSON compara campo a campo sem esse passo intermediário. O comando do briefing também
não existe assim nesta versão da CLI (o dump já é só de schema por padrão; `--schema-only` não é
uma flag reconhecida). O baseline adotado é gerado pelas **mesmas queries de catálogo** que as
sondas de segurança já usavam (`information_schema`, `pg_catalog`), então não introduz um segundo
mecanismo de leitura do banco. Se o `.sql` legível for desejado como companheiro: `sudo usermod
-aG docker $USER` (relogin) e `npx supabase db dump --linked -f supabase/baseline/schema-v6.sql`
— não construído nesta versão, registrado para quem quiser.

## Consequências

- **Positivas.** Drift de schema passa a ter um teste que **nomeia** a diferença, não um incidente
  que a revela em produção. O backup-gate deixou de ter uma lacuna de 18 tabelas não cobertas
  (23% do catálogo) mantida por uma checagem que não conseguia se ver de fora. A convenção de
  regenerar junto do commit da migration segue exatamente o padrão já provado com
  `database.ts` — um só hábito, duas superfícies.
- **Negativas / custos.** Mais um artefato a manter atualizado a cada migration (soma-se a
  `database.ts`) — esquecê-lo não quebra build nem lint, só o teste de drift, então a disciplina
  depende do checklist do `revisor-db` e do passo 5 do `/fechamento-versao`. O backup ficou maior
  e um pouco mais lento.
- **Risco residual conhecido, documentado de propósito no anexo.** Um upgrade da plataforma
  Supabase pode mudar versão de extensão ou configuração do `authenticator`
  (`session_preload_libraries`, `pgrst.*`) sem nenhuma migration do projeto — um "vermelho" nesse
  cenário não é drift do projeto; o procedimento é ler a lista, confirmar que é da plataforma, e
  regenerar e commitar dizendo isso explicitamente. Ativar o cron do vigia por RPC (fora de
  migration) também muda o retrato — já coberto pela mesma convenção ("cron ligado/desligado ⇒
  regenerar").
