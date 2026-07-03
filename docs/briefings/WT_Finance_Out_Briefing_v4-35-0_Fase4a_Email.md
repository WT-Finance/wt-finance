# WT Finance — Out-Briefing v4.35.0 · Faturamento Fase 4a (Pipeline de envio de e-mail — MODO TESTE)

**Data:** 2026-07-03 · **Branch:** `feat/v4-35-0-faturamento-fase4a-email` (base `main` @ v4.34.1) · **Versão:** 4.34.1 → **4.35.0** (MINOR)
**Tema:** Primeira metade da Fase 4 — o **pipeline de envio** do e-mail de fatura (boleto + nota anexados), isolado e em **MODO TESTE**. **E-mail SAI DE VERDADE — não há sandbox; o modo real é INALCANÇÁVEL nesta versão, por construção.** **ADR-0140 · migration 0169 (aditiva).** **Merge e deploy ficam com o usuário.**

## Missões

### M1 — Migration 0169 (aditiva) — `app.fatura_email` + RPCs
- Tabela `app.fatura_email` **append-only, SEM UNIQUE** (reenvio deliberado é legítimo — 4b): `fatura_cliente_no`, `modo` ('teste'|'real'), `destinatarios_reais`, `destinatarios_efetivos`, `anexos` (jsonb), `sucesso`, `erro`, `enviado_por` (auth.uid()), `enviado_em`. RLS deny-by-default.
- RPCs **padrão inline** (`exigir_acesso('financeiro/faturamento-corp')` 1ª linha, REVOKE/GRANT explícitos): `registrar_email` (INSERT append-only), `email_existentes(p_refs, p_modo)` (refs com envio sucesso NAQUELE modo), **`buscar_docs_fatura(p_refs)`** (read-only: `bank_slip_url`/`invoice_url` do boleto + a "melhor" nota ligada — autorizada+pdf preferida — o insumo dos anexos; o schema `app` não é acessível via `.from()`).

### M2 — Camada de envio (`src/lib/email/`)
- `emailAmbiente()`/`getEmailTesteDestino()` em `config.ts` (molde `asaasAmbiente`, server-only, sem cache; **fail-safe**: != 'real' → 'teste').
- `splitDestinatarios(texto)` em `fatura.ts`: split `;` + trim + filtra vazios + `emailValido()` → `{ validos, invalidos }` (dedupe).
- `enviarFaturaEmail(...)` em `fatura.ts`: **override no ponto único** (teste → `EMAIL_TESTE_DESTINO`; fail-closed sem ele) → baixa os PDFs (fetch + `AbortController` 30s → Buffer; **falha = envio falha**, nunca incompleto) → `templateFaturaEmail` (assunto `Fatura Welcome Trips – {cliente} – Nº {ref}`, prefixo de teste; **corpo condicional** da nota; layout/logo da plataforma) → envia pelo **transport único** (reexportado do `index.ts`) → **nunca lança**.

### M3 — Action + UI mínima
- `enviarEmailFatura(ref)` (gated): **recusa modo != teste** (invariante) → deriva **tudo server-side** (docs; nota só AUTORIZADA, pendente → não enviável; cadastro só ativo; split) → idempotência (`email_existentes` no modo) → `enviarFaturaEmail` → `registrar_email` (reais E efetivos, toda tentativa). O cliente só manda a `ref`.
- UI: coluna **E-mail** na tabela de revisão — nas faturas com boleto emitido, botão “Enviar (teste)” + resultado inline (enviado / já enviado / falhou: motivo) + **badge âmbar “E-mail: modo teste”**. **SEM lote, SEM tela de revisão** (4b). Envs novas no `.env.example`: `EMAIL_MODO=teste`, `EMAIL_TESTE_DESTINO=`.

### M4 — Fechamento
v4.35.0, CHANGELOG, CHANGELOG_DIRETORIA, ADR-0140, este out-briefing.

## Invariantes — auto-auditoria
1. **Modo real inalcançável** ✅ — a action recusa `emailAmbiente() != 'teste'`; sem `EMAIL_TESTE_DESTINO`, a camada recusa fail-closed. (Provado no teste.)
2. **Override no ponto único** ✅ — a substituição teste→destino vive DENTRO de `enviarFaturaEmail`; o teste assere `to === EMAIL_TESTE_DESTINO` (não o real) e o real no assunto.
3. **Idempotência POR MODO, SEM UNIQUE** ✅ — `email_existentes(refs, modo)`; sem UNIQUE na tabela (decisão documentada; NÃO adicionar).
4. **Anexo que falha = envio falha** ✅ — download com timeout; falha → `ok:false` com motivo, sem `sendMail` (provado).
5. **Corpo condicional** ✅ — menciona a nota só quando anexada (provado).
6. **Fallback-safe** ✅ — `enviarFaturaEmail` nunca lança (erro de SMTP → `ok:false`).
7. **Emissão intacta** ✅ — nada de `emitirBoletos`/`emitirNotas`/`src/lib/asaas` alterado; só a camada de e-mail + a action nova + a coluna na UI.

## Gate de fechamento
`npx tsc --noEmit` → **0** · `npm run lint` → **limpo** · `npm test` → **325** (306 base + 19 de `fatura.test.ts`) · `npm run build` → exit 0. **Migration 0169 aplicada via `npm run db:migrate -- --aditiva`** (backup-gate rede verde) e RPCs verificadas via REST.

## CHECKPOINT do Yan (antes do merge)
Configurar `EMAIL_TESTE_DESTINO`; enviar uma fatura **com** nota e uma **sem**; conferir na caixa de teste: anexos íntegros (abrir os PDFs), assunto com o destinatário real, corpo condicional, link do boleto; idempotência (reenvio pulado); modo real recusado; registro em `app.fatura_email` (modo, reais/efetivos, anexos).

## Fora de escopo / próximos
- **Fase 4b:** tela **editável** de revisão do envio, cruzamento em massa, disparo em **blocos com progresso** (throttle ~2,1s no cliente), reenvio explícito, "enviar só boleto", e a **VIRADA** para o modo real (dupla trava, junto com a virada do Asaas).
- **Produção:** só após a 4b completa e o fluxo validado ponta a ponta.

## Arquivos
- **Banco:** `supabase/migrations/0169_fatura_email.sql` (aditiva).
- **Camada:** `src/lib/email/fatura.ts` (novo), `src/lib/email/config.ts` (+emailAmbiente/getEmailTesteDestino), `src/lib/email/template.ts` (+templateFaturaEmail), `src/lib/email/index.ts` (exporta criarTransporter/anexoLogo), `src/lib/email/fatura.test.ts` (novo, 19 casos).
- **Action/UI:** `src/app/financeiro/faturamento-corp/actions.ts` (+enviarEmailFatura), `src/components/financeiro/faturamento-corp.tsx` (coluna E-mail + badge), `faturamento-corp-content.tsx` + `page.tsx` (prop `emailModo`).
- **Docs/versão:** `.env.example`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/adr/0140-…`, este out-briefing, `package.json`/`package-lock.json` (4.35.0).
