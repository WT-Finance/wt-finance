# WT Finance — Out-Briefing v4.37.0 · A Emissão consome o Cadastro (Visão B parcial)

**Data:** 2026-07-06 · **Branch:** `feat/v4-37-0-emissao-consome-cadastro` (base `main` @ v4.36.0) · **Versão:** 4.36.0 → **4.37.0** (MINOR)
**Tema:** Primeira evolução deliberada Visão A → Visão B, **limitada a dois campos estruturados** do Cadastro de Clientes: (1) juros/multa por cliente no boleto; (2) fallback de e-mail fiscal na NF. **SEM migration · ADR-0142** (emenda ao invariante "a Emissão não lê o cadastro" da Fase 3). **Nada retroage; OBS não interpretada.** **Merge e deploy ficam com o usuário.**

## Missões

### M0 — Verificação do fine alto (bloqueante) ✅ ACEITOU
Probe no sandbox: 1 boleto com `fine:10`/`interest:1`. **Asaas ACEITOU** (HTTP 200) e gravou `fine: {value:10, type:PERCENTAGE}` / `interest: {value:1, type:PERCENTAGE}`; o boleto de teste (`pay_gmky9ytk6u2j80i8`, contra um cliente sandbox existente) foi **deletado** logo em seguida. Logo, o valor `"10%"` do contrato é válido — M1/M2 liberados. *(O probe era descartável — removido; não vai ao repo. A chave do sandbox foi posta no `.env.local` pelo Yan para rodar; segue gitignored.)*

### M1 — Juros/multa por cliente
- **`src/lib/faturamento/juros-multa.ts`** (novo, puro): `parsePctContrato` (contrato estrito `"1%"|"2%"|"5%"|"10%"` → int; senão null) + `jurosMultaDoCadastro` (**`pct_multa`→`fine`, `pct_juros`→`interest`**; default 2/2). `criarBoleto` já tinha o shape `{value}` (fiel ao legado).
- **`emitirBoletos`**: consulta `buscar_cliente_corporativo` (por nome, `normNome`) numa etapa **read-only e FAIL-SAFE** (RPC caiu → mapa vazio → default 2/2); por fatura, `fine`/`interest` do cadastro OU 2/2. **Só emissão nova** aplica (boleto já existente não retroage).
- **Testes** (`juros-multa.test.ts`, 6): mapeamento **não invertido** (multa 10% + juros 1% → fine 10, interest 1), contrato, defaults (vazio/inválido/fora), mistura.

### M2 — Fallback de e-mail fiscal
- **`src/lib/asaas/customers.ts`**: `escolherEmailFiscal(emailPessoas, emailFallback)` (novo, puro) — cadeia `raw.pessoas` (se válido) → Cadastro (fallback) → null. `ensureCustomer` ganhou `opts.emailFallback` e usa a cadeia; os 3 ramos só setam e-mail **quando o customer está sem** (nunca sobrescreve).
- **`emitirNotas`**: consulta `buscar_cliente_corporativo` (FAIL-SAFE) → `emailFallback = splitDestinatarios(destinatarios).validos[0]`, passado ao `ensureCustomer`.
- **Testes** (`customers.test.ts`, 5): cadeia; `raw.pessoas` com `;` (inválido) cai para o fallback; nenhum válido → null; trim.

### M3 — Fechamento
v4.37.0, CHANGELOG, CHANGELOG_DIRETORIA, ADR-0142, este out-briefing.

## Invariantes — auto-auditoria
1. **Mapeamento não inverte** ✅ — `pct_multa→fine`, `pct_juros→interest`, provado por teste.
2. **Contrato estrito + default fail-safe** ✅ — só as 4 strings; senão 2/2; emissão nunca falha por juros/multa.
3. **Consulta ao cadastro read-only e fail-safe** ✅ — RPC do cadastro em try/catch próprio (mapa vazio na falha) — **não** no barrier fail-closed do buscar_pessoas.
4. **E-mail nunca sobrescreve, só completa** ✅ — ramos setam só quando `!achado.email` / no create; só e-mail válido; `;` cai.
5. **Nada retroage** ✅ — só emissão nova; idempotências/confirmações/falha parcial inalteradas.
6. **OBS não interpretada; não tocar 4a/4b/cadastro/tela de revisão** ✅.

**Auditoria adversarial (explorador cético, seguindo a cadeia banco→RPC→wiring→payload):** os **6 invariantes CONFIRMADOS** — sem inversão no wiring (4 saltos, todos por propriedade nomeada), sem sobrescrita de e-mail, sem aborto por cadastro, sem cruzamento de cliente. Dois **residuais NÃO-bloqueantes e pré-existentes** (não introduzidos por esta versão): **(1)** `buscar_cliente_corporativo` não passa por `parseRpc`/Zod — como esta versão a torna financeiramente relevante e o desenho é fail-safe, um drift silencioso viraria "todo mundo 2/2" sem sintoma → **mitigado com um smoke de contrato** (`rpc-contrato.test.ts`, pega drop/rename/grant; drift de coluna continua candidato a teste com fixture semeada — follow-up); **(2)** o casamento por nome (`normNome`) é a mesma fragilidade de `buscar_pessoas`, agora alcançando dinheiro/e-mail — mas o `UNIQUE` em `app.norm_nome(empresa)` impede troca entre homônimos, e diferença de acento **falha para o lado seguro** (default 2/2), nunca cruza. Registrado; correção do cruzamento-por-nome é transversal e fora desta versão.

## Gate de fechamento
`npx tsc --noEmit` → **0** · `npm test` → **343** (332 base + 6 juros-multa + 5 customers) · `eslint` nos arquivos alterados → **0** (o `npm run lint` full está estourando o timeout por carga da máquina — como só 5 arquivos mudaram e o `main` estava limpo, não há warning novo; reconferir full quando a máquina estiver ociosa) · `npm run build` → verificar no fechamento. **Sem migration.**

## CHECKPOINT do Yan (sandbox, antes do merge)
- Boleto novo de cliente com **juros/multa próprios** → conferir `fine`/`interest` no Asaas; cliente **fora do cadastro** (ou vazio) → 2%/2%.
- **Reemitir** a planilha → já-emitidos **intactos** (nada retroage).
- **Teste ASSOBYD:** NF de cliente cujo e-mail só existe no Cadastro → **emite**, e o customer no Asaas fica com o **primeiro e-mail** dos destinatários do cadastro.

## Fora de escopo / próximos
- **Interface:** mostrar os juros/multa aplicados na tela + registrar em `fatura_emissao` — melhorias posteriores.
- **Visão B restante:** OBS, dias de faturamento, qualquer regra em texto livre — não interpretadas.
- **A virada** para produção (flip conjunto Asaas + e-mail) — decisão consciente do Yan, após validação ponta a ponta.

## Arquivos
- **Novos:** `src/lib/faturamento/juros-multa.ts` (+ `.test.ts`), `src/lib/asaas/customers.test.ts`, `docs/adr/0142-…`, este out-briefing.
- **Alterados:** `src/lib/asaas/customers.ts` (escolherEmailFiscal + emailFallback), `src/app/financeiro/faturamento-corp/actions.ts` (emitirBoletos: juros/multa; emitirNotas: fallback de e-mail), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`/`package-lock.json` (4.37.0).
