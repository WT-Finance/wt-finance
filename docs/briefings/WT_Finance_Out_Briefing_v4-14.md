# WT Finance — Out-Briefing v4.14

**Data:** 2026-06-11 · **Branch:** `feat/v4-14` · **Versão:** 4.13.1 → **4.14.0** (MINOR)
**Tema:** Login por **e-mail + senha** substitui o magic link como método primário (pedido do usuário: magic link confuso, atrito alto). Senha provisória **exibida na tela** do admin (sem dependência de SMTP), troca obrigatória no 1º acesso, e **solicitações de acesso** moderadas. Execução autônoma com freios de emergência para voltar à v4.12.1. **Merge e deploy permanecem com o usuário.**

---

## Missões / commits

| Commit | Conteúdo |
|--------|----------|
| `a9cbbe3` `feat(v4.14-m1)` | Banco do login por senha: **migration 0125** (flag `precisa_trocar_senha`, tabela `rbac_solicitacoes`, RPCs novas, seed role **Administrador**) + **ADR 0110**. |
| `0477d74` `feat(v4.14-m2)` | App: login por senha (`/login`), **troca obrigatória** (`/trocar-senha`, portão em página/API/action), **solicitação pública** (`/solicitar-acesso`); proxy/layout/page ajustados. |
| `47c5790` `feat(v4.14-m3)` | Admin `/admin/acessos`: **Criar usuário** com senha provisória na tela, **Resetar senha**, aba **Solicitações** (aprovar cria usuário; rejeitar). |
| `3114b42` `chore(v4.14-m4)` | versão 4.14.0, `CHANGELOG.md`, `CHANGELOG_DIRETORIA`, runbook §0, CLAUDE.md, 2 testes de contrato. |

## Migration (aplicada em produção — aditiva e inerte para a v4.13.1 em produção)
- **0125** `auth_senha_solicitacoes`: coluna `app.rbac_usuarios.precisa_trocar_senha` (cutover marca **todos** os usuários atuais = true); tabela `app.rbac_solicitacoes` (RLS deny-default, índice parcial único por e-mail pendente, grants revogados); RPCs `marcar_senha_trocada` (authenticated, próprio flag), `admin_marcar_trocar_senha` (admin), `solicitar_acesso` (anon, pré-cadastro), `admin_listar_solicitacoes`/`admin_decidir_solicitacao` (admin); seed role **Administrador** (todas as áreas) + reatribui o usuário seed.
- Config GoTrue: `password_min_length = 8`. Senha provisória gerada com ≥16 caracteres.
- Verificada via REST: `solicitar_acesso` aberto a anon (`{ok:true}`); `admin_*` e `marcar_senha_trocada` negados a anon (401 *permission denied*); flag e role corretas.

## ADR
- **0110** — login por senha + solicitações moderadas. Alternativas rejeitadas: manter só magic link (atrito); senha provisória **por e-mail** (reintroduz dependência de SMTP); OAuth Google (evolução futura); auto-cadastro sem moderação. A senha provisória **na tela** resolve a entrega sem SMTP.

## Verificação ponta-a-ponta no preview — **21/21 PASS**
Fluxo real exercido no deploy do branch com **usuário de teste descartável** (criado e removido; **zero resíduo em produção**), gerando o cookie de sessão com a própria `@supabase/ssr` (formato idêntico ao do app):
- Login com a senha provisória → portão força `/trocar-senha` (página `307`, API `403 TROCA_SENHA_OBRIGATORIA`, action `throw`).
- Troca de senha → flag desliga → re-login com a nova senha funciona → **provisória antiga rejeitada** → acesso liberado (sem mais portão).
- Rotas públicas (`/login`, `/solicitar-acesso`) `200`; protegidas (`/executiva`, `/trocar-senha`) sem sessão → `307 /login?next=`.
- Adversarial anônimo: `admin_listar_solicitacoes`/`admin_decidir_solicitacao`/`admin_marcar_trocar_senha` → `401`; `solicitar_acesso` abre p/ anon, idempotente (não duplica pendente), rejeita e-mail inválido, retorno uniforme (sem enumeração).

## Auto-auditoria adversarial — sem achados bloqueantes
- **Open-redirect** no `next` do login: bloqueado por `nextSeguro` (rejeita `//`, `\`, `%2f`/`%5c`, `/auth*`).
- **Bypass do portão de troca:** enforçado nas 4 camadas (proxy=sessão → guards página/API/action → RPC → RLS); toda action de admin abre com `requireAreaAction('admin/acessos')`.
- **`solicitar_acesso`:** público, mas `SECURITY DEFINER` sem `exigir_acesso` (pré-cadastro); cria **só** uma pendência (o usuário só nasce na aprovação do admin); resposta `{ok:true}` uniforme → **sem enumeração**; idempotente por e-mail.
- **Aceito (não bloqueante):** um usuário já autenticado pode limpar o próprio flag via `marcar_senha_trocada` sem trocar a senha — **não concede privilégio** (já está autenticado como ele mesmo), apenas mantém uma senha que o admin já conhece. Coerente com o modelo de confiança interno; endurecer exigiria acoplar o flag (schema `app`) ao estado de senha (schema `auth`), inviável de forma limpa numa função DEFINER.

## Cutover (não-quebra) e bootstrap do admin
- Usuários atuais (magic link, **sem senha**) foram marcados para definir senha: entram **uma vez** por um "Link" de recuperação gerado no admin e caem em `/trocar-senha`. Ninguém perde acesso no merge.
- **Sem deadlock:** `/trocar-senha` exige só **sessão** (não chama `requireAreaAction`), então o admin flagueado consegue definir a senha antes de acessar o painel. `/auth/*` continua público no proxy → o magic link de recuperação sobrevive. O 1º admin se auto-resgata por um magic link do Dashboard → `/auth/confirm` → `/trocar-senha` → senha → `/admin/acessos`.

## 🛑 Freios de emergência (runbook §0 atualizado)
- **Voltar à v4.12.1 (app público):** Vercel → Deployments → deployment da v4.12.1 → *Promote to Production* **+** `select public.admin_set_enforcement(false)`.
- **Voltar só ao magic link (v4.13.1):** promover o deployment da v4.13.1.
- Migrations **0119–0125 são todas aditivas** — nenhuma quebra essas versões.

## Pendências / follow-up
- **⚠️ SMTP próprio (a configurar — recomendado, não bloqueante).** O e-mail nativo do Supabase tem limite baixo (≈2 mensagens/hora) e **segue não configurado**. Por isso a v4.14 foi desenhada para **não depender de e-mail**: a senha provisória (no Criar usuário / Resetar senha) é **exibida e copiável na tela** do admin, para repasse manual à pessoa. Enquanto o SMTP próprio não for configurado:
  - **Não há** envio automático de senha provisória, link de convite, nem "esqueci a senha" por e-mail — a entrega é manual (copiar da tela / link copiável).
  - O onboarding em lote fica apertado (limite de e-mails/hora) caso se volte a depender de e-mail.
  - **Como resolver:** Dashboard Supabase → **Project Settings → Auth → SMTP** (provedor próprio: SendGrid/Resend/SES/etc.). Depois disso, dá para reativar entrega de senha/links por e-mail e o reset self-service. Até lá, o fluxo na tela cobre 100% da operação.
- **Ativação pós-merge** (runbook §0/§1): confirmar produção nova no ar; o admin define a própria senha via magic link do Dashboard; criar/resetar os demais usuários por `/admin/acessos`.
- **Fechar signup público do GoTrue** (defesa em profundidade): Dashboard → Authentication → desmarcar "Allow new users to sign up" (uma conta-fantasma sem registro RBAC já não lê nada).

## Arquivos (principais)
- **Banco:** `supabase/migrations/0125_auth_senha_solicitacoes.sql`.
- **App core:** `src/lib/auth/sessao.ts` (flag + portão nos 3 guards), `src/proxy.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/login/{page,actions}.ts(x)`, `src/app/trocar-senha/{page,actions}.ts(x)`, `src/app/solicitar-acesso/{page,actions}.ts(x)`.
- **Admin:** `src/app/admin/acessos/{page,actions}.ts(x)`, `src/components/admin/acessos/**` (modal criar, aba usuários, aba solicitações, tipos).
- **Tipos/test:** `src/types/database.ts` (6 RPCs), `src/lib/rpc-contrato.test.ts` (2 contratos novos).
- **Docs:** ADR `0110`, runbook §0, `CHANGELOG.md` [4.14.0], `CHANGELOG_DIRETORIA`, CLAUDE.md (seção Auth atualizada).

## Gates
`npm test` 87 verde · `npx tsc --noEmit` 0 erros · `npm run lint` **13** (baseline mantido) · `npm run build` limpo.

---

**PR:** [#104](https://github.com/WT-Finance/wt-finance/pull/104) — `feat/v4-14` → `main`. Merge e deploy ficam com o usuário.
