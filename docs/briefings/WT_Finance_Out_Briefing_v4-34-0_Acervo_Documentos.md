# WT Finance — Out-Briefing v4.34.0 · Acervo de Documentos

**Data:** 2026-07-01 · **Branch:** `feat/v4-34` (base `main` @ v4.33.1) · **Versão:** 4.33.1 → **4.34.0** (MINOR — capacidade nova)
**Tema:** Nova página `/financeiro/acervo` — biblioteca de documentos do financeiro em formato de glossário A–Z, com upload (título + descrição + arquivo de qualquer tipo) e download por link temporário. **ADR-0139 · migration 0165 (aditiva, aplicada, backup-gate verde).** **Merge e deploy ficam com o usuário.**

## Resumo executivo

O financeiro ganhou um repositório único de documentos de referência (modelos, manuais, políticas) dentro da plataforma, em vez de espalhados em e-mail/OneDrive. A tela é um glossário A–Z com busca client-side; qualquer usuário com a área pode ver e baixar, e só quem tem a área de gestão pode adicionar documento novo. O RBAC nasce em dois níveis (ver / gestão) e com grant inicial apertado (só administradores) — o mesmo desenho já validado em Solicitações e no Faturamento Corporativo. O binário vive num bucket privado dedicado do Storage, com download só via link assinado de curta duração gerado no servidor.

## Missões implementadas

### M1 — Migration (backend): tabela + bucket + RBAC + RPCs
Migration `0165_acervo_documentos.sql` (aditiva): tabela `app.acervo_documento` (RLS deny-by-default, `REVOKE ALL` de `PUBLIC/anon/authenticated`), bucket privado `acervo-documentos` (`public=false`, `file_size_limit=26214400` = 25 MiB, `allowed_mime_types=NULL` — qualquer tipo de arquivo, zero policies em `storage.objects`), duas áreas RBAC novas (`financeiro/acervo` ordem 33, `financeiro/acervo/gestao` ordem 34, grupo Financeiro) com grant inicial só aos roles que já têm `admin/acessos`, e 3 RPCs `SECURITY DEFINER` no **padrão inline** (`PERFORM app.exigir_acesso(...)` como 1ª linha do corpo + `REVOKE`/`GRANT` explícitos, sem o wrapper `__nucleo` legado da 0121):
- `acervo_listar()` — OR das duas áreas; whitelist explícita via `jsonb_build_object` (nunca expõe `storage_path`/`criado_por`), ordenada por `app.norm_nome(titulo)`.
- `acervo_criar(...)` — só a área de gestão; valida título/descrição não-vazios (`TITULO_OBRIGATORIO`/`DESCRICAO_OBRIGATORIA`); `criado_por = auth.uid()`.
- `acervo_doc_path(p_doc_id)` — OR das duas áreas; devolve `storage_path` + `nome_arquivo` para a Server Action gerar a signed URL (`NAO_ENCONTRADO` se o id não existir).

### M2 — UI: página, componente, Server Actions, sidebar
- `src/app/financeiro/acervo/page.tsx`: `requireArea(['financeiro/acervo', 'financeiro/acervo/gestao'])`, calcula `podeAdicionar`, carrega a listagem inicial via SSR (protegida — falha não derruba a página, cai numa faixa de erro).
- `src/app/financeiro/acervo/actions.ts`: `listarDocumentos` / `uploadDocumento` / `documentoUrl`. Upload sobe o binário via `getAdminClient().storage` (service role) para `docs/<uuid>/<nome-sanitizado>`, depois persiste os metadados via RPC com o **cliente de sessão** (`getServerClient()`, JWT real do usuário — necessário para `exigir_acesso` ver as claims certas). Nome do arquivo sanitizado (NFD + remoção de diacríticos + whitelist `[a-zA-Z0-9._-]` + limite de 100 caracteres); nome original preservado como metadado `nome_arquivo`. Download gera signed URL de 60s via `createSignedUrl(path, 60, { download: nomeArquivo })`.
- `src/components/financeiro/acervo-documentos.tsx`: glossário A–Z (agrupamento por letra inicial do título normalizada, `#` por último, ordenação `localeCompare('pt-BR')`), busca client-side (título/descrição/nome do arquivo, acento-insensível), item com hierarquia título > descrição > nome do arquivo, download popup-safe (janela aberta antes do `await`, redirecionada depois — padrão de `drawer-solicitacao.tsx`), modal de upload (`ModalCentral` + primitivos `Input`/`Textarea`/`Button`), botão "Adicionar" âmbar (`PILL_GESTAO`) condicionado a `podeAdicionar`.
- Sidebar (`src/components/layout/sidebar.tsx`): subitem novo em Financeiro usando o campo **novo** `NavSubItem.areasAny` (espelha o `areasAny` já existente em `NavItem`) — necessário porque a visibilidade do item depende do OR das duas áreas, não de uma única.
- `src/app/financeiro/page.tsx`: `requireArea` estendido com as duas áreas do acervo; fallback de rota inicial redireciona para `/financeiro/acervo` quando essas são as únicas áreas do usuário.
- `src/lib/auth/areas.ts` / `src/lib/auth/areas.test.ts`: as duas áreas novas no catálogo `AREAS`/`AREA_INFO`, `areasDaRota` para `/financeiro/acervo` (as duas), paridade com `app.rbac_areas` mantida.
- `src/lib/schemas-rpc.ts`: `acervoListaSchema`/`acervoDocSchema` (Zod).

### M3 — Correções da auto-auditoria adversarial
Ver seção própria abaixo — 3 correções aplicadas antes do fechamento.

### M4 — Documentação e fechamento
`docs/adr/0139-acervo-documentos.md`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing, atualização pontual do `CLAUDE.md` (padrão inline de RPC nova documentado, distinto do wrapper+`__nucleo` legado da 0121).

## Migration 0165 — aplicação e verificação

**Aplicada em produção com backup-gate verde** (43 tabelas cobertas, restore-test spot 4/4). Declaração prévia no header da migration confirma o regime aditivo (só `CREATE TABLE`/bucket idempotente/`INSERT ... ON CONFLICT DO NOTHING` em catálogo RBAC/`CREATE FUNCTION`+`GRANT`/`REVOKE` — nenhuma tabela pré-existente tem coluna ou linha alterada além do `INSERT` idempotente de catálogo).

**Verificação executada:**
- **REST smoke:** `acervo_listar` retorna `[]` (acervo vazio); as 3 RPCs (`acervo_listar`, `acervo_criar`, `acervo_doc_path`) **negam anon** (status ≥ 400); `acervo_criar` com título/descrição vazios retorna `TITULO_OBRIGATORIO`/`DESCRICAO_OBRIGATORIA` **sem persistir**; `acervo_doc_path` com id inexistente retorna `NAO_ENCONTRADO`.
- **Round-trip E2E em produção:** upload de um arquivo de teste → `acervo_criar` → `acervo_listar` mostra o item → `acervo_doc_path` devolve o path → signed URL gerada → download com **conteúdo idêntico** ao arquivo original → limpeza total (registro + binário removidos; `acervo_listar` voltou a `[]`).
- **Gates:** `npx tsc --noEmit` → 0 erros · `npm run lint` → limpo · `npm test` → 302/302 (inclui os casos novos de `rpc-contrato.test.ts` e a paridade de áreas) · `npm run build` → limpo (rota `/financeiro/acervo` presente).

## ADR-0139

`docs/adr/0139-acervo-documentos.md`. Decisões documentadas: RBAC em dois níveis com OR nos guards de leitura (2ª ocorrência do padrão, após `solicitacoes/basico` × `solicitacoes`); grant inicial apertado (só `admin/acessos`, precedente 0161); bucket privado **dedicado** (não reusa `solicitacoes-anexos`, cujo `allowed_mime_types` é restrito — o Acervo aceita qualquer tipo); signed URL de 60s (referenciando ADR-0113); nome de arquivo **sanitizado** no path do Storage (diferente de Solicitações, que usa o nome cru — endurecido porque este bucket aceita qualquer MIME); RPC nova no **padrão inline** (não o wrapper+`__nucleo`, que é retrofit legado da 0121); e o **risco aceito** de `acervo_doc_path` devolver `storage_path` ao caller autenticado (mesmo desenho do precedente `solic_anexo_path`/ADR-0113 — o path sozinho não dá acesso, pois o bucket não tem policies e a signed URL exige a service key; quem chama já tem a área que permite baixar pelo app).

## Auto-auditoria adversarial

Um subagente cético revisou a implementação antes do fechamento. **Veredicto: aprovado com ressalvas.** Achados e correções aplicadas:
1. **Sidebar não refletia o OR das duas áreas** — `NavSubItem` não tinha um campo equivalente ao `areasAny` de `NavItem`; um usuário só com a área de gestão (sem a de "ver") não veria o subitem mesmo tendo acesso à página. **Corrigido:** campo `areasAny` adicionado a `NavSubItem`, usado no subitem do Acervo.
2. **Cobertura de contrato incompleta** — o caso de `acervo_listar` em `CONTRATOS_PARSE_RPC` validava só `[]` (acervo vivo estava vazio no momento do teste), sem exercitar o formato de um item real; e não havia bloco de "anon negado" cobrindo as 3 RPCs novas. **Corrigido:** fixture real capturada do round-trip E2E (documento de teste removido logo depois) cobrindo o schema do item; bloco `it('Acervo: anon negado em todas as RPCs', ...)` cobrindo as 3 RPCs, incluindo `acervo_criar` com argumentos mínimos (garante que, mesmo que o guard falhasse, o teste pegaria antes de qualquer persistência).
3. **Upload sem tratamento de exceção da RPC** — se a chamada a `acervo_criar` **lançasse** (timeout/erro de rede do SDK) em vez de resolver com `{ error }`, o binário já enviado ao Storage ficaria órfão sem tentativa de limpeza. **Corrigido:** `try/catch` ao redor da chamada RPC na Server Action, com cleanup best-effort (`storage.remove`) também no `catch`.

**Risco aceito e documentado** (não é uma correção, é uma decisão registrada no ADR-0139): `acervo_doc_path` devolve `storage_path` ao caller autenticado com a área — mesmo desenho já aceito para `solic_anexo_path` (ADR-0113). O path sozinho não dá acesso ao binário (bucket sem policies em `storage.objects`; a signed URL exige a service key, que só a Server Action detém); e quem consegue chamar a RPC com sucesso já tem a área que permite baixar o mesmo documento pela própria UI — não há escalação de privilégio.

## Arquivos novos/modificados

**Novos:**
- `supabase/migrations/0165_acervo_documentos.sql`
- `src/app/financeiro/acervo/page.tsx`
- `src/app/financeiro/acervo/actions.ts`
- `src/components/financeiro/acervo-documentos.tsx`
- `docs/adr/0139-acervo-documentos.md`
- Este out-briefing (`docs/briefings/WT_Finance_Out_Briefing_v4-34-0_Acervo_Documentos.md`)

**Modificados:**
- `src/components/layout/sidebar.tsx` (subitem do Acervo + campo `areasAny` em `NavSubItem`)
- `src/app/financeiro/page.tsx` (guard estendido + fallback de rota inicial)
- `src/lib/auth/areas.ts` (as duas áreas novas + `areasDaRota`)
- `src/lib/auth/areas.test.ts` (paridade/roteamento das áreas novas)
- `src/lib/schemas-rpc.ts` (`acervoListaSchema`, `acervoDocSchema`)
- `src/lib/rpc-contrato.test.ts` (caso em `CONTRATOS_PARSE_RPC`, fixture real do item, bloco anon-negado das 3 RPCs, teste de não-vazamento de `storage_path`/`criado_por`)
- `docs/adr/0139-acervo-documentos.md` *(novo, listado acima)*
- `CHANGELOG.md` (entrada 4.34.0)
- `src/data/changelog-diretoria.ts` (entrada 4.34.0, linguagem de negócio)
- `package.json` / `package-lock.json` (bump de versão — feito pelo orquestrador)
- `CLAUDE.md` (bullet de "Toda RPC de leitura exposta..." reescrito para documentar os dois padrões — inline para RPC nova, wrapper+`__nucleo` como legado de retrofit da 0121)

## Pendências / fora de escopo

- **Sem exclusão/edição de documento** — decisão de produto; possível follow-up se solicitado.
- **`PRIORIDADE_INICIAL` (redirect pós-login de `/`) não inclui as áreas do acervo** — um usuário cuja **única** área seja o acervo cai no fallback genérico de rota inicial em vez de abrir direto em `/financeiro/acervo`. Não afeta usuários que também têm outra área (caso mais comum hoje, dado o grant inicial apertado a admins). Achado a corrigir se/quando esse perfil de usuário existir.
- **Binário órfão possível** se o cleanup best-effort da Action falhar após um erro na RPC — inofensivo (nunca listável, sem registro de metadados); limpeza manual eventual no Storage.
- **Duas implementações de remoção de diacríticos** (uma na Action, para sanitizar o path do Storage; outra no componente, para normalizar título/descrição/nome na busca e no agrupamento) — equivalentes em resultado, mantidas separadas por servirem propósitos distintos (sanitização de path vs. normalização de comparação).

## Aprendizado permanente para o CLAUDE.md

Aplicado nesta versão: o bullet de "Toda RPC de leitura exposta é um wrapper `SECURITY DEFINER`... `__nucleo`" estava desatualizado — descrevia só o padrão de **retrofit** da migration 0121 (preservar assinatura de RPCs que já existiam antes do RBAC dinâmico). Desde a v4.29 (migrations 0160–0165), toda RPC **nova** usa o padrão **inline** (`PERFORM app.exigir_acesso(...)` como primeira linha do próprio corpo, sem indireção a `__nucleo`). O CLAUDE.md agora documenta os dois padrões e deixa claro que o wrapper+`__nucleo` é legado, não o molde a seguir — evita que a próxima versão reintroduza a indireção desnecessária por estar copiando um exemplo antigo do arquivo.
