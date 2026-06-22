# Runbook v4.24 — E-mail da senha provisória (SMTP)

Como configurar e operar o envio automático da senha provisória (criação de usuário e
reset administrativo). O envio é **OPCIONAL e fallback-safe**: sem SMTP, a senha continua
exibida na tela (copiável) — nada quebra.

---

## 1. Configurar (local e produção)

As variáveis vêm do ambiente (NUNCA do repositório). Chaves já no `.env.example`:

| Variável | Office 365 | Observação |
|----------|-----------|------------|
| `SMTP_HOST` | `smtp.office365.com` | |
| `SMTP_PORT` | `587` | STARTTLS |
| `SMTP_SECURE` | `false` | 587 = STARTTLS (`false`); 465 = TLS direto (`true`) |
| `SMTP_USER` | `conta@welcometrips.com.br` | conta autenticada |
| `SMTP_PASS` | (senha da conta) | segredo |
| `SMTP_FROM` | = `SMTP_USER` | remetente; Office 365 exige = user |

1. **Local:** preencher em `.env.local` (gitignored) e reiniciar `npm run dev`.
2. **Produção (Vercel) — OBRIGATÓRIO p/ funcionar em prod:** Vercel → Project → Settings →
   Environment Variables → adicionar as 6 `SMTP_*` (Production; e Preview se quiser testar
   em preview) → **Redeploy**. Sem isso, o envio só funciona local e a produção cai no
   fallback (senha na tela).

## 2. Validar

- Criar um usuário de teste em `/admin/acessos` (com um e-mail real seu) → deve chegar o
  e-mail **"WT Finance — seu acesso foi criado"** com a senha; a tela mostra *"A senha
  provisória foi enviada por e-mail para …"*. Resetar a senha do mesmo usuário → e-mail
  **"sua senha foi redefinida"**. Apague o usuário de teste em seguida.
- **Porta 587** no preview/produção: confirmar que a saída SMTP (587) não está bloqueada no
  ambiente da Vercel — se aparecer o aviso âmbar *"Não foi possível enviar o e-mail"*, o
  fallback cobriu, mas o envio não saiu (checar credenciais/porta/Redeploy).

## 3. Quando o e-mail NÃO chega

Nunca trava o fluxo — a senha está sempre na tela (copiável) + aviso âmbar "envio falhou".
Diagnóstico:

1. As 6 `SMTP_*` estão no ambiente? (local: `.env.local`; prod: Vercel + **Redeploy**.)
2. `SMTP_FROM` == `SMTP_USER`? (Office 365 recusa remetente ≠ conta autenticada.)
3. Credenciais corretas? (senha da conta; com MFA, pode exigir "senha de app".)
4. Logs do servidor: `[email] falha ao enviar senha provisória …` (Vercel → Logs) ou
   `[email] SMTP não configurado …` (faltam variáveis).

## 4. Segurança

A conta SMTP hoje é pessoal e a senha trafegou no chamado — recomenda-se **trocá-la após
configurar** e, quando viável, migrar para um e-mail **dedicado** (só troca das envs
`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`, zero código/deploy). Credenciais só em
`.env.local`/Vercel, nunca no git.
