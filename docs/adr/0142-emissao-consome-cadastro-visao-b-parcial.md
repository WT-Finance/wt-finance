# ADR-0142 — A Emissão consome o Cadastro: Visão B parcial (juros/multa + fallback de e-mail fiscal)

**Status:** Aceito · **Data:** 2026-07-06 · **Versão:** v4.37.0
**Relaciona / emenda:** ADR-0137 (Fase 3 — Cadastro de Clientes, Visão A: "a Emissão NÃO lê o cadastro"). ADR-0134/0135/0136 (Faturamento Fases 1-2), ADR-0140/0141 (envio de e-mail). **Sem migration** (as RPCs `buscar_cliente_corporativo` da 0164 + `buscar_pessoas` da 0160 cobrem).

## Contexto

A Fase 3 (ADR-0137) cravou a **Visão A**: o Cadastro de Clientes é **referência** (consulta humana), e a **Emissão NÃO lê o cadastro** — ela deriva tudo de `raw.pessoas`. A investigação dos erros de dados no sandbox revelou dois casos reais em que a Visão A trava a emissão:
1. **BALAROTI** — endereço sem número na base → NF recusada pelo Asaas ("Endereço do cliente incompleto"). *(Resolve-se corrigindo o dado; fora deste ADR.)*
2. **ASSOBYD** — e-mail em `raw.pessoas` em formato duplo (`a@x; b@y`) → inválido como e-mail fiscal → NF recusada ("E-mail do cliente incompleto"). O e-mail **válido** existe no **Cadastro de Clientes** (coluna `destinatarios`).

Além disso, o script legado sempre aplicou juros/multa por linha (`--fine`/`--interest`), enquanto a plataforma emitia com **2%/2% fixos** — o Cadastro já tem `pct_juros`/`pct_multa` por cliente (normalizados para `"1%"|"2%"|"5%"|"10%"` pela migration 0170 / PR #167).

O Yan decidiu **emendar deliberadamente** a Visão A, **limitada a dois campos ESTRUTURADOS** do cadastro.

## Decisão

### 1. Emenda deliberada e LIMITADA (Visão B parcial)
A Emissão passa a **consultar** o Cadastro de Clientes (`buscar_cliente_corporativo`, read-only) para **exatamente dois campos estruturados**:
- **`pct_juros`/`pct_multa`** → juros/multa do **boleto**;
- **`destinatarios`** → **fallback de e-mail fiscal** da **NF**.

A **OBS em texto livre segue NÃO interpretada** — automatizar regra fiscal a partir de texto livre continua fora (risco de "adivinhar" errado). **Por que só campos estruturados:** eles têm contrato verificável (percentual do contrato; e-mail validável), então a aplicação é **segura**; texto livre não é. A Visão B restante (OBS, dias de faturamento) fica para depois.

### 2. Juros/multa: mapeamento crítico + contrato estrito + default fail-safe
`pct_multa` → `fine` (**multa**: cobrança única no atraso) · `pct_juros` → `interest` (**juros ao mês**). **Não inverter** — é o "dado errado parecendo certo" (o boleto sai e é aceito com as penalidades trocadas). Protegido por **teste unitário** (`jurosMultaDoCadastro` — `juros-multa.ts`). Contrato **estrito** (`"1%"|"2%"|"5%"|"10%"`); qualquer outra coisa → **default 2/2, silencioso**. Só emissão **nova** aplica (boleto já existente não retroage). **M0 (bloqueante):** confirmado no sandbox que o Asaas aceita `fine:10` (retornou `{value:10,type:PERCENTAGE}`).

### 3. Fallback de e-mail fiscal: cadeia que só completa lacuna
`ensureCustomer` só preenche e-mail quando o **customer do Asaas está SEM e-mail** — **nunca sobrescreve**. A cadeia (`escolherEmailFiscal`): `raw.pessoas` (se **válido**) → Cadastro (`splitDestinatarios(destinatarios).validos[0]`) → senão segue sem e-mail (o Asaas valida, como hoje). **Só e-mail válido contribui**; uma string multi-e-mail com `;` é inválida (`emailValido`) e **cai** para o fallback. O e-mail vira o e-mail **fiscal permanente** do customer (PUT), coerente com a completude atual.

### 4. Fail-safe e nada retroage (invariantes)
A consulta ao cadastro é **read-only e tolerante a falha**: se a RPC cair, a emissão **NÃO cai** — juros/multa caem no default 2/2 e o degrau 3 do e-mail simplesmente não existe naquela rodada. **Nada retroage**: boletos/NFs já emitidos ficam como estão; só emissões novas usam os valores/fallback. Idempotências, confirmações e falha parcial **inalteradas**. **Não se tocou** no envio de e-mails (4a/4b), no Cadastro (Fase 3) nem na tela de revisão.

## Consequências

- **Positivas:** resolve os casos reais (ASSOBYD emite; boletos com juros/multa por cliente); a Emissão passa a respeitar a intenção fiscal por cliente sem UI nova; postura fail-safe preservada (a emissão nunca cai por causa disso).
- **Negativas / limites:** a Emissão agora **acopla** ao Cadastro em 2 pontos (a Visão A deixou de ser absoluta — por isso este ADR); a Visão B **restante** (OBS, dias de faturamento, qualquer regra em texto livre) **não** foi implementada; **sem UI** dos valores aplicados nem registro em `fatura_emissao` (melhorias de interface, depois); a virada para produção segue decisão consciente do Yan.
