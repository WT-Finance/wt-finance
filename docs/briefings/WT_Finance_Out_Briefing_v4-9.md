# WT Finance — Out-Briefing v4.9

**Data:** 2026-06-03 · **Branch:** `feat/v4-9` · **Versão:** 4.8.2 → **4.9.0** (MINOR)
**Tema:** Integridade de dados (Carteira, Convidados, Gerencial) + ajustes Weddings/Financeiro. Três bugs de DADO corrigidos na raiz, uma coluna que elimina um join frágil, e ajustes visuais conectados. ADRs 0097–0100.

---

## Missões implementadas

| # | Missão | Tipo | Status |
|---|--------|------|--------|
| M1 | Carteira: remover fallback `extrair_data_evento` (URGENTE) | Dado | ✅ aplicada |
| M2 | Coluna Operação Própria (parser + `raw.vendas_excel`) + header Data Início | Dado | ✅ código; migration pré-merge |
| M3 | Contagem de convidados via `operacao_propria` (split/distinct/count) | Dado | ✅ código; **migration pós-re-upload** |
| M4 | Gerencial: parser lê `Date` nativo do Excel (fim da inversão dia/mês) | Dado | ✅ código; **re-import pós-deploy** |
| M5 | Entradas/saídas não liquidadas no Fluxo de Caixa Mensal Weddings | Visual | ✅ aplicada |
| M6 | Unificar Resultado Previsto = entradas − saídas (drawer + tabela) | Visual/Dado | ✅ código; migration pré-merge |
| M7 | Ocultar Posição por Conta + Composição em largura total | Visual | ✅ |
| M8 | 2 casas decimais em contexto de operação individual | Visual | ✅ |
| M9 | Fechamento (versão, CHANGELOG, ADRs, smoke, PR) | Fechamento | ✅ |

---

## Migrations

| # | O quê | Estado |
|---|-------|--------|
| 0105 | `regenerar_dim_operacao_weddings`: `data_evento` = só Data Início real; dropa `extrair_data_evento` | **Aplicada + verificada** |
| 0106 | `get_acumulado_weddings`: + `total_a_receber`/`total_a_pagar` (pendentes, sem janela de data) | **Aplicada + verificada (anon 1.2s)** |
| 0107 | `raw.vendas_excel` + `operacao_propria`; `inserir_lote_raw` grava o campo | Aplicar **pré-merge** (aditiva, segura) |
| 0108 | `get_operacoes_weddings`: + `entradas_total`/`saidas_total` no retorno (aditivo) | Aplicar **pré-merge** (aditiva, segura) |
| 0109 | `contar_convidados_operacao` via `operacao_propria` + índice parcial | Aplicar **APÓS o re-upload** de Vendas |

**Ordem de aplicação:**
1. **Pré-merge (com confirmação):** 0107 + 0108. Ambas aditivas e retrocompatíveis com a produção atual. ⚠️ **0109 NÃO pode entrar nesse `db push`** — antes do re-upload `operacao_propria` é NULL e a função retornaria 0 convidados para tudo. Excluir 0109 do folder durante esse push (mover temporariamente) e aplicá-la só no passo 3.
2. **Merge → deploy** (Vercel automático).
3. **Pós-deploy, checkpoints com o Yan:**
   - **Re-upload Vendas por Produto** COM a coluna Operação Própria (e Data Início) → popula `operacao_propria` + `data_inicio_evento`. **Então** aplicar 0109 e validar a contagem de convidados contra uma operação conhecida. (M2/M3)
   - **Re-import Gerencial** → limpa os ~143 registros com data invertida; validar que 05/06 grava `2026-06-05` e que junho aparece na Visualização Agregada. (M4)

---

## ADRs registrados (numeração real verificada: main estava em 0096)

- **0097** — Carteira sem fallback de data (honestidade de dado)
- **0098** — Operação Própria como vínculo direto operação↔diárias
- **0099** — Parser de data lê o valor nativo do Excel
- **0100** — Casas decimais por contexto (operação individual vs. agregado)

---

## Descobertas relevantes (divergências com o briefing)

1. **Data Início 100% NULL na origem (não ~5 operações).** O briefing supunha ~5 operações de 2023 sem Data Início; na prática, a coluna nunca era ingerida (header `'Data Início'` vs. `'Data de Início'` no parser). Decisão do usuário: **bundle do fix de header no M2** + **M1 primeiro** (a Carteira fica honestamente "sem data" até o re-upload, em vez de anos inventados).

2. **`resultado_caixa` é coluna GERADA = `(entradas_total − saidas_total)`.** O Risco 2 do briefing previa que os valores da coluna "Resultado Previsto" na tabela **mudariam** (de `resultado_caixa` para entradas−saídas). **Não mudaram** — eram idênticos por construção. A unificação do M6 ficou **explícita no código** (a tabela computa entradas−saídas via os campos novos da 0108, desacoplando do comportamento da coluna gerada), mas **sem alteração de valor exibido**. Comunicar à diretoria: nenhum número da coluna mudou.

3. **Rodapé do Fluxo de Caixa do drawer (decisão do usuário): manter os 3 indicadores.** Como Resultado de Caixa e Resultado Previsto exibem o mesmo valor (consequência do item 2), perguntei se unificava em 2 colunas ou mantinha as 3. **Decisão: manter "Resultado de Caixa / Resultado Previsto / NCG"** — só corrigi o alinhamento (rótulos na 1ª linha, valores na 2ª; alinham mesmo com rótulo em 2 linhas). Nenhum campo removido.

---

## Gates

- ✅ `npx tsc --noEmit` zero erros.
- ✅ `npx next build` limpo.
- ⚠️ `npm run lint`: os **5 arquivos editados não introduzem warning/erro novo**. O baseline do projeto já tinha erros pré-existentes (regras do React Compiler: setState em effect, no-unescaped-entities em `design-system/page.tsx` linhas 341–342 — conteúdo que não toquei). `next build` não falha neles. "Sem warnings novos" satisfeito.
- ✅ Smoke (REST anon) das RPCs já aplicadas (0105 dim repovoada / 233 "sem data"; 0106 anon 1.2s, R$ 9,18 Mi / R$ 10,28 Mi). 0107/0108 verificar via REST após o push pré-merge. 0109 verificar após o re-upload.

---

## Pendências

**Bloqueantes de validação (checkpoints pós-deploy, com o Yan):**
- Re-upload Vendas por Produto COM Operação Própria → aplica 0109, valida M3, restaura datas da Carteira (M1).
- Re-import Gerencial → valida M4.

**Curadoria de dado no ERP (operacional, fora do código):**
- Preencher a Data Início dos contratos sem data (a Carteira agora expõe em "sem data") — ~20 operações Weddings graves.
- Verificar o formato da coluna Operação Própria na exportação (~29 operações com formato suspeito; precisa casar exatamente com o nome em Lançamentos por Operação, senão o filtro de convidados falha).
- "Não Classif." em Weddings (~R$ 173k de faturamento, receita negativa, sem subsetor) — mapear no cadastro.

**Reservado para versões futuras (do briefing):** DRE evolutiva; RPA (atualização automática); Posição por Conta (revisão maior — ocultada nesta versão); revisão de Custos Internos; migração incremental dos gráficos legados.

---

## CLAUDE.md

Avaliado. A v4.9 reforça padrões **já documentados** (anon timeout em RPC de listagem → N+1, tratado no índice da 0109; convenção de import lendo Date nativo). Sugestão a incluir (vai no PR para revisão do usuário): **"Parser de upload deve ler o valor nativo do Excel (`raw:true` + `cellDates:true`), não a string reformatada"** (ADR-0099) — permanente, transversal a qualquer importação, e custou caro (inversão dia/mês mascarada). E reforço da convenção de **casas decimais por contexto** (ADR-0100).

---

## Arquivos

**Novos:** `supabase/migrations/{0105,0106,0107,0108,0109}_*.sql`; `docs/adr/{0097,0098,0099,0100}-*.md`; `docs/briefings/WT_Finance_Out_Briefing_v4-9.md`.
**Modificados:** `src/lib/carga/parse-vendas-produto.ts`; `src/lib/gerencial/parser.ts`; `src/lib/fmt.ts`; `src/types/api.ts`; `src/components/weddings/{drilldown-drawer.tsx,fluxo-caixa-mensal.tsx,lista-operacoes.tsx}`; `src/components/financeiro/composicao-lancamentos.tsx`; `src/app/financeiro/fluxo-caixa/page.tsx`; `src/app/admin/design-system/page.tsx`; `package.json`; `CHANGELOG.md`.
