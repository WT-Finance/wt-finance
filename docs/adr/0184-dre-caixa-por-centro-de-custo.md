# ADR-0184 — DRE de caixa por centro de custo: rateio do Monde por Número e antecipações atribuídas a quem precisou do caixa

**Status:** aceito (v6.5.1) · **Data:** 2026-11-09 ·
**Contexto:** versão v6.5.1, "DRE de caixa por centro de custo" (Rota A) ·
**Briefing:** `docs/briefings/briefing-v6-5-1-dre-caixa-centro-custo.md` · **Medição e decisões D1–D7:**
`docs/auditoria/v6-5-1-m0-dre-centro-custo.md` · **Contrato da base:** `docs/specs/v6-5-1-m2-base-centro-custo.md` ·
**Migrations:** `0304` (aditiva, 06/11), `0305` (destrutiva por classificação — CHECKs de base —, aplicada pelo Yan em
TTY em 09/11), `0306` (aditiva, 09/11) ·
**Código:** `src/lib/ingestao/parsers/lancamentos-centro-custo.ts`, `src/lib/dre-centro/`,
`src/components/financeiro/dre/tabela-dre-centro.tsx`, `src/app/financeiro/dre/page.tsx`

> Numeração conferida contra `docs/adr/`, `supabase/migrations/` e as 68 branches do remoto em 09/11/2026
> (últimos reais: ADR 0183, migration 0303 antes da versão).

## O problema

A DRE de caixa mostra a empresa inteira. A pergunta da diretoria é outra: **qual operação (Trips, Weddings,
Corp) é deficitária no caixa, quando, e quem está cobrindo**. Dois obstáculos:

1. O Monde tem o **centro de custo** do lançamento num relatório separado ("Lançamentos por Centro de Custo"),
   que a DRE não lia. Lançamento com vários centros tem um % por centro, e o relatório não é a mesma base que a DRE
   usa (Lançamentos por Categoria, por movimentação).
2. As **antecipações de recebíveis** distorcem o caixa de cada operação: o recebível antecipado entra no mês da
   antecipação, no centro dono, quando o caixa de que se precisava era de outro centro (em 2026, quase sempre o CSC).

## A decisão

### 1. Base nova no contrato de ingestão, rateio por Número

- O relatório entra como a **sétima base** do contrato de ingestão v1 (`lancamentos-centro-custo`), com o mesmo
  desenho das irmãs: cru no Storage, parser no servidor, promoção atômica, checksum.
- **O checksum é o outline de cada centro** (contagem e Σ de `Valor Centro Custo` com o sinal da movimentação), e
  **grupo recolhido (`+`) rejeita a carga** — o primeiro export de teste veio com 83% das linhas faltando assim.
- **Lista fechada** de colunas (D6): `Pessoa`, `Descrição` e `Valor Lançamento` nunca viram coluna; sonda estática
  sobre o DDL.
- A promoção regenera, na mesma transação, a tabela de rateio `(número, centro, peso)`:
  peso = % ÷ Σ % do lançamento (o Monde reparte a sobra quando os % passam de 100); Σ % = 0 ⇒ partes iguais
  (lançamento de valor líquido zero); o último centro fica com o resto ⇒ **Σ pesos = 1 exato**.
- A chave é o **Número** (texto, com sufixo de parcela): o % é do lançamento, não da movimentação.
- Centros numa dimensão fechada; **centro novo no Monde reprova a carga** (nunca cai calado em "Sem centro").
  "Sem centro" é coluna visível e nunca é redistribuído (corrige-se no Monde).

### 2. A DRE por centro é a DRE da empresa repartida — mesma fonte, mesmo mapa

`get_dre_caixa_centro` lê `fato_fluxo` realizado, `dre_categoria_map` e as fórmulas de `dre_bloco` **vivos**, com a
mesma mecânica de `get_dre_mensal`, e reparte cada linha pelo rateio do Número. Consequências provadas:

- **Sem o ajuste de antecipação, Σ centros ≡ visão Empresa linha a linha**, mês a mês (caso de contrato permanente).
- Remapear uma categoria no editor muda as duas visões no mesmo instante (prova em transação revertida).
- A visão Empresa não muda nada: a tabela de hoje é chamada com as mesmas props (snapshot gravado antes da versão).

### 3. Antecipações: identificar no banco, atribuir no front

- **O Monde não marca o recebível antecipado**; a plataforma o identifica casando o registro de antecipações do
  Janus com os recebimentos da conta (regra §3.3, constantes nomeadas): Receita de Vendas positiva da conta do
  de-para fixo (D3: Asaas → ASAAS, Blimboo → Blimboo), na janela de −1/+2 dias, com antecedência mínima (> 2 dias no
  Asaas, > 7 na Blimboo), preenchendo pela maior antecedência, depois maior valor, depois Número. A regra foi
  **pinada por engenharia reversa do protótipo**: 16/16 antecipações e 3.186/3.186 recebíveis iguais.
- O recebível antecipado **volta ao mês do vencimento original, no centro dono**. O resultado operacional de cada
  centro mostra o que a operação gerou ou consumiu por conta própria.
- **C (dinheiro antecipado), D (devolução) e a taxa ficam com quem precisou do caixa**: os centros com saldo
  operacional acumulado negativo no mês da antecipação, na proporção do déficit; sem nenhum negativo, com os donos.
  O D usa os pesos do mês do C. O dono só aparece numa linha de memória.
- A identificação vive no banco (precisa do dado bruto); a **atribuição é aritmética sobre agregados e vive no módulo
  puro do front** (`src/lib/dre-centro/atribuicao.ts`), testado contra os pesos do protótipo e reutilizado pelo
  Exportar. A identidade "Σ Resultado de caixa dos centros ≡ resultado da Empresa" é caso de contrato permanente.
- A taxa na DRE é a **do Monde**; o registro do Janus é a conferência (o que falta lançar aparece como pendência).

### 4. Destrutiva por classificação, não por dado

Aceitar a sétima base exige ampliar dois `CHECK (base IN …)` = `DROP/ADD CONSTRAINT`, que o gate classifica como
destrutivo (D2). Ficou numa migration própria (0305), aplicada pelo humano em TTY; até ela, a carga da base falhava
fechada. Precedente: 0298 (v6.4.0).

## Alternativas descartadas

- **Rateio pelo `Valor Centro Custo`**: vem zerado nos lançamentos de valor líquido zero (361 em 06/11) — cerca de
  R$ 3 mi de receita bruta cairiam em "Sem centro".
- **Redistribuir o "Sem centro"**: esconderia lançamento mal cadastrado; a correção é no Monde.
- **Atribuir a antecipação ao dono dos recebíveis**: era o que distorcia — a operação que gerou o recebível parecia
  ter tomado caixa que outra consumiu.
- **Atribuição no banco**: duplicaria aritmética que o Exportar e a tela já precisam; no módulo puro ela é testada
  contra o protótipo sem banco.

## Consequências e limites (registrados)

- **Cada ano é calculado isoladamente**: antecipação de fim de dezembro com movimentação em janeiro, e o D de
  antecipação de 2026 que vence em 2027, não aparecem na visão de 2027 (fronteira de produto, revisor-db M1).
- Movimentação com data futura conta como previsto (mesmo predicado da Empresa) — por isso Trips difere do protótipo em
  R$ 9.540,17 no export de 06/11 (2 linhas de 23/11).
- As duas bases (centro de custo e movimentação) precisam ser do mesmo dia; a diferença aparece como cobertura.
- Só Realizado e só 2026 por enquanto; Previsto por centro, rateio do CSC e RPA da base ficam fora (briefing §11).
