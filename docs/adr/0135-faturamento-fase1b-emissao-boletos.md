# ADR-0135 — Faturamento Corporativo Fase 1b: emissão de boletos (Asaas, sandbox) + registro

**Status:** Aceito · **Data:** 2026-06-30 · **Versão:** v4.31.0
**Relaciona:** ADR-0134 (faseamento 1a/1b + área RBAC), ADR-0133 (`buscar_pessoas`), ADR-0127 (camada de e-mail server-only fallback-safe — padrão que esta camada espelha). É a segunda metade da Fase 1 do Faturamento (boletos).

## Contexto

A Fase 1b liga a emissão de boletos a partir da tela de revisão da 1a. **É a funcionalidade mais sensível da plataforma** — age sobre dinheiro de forma irreversível — e concentra três primeiras-vezes perigosas: a primeira ação irreversível sobre o mundo, a primeira escrita-no-mundo (migration de escrita real, não `raw.*` descartável) e a primeira integração com API externa de terceiro (Asaas). O comportamento de referência são os scripts legados (`docs/faturamento-legado/asaas_from_simple_sheet.py`) — **evidência dos FATOS do Asaas** (header `access_token`, idempotência por `externalReference`, formato de erro), não o design a copiar. Toda a entrega roda contra o **sandbox**; produção fica para uma ação consciente do Yan, pós-merge, fora desta versão.

## Decisão

### 1. Camada `src/lib/asaas/` server-only, fallback-safe (espelha `src/lib/email/`)
`client.ts` (HTTP), `customers.ts` (`ensureCustomer`), `boletos.ts` (`findPaymentByExternalRef` + `criarBoleto`), todos com `import 'server-only'` (o build falha se vazar ao cliente). `ASAAS_API_KEY`/`ASAAS_BASE_URL` vêm 100% do env (padrão SMTP — nunca hardcoded, só as chaves no `.env.example`). `asaasReq` **nunca lança**: rede/timeout(30s)/parse/erro-HTTP viram `AsaasResult = {ok:false,error}` — é o que permite a falha parcial tratar cada fatura. Header é `access_token` (não `Authorization`), erro extraído de `{errors:[{description}]}` — fiéis ao script.

### 2. SANDBOX-first; ambiente resolvido no servidor e sempre visível
`ASAAS_BASE_URL` ausente ⇒ sandbox (`sandbox.asaas.com`). `asaasAmbiente()` deriva `'sandbox'|'producao'` do env e é chamado **na page (Server Component)**, passado como prop à tela — a UI nunca decide nem mente o ambiente. Badge de ambiente **sempre na tela**; produção é vermelha e forte. Confirmação ao clicar Emitir; **produção exige confirmação reforçada** (digitar "EMITIR"). Sem chave (`asaasConfigurado()===false`) a emissão é bloqueada com aviso claro, nunca quebra.

### 3. Idempotência DUPLA — não duplica boleto rodando 2×
A chave é o `Fatura Cliente Nº` (= `externalReference`), preservado como TEXT desde a 1a. Antes de criar cada boleto: **(1)** a action consulta `fatura_emissao_existentes(refs)` (nosso registro) e **pula** as já emitidas; **(2)** `findPaymentByExternalRef` no Asaas (`GET /payments?externalReference=&limit=1`) — se já existe, reusa em vez de recriar. Além disso, a coluna `fatura_cliente_no` é **UNIQUE** (2ª trava no banco) e o UPSERT de `registrar_emissao` **nunca sobrescreve um sucesso** (`ON CONFLICT … DO UPDATE … WHERE asaas_payment_id IS NULL`) — provado no banco (reprocesso de sucesso retorna `id:null` e não altera a linha).

### 4. Falha parcial: continuar e reportar (não all-or-nothing)
Cada fatura é processada num `try/catch` independente, em laço sequencial — a k-ésima falha **não aborta** as demais. O resultado discrimina **emitidos / já existiam / falharam (com motivo) / pulados**. Cada boleto é uma operação independente no Asaas; não há transação abrangente envolvendo a rede externa.

### 5. Rastreabilidade: `app.fatura_emissao` registra TODA tentativa (migration 0162, de escrita)
Tabela nova (`fatura_cliente_no` UNIQUE, pessoa/valor/vencimento, `asaas_customer_id`/`asaas_payment_id`, status/`bank_slip_url`/`invoice_url`/`nosso_numero`, **ambiente**, `emitido_por`=`auth.uid()`/`emitido_em`, `erro`). RLS deny-by-default. Escrita só por RPC `registrar_emissao` (`SECURITY DEFINER` + `exigir_acesso(['financeiro/faturamento-corp'])` + GRANT authenticated) — sucesso, já-existente **e falha** são registrados (auditoria + base da 1ª trava de idempotência). A migration é **aditiva** (só CREATE/GRANT; as escritas vivem no corpo das funções, não no apply) mas tratada com o cuidado de ação real: é a primeira tabela do projeto que registra um efeito sobre o mundo.

### 6. `ensure_customer` re-buscando o cadastro server-side; só PRONTAS emitem
A action re-busca os cadastros por nome via `buscar_pessoas` (o cliente não é fonte de verdade do CPF/CNPJ) e **re-valida** prontidão: sem cadastro, sem CPF/CNPJ, sem valor positivo ou sem vencimento ⇒ falha registrada, não emite. `ensureCustomer` é fiel ao script (acha por cpfCnpj → usa; por nome → completa documento/email faltante; senão cria), com uma **divergência deliberada**: ao criar, envia também endereço/bairro/CEP da base de pessoas (enriquece o cadastro para a NF da fase 2; inócuo para o boleto). Só boletos (`billingType=BOLETO`, multa 2% / juros 2%, descrição padrão do script); NF/e-mail/download são a fase 2.

## Consequências

- **Positivas:** emissão automatizada com o risco contido no sandbox; idempotência dupla e UNIQUE no banco tornam o reprocesso seguro (provado); falha parcial nunca perde trabalho já feito; registro completo dá auditoria e é a fonte da verdade; ambiente sempre visível e produção com atrito reforçado; chave server-only com o build como guarda. Auto-auditoria adversarial reforçada (Workflow) sobre os invariantes.
- **Negativas / limites:** cruzamento por nome segue frágil (homônimos — usa o 1º cadastro, sinalizado na 1a); produção depende de ação consciente fora desta entrega (chave de produção no env + `ASAAS_BASE_URL`); o registro local pode, em teoria, falhar após o boleto criado — nesse caso o Asaas é a verdade e o `externalReference` garante que o reprocesso reconcilie (reportado como "registro local falhou", sem reemitir). NF, e-mail e download = fases seguintes.
