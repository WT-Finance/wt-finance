# ADR-0113 — Solicitações: anexos via Supabase Storage (bucket privado + signed URLs)

**Data:** 2026-06-12 · **Versão:** 4.16.0 · **Status:** aceito
**Relacionado:** ADR-0112 (modelo do módulo)

## Contexto

Solicitações podem ter campos `anexo` (PDF/imagem/planilha, ≤10 MB/arquivo). O Storage do
Supabase estava **virgem** (habilitado em `config.toml`, teto global 50 MiB, nenhum bucket,
zero uso). O projeto não acessa tabela/Storage direto do cliente (padrão "zero `.from()`,
escrita via service role/RPC"). Anexos seguem a **visibilidade da solicitação** (§2.3).

## Decisão

- **Bucket privado dedicado** `solicitacoes-anexos` (`public=false`), com
  `file_size_limit=10485760` (10 MiB) e `allowed_mime_types` restrito a
  PDF, PNG/JPEG/WebP, XLSX e CSV — criado por SQL na migration 0127.
- **Sem policies em `storage.objects`** para o bucket → anon/authenticated **negados** no
  acesso direto. Todo acesso é **server-side via `service_role`**:
  - **Upload:** Server Action lê o arquivo, **valida no servidor** MIME (allow-list) e
    tamanho (≤10 MB), e sobe via `getAdminClient().storage` para um path namespaced
    (`<solicitacao|tmp>/<uuid>/<arquivo>`). Os metadados vão para `app.solicitacao_anexo`
    via `criar_solicitacao` (mesma transação da solicitação).
  - **Leitura/download:** **signed URL gerada no servidor** após checagem de visibilidade
    (`solic_anexo_path` valida `pode_ver_solic`; a action gera a URL assinada de curta
    duração). Sem signed URL, o objeto é inacessível.
- **Validação no servidor é a fonte de verdade** — o `allowed_mime_types`/limite do bucket
  é uma 2ª barreira; a action rejeita MIME/tamanho antes de subir (erro explícito).

## Alternativas consideradas
- **Bucket público / URLs públicas:** rejeitado — anexos contêm dados sensíveis; violaria a
  visibilidade por papel (qualquer um com a URL veria).
- **RLS de `storage.objects` por dono (policies SQL atreladas à solicitação):** rejeitado
  para a v1 — exigiria espelhar a lógica de visibilidade (solicitante/atendente/role/área)
  em SQL de policy de storage, com acesso direto do cliente ao bucket. Signed URLs
  server-side reaproveitam `pode_ver_solic` (já testada) e mantêm o bucket fechado, coerente
  com o padrão "zero acesso direto". (Pode evoluir para RLS de storage se necessário.)
- **Anexar antes de criar a solicitação:** o upload (binário) acontece na action ANTES da
  RPC, em path temporário; a RPC persiste os metadados. Se a RPC falhar, a action limpa os
  objetos órfãos. (Trade-off aceito: janela curta de objeto órfão em falha — limpável.)

## Consequências
- Anexos herdam a visibilidade da solicitação sem policy de storage (a checagem vive na RPC).
- `service_role` é usado SÓ para Storage (e `auth.admin`) — coerente com o padrão do projeto.
- Esforço estimado: M (bucket + action de upload com validação + signed URL + metadados).
- Limite por arquivo (10 MB) < teto global do projeto (50 MiB) — ok.
