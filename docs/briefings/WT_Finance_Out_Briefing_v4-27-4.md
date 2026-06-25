# WT Finance — Out-Briefing v4.27.4

**Data:** 2026-06-25 · **Branch:** `fix/v4-27-4-email-botao-acesso` (base `main` @ v4.27.3) · **Versão:** 4.27.3 → **4.27.4** (PATCH)
**Tema:** Botão "Acessar a plataforma" do e-mail de acesso/senha — render correto no Outlook. **SEM migration, sem ADR.** **Merge e deploy ficam com o usuário.**

## Contexto
O e-mail de **senha provisória** (criação de usuário / redefinição) renderizava o CTA "Acessar a plataforma" como **"texto com fundo preto apertado"** no Outlook (Image do Yan), enquanto o e-mail de **Solicitações** mostra um **botão retangular** de verdade. Patch separado pedido pelo Yan durante o polimento pré-merge da v4.28.0 — como é **subsistema diferente** (templates de e-mail, não a Calculadora de Rateio), entra como patch próprio (decisão do Yan: "patch próprio").

## Causa
Em `src/lib/email/template.ts`, o botão do e-mail de acesso tinha o **`padding` no `<a>`** (`padding:13px 32px`) com a célula `<td>` só com `border-radius`. O Outlook **ignora `padding`/`background` em `<a>` inline** → o fundo (bgcolor da célula) só cobria o texto justo → "tarjado apertado". O botão de Solicitações (v4.25.1) já tinha sido corrigido pondo o **`padding` na célula `<td>`**.

## Fix (1 bloco)
Botão do e-mail de acesso alinhado ao padrão da v4.25.1: `<td bgcolor=... style="border-radius:12px;padding:14px 34px;">` + `<a>` sem padding (só `display:inline-block` + tipografia). Idêntico ao botão de Solicitações → botão retangular de verdade, inclusive no Outlook. Comentário do código atualizado para registrar o porquê (padding na célula).

## Gate de fechamento
- `npx tsc --noEmit` → **0** em `src/`.
- `npm run lint` → **limpo**.
- `npm test` → verde (o teste `email.test.ts` valida a presença do texto/link do botão — segue passando; o markup mudou só o padding).
- `npm run build` → **limpo**.

## Verificação
Conferência no Outlook real (Yan, pós-deploy): o botão "Acessar a plataforma" do e-mail de senha aparece retangular, igual ao de Solicitações.

## Arquivos
- **Modificado:** `src/lib/email/template.ts` (botão do e-mail de acesso).
- **Fechamento:** `package.json`/`package-lock.json` (4.27.4), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing.

## Nota
Independente do PR #151 (v4.28.0 — Calculadora de Rateio), que segue aberto. Arquivos disjuntos → os dois PRs mergeiam em qualquer ordem. Se a v4.28.0 for mergeada **antes** deste, reconciliar o número (este viraria v4.28.1) — ou mergear este primeiro (ordem 4.27.3 → 4.27.4 → 4.28.0).
