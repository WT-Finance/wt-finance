# ADR-0127 — Camada de e-mail no fluxo de acesso (SMTP corporativo, fallback-safe)

**Data:** 2026-06-22 · **Versão:** 4.24.0 (MINOR) · **Status:** aceito

## Contexto

A senha provisória gerada na criação de usuário e no reset administrativo era apenas
EXIBIDA na tela ao admin, que a comunicava manualmente. Não havia envio de e-mail: o
`[auth.email]` nativo do Supabase está desligado de propósito (greenfield total de
e-mail). A v4.24 adiciona o ENVIO POR E-MAIL automático da senha provisória, mantendo a
exibição na tela como fallback. Escopo restrito ao fluxo de acesso (criação + reset);
self-service "esqueci minha senha" não existe e não foi criado.

Restrições inegociáveis: (a) o fluxo de acesso JÁ funciona sem e-mail — o envio é camada
ADICIONAL e nunca pode virar ponto de falha que impeça criar/resetar usuário; (b)
credenciais e remetente NUNCA no repositório (só `.env.local` gitignored + ambiente da
Vercel).

## Decisão

1. **Camada única reutilizável `src/lib/email/` (server-only):** `config.ts` lê `SMTP_*`
   de `process.env` (fallback-safe: faltando qualquer essencial, retorna `null`, nunca
   lança); `template.ts` gera o e-mail de senha provisória (criação/reset, identidade
   sóbria, estilos inline, SEM imagem externa); `index.ts` `enviarSenhaProvisoria()` usa
   `nodemailer` com TIMEOUT CURTO (~10s) e **retorna `boolean` — NUNCA lança**. Chamada
   pelos 2 pontos do fluxo (criação + reset); no futuro, notificações de Solicitações
   reusam a mesma camada com novos templates.

2. **Fallback acima de tudo:** SMTP indisponível/erro/config ausente →
   `enviarSenhaProvisoria` retorna `false`, a criação/reset **continuam** e a senha
   **continua exibida** na tela (copiável). As actions estendem o retorno com
   `emailEnviado: boolean`; as 3 UIs (criar, resetar, aprovar solicitação — esta herda via
   `criarUsuario`) mostram a senha SEMPRE + aviso ("enviada por e-mail" | "envio falhou —
   copie e repasse").

3. **Zero hardcode / remetente da config:** host/porta/usuário/senha/REMETENTE 100% de
   `process.env`. `SMTP_FROM` (remetente) default = `SMTP_USER` (Office 365 exige
   remetente = conta autenticada). Nenhum valor no código nem no `.env.example` (só as
   chaves). Office 365: `smtp.office365.com` / 587 / STARTTLS (`SMTP_SECURE=false`).

4. **Destinatário autoritativo no reset:** `resetarSenha` tira o e-mail do registro do
   Auth (resposta do `updateUserById`), não de input do cliente — a assinatura
   `resetarSenha(userId)` não muda.

SEM migration: a flag de troca obrigatória (`precisa_trocar_senha`) já existe desde a
migration 0125; a autorização (`requireAreaAction('admin/acessos')`) é inalterada.

## Alternativas consideradas

- **Usar o `[auth.email]` nativo do Supabase / magic link:** Rejeitada — desligado de
  propósito (SMTP nativo tem teto baixo, ~2/h) e o modelo v4.14 é por senha provisória
  exibida, não link. A camada própria com conta corporativa (Office 365) não tem esse teto.
- **Tornar o e-mail obrigatório (falha de envio aborta a criação):** Rejeitada — viola a
  restrição central; o fluxo tem de funcionar sem e-mail. O envio é best-effort.
- **Duplicar a lógica de envio em `criarUsuario` e `resetarSenha`:** Rejeitada — uma
  camada única, dois pontos de chamada; Solicitações (futuro) reusa sem reescrever.
- **Remetente/host no `.env.example` ou no código:** Rejeitada — segredo e remetente são
  específicos da conta; só `.env.local`/Vercel. O `.env.example` traz só as chaves.

## Consequências

- **Criar/resetar nunca quebram por causa de e-mail.** Provado: com env ausente E com erro
  de envio simulado, `enviarSenhaProvisoria` retorna `false` sem propagar exceção (teste
  vivo `email.test.ts`) e a senha segue na tela.
- **Operacional:** as `SMTP_*` precisam estar TAMBÉM no ambiente da Vercel — sem isso o
  envio só funciona local (runbook `docs/runbooks/v4-24-email-runbook.md`). Validar a saída
  na porta 587 no preview/produção.
- **Segurança operacional (fora do código):** a conta SMTP hoje é pessoal e a senha
  trafegou no chamado; recomendação ao Yan de trocá-la e, quando viável, migrar para um
  e-mail dedicado (só troca de env — zero código). O código só lê do ambiente.
- **Reutilização garantida:** a camada nasce pronta para as notificações de Solicitações
  (só novos templates/chamadas).
