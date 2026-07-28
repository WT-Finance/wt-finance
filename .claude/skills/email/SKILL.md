---
name: email
description: E-mail no Janus — criar ou alterar QUALQUER e-mail, template ou notificação (fatura, convite, alerta): camada única src/lib/email/ (fallback-safe, retorna boolean e nunca lança), layout compatível com Outlook (tabelas + inline, botão em célula, imagem CID com bytes no bundle), fronteira de marca (interno = Janus; cliente externo = 100% Welcome, nunca Janus) e o padrão MODO TESTE fail-closed para ação externa irreversível (ADR-0140). Use ANTES de escrever template de e-mail, envio via SMTP/nodemailer, notificação por e-mail ou integração externa irreversível — e leia docs/email-layout-guide.md antes de layout novo.
---

# E-mail no Janus

Todo envio de e-mail vive numa camada única, server-only: `src/lib/email/` (`index.ts` para
transporte/envios internos, `fatura.ts` para a fatura de cliente, `config.ts` para
configuração e modo, `template.ts` para os HTML/text). E-mail novo é **template + chamada
nova nessa camada**, nunca uma lib paralela — a lógica de transporte, anexo de logo e
tratamento de erro é compartilhada e não se duplica.

## 1. Fallback-safe acima de tudo: nunca lança

E-mail é uma camada **adicional**, nunca o caminho crítico. Se o SMTP falhar ou não estiver
configurado, o fluxo que chamou continua — sempre há um fallback (ex.: a senha provisória
segue exibida na tela mesmo se o e-mail falhar). Toda função de envio **retorna** um
resultado (`boolean` ou um objeto estruturado como `{ok, erro}`/`{enviados, total}`),
**nunca lança**:

```ts
export async function enviarSenhaProvisoria(input): Promise<boolean> {
  const cfg = getConfigSmtp()
  if (!cfg) return false   // SMTP não configurado → fallback (senha na tela)
  try {
    await criarTransporter(cfg).sendMail({ /* ... */ })
    return true
  } catch (err) {
    console.error('[email] falha ao enviar senha provisória — seguindo com fallback:', err)
    return false
  }
}
```

Envio para múltiplos destinatários (fan-out, ex.: notificação de solicitação) é **best
effort**: `Promise.allSettled` em paralelo, a falha de um destinatário não derruba os outros
nem o chamador (ver `enviarNotificacaoSolicitacao`/`enviarNotificacaoAcessoSolicitado` em
`index.ts`).

**Chamar o envio numa Server Action/Route Handler serverless é sempre `await`, nunca
fire-and-forget.** Disparar a promise sem esperar (`enviarX(...)` sem `await`) arrisca a
função serverless encerrar antes do envio terminar — o e-mail simplesmente não sai, sem
erro visível em lugar nenhum. (Custou caro: e-mail em Solicitações — v4.25.0/.1.)

## 2. Config e remetente 100% de `process.env`

`getConfigSmtp()` (`config.ts`) é fail-safe: falta qualquer variável essencial (`SMTP_HOST`,
`SMTP_USER`, `SMTP_PASS`) e devolve `null` — sem lançar, o chamador cai no fallback.
`SMTP_FROM` (o remetente) também vem do ambiente; default = `SMTP_USER` (Office 365, quando
o domínio não permite um "From" diferente do usuário autenticado). **Nunca hardcode
credencial ou remetente, nunca valor real no `.env.example`** (só as chaves). As `SMTP_*`
precisam estar TAMBÉM configuradas no ambiente da Vercel — configurar só em `.env.local`
não é suficiente em produção.

## 3. Imagem em e-mail: CID com os BYTES no bundle

```ts
export function anexoLogo() {
  return {
    filename: 'welcome-group.png',
    content: Buffer.from(LOGO_WELCOME_GROUP_PNG_BASE64, 'base64'),
    cid: LOGO_CID,
    contentType: 'image/png',
  }
}
```

O logo é anexado como MIME attachment referenciado por `cid:` no HTML, com os bytes
(base64) embutidos numa const do bundle. **Nunca** um `path` de `public/`: o runtime
serverless da Vercel não expõe o filesystem estático via `fs` do jeito que uma imagem
`public/` precisaria. **Nunca** data-URI no `<img>`: o Outlook não renderiza. E o PNG
precisa ser **transparente rasterizado do SVG** (`hasAlpha: false` vira uma caixa preta
sólida no lugar do fundo transparente, dentro do Outlook) — ao gerar um logo novo, gerar com
canal alpha preservado.

## 4. URL do app: `getAppBaseUrl()`, nunca chumbada

```ts
export function getAppBaseUrl(): string | null {
  const explicit = process.env.APP_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel...}`
  return null   // link omitido; o e-mail segue válido
}
```

Ordem: `APP_BASE_URL` (canônica, permite domínio próprio) → `VERCEL_PROJECT_PRODUCTION_URL`
(o que a Vercel sabe) → `null` (o link simplesmente não aparece; nunca quebra o e-mail).

## 5. Layout em TABELAS + inline — leia `docs/email-layout-guide.md` antes de criar um novo

O Outlook/Word (motor de renderização baseado no Word, não num browser real) ignora
`margin: auto` e `background` em `<a>`. Por isso todo layout de e-mail é montado em
**tabelas HTML** com estilo **inline** (não `<style>` de classe, exceto media query dentro
de um único bloco `<style>` no `<head>`):
- **Centralização** por `align` de `<table>`, nunca `margin: 0 auto`.
- **Botão** é uma **célula de tabela** com `bgcolor` + um `<a>` dentro, nunca um `<a>`
  estilizado com `background`/`border-radius` direto (o Outlook não aplica).
- **Responsivo** por cartão fluido (`width: 100%`, `max-width: ...px`) + `<style>` com media
  query para telas estreitas.

`docs/email-layout-guide.md` tem a receita completa (a camada, os padrões específicos de
Outlook, e a verificação obrigatória **no cliente-alvo real**, não só no preview do Gmail
web) — ler antes de montar um template novo, não reinventar a estrutura de tabelas do zero.

## 6. Fronteira de MARCA — interno vs. cliente externo (ADR-0145)

Dois públicos, duas identidades, e é fácil errar copiando um template para o outro:

- **E-mail INTERNO** (usuário da própria plataforma — senha provisória, notificação de
  solicitação, notificação de acesso solicitado) usa o **lockup duplo**
  `[JANUS] | [WELCOME GROUP]` — os dois logos anexados juntos:
  ```ts
  attachments: [anexoLogo(), anexoLogoJanus()]
  ```
- **E-mail de CLIENTE externo** (ex.: fatura) é **100% Welcome, NUNCA "Janus"** — o nome
  interno da plataforma não pode vazar para fora da empresa. Só `anexoLogo()`:
  ```ts
  const attachments = [anexoLogo(), /* boleto, nota, extras */]
  ```

Ao criar um e-mail novo, a primeira pergunta é "quem recebe": colaborador interno (lockup
duplo) ou cliente/terceiro (Welcome puro, sem menção a Janus em lugar nenhum do texto ou
assunto).

## 7. Ação externa IRREVERSÍVEL sem sandbox → MODO TESTE fail-closed (ADR-0140)

Diferente do Asaas (que tem sandbox), um e-mail **enviado não volta** — e o destinatário de
uma fatura é dado sensível (mandar para o cliente errado é vazamento). Este é o molde para
**qualquer** integração externa irreversível futura, não só e-mail:

- **Modo derivado do ambiente, fail-safe:** `emailAmbiente()` só vira `'real'` com
  `EMAIL_MODO === 'real'` exato; qualquer outro valor (ausente, typo, vazio) cai em
  `'teste'`. Nunca "real" por acidente.
- **Override no PONTO ÚNICO da camada, nunca no caller:** dentro de `enviarFaturaEmail`, em
  modo teste, TODOS os destinatários viram `EMAIL_TESTE_DESTINO` — um caminho novo que
  chame essa função automaticamente herda o override; é impossível esquecer de aplicá-lo em
  um call-site novo.
  ```ts
  let efetivos: string[]
  if (modo === 'teste') {
    const destino = getEmailTesteDestino()
    if (!destino) return { ok: false, erro: 'EMAIL_TESTE_DESTINO ausente — recusado (fail-closed).' }
    efetivos = [destino]
  } else {
    efetivos = input.destinatariosReais
  }
  ```
- **Fail-closed:** sem `EMAIL_TESTE_DESTINO` configurado, o envio em modo teste é
  **recusado**, nunca cai para o destinatário real por omissão.
- **Modo real é recusado no SERVIDOR:** a action que dispara o envio checa
  `emailAmbiente()` ela mesma antes de confirmar — o mesmo padrão da confirmação `EMITIR`
  do Asaas (não confiar só na UI para travar a virada).
- **Idempotência POR MODO:** a tabela de controle de envios é append-only, sem `UNIQUE`
  cru — a checagem de "já enviado" (`_existentes(refs, modo)`) inclui o modo na chave, para
  que um envio em teste **não** conte como "já enviado" quando a virada de produção
  acontecer (senão o real pularia faturas que só foram testadas).
- **Anexo que falha no download = o envio FALHA com motivo,** nunca um e-mail incompleto
  silencioso:
  ```ts
  try {
    boletoBuf = await baixarPdf(input.boletoUrl)
  } catch {
    return { ok: false, erro: 'Falha ao baixar o PDF do boleto — e-mail não enviado.' }
  }
  ```

Ao construir a próxima integração externa irreversível (uma nova API de terceiro que
"dispara e não recua"), replique esta estrutura: modo fail-safe, override no ponto único,
fail-closed sem destino de teste, confirmação no servidor, idempotência que distingue
teste/real.

## Nota: convite de acesso e SMTP

O convite de acesso por e-mail depende de **SMTP próprio** — o serviço nativo do Supabase
Auth limita a 2 envios/hora, insuficiente para uso real. E a confirmação de magic link
(`/auth/confirm`) é em **dois passos** (o GET só renderiza o botão; o POST do clique é que
consome o token) para não deixar bots de pré-visualização de link consumirem o token antes
do humano. O detalhe completo desse fluxo de auth vive na skill **`contrato-rpc-front`** —
aqui fica só o lembrete de que ele também passa pela camada de e-mail.

## Ver também

- **`contrato-rpc-front`** — os fluxos de auth (senha provisória, magic link, solicitação de
  acesso) que disparam os e-mails desta camada; lá está o RBAC/guards em volta desses
  fluxos.
