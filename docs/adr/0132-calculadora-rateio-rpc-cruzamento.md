# ADR-0132 — Calculadora de Rateio: acesso à base por RPC read-only de cruzamento

**Status:** Aceito · **Data:** 2026-06-24 · **Versão:** v4.28.0
**Relaciona:** ADR-0107 (RBAC por área), migration 0121 (wrapper `exigir_acesso`), migration 0040 (`vw_vendas_agregadas`), ADR-0130 (coerção canônica `toNum`).

## Contexto

A Calculadora de Rateio (Financeiro) importa uma **fatura** de fornecedor, cruza cada `Venda Nº` com a base de vendas, busca o **Setor Macro** de cada venda e rateia o valor total entre os setores — **proporcional ao valor**, **linha a linha**, **com sinal** (a fatura é negativa = saída). É uma **calculadora pura: só exibe, NÃO grava**.

A investigação prévia mapeou a fonte: **`analytics.vw_vendas_agregadas`** (migration 0040) tem **1 linha por venda**, com `venda_no` (text) → `setor_macro` (text) **direto, sem JOIN**. Setor é **único por venda** (0 exceções em 27.520 — confirmado). Os 3 valores reais de `setor_macro` são **`Corporativo`, `Lazer`, `Weddings`**.

Duas restrições estruturais condicionam o desenho:

1. **O schema `analytics` NÃO é exposto pela API** (`config.toml` só expõe `public`/`graphql_public`; `.schema('analytics')` dá PGRST106). Todo acesso a `analytics` é via RPC `public` `SECURITY DEFINER` — convenção do projeto.
2. **O macro de lazer na base é `Lazer`, NÃO `Trips`.** Os dashboards exibem "Trips", mas o valor real é "Lazer". Cruzar/casar por "Trips" jogaria **todas** as vendas de lazer no balde "Não identificado" (bug silencioso de conservação).

## Decisão

### 1. Cruzamento por RPC `public` read-only (migration 0159, aditiva)

`public.cruzar_vendas_setor(p_vendas text[]) RETURNS jsonb`, `STABLE SECURITY DEFINER`, `SET search_path=''`. Corpo: um único `SELECT venda_no, setor_macro FROM analytics.vw_vendas_agregadas WHERE venda_no = ANY(p_vendas)`, devolvendo o array dos **pares encontrados**. Os números que **não voltam** são inferidos pela diferença no cliente → balde **"Não identificado"** (explícito).

- **Gate RBAC (wrapper atual, padrão 0121):** `PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial'])` + `REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated, service_role`.
- **Sem RBAC novo:** reusa a área existente `financeiro/gerencial` (a aba vive sob ela). O array `AREAS` não muda; só `areasDaRota` ganha um match preciso para `/financeiro/calculadora-rateio` (→ `['financeiro/gerencial']`), **antes** do catch genérico `/financeiro` (que liberaria as duas áreas de Financeiro).
- **Aditiva/retrocompatível:** só `CREATE FUNCTION` + `GRANT`; não toca tabela/dado; READ-ONLY. Passou o backup-gate (restore-test VERDE) sem fricção.

### 2. `Lazer` é o valor LÓGICO; `Trips` é só EXIBIÇÃO

O cruzamento, o parser, o cálculo do rateio e o `mapaSetor` usam **sempre** o valor real `Lazer`. A conversão `Lazer`→`Trips` acontece **exclusivamente** no mapa de rótulos do componente (`ROTULO`), na renderização. Os baldes lógicos são `Corporativo | Lazer | Weddings | Não identificado`; os rótulos de tela, `Corporativo | Trips | Weddings | Não identificado`.

### 3. Rateio puro e isomórfico, com fechamento por construção

A aritmética vive em `src/lib/rateio/calcular.ts` (pura, sem DOM, testável). Cada linha **com valor** cai em **exatamente um** dos 4 baldes (o fallback "Não identificado" é total); linhas **sem valor** não entram (contadas em `ignoradas`). Logo `soma(baldes) == total` por construção (mesmas parcelas, reagrupadas) — `fecha` confere com tolerância de meio centavo (ruído de float). A leitura da fatura (`parse-fatura.ts`, browser, `@e965/xlsx`) só extrai `Venda Nº` (via `toNum`→inteiro→`String`, casa com a base text numérica) e `Valor` (via `toNum`, BRL com sinal) — **coerção canônica**, sem reimplementar.

## Consequências

- **Positivas:** acesso seguro e read-only à base (4 camadas: RPC `exigir_acesso`, página `requireArea`, action `requireAreaAction`, `areasDaRota` preciso); invariante de conservação ("o rateio não perde dinheiro") garantido em runtime mesmo se a RPC devolvesse um setor inesperado (o guard `ehSetorReal` o joga em "Não identificado"); zero risco de regressão (não grava, não toca schema existente). Auto-auditoria adversarial (6 céticos independentes) provou os 6 invariantes.
- **Negativas / limites:** a calculadora **não persiste** o rateio — virar "lançar o rateio" (gravar na base) é frente futura, exigindo migration de **escrita** e as cautelas de dado (validação, idempotência, auditoria). O `setor_macro` no schema Zod fica `z.string()` (tolera drift da RPC); a disciplina de conservação é garantida pelo guard de runtime, não pelo tipo.
