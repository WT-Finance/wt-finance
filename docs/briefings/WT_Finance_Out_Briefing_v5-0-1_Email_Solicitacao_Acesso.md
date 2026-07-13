# Out-briefing — v5.0.1 · E-mail de nova solicitação de acesso

**Tipo:** PATCH · **Deriva de:** v5.0.0 (main) · **ADR:** 0147 · **Migration:** 0177 (aditiva)

## Problema
Auto-cadastro em `/solicitar-acesso` (RPC anon `solicitar_acesso`) inseria a pendência em
`app.rbac_solicitacoes` mas **não avisava ninguém**. Quem administra Usuários & Acessos só
via o pedido abrindo a aba Solicitações. (Investigação confirmou: zero envio hoje.)

## Entrega
E-mail para os administradores de Usuários & Acessos (área `admin/acessos`) no momento do pedido.

- **Migration 0177 (aditiva):** `public.solicitar_acesso_admin(p_email, p_nome)` —
  `service_role`-only. Insere (mesma guarda de `solicitar_acesso`), captura via
  `GET DIAGNOSTICS` se inseriu e, só então, retorna os e-mails ativos com `admin/acessos`.
- **Server Action** `solicitarAcesso`: passa a chamar via `getAdminClient()` (server-side);
  se `inserida`, envia o e-mail (`await`, best-effort) e **sempre** redireciona `?enviado=1`.
- **Camada de e-mail:** `templateNotificacaoAcessoSolicitado` (interno, lockup Janus, mesmo
  shell Outlook-safe) + `enviarNotificacaoAcessoSolicitado` (fan-out `Promise.allSettled`,
  nunca lança). Botão "Acessar a plataforma" → `/admin/acessos`.

## Segurança (o ponto central)
`/solicitar-acesso` roda como **anon**. Os e-mails dos admins e o sinal "inserida" (oráculo
de enumeração) NÃO podem ser alcançáveis por anon (invariante M1). Por isso a RPC é
`service_role`-only e a Action a chama via admin client (server-side); a resposta nunca chega
ao cliente. `solicitar_acesso` (anon) segue intacta como contrato público. Notifica só em
pedido **novo**.

## Gates
`npx tsc --noEmit` 0 · `npx eslint <arquivos>` 0 · `npx next build` OK · `npx vitest run` (todos verdes; +3 do `template-acesso.test.ts`).

## Pendências / operacional (Yan)
- **Aplicar a migration 0177** no terminal (`npm run db:migrate -- --aditiva`) — depois da
  0175/0176 da v5.0.0. **A ordem deploy×migration é segura:** se o deploy vier antes da 0177,
  a Action detecta o erro da RPC nova e faz **fallback** para a `solicitar_acesso` legada — o
  pedido NUNCA se perde; só a notificação por e-mail espera a 0177 (dispara no próximo pedido).
- **`SMTP_*` na Vercel** (já requisito das notificações existentes) — sem SMTP, degrada em
  silêncio (0 enviados).
- **Follow-up:** caso de contrato em `rpc-contrato.test.ts` para `solicitar_acesso_admin`
  **após** a 0177 estar em produção (a RPC ainda não existe lá; o template já tem teste unitário).

## Mockup
Aprovado pelo Yan (identidade Janus, cartão com e-mail/nome/data, botão "Acessar a plataforma",
nota "nada é criado até a aprovação").
