# ADR-0136 — Faturamento Corporativo Fase 2: emissão de NFS-e (Asaas, sandbox) — assíncrona + Avulsa

**Status:** Aceito · **Data:** 2026-07-01 · **Versão:** v4.32.0
**Relaciona:** ADR-0135 (Fase 1b, boletos — camada `src/lib/asaas/`, idempotência, falha parcial, ambiente server-side), ADR-0134 (faseamento + área RBAC), ADR-0133 (`buscar_pessoas`). Segunda metade operacional do Faturamento (NF); a Fase 4 (e-mail) fecha o ciclo antes de produção.

## Contexto

A Fase 1 entregou a emissão de **boletos** (sandbox) com registro, idempotência dupla e falha parcial. A Fase 2 adiciona a emissão de **notas fiscais (NFS-e)** a partir da mesma tela — **documento fiscal, irreversível, mesmo rigor do boleto**. O comportamento de referência é o script legado `docs/faturamento-legado/asaas_nfe_from_contas.py` (lido — é a especificação). A **diferença estrutural** vs. o boleto é a **assincronia**: criar + autorizar não deixam a nota pronta; o status evolui ao longo de minutos até a prefeitura autorizar. O pré-requisito B6 (Welcome configurada no Asaas para NFS-e) está confirmado. Tudo roda no **sandbox**; produção fica para depois da Fase 4, por decisão consciente.

## Decisão

### 1. Camada `src/lib/asaas/notas.ts` reusando o client + ensureCustomer estendido
`createInvoice` (POST /invoices), `authorizeInvoice` (POST /invoices/{id}/authorize), `findInvoiceByExternalRef` (idempotência) e `getInvoiceById` (refresh) reusam o `asaasReq` server-only da Fase 1 (header `access_token`, timeout, erro `{errors:[…]}`, nunca lança). Campos fiscais **fixos da Welcome** (do script, não inventados): `serviceDescription` (texto da Portaria), `municipalServiceCode` 9.02 / `municipalServiceName` "Serviços diversos", `taxes` (ISS 5% parametrizável, demais 0, `retainIss` false), `deductions = value`, `effectiveDate` = **sempre hoje-SP** (o dia da emissão — o Asaas recusa data anterior à atual; a coluna "Emissão" da crua **não** é usada para isso).

### 2. `ensureCustomer` estendido para endereço (gated por flag)
A NF exige endereço no customer (o `create_invoice` não envia endereço nem inscrição do cliente — depende do cadastro do customer). `ensureCustomer(d, { completarEndereco: true })` completa `address/addressNumber/province/postalCode/city/state` de um cadastro existente via PUT quando faltando (o que o script faz em `needs_address_update`). **Sem a flag, o caminho do boleto (Fase 1) fica byte-idêntico** — não mexe no endereço de cadastro existente. A inscrição do cliente nunca é enviada; a do emitente (Welcome) já está no painel do Asaas (B6).

### 3. Idempotência com sufixo `-AVULSA`; NF opcional sobre o boleto sempre
`externalReference` da NF = `Fatura Cliente Nº` (normal) ou `<ref>-AVULSA` (avulsa) — **chaves separadas que não colidem** (o script). Duas travas: `nota_existentes` (nosso registro) pula refs já criadas; `findInvoiceByExternalRef` reusa a NF existente no Asaas. Boleto é **sempre** a base (Fase 1); a NF é **opcional por fatura** (Normal = valor do boleto / Avulsa = valor próprio / Não emitir). Vínculo **soft** ao boleto só na NF normal: acha o payment por `Fatura Cliente Nº` → envia `payment` (XOR `customer`); sem boleto, cria standalone.

### 4. Assincronia explícita — modelo de status + refresh
O status da NF evolui: SCHEDULED/PENDING → (authorize) → PROCESSING → AUTHORIZED (com pdf/xml/number) | ERROR/CANCELLED. A emissão registra a nota "processando"; um **refresh** (`atualizarStatusNotas` → `getInvoiceById` → `atualizar_status_nota`) resolve o estado depois e grava o PDF/número quando autorizada. A UI mostra "processando" e, autorizada, o link **"ver nota"** (`pdfUrl`). A entrega elaborada do PDF (download/anexo) é **pendência da Fase 4** — a Fase 2 entrega o link.

### 5. Tabela `app.fatura_nota` separada (migration 0163, escrita aditiva)
Tabela nova (não estende `app.fatura_emissao`, que é boleto-específica e síncrona): a NF tem ciclo próprio assíncrono e valor que pode diferir do boleto. `external_reference` UNIQUE (com `-AVULSA`), `fatura_cliente_no` (liga ao boleto), `modo`, `valor`, `asaas_invoice_id`/`asaas_payment_id`, `status` (evolui), `pdf_url`/`xml_url`/`number`/`rps_number`/`verification_code`, `ambiente`, `emitido_por`=`auth.uid()`/`emitido_em`/`atualizado_em`, `erro`. RLS deny-by-default. RPCs `SECURITY DEFINER` + `exigir_acesso('financeiro/faturamento-corp')`: `registrar_nota` (UPSERT que **não sobrescreve** uma nota já criada — `WHERE asaas_invoice_id IS NULL`), `atualizar_status_nota` (o refresh atualiza status/pdf), `nota_existentes`. Uma fatura → 1 boleto (`fatura_emissao`) + 0-1 nota (`fatura_nota`), possivelmente de valores diferentes.

### 6. Mesmos invariantes da Fase 1
Sandbox-first (ambiente resolvido no servidor, badge sempre visível, produção com confirmação reforçada enforced server-side); confirmação explícita antes de emitir; falha parcial (cada NF é transação independente); rastreabilidade (toda tentativa registrada). Só faturas prontas-NF emitem — re-validado server-side (o cliente não decide).

### 7. E-mail do tomador exigido pela NFS-e (verificado no sandbox)
O 1º teste no sandbox retornou *"E-mail do cliente incompleto"* — mensagem da **API do Asaas** (não do nosso código; surge via `errors[0].description`). O e-mail do tomador é, portanto, **exigido** para autorizar a NFS-e (o comentário do script legado "não é obrigatório na NFS-e" era otimista). Consequências: `ensureCustomer` (sob a flag NF) completa também o **e-mail** de um cadastro existente a partir da base (antes só completava o endereço no cadastro achado por CPF/CNPJ — gap); a **prontidão-NF** passa a exigir e-mail válido (`CPF/CNPJ + endereço + CEP + e-mail`), sinalizado na tela; re-validado server-side. Cliente sem e-mail na base não emite NF até o e-mail ser cadastrado no Monde.

## Consequências

- **Positivas:** a NF entra na plataforma reusando toda a infraestrutura provada da Fase 1; a assincronia é modelada explicitamente (status + refresh) em vez de escondida; a lógica Avulsa (valor ≠ boleto) e o `-AVULSA` seguem o script fielmente; o registro dá auditoria e idempotência; o boleto (Fase 1) fica intacto. Auto-auditoria adversarial sobre os invariantes.
- **Negativas / limites:** o refresh de status é manual (botão) — poll automático fica para depois; a entrega elaborada do PDF (download/anexo) é pendência da Fase 4; produção depende de env consciente pós-Fase 4; a race entre duas emissões paralelas da mesma ref é mitigada por `externalReference` + UNIQUE (como a Fase 1), não por lock. NF/e-mail em lote = Fase 4.
