# WT Finance — Out-Briefing v4.25.1

**Data:** 2026-06-23 · **Branch:** `feat/v4-25-1-email-notif-ajustes` (base `main` @ v4.25.0) · **Versão:** 4.25.0 → **4.25.1** (PATCH)
**Tema:** Refino **visual/cosmético** do e-mail de notificação de Solicitações (introduzido na v4.25.0) + coerência de cores com a página de Movimentações. Migration **aditiva** (0158, `CREATE OR REPLACE`). **Refina ADR-0128 — sem ADR novo.** **Merge e deploy ficam com o usuário.**

---

## Origem
Após a v4.25.0 em produção, o usuário pediu um patch cosmético sobre o e-mail de notificação, com mockup aprovado:
- Remover a saudação **"Olá,"**.
- Acrescentar **data/hora** da movimentação ("Solicitação criada · 23/06/2026 às 10:04").
- **"Acessar a plataforma" como botão de verdade** (o anterior renderizava como tarja apertada).
- Exibir **NOMES** (nome do usuário / nome da permissão), não e-mails crus (que viravam links `mailto:` azuis).
- **"Atribuída a {nome}, por {nome}"** — sem a palavra **"permissão"**.
- **Variante cancelada em cinza** + **alinhar as badges da página Movimentações** às novas cores de status, para coerência.

## Missões

### M1 — RPC devolve NOMES + DATAS (migration 0158) — aditiva
`CREATE OR REPLACE public.solic_emails_envolvidos(p_id bigint)` (mesma assinatura → preserva grants; não altera tabela/dado). Novo retorno:
- `autor_rotulo` = `coalesce(nullif(btrim(nome),''), email)` do solicitante.
- `atribuido_rotulo` = **nome da role** (destinatário role) OU `coalesce(nome, email)` do usuário (destinatário usuário).
- `criado_em_fmt` / `decidido_em_fmt` = `to_char(... AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY" às "HH24:MI')` (null se ainda não decidida).
- `envolvidos_emails[]` inalterado. Removidos `autor_email` / `atribuido_tipo` (o template não os usa mais).
- **Gate `pode_ver_solic` + oráculo de existência fechado** (RAISE único `NAO_ENCONTRADA`/42501) **preservados** da 0157. Born-hardened (REVOKE PUBLIC/anon; GRANT authenticated/service_role).

### M2 — Layout do e-mail + camada/contrato
- **`template.ts` (`templateNotificacaoSolicitacao`):** sem "Olá,"; **data/hora** sob o título (`dataLinha`, só quando há `quando`); **badge de status colorido** por movimentação (`MOV_COR`: criada `#BD965C`, concluída `#5F7A3D`, rejeitada `#A35442`, **cancelada `#75777B`**) com **faixa lateral** (`border-left:3px`); **botão real** com `padding` na **célula** `<td bgcolor>` (corrige o "tarjado apertado"); "Atribuída a **{nome}**, por **{nome}**" (negrito nos nomes, **sem "permissão"**). `templateSenhaProvisoria` intocado (byte-idêntico). Novo param `quando?`, removido `atribuidoTipo`.
- **`index.ts` (`enviarNotificacaoSolicitacao`):** input ganha `quando?`, perde `atribuidoTipo`; repassa ao template. Fan-out best-effort / nunca-lança / dedupe inalterados.
- **`schemas.ts` (`emailsEnvolvidosSchema`):** novo shape (`autor_rotulo`, `atribuido_rotulo`, `criado_em_fmt`, `decidido_em_fmt`, `tipo_nome`, `envolvidos_emails`), todos `.nullable()` exceto o array.
- **`actions.ts` (`notificarMovimentacao`):** deriva `quando` = `criado_em_fmt` para `'criada'`, `decidido_em_fmt` para as demais; passa `atribuidoRotulo`/`autorRotulo`/`quando`.

### M3 — Coerência das badges de Movimentações
`movimentacoes-content.tsx` (`acaoBadge`): Abertura→dourado (`--brand`/`--brand-soft`/`--brand-deep`; tela de plataforma SEM `[data-theme]` → `--brand`=#BD965C estável, sem flash), Conclusão→verde (`success`), Rejeição→vermelho (`danger`), **Cancelamento→cinza** (`zinc-100`/`zinc-500`; era âmbar/warning). Mesma paleta semântica do e-mail.

### M4 — Fechamento (este commit)
Versão 4.25.1, CHANGELOG.md, CHANGELOG_DIRETORIA (negócio), out-briefing. CLAUDE.md avaliado (nada permanente novo — refina regras de e-mail já documentadas).

## Auto-auditoria
- **Invariantes da v4.25.0 preservados:** o e-mail segue camada ADICIONAL (try/catch em `notificarMovimentacao`, `enviar*` nunca lança); a RPC mantém o gate `pode_ver_solic` e o oráculo fechado (0158 herda a estrutura da 0157 — verificado: `IF NOT FOUND OR NOT pode_ver_solic → RAISE NAO_ENCONTRADA/42501`); não vaza diretório (mesmo `UNION` de e-mails daquela solicitação; `nome`/role apenas dos já-envolvidos).
- **Verificação no banco (pg, JWT de gestor simulado):** #7 → `{autor_rotulo:"Yan", atribuido_rotulo:"Financeiro", criado_em_fmt:"14/06/2026 às 12:07", envolvidos_emails:[3]}`; #8 → `{atribuido_rotulo:"Yan", decidido_em_fmt:"23/06/2026 às 09:53"}`.
- **Nada destrutivo:** `CREATE OR REPLACE` de função; nenhuma coluna/dado tocado.

## Gates
`tsc --noEmit` **0** · `lint` zero problemas **nos arquivos alterados** (débito pré-existente do repo intocado — `react-hooks/set-state-in-effect` em `weddings/*`, `financeiro/*`, etc.) · `npm test` **174** verde (email 25/25) · `next build` **limpo**. Migration 0158 aplicada via backup-gate (aditiva) e verificada no banco.

## Migrations
- **0158** `solic_emails_envolvidos_nomes_datas.sql` — aditiva (`CREATE OR REPLACE`).

## Arquivos modificados
- `supabase/migrations/0158_solic_emails_envolvidos_nomes_datas.sql` (novo)
- `src/lib/email/template.ts`
- `src/lib/email/index.ts`
- `src/lib/email/email.test.ts`
- `src/lib/solicitacoes/schemas.ts`
- `src/app/solicitacoes/actions.ts`
- `src/components/solicitacoes/movimentacoes-content.tsx`
- `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`, `package-lock.json`, `src/lib/version.ts` (via pkg)

## Pendências / follow-ups
- Configurar `SMTP_*` na Vercel (herdado da v4.24/v4.25.0 — sem isso o envio cai no fallback, sem quebrar nada).
