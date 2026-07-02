# ADR-0139 — Acervo de Documentos: RBAC em dois níveis, bucket privado dedicado, RPCs no padrão inline

**Status:** Aceito · **Data:** 2026-07-01 · **Versão:** v4.34.0
**Relaciona:** ADR-0113 (Solicitações — anexos via Storage, molde do bucket privado + signed URL), ADR-0121 (`solicitacoes/basico` × `solicitacoes` — molde do RBAC em dois níveis), migration 0121 (padrão wrapper+`__nucleo`, superado para RPC nova), migration 0161 (grant inicial apertado a `admin/acessos`, precedente da 0134).

## Contexto

O financeiro precisa de um repositório único de documentos de referência (modelos, manuais, políticas) hoje espalhados em e-mail/OneDrive, sem um lugar central na plataforma. A entrega é a página `/financeiro/acervo`: uma biblioteca em formato de glossário A–Z, com busca client-side e download por link temporário. Precisa de RBAC (nem todo mundo deve poder adicionar documento), armazenamento de binário (o Storage do projeto já tem o precedente de Solicitações, ADR-0113) e persistência de metadados (título, descrição, nome do arquivo) para listar/buscar sem baixar o binário.

## Decisão

### 1. RBAC em dois níveis, com OR nos guards de leitura
Duas áreas novas: `financeiro/acervo` (ver a biblioteca) e `financeiro/acervo/gestao` (adicionar documentos — **inclui** a visão). É a 2ª ocorrência deste padrão no projeto, depois de `solicitacoes/basico` × `solicitacoes` (0127/0144): em vez de uma área "adicionar" que dependeria de outra "ver" já concedida separadamente, a área de gestão sozinha já libera tudo. Os guards de leitura (`acervo_listar`, `acervo_doc_path`, a página) exigem **qualquer uma das duas** (`exigir_acesso(ARRAY['financeiro/acervo', 'financeiro/acervo/gestao'])`); `acervo_criar` exige só a de gestão. A UI calcula `podeAdicionar` a partir das permissões da sessão e só renderiza o botão "Adicionar" (âmbar, família de tokens `--gestao`/`PILL_GESTAO`, mesmo padrão dos botões de gestão de Solicitações) quando presente.

### 2. Grant inicial apertado — mesmo precedente da 0161
As duas áreas novas nascem concedidas **só** aos roles que já têm `admin/acessos` (via `INSERT ... SELECT ... WHERE area = 'admin/acessos'`), não a todos os roles — mesmo padrão da migration 0161 para `financeiro/faturamento-corp`. O admin decide quem mais recebe pelo editor de Usuários e Acessos; a plataforma não presume quem no financeiro deve ver o acervo.

### 3. Bucket privado DEDICADO (não reusa `solicitacoes-anexos`)
Bucket novo `acervo-documentos`: `public=false`, `file_size_limit=26214400` (25 MiB), **`allowed_mime_types=NULL`** (qualquer tipo de arquivo é aceito — requisito de produto: o acervo recebe PDF, planilha, imagem, ZIP, o que for). O bucket de Solicitações (`solicitacoes-anexos`, ADR-0113) tem `allowed_mime_types` restrito a poucos formatos e 10 MiB — reusá-lo exigiria afrouxar essa allow-list para um caso de uso diferente (anexo de solicitação ≠ biblioteca de referência). Um bucket dedicado mantém as duas superfícies com política própria, sem acoplar limites que servem produtos diferentes.

**Zero policies em `storage.objects`** para este bucket (deny-by-default, mesma postura da 0123/ADR-0113): só `service_role` acessa. Upload e leitura (signed URL) são sempre server-side.

### 4. Signed URL de 60s, popup-safe
Download por `createSignedUrl(path, 60, { download: nomeArquivo })` gerado sob demanda na Server Action `documentoUrl`, após o guard de área. 60s é suficiente para o redirect imediato da UI (janela aberta síncrona antes do `await`, redirecionada depois — padrão já usado em `drawer-solicitacao.tsx` para escapar do bloqueio de pop-up). Sem a signed URL, o objeto é inacessível — mesmo modelo de "URL de curta duração gerada no servidor" da ADR-0113.

### 5. Nome de arquivo SANITIZADO no path do Storage (diferente de Solicitações)
Solicitações usa o nome de arquivo **cru** no path porque o bucket já restringe o MIME a uma allow-list pequena. Como o Acervo aceita **qualquer tipo de arquivo**, o path do objeto no Storage é construído com um nome sanitizado (`docs/<uuid>/<nome-sanitizado>`: NFD + remoção de diacríticos + whitelist `[a-zA-Z0-9._-]` + limite de 100 caracteres) para evitar caracteres problemáticos em path de objeto (barras, unicode incomum, nomes vazios/só-símbolos vindos de qualquer tipo de arquivo). O nome **original** do arquivo é preservado à parte, como metadado `nome_arquivo` na tabela — é o que a UI mostra e o que vai no header de download da signed URL (`download: nomeArquivo`).

### 6. RPC nova = padrão INLINE, não wrapper+`__nucleo`
As 3 RPCs (`acervo_listar`, `acervo_criar`, `acervo_doc_path`) chamam `PERFORM app.exigir_acesso(ARRAY[...])` como **primeira linha do próprio corpo**, sem o wrapper `SECURITY DEFINER` que delega a uma função `__nucleo` service-role-only. O padrão wrapper+`__nucleo` (migration 0121) foi um **retrofit**: preservar a assinatura de funções que já existiam e já tinham consumidores antes do RBAC dinâmico chegar. RPC nova, sem esse legado, não precisa da indireção — o padrão inline (já usado em 0159/0160/0163/0164) é mais direto e igualmente seguro (mesma primitiva `exigir_acesso`, mesmos `REVOKE ... FROM PUBLIC, anon` / `GRANT ... TO authenticated, service_role` explícitos). Ver atualização correspondente no CLAUDE.md (§Auth e RBAC).

### 7. Whitelist explícita na saída de `acervo_listar`
A função nunca usa `SELECT *`/`to_jsonb(d)`: monta a saída via `jsonb_build_object` com as colunas exatas (`id`, `titulo`, `descricao`, `nome_arquivo`, `mime`, `tamanho_bytes`, `criado_em`). `storage_path` e `criado_por` nunca são emitidos — path de Storage e identidade de quem subiu o documento não são dado de exibição da biblioteca. Coberto por teste de contrato (nenhum item pode ter essas duas chaves).

## Risco aceito e documentado: `acervo_doc_path` devolve `storage_path`

`acervo_doc_path` retorna `{ storage_path, nome_arquivo }` para o **caller autenticado com a área** (não para o cliente/browser — é a Server Action `documentoUrl` que chama a RPC e, com o `storage_path` em mãos, gera a signed URL via `service_role`; o browser só recebe a signed URL final). Isto repete o desenho já aceito em `solic_anexo_path` (ADR-0113): a RPC devolve o path a quem já provou ter a área, e é a camada server-side (service role) que efetivamente concede acesso ao binário.

**Por que é seguro:** (1) o bucket não tem policies em `storage.objects` — ter o `storage_path` em texto não dá acesso nenhum sem a `service_role` key, que nunca sai do servidor; (2) gerar a signed URL exige a chamada `createSignedUrl` com a service key, que só a Action faz; (3) quem consegue chamar `acervo_doc_path` com sucesso já tem a área que permite ver/baixar o documento pela própria UI — não há escalação de privilégio, só uma indireção interna (RPC → Action → signed URL) que não é visível nem controlável pelo cliente. O risco seria apenas teórico se o `service_role` key vazasse — cenário que já é o pressuposto de segurança de toda a plataforma (nenhuma rota expõe a service key ao cliente).

## Consequências

- **Positivas:** RBAC em dois níveis reusa um padrão já validado (Solicitações); bucket dedicado evita acoplar limites de MIME/tamanho de produtos diferentes; sanitização do nome do arquivo remove uma classe de erro (path inválido) sem perder o nome original visível ao usuário; RPC nova mais simples (inline) sem o custo de manutenção do wrapper+`__nucleo`; grant inicial apertado (só admins) segue o precedente já testado e aprovado da 0161.
- **Negativas / limites:** o acervo não tem exclusão/edição de documento nesta versão (decisão de produto — follow-up); `PRIORIDADE_INICIAL` (redirect pós-login) não inclui as áreas do acervo — um usuário cuja **única** área seja o acervo cai no fallback de rota inicial em vez de já abrir em `/financeiro/acervo` (achado a corrigir se/quando esse perfil de usuário existir); se o cleanup best-effort da Action falhar após um erro na RPC, pode sobrar um binário órfão no bucket — inofensivo (nunca listável, pois não há registro de metadados), mas exige limpeza manual eventual; existem duas implementações equivalentes de remoção de diacríticos (na Action, para o path do Storage; no componente, para a busca/agrupamento) — redundância aceita por serem funções pequenas e de propósitos ligeiramente distintos (sanitizar path vs. normalizar para comparação).
