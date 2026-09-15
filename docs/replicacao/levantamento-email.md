# Levantamento as-built — Notificação por e-mail

**Data:** 2026-09-15 · **Commit de referência:** `62bd8b9` (`main`, merge do PR #273 / v5.11.0) ·
**Regime:** só-leitura. Nada foi alterado além deste arquivo; nenhum e-mail foi enviado.

**Método.** Toda afirmação carrega `caminho:linha` do código ou do SQL vivo. Comentários,
skills e ADRs foram tratados como hipóteses — quando divergiram do código, o código venceu e a
divergência foi registrada no bloco 10.

**Convenção de força de evidência.** Cada afirmação sobre entrega vem marcada:

| marca | significa |
|---|---|
| **[L]** | vale por **leitura** do código — é o que está escrito |
| **[T]** | coberto por **teste com dublê** (o nodemailer é mockado) |
| **[O]** | **observado** contra servidor real, com registro no repositório |

### O que NÃO foi coberto, e por quê

1. **Nenhum envio real.** O recorte proíbe. Tudo que depende de negociação SMTP, de MIME
   montado pela biblioteca e de renderização em cliente de e-mail está marcado **[L]** ou **[O]**
   (quando há registro anterior), nunca verificado agora.
2. **A suíte não foi executada.** O levantamento roda numa worktree sem `node_modules`; rodar
   `npm test` exigiria instalar dependências, o que é escrita. O inventário de testes vem da
   leitura dos 4 arquivos `*.test.ts` da camada.
3. **Configuração fora do repositório.** Valores de `SMTP_*` na Vercel, política do tenant
   Office 365, e registros DNS (SPF/DKIM/DMARC) do domínio remetente **não são observáveis daqui**.
   O que existe no repositório está no bloco 7.
4. **Catálogo vivo do Postgres.** As definições de RPC foram lidas das migrations mais recentes
   de cada função (`0224` para `solic_emails_envolvidos`, `0213` para a variante `_svc`, `0177`,
   `0169`), não de um `pg_get_functiondef` contra produção. É a última definição commitada.
5. **Logs de produção.** Não há acesso a eles nesta sessão; o que se sabe sobre falhas reais vem
   dos out-briefings citados.

---

## 1. Transporte

### 1.1 Biblioteca e construção do transportador

| fato | evidência |
|---|---|
| Biblioteca: `nodemailer`, faixa `^10.0.9` | `package.json:28` |
| Import default, ESM/CJS | `src/lib/email/index.ts:2` |
| Único construtor: `criarTransporter(cfg)` | `src/lib/email/index.ts:18-28` |

O transportador **não é uma instância única**. `criarTransporter` é chamado:

- **uma vez por envio** em `enviarSenhaProvisoria` (`index.ts:217`) e em `enviarFaturaEmail`
  (`fatura.ts:141`);
- **uma vez por fan-out** em `enviarFanOut` (`index.ts:173`), reaproveitado por todos os
  destinatários daquele disparo.

**Não há `pool: true`.** A consequência é a decisão central desta camada: sem pool, cada
`sendMail` abre a **sua própria conexão SMTP**. [L] — o comentário em `index.ts:55-68` afirma
isso e o registra como causa-raiz observada em produção (v5.3.4).

### 1.2 Provedor, protocolo, autenticação

Nada disso está no código — é 100% ambiente (`src/lib/email/config.ts:27-33`). O runbook
documenta os valores esperados:

| variável | valor documentado | evidência |
|---|---|---|
| `SMTP_HOST` | `smtp.office365.com` | `docs/runbooks/v4-24-email-runbook.md:14` |
| `SMTP_PORT` | `587` (default no código quando ausente) | runbook:15 · `config.ts:32` |
| `SMTP_SECURE` | `false` → **STARTTLS** (`true` = TLS direto, porta 465) | runbook:16 · `config.ts:12,33` |
| `SMTP_USER` | conta autenticada do domínio | runbook:17 |
| `SMTP_PASS` | senha da conta (com MFA, "senha de app") | runbook:18, §3.3 |
| `SMTP_FROM` | **deve ser igual a `SMTP_USER`** no Office 365 | runbook:19 · `config.ts:30` |

Autenticação: `auth: { user, pass }` — SMTP AUTH simples, usuário/senha. **Não há OAuth2**
(`index.ts:23`). `secure` é derivado de string: só a literal `'true'` (case-insensitive) liga
TLS direto; qualquer outra coisa cai em STARTTLS (`config.ts:33`).

### 1.3 Limites do provedor que o código conhece

O conhecimento está escrito **em comentário de código**, não em configuração:

> "o SMTP AUTH do Office 365 aceita no MÁXIMO 3 conexões simultâneas por mailbox (a 4ª leva
> `432 4.3.2 STOREDRV.ClientSubmit; sender thread limit exceeded`) e 30 mensagens/min"
> — `src/lib/email/index.ts:57-59`

| limite | como é respeitado | evidência |
|---|---|---|
| **3 conexões simultâneas/mailbox** | semáforo de concorrência com teto **2** (folga deliberada — a mesma mailbox serve senha provisória e fatura na mesma janela) | `index.ts:71` (`MAX_CONEXOES_SMTP = 2`), `index.ts:192-194` |
| **30 mensagens/min** | **não** é respeitado no servidor. É respeitado **no cliente**, só no lote de faturas: `INTERVALO_MS = 2100` entre disparos ≈ 28,5/min | `src/components/financeiro/revisar-envio-modal.tsx:35,219-236` |
| **destinatários por mensagem** | nenhum limite no código | — |
| **tamanho máximo da mensagem** | só um limite próprio para os anexos "Outros" da fatura: **15 MB** somados. Boleto e nota não entram nessa conta. | `src/lib/email/fatura.ts:39,117` |

O semáforo é um pool de "trabalhadores" sobre um índice compartilhado, não uma fila durável:
`index.ts:178-194`. Ele existe só dentro de uma chamada — dois fan-outs concorrentes (duas
requisições simultâneas) **não se conhecem** e podem somar 4 conexões. É exatamente por isso que
o teto é 2 e não 3 (`index.ts:70`).

### 1.4 Tempo máximo, tentativa nova, recuo

| relógio | valor | escopo | evidência |
|---|---|---|---|
| `connectionTimeout` | 10 s | por conexão | `index.ts:24` |
| `greetingTimeout` | 10 s | por conexão | `index.ts:25` |
| `socketTimeout` | 10 s | por conexão | `index.ts:26` |
| orçamento total do fan-out | 15 s | por chamada de `enviarFanOut` | `index.ts:84` |
| espera entre tentativas | 1 s × nº da tentativa (**backoff linear**: 1 s, 2 s) | por destinatário | `index.ts:86,142` |
| tentativas | **3** (1 original + 2 retries) | por destinatário | `index.ts:73,137` |
| download de PDF de anexo | 30 s (`AbortController`) | por anexo da fatura | `fatura.ts:43-44` |

**O retry existe SÓ no fan-out.** `enviarSenhaProvisoria` (`index.ts:217`) e `enviarFaturaEmail`
(`fatura.ts:141`) fazem **um** `sendMail` e desistem no primeiro erro. [L][T]

**O orçamento é gate de ENTRADA, não de cancelamento** (`index.ts:180-182`): passado o prazo, o
fan-out para de **começar** envios novos, mas nunca abandona um `sendMail` em voo. A justificativa
está escrita: abandonar promise em serverless foi o modo de falha da v4.25.1 — a função congela e
o e-mail não sai, sem erro visível (`index.ts:78-82`). Pior caso declarado: 15 s + um `sendMail`
em voo (~10 s).

### 1.5 Classificação de falha — o que se retenta

`transitorio(err)` em `index.ts:106-116`:

```
EAUTH                     → NUNCA retenta (insistir com credencial errada bloqueia a conta)
responseCode 4xx          → retenta (transitório por definição: 432, rate limit, indisponibilidade)
responseCode 5xx          → NÃO retenta (permanente: caixa inexistente)
sem responseCode, e o code ∈ {ETIMEDOUT, ESOCKETTIMEDOUT, ECONNECTION, ESOCKET,
                              ECONNRESET, ECONNREFUSED, EHOSTUNREACH, ENOTFOUND, EDNS}
                          → retenta
qualquer outro            → NÃO retenta
```

**Decisão embutida, declarada no próprio código** (`index.ts:98-104`): um erro de socket pode
acontecer **depois** de o servidor ter aceitado a mensagem (queda entre o `250 OK` do DATA e a
leitura da resposta). SMTP não tem chave de idempotência, então **o retry pode gerar uma cópia a
mais**. Para notificação interna best-effort, receber duas vezes foi julgado preferível a não
receber. O comentário registra que essa decisão **se inverte** para e-mail irreversível de
cliente — e é por isso que a fatura não tem retry e tem registro próprio.

### 1.6 O que acontece quando o provedor recusa

**Nunca uma exceção sai da camada.** Em todos os caminhos:

| função | retorno em falha | evidência |
|---|---|---|
| `enviarSenhaProvisoria` | `false` | `index.ts:221-224` |
| `enviarNotificacaoSolicitacao` | `{ enviados, total }` com `enviados < total` | `index.ts:258-268` |
| `enviarNotificacaoAcessoSolicitado` | idem | `index.ts:295-302` |
| `enviarFaturaEmail` | `{ ok: false, erro: string }` | `fatura.ts:146-148` |

E **nunca em silêncio**: cada falha imprime `console.error` com o **código SMTP na frente**
(`descreverErro`, `index.ts:119-123`; uso em `index.ts:149-151`). O fan-out ainda imprime o
resumo parcial `X/Y enviados` quando `enviados < total` (`index.ts:195-200`), incluindo quantos
sequer foram tentados por estouro de orçamento.

---

## 2. Ambientes e modo de teste

**Este é o achado que mais muda o desenho de uma replicação.** A camada tem **dois regimes
diferentes**, e só um deles tem modo de teste.

### 2.1 Fatura (cliente externo) — MODO TESTE fail-closed

```
modo = 'real'  ⟺  EMAIL_MODO.trim().toLowerCase() === 'real'
qualquer outra coisa (ausente, vazio, typo, 'REAL ' com espaço já tratado pelo trim) → 'teste'
```
`src/lib/email/config.ts:75-77`. Default **fail-safe**: nunca vira real por acidente. [L][T]

O override do destinatário vive **no ponto único da camada**, dentro de `enviarFaturaEmail`
(`fatura.ts:72-78`), não no chamador — um call-site novo herda o override automaticamente:

```ts
if (modo === 'teste') {
  const destino = getEmailTesteDestino()
  if (!destino) return { ok: false, erro: 'EMAIL_TESTE_DESTINO ausente — envio em modo teste recusado (fail-closed).' }
  efetivos = [destino]
} else {
  efetivos = input.destinatariosReais
}
```

**É fail-closed, sim, e com evidência do caminho:** `fatura.ts:75` retorna **antes** de baixar
qualquer PDF e antes de tocar o SMTP. Sem `EMAIL_TESTE_DESTINO`, em modo teste, **nada sai** — não
existe ramo que caia para o destinatário real por omissão. [L][T] (`fatura.test.ts:171` —
"FAIL-CLOSED: modo teste sem EMAIL_TESTE_DESTINO → recusa, NÃO envia nem baixa"). [O] — o
out-briefing da v5.10.2 registra o fail-closed **exercitado** contra SMTP real, com um endereço
"real" plantado (`nao-deve-receber@exemplo-invalido.test`) que não recebeu nada
(`docs/briefings/WT_Finance_Out_Briefing_v5-10-2_Nodemailer_10.md:89-93`).

Há ainda uma **segunda trava**, no servidor, acima da camada: a action recusa modo real sem
confirmação explícita (`src/app/financeiro/faturamento-corp/actions.ts:585-588`), pelo mesmo
padrão da confirmação do Asaas — não se confia na UI para travar a virada.

E o modo teste é **visível na mensagem**: prefixo no assunto `[TESTE — destinatário real: …]` e
faixa âmbar no corpo nomeando para onde iria (`template.ts:306-307,322-331`).

### 2.2 Os três e-mails internos — NÃO TÊM modo de teste

`src/lib/email/index.ts` **não importa** `emailAmbiente` nem `getEmailTesteDestino` — só
`getConfigSmtp` e `getAppBaseUrl` (`index.ts:3`). Verificado por grep em toda a base: as duas
funções de modo só aparecem em `fatura.ts:12`, em `faturamento-corp/actions.ts:19` e em
`faturamento-corp/page.tsx:5`.

**Consequência, por leitura:** um ambiente de preview ou um `.env.local` de desenvolvimento com as
`SMTP_*` preenchidas **envia senha provisória e notificações de solicitação para os endereços reais
das pessoas**, sem override e sem aviso. Não existe redirecionamento de destinatário para esses
três. [L] — nenhuma observação foi feita; é o que o código diz.

O que atenua na prática é o **acaso**, não um controle: `.env.local` não é versionado e não vem
numa worktree nova, então o padrão do dia a dia é SMTP ausente → fallback silencioso.

### 2.3 Ambiente sem credencial de SMTP

`getConfigSmtp()` devolve `null` (não lança) quando falta `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`,
o `from` derivado, ou quando a porta não é número finito positivo (`config.ts:35-42`). Imprime um
`console.warn` explicando. O resultado **é cacheado** (`config.ts:22,25`): env não muda em runtime,
e `_resetConfigSmtpCache()` existe só para teste (`config.ts:63-65`).

O que cada chamador faz então:

| chamador | comportamento sem SMTP | evidência |
|---|---|---|
| senha provisória | `false` — **a senha continua exibida na tela, copiável**, com aviso âmbar "não foi possível enviar" | `index.ts:212` · UI: `src/components/admin/acessos/modal-convidar.tsx:143`, `aba-usuarios.tsx:185`, `aba-solicitacoes.tsx:89` |
| notificação de solicitação | `{ enviados: 0, total }` — a movimentação **já foi persistida** e segue válida | `index.ts:246` |
| notificação de acesso | `{ enviados: 0, total }` — o pedido de acesso **já foi gravado**; só o aviso aos admins não sai | `index.ts:286` |
| fatura | `{ ok: false, erro: 'SMTP não configurado…' }` — a fatura não é marcada como enviada | `fatura.ts:83` |

O **caminho alternativo** existe só no primeiro caso e é o mais forte da camada: a senha provisória
aparece na tela de qualquer jeito. É a razão pela qual a camada inteira pôde ser desenhada como
"adicional".

---

## 3. Composição da mensagem

### 3.1 Como o corpo é montado

**Quatro funções puras** em `src/lib/email/template.ts`, cada uma devolvendo
`{ assunto, html, text }` (tipo `TemplateSenha`, `template.ts:12-16`):

| função | linha | público |
|---|---|---|
| `templateSenhaProvisoria` | `template.ts:65` | interno |
| `templateNotificacaoSolicitacao` | `template.ts:182` | interno |
| `templateFaturaEmail` | `template.ts:292` | **cliente externo** |
| `templateNotificacaoAcessoSolicitado` | `template.ts:369` | interno |

**Não há shell extraído.** Cada template repete a estrutura inteira (tabela externa, cartão,
media query, rodapé, helper do botão). A duplicação é **deliberada e declarada**:
`template.ts:163-164` — "scaffold duplicado de propósito". O único trecho compartilhado é
`lockupDuploHtml()` (`template.ts:47-63`), usado pelos três internos.

O que **é** parametrizado: mapas `Record<Enum, T>` por variante de movimentação — `MOV_PT`
(`template.ts:167-170`) e `MOV_COR` (`template.ts:177-180`). A tipagem obriga a preencher os mapas
ao acrescentar uma variante; **não obriga** o conteúdo dinâmico (data, justificativa, link), que o
template trata como string vazia **por desenho** — é o que faz o e-mail sobreviver sem link.

### 3.2 Alternativa em texto puro — existe, sempre

Todas as quatro funções montam `text` além de `html`, e todos os `sendMail` passam os dois
(`index.ts:185,218` · `fatura.ts:142`). O `text` espelha o conteúdo sem negrito nem divisória, com
o link como URL crua (`template.ts:86-93,202-208,315-320,384-394`). [L][T]

### 3.3 Assunto

Todos carregam dado variável:

| e-mail | assunto | evidência |
|---|---|---|
| senha, criação | `Seu acesso foi criado \| Janus` | `template.ts:78-80` |
| senha, reset | `Sua senha foi redefinida \| Janus` | idem |
| movimentação | `Solicitação {mov}: {título} \| Janus` — título = `"{tipo} #{id}"` | `template.ts:200` · `solicitacoes/actions.ts:67` |
| acesso solicitado | `Nova solicitação de acesso \| Janus` (sem variável) | `template.ts:382` |
| fatura | `Fatura Welcome Trips – {cliente} – Nº {ref}` | `template.ts:306` |
| fatura, modo teste | `[TESTE — destinatário real: {reais}] ` + o acima | `template.ts:307` |

O sufixo `| Janus` é o formato interno fixado num checkpoint humano (`template.ts:77,199`).
O assunto da fatura **nunca** diz "Janus" — ver 3.7.

### 3.4 Imagens — CID com os bytes no bundle

Duas imagens, ambas anexadas como **attachment MIME referenciado por `cid:`**:

| logo | CID | bytes | função |
|---|---|---|---|
| Welcome Group | `welcome-logo` | `LOGO_WELCOME_GROUP_PNG_BASE64` (~11,7 k chars de base64) | `anexoLogo()`, `index.ts:31-38` |
| Janus | `janus-logo` | `LOGO_JANUS_PNG_BASE64` (~16,8 k chars) | `anexoLogoJanus()`, `index.ts:46-53` |

Ambos em `src/lib/email/logo.ts:9,11,18,20`. **Três negativas, cada uma com razão escrita:**

1. **Nunca `path` de `public/`** — o runtime serverless da Vercel não expõe o filesystem estático
   via `fs` (`logo.ts:6-7` · `docs/email-layout-guide.md:52`).
2. **Nunca `data:` URI no `<img>`** — o Outlook não renderiza (`logo.ts:6` · guia:52).
3. **O PNG precisa ser rasterizado do SVG com canal alpha preservado** — um PNG "transparente"
   com fundo *baked-in* (`hasAlpha: false`) vira **caixa preta** no Outlook. Foi o bug da v4.24.1.
   Receita registrada: `sharp(svg, {density:300}).resize({width:480}).png()` (`logo.ts:2-5` ·
   guia:48-51).

Todo `<img>` leva `alt` (`template.ts:51,59,344`) para sobreviver a cliente que bloqueia imagem.

### 3.5 Compatibilidade — o que existe por causa do renderizador

O Outlook desktop usa o **motor do Word**, não um browser. Cada item abaixo tem a razão escrita:

| padrão no código | por quê | evidência |
|---|---|---|
| Layout inteiro em `<table role="presentation">` aninhadas | `margin:auto` não centraliza; não há flex/grid | guia:32 · todos os templates |
| Estilo **inline**; o único `<style>` é o da media query | classes no `<head>` não são confiáveis | guia:33 · `template.ts:112-118` |
| **Botão = célula de tabela** com `bgcolor` e o `padding` na `<td>`, nunca no `<a>` | o Outlook ignora `background`/`padding` em `<a>` inline → o botão virava texto cru (bug da v4.24.1) | guia:34-42 · `template.ts:99-107,227-235,408-416` |
| Divisória vertical = `<div>` interno com `height` **e** `line-height` iguais + `mso-line-height-rule:exactly` | `height` só na `<td>` com `font-size:0` é **colapsado** pelo Word — a barra saía cortada (visto no Outlook real, checkpoint v4.40.0) | `template.ts:44-46,55` · guia:43-46 |
| Centralização por `align="center"` / `align` de `<table>` | idem `margin:auto` | guia:47 · `template.ts:48,101` |
| Espaçadores como células vazias com `&nbsp;` e `font-size:0;line-height:0` | `margin` é ignorado | `template.ts:53,57` |
| Fontes web-safe: `Arial,Helvetica,sans-serif` e `'Courier New',Consolas,monospace` | a fonte da marca (Avenir) não carrega em e-mail | guia:53 · `template.ts:119,136` |
| **Cores em hex inline**, via constantes nomeadas derivadas dos tokens do DS | e-mail não lê `var()` de CSS | guia:54 · `template.ts:23-31,287-290` — e `src/lib/email/` é isento do lint `wt/no-cor-hardcoded` (`template.ts:287`) |
| Cartão fluido: atributo `width="480"` **e** `style="width:100%;max-width:480px"` | o atributo é para o Outlook desktop; o style encolhe no mobile | guia:58 · `template.ts:121,246,342` |
| Media query `@media (max-width:480px)` sobre classes `.em-card`/`.em-pad`/`.em-senha` | funciona em iOS/Apple Mail/Gmail; o Outlook desktop ignora (e roda em tela larga) — **o inline é o piso**, a media query é melhoria progressiva | guia:59 · `template.ts:112-118` |
| `word-break:break-all` no bloco da senha | senha longa não estoura em tela estreita | guia:60 · `template.ts:136` |

**`border-radius` não aparece no Outlook** (botão quadrado lá) — registrado como **aceitável**
(guia:42). É a única incompatibilidade assumida sem contorno.

**Escape:** `escaparHtml` (`template.ts:33-37`) cobre `& < > " '` e é aplicado em tudo que vem de
fora: nome na saudação, senha, título da solicitação, rótulos, justificativa, `href` do link,
destinatário real na faixa de teste (`template.ts:103,129,136,219,231,257,263,327,399-400`). [T] —
há caso anti-injeção para o nome (`email.test.ts:53`, `template-acesso.test.ts:29`).

### 3.6 Anexos

**Sim, e em duas naturezas.** Os logos são anexos com `cid` (3.4). Além deles, **só a fatura** tem
anexos de conteúdo (`fatura.ts:134-139`):

| anexo | origem | obrigatório | evidência |
|---|---|---|---|
| `boleto-{ref}.pdf` | `fetch` do `bank_slip_url` do Asaas → `Buffer` | **sim** | `fatura.ts:89-94,136` |
| `nota-{ref}.pdf` | `fetch` do `pdf_url` da nota, só quando `nota_status === 'AUTHORIZED'` | não | `fatura.ts:95-102,137` · regra na action: `faturamento-corp/actions.ts:608-617` |
| "Outros" | escolhidos no modal pelo operador, viajam em **base64** no payload da action, decodificados na camada | não | `fatura.ts:31-35,104-124` |

**Regra dura: anexo que falha = o envio falha, com motivo.** Nunca um e-mail incompleto silencioso
(`fatura.ts:91-93,98-101,113,115,117`). Casos de recusa: download com HTTP≠200, PDF de zero bytes
(`fatura.ts:48-50`), base64 inválido, anexo vazio, conjunto de "Outros" acima de 15 MB.
O `filename` dos "Outros" é sanitizado contra path e quebra de linha:
`.replace(/[\\/\r\n]/g, '_')` (`fatura.ts:121`). [L][T] (`fatura.test.ts:159,190`)

**Como se prova que chegaram íntegros.** A prova registrada não é "a imagem apareceu" — é
**comparação por bytes**: no out-briefing da v5.10.2, `welcome-group.png` = **9.022 B** e
`janus.png` = **12.753 B** no e-mail enviado pela versão nova, **exatamente os mesmos tamanhos**
de um e-mail de produção anterior, ambos lidos pelo Microsoft Graph, ambos `isInline: true`
(`docs/briefings/WT_Finance_Out_Briefing_v5-10-2_Nodemailer_10.md:96-121`). [O]

### 3.7 Remetente, exibição, resposta, cabeçalhos

| campo | situação | evidência |
|---|---|---|
| `from` | `cfg.from` = `SMTP_FROM` ou, na ausência, `SMTP_USER` | `config.ts:30` · `index.ts:185,218` · `fatura.ts:142` |
| **nome de exibição** | **não existe** — o `from` é o endereço cru, sem `"Nome" <addr>` | `config.ts:30`; nenhuma construção de display name em toda a camada |
| **`replyTo`** | **não existe** | grep em `src/` não retorna nenhuma ocorrência |
| **`cc` / `bcc`** | **não existem** — e a rejeição do `bcc` é explícita: "Um e-mail com todos em `bcc`: Rejeitada — o fan-out por-destinatário isola falhas (best-effort) e não acopla os envios; o volume é pequeno" | `docs/adr/0128-email-notificacoes-solicitacoes.md:24` |
| **`List-Unsubscribe`** e cabeçalhos de campanha | **não existem** | grep sem resultado |
| `headers` customizados | nenhum | os objetos de `sendMail` têm só `from, to, subject, html, text, attachments` |

**Fronteira de marca (ADR-0145), verificada no código:**

- **Interno** → lockup duplo `[JANUS] | [WELCOME GROUP]`: `attachments: [anexoLogo(), anexoLogoJanus()]`
  (`index.ts:218,260,297`), rodapé `JANUS · WELCOME GROUP` (`template.ts:149,272,456`), textos com
  `APP_NOME_INTERNO = 'Janus'` (`template.ts:22`).
- **Cliente externo (fatura)** → **100 % Welcome, a palavra "Janus" não aparece em lugar nenhum**:
  só `anexoLogo()` (`fatura.ts:135`), rodapé `WT FINANCE · WELCOME GROUP` (`template.ts:357`),
  `APP_NOME = 'WT Finance'` (`template.ts:21`, marcado "NUNCA alterar o valor desta const").
  [O] — conferido na caixa real via Graph: "Janus" **ausente** no corpo da fatura
  (`…v5-10-2_Nodemailer_10.md:104`).

---

## 4. Inventário de avisos

Quatro famílias de template; **nove variantes observáveis** de mensagem. Nenhuma delas é disparada
por agendamento — todas nascem de uma ação humana ou de uma chamada de API.

| # | evento | quem dispara (arquivo:linha) | destinatário derivado de | conteúdo | anexo | sensível |
|---|---|---|---|---|---|---|
| 1 | Usuário criado (admin cria direto) | `src/app/admin/acessos/actions.ts:138` (`criarUsuario`) | o e-mail digitado pelo admin, normalizado (`actions.ts:81`) | saudação, **senha provisória** em destaque, botão "Acessar a plataforma", aviso de troca no 1º acesso | 2 logos | 🔴 **CREDENCIAL EM TEXTO CLARO** |
| 2 | Pedido de acesso **aprovado** | `admin/acessos/actions.ts:214` → `criarUsuario` → `:138` | o e-mail da solicitação pendente | idem #1 | 2 logos | 🔴 **CREDENCIAL** |
| 3 | Senha **resetada** pelo admin | `admin/acessos/actions.ts:173` (`resetarSenha`) | **o registro do Supabase Auth** (`data.user?.email`), não input do cliente (`actions.ts:164-168`) | idem #1, com assunto/intro de "redefinida" | 2 logos | 🔴 **CREDENCIAL** |
| 4 | Solicitação **criada** (UI) | `src/app/solicitacoes/actions.ts:138` | RPC `solic_emails_envolvidos` | badge dourado, título `"{tipo} #{id}"`, data/hora SP, "Atribuída a X, por Y", botão → `/solicitacoes` | 2 logos | ⚠️ título + rótulos = nomes de pessoas e natureza do pedido |
| 5 | Solicitação **aprovada** | `solicitacoes/actions.ts:211` | idem | idem, badge âmbar; a data vem de **override do chamador** | 2 logos | ⚠️ |
| 6 | Solicitação **concluída** | `solicitacoes/actions.ts:309` | idem | idem, badge verde | 2 logos | ⚠️ |
| 7 | Solicitação **rejeitada** | `solicitacoes/actions.ts:317` | idem | idem, badge vermelho, **+ bloco "Justificativa"** | 2 logos | ⚠️ texto livre do decisor |
| 8 | Solicitação **cancelada** | `solicitacoes/actions.ts:325` | idem | idem, badge cinza | 2 logos | ⚠️ |
| 9 | Solicitação **criada via API externa** | `src/app/api/externo/solicitacoes/route.ts:110` | RPC `solic_emails_envolvidos_svc` (sem guards de sessão) | igual a #4 | 2 logos | ⚠️ |
| 10 | Solicitação **cancelada via API externa** | `src/app/api/externo/solicitacoes/[id]/cancelar/route.ts:45` | idem `_svc` | igual a #8 | 2 logos | ⚠️ |
| 11 | **Novo pedido de acesso** registrado no login | `src/app/solicitar-acesso/actions.ts:74` | **a própria RPC** `solicitar_acesso_admin` devolve a lista | e-mail do solicitante, nome informado, quando, botão → `/admin/acessos` | 2 logos | ⚠️ **dado pessoal de terceiro** (e-mail/nome de quem pediu) |
| 12 | **Fatura** ao cliente | `src/app/financeiro/faturamento-corp/actions.ts:648` | cadastro de clientes **ou** override do modal | "Prezados", frase condicional sobre boleto ± nota, sem link | logo Welcome + **boleto.pdf** ± **nota.pdf** ± "Outros" | 🔴 **VALOR FINANCEIRO E DOCUMENTO FISCAL**, destinado **fora da empresa** |

Itens 1–3 usam o mesmo template (`templateSenhaProvisoria`, variando `tipo`); 4–10 usam
`templateNotificacaoSolicitacao` (variando `movimentacao`); 11 usa
`templateNotificacaoAcessoSolicitado`; 12 usa `templateFaturaEmail`.

**Os três avisos com credencial no corpo (1–3) não têm modo de teste** (ver 2.2). O único com
modo de teste é o 12 — o que sai da empresa.

**Não há e-mail para o solicitante quando o pedido de acesso é rejeitado**
(`admin/acessos/actions.ts:240`, `rejeitarSolicitacao`, sem chamada de envio).

---

## 5. Derivação de destinatários

### 5.1 Onde é calculada, e com que credencial

| aviso | onde | credencial | evidência |
|---|---|---|---|
| Senha provisória (#1, #2) | **aplicação** — o e-mail digitado no formulário | sessão do admin, guard `requireAreaAction('admin/acessos')` | `admin/acessos/actions.ts:79,81` |
| Senha provisória (#3, reset) | **aplicação**, mas lendo o **Auth** — `updateUserById` devolve o usuário e o e-mail sai de lá | `service_role` (`getAdminClient()`) | `admin/acessos/actions.ts:157,168` |
| Movimentação de solicitação (#4–8) | **banco** — RPC `solic_emails_envolvidos` | cliente de **sessão** do usuário; a RPC é `SECURITY DEFINER` + `app.exigir_acesso()` + `app.pode_ver_solic()` | `src/lib/solicitacoes/rpc.ts:38` · `supabase/migrations/0224_remove_whitelist_tipos.sql:415-474` |
| Movimentação via API (#9, #10) | **banco** — RPC `solic_emails_envolvidos_svc` | **`service_role`**, `GRANT` exclusivo; **sem** `exigir_acesso`/`pode_ver_solic` | `supabase/migrations/0213_api_outbox.sql:574-621` |
| Novo pedido de acesso (#11) | **banco** — a própria `solicitar_acesso_admin` devolve `{inserida, emails}` | `service_role` (`GRANT` exclusivo, `REVOKE` de anon/authenticated) | `supabase/migrations/0177_solicitar_acesso_admin_notificacao.sql:26-69` |
| Fatura (#12) | **banco + aplicação** — RPC `buscar_cliente_corporativo` traz a string do cadastro, a aplicação faz o split | sessão, guard `requireAreaAction('financeiro/faturamento-corp')` | `faturamento-corp/actions.ts:580,630-636` |

**A RPC nunca devolve um diretório** — só os e-mails daquele contexto. E o gate usa o **mesmo erro**
para "não existe" e "não pode ver" (`NAO_ENCONTRADA`, `0224:430-432`), sem oráculo de existência.

### 5.2 As assimetrias — cada uma com evidência

Na resolução dos envolvidos de uma solicitação (`0224_remove_whitelist_tipos.sql:443-453`, idêntico
em `0213:590-600`):

```sql
SELECT email FROM app.rbac_usuarios WHERE user_id = v_sol.solicitante_id AND ativo
UNION
SELECT email FROM app.rbac_usuarios WHERE v_sol.destinatario_user_id IS NOT NULL
                                      AND user_id = v_sol.destinatario_user_id
UNION
SELECT email FROM app.rbac_usuarios WHERE v_sol.destinatario_role_id IS NOT NULL
                                      AND role_id = v_sol.destinatario_role_id AND ativo
```

| quem | regra | consequência |
|---|---|---|
| **autor** | entra **só se `ativo`** | autor desativado depois deixa de receber — declarado como rede deliberada (`0224:437-442`) |
| **destinatário nomeado** | entra **SEMPRE — sem `AND ativo`** | **um usuário INATIVO nomeado como destinatário continua recebendo e-mail.** É a assimetria mais afiada da camada, e é a única das três sem comentário justificando |
| **membros da role destinatária** | entram **só se `ativo`** | — |

Outras:

- **`_svc` não checa acesso.** A variante da API externa não chama `exigir_acesso()` nem
  `pode_ver_solic()` (`0213:570-573,585-588`): a rota tem chave de API, não JWT Supabase, e a
  versão gated sempre negaria. O `GRANT` é só para `service_role` e o `REVOKE` tira
  `PUBLIC, anon, authenticated` (`0213:620-621`).
- **Pedido de acesso (#11):** destinatários = **todos os usuários `ativo` cuja role tem a área
  `admin/acessos`** — um join em `rbac_role_permissoes`, `lower(email)`, `DISTINCT`
  (`0177:52-58`). E só quando `inserida = true`: reenvio/duplicata **não** notifica ninguém
  (`0177:49-50` · `solicitar-acesso/actions.ts:72-73`).
- **Fatura pelo cadastro:** exige cliente com `situacao = 'ativo'`; inativo → recusa
  (`faturamento-corp/actions.ts:634`). **Com override do modal**, essa exigência **cai** — é o
  caminho de envio avulso, e o servidor só re-valida o formato (`actions.ts:623-627,564`).

### 5.3 Deduplicação, normalização, lista vazia

| camada | o que faz | evidência |
|---|---|---|
| RPC dos envolvidos | `array_agg(DISTINCT e)`, descarta `NULL` | `0224:443,453` |
| RPC dos admins (#11) | `array_agg(DISTINCT lower(u.email))` — **é a única que normaliza caixa** | `0177:53` |
| camada, fan-out | `[...new Set(paras.map(p => p.trim()).filter(p => p.includes('@')))]` — trim, dedupe, e uma sanidade **mínima** (só exige `@`) | `index.ts:245,285` |
| fatura | `splitDestinatarios` — split por `;`, trim, descarta vazios, regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`, dedupe preservando ordem | `src/lib/email/destinatarios.ts:8-27` |

`destinatarios.ts` é **isomórfico de propósito** — sem `'use client'` e sem `'server-only'` — para
ser a fonte única da regra, usada no servidor **e** na validação ao vivo da célula editável do
modal (`destinatarios.ts:1-5`). Mesma regex de `@/lib/asaas/client.emailValido` (`destinatarios.ts:7`).

**Lista vazia:**

| caminho | comportamento |
|---|---|
| fan-out | `paras.length === 0` → `{enviados:0, total:0}` sem tocar SMTP (`index.ts:246,286`) |
| chamador da solicitação | loga `"nenhum envolvido com e-mail — nada enviado"` e retorna (`solicitacoes/actions.ts:56-59`, e igual nas duas rotas de API) |
| #11 | só notifica se `res.emails.length > 0` (`solicitar-acesso/actions.ts:73`) |
| fatura | `efetivos.length === 0` → `{ok:false, erro:'Sem destinatário efetivo…'}` (`fatura.ts:79`); antes disso a action já recusa "Nenhum destinatário válido" (`actions.ts:627,636`) |

### 5.4 Uma mensagem por pessoa, ou uma para todos? — depende, e importa

**Divergem, e a diferença é de privacidade:**

- **Notificações internas (#4–11): UMA MENSAGEM POR PESSOA.** O fan-out passa
  `to: paras[i]` — um destinatário por `sendMail` (`index.ts:185`). **Ninguém vê o endereço de
  ninguém.** A alternativa `bcc` foi explicitamente rejeitada na ADR-0128:24, por isolamento de
  falha, não por privacidade — mas o efeito de privacidade vem junto.
- **Fatura (#12): UMA MENSAGEM PARA TODOS.** `to: efetivos.join(', ')` (`fatura.ts:142`) —
  **todos os endereços do cliente aparecem uns para os outros no cabeçalho `To:`**. Sem `bcc`.
  Para destinatários da mesma empresa cliente é o comportamento esperado de uma fatura; é ainda
  assim uma exposição de endereços **fora da organização**, e não há nada no repositório
  registrando essa escolha como decisão consciente. [L]

---

## 6. Garantias de entrega

### 6.1 Bloqueante ou melhor-esforço, e onde fica

**Melhor-esforço, sempre — mas `await`ado, sempre.** As duas metades importam.

| propriedade | como | evidência |
|---|---|---|
| não bloqueia o negócio | o envio acontece **depois** de a RPC já ter persistido, dentro de `try/catch` do chamador | `solicitacoes/actions.ts:32-36,50,73-76` |
| **nunca fire-and-forget** | todo call-site faz `await` | `admin/acessos/actions.ts:138,173` · `solicitacoes/actions.ts:64` · `api/externo/…/route.ts:110` · `…/cancelar/route.ts:45` · `solicitar-acesso/actions.ts:74` · `faturamento-corp/actions.ts:648` |

A razão do `await` está escrita e custou uma versão: em serverless, disparar a promise sem esperar
faz a função congelar antes de o envio terminar — **o e-mail simplesmente não sai, sem erro visível
em lugar nenhum** (v4.25.0/.1; `docs/email-layout-guide.md:99` · `index.ts:79-81`).

**Fora da transação do banco, sempre.** Não há transação envolvendo envio: a RPC commita, a action
retorna dela, e só então o e-mail é montado. Um e-mail que falha **não desfaz** a movimentação —
por desenho (`solicitacoes/actions.ts:33-36`).

`maxDuration`: as rotas da API externa declaram **60 s** (`route.ts:11`, `cancelar/route.ts:9`).
As Server Actions que enviam (`admin/acessos`, `solicitacoes`, `faturamento-corp`) **não declaram
`maxDuration`** — herdam o default da plataforma. O orçamento de 15 s do fan-out (`index.ts:84`) foi
dimensionado justamente para caber com folga.

### 6.2 O que acontece com a operação quando o envio falha

| operação | o que sobra |
|---|---|
| criar usuário / aprovar pedido | usuário **existe**, senha **na tela**, aviso âmbar "não foi possível enviar" (`actions.ts:136-141` · UI 2.3) |
| resetar senha | senha nova **já vale**, exibida na tela (`actions.ts:167-177`) |
| movimentar solicitação | movimentação **persistida**; a falha só vai para o log (`solicitacoes/actions.ts:73-76`) |
| pedido de acesso | pedido **gravado**; o admin descobre entrando na tela (`solicitar-acesso/actions.ts:82-85`) |
| fatura | `resultado: 'falhou'` com motivo na UI; **não** é marcada como enviada, então o reenvio é possível (`faturamento-corp/actions.ts:663`) |

### 6.3 Registro de envio — existe para UM dos doze

**Só a fatura tem registro persistente.** Tabela `app.fatura_email`
(`supabase/migrations/0169_fatura_email.sql:28-39`):

| coluna | conteúdo |
|---|---|
| `id` | identity |
| `fatura_cliente_no` | a ref da fatura — **sem `UNIQUE`** |
| `modo` | `'teste'` ou `'real'` (`CHECK`) |
| `destinatarios_reais` | jsonb — para onde **iria** no modo real |
| `destinatarios_efetivos` | jsonb — para onde **foi** de fato |
| `anexos` | jsonb, ex. `{"boleto":true,"nota":false}` |
| `sucesso` | boolean, `NOT NULL` |
| `erro` | text — motivo quando `sucesso=false` |
| `enviado_por` | `auth.uid()` de quem disparou |
| `enviado_em` | `timestamptz DEFAULT now()` |

RLS habilitada **deny-by-default**, sem policy — acesso direto negado; só as RPCs
`SECURITY DEFINER` chegam lá (`0169:41-43`). **Append-only**: toda tentativa, sucesso **ou** erro,
vira uma linha (`0169:67-69`, `registrar_email`, `0169:70-97`). O registro é gravado
**depois** do envio, pela action (`faturamento-corp/actions.ts:652-660`), e quando o registro
falha mas o envio deu certo, isso **sobe para a UI** como `registroFalhou: true`
(`actions.ts:555-557,665`) — a idempotência não foi gravada, então há risco de reenvio.

**Retenção: não há.** Nenhuma política de expurgo, nenhum índice de retenção, nenhuma leitura da
tabela pela aplicação além de `email_existentes`. Nenhuma tela mostra esse histórico (grep por
`fatura_email` em `src/` só encontra comentários).

**Para os outros onze avisos, o que resta é o `console.error`** — log de execução da Vercel, com
retenção da plataforma, não do projeto. O log é bom: rótulo do aviso, destinatário, tentativa
`n/3`, motivo da desistência e **código SMTP** (`index.ts:149-151`), mais o resumo `X/Y enviados`
(`index.ts:195-200`). Mas é log, não registro consultável: **não há como responder "esta pessoa
recebeu o aviso da solicitação #1393?" sem ler log bruto.**

### 6.4 Idempotência

| aviso | idempotência |
|---|---|
| Fatura | **sim, e por MODO.** `email_existentes(refs, modo)` devolve as refs com envio bem-sucedido **naquele modo**; o fluxo pula por default (`0169:45-65` · `actions.ts:640-645`). O operador pode furar deliberadamente com `forcarReenvio` (`actions.ts:568,640`). |
| Todos os demais | **nenhuma.** Refazer a operação reenvia. |

A **ausência de `UNIQUE` é decisão declarada, com aviso contra "corrigir"**: reenvio deliberado é
legítimo, então a idempotência é por consulta, não por constraint (`0169:17-22`, incluindo
"⚠ NÃO adicionar UNIQUE — a ausência é decisão de desenho documentada").

E o **modo entra na chave** por um motivo preciso: um envio feito em teste **não** pode contar como
"já enviado" quando a virada de produção acontecer, senão o real pularia justamente as faturas que
foram testadas (`0169:20-22` · `config.ts` §7 da skill).

**O que não impede duplicata:** o retry do fan-out, por construção (1.5). E, no caso da fatura, a
janela entre `sendMail` bem-sucedido e `registrar_email` que falha — o envio saiu, o registro não,
e o próximo disparo não vê a idempotência (`actions.ts:661-665`; o código **sinaliza** em vez de
engolir, mas não resolve).

### 6.5 Devolução, endereço inválido, caixa cheia

**Não há tratamento algum.** Nenhum webhook de bounce, nenhuma caixa de retorno monitorada, nenhum
`Return-Path` configurado, nenhuma tabela de supressão. Grep por `bounce`/`devolução`/`webhook` em
`src/` e `supabase/` não retorna nada relacionado.

O que o sistema enxerga é **só o que o servidor SMTP responde na hora do `sendMail`**:

- **rejeição síncrona** (5xx, caixa inexistente conhecida pelo servidor) → `false` / `{ok:false}`,
  logada, **não** retentada (`index.ts:109`);
- **rejeição assíncrona** (o servidor aceita, depois devolve) → **invisível para a plataforma**. O
  `sendMail` já retornou sucesso, o registro da fatura diz `sucesso = true`, e a devolução chega na
  caixa do remetente humano (`SMTP_FROM`), fora do sistema.

### 6.6 Alarme para falha repetida

**Não existe.** Nenhum contador, nenhum limiar, nenhuma integração de alerta. A detecção é humana:
a UI avisa no ato (senha na tela / linha "falhou" no modal de faturas), e o resto depende de alguém
ler os logs da Vercel. O out-briefing da v5.3.4 registra que foi exatamente esse o problema — a
intermitência do `432 4.3.2` só foi diagnosticada quando alguém olhou o log e viu `3/5 enviados`
(`index.ts:61-64`).

---

## 7. Configuração

### 7.1 Variáveis — os dois sentidos

**Lidas pelo código:**

| variável | onde é lida | obrigatória? | default |
|---|---|---|---|
| `SMTP_HOST` | `config.ts:27` | sim (sem ela → `null`) | — |
| `SMTP_USER` | `config.ts:28` | sim | — |
| `SMTP_PASS` | `config.ts:29` | sim | — |
| `SMTP_FROM` | `config.ts:30` | não | `SMTP_USER` |
| `SMTP_PORT` | `config.ts:31-32` | não | `587` |
| `SMTP_SECURE` | `config.ts:33` | não | `false` (STARTTLS) |
| `APP_BASE_URL` | `config.ts:55` | não | ver 7.2 |
| `VERCEL_PROJECT_PRODUCTION_URL` | `config.ts:57` | não | injetada pela Vercel |
| `EMAIL_MODO` | `config.ts:76` | não | `'teste'` (fail-safe) |
| `EMAIL_TESTE_DESTINO` | `config.ts:81` | **sim em modo teste** | — (ausente → recusa) |

**No `.env.example`:** todas as dez, **só as chaves, nenhum valor real** — `.env.example:23-28`
(as seis `SMTP_*`), `:36-37` (`EMAIL_MODO=teste`, `EMAIL_TESTE_DESTINO=`), `:43` (`APP_BASE_URL=`),
`:88` (`VERCEL_PROJECT_PRODUCTION_URL=`, com a nota de que é injetada pela Vercel).

**Resultado da conferência nos dois sentidos: batem exatamente.** Nenhuma variável de e-mail lida
pelo código falta no exemplo; nenhuma variável de e-mail no exemplo está morta no código.

### 7.2 URL base dos links

`getAppBaseUrl()` (`config.ts:54-60`), em cascata:

1. `APP_BASE_URL` (canônica, permite domínio próprio) — remove barras finais;
2. `VERCEL_PROJECT_PRODUCTION_URL` — prefixa `https://`, tira protocolo duplicado e barra final;
3. **`null`** — e aí o **botão simplesmente não aparece**; o e-mail continua válido
   (`template.ts:99-107,227-235,408-416`, cada um com `? … : ''`). [L][T] (`email.test.ts:120-134`)

Os links são fixos por aviso: `/solicitacoes` (`index.ts:256`), `/admin/acessos`
(`index.ts:293`), a raiz para a senha provisória (`index.ts:215`). **Sem deep-link** para o item
específico — declarado em `index.ts:232`.

### 7.3 Onde vivem os segredos, e quem os alcança

- **Local:** `.env.local`, git-ignored. Não vem numa worktree nova — armadilha registrada na
  memória do projeto e no `.env.example`.
- **Produção:** painel da Vercel → Environment Variables → **e um Redeploy**, senão não vale
  (`docs/runbooks/v4-24-email-runbook.md:23-27`).
- **Alcance no código:** `config.ts` importa `'server-only'` (`config.ts:1`), assim como `index.ts`
  e `fatura.ts`. Nenhuma variável de e-mail tem prefixo `NEXT_PUBLIC_` — **nada disso chega ao
  browser**.
- **Postura conhecida e registrada como dívida:** "A conta SMTP hoje é pessoal e a senha trafegou
  no chamado — recomenda-se trocá-la após configurar e, quando viável, migrar para um e-mail
  **dedicado**" (`runbook:52-56`). A migração é só troca de env, zero código.

### 7.4 Domínio remetente — autenticação de envio

**Não há nenhum registro de SPF, DKIM ou DMARC no repositório.** Grep case-insensitive por
`spf`/`dkim`/`dmarc` em `docs/` e `src/` não retorna nada. Também não há assinatura DKIM no
transporte (`nodemailer` aceita uma opção `dkim` em `createTransport`; ela **não** é passada —
`index.ts:19-27`).

Isso é coerente com a arquitetura: o envio é SMTP AUTH autenticado pelo próprio Office 365, com
`From = SMTP_USER`, ou seja, o tenant assina em nome do domínio dele. **Se o domínio tem SPF/DKIM
publicados, isso não é observável daqui** — vive no DNS e no painel do Microsoft 365.

### 7.5 A restrição arquitetural que forçou o SMTP próprio

`supabase/config.toml:196-197`: `[auth.rate_limit] email_sent = 2` — **2 e-mails por hora** pelo
serviço nativo do Supabase Auth. `[auth.email.smtp]` está **comentado** (`config.toml:236-243`),
ou seja, sem SMTP próprio configurado no Supabase local. E `[auth.email] enable_signup = false`
(`config.toml:219`): convite-only.

Na prática, **o Supabase Auth não envia e-mail nenhum neste produto**: o convite virou criação
direta com senha provisória exibida na tela (`src/components/admin/acessos/modal-convidar.tsx:13-14`
— "Sem e-mail (independe de SMTP)"). A página `/auth/confirm` sobrevive, em **dois passos**
deliberados — o GET só renderiza o botão, o POST é que consome o token, para que bot de pré-visualização
de link não queime o token antes do humano (`src/app/auth/confirm/page.tsx:5-8`).

---

## 8. Prova

### 8.1 O que a suíte cobre — e o que o verde significa

Quatro arquivos, **~60 casos**, em `src/lib/email/`:

| arquivo | casos | cobre |
|---|---|---|
| `email.test.ts` | 42 | templates interno e de movimentação (5 variantes), `getConfigSmtp`, `getAppBaseUrl`, contrato fallback-safe dos três envios, **e o bloco inteiro de concorrência/retry/orçamento** (`:300-465`) |
| `fatura.test.ts` | 20 | `splitDestinatarios`, `emailAmbiente`/`getEmailTesteDestino` fail-safe, template da fatura, override, fail-closed, contagem de anexos, recusas |
| `template-acesso.test.ts` | 3 | template do aviso de novo pedido |
| `destinatarios.test.ts` | 8 | regex e split isomórficos |

**Sim — o transporte é substituído por um dublê.** `email.test.ts:7-10` e `fatura.test.ts:6-8`:

```ts
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: sendMailMock }) } }))
```

Também `vi.mock('server-only', () => ({}))`, sem o qual o import quebra no Node do vitest
(`email.test.ts:6`).

**O que isso significa para o valor do verde:** `createTransport` é substituído inteiro, então
**nenhum caso executa uma linha de nodemailer**. A suíte prova o *nosso* código — configuração,
fallback, montagem do corpo, política de retry, override, fail-closed. Ela **não** prova a
biblioteca: pipeline MIME, `Content-ID`, codificação de anexo, negociação SMTP, STARTTLS. Um bump
que quebrasse o `Content-ID` de toda imagem embutida passaria com os mesmos ~1.225 testes verdes.

Nos chamadores, o mock sobe um nível — `vi.mock('@/lib/email', …)` em
`admin/acessos/actions.test.ts:59` e `solicitar-acesso/actions.test.ts:42-43`: aí nem a camada
roda, só a decisão de chamá-la. `solicitar-acesso/actions.test.ts:140` prova que uma rejeição do
envio não derruba a action.

### 8.2 Caminho de envio real exercitável

**Sim, e é o caminho prescrito para bump de biblioteca.** Não há script commitado — por desenho:
o da v5.10.2 foi temporário e removido antes do commit
(`…v5-10-2_Nodemailer_10.md:82`). O acionamento é:

1. `.env.local` com as `SMTP_*` reais;
2. `EMAIL_MODO` **ausente ou ≠ `'real'`** → `'teste'` (fail-safe);
3. `EMAIL_TESTE_DESTINO` = endereço interno;
4. chamar as funções **da camada de verdade** (`src/lib/email/**`), nunca uma cópia que remonte a
   mensagem — uma cópia não prova o pipeline que produção usa.

Para a fatura, em modo teste, o `destinatariosReais` pode ser um endereço-armadilha: o override
manda tudo para `EMAIL_TESTE_DESTINO` e o `destinatariosEfetivos` do retorno prova que nada vazou.

### 8.3 Verificação manual registrada

**Sim — v5.10.2, a mais completa que o repositório guarda**
(`docs/briefings/WT_Finance_Out_Briefing_v5-10-2_Nodemailer_10.md:78-138`). Essência:

> Três envios reais pela camada de verdade, `nodemailer` 10.0.9, SMTP real do Office 365, modo
> teste fail-closed. Resultados: `{"enviados":1,"total":1}` para os dois internos;
> `{"ok":true,…,"anexos":{"boleto":true,…}}` para a fatura. O fail-closed foi **exercitado**, com
> endereço "real" plantado que não recebeu nada.
>
> Conferência do que chegou, via Microsoft Graph: assunto, rodapé, presença/ausência de "Janus"
> conforme o público, anexos inline com **tamanho em bytes** (`welcome-group.png` 9.022 B,
> `janus.png` 12.753 B, ambos `isInline: true`) e o `boleto-….pdf` 13.600 B.
>
> **O controle que evitou um falso positivo:** o HTML devolvido pelo Graph vem **sem as tags
> `<img src="cid:…">`**, o que parecia regressão do CID. Não era. Um e-mail de **produção real de
> 01/09/2026**, enviado ainda no nodemailer 9, lido pelo mesmo Graph, aparece **igualmente sem os
> `<img>`** e com os mesmos dois PNGs inline. É o conector que remove a tag.
>
> **Conferência visual no Outlook real:** ✅ confirmada pelo Yan em 14/09 ("conferencia visual ok").
> Os três e-mails chegaram por volta das 08:56.

O modelo de conferência do projeto está escrito: o programático cobre conteúdo, estrutura, marca e
anexos; **renderização só o olho humano no cliente-alvo confirma** (`…:123-129`). E a regra geral —
"mudança visual de e-mail só é 'pronta' depois de conferida no cliente-alvo" — custou um patch
inteiro: a v4.24.1 shipou com o botão-virou-texto e o logo-caixa-preta porque só foi visto no
Outlook **depois** do merge (`docs/email-layout-guide.md:86`).

### 8.4 Construído × provado

| capacidade | construído | entrega real observada | teste com dublê | só lido |
|---|---|---|---|---|
| Transporte SMTP Office 365 / STARTTLS 587 | ✅ | ✅ [O] v5.10.2 | — | — |
| Timeouts de 10 s | ✅ | — | — | ✅ [L] |
| Fan-out com concorrência ≤ 2 | ✅ | — | ✅ [T] `email.test.ts:336` | — |
| Retry de 4xx / desistência em 5xx / EAUTH | ✅ | — | ✅ [T] `:352,362,372,380` | — |
| Backoff linear 1 s/2 s | ✅ | — | ✅ [T] `:388` | — |
| Orçamento de 15 s (gate de entrada) | ✅ | — | ✅ [T] `:410,420,435,444` | — |
| Nunca abandona envio em voo | ✅ | — | ✅ [T] `:444` | — |
| Fallback sem SMTP (senha na tela) | ✅ | — | ✅ [T] `:144` | — |
| Nunca lança, em todos os caminhos | ✅ | — | ✅ [T] `:158`, `fatura.test.ts:199` | — |
| Modo teste fail-safe (`EMAIL_MODO`) | ✅ | ✅ [O] v5.10.2 | ✅ [T] `fatura.test.ts:56-71` | — |
| Override de destinatário no ponto único | ✅ | ✅ [O] com armadilha plantada | ✅ [T] `:112` | — |
| Fail-closed sem `EMAIL_TESTE_DESTINO` | ✅ | — | ✅ [T] `:171` | — |
| Anexo falha → envio falha | ✅ | — | ✅ [T] `:159,190` | — |
| **Render no Outlook (tabelas, botão, lockup)** | ✅ | ✅ [O] v4.24.2, v4.40.0, v5.10.2 | ❌ **impossível** | — |
| **CID renderizando de fato** | ✅ | ✅ [O] bytes conferidos + olho humano | ❌ impossível | — |
| Fronteira de marca interno × cliente | ✅ | ✅ [O] "Janus" ausente na fatura | ✅ [T] `email.test.ts:68,193` | — |
| Escape anti-injeção | ✅ | — | ✅ [T] `:53`, `template-acesso.test.ts:29` | — |
| Idempotência por modo (fatura) | ✅ | — | ❌ (vive na action + RPC) | ✅ [L] |
| Registro em `app.fatura_email` | ✅ | — | ❌ | ✅ [L] |
| Throttle de ~30/min no lote | ✅ | — | ❌ | ✅ [L] `revisar-envio-modal.tsx:35` |
| **Tratamento de bounce** | ❌ não existe | — | — | — |
| **Alarme de falha repetida** | ❌ não existe | — | — | — |
| **Modo teste para os avisos internos** | ❌ não existe | — | — | — |

---

## 9. Contaminação de domínio

**Critério: um artefato está limpo se funciona sem conhecer o negócio deste produto.**

### 9.1 Genérico — copia quase inteiro

| artefato | por que é limpo |
|---|---|
| `config.ts` **inteiro** (82 linhas) | lê env, valida, cacheia, deriva URL base, deriva modo. Zero vocabulário de negócio. A única amarra é o **nome** das variáveis. |
| `criarTransporter` (`index.ts:18-28`) | 10 linhas, só configuração |
| `transitorio` + `descreverErro` (`index.ts:106-123`) | política de retry SMTP — **conhecimento de protocolo**, não de produto. O mais reaproveitável da camada. |
| `enviarUm` + `enviarFanOut` (`index.ts:131-202`) | semáforo + retry + orçamento. Domínio zero; só `rotulo` é string livre. |
| `anexoLogo` / `anexoLogoJanus` (`index.ts:31-53`) | o **padrão** CID-com-bytes-no-bundle é genérico; os bytes são da marca. |
| `destinatarios.ts` **inteiro** (27 linhas) | regex + split por `;` + dedupe. O `;` como separador é convenção do cadastro legado — parametrizável. |
| `escaparHtml` (`template.ts:33-37`) | genérico |
| **Estrutura de tabelas dos templates** | a engenharia anti-Outlook é genérica; o conteúdo, não. |

### 9.2 Específico deste produto — redesenha

| artefato | o que carrega |
|---|---|
| `MOV_PT` / `MOV_COR` (`template.ts:166-180`) | as 5 movimentações de Solicitação e a paleta das badges |
| Corpos dos 4 templates | "Senha provisória", "Atribuída a X, por Y", "Você recebe este e-mail por estar envolvido nesta solicitação", "Nada é criado até a aprovação", "Segue em anexo a fatura referente aos serviços prestados" |
| Rotas dos links | `/solicitacoes`, `/admin/acessos` (`index.ts:256,293`) |
| `solic_emails_envolvidos` e `_svc` | RBAC do Janus: `rbac_usuarios`, `rbac_roles`, `pode_ver_solic`, a regra de `ativo` |
| `solicitar_acesso_admin` | área `admin/acessos` do RBAC |
| `enviarFaturaEmail` (`fatura.ts:61-149`) | boleto/nota do Asaas, `ref`, cliente corporativo |
| `app.fatura_email` + as 3 RPCs (`0169`) | modelo de faturamento |

### 9.3 Marca, idioma, fuso, data, vocabulário

| dimensão | onde entra | acoplamento |
|---|---|---|
| **Marca (nomes)** | `APP_NOME = 'WT Finance'` e `APP_NOME_INTERNO = 'Janus'` — **duas const, `template.ts:21-22`** | trivial de parametrizar; a **fronteira** (interno usa um, cliente usa o outro) é a regra de verdade, ADR-0145 |
| **Marca (arte)** | dois blobs base64 em `logo.ts` + o lockup de 3 células com **larguras ópticas** 147×36 e 165×32, ajustadas num checkpoint humano (`template.ts:41-43,51,59`) | troca de arte exige refazer o ajuste óptico |
| **Marca (cor)** | 8 + 3 constantes hex derivadas dos tokens do DS (`template.ts:24-31,288-290`) | trivial |
| **Idioma** | **pt-BR cravado em todas as strings**, incluindo as de log. Nenhuma camada de i18n. | reescrita de texto |
| **Fuso** | `America/Sao_Paulo` **no banco**, não na aplicação: `to_char(… AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY" às "HH24:MI')` (`0224:424,467-470`). O template recebe a string **já formatada** e nunca formata data. | o formatador vive na RPC — bom isolamento, mas o formato é pt-BR |
| **Formato de data** | duas grafias diferentes coexistem: `"23/06/2026 às 10:04"` (movimentação, `0224:424`) e `"13 de julho de 2026, 11:35"` (aviso de acesso, `template.ts:372` — vem de `agoraFormatado()` na aplicação) | inconsistência real; ver bloco 10 |
| **Vocabulário** | "Solicitação", "movimentação", "Atribuída a", "permissão"/role, "Usuários & Acessos", "fatura", "boleto", "nota fiscal" | é o produto |

### 9.4 O que copia, o que parametriza, o que redesenha

**Copia quase intacto:** `config.ts` inteiro · `criarTransporter` · `transitorio`/`descreverErro` ·
`enviarUm`/`enviarFanOut` · `destinatarios.ts` · `escaparHtml` · o esqueleto de tabelas.

**Parametriza:** nomes de marca (2 const) · paleta (11 const) · bytes e dimensões dos logos ·
rotas dos links · `MAX_CONEXOES_SMTP`, `MAX_TENTATIVAS`, orçamento e timeouts (todos já são const
exportadas ou variáveis de módulo) · o separador `;` de destinatários · o formato de data.

**Redesenha:** os corpos dos quatro templates · a derivação de destinatários (é o RBAC do produto) ·
a regra de idempotência e o registro de envio (é o modelo de negócio) · a decisão de quais avisos
merecem modo de teste.

**E extrai — o que este repositório decidiu não fazer.** O próprio guia manda extrair um
`layoutBaseEmail({ corpoHtml })` ao chegar o **segundo** template (`email-layout-guide.md:71`).
Chegaram quatro e o shell segue duplicado, por escolha registrada (`template.ts:163-164`). Uma
replicação que comece com quatro avisos deveria começar pelo shell — a duplicação aqui é dívida
assumida, não padrão a copiar.

---

## 10. Divergências encontradas

| # | o que a documentação/skill diz | o que o código faz | evidência |
|---|---|---|---|
| 1 | Guia §8: fan-out é "um `sendMail` por destinatário via **`Promise.allSettled`**" | `Promise.allSettled` foi **removido** na v5.3.4 — hoje é semáforo de 2 trabalhadores com retry e orçamento. Era exatamente o `allSettled` que causava o `432 4.3.2` | `email-layout-guide.md:98` × `index.ts:55-68,178-194` |
| 2 | Guia §1, tabela da camada: `index.ts` = "`enviarSenhaProvisoria()`" | `index.ts` tem **três** funções de envio + o fan-out; e existe `fatura.ts`, ausente da tabela | `email-layout-guide.md:20` × `index.ts:205,234,278` · `fatura.ts:61` |
| 3 | Guia §5.1: "Hoje há **um** template… ao criar o segundo, extraia o scaffold para `layoutBaseEmail`" | há **quatro** templates e o scaffold **não** foi extraído — a duplicação virou decisão explícita | `email-layout-guide.md:71` × `template.ts:163-164` |
| 4 | Guia §8: "Resolva os destinatários numa **RPC gated** (`SECURITY DEFINER` + `pode_ver_solic`)" | verdade para a UI; **falso para a API externa**, que usa `solic_emails_envolvidos_svc`, sem `exigir_acesso` nem `pode_ver_solic`, sob `service_role` | `email-layout-guide.md:97` × `0213_api_outbox.sql:570-573,585-588` |
| 5 | Runbook §2: validar esperando o e-mail **"WT Finance — seu acesso foi criado"** | o assunto é **`Seu acesso foi criado \| Janus`** desde o rebranding (v4.40.0) | `v4-24-email-runbook.md:29-32` × `template.ts:78-80` |
| 6 | Guia §1: "`config.ts` lê `SMTP_*` e `APP_BASE_URL`" | lê também `EMAIL_MODO` e `EMAIL_TESTE_DESTINO`, e expõe `emailAmbiente()`/`getEmailTesteDestino()` — o modo teste inteiro está fora do guia | `email-layout-guide.md:18` × `config.ts:67-82` |
| 7 | Skill `email`, nota final: "O **convite de acesso** por e-mail depende de SMTP próprio — o serviço nativo do Supabase Auth limita a 2 envios/hora" | **não existe convite por e-mail.** O fluxo virou criação direta com senha provisória na tela, explicitamente "sem e-mail (independe de SMTP)". A limitação de 2/h é real e é a **causa histórica**, mas o convite não é um aviso vivo desta camada | skill `email`, §"Nota" × `modal-convidar.tsx:13-14` · `config.toml:196-197` |
| 8 | Skill `email` §1: "cada `sendMail` abre a sua própria conexão SMTP" — usado para justificar o teto de 2 | **correto**, e vale a nota: o teto de 2 protege **uma** chamada. Duas requisições simultâneas somam 4 conexões — não há coordenação entre processos | `index.ts:70-71,192-194` (limitação real, não erro da skill) |
| 9 | — (nada documenta) | **Dois formatos de data diferentes** no mesmo produto: `"23/06/2026 às 10:04"` (RPC) e `"13 de julho de 2026, 11:35"` (aplicação) | `0224:424` × `template.ts:372` · `solicitar-acesso/actions.ts:78` |
| 10 | — (nada documenta) | **A fatura manda uma única mensagem com todos os destinatários em `To:`**, expostos uns aos outros; as notificações internas mandam uma por pessoa. A ADR-0128 documenta a escolha **só** do lado interno | `fatura.ts:142` × `index.ts:185` · `adr/0128…:24` |
| 11 | — (nada documenta) | **O destinatário nomeado de uma solicitação recebe e-mail mesmo INATIVO** — as outras duas fontes têm `AND ativo`, essa não. É a única das três sem comentário justificando | `0224:447-448` |

---

## Reconstruível

Denso o bastante para virar spec **sem este repositório**:

1. **Contrato da camada.** Toda função de envio retorna resultado (`boolean` ou
   `{ok, erro}` / `{enviados, total}`) e **nunca lança**. Toda chamada é `await`ada, sempre **depois**
   da persistência, dentro de `try/catch` do chamador, e **fora** de qualquer transação.
2. **Transporte.** `nodemailer` sem pool; um transportador por envio (ou por fan-out); SMTP AUTH
   usuário/senha; STARTTLS na 587; três timeouts de 10 s; `from` = `SMTP_FROM` ou `SMTP_USER`,
   sem display name, sem `replyTo`, sem cabeçalho de campanha.
3. **Política de falha, completa.** A tabela de 1.5 (EAUTH nunca; 4xx sim; 5xx não; lista fechada
   de códigos de rede), backoff linear 1 s/2 s, 3 tentativas, e o trade-off declarado
   duplicata-preferível-a-perda **para notificação interna apenas**.
4. **Fan-out.** Semáforo com teto abaixo do limite do provedor, orçamento de tempo como **gate de
   entrada** (nunca cancela envio em voo), dedupe + trim antes, log de `X/Y` e de quantos não foram
   tentados.
5. **Configuração fail-safe.** Faltou variável essencial → `null` cacheado, `console.warn`,
   chamador cai no fallback. URL base em cascata de três níveis com `null` no fim, e o link
   simplesmente sumindo da mensagem.
6. **Modo teste fail-closed.** Modo derivado do ambiente com default seguro; override de
   destinatário **no ponto único da camada**; recusa sem destino de teste; confirmação repetida no
   servidor; marca visível na mensagem (prefixo de assunto + faixa); **idempotência que inclui o
   modo na chave**.
7. **Composição anti-Outlook.** As doze regras de 3.5, cada uma com a razão. É a parte mais cara de
   redescobrir e a mais barata de copiar.
8. **Imagem por CID com bytes no bundle**, PNG rasterizado do SVG com alpha verificado, `alt`
   sempre, nunca `path` de estático, nunca `data:` URI.
9. **Anexo que falha = envio falha, com motivo.** Nunca mensagem incompleta silenciosa. Limite de
   tamanho, sanitização de `filename`, rejeição de conteúdo vazio.
10. **Derivação de destinatários no banco**, por RPC `SECURITY DEFINER` que devolve só o contexto
    daquele item — nunca um diretório — e usa o mesmo erro para "não existe" e "não pode ver".
11. **Registro de envio append-only sem `UNIQUE`**, com reais **e** efetivos, modo, anexos,
    sucesso/erro, quem e quando; idempotência por consulta, não por constraint.
12. **Método de prova.** Dublê para o nosso código; envio real pela camada de verdade em modo teste
    fail-closed para a biblioteca; comparação de anexo **por bytes**; conferência humana no
    cliente-alvo; e **achar o controle** antes de chamar qualquer coisa de regressão.

## Faltando

Cada item com a pergunta exata que uma spec precisaria responder.

1. **SPF / DKIM / DMARC do domínio remetente.** Nada no repositório. → *O domínio de `SMTP_FROM`
   tem SPF, DKIM e DMARC publicados? Em que política (`p=none`/`quarantine`/`reject`)? Quem
   administra o DNS?*
2. **Limites reais do tenant Office 365.** O código cita 3 conexões e 30 msg/min como conhecimento
   de comentário. → *Esses números batem com o tenant atual, ou são do plano de 2026? Há teto
   diário? A mailbox é compartilhada com uso humano?*
3. **Conta SMTP.** O runbook diz que é pessoal e que a senha trafegou num chamado. → *Foi trocada?
   Migrou para caixa dedicada? Usa senha de app com MFA?*
4. **Volume real.** Não há métrica. → *Quantos e-mails/dia esta camada envia hoje, por tipo? Qual o
   maior fan-out já observado (nº de envolvidos numa solicitação)?*
5. **Devoluções.** Sem tratamento. → *Para onde vão os bounces hoje — caixa do `SMTP_FROM`? Alguém
   os lê? Existe endereço inválido conhecido no cadastro de clientes?*
6. **Modo teste dos avisos internos.** → *É intencional que preview/dev com `SMTP_*` preenchidas
   envie senha provisória e notificações para pessoas reais, ou é lacuna? A replicação deve estender
   o override do ponto único a toda a camada?*
7. **Destinatário nomeado inativo.** → *É regra de negócio deliberada ("quem tem a tarefa recebe,
   mesmo desativado") ou o `AND ativo` faltou?*
8. **Endereços expostos na fatura.** → *Os destinatários de uma fatura devem se ver no `To:`, ou a
   replicação deve mandar uma mensagem por pessoa como as internas?*
9. **Retenção de `app.fatura_email`.** → *Por quanto tempo o registro de envio deve ser guardado?
   Há exigência fiscal ou de LGPD sobre esses endereços?*
10. **Estado da virada de produção da fatura.** O código diz "modo real inalcançável, a virada é
    do Yan". → *`EMAIL_MODO` já foi virado para `real` na Vercel, ou o faturamento segue 100 % em
    modo teste?*
11. **`/auth/confirm`.** Rota viva, sem nenhum e-mail que gere o link. → *Há caminho manual
    (`generateLink` pelo painel) que ainda a use, ou é código morto?*
12. **Prova de resiliência do fan-out em produção.** Concorrência, retry e orçamento têm teste com
    dublê; nunca foram exercitados contra o Office 365 real com fan-out grande. → *Vale uma
    verificação com N≥6 destinatários em modo controlado antes de replicar os números 2/3/15 s?*

## Decisões embutidas

Cada ponto em que o modelo resolveu uma tensão de um jeito e não de outro.

1. **Melhor-esforço × bloqueante → melhor-esforço, sempre.**
   *Compra:* nenhuma operação de negócio jamais falha por causa de e-mail; o fallback da senha na
   tela torna o SMTP genuinamente opcional.
   *Custa:* não existe garantia de entrega para nada; para onze dos doze avisos não há sequer como
   responder depois se a mensagem saiu.

2. **`await` × fire-and-forget → `await`, sem exceção.**
   *Compra:* em serverless, é a única forma de o envio acontecer — sem isso a função congela e o
   e-mail some sem erro (v4.25.1).
   *Custa:* latência do SMTP entra no tempo de resposta do usuário. Daí o orçamento de 15 s e os
   timeouts de 10 s — mitigações de uma decisão, não conveniências.

3. **Retry com risco de duplicata × garantia de unicidade → duplicata, para o interno.**
   Declarada em `index.ts:98-104`. *Compra:* o `432` transitório do Office 365 deixa de perder
   e-mail. *Custa:* uma cópia a mais quando o socket cai depois do `250 OK`. **E a decisão se
   inverte para a fatura**, que não tem retry e tem registro próprio — a mesma tensão, resolvida
   nos dois sentidos conforme a reversibilidade do aviso.

4. **Orçamento que cancela × orçamento que só barra entrada → só barra entrada.**
   *Compra:* nunca reproduz a falha de abandonar promise em serverless. *Custa:* o pior caso real é
   15 s + um `sendMail` em voo (~10 s), não 15 s.

5. **Teto de conexões 3 (o limite) × 2 (com folga) → 2.**
   *Compra:* a mesma mailbox serve senha provisória e fatura na mesma janela; sobra cota.
   *Custa:* fan-out mais lento; e a folga é por chamada, não global — duas requisições simultâneas
   ainda somam 4.

6. **Uma mensagem para todos × uma por pessoa → divergem entre os dois públicos.**
   Interno: uma por pessoa, `bcc` explicitamente rejeitado, ninguém vê ninguém (ADR-0128:24).
   Cliente: uma mensagem com todos no `To:`.
   *Compra (interno):* falhas isoladas, retry por destinatário, privacidade de brinde.
   *Compra (fatura):* um anexo baixado uma vez, um registro, uma "conversa" com o cliente.
   *Custa (fatura):* endereços expostos entre si, **fora** da empresa — e sem registro de que a
   escolha foi ponderada.

7. **Shell único × scaffold duplicado → duplicado, contra a própria receita escrita.**
   *Compra:* cada template evolui sem risco de quebrar os outros; a fronteira de marca
   (interno × cliente) fica fisicamente separada, impossível de vazar por herança.
   *Custa:* quatro cópias de tabela, media query e botão. Um conserto anti-Outlook precisa ser
   aplicado quatro vezes — e o guia §5.1 diz para extrair, o que torna a divergência um risco de
   alguém "corrigir" a duplicação sem entender a fronteira.

8. **Modo teste universal × só para o irreversível → só para a fatura.**
   *Compra:* o único aviso que sai da empresa, carrega valor e documento fiscal, e não volta, tem
   sandbox, override no ponto único e fail-closed.
   *Custa:* senha provisória e notificações — inclusive com credencial em texto claro — **não têm
   proteção nenhuma** contra envio acidental a partir de um ambiente não produtivo.

9. **Idempotência por `UNIQUE` × por consulta → por consulta, com aviso contra "corrigir".**
   *Compra:* reenvio deliberado é possível; **toda tentativa**, inclusive as que falharam, fica
   registrada. *Custa:* a idempotência depende de a action consultar antes — e a janela entre
   `sendMail` e `registrar_email` pode duplicar um envio real (o código sinaliza, não resolve).

10. **Chave da idempotência com × sem o modo → com o modo.**
    *Compra:* a virada para produção não pula justamente as faturas que foram testadas.
    *Custa:* a mesma fatura pode sair duas vezes para a mesma caixa (uma em teste, uma em real) —
    aceito porque o destino do teste é interno.

11. **Campo ausente = string vazia × campo ausente = erro → string vazia, por desenho.**
    *Compra:* o e-mail sobrevive sem `link`, sem `quando`, sem `justificativa`.
    *Custa:* um e-mail **incompleto sai bonito, sem log e sem erro**, e o gate passa verde. Custou a
    v5.9.0: a movimentação `aprovada` saía sem data porque o contexto só conhecia `criado_em` e
    `decidido_em`. A mitigação adotada — resolver no ato que gravou e passar `quandoOverride`
    (`solicitacoes/actions.ts:44-48,211`) — é remendo local, não conserto do desenho.

12. **RPC gated × variante `service_role` para a API externa → variante sem gate.**
    *Compra:* a porta externa passa a notificar (a gated sempre negava — não há JWT de usuário).
    *Custa:* uma função que resolve e-mails de qualquer solicitação, sem verificação de acesso,
    passa a existir no banco. O controle é só o `GRANT` para `service_role` mais o `REVOKE` de
    `anon`/`authenticated` — quem tiver a chave de serviço enumera destinatários por `id`.

13. **Formatar data na aplicação × no banco → no banco, para as movimentações.**
    *Compra:* o fuso de São Paulo fica numa linha de SQL, longe de cinco camadas de JS; o template
    nunca formata data. *Custa:* dois formatos coexistem no produto, porque o aviso de acesso
    formata na aplicação.

14. **Validação estrita × sanidade mínima no fan-out → mínima (`p.includes('@')`).**
    *Compra:* uma RPC que devolva algo inesperado não trava a notificação inteira.
    *Custa:* endereço malformado vindo do banco é entregue ao SMTP e vira falha permanente
    (5xx, sem retry) — enquanto a fatura, que usa `splitDestinatarios`, filtra por regex antes.
    A mesma camada valida com dois rigores diferentes.
