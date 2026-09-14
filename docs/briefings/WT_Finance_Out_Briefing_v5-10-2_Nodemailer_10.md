# Out-Briefing v5.10.2 — Atualização de segurança do envio de e-mail (`nodemailer` 10)

**Tipo:** PATCH · **Rota C** (o prompt do Yan é a spec) · **Branch:** `chore/v5-10-2-nodemailer-10` ·
**Base:** `main` (v5.10.1 + docs de pós-merge, `4fa7075`) · **Migration:** nenhuma · **ADR:** nenhum ·
**Arquivos de `src/` alterados:** **nenhum** (fora a entrada do changelog da diretoria) ·
**Testes:** 1.220 (idênticos à baseline, zero `skip`).

Fechamento em 14/09/2026. Conferência visual do Outlook ✅ confirmada pelo Yan.
**Mergeada — PR #269, 14/09/2026 às 09:51** (`e3d164a`).

## 1. O que foi feito

`nodemailer` 9.0.1 arrastava as **4 últimas advisories** do repositório:

| CVE | severidade | o quê |
|---|---|---|
| GHSA-8m3c-c648-2xjj | high | `resolveContent()` numa `MailMessage` fura `disableFileAccess`/`disableUrlAccess` na assinatura legada |
| GHSA-wmmp-3585-3rmp | — | bypass da allow-list de domínio por IDN/punycode → entrega a domínio do atacante |
| GHSA-2x7j-588g-ccc2 | — | complexidade quadrática no `addressparser` → DoS por lista de endereços forjada |
| GHSA-cc9r-2j5m-2m83 | — | bypass da validação de domínio por má leitura de comentário RFC 5322 |

O fix exige **major**. Feito: **`^9.0.1` → `^10.0.9`**. Resolve **B-02** do `docs/backlog-v6.md`
(achado **D6-004** da auditoria da v5.10.0).

**`npm audit`: 1 → 0.** `found 0 vulnerabilities`. É a primeira vez que o repositório fecha zerado
desde que a auditoria da v5.10.0 levantou a lista — a v5.10.1 levou o `vitest`/`esbuild`, esta levou
o `nodemailer`. Nenhuma vulnerabilidade nova.

## 2. Exposição real: verificada, não presumida

O prompt mandou confirmar se usamos allow-list de domínio ou `disableFileAccess`/`disableUrlAccess`,
"porque a semântica pode ter mudado e é exatamente o ponto das CVEs". **Não usamos nenhuma das duas** —
zero ocorrências em `src/`. E, mais importante:

- **Todo anexo usa `content: Buffer`** (`index.ts:31-53` para os logos via CID; `fatura.ts:134-139`
  para boleto/nota/extras). **Nunca `path`, nunca `href`** — que é precisamente o vetor da CVE do
  `resolveContent`.
- `to`/`from` são strings simples validadas por `emailValido()`/`splitDestinatarios()`
  (`destinatarios.ts`), vindas de cadastro interno — o `addressparser` não recebe entrada adversarial
  de terceiro em volume amplificável.

Ou seja: a exposição prática era baixa. O patch fecha a porta assim mesmo, que é o certo para um
patch de segurança — mas fica registrado que **nenhuma das 4 CVEs tinha caminho alcançável** por este
código, e isso foi apurado, não suposto.

## 3. Breaking changes da major × o que o repo usa

Changelog oficial lido (não se presumiu de memória). A major 10 tem **dois** breaking changes:

| Breaking change | Efeito aqui |
|---|---|
| **Node.js ≥ 20** obrigatório | Repo roda **24** (`.nvmrc`), e o piso de produção é `>=20.9.0`. Sem efeito — e, ao contrário do `vitest` 5 na v5.10.1, aqui o piso declarado **cobre** o requisito |
| **Migração para TypeScript, builds ESM + CJS duplos** | Muda o `exports` do pacote. Ver §7 (tipos) e §6 (default import) |

Nada sobre `createTransport`, `sendMail`, anexos, CID, headers ou `addressparser` na API pública —
que é **toda** a superfície usada pelo repo:

- `nodemailer.createTransport({host, port, secure, auth, connectionTimeout, greetingTimeout, socketTimeout})` — `index.ts:19`
- `.sendMail({from, to, subject, html, text, attachments})` — `index.ts:217` e `fatura.ts:141`

Nenhum import de submódulo (`nodemailer/lib/*`), nenhum uso direto de `addressparser`, `mail-composer`
ou `punycode`. **Por isso `src/lib/email/**` não precisou de uma linha.**

## 4. Os invariantes da skill `email` não mudaram — porque nada foi tocado

Conferido pelo `revisor` arquivo a arquivo (§8): camada única fallback-safe que nunca lança
(`index.ts:210-225`, `fatura.ts:145-148`); `enviarFanOut` com `MAX_CONEXOES_SMTP=2` e retry só para
falha transitória (`index.ts:70-202`); CID com bytes no bundle (`index.ts:31-53`); layout em tabelas
(`template.ts`); fronteira de marca (`index.ts:218/260/297` com lockup duplo × `fatura.ts:134-139`
só com `anexoLogo()`); MODO TESTE fail-closed com override no ponto único (`fatura.ts:69-80`).

`email.test.ts` seguiu verde **sem alteração de nenhuma expectativa**, como o prompt exigia.

## 5. PROVA REAL — o único teste que exercita a major

**A suíte NÃO prova este patch.** `email.test.ts:8` mocka o `nodemailer` inteiro
(`vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: sendMailMock }) } }))`).
Os 1.220 testes passariam idênticos com a biblioteca quebrada. Daí a exigência do prompt.

Envio real pela **camada de verdade** (`src/lib/email/**`, não uma cópia), com `nodemailer` **10.0.9**,
SMTP real do Office 365, em **modo teste fail-closed** (`EMAIL_MODO` ausente → `'teste'`;
`EMAIL_TESTE_DESTINO` = endereço interno do Yan). Script temporário, removido antes do commit.

| # | template | marca | resultado |
|---|---|---|---|
| 1 | `enviarNotificacaoAcessoSolicitado` (interno) | **Janus** + lockup duplo | `{"enviados":1,"total":1}` |
| 2 | `enviarNotificacaoSolicitacao` (interno, movimentação `aprovada`) | **Janus** + lockup duplo | `{"enviados":1,"total":1}` |
| 3 | `enviarFaturaEmail` (cliente externo) | **WT Finance / Welcome**, sem "Janus" | `{"ok":true,"destinatariosEfetivos":["yan@..."],"anexos":{"boleto":true,...}}` |

**O fail-closed foi exercitado, não só lido:** no envio 3 passei `destinatariosReais:
['nao-deve-receber@exemplo-invalido.test']`. O override do ponto único mandou tudo para
`EMAIL_TESTE_DESTINO`, e o `destinatariosEfetivos` de retorno confirma. Nada saiu para o endereço
"real" plantado.

### 5.1 O que chegou na caixa (conferido via Microsoft Graph)

| item | interno (movimentação) | fatura (cliente) |
|---|---|---|
| assunto | `Solicitação aprovada: … \| Janus` ✅ | `[TESTE — destinatário real: …] Fatura Welcome Trips – … – Nº PROVA-5102` ✅ |
| rodapé | `JANUS · WELCOME GROUP` ✅ | `WT FINANCE · WELCOME GROUP` ✅ |
| "Janus" no corpo | presente (correto) | **ausente** ✅ — a fronteira de marca segurou |
| anexos inline (CID) | `welcome-group.png` 9.022 B + `janus.png` 12.753 B, ambos `isInline: true` | `welcome-group.png` 9.022 B `isInline: true` |
| anexo comum | — | `boleto-PROVA-5102.pdf` 13.600 B |
| faixa "Modo teste" | — | presente, nomeando o destinatário real ✅ |

### 5.2 O controle que evitou um falso positivo

O corpo HTML devolvido pelo Graph vem **sem as tags `<img src="cid:…">`** — a célula do logo chega
vazia. Isso parecia regressão do CID. **Não é.** Duas provas:

1. O template gera as tags normalmente (renderizado localmente: 1 `<img>` na fatura, 2 no lockup interno).
2. **Controle direto:** um e-mail de **produção real de 01/09/2026**, enviado ainda no `nodemailer` 9
   (`Solicitação criada: Lançamentos do cartão Clara #1393 | Janus`, para `natalia@`), lido pelo mesmo
   Graph, aparece **igualmente sem os `<img>`** e com os mesmos dois PNGs inline. É o conector que
   remove a tag ao devolver o HTML — comportamento idêntico antes e depois da major.

E a comparação byte a byte fecha: `welcome-group.png` **9.022 B** e `janus.png` **12.753 B** no e-mail
novo são **exatamente os mesmos tamanhos** do e-mail de produção do `nodemailer` 9, com a mesma
estrutura de tabelas. O pipeline de MIME/CID saiu inalterado da major.

### 5.3 Conferência visual — ✅ CONFIRMADA pelo Yan

A verificação programática cobriu conteúdo, estrutura, marca e anexos; **renderização** (o logo via
CID aparecendo de fato, as tabelas sem quebra no motor do Word) só o olho humano no cliente-alvo
confirma — é o modelo de conferência do projeto. Os 3 e-mails chegaram em **14/09 por volta das
08:56** e o **Yan confirmou a conferência visual no Outlook real em 14/09** ("conferencia visual ok").

Com isso a prova exigida pelo prompt está **completa**: envio real + conteúdo conferido + CID
renderizando no cliente-alvo. Nenhuma pendência de verificação em aberto nesta versão.

## 6. Default import sob ESM/Turbopack

Risco levantado e checado: a major mudou o `exports` do pacote, e o repo faz
`import nodemailer from 'nodemailer'` (`index.ts:2`). O `revisor` verificou os dois builds —
`dist/esm/nodemailer.js` (`export default nodemailer`) e `dist/cjs/nodemailer.js`
(`exports.default = nodemailer`) expõem o **mesmo shape** `{createTransport, createTestAccount,
getTestMessageUrl}`, com `exports["."]` mapeando `import`→ESM e `require`→CJS consistentemente.
Bate com o mock da suíte. Sem risco residual de interop — e o `npm run build` e o envio real por
`tsx` exercitaram os dois caminhos.

## 7. `@types/nodemailer` ficou inerte — mantido de propósito

A major passou a embarcar **76 arquivos `.d.ts`** próprios, mas **não declara `types`/`typings`** no
`package.json`. Sob `moduleResolution: "bundler"`, o TS acha o `.d.ts` irmão do `.js` resolvido.
Confirmado com `tsc --traceResolution`:

```
Module name 'nodemailer' was successfully resolved to
  node_modules/nodemailer/dist/esm/nodemailer.d.ts  with Package ID 'nodemailer/…@10.0.9'
```

Ou seja: `@types/nodemailer` `^8.0.1` **continua declarado mas não é mais consultado**. Não quebra
nada (os tipos em uso são os corretos, do 10.0.9), mas é dívida: um `@types/*` descrevendo a API 8.x
ao lado de um runtime 10.x.

**REMOVIDO — o Yan autorizou expressamente ("pode fazer a higiene do @types/nodemailer neste PR
mesmo").** Foi a autorização que faltava: a regra permanente é não remover nada sem pedido expresso,
e por isso o pacote tinha ficado de fora do primeiro corte, com o `revisor` recomendando o mesmo.

**A remoção se prova sozinha:** o `tsc --traceResolution` devolve **o mesmo resultado antes e depois**
— `nodemailer/dist/esm/nodemailer.d.ts@10.0.9`. Se o `@types` estivesse sendo consultado, a resolução
teria mudado ou o `tsc` teria quebrado. Não houve nenhum `import type` de `nodemailer` no repo (o
único import é de valor, `index.ts:2`), e nada mais dependia do pacote. Gates completos rodados de
novo depois da remoção: `tsc`, `lint`, `build` limpos, 1.220 testes, `npm audit` em zero.

## 8. Parecer da revisão

`revisor` despachado com contexto limpo. **Veredito: APROVADO COM RESSALVAS** — 0 CRÍTICO, 0 ALTO,
2 MÉDIO, 1 BAIXO.

**MÉDIO 1 — `@types/nodemailer` inerte. ENDEREÇADO por registro.** É o §7. O revisor recomendou
explicitamente *não* remover agora e levar a decisão ao Yan; foi o que se fez.

**MÉDIO 2 — não existe skill de "gestão de dependências" no projeto.** A delegação listou só a skill
`email`, correta para o domínio funcional, mas o diff é uma major bump pura. O revisor sinalizou a
ausência sem mudar o veredito. **Registrado, não agido:** três patches de dependência em dois dias
(v5.9.7 `next`, v5.10.1 `vitest`, v5.10.2 `nodemailer`) já formam um padrão com método repetido — ler
o changelog oficial, cruzar com o uso real, provar o que a suíte não prova. Se vier um quarto, vira
candidato a ritual pela régua de 5 destinos (destino 5). Um patch de segurança não é a hora de criar
skill nova.

**BAIXO — provar que o `tsc --noEmit` rodou DEPOIS da troca da fonte de tipos. CONFIRMADO.** O revisor
tinha razão em não aceitar "o build passou" como equivalente. O `npx tsc --noEmit` rodou **três vezes**
com o `nodemailer` 10 já instalado e os tipos já vindo do pacote: (1) logo após o `npm install
nodemailer@10`, antes de qualquer outra coisa; (2) na bateria completa de gates; (3) depois das edições
de documentação. Limpo nas três. O `--traceResolution` do §7 é da mesma rodada, o que prova que o
typecheck limpo se deu **com** os tipos do 10.0.9, não com os do `@types` 8.

**Sem achado** (resumo): invariantes da skill `email` intactos um a um; superfície de API sem opção
renomeada na major; nenhuma das 4 CVEs alcançável pelo uso do repo; default export idêntico nos dois
builds; escopo do diff estritamente `package.json`/`package-lock.json`.

## 9. Arquivos

| arquivo | o quê |
|---|---|
| `package.json` | `nodemailer` ^9.0.1 → ^10.0.9; **`@types/nodemailer` ^8.0.1 removido** (§7); bump 5.10.1 → 5.10.2 |
| `package-lock.json` | resolução da árvore |
| `CHANGELOG.md` | entrada `[5.10.2]` |
| `src/data/changelog-diretoria.ts` | entrada 5.10.2 em linguagem de negócio (único arquivo de `src/`; não é código de aplicação) |
| `docs/backlog-v6.md` | **B-02 riscado** (resolvido por execução) |
| `docs/WORKING-CONTEXT.md` | "Em voo" = v5.10.2 + a pendência visual do Yan |
| `docs/briefings/WT_Finance_Out_Briefing_v5-10-2_Nodemailer_10.md` | este arquivo |

## 10. Aprendizado — régua de 5 destinos

1. **"A suíte mocka a dependência, então a suíte não prova a major."** O durável desta versão. Vale
   para qualquer bump de biblioteca que os testes isolam por mock — o verde é sobre o *nosso contrato*,
   não sobre a biblioteca. → **Destino 4 (skill de domínio)**: acrescentar à skill `email` uma linha de
   que `email.test.ts` mocka o transporte e que bump de `nodemailer` exige envio real. **Não feito
   nesta versão** — mexer em skill é mudança de harness e vai a PR próprio com o Yan revisando; fica
   proposto aqui.
2. **"Antes de chamar de regressão, ache o controle."** O `<img cid:>` sumido no corpo devolvido pelo
   Graph parecia defeito do patch; o e-mail de produção de 01/09 no `nodemailer` 9, lido pelo mesmo
   caminho, mostrou o mesmo. → **Destino 2 (já coberto)**: é a disciplina de auto-auditoria adversarial
   do core, aplicada. Fica no out-briefing.
3. **`engines` do npm (v5.10.1) × piso do nodemailer 10.** Aqui o piso declarado (`>=20.9.0`) **cobre**
   o requisito (Node ≥ 20), ao contrário do vitest 5. → **Destino 2**: nada a fazer; o comentário
   `//engines` já registra a distinção prod × dev.

## 11. Gates e disciplina

| gate | resultado |
|---|---|
| `npx tsc --noEmit` | ✅ limpo (3×, com os tipos do 10.0.9 — §8) |
| `npm run lint` | ✅ limpo, zero warning novo |
| `npm run build` | ✅ |
| `npm test` | ✅ **74 arquivos · 1.220 testes · 0 skip** (baseline: idem) |
| `npm audit` | ✅ **0 vulnerabilidades** |

Nenhum arquivo de config de gate editado. Nenhuma migration escrita; `db:migrate` não invocado.
`src/types/database.ts` não regenerado (sem RPC). `revisor-db` e `verificador-visual` **N/A
declarados**: sem banco e sem UI. O script de prova de envio foi removido antes do commit. Merge e
deploy são do Yan.
