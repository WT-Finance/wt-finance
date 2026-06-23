# Guia de layout de e-mail — WT Finance

Como construir e-mails neste projeto: a camada, os padrões **à prova de Outlook** (que
custaram caro nas v4.24.0–v4.24.2) e a **receita para um novo e-mail**. Leia isto antes
de criar qualquer template novo (notificações de Solicitações, alertas, etc.).

> **TL;DR:** tudo em **tabelas + estilo inline**; botão em **célula de tabela** (`<td bgcolor>`);
> centralizar por `align`, nunca `margin:auto`; logo **transparente rasterizado do SVG** via
> **CID**; imagem **nunca** por `path` de `public/` nem `data:` URI; e **conferir no Outlook
> real** antes de declarar pronto — o preview de navegador não pega o que o Outlook quebra.

---

## 1. A camada (`src/lib/email/`)

| Arquivo | Papel |
|---|---|
| `config.ts` | Lê `SMTP_*` e `APP_BASE_URL`/`VERCEL_PROJECT_PRODUCTION_URL` de `process.env`. **Fallback-safe**: faltando config → `null`, **nunca lança**. Expõe `getConfigSmtp()`, `getAppBaseUrl()`. |
| `template.ts` | Funções **puras** que montam `{ assunto, html, text }`. É onde vive o LAYOUT. |
| `index.ts` | `enviarSenhaProvisoria()` — usa `nodemailer`, timeout ~10s, **retorna `boolean`, NUNCA lança**. Anexa o logo via CID. |
| `logo.ts` | Bytes do logo em **base64 no bundle** — anexado como attachment MIME (CID). |

**Invariantes (não quebrar):**
- **Envio é camada ADICIONAL.** A função de envio retorna `boolean` e **nunca lança**; quem chama tem fallback (ex.: senha exibida na tela). SMTP off/erro → `false`, o fluxo segue.
- **Zero hardcode.** Credenciais, **remetente** e **URL base** só de `process.env` (`.env.local`/Vercel). Nada no código nem valores no `.env.example` (só as chaves).
- **server-only.** `config.ts`/`index.ts` importam `'server-only'`. Em teste: `vi.mock('server-only', () => ({}))` (senão o import quebra no Node do vitest).

## 2. Regras de ouro do HTML (à prova de Outlook)

O Outlook desktop usa o **motor do Word** — ignora muito CSS moderno. O que custou caro:

1. **Tabelas, não `div`+flex/grid.** Estruture tudo com `<table role="presentation">` aninhadas. `margin:auto` **não centraliza** no Outlook.
2. **Estilo INLINE** no essencial. `<head>`/classes não são confiáveis; o único `<style>` é o da media query (§3).
3. **Botão = CÉLULA DE TABELA.** O Outlook **ignora `background` em `<a>` inline** → o link vira texto cru (foi o bug da v4.24.1). Use:
   ```html
   <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
     <td align="center" bgcolor="#1A1814" style="border-radius:8px;">
       <a href="..." style="display:inline-block;padding:13px 32px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Rótulo</a>
     </td>
   </tr></table>
   ```
   `border-radius` não aparece no Outlook (botão quadrado lá — aceitável).
4. **Centralizar por `align="center"`** na `<td>`/`<table>` — nunca por `margin:0 auto`.
5. **Logo: PNG TRANSPARENTE rasterizado do SVG.** Um PNG "transparente" pode ter **fundo baked-in** (vira **caixa preta** no Outlook — foi o bug da v4.24.1). Cheque com sharp (`metadata().hasAlpha` deve ser `true`; amostre um canto 1px). Gere do SVG:
   ```ts
   sharp('public/logos/welcome-group.svg', { density: 300 }).resize({ width: 480 }).png()
   ```
6. **Imagem por CID, com os BYTES no bundle.** `<img src="cid:welcome-logo" alt="...">` + attachment (`Buffer.from(base64)` em `logo.ts`) no `sendMail`. **Nunca** `path:'public/...'` (não é legível por `fs` em runtime serverless na Vercel) **nem** `data:` URI no `<img>` (Outlook não renderiza). Sempre com `alt`.
7. **Fontes web-safe.** `Arial,Helvetica,sans-serif` (corpo) e `'Courier New',Consolas,monospace` (dados/senha). A fonte da marca (Avenir) **não carrega** em e-mail.
8. **Cores em hex inline** — e-mail não aceita CSS var. Use **constantes nomeadas** derivadas dos tokens do DS (ver topo de `template.ts`: `COR_TITULO #1A1814`, `COR_TEXTO #4B4F54`, `COR_LABEL #75777B`, `COR_TENUE #9A9CA0`, `COR_LINHA #E0DDD5`, `COR_BORDA #ECEAE4`, `COR_FUNDO #F4F4F2`, `COR_SENHA_BG #FAF8F4`).

## 3. Responsividade

- **Cartão fluido:** `width="480"` (atributo, p/ Outlook desktop) **+** `style="width:100%;max-width:480px"` (encolhe no mobile).
- **Media query** num `<style>` no topo do html, mirando **classes** (`.em-card`/`.em-pad`/`.em-senha`): em `≤480px` reduz o respiro lateral e a fonte dos dados. Funciona em iOS/Apple Mail/Gmail; o Outlook desktop ignora `@media` (mas roda em tela larga, sem problema). **O inline é o piso**; a media query é melhoria progressiva.
- Texto longo/senha: `word-break:break-all` para não estourar em telas estreitas.

## 4. Anatomia do template atual (referência)

`templateSenhaProvisoria({ nome?, senha, tipo, linkAcesso? })` → `{ assunto, html, text }`:
- **Sempre** gere também o `text` (plain), espelhando o conteúdo (sem negrito/divisória/botão — só o link como URL).
- **Hierarquia:** logo (transparente, centralizado) → divisória → saudação/propósito → **dado-herói** (a senha, em mono destacada num cartão) → **CTA** (botão, só se houver `linkAcesso`) → nota de segurança → nota discreta → rodapé.
- **Escape:** passe entradas do usuário por `escaparHtml` no html (nome na saudação, senha, `href` do link).

## 5. Receita: adicionar um NOVO e-mail

1. **2º template chegando? EXTRAIA O SHELL primeiro.** Hoje há **um** template, então o scaffold (outer table, logo, cartão, rodapé, media query, helper do botão) vive dentro de `templateSenhaProvisoria`. Ao criar o **segundo**, extraia esse scaffold para um `layoutBaseEmail({ corpoHtml, preheader? })` reutilizável e deixe cada e-mail só com o **conteúdo + assunto**. (YAGNI até o 2º; aí refatore — evita divergência de layout entre e-mails.)
2. **Função de template pura** nova em `template.ts` (ou um módulo por e-mail) devolvendo `{ assunto, html, text }`, reusando o shell.
3. **Função de envio** nova em `index.ts` (ex.: `enviarNotificacaoX`) com o **mesmo contrato**: `Promise<boolean>`, nunca lança, timeout curto, anexa o logo (CID), links via `getAppBaseUrl()`. Considere um helper interno comum de transporte (não duplicar `nodemailer.createTransport` + try/catch).
4. **Quem chama** trata como adicional (try/catch + fallback); estenda o retorno com `xEnviado: boolean` se a UI precisar avisar (verde "enviado" / âmbar "falhou — …").
5. **Teste** (`email.test.ts` ou irmão): `vi.mock('server-only')` + `vi.mock('nodemailer')`; asserte assunto, presença do dado no html **e** no text, escape, e os **ramos de fallback** (sem config → `false`; `sendMail` rejeita → `false`).
6. **Prévia + verificação** (§6).

## 6. Testar e verificar

- **Unit (vitest):** `vi.mock('server-only', () => ({}))` é obrigatório (o import `'server-only'` quebra no Node do vitest). `vi.mock('nodemailer')` com um `sendMail` controlável para exercitar sucesso/erro.
- **Prévia visual (cliente moderno):** gere o html do template **real** via `tsx`, troque o `cid:` por um data-URI do logo e publique como Artifact:
  ```ts
  const { html } = templateSenhaProvisoria({ nome:'Yan', senha:'X', tipo:'reset', linkAcesso:'https://wt-finance.vercel.app' })
  const preview = html.replace('cid:welcome-logo', 'data:image/png;base64,'+b64)  // só p/ preview
  ```
- **⚠️ Verificação OBRIGATÓRIA no Outlook real.** O preview de navegador **NÃO** pega o que o Outlook quebra (`margin:auto`, `background` em `<a>`, `border-radius`, alpha de PNG). **Mudança visual de e-mail só é "pronta" depois de conferida no cliente-alvo** (Outlook é o da empresa). Isso custou um patch inteiro (v4.24.2): a v4.24.1 shipou com o botão-virou-texto e o logo-caixa-preta porque só foi visto no Outlook **depois** do merge.

## 7. Operacional

- `SMTP_*` e `APP_BASE_URL` no `.env.local` **e** na **Vercel** (+ Redeploy). Runbook: `docs/runbooks/v4-24-email-runbook.md`.
- Sem config, tudo cai no **fallback** (o e-mail não sai, o fluxo segue normalmente).

## 8. Fan-out para múltiplos destinatários (v4.25.0)

Quando um e-mail vai para N pessoas (ex.: notificar uma movimentação de Solicitação a todos os membros de uma permissão/role):

- **Resolva os destinatários numa RPC gated** (`SECURITY DEFINER` + `pode_ver_solic`/equivalente) que devolve SÓ os e-mails daquele contexto — **nunca um diretório**. Use o **MESMO erro** para "não existe" e "não pode ver" (sem oráculo de existência — padrão `solic_detalhe`).
- **Fan-out best-effort:** um `sendMail` por destinatário via `Promise.allSettled` — a falha de um **não** derruba os outros; a função **nunca lança** (retorna contagem `{enviados,total}`). Dedupe os e-mails antes.
- **`await` o envio na server action — NÃO fire-and-forget.** Em serverless (Vercel) o trabalho após a resposta é morto no freeze da função → e-mails se perderiam. Aceite a latência (o timeout curto do transporter a limita); a integridade da ação já está garantida (e-mail é camada adicional, pós-persistência, em try/catch).
- Referência viva: `enviarNotificacaoSolicitacao` + `solic_emails_envolvidos` (v4.25.0, ADR-0128).

## Histórico
- **v4.24.0** (ADR-0127): camada de e-mail + senha provisória (fallback-safe).
- **v4.24.1**: logo + botão "Acessar a plataforma".
- **v4.24.2**: layout em tabelas, logo transparente do SVG, botão em célula, responsivo — conserto pós-Outlook (origem deste guia).
