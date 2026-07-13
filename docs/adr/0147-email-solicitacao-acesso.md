# ADR-0147 — E-mail de notificação de nova solicitação de acesso

- **Status:** aceito (v5.0.1)
- **Data:** 2026-07-13
- **Contexto de versão:** deriva da v5.0.0 (aplicar a migration 0177 após a 0175/0176).

## Contexto

O auto-cadastro (`/solicitar-acesso`, tela de login) insere uma pendência em
`app.rbac_solicitacoes` via a RPC anon `solicitar_acesso` (0125), mas **NÃO avisava
ninguém**. Quem administra Usuários & Acessos só descobria o pedido abrindo a aba
Solicitações — pedidos podiam ficar parados sem que ninguém soubesse. O único e-mail do
ciclo de acesso era a senha provisória enviada ao **próprio** usuário, já na aprovação.

## Decisão

Notificar por e-mail, no momento do pedido, quem administra Usuários & Acessos (área
RBAC `admin/acessos`), reusando a camada de e-mail existente (`src/lib/email/`).

**Restrição de segurança (o ponto central).** O fluxo de `/solicitar-acesso` roda como
**anon**. A lista de e-mails dos administradores e o sinal "foi criado um pedido novo"
(um oráculo de enumeração) **não podem** ser alcançáveis por anon — isso reabriria um
diretório de e-mails, contra o invariante fechado na v4.17.0/M1 ("anon só executa
`solicitar_acesso`"). Portanto:

- **Nova RPC `public.solicitar_acesso_admin(p_email, p_nome)` — `service_role`-only**
  (`REVOKE` de `anon`/`authenticated`). Faz o INSERT (mesma guarda de `solicitar_acesso`:
  não há pendente para o e-mail E ele não é usuário), captura via `GET DIAGNOSTICS` se
  **realmente inseriu** e, só nesse caso, retorna os e-mails ativos com a área
  `admin/acessos` (JOIN `rbac_usuarios ⋈ rbac_role_permissoes`). Migration 0177 (aditiva).
- A **Server Action** `solicitarAcesso` chama essa RPC via `getAdminClient()` (100%
  server-side); se `inserida`, dispara o e-mail (best-effort, `await`, `try/catch`) e
  **sempre** redireciona `?enviado=1` (anti-enumeração ao cliente intacta). A resposta da
  RPC nunca chega ao navegador. `solicitar_acesso` (anon) permanece intacta como contrato
  público de auto-cadastro.
- **Notificar só em pedido NOVO** (`inserida`) — evita avisar em reenvios/duplicatas.
- **Envio best-effort** (`enviarNotificacaoAcessoSolicitado`, `Promise.allSettled`, nunca
  lança; sem SMTP → 0 enviados) — a falha do e-mail nunca quebra o pedido.
- **E-mail INTERNO → identidade Janus** (lockup duplo `[JANUS] | [WELCOME GROUP]`),
  mesmo shell Outlook-safe dos demais internos (`templateNotificacaoAcessoSolicitado`).
  Botão "Acessar a plataforma" → `/admin/acessos`.

## Alternativas rejeitadas

- **Dobrar os e-mails no retorno da `solicitar_acesso` (anon):** vazaria o diretório de
  e-mails e o oráculo "inserida" a qualquer chamador anônimo direto do endpoint REST.
- **RPC genérica `emails_por_area(area)` com grant a anon:** reabriria diretório a anon.
- **`get_upload_status`/`admin_listar_usuarios`:** exigem `admin/acessos`/service_role e
  não servem ao caminho anon; e a de listar usuários devolveria o diretório inteiro.
- **Fire-and-forget do e-mail:** em serverless o processo congela após a resposta — o
  envio se perderia; por isso é `await`ado antes do redirect.

## Consequências

- Administradores de Usuários & Acessos passam a ser avisados na hora do pedido.
- Depende do SMTP configurado (`SMTP_*` na Vercel) — sem ele, degrada em silêncio (0
  enviados), como o resto da camada de e-mail.
- Contrato da RPC (`{inserida, emails}`) a ser coberto em `rpc-contrato.test.ts` **após**
  a 0177 ser aplicada em produção (a RPC ainda não existe lá). O template já tem teste
  unitário (`template-acesso.test.ts`).
