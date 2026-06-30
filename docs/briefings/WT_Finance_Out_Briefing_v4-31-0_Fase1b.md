# WT Finance — Out-Briefing v4.31.0 · Faturamento Corporativo Fase 1b

**Data:** 2026-06-30 · **Branch:** `feat/v4-31-0-faturamento-fase1b` (base `main` @ v4.30.0) · **Versão:** 4.30.0 → **4.31.0** (MINOR)
**Tema:** Emissão de boletos via Asaas a partir da revisão da 1a — **a funcionalidade mais sensível da plataforma** (ação irreversível sobre dinheiro). Toda a entrega roda no **SANDBOX**. Migration **0162** (primeira de escrita-no-mundo). **ADR-0135.** **Merge e deploy ficam com o usuário.**

## O que é
Da tela de revisão (1a), marcam-se as faturas **prontas** e clica-se **Emitir**. Por fatura: `ensure_customer` → **idempotência dupla** → `criar_boleto` → **registro**. Falha parcial (uma falha não derruba as outras), confirmação explícita (produção reforçada), ambiente sempre visível. **Só boletos** — NF/e-mail/download são fases seguintes.

## Missões

### M1 — Camada Asaas server-only (`src/lib/asaas/`)
- `client.ts`: `asaasReq` (HTTP, header `access_token`, timeout 30s, **nunca lança** — rede/timeout/parse/erro-HTTP viram `{ok:false,error}`); `asaasAmbiente()` (`sandbox`|`producao` do env, sandbox por default); `asaasConfigurado()`; `onlyDigits`/`emailValido`; extração de erro de `{errors:[{description}]}`. `import 'server-only'`.
- `customers.ts`: `ensureCustomer` fiel ao script (acha por cpfCnpj → usa; por nome → completa doc/email; senão cria) + **divergência deliberada**: ao criar envia endereço/bairro/CEP da base (enriquece p/ NF futura; inócuo p/ boleto).
- `boletos.ts`: `findPaymentByExternalRef` (idempotência, `GET /payments?externalReference=&limit=1`); `criarBoleto` (`BOLETO`, multa 2% / juros 2%, `descricaoBoleto` = "Fatura {ref} - Após 5 dias…").
- `asaas.test.ts`: 20 testes (ambiente, sem-chave→erro+não-chama-fetch, header access_token, extração de erro, 3 ramos de ensureCustomer, idempotência, payload do boleto).

### M2 — `app.fatura_emissao` (migration 0162, aditiva de ESCRITA — aplicada, gate VERDE)
- Tabela: `fatura_cliente_no` **UNIQUE** (2ª trava de idempotência), pessoa/valor/vencimento, `asaas_customer_id`/`asaas_payment_id`, status/`bank_slip_url`/`invoice_url`/`nosso_numero`, **ambiente**, `emitido_por`(=`auth.uid()`)/`emitido_em`, `erro`. **RLS deny-by-default.**
- RPCs (`SECURITY DEFINER` + `exigir_acesso(['financeiro/faturamento-corp'])` + GRANT authenticated): `registrar_emissao` (**UPSERT que NUNCA sobrescreve sucesso** — `ON CONFLICT … WHERE asaas_payment_id IS NULL`); `fatura_emissao_existentes(refs)` (refs já emitidas com sucesso).
- **Verificado no banco vivo (REST + pg):** existentes `[]`→`["ref"]` após sucesso; reprocesso de sucesso retorna `id:null` e **não sobrescreve** (manteve `pay_teste`/`PENDING`/`sandbox`, ignorou os novos valores); linha de teste apagada.

### M3 — Emissão (action + UI)
- `emitirBoletos(faturas)` (gated): ambiente de `asaasAmbiente()`; **re-busca cadastros server-side** via `buscar_pessoas` (cliente não é fonte de verdade do CPF/CNPJ); 1ª trava (`fatura_emissao_existentes` → pula); por fatura, **try/catch independente**: re-valida (ref/valor>0/vencimento/cadastro/cpfCnpj) → `ensureCustomer` → `findPaymentByExternalRef` (2ª trava) → `criarBoleto` → `registrar_emissao`. Registra **sucesso, já-existente E falha**. Sem chave → falha clara, não quebra.
- `faturamento-corp.tsx`: **badge de ambiente sempre visível** (produção = vermelho forte; sandbox = bege); botão **Emitir** só habilita p/ prontas marcadas (toggle desabilitado nas demais); **modal de confirmação** (N boletos, R$ total, ambiente — **produção exige digitar "EMITIR"**); painel **Resultado** (emitidos / já existiam / falharam c/ motivo / pulados) + status por linha com link "ver boleto".
- `page.tsx` (Server Component) resolve `asaasAmbiente()`/`asaasConfigurado()` e passa como prop — a UI nunca decide o ambiente.

### M4 — Fechamento
v4.31.0 (`package.json`+lock), `CHANGELOG.md`, `CHANGELOG_DIRETORIA`, ADR-0135, `.env.example` (`ASAAS_API_KEY`/`ASAAS_BASE_URL`, só chaves), este out-briefing.

## Invariantes — auto-auditoria adversarial REFORÇADA (Workflow, 6 céticos + síntese)
A auditoria rodou ANTES de fechar e achou pontos reais; corrigi os que mereciam, com julgamento (nem todo "bloqueante" do cético era real). Estado pós-correção:
1. **Idempotência dupla real** ✅ — registro (`fatura_emissao_existentes`) pula; Asaas (`externalReference`) reusa; UNIQUE + UPSERT que não sobrescreve sucesso (provado: `id:null`). Rodar 2× não duplica.
2. **SANDBOX-first / ambiente visível** ✅ — default sandbox; resolvido no servidor; badge sempre; produção reforçada. **Endurecido:** a confirmação de produção agora é enforced TAMBÉM no servidor (`emitirBoletos(.., {confirmacaoProducao})` recusa produção sem o sinal) — antes era só client-side (cosmético).
3. **Chave server-only** ✅ VERDE no cético — `import 'server-only'` nos 3 arquivos; único toque client é `import type` (apagado no build); env-driven.
4. **Falha parcial** ✅ — cada fatura é transação independente; falha não aborta; reporta M/J/K. **Endurecido:** o SETUP (cadastros + 1ª trava) agora é `try/catch` que devolve resultado discriminado ("nada confirmado"), não um throw cru ao cliente.
5. **Só prontas emitem** ✅ VERDE no cético — action re-valida cpfCnpj server-side; cliente não decide.
6. **Registra toda tentativa** ✅ — sucesso/já-existente/falha; `emitido_por`=`auth.uid()`. **Endurecido:** `console.error` quando o registro falha (observabilidade da feature irreversível).

### Achados deixados conscientes (não-bloqueantes, com motivo)
- **Race entre 2 emissões paralelas da MESMA ref:** a própria auditoria conclui que Asaas (`externalReference`) + UNIQUE impedem duplicação real — a 2ª recebe erro e vira falha parcial reportada. Um lock/transação não cruzaria a chamada HTTP externa de qualquer forma. Invariante "não duplica" **mantido**; monitorar logs de "duplicate externalReference" no sandbox é a vigilância sugerida.
- **Fatura sem `Fatura Cliente Nº` não entra no registro:** correto por construção — a coluna é `NOT NULL` (sem chave de idempotência não há o que gravar); a fatura é reportada como falha no resultado.

## Gate de fechamento
- `npx tsc --noEmit` → **0** · `npm run lint` → **limpo** · `npm test` → **284/284** (+20 `asaas.test`) · `npm run build` → **exit 0** (rota `/financeiro/faturamento-corp`).
- Migration 0162 aplicada (backup-gate VERDE, 40/40 tabelas, restore-test spot OK); RPCs verificadas via REST + pg; trava de idempotência provada.

## CHECKPOINT do Yan (validar no sandbox antes do merge)
1. Subir a crua, marcar prontas, **Emitir** → ver os boletos no painel Asaas (sandbox) e o link "ver boleto".
2. Conferir o **registro**: `app.fatura_emissao` com cobrado + retorno + ambiente=`sandbox` + quem/quando.
3. **Falha parcial:** marcar uma fatura "quebrada" junto com boas → ver "M emitidos, J falharam (motivo)".
4. **Idempotência:** reemitir a MESMA planilha → as já emitidas aparecem **puladas**, não duplica (confere `totalCount=1` no Asaas).
5. Confirmar o **badge de ambiente** sempre visível e a confirmação reforçada (se algum dia em produção).

## Fronteira / fora de escopo
- **FORA desta entrega:** emissão em PRODUÇÃO (só por env consciente do Yan, pós-merge), chave de produção no env de dev, throttling complexo.
- **FORA (fases 2–4):** notas fiscais, download de PDFs, e-mails. `billingType=BOLETO` apenas.

## Arquivos
- **Novos:** `src/lib/asaas/{client,customers,boletos,asaas.test}.ts`; `supabase/migrations/0162_fatura_emissao.sql`; `docs/adr/0135-...md`; este out-briefing.
- **Modificados:** `src/app/financeiro/faturamento-corp/{actions,page}.tsx`; `src/components/financeiro/faturamento-corp.tsx`; `.env.example`; `CHANGELOG.md`; `src/data/changelog-diretoria.ts`; `package.json`/`package-lock.json` (4.31.0).
