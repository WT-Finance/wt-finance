# Runbook v4.16 — Módulo de Solicitações

Operação do módulo de solicitações internas (ADR-0112/0113). Comandos SQL via
`npx supabase db query --linked` na raiz do repo, ou REST com a service role key.

---

## Visão geral

- **Tabelas** (`app`, RLS deny-by-default — acesso só por RPC `SECURITY DEFINER`):
  `solicitacao_tipo`, `solicitacao_campo`, `solicitacao` (respostas em snapshot JSONB),
  `solicitacao_anexo` (metadados; binário no Storage).
- **Área RBAC** `solicitacoes` = **gestão** (ver todas + administrar tipos). A página
  `/solicitacoes` (abrir/minhas/caixa) é de **qualquer autenticado**; `/admin/solicitacoes`
  (tipos) exige a área.
- **Storage:** bucket privado `solicitacoes-anexos` (10 MiB/arquivo, MIME allow-list).
  Sem policy pública — leitura só por signed URL gerada no servidor após checagem de
  visibilidade.

## Criar / editar / arquivar tipos

`/admin/solicitacoes` (precisa da área `solicitacoes`):
- **Novo tipo / Editar:** nome + construtor de campos (rótulo, tipo, obrigatório; para
  "seleção", as opções). Editar os campos de um tipo **não altera** solicitações já
  abertas (cada uma guarda um snapshot dos campos no momento da abertura).
- **Arquivar:** o tipo some do formulário de abertura, mas histórico e board permanecem.
  Desarquivar a qualquer momento.
- **Excluir:** só permitido para tipo **sem nenhuma solicitação**. Com vínculos, a UI/RPC
  recusa (`TIPO_EM_USO`) e orienta arquivar.

## Conceder gestão a alguém

Atribuir a área `solicitacoes` a uma role (via `/admin/acessos` → Permissões) dá a essa
role: ver **todas** as solicitações (sub-filtro "Todas (gestão)" no board) e administrar tipos.

## Apurar pendências de um usuário

Abertas atribuídas a um usuário (direto ou via role dele):
```sql
select s.id, s.tipo_id, s.data_limite, s.solicitante_id
from app.solicitacao s
join app.rbac_usuarios u on u.user_id = '<user_id>'
where s.status = 'aberta'
  and (s.destinatario_user_id = u.user_id
       or (s.destinatario_role_id is not null and s.destinatario_role_id = u.role_id));
```
(É o que a RPC `solic_minhas_pendencias` conta para o badge da sidebar.)

## Anexos

- Vivem no bucket `solicitacoes-anexos` (privado). O `storage_path` está em
  `app.solicitacao_anexo`. Download sempre por signed URL (curta) — não há URL pública.
- Excluir uma solicitação (não há UI para isso na v1) faria CASCADE nos metadados; o
  binário no Storage exigiria remoção à parte.

## Rollback de aplicação (reverter a v4.16.0)

Estruturas (tabelas/RPCs/área/bucket) são **aditivas e inertes** para versões anteriores.
Reverter = **Vercel → promover o deployment anterior à v4.16.0**. Nada precisa ser
desfeito no banco; nenhum código antigo referencia as tabelas novas. O item "Solicitações"
some da sidebar ao voltar o deployment.

## Backup

Backup lógico completo pré-v4.16 em `~/wt-finance-backups/2026-06-12-pre-v4-16/`
(restore testado). As migrations 0127-0130 não tocam dados pré-existentes.
