# Anexo v6.0.0 / M8 — baseline de schema e drift

Briefing §5.H e §7 (M8: "drift sintético (coluna a mais no catálogo) reprova"). Commit `438f7d2`.
Sem migration. Fecha a Fase 4.

## 1. O que existe

- `supabase/baseline/schema-v6.json` — retrato do catálogo de produção nas partes do projeto
  (schemas `analytics, app, audit, dim, estante, financeiro, ingestao, monde, patrimonio, public,
  raw`): 79 tabelas (colunas, constraints, índices, policies, triggers, dono, ACL), 19 views
  (hash da definição), 330 funções por assinatura (retorno, linguagem, SECURITY DEFINER,
  volatilidade, `proconfig`, dono, ACL, hash do corpo), roles de máquina `verificador`/`ingestor`
  (atributos, membership, configuração, allowlist efetiva), roles da plataforma
  `anon`/`authenticated`/`service_role`/`authenticator` (atributos, membership, configuração),
  `pg_default_acl`, `cron.job` (hash do comando, nunca o texto), extensões. Metadado
  `ultima_migration` = 0283. Nada volátil (OID, estatística, sequence, timestamp).
- `scripts/schema-baseline/snapshot.mjs` — módulo ÚNICO que gera (`snapshotCatalogo`) e compara
  (`compararBaseline`, diferenças legíveis por caminho). `scripts/schema-baseline/gerar.mjs` +
  `npm run db:baseline` regeneram.
- `src/lib/schema-baseline.test.ts` — 12 casos offline (cada classe de diferença nomeada, inclusive
  `null` × chave ausente) + 3 vivos: vivo × arquivo = zero diferenças; drift sintético em memória
  (coluna a mais, GRANT a menos do `ingestor`, cron invertido) nomeado um a um; o retrato enxerga o
  positivo (`raw.vendas_excel.setor_macro`, allowlist do `ingestor`, cron `ingestao-vigia`, uma
  policy, `statement_timeout` do `authenticated`).
- Convenção nova: **migration aplicada — ou cron ligado/desligado — ⇒ `npm run db:baseline` no
  mesmo commit** (skill `banco-e-rpc` §6, `/fechamento-versao` passo 5, checklist do `revisor-db`).

## 2. Divergência do briefing (D12)

O briefing pede `supabase db dump --schema-only` → `supabase/baseline/schema-v6.sql`. Não roda
nesta máquina: o dump usa um container e o socket do Docker está negado (`permission denied …
docker.sock`, usuário fora do grupo `docker`); não há `pg_dump` local. Mais: comparar SQL exigiria
parsear texto. O baseline é JSON das MESMAS queries de catálogo que as sondas usam. E o comando do
briefing não existe assim — nesta CLI o dump já é só de schema por padrão (dado só com
`--data-only`). Para ter o `.sql` como companheiro legível: `sudo usermod -aG docker $USER`
(relogin) e `npx supabase db dump --linked -f supabase/baseline/schema-v6.sql`.

## 3. Provas

- **Reprodutível:** gerado duas vezes seguidas = byte-idêntico (antes e depois das correções da
  revisão).
- **Critério do briefing, ao pé da letra:** com o arquivo commitado sem `raw.vendas_excel.setor_macro`
  (o catálogo passa a ter uma coluna A MAIS) e com `ingestao-vigia.active` invertido, o teste vivo
  reprovou nomeando exatamente as duas: `tabelas.raw.vendas_excel.colunas.setor_macro: presente no
  vivo, ausente no baseline` e `cron.ingestao-vigia.active: true → false`. Arquivo restaurado ⇒
  15/15 verdes.
- **Sem segredo no arquivo commitado:** varredura por `bearer|eyJ…|sb_secret_|password|senha|secret`
  e, depois de acrescentar as roles da plataforma, pelas configurações delas — só fuso,
  `statement_timeout`, `lock_timeout` e as bibliotecas pré-carregadas do `authenticator`; as
  ocorrências de "senha" são nomes de coluna/função. O comando do cron lê o segredo do vault e está
  só como hash.
- Gates de fase: `build` verde (rodado antes das correções da revisão, que tocaram só `scripts/`,
  testes, docs e `.claude/` — fora do grafo do Next); `tsc`, `lint` e suíte depois das correções:
  **1.657 testes, 99 arquivos, zero falha**.

## 4. Parecer da revisão (`revisor`: APROVADO COM RESSALVAS — zero CRÍTICO/ALTO)

| Achado | Tratamento |
|---|---|
| MÉDIO — docs citavam a chave `migration`; o JSON usa `ultima_migration` | corrigido no `/fechamento-versao` e no `revisor-db` |
| MÉDIO — `search_path` não fixado; o deparse qualifica nomes conforme ele | `SET search_path TO pg_catalog` no início de `snapshotCatalogo` (fonte única); regenerado — nenhum deparse mudou, agora não depende da sessão |
| MÉDIO — queries de ACL sem `ORDER BY`; com dois grantors, o último escrito venceria | `ORDER BY` + OR entre grantors (independente da ordem) |
| MÉDIO — `anon`/`authenticated`/`service_role` fora do retrato (onde vivem `statement_timeout` e fuso) | `roles_plataforma` (+ `authenticator`) com atributos, membership e configuração; os GRANTs deles já estão na ACL de cada objeto |
| BAIXO — ativar o vigia por RPC (M9) muda o retrato sem migration | regra escrita na skill: cron ligado/desligado também regenera; o teste de visibilidade deixou de cravar `active === false` (o estado é cobrado pelo teste contra o arquivo) |
| BAIXO — sem caso offline de `null` × chave ausente | caso acrescentado |

Correção do orquestrador, antes da revisão: `q()` enfileira por client — os `Promise.all` sobre um
único `pg.Client` disparavam o `DeprecationWarning` (removido no pg@9).

## 5. Vermelho esperado que NÃO é drift do projeto

Upgrade da plataforma Supabase pode mudar versão de extensão e configurações do `authenticator`
(`session_preload_libraries`, `pgrst.*`). Nesse caso: ler a lista, confirmar que é da plataforma,
regenerar e commitar dizendo isso.

## 6. Achado fora do escopo — checkpoint do Yan

O backup-gate (`scripts/db-gate/lib.mjs:35`) cobre 61 das 79 tabelas: `estante`, `patrimonio`,
`ingestao` e `monde` ficaram fora, e a checagem de completude lê a mesma lista (circular). Diff
proposto no WORKING-CONTEXT, **não aplicado**. Precisa estar resolvido antes da M10 (o GATE 3 exige
backup-gate + restore-test).
