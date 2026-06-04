# WT Finance — Out-Briefing v4.9.1

**Data:** 2026-06-04 · **Branch:** `feat/v4-9-1` · **Versão:** 4.9.0 → **4.9.1** (PATCH)
**Tema:** Integridade de dados — ingestão da Operação Própria + data do evento (Carteira e Lista). Follow-up direto da v4.9. ADR-0101.

---

## Contexto

Pós-deploy da v4.9, o re-upload de Vendas revelou dois problemas, ambos investigados sobre `supabase/seed/data/VendasPorProduto_tratada.xlsx`:

1. **A coluna Operação Própria não ingeria.** O cabeçalho no arquivo é `Operação Propria` (sem acento em "Própria"); o parser casava `Operação Própria` ao pé da letra → coluna descartada em silêncio (mesma classe do bug da Data Início na v4.9). Idem `Mes`→`Mês`.
2. **A Carteira: Vendas × Entrega estava "quase certa".** 3 casamentos de 2027 caíam em 2023/2024/2025. Causa confirmada: `data_evento` derivava do `venda_n` (digitado no Lançamentos), que aponta para o contrato de outro casamento de nome parecido:
   - `W - Paula e Fernando - 11MAY27` → `venda_n` 44374 = contrato da *Paula e Bruno* (2023)
   - `W - Darlene e Adnan` → `venda_n` 44025 = contrato da *Daniella e Augusto* (2024)
   - `W - Larissa e Vitor` → `venda_n` 49444 = contrato da *Larissa e Thiago* (2025)

---

## Implementado

| # | Mudança | Arquivo / Migration |
|---|---------|---------------------|
| 1 | **Parser tolerante a cabeçalho** (acento/caixa/espaço) + aviso de colunas não-mapeadas | `src/lib/carga/parse-vendas-produto.ts` |
| 2 | **`data_evento`/`data_venda_contrato` da dim via Operação Própria** (linha `Contrato de casamento`); sem fallback `venda_n` | migration `0110` |
| 3 | **Carteira: Vendas × Entrega só da base Vendas** (`get_carteira_weddings`) | migration `0111` |

**Regra firmada (ADR-0101):** `data_evento` = `Data Início` da linha `Produto = 'Contrato de casamento'` da base de Vendas, casada pela Operação Própria — **em qualquer lugar** (Carteira, Lista, drawer, KPIs).

**Resultado validado contra o arquivo** (entregas/ano, atual → corrigido):
`2023 17→16 · 2024 43→42 · 2025 54→53 · 2026 69 · 2027 49→52 · 2028 1`. As 3 voltam a 2027.

---

## Migrations

| # | O quê | Estado |
|---|-------|--------|
| 0110 | `regenerar_dim_operacao_weddings`: `data_evento`/`data_venda_contrato` via Operação Própria (linha Contrato de casamento) | Aplicar **pós-re-upload** + **re-rodar** `SELECT public.regenerar_dim_operacao_weddings();` |
| 0111 | `get_carteira_weddings`: matriz construída só da base Vendas | Aplicar **pós-re-upload** |

Ambas dependem da Operação Própria ingerida → exigem o parser corrigido (deploy) + re-upload. Aplicam junto da `0109` (convidados, da v4.9, ainda pendente).

**Sequência:** merge v4.9.1 → deploy → re-upload de Vendas (agora ingere Operação Própria + corrige Mes) → aplicar 0109 + 0110 + 0111 → re-rodar `regenerar_dim_operacao_weddings()` → validar Carteira, Lista e convidados.

---

## ADRs
- **0101** — data_evento da Carteira/Lista vem da Data Início da Vendas (via Operação Própria).

## Gates
- ✅ `npx tsc --noEmit` zero erros · ✅ `npx next build` limpo · ✅ lint do parser limpo.
- ✅ `normalizeHeader` validado contra os cabeçalhos reais (`Operação Propria`, `Mes`, variações de caixa/acento).
- ⏳ RPCs `0110`/`0111` verificadas via REST **após** o re-upload (precisam de `operacao_propria` populada; aplicar antes zeraria datas/Carteira).

## Pendências / follow-up
- **`faturamento`/`receita`/`hotel` da dim** ainda derivam do `venda_n` (mesma contaminação dos 3 casos). Re-basear na Operação Própria num próximo passo.
- **Curadoria ERP:** corrigir os `venda_n` trocados no Lançamentos (44374, 44025, 49444) e alinhar o nome da operação defasada (`W - Thelma de Denis - DDMMAA` → data real) para ela sair de "sem data" na Lista.

## Arquivos
**Novos:** `supabase/migrations/{0110,0111}_*.sql`; `docs/adr/0101-data-evento-via-operacao-propria.md`; `docs/briefings/WT_Finance_Out_Briefing_v4-9-1.md`.
**Modificados:** `src/lib/carga/parse-vendas-produto.ts`; `package.json`; `CHANGELOG.md`.
