# Out-briefing — v5.3.4 · E-mail intermitente nas notificações de Solicitações

**Rota:** C (patch de correção, sem decisão de produto aberta)
**Data:** 2026-07-30
**Migrations:** nenhuma · **ADR novo:** nenhum (a correção não muda arquitetura; o comentário
`v5.3.4` no `src/lib/email/index.ts` carrega o porquê no ponto de uso)

---

## 0. Escopo pedido (a Rota C não tem briefing — o prompt é a especificação)

> "o processo de disparo de emails do módulo de solicitações não parece estar funcionando direito,
> os usuários não estão recebendo os emails de forma consistente (parecem estar recebendo as vezes
> sim e as vezes não), preciso que você me ajude a investigar isso com a devida atenção dada a
> relevância do problema"

O pedido é de **investigação**. A correção foi implementada depois que o usuário forneceu a
evidência de produção que confirmou a causa-raiz (§1).

---

## 1. Causa-raiz e correção

### O que estava errado

`enviarNotificacaoSolicitacao` (`src/lib/email/index.ts`) disparava o fan-out assim:

```ts
const transporter = criarTransporter(cfg)          // nodemailer SEM pool
const r = await Promise.allSettled(paras.map(para =>
  transporter.sendMail({ ..., to: para, ... }),     // TODOS ao mesmo tempo
))
```

Num transporter sem `pool`, cada `sendMail` abre a **sua própria** conexão SMTP. `Promise.allSettled`
sobre N destinatários abre, portanto, **N conexões simultâneas**.

O SMTP AUTH do Exchange Online (Office 365) impõe, **por mailbox**:

| Limite | Valor | Erro ao exceder |
| --- | --- | --- |
| Conexões simultâneas | **3** | `432 4.3.2 STOREDRV.ClientSubmit; sender thread limit exceeded` |
| Mensagens por minuto | 30 | atraso/throttling, excedente carregado para o minuto seguinte |

Com 4+ envolvidos numa solicitação — o caso **comum** quando o destinatário é uma *permissão*
(role), porque a RPC `solic_emails_envolvidos` devolve autor + **todos os membros ativos** da role —
o excedente era recusado. Como é uma corrida entre conexões, **o conjunto de perdedores mudava a
cada disparo**: exatamente o "às vezes sim, às vezes não" relatado.

### Evidência (o que fechou o diagnóstico)

Log de runtime da Vercel, `POST /solicitacoes` em 30/07 às 12:01:54:

```
[email] notificação de solicitação: 3/5 enviados (falhas best-effort).
```

**3 de 5** — precisamente o teto de 3 conexões. O código já emitia esse log desde a v4.25.0; o que
faltava era alguém olhar para ele.

### O que foi descartado na investigação

| Hipótese | Por que caiu |
| --- | --- |
| Regressão recente | `git log` do caminho de envio: nada tocou o fan-out desde a v5.0.1 (`06c0fd7`). O bug é da v4.25.0 e só apareceu quando as roles ficaram maiores. |
| Fire-and-forget (lição v4.25.1) | A invariante está **preservada**: os 4 pontos de movimentação fazem `await notificarMovimentacao(...)`. |
| SMTP desconfigurado / envs faltando na Vercel | Seria falha **total** e silenciosa (`getConfigSmtp() → null`), não parcial e variável. |
| Filtro de spam no destinatário | Não explica variação entre destinatários do mesmo tenant no mesmo disparo; e o log prova recusa **na submissão**. |

### A correção

1. **Fan-out único e compartilhado** (`enviarFanOut`) — os dois fan-outs da camada
   (`enviarNotificacaoSolicitacao` e `enviarNotificacaoAcessoSolicitado`) duplicavam o mesmo bloco e
   tinham o **mesmo** defeito. Agora dividem o helper, como manda a skill `email` ("a lógica de
   transporte é compartilhada e não se duplica").
2. **Concorrência limitada:** `MAX_CONEXOES_SMTP = 2`, deliberadamente **abaixo** de 3. A folga não
   é estética: a mailbox é a **mesma** usada pela senha provisória e pelo e-mail de fatura, que
   podem estar enviando na mesma janela por outra requisição. Um teto de 3 consumiria a cota inteira.
3. **Retry com backoff linear** (1s, 2s; até 3 tentativas) só para falha **transitória**:
   - retenta: 4xx do SMTP (`432` concorrência, `450`/`451`/`452` throttling) e erros de
     rede/socket sem `responseCode` (`ETIMEDOUT`, `ESOCKETTIMEDOUT`, `ECONNECTION`, `ESOCKET`,
     `ECONNRESET`, `ECONNREFUSED`, `EHOSTUNREACH`, `ENOTFOUND`, `EDNS`);
   - **não** retenta: 5xx (permanente — caixa inexistente) e `EAUTH` (insistir com credencial errada
     arrisca **bloquear a conta**).
4. **Orçamento de tempo total de 15s** (exigido pela revisão, §5): o chamador é uma Server Action e
   o usuário espera a movimentação. É gate de **entrada** — nunca abandona envio em voo, só deixa de
   **começar** trabalho novo após o prazo. Corta o pior caso de ~99s para ~15s + um envio em voo.
5. **Invariantes preservadas:** best-effort (a falha de um destinatário não derruba os outros nem o
   chamador) e fallback-safe (nunca lança; sem config → 0 enviados). O que muda é **só o ritmo**.

---

## 2. O silêncio que atrasou o diagnóstico

`notificarMovimentacao` (`src/app/solicitacoes/actions.ts`) tinha um `catch` **mudo**:

```ts
} catch { /* e-mail é camada ADICIONAL: jamais quebra a movimentação */ }
```

A intenção (não derrubar a movimentação) está certa — a execução engolia **tudo**, inclusive falha
da RPC `solic_emails_envolvidos`. Se a causa-raiz tivesse sido ali, não haveria rastro nenhum.

Agora o caller distingue e loga o que só ele sabe: **RPC sem contexto** (falhou ou sem acesso) e
**zero envolvidos com e-mail** — e o `catch` final registra o erro em vez de engoli-lo. A falha
parcial de envio é logada **uma vez só**, pela camada (achado BAIXO da revisão: os dois logavam o
mesmo evento), com o identificador no rótulo — `[email] notificação de solicitação [Tipo #42]:
3/5 enviados` — e o log por destinatário traz o **código SMTP na frente** (`[432/...] ...`), que é
o que identifica a causa em um olhar.

> **Regra reafirmada:** "não derrubar o fluxo" nunca é o mesmo que "não registrar". Um `catch {}`
> vazio num caminho de produção é uma escolha de ficar cego.

---

## 3. Guard mecânico novo (régua de 5 destinos, destino 1)

`src/lib/email/email.test.ts` — **16 casos novos** (9 na primeira volta + 7 exigidos pela revisão),
todos em cima do **comportamento**, não da implementação:

- **o guard principal:** um `sendMail` mockado que mede o **pico de envios simultâneos em voo**;
  reprova se passar de `MAX_CONEXOES_SMTP`. Vale para os **dois** fan-outs.
- `MAX_CONEXOES_SMTP < 3` (o teto do Office 365) — fixa a folga contra alguém "otimizar" para 3.
- 432 transitório → retenta e o destinatário **acaba recebendo**; `ETIMEDOUT` idem.
- 550 permanente → **1 tentativa só**; `EAUTH` → **1 tentativa só**.
- transitório que persiste → desiste dentro do teto (não trava o chamador).
- best-effort preservado: um destinatário com 550 no meio de 6 → `5/6`.
- **orçamento de tempo** (achado ALTO da revisão): intacto não estorva (6/6); estourado **corta de
  fato** (parcial, sem lançar, nada tentado após o prazo); zerado não tenta nada e ainda devolve o
  contrato `{enviados: 0, total: 6}`.
- **nenhum `sendMail` fica órfão**: todo envio começado é aguardado até o fim (o gate é de entrada,
  não abandona promise em voo — lição da v4.25.1).
- `ECONNREFUSED`/`EHOSTUNREACH`/`ENOTFOUND` retentados (`it.each`).

**Verificado que o guard reprova o código antigo:** revertendo apenas o mecanismo do fan-out para
`Promise.allSettled`, o teste falha com `expected 6 to be less than or equal to 2`. Um guard que
não foi visto falhando não é guard.

---

## 4. Verificação

| Gate | Resultado |
| --- | --- |
| `npx tsc --noEmit` | limpo (rodado antes **e** depois do build) |
| `npx eslint` (arquivos alterados) | limpo |
| `npm test` | **541 passed**, 0 falhas (73 na camada de e-mail) — os casos gated por env rodam com o `.env.local` posicionado |
| `npm run build` | compilado com sucesso, 51 páginas |

**Nota de ambiente:** o primeiro `npm run build` na worktree falhou no prerender de `/_not-found`
por ausência de `.env.local` (não versionado — worktree nova nasce sem ele). Copiado do checkout
raiz; build limpo em seguida. Não é efeito da mudança.

**Não verificado:** o envio **real** contra o Office 365 com 5+ destinatários. A prova final é
operacional (§6) — depende de uma movimentação real em produção após o merge.

---

## 5. Parecer da revisão

`revisor` despachado sobre o diff com foco adversarial. **Veredito: APROVADO COM RESSALVAS** —
2 ALTO, 3 MÉDIO, 3 BAIXO. **Todos os ALTO e MÉDIO foram endereçados antes do fechamento.**

### ALTO

| Achado | Situação |
| --- | --- |
| **Skill `email` descrevia o padrão que causou o bug** (`Promise.allSettled` em paralelo). Um implementador futuro seguindo a regra de ouro do CLAUDE.md ("ler a skill antes de implementar") reintroduziria o `432`. | **Já estava corrigido** — o revisor leu a cópia do checkout **raiz**; a edição está na worktree (§8). Confirmado: a skill agora proíbe `Promise.all` cru e aponta o `enviarFanOut`. |
| **Retry sem orçamento de tempo total.** `notificarMovimentacao` é `await`ado dentro da Server Action, antes do retorno ao usuário. Pior caso: 3 tentativas × 10s de `socketTimeout` + backoff = ~33s **por destinatário**; com 2 em voo e 5 destinatários, **~99s** bloqueando a action. Sem `maxDuration` nessas rotas, o usuário veria erro numa movimentação **que já foi persistida** — e justamente no cenário de SMTP degradado que o patch deveria melhorar. | **CORRIGIDO.** Orçamento total de **15s** (`_orcamentoMs`), aplicado como **gate de entrada**: nunca abandona envio em voo (abandonar é a falha da v4.25.1 — a função serverless congela no meio), só deixa de **começar** trabalho novo após o prazo. Pior caso passa de ~99s para **15s + um sendMail em voo (~10s)**. 3 casos de teste novos, incluindo orçamento estourado (corta de fato) e orçamento zero (nada é tentado, contrato preservado). |

### MÉDIO

| Achado | Situação |
| --- | --- |
| **Risco de e-mail duplicado:** `ETIMEDOUT`/`ECONNRESET` podem ocorrer **depois** do `250 OK` do `DATA`; sem chave de idempotência no SMTP, o retry gera uma cópia a mais. Trade-off defensável para notificação interna, mas não estava documentado como decisão consciente. | **CORRIGIDO** (documentado no ponto de uso). O trade-off está explícito no doc-comment de `transitorio()`: **receber duas vezes é preferível a não receber** — que é o bug corrigido aqui. Com a ressalva de que a decisão **se inverte** se esta camada algum dia servir e-mail irreversível de cliente (lá o padrão é a idempotência do `registrar_email`). |
| **Classificação de transitório incompleta:** `ECONNREFUSED`, `EHOSTUNREACH`, `ENOTFOUND`/`EDNS` ficavam fora do retry. | **CORRIGIDO.** Incluídos — e são os **mais seguros** de todos: falham **antes** de qualquer byte de mensagem, portanto retry com risco **zero** de duplicata. Guard novo (`it.each`) cobre os três. |
| **Sem semáforo global entre requisições concorrentes:** duas movimentações simultâneas (ou uma notificação + uma senha provisória) ainda podem, somadas, encostar no teto de 3 do Office 365. | **RISCO RESIDUAL ACEITO E REGISTRADO.** É exatamente por isso que `MAX_CONEXOES_SMTP = 2` e não 3 — a folga é a mitigação. Semáforo distribuído real exigiria estado compartilhado (banco/Redis) e é desproporcional: o retry de transitório já cobre a colisão eventual. |

### BAIXO

| Achado | Situação |
| --- | --- |
| Log de falha **duplicado** (camada + caller logavam o mesmo evento). | **CORRIGIDO** — uma linha só, na camada, agora com o identificador (`[Tipo #id]`) no rótulo; o caller não repete. |
| Teste do teto de tentativas **frouxo** (aceitava 2–4 chamadas). | **CORRIGIDO** — fixa `toHaveBeenCalledTimes(MAX_TENTATIVAS)`. |
| Log inclui o e-mail do destinatário (PII interna). | **MANTIDO deliberadamente** — é o detalhe que faltava para diagnosticar; endereço interno de colaborador, em log atrás da autenticação da Vercel. Nunca replicar em log de e-mail de **cliente**. |

### Fora do escopo (registrado, não corrigido)

- **Dedupe de destinatários não normaliza caixa** (`A@x.com` ≠ `a@x.com`): pré-existente, não tocado
  por este patch. Efeito possível seria e-mail duplicado para o mesmo humano — não o bug relatado.

### Revisores não aplicáveis

`revisor-db` — sem migration/RPC. `verificador-visual` — nenhuma UI mudou.

---

## 6. Pendências e recomendações (fora do escopo desta correção)

1. **Confirmação operacional pós-merge (recomendada):** abrir uma solicitação atribuída a uma role
   com 5+ membros ativos e confirmar nos logs a linha `5/5 enviados` (ou ausência de linha de falha,
   que agora só aparece quando há falha). É a única prova de ponta a ponta.
2. **O limite de 30 mensagens/min continua existindo.** Uma role muito grande (30+ membros ativos)
   ainda pode encostar nele; o retry cobre o caso, mas o envio fica lento. Se isso virar realidade,
   a saída natural é **produto**, não técnica: um único e-mail com os envolvidos em cópia (1
   mensagem em vez de N) — muda o que o destinatário vê e **exige decisão do usuário**.
3. **Registro auditável de envio de notificação:** hoje o resultado do fan-out só vive no log da
   Vercel. O faturamento já tem `registrar_email` (idempotência por modo). Se a diretoria quiser
   rastro de "quem foi notificado e quando", isso é versão nova, não patch.
4. **Achado colateral verificado e sadio:** o lote de faturas (`revisar-envio-modal.tsx`) já
   serializa os disparos com intervalo entre eles — não sofre deste problema. Era o precedente que
   existia no repo; o fan-out das notificações era a exceção.

---

## 7. Aprendizado permanente (régua de 5 destinos)

| Aprendizado | Destino | Onde |
| --- | --- | --- |
| Fan-out SMTP tem teto de 3 conexões simultâneas no Office 365; `Promise.all` sobre destinatários é bug | **1 — enforcement** | guard do pico em `email.test.ts` |
| O porquê do teto de 2 e da classificação transitório×permanente | **4 — skill de domínio** | proposta de parágrafo na skill `email` (§8) |
| `catch {}` vazio em caminho de produção = cegueira deliberada | **4 — skill de domínio** | idem |

A skill `email` já diz "fan-out best-effort com `Promise.allSettled` em paralelo" — a frase
**induzia ao bug**. A atualização da skill vai junto neste PR.

---

## 8. Arquivos modificados/criados

| Arquivo | O quê |
| --- | --- |
| `src/lib/email/index.ts` | `enviarFanOut` (concorrência limitada) + `enviarUm` (retry) + `transitorio`/`descreverErro`; os dois fan-outs passam a usar o helper |
| `src/app/solicitacoes/actions.ts` | `notificarMovimentacao`: `catch` mudo → logado; distingue RPC sem contexto, zero envolvidos e envio parcial |
| `src/lib/email/email.test.ts` | +9 casos (guard do pico de concorrência, retry, classificação) |
| `.claude/skills/email/SKILL.md` | corrige a orientação que induzia ao fan-out paralelo |
| `CHANGELOG.md` · `src/data/changelog-diretoria.ts` · `package.json` | entrada da v5.3.4 + bump |
| `docs/briefings/WT_Finance_Out_Briefing_v5-3-4_Email_Intermitente.md` | este arquivo |

---

## 9. DoD

- [x] Causa-raiz **provada** com evidência de produção (não inferida)
- [x] Correção no ponto único da camada (não no caller)
- [x] Guard mecânico novo, **visto reprovando** o código antigo
- [x] Gates: `tsc`, `lint`, `test` (472), `build`
- [x] `revisor` despachado — 2 ALTO + 3 MÉDIO **corrigidos**, BAIXO endereçados/registrados (§5);
      `revisor-db` e `verificador-visual` não se aplicam
- [x] Gates **re-executados** após as correções da revisão (541 testes, build limpo)
- [x] CHANGELOG técnico + diretoria + bump 5.3.4
- [x] Skill de domínio corrigida (a orientação antiga induzia ao bug)
- [x] WORKING-CONTEXT atualizado
- [ ] **Merge humano** — fronteira de produção, decisão do usuário
- [ ] Confirmação operacional pós-merge (§6.1)
