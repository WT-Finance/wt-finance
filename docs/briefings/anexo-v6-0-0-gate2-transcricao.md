# Anexo v6.0.0 — GATE 2, transcrição da prova adversarial

**Quando:** 2026-09-22, após o registro do `custom_access_token_hook` (0275) no Dashboard.
**Como:** `npm test` completo na worktree da versão com `SUPABASE_VERIFICADOR_SENHA` /
`SUPABASE_INGESTOR_SENHA` no `.env.local` — **1.275 casos, 79 arquivos, 0 pulados** (baseline da
v5.11.0: 1.247). Os casos abaixo são o bloco "GATE 2" de `src/lib/rpc-contrato.test.ts`
(verificador) e de `src/lib/ingestao/credencial-ingestor.test.ts` (ingestor). Cada caso de escrita
confere PRIMEIRO no catálogo (`has_function_privilege` = false) e SÓ ENTÃO chama via REST — se a
role tivesse EXECUTE, o caso reprovaria sem chamar (chamar `truncar_*` com privilégio seria o
incidente de 10/09 de novo).

**Camada que negou, medida:** tanto para `truncar_*`/`promover_*`/`limpar_*` quanto para `admin_*`
o Postgres devolveu `42501 permission denied for function` (a camada de **GRANT**) → HTTP 403 —
antes de `app.exigir_acesso` rodar. O RBAC de área é a segunda camada, que ficaria de pé se algum
grant vazasse.

**Identidade nos tokens (login real):** `verificador@janus.interno` → `role=verificador`;
`ingestor@janus.interno` → `role=ingestor`; usuário comum → intocado (`authenticated`).

**Fora deste anexo:** a terceira alavanca do `ingestor` (chave `x-api-key` revogada ⇒ 401) se prova
na rota `/api/ingestao` — M4.

```
[verificador] public.truncar_lancamentos(): sem EXECUTE no catálogo E negada via REST
[verificador] public.truncar_lancamentos_movimentacao(): sem EXECUTE no catálogo E negada via REST
[verificador] public.truncar_titulos_em_aberto(): sem EXECUTE no catálogo E negada via REST
[verificador] public.truncar_demonstrativo_competencia(): sem EXECUTE no catálogo E negada via REST
[verificador] public.truncate_dynamic_tables(): sem EXECUTE no catálogo E negada via REST
[verificador] public.promover_carga_vendas(): sem EXECUTE no catálogo E negada via REST
[verificador] public.promover_carga_pessoas(): sem EXECUTE no catálogo E negada via REST
[verificador] public.limpar_staging_vendas(): sem EXECUTE no catálogo E negada via REST
[verificador] public.limpar_staging_pessoas(): sem EXECUTE no catálogo E negada via REST
[verificador] admin_listar_areas: área administrativa → 42501 (GRANT ou RBAC)
[verificador] admin_acesso_solicitacoes_pendentes: área administrativa → 42501 (GRANT ou RBAC)
[verificador] admin_acesso_solicitacoes_pendentes devolve integer (tipo lido do catálogo, já que o corpo é inalcançável)
[verificador] get_minhas_permissoes: usuário ativo com TODAS as áreas de leitura (19), nenhuma administrativa
[ingestor]    leitura de negócio: get_dre_mensal sem EXECUTE no catálogo e negada via REST
[ingestor]    public.truncar_lancamentos(): sem EXECUTE no catálogo E negada via REST
[ingestor]    public.truncar_lancamentos_movimentacao(): sem EXECUTE no catálogo E negada via REST
[ingestor]    public.truncar_titulos_em_aberto(): sem EXECUTE no catálogo E negada via REST
[ingestor]    public.truncar_demonstrativo_competencia(): sem EXECUTE no catálogo E negada via REST
[ingestor]    public.truncate_dynamic_tables(): sem EXECUTE no catálogo E negada via REST
[ingestor]    public.promover_carga_pessoas(): sem EXECUTE no catálogo E negada via REST
[ingestor]    o que ela PODE: o pipeline de Vendas tem EXECUTE no catálogo (4 assinaturas)
[ingestor]    validar_carga_staging (só lê a staging) executa via REST → 200
```

Todos ✓ em 2026-09-22. Sondas C1 (`sonda-credencial`) e C2 (`sonda-teste-escreve-banco`) vistas
reprovando por mutante em 21/09 (arquivos `scripts/zz-mutante-c1.mjs` / `zz-mutante-c2.mjs`,
nomeados na falha e removidos; `git status` limpo).
