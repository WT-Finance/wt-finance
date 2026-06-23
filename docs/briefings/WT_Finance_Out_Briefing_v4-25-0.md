# WT Finance — Out-Briefing v4.25.0

**Data:** 2026-06-22 · **Branch:** `feat/v4-25-0-email-solicitacoes` (base `main` @ v4.24.2) · **Versão:** 4.24.2 → **4.25.0** (MINOR)
**Tema:** Notificações por e-mail nas 4 movimentações do módulo de **Solicitações (tarefas)**. Migration **aditiva** (0156 + 0157). **ADR-0128.** Reusa a camada de e-mail da v4.24. **Merge e deploy ficam com o usuário.**

---

## Invariantes (todos provados — ver auto-auditoria)
1. **O e-mail NUNCA quebra a movimentação** — criar/concluir/rejeitar/cancelar concluem mesmo se RPC/SMTP falhar.
2. **A RPC de fan-out NÃO vaza usuários** — só os e-mails daquela solicitação, só a quem a vê.
3. **Fan-out best-effort** — falha de 1 destinatário não derruba os outros nem a movimentação.

## Missões (M1–M4)

### M1 — RPC de fan-out (migrations 0156 + 0157) — commit `464f370`
- **`public.solic_emails_envolvidos(p_id bigint)`** `SECURITY DEFINER`, gated por `app.pode_ver_solic`: devolve `{ tipo_nome, autor_email, atribuido_tipo, atribuido_rotulo, envolvidos_emails[] }`. Envolvidos = autor (sempre) + destinatário usuário (sempre) **OU** todos os membros **ativos** da role. Só os e-mails **daquela** solicitação (nunca um diretório). Born-hardened (REVOKE PUBLIC/anon; GRANT authenticated/service_role).
- **0157 (da auto-auditoria adversarial):** colapsa `NAO_ENCONTRADA` + `PERMISSAO_NEGADA` num só erro (`NAO_ENCONTRADA` / 42501), igual ao `solic_detalhe` — fecha o **oráculo de existência** (um autenticado não distingue id inexistente de proibido via REST). Mantive a 0156 como aplicada e adicionei a 0157 (sem drift file×prod).

### M2 — Função + template de e-mail — commit `49cf832`
- **`templateNotificacaoSolicitacao`** (template.ts): Outlook-safe (tabelas/inline/logo CID/botão em célula/responsivo), parametrizado por criada/concluída/rejeitada/cancelada; **justificativa só na rejeição**; saudação genérica (vai a vários); link à **caixa** `/solicitacoes`.
- **`enviarNotificacaoSolicitacao`** (index.ts): N destinatários, **fan-out best-effort** (`Promise.allSettled`, 1 `sendMail`/destinatário, falha isolada), **nunca lança**, retorna `{enviados,total}`, dedupe. **Reusa** transporter/logo/config/`getAppBaseUrl` da v4.24 via `criarTransporter`/`anexoLogo` compartilhados; `enviarSenhaProvisoria` refatorado p/ usá-los — comportamento **byte-equivalente** (revisão confirmou vs `git HEAD`).
- **+10 testes** (`email.test.ts`): template ×4 movimentações + justificativa-só-rejeição + escape; envio sem-config/todos/falha-de-um/dedupe/paras-vazio.

### M3 — Plugado nas 4 movimentações — commit `7f278c1`
`notificarMovimentacao(id, mov, justificativa?)` (try/catch que jamais quebra a movimentação) chamado **após** a RPC retornar sem erro, nas 4 actions. `schemas.emailsEnvolvidosSchema` + `rpc.getEmailsEnvolvidos`.

### M4 — Fechamento — este commit
Versão 4.25.0, CHANGELOG, CHANGELOG_DIRETORIA (negócio), ADR-0128, nota de **fan-out** em `docs/email-layout-guide.md §8`, out-briefing.

## Auto-auditoria adversarial (Workflow — 5 revisores independentes)
- **Inv. 1 (fallback):** confirmado — `notificarMovimentacao` 100% em try/catch; `getEmailsEnvolvidos` (parseRpc) retorna null, não lança; `enviarNotificacaoSolicitacao` nunca lança; notificação só pós-persistência nas 4.
- **Inv. 2 (não-vaza):** confirmado no banco (pg, JWT simulado) — autor vê; **carine/tiago (ativos, não-gestão, não-envolvidos) → NEGADOS**; role fan-out = autor + membros ativos; gestão vê (por design); **oráculo fechado** (0157 verificada: id inexistente ≡ proibido).
- **Inv. 3 (best-effort):** confirmado — `Promise.allSettled` isola falhas; nada lança.
- **Conformidade com o prompt:** 100% — e-mail único; **"quem age também recebe" PROVADO** nas 4 transições (autorização da ação ⊆ lista de envolvidos); justificativa só na rejeição; link à caixa; reuso sem duplicar; sem escopo novo.
- **Achado corrigido:** o oráculo de existência (M1/0157). **Achados registrados (não-alterados, por design/decisão):** latência (abaixo), e-mail factual nomeia o **autor** (não o ator) por decisão do prompt, autor/destinatário inativos recebem (partes fixas; membros de role filtrados por ativo).

## Gates
`tsc --noEmit` **0** · `lint` **12** (= baseline, zero novos) · `npm test` **174** (+10) · `next build` **limpo**. Migrations 0156/0157 aplicadas via backup-gate (VERDE) e verificadas no banco.

## Arquivos
**Novos:** `supabase/migrations/0156_*.sql`, `0157_*.sql`, `docs/adr/0128-*.md`, este out-briefing.
**Modificados:** `src/lib/email/{template,index}.ts` + `email.test.ts`, `src/app/solicitacoes/actions.ts`, `src/lib/solicitacoes/{schemas,rpc}.ts`, `docs/email-layout-guide.md` (§8), `package.json`/`package-lock.json`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`.
**`templateSenhaProvisoria` (v4.24) intocado.** Sem mudança de schema de dados.

## Pendências / fora de escopo (registro)
- **Latência (média, aceita):** as 4 actions `await`am o envio antes de responder (teto ~10s se o SMTP travar; sub-segundo no caminho feliz, sends paralelos). É a escolha **segura** em serverless (fire-and-forget perderia e-mails no freeze da função). Mitigável reduzindo o timeout do transporter de notificação se a UX incomodar — **decisão do Yan**, não alterado.
- **`APP_BASE_URL` + `SMTP_*` na Vercel** seguem necessários (runbook v4.24); sem `APP_BASE_URL` o e-mail omite o botão; sem SMTP, cai no fallback (não envia, movimentação segue).
- **FORA (confirmado):** deep-link `/solicitacoes/[id]` (não existe rota — futuro); opt-out/preferências de notificação; "notificado em" (sem tabela de eventos); digest; e-mail de comentário/mudança de campo.
- **Reconciliação de data** do CHANGELOG_DIRETORIA (autoria 23:16 vs merge) — passe futuro.
