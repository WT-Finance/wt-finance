# ADR 0110 — Login por senha (troca obrigatória) + solicitações de acesso

**Status:** Aceito
**Data:** Junho/2026
**Versão:** v4.14

## Contexto

A v4.13 entregou login por **magic link**. Na operação, o magic link gerou atrito:
ida ao e-mail a cada acesso, e — antes do fix da v4.13.1 — links consumidos por
bots de preview. O e-mail nativo do Supabase ainda limita a 2/h (sem SMTP), o que
trava convites em lote. A diretoria pediu um fluxo mais familiar e com menos atrito.

## Decisão

Trocar o método primário para **e-mail + senha** (`signInWithPassword`), mantendo o
RBAC e o enforcement da v4.13 intactos:

1. **Criação de usuário pelo admin → senha provisória aleatória** (gerada pelo
   sistema, ≥16 chars), **exibida na tela do admin (copiável)** — nunca por e-mail.
   Isso elimina a dependência de SMTP que travava o magic link.
2. **Troca obrigatória no 1º acesso:** flag `app.rbac_usuarios.precisa_trocar_senha`.
   Enquanto ligada, **toda** rota autenticada redireciona para `/trocar-senha`
   (portão forte — não dá para pular por URL). A própria página desliga a flag via
   `marcar_senha_trocada()` após o `updateUser({ password })`.
3. **Reset de senha = admin gera nova provisória** (botão), seta a flag de troca e
   exibe a senha. Cobre "esqueci a senha" sem depender de e-mail.
4. **Solicitação de acesso (auto-cadastro moderado):** tela pública
   `/solicitar-acesso` → RPC `solicitar_acesso` (anon) grava uma fila; o admin
   aprova/rejeita em `/admin/acessos` (aba Solicitações). Aprovar = cria o usuário
   com senha provisória. Nada é criado sem aprovação.
5. **Magic link permanece como RECUPERAÇÃO/anti-lockout** (rota `/auth/confirm`
   em 2 passos + botão "Link de acesso" do admin) — fora da tela de login. É a
   rede de segurança se o fluxo de senha falhar e para o cutover dos usuários atuais.

### Cutover (não-quebra)

Os usuários atuais entraram por magic link e não têm senha → todos marcados
`precisa_trocar_senha=true`. No próximo acesso (por um link de acesso do admin, que
segue funcionando) caem em `/trocar-senha` e **definem** a senha. Ninguém perde
acesso no merge.

## Alternativas consideradas

- **Manter só magic link** — descartada: o atrito (ida ao e-mail a cada login) é o
  que a diretoria reclamou; o fix da v4.13.1 resolveu o bug, não o atrito.
- **Senha provisória por e-mail** — descartada: reintroduz a dependência de SMTP
  (2/h) que motivou a troca. Exibir ao admin é mais simples e confiável.
- **OAuth (Google Workspace)** — forte candidato (o domínio é Google) e elimina
  senhas; fica registrado como evolução futura. Para esta entrega, senha atende ao
  pedido explícito e não depende de configurar OAuth/consent.
- **Auto-cadastro automático (sem moderação)** — descartado: abriria criação de
  conta a qualquer um; a fila moderada mantém o controle de quem entra.

## Consequências

- Surface nova: brute-force de senha (mitigado pelo rate-limit do Supabase Auth;
  captcha é melhoria futura) e o endpoint público `solicitar_acesso` (mitigado por
  1 pendente/e-mail + moderação; captcha futuro).
- Política de senha: mínimo elevado para 8 (config Supabase). Provisória ≥16.
- Reversível: migration 0125 é aditiva; o freio de emergência (kill switch +
  revert do deploy para v4.12.1) segue válido — ver runbook.
- `auth` continua gerenciado pelo Supabase; o app nunca vê o hash da senha.
