# ADR-0140 — Faturamento Fase 4a: pipeline de envio de e-mail com MODO TESTE (override de destinatário)

**Status:** Aceito · **Data:** 2026-07-03 · **Versão:** v4.35.0
**Relaciona:** ADR-0134/0135/0136 (Faturamento Fases 1-3), ADR-0127 (camada de e-mail), ADR-0113 (anexos/URLs). Migration **0169** (aditiva).

## Contexto

Fase 4 = enviar aos clientes o e-mail da fatura (boleto + nota anexados), a última capacidade antes da virada de produção. **E-mail NÃO tem sandbox:** um envio sai de verdade, e o Cadastro (Fase 3) tem os e-mails REAIS dos clientes — errar destinatário vaza a fatura de um cliente para outro; disparar em teste atinge clientes reais. A fase foi subdividida: **4a (esta)** = o pipeline de envio isolado, em modo teste; **4b** = a tela editável de revisão, o disparo em lote e a virada para o modo real.

## Decisão

### 1. MODO TESTE com override de destinatário é o "sandbox do e-mail" (invariante)
Não há ambiente de teste de e-mail; o equivalente é um **override de destinatário**. Em modo teste, **TODOS** os e-mails vão para `EMAIL_TESTE_DESTINO`, com o destinatário **REAL** visível no assunto e no corpo (`[TESTE — destinatário real: …]`). Envia **de verdade** para a caixa de teste (valida SMTP + anexos + formatação ponta a ponta), sem atingir clientes. Molde: `asaasAmbiente()` (env, server-only, badge na UI). O override acontece no **PONTO ÚNICO** — dentro da camada `enviarFaturaEmail`, não no caller — para que nenhum caminho novo esqueça de aplicá-lo.

### 2. Modo real INALCANÇÁVEL na 4a; fail-closed
A Server Action **recusa** qualquer envio se `emailAmbiente() !== 'teste'`. Em modo teste, sem `EMAIL_TESTE_DESTINO` o envio é **recusado (fail-closed)** — nunca cai para o real por engano. `emailAmbiente()` é fail-safe: qualquer valor de `EMAIL_MODO` diferente de `'real'` (inclusive ausente) → `'teste'`. A virada para `'real'` (dupla trava, molde da confirmação de produção do Asaas) é escopo da 4b.

### 3. Idempotência POR MODO, SEM UNIQUE (deliberado)
`app.fatura_email` é **append-only** (sem UNIQUE em `fatura_cliente_no`): o reenvio deliberado é legítimo (4b). A idempotência é por **consulta**: `email_existentes(refs, modo)` devolve as refs com envio bem-sucedido **naquele modo**, e o fluxo pula por default. Uma fatura enviada em **teste NÃO conta** como enviada em **real** (senão a virada de produção pularia tudo que foi testado). A ausência de UNIQUE é decisão de desenho documentada — **não** "corrigir" adicionando um.

### 4. Um e-mail POR FATURA
Cada fatura gera um e-mail (com seu boleto + nota). Conserta o agrupamento por-cliente do script legado (`envio_faturas.py`), que, num cliente com N faturas, pegava só o primeiro PDF de cada tipo e **perdia** os demais silenciosamente.

### 5. Anexos server-side; falha de download = envio FALHA
Boleto (sempre) + nota (só quando **AUTORIZADA**) são baixados server-side dos PDFs do Asaas (URLs públicas, GET sem `access_token`) com `AbortController` (~30s), anexados como `Buffer`. Se um download falha, o e-mail **FALHA com motivo** — nunca um e-mail incompleto silencioso. Nota pendente (não autorizada) → fatura **não enviável** (a opção "enviar só boleto" é 4b). Corpo **condicional**: menciona a nota fiscal só quando ela vai anexada.

### 6. Camada única, fallback-safe; tudo derivado no servidor
Reusa `src/lib/email` (nodemailer M365, transport compartilhado, `attachments` já provados no logo CID) — `enviarFaturaEmail` é fallback-safe (retorna resultado estruturado, **nunca lança**). A Action deriva **tudo** no servidor a partir do nº da fatura: documentos (`buscar_docs_fatura`), cliente/destinatários (`buscar_cliente_corporativo` + split/validação), idempotência (`email_existentes`), registro (`registrar_email`). O cliente só manda a `ref`. Registro de **toda** tentativa (reais E efetivos, anexos, modo, sucesso/erro, quem/quando).

## Consequências

- **Positivas:** o mecanismo perigoso (e-mail sai de verdade) é validável ponta a ponta em isolamento e sem risco a clientes; override no ponto único + fail-closed + modo-real-recusado-no-servidor tornam o vazamento improvável por construção; idempotência por modo preserva o teste ao virar produção; camada única mantém a postura fallback-safe.
- **Negativas / limites:** 4a envia UMA fatura por vez (sem lote/progresso — 4b); a tela editável de destinatários, o reenvio explícito e o "enviar só boleto" são 4b; o `bank_slip_url` foi confirmado público pelo Yan (o legado só o usava como link); a virada para o modo real (e a produção) só após a 4b, validada ponta a ponta.
