# WT Finance — Out-Briefing v4.32.0 · Faturamento Corporativo Fase 2 (Notas Fiscais)

**Data:** 2026-07-01 · **Branch:** `feat/v4-32-0-faturamento-fase2-nf` (base `main` @ v4.31.0) · **Versão:** 4.31.0 → **4.32.0** (MINOR)
**Tema:** Emissão de NFS-e via Asaas a partir da revisão — documento fiscal irreversível, **assíncrono**. Tudo **SANDBOX**. Migration **0163** (escrita aditiva). **ADR-0136.** **Merge e deploy ficam com o usuário.**

## O que é
Da tela de revisão, a NF é **opcional por fatura** (Não emitir / Normal / Avulsa), por cima do boleto (que segue sempre a base da Fase 1). Só faturas **prontas-NF** (CPF/CNPJ + endereço + CEP) emitem NF. Por nota: `ensureCustomer` (com endereço **e e-mail**) → **idempotência dupla** (`-AVULSA` separado) → `createInvoice` → `authorizeInvoice` → registro. A NF é **assíncrona**: fica “processando” e um **refresh** de status resolve; **“ver nota”** abre o `pdfUrl` quando autorizada.

## Correções após o 1º teste do Yan no sandbox
1. **Data de emissão (effectiveDate) = SEMPRE hoje.** Antes usava a coluna "Emissão" da planilha (data passada) → o Asaas recusava *"a data de emissão não pode ser inferior à atual"*. A NF é emitida hoje, então `effectiveDate = hoje-SP` (a coluna Emissão da crua não é mais usada para isso).
2. **E-mail do tomador é exigido pelo Asaas para NFS-e** (verificado: a mensagem *"E-mail do cliente incompleto"* vem da API, não do nosso código — não é resquício do script). Tratamento **PERMISSIVO** (decisão do Yan): (a) `ensureCustomer` completa o **e-mail** do cliente no Asaas a partir da base quando o Asaas não tem (antes só completava o endereço no cadastro achado por CPF/CNPJ — gap real); (b) a prontidão-NF **NÃO** bloqueia por e-mail — o Asaas pode já ter o e-mail no cadastro dele mesmo sem na base; a emissão tenta e o **Asaas valida** o e-mail. Se ficar sem e-mail em lugar nenhum, a NF falha na emissão com a mensagem clara do Asaas (falha parcial), sem falso negativo na tela.

## Missões

### M1 — Camada NF (`src/lib/asaas/notas.ts`) + `ensureCustomer` estendido
- `notas.ts` (reusa `client.ts`): `createInvoice` (POST /invoices; XOR customer/payment; campos fiscais fixos; `deductions=value`), `authorizeInvoice` (POST /invoices/{id}/authorize), `findInvoiceByExternalRef` (idempotência), `getInvoiceById` (refresh). `externalReferenceNota` (ref ou `-AVULSA`). Config fixa: `NF_SERVICE_DESCRIPTION`, `NF_MUNICIPAL_CODE` 9.02, ISS 5% parametrizável.
- `customers.ts`: `ensureCustomer(d, { completarEndereco })` — completa `address/number/province/postalCode/city/state` de cadastro existente via PUT (o que o script faz). **Sem a flag, caminho do boleto inalterado** (Fase 1 byte-idêntica). `DadosCliente` ganhou `cidade`/`uf`.
- `asaas.test.ts`: +8 testes (idempotência `-AVULSA`, XOR customer/payment, campos fixos, authorize, find/getById, `ensureCustomer` completando endereço vs. não mexendo sem a flag).

### M2 — `app.fatura_nota` (migration 0163, escrita aditiva — aplicada, gate VERDE)
- Tabela nova (não estende `fatura_emissao`): `external_reference` **UNIQUE** (com `-AVULSA`), `fatura_cliente_no`, `modo` (CHECK normal/avulsa), `valor`, `asaas_invoice_id`/`asaas_payment_id`, `status` (evolui), `pdf_url`/`xml_url`/`number`/`rps_number`/`verification_code`, `ambiente`, `emitido_por`(=`auth.uid()`)/`emitido_em`/`atualizado_em`, `erro`. **RLS deny-by-default.**
- RPCs (`SECURITY DEFINER` + `exigir_acesso('financeiro/faturamento-corp')` + GRANT authenticated): `registrar_nota` (UPSERT que **NÃO sobrescreve** nota já criada — `WHERE asaas_invoice_id IS NULL`), `atualizar_status_nota` (refresh grava status/pdf/número), `nota_existentes(refs)`.
- **Verificado no banco vivo (REST + pg):** existentes []→["ref"]; `registrar_nota` insere; `atualizar_status_nota` faz o refresh (→AUTHORIZED+pdf+number); reprocesso de nota já-criada retorna `id:null` e **não sobrescreve** (manteve invoice/AUTHORIZED/sandbox). Linha de teste apagada.

### M3 — Fluxo de NF na tela + status
- **Controles de NF por linha:** `<select>` 3 estados (Não emitir / Normal / Avulsa) + input **Valor Avulso** (só quando Avulsa). Desabilitado nas **não-prontas-NF** com “falta endereço/CEP p/ NF” (podem emitir boleto).
- **`emitirNotas` (action gated):** re-busca cadastros server-side, re-valida prontidão-NF (CPF/CNPJ + endereço + CEP), pula já-emitidas, por nota try/catch independente → `ensureCustomer`(endereço) → vínculo soft ao boleto (normal) → `findInvoiceByExternalRef` → `createInvoice` → `authorizeInvoice` → `registrar_nota`. Falha parcial. Produção = confirmação reforçada server-side.
- **`atualizarStatusNotas` (refresh):** `getInvoiceById` → `atualizar_status_nota`; a UI mostra “processando” → “NF autorizada” + **“ver nota”** (`pdfUrl`). Botão “Atualizar status” no painel de resultado.
- Modal de confirmação genérico (boleto/nota); resultado claro (emitidas/já existiam/falharam/puladas); idempotência visível.

### M4 — Fechamento
v4.32.0, CHANGELOG, CHANGELOG_DIRETORIA, ADR-0136, este out-briefing. Pendência do PDF (Fase 4) registrada.

## Invariantes — auto-auditoria adversarial (5 céticos, foco na feature fiscal irreversível)
A auditoria rodou ANTES de fechar e achou pontos reais; corrigi os que mereciam, com julgamento (um "crítico" foi refutado por teste ao vivo). Estado pós-correção:
1. **Idempotência `-AVULSA`** ✅ — normal e avulsa não colidem; `nota_existentes` + `findInvoiceByExternalRef`; UNIQUE + UPSERT que não sobrescreve criada (**provado no banco**: reprocesso → `id:null`). O cético alegou "WHERE inválido" → **refutado** pelo teste ao vivo.
2. **Assincronia explícita** ✅ — create/authorize não deixam pronta; status evolui; refresh resolve. **Endurecido:** falha do `authorizeInvoice` não é mais mascarada — a nota (que existe) é registrada com o erro e a UI mostra “NF criada, mas a autorização falhou”.
3. **`ensureCustomer` completa endereço** ✅ — sem endereço a NF falha; prontidão-NF server-side ANTES; caminho do boleto **intacto** sem a flag (testado). **Endurecido:** CEP só enviado se **8 dígitos** (fiel ao `clean_cep` do script — nunca envia CEP inválido).
4. **Só prontas-NF emitem** ✅ VERDE — re-validação server-side (CPF/CNPJ + endereço + CEP).
5. **Boleto sempre / NF opcional** ✅ — valor da NF pode diferir (avulsa); vínculo soft ao boleto (XOR).
6. **Falha parcial + registro** ✅ — cada NF independente; toda tentativa em `app.fatura_nota`; `emitido_por`=`auth.uid()`. **Endurecido:** setup (buscar_pessoas/nota_existentes) agora é **fail-closed** em erro de RPC (não degrada silencioso).
7. **Sandbox-first / ambiente visível** ✅ VERDE — env server-side; badge sempre; produção reforçada (server-side). Campos fiscais idênticos ao script (verificado linha-a-linha).
8. **Refresh com ownership** ✅ — o refresh só grava se o `externalReference` do invoice bate com o esperado (não corrompe outra nota).

### Achados deixados conscientes (não-bloqueantes, com motivo)
- **Emitir NF normal E avulsa para a MESMA fatura** cria duas notas (refs `X` e `X-AVULSA`): é **por design** (spec: chaves separadas; o select é único por linha — exige o usuário trocar o modo e reemitir deliberadamente).
- **`invoiceId` vive na sessão** (memória do cliente): o refresh funciona na mesma sessão; re-hidratar após recarregar a página (consultando `app.fatura_nota`) é follow-up — o registro no banco preserva tudo.

## Gate de fechamento
- `npx tsc --noEmit` → **0** · `npm run lint` → **limpo** · `npm test` → **293** (+9 da camada notas/endereço) · `npm run build` → (rota `/financeiro/faturamento-corp`).
- Migration 0163 aplicada (backup-gate VERDE); RPCs verificadas via REST + pg; idempotência da nota provada.

## CHECKPOINT do Yan (sandbox, antes do merge)
1. Marcar NF **normal** numa fatura pronta-NF, **Emitir** → ver a nota em “processando”.
2. **Atualizar status** até AUTHORIZED → ver número/PDF e o link **“ver nota”**.
3. Marcar uma **Avulsa** com valor ≠ boleto → a nota sai com o valor avulso; `externalReference` tem `-AVULSA`; não colide com a normal.
4. **Idempotência:** reemitir a MESMA planilha → NFs já emitidas (normal e avulsa) **puladas**, nada duplica.
5. **Prontidão-NF:** uma fatura sem endereço/CEP não habilita NF (mas pode boleto) — a tela explica.
6. **Falha parcial:** uma NF que falha não derruba as outras; é registrada com o erro; conferir `app.fatura_nota`.

## Fronteira / fora de escopo
- **PENDÊNCIA (decidir com a Fase 4):** entrega elaborada do PDF (download/organização/anexo). A Fase 2 entrega o link “ver nota”.
- **FORA (Fase 4):** e-mails (fatura+boleto+NF aos clientes; mecanismo em aberto). **FORA:** produção (só após a Fase 4, decisão consciente).

## Arquivos
- **Novos:** `src/lib/asaas/notas.ts`; `supabase/migrations/0163_fatura_nota.sql`; `docs/adr/0136-...md`; este out-briefing.
- **Modificados:** `src/lib/asaas/customers.ts` (ensureCustomer estendido), `src/lib/asaas/asaas.test.ts`; `src/lib/faturamento/{tipos,classificar}.ts` (prontaNf + controles NF); `src/app/financeiro/faturamento-corp/actions.ts` (emitirNotas/atualizarStatusNotas); `src/components/financeiro/faturamento-corp.tsx`; `CHANGELOG.md`; `src/data/changelog-diretoria.ts`; `package.json`/`package-lock.json` (4.32.0).
