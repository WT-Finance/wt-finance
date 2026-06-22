# WT Finance — Out-Briefing v4.24.0

**Data:** 2026-06-22 · **Branch:** `feat/v4-24-0-email-acesso` (base `main` @ v4.23.3) · **Versão:** 4.23.3 → **4.24.0** (MINOR)
**Tema:** Envio da senha provisória por e-mail no fluxo de acesso (criação de usuário + reset administrativo). **Sem migration.** ADR-0127. **Merge e deploy ficam com o usuário.**

---

## Caráter
Camada de e-mail **ADICIONAL** sobre um fluxo que JÁ funciona sem ela. Invariante central: criar/resetar **nunca** quebram por causa de e-mail; a senha provisória continua exibida na tela (copiável) em todos os casos. Credenciais e remetente 100% de env — zero no repositório.

## Missões implementadas (M1–M5)

### M1 — Camada de e-mail reutilizável (`src/lib/email/`, server-only) — commit `a0b32a6`
- `config.ts` — `getConfigSmtp()` lê `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` de `process.env`. **Fallback-safe:** faltando qualquer essencial → `null` (nunca lança); `SMTP_FROM` default = `SMTP_USER` (Office 365); `SMTP_SECURE` parseado de string. Cache lazy (padrão do `getAdminClient`) + `_resetConfigSmtpCache()` p/ teste.
- `template.ts` — `templateSenhaProvisoria({ nome?, senha, tipo })` → `{ assunto, html, text }`. Identidade sóbria Welcome, **estilos inline, sem imagem externa**, escape de HTML do nome. `tipo: 'criacao' | 'reset'` muda assunto/intro.
- `index.ts` — `enviarSenhaProvisoria({ para, nome?, senha, tipo })`: `nodemailer`, **timeout curto (~10s)**; **retorna `boolean`, NUNCA lança** (sem config → `false`; qualquer erro → `false` + log). Transporter criado por envio (volume ~5–10/mês).
- Dep nova: `nodemailer ^9.0.1` + `@types/nodemailer ^8.0.1`.

### M2 — Config via env (`.env.example`) — commit `36cfd78`
Chaves `SMTP_*` (só as chaves, vazias; Office 365 em comentário) no `.env.example`. Leitura/remetente já no `config.ts`. Segredo só em `.env.local`/Vercel.

### M3 — Plugada na criação — commit `51937a7`
`criarUsuario` chama `enviarSenhaProvisoria('criacao')` em try/catch após gerar senha + marcar troca obrigatória; retorno estende `emailEnviado`. `aprovarSolicitacao` **herda** (usa `criarUsuario`). `modal-convidar.tsx` e `aba-solicitacoes.tsx` exibem a senha **sempre** + aviso (enviada por e-mail | envio falhou). `tipos.ts`: `ResultadoCriarUsuario` += `emailEnviado`.

### M4 — Plugada no reset — commit `a70f7e6`
`resetarSenha` idem (`tipo: 'reset'`); **destinatário vem do registro do Auth** (resposta do `updateUserById`), não de input do cliente — assinatura `resetarSenha(userId)` e autorização inalteradas. `aba-usuarios.tsx` exibe a senha **sempre** + aviso. `tipos.ts`: `ResultadoSenha` += `emailEnviado`.

### M5 — Fechamento — este commit
Versão 4.24.0, CHANGELOG, CHANGELOG_DIRETORIA (negócio), ADR-0127, CLAUDE.md (convenção da camada de e-mail), runbook `v4-24-email-runbook.md`, teste `email.test.ts`, out-briefing.

## Auto-auditoria adversarial
- **FALLBACK (exaustivo):** provado por teste vivo — env ausente → `false` sem tentar enviar; erro de envio (`sendMail` rejeita) → `false` sem propagar. O código retorna `{ ok: true, senha, emailEnviado: false }` → criar/resetar **concluem** e a senha segue na tela. A UI exibe a senha **incondicionalmente** (só o aviso varia).
- **ZERO HARDCODE:** `grep` confirma nenhum literal de host/credencial/remetente no código — `config.ts` lê só `process.env.SMTP_*`; `actions.ts` não referencia SMTP; `.env.example` com as 6 chaves vazias. (Valores em `email.test.ts` são fixtures de teste, como o placeholder `pessoa@welcometrips.com.br` que já existia.)
- **1 camada, 2 pontos:** `enviarSenhaProvisoria` é a única lógica de envio; criação e reset a chamam (e Solicitações reusará).
- **Server-only:** `config.ts`/`index.ts` `import 'server-only'`; o `next build` valida que não vazam ao bundle client (as UIs `'use client'` chamam só as server actions, não a camada).

## Gates
`tsc --noEmit` **0** · `lint` **12** (= baseline; **zero novos** — os arquivos tocados lintam limpos) · `npm test` **159** (+10 de `email.test.ts`) · `next build` **limpo**.

## Arquivos
**Novos:** `src/lib/email/{config,template,index}.ts`, `src/lib/email/email.test.ts`, `docs/adr/0127-email-fluxo-acesso-smtp-fallback.md`, `docs/runbooks/v4-24-email-runbook.md`, este out-briefing.
**Modificados:** `src/app/admin/acessos/actions.ts` (criarUsuario + resetarSenha + import), `src/components/admin/acessos/tipos.ts` (2 tipos += `emailEnviado`), `modal-convidar.tsx`, `aba-usuarios.tsx`, `aba-solicitacoes.tsx`, `.env.example`, `package.json` (versão + `nodemailer`), `package-lock.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `CLAUDE.md`.
**Sem migration. Sem mudança de schema.**

## Pendências / fora de escopo (registro, não implementação)
- **Configurar `SMTP_*` na Vercel** (Production) + **Redeploy** — sem isso o envio só funciona local; produção cai no fallback (senha na tela). Runbook `docs/runbooks/v4-24-email-runbook.md` tem o passo-a-passo. **Validar porta 587** no preview.
- **Segurança operacional (fora do código):** a conta SMTP hoje é pessoal e a senha trafegou no chamado — recomenda-se trocá-la após configurar e, quando viável, migrar para um e-mail **dedicado** (só troca de env, zero código).
- **FORA (confirmado):** self-service "esqueci minha senha"; notificações de Solicitações por e-mail (camada pronta, sem template/chamada agora); envio assíncrono/fila; múltiplos provedores.
- **Reconciliação da data do CHANGELOG_DIRETORIA:** a entrada nasceu em `2026-06-22T13:58` (horário real de autoria); reconciliar ao horário do merge quando ele ocorrer (regra do CLAUDE.md).
