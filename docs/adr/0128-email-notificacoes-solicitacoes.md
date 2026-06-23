# ADR-0128 — Notificações por e-mail no módulo de Solicitações (fan-out gated, fallback-safe)

**Data:** 2026-06-22 · **Versão:** 4.25.0 (MINOR) · **Status:** aceito

## Contexto

O módulo de Solicitações (tarefas; `app.solicitacao`) tem 4 movimentações — criar, concluir, rejeitar, cancelar — entre um autor (solicitante) e um destinatário que é **UM usuário OU uma role** (todos os membros). Até a v4.24 não havia aviso: a outra ponta só via a mudança ao abrir a plataforma. A v4.25 notifica os **envolvidos** por e-mail a cada movimentação, reusando a camada de e-mail da v4.24 (ADR-0127).

Restrições: (a) o e-mail é camada **ADICIONAL** — jamais pode quebrar a movimentação (como na v4.24); (b) atribuir a uma role exige expandir role→membros **sem expor o diretório** de usuários; (c) o fan-out a N destinatários deve ser **best-effort**.

## Decisão

1. **RPC de fan-out gated (`solic_emails_envolvidos`, migrations 0156/0157):** `SECURITY DEFINER`, gated por `app.pode_ver_solic` (mesma fronteira do módulo), devolve SÓ os e-mails daquela solicitação — autor + destinatário usuário OU todos os membros **ativos** da role — mais o contexto mínimo do corpo. **Não é um diretório:** quem não vê a solicitação não obtém e-mails; "não existe" e "não pode ver" dão o **mesmo** erro (sem oráculo de existência — padrão `solic_detalhe`, fechado na 0157 pela auto-auditoria adversarial). Born-hardened (REVOKE PUBLIC/anon; GRANT authenticated/service_role).
2. **Camada de e-mail reusada (`src/lib/email/`):** `enviarNotificacaoSolicitacao` reaproveita transporter/logo/config/`getAppBaseUrl` da v4.24 (núcleo de envio compartilhado — `criarTransporter`/`anexoLogo`, sem duplicar). Template Outlook-safe (tabelas/inline/CID/botão em célula) seguindo `docs/email-layout-guide.md`.
3. **E-mail único factual para todos os envolvidos** (decisão de produto): mesmo conteúdo para autor + destinatário(s); **quem age também recebe** (recibo); parametrizado pela movimentação (criada/concluída/rejeitada/cancelada); a **rejeição inclui a justificativa**. Link à **caixa** `/solicitacoes` (não há deep-link — futuro).
4. **Fan-out best-effort, fallback-safe:** um `sendMail` por destinatário via `Promise.allSettled` (a falha de um não derruba os outros); a função **nunca lança** (retorna `{enviados,total}`). Plugada nas 4 actions **APÓS** a persistência, em try/catch — o e-mail jamais quebra a movimentação.
5. **`await` na server action (não fire-and-forget):** em serverless o trabalho após a resposta é morto no freeze; awaitar garante a entrega. A latência (limitada pelo timeout curto do transporter) é aceita; a integridade já está garantida.

SEM mudança de schema de dados (só uma RPC nova). Migration **aditiva** (0156 cria; 0157 endurece o gate).

## Alternativas consideradas

- **Reusar `solic_destinatarios` / `admin_listar_usuarios` para os e-mails da role:** Rejeitada — `solic_destinatarios` não mapeia usuário→role; `admin_listar_usuarios` é gestão-only (um autor comum não tem) e exporia o diretório. A RPC dedicada gated resolve sem vazar.
- **Um e-mail com todos em `bcc`:** Rejeitada — o fan-out por-destinatário isola falhas (best-effort) e não acopla os envios; o volume é pequeno.
- **Fire-and-forget (não awaitar):** Rejeitada — em serverless (Vercel) perderia e-mails (a função congela após a resposta).
- **Ramificar o e-mail por papel (autor vs destinatário):** Rejeitada (produto) — e-mail único factual é mais simples e suficiente; quem age recebe um recibo.
- **Deep-link para a solicitação:** Fora de escopo (não há rota `/solicitacoes/[id]`); link à caixa. Futuro.

## Consequências

- **Movimentações nunca quebram por e-mail.** Provado (revisão adversarial): try/catch + função never-throws + ordem pós-persistência nas 4 actions.
- **Sem vazamento de PII/diretório.** Provado no banco: o gate `pode_ver_solic` nega não-envolvidos não-gestão; o fan-out pega só membros ativos daquela role; o oráculo de existência foi fechado (0157).
- **Latência:** a confirmação da movimentação espera o envio (teto ~10s se o SMTP travar; sub-segundo no caminho feliz, sends paralelos). Aceito; mitigável reduzindo o timeout do transporter de notificação se incomodar (registrado no out-briefing).
- **Volume:** pior caso = N e-mails (role grande). Hoje ~4 usuários; Office 365 próprio, sem teto relevante.
- **Operacional:** depende de `SMTP_*` + `APP_BASE_URL` na Vercel (runbook v4.24); sem isso, cai no fallback (não envia, movimentação segue).
