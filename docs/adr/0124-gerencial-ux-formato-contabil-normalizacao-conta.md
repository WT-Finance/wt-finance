# ADR-0124 — Fluxo de Caixa Gerencial: formato contábil, normalização de conta como seleção (agregada intocada) e saldos em cards

**Data:** 2026-06-17 · **Versão:** 4.22.0 (MINOR) · **Status:** aceito

## Contexto

A v4.21 entregou o Fluxo de Caixa Gerencial com contas gerenciáveis, agregada
data-driven e cores por faixa. O uso revelou pontos de UX a refinar: a gestão de
contas misturava saldo operacional (muda toda hora) com configuração estrutural
(muda raro); os valores monetários não tinham alinhamento contábil; a cor de faixa
pintava só o texto (pouco visível); a base era larga e quebrava linha; e a coluna
`conta_previsao` era texto livre na planilha (`Banco Itau`, `ASAAS`, nulos, órfãos),
o que impedia filtrar por conta de forma confiável.

## Decisão

### 1. `conta_previsao` vira SELEÇÃO normalizada — SEM alterar o modelo da agregada
- A Conta de cada lançamento passa a ser escolhida de uma lista (contas reais de
  `analytics.gerencial_saldos` + o rótulo **"Outras"**), encerrando o texto livre.
- A ingestão é **tolerante**: `lower`/`unaccent`/`trim`/colapso-de-espaço + tabela de
  aliases (`Banco Itau` → Itaú; `ASAAS` → Asaas); nulo/vazio/órfão → "Outras". Lógica
  isomórfica em `@/lib/gerencial/normalizar-conta` (usada na API Route de import) e
  **espelhada** no SQL (migration 0149, backfill do histórico).
- **Invariante de modelo (imutável, herdada da v4.21):** a Visualização Agregada
  **não** distribui fluxo por conta. As 3 projeções são 3 bases de saldo inicial sobre
  o **mesmo** resultado diário; `get_gerencial_projecao_diaria` agrega por `tipo`/`data`
  e **ignora** `conta_previsao`. Logo a normalização serve **apenas** ao filtro da base
  e à limpeza do dado — **não** muda a matemática da agregada. Verificado por checksum
  dos inputs da projeção (row-level e agregado diário) **antes e depois** do backfill:
  idênticos.
- `chaveDuplicata` (dedup do import) **não** usa `conta_previsao` (só
  `tipo|pessoa|valor|vencimento`); por isso a divergência cru→canônico converge em
  `aAtualizar` (atualiza a linha existente) em vez de duplicar.

### 2. Formato contábil — componente `<ValorContabil>`
- Em tabelas financeiras densas, valor monetário usa **"R$" à esquerda** e **número à
  direita** (extremos opostos), com **centavos** e `tabular-nums`. Componente único
  `@/components/shared/valor-contabil` (`flex justify-between`; "R$" em `--text-subtle`);
  a cor opcional (`className`) pinta só o número. Vira convenção de Design System (§7).

### 3. Cor de faixa no FUNDO da célula (corrige a v4.21)
- A faixa de cor preenche o **fundo do `<td>`** do saldo (antes só o texto): Principal
  com limite = 3 faixas (`--danger`/`--warning`/`--success`); Principal sem limite,
  Consolidado e Consol.+Rendimento = 2 faixas. Os **fluxos** (A Receber/A Pagar/
  Resultado) mantêm cor só no número. Tudo por token semântico (sem hex).

### 4. Saldos em cards + "Gerenciar contas" como painel
- O **saldo inicial** (operacional) vive em **cards** sempre visíveis, com edição inline
  só do saldo. A **estrutura** (limite, consolidado, papel, CRUD) vai para um **painel**
  (botão engrenagem → `ListDrawer`), **sem** a coluna de saldo. Separa o que muda toda
  hora do que muda raro.

### 5. Nomenclatura de papel (rótulo de UI)
- `isolada` → **"Principal"**, `reserva` → **"Rendimento"** apenas no rótulo
  (`PAPEL_LABEL`). A **chave do banco permanece** `isolada`/`reserva` (zero migration de
  enum, zero risco nos índices/predicados existentes). Badges por token neutro de
  plataforma (`--action-soft` / zinc), nunca hex.

## Consequências
- Filtro por conta passa a ser confiável; a base fica limpa após o backfill.
- A agregada continua provadamente inalterada — a normalização é ortogonal ao modelo.
- `<ValorContabil>` padroniza o alinhamento monetário; futuras tabelas financeiras
  reusam o primitivo em vez de remontar o flex.
- "Outras" é um **rótulo de bucket**, não uma conta de `gerencial_saldos` — não entra
  em saldo/consolidado; é só agrupamento de lançamentos sem conta reconhecida.

## Alternativas consideradas
- **FK de `conta_previsao` para `gerencial_saldos`:** rejeitada — o histórico tem
  órfãos legítimos (planilha) e a agregada não depende da conta; uma FK rígida quebraria
  o import tolerante sem benefício de modelo. Mantém-se `TEXT` + normalização.
- **Renomear a chave do papel no banco (`isolada`→`principal`):** rejeitada — exigiria
  migration destrutiva sobre índice único parcial e predicados, com risco
  desproporcional ao ganho (que é puramente de rótulo). Resolvido no mapa de UI.
- **Agregada por conta (GROUP BY `conta_previsao`):** fora de escopo e contra a decisão
  de modelo da v4.21 (3 bases sobre o mesmo resultado diário).
