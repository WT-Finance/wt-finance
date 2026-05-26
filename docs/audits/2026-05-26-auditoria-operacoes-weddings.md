# Auditoria de Operações Weddings com Formato Errado

**Data:** 2026-05-26
**Executado por:** Claude Code (M0 — v4.2)
**Tabela auditada:** `analytics.dim_operacao_weddings`

---

## Resumo Executivo

| Métrica | Valor |
|---|---|
| Total de operações Weddings | **223** |
| Com formato correto | **194** (87%) |
| Com formato incorreto | **29** (13%) |

---

## Padrão Esperado

```
W - <Nome do Casal> - <DDMMMAA>
```

Exemplos válidos:
- `W - Maria e João - 15JUN26`
- `W - Kleiciane e Herbert - 07JUL26`

Regex de referência: `^W - .+ - [0-9]{1,2}[A-Z]{3}[0-9]{2,4}$`

---

## Categorias de Desvio Encontradas

### Categoria 1 — Data presente mas sem segundo hífen separador (3 operações)

Estas operações têm data real cadastrada e `data_evento` preenchida, mas o segundo ` - ` que separa o nome da data está ausente. São operacionalmente as mais críticas pois estão ativas no sistema.

| operacao | nome_casal_atual (parseado) | data_evento | Como deveria ser |
|---|---|---|---|
| `W - Kleiciane e Herbert 07JUL26` | Kleiciane e Herbert 07JUL26 | 2026-07-07 | `W - Kleiciane e Herbert - 07JUL26` |
| `W - Aline e Pedro 16MAY25` | Aline e Pedro 16MAY25 | 2025-05-16 | `W - Aline e Pedro - 16MAY25` |
| `W - Bruna e Otavio 06APR24` | Bruna e Otavio 06APR24 | 2024-04-06 | `W - Bruna e Otavio - 06APR24` |

**Impacto no parsing:**
- `extrair_data_evento()`: **extrai corretamente** (regex procura `\d{1,2}[A-Z]{3}\d{2,4}$` no final da string, independente de hífen)
- `extrair_nome_casal()`: **FALHA** — retorna o nome concatenado com a data (`"Kleiciane e Herbert 07JUL26"` em vez de `"Kleiciane e Herbert"`). O regex primário exige o segundo ` - ` para separar; o fallback apenas remove o prefixo `W - `, incluindo a data no resultado

---

### Categoria 2 — Placeholder `DDMMAA` não substituído (25 operações)

Estas operações foram cadastradas com o texto literal `DDMMAA` no lugar da data, indicando que o template do ERP foi preenchido parcialmente. `data_evento` é `NULL` e `situacao` é `sem_data` em todas elas.

**1 caso adicional com prefixo minúsculo:** `w - Ana Carolina e Leonardo - DDMMAA` (prefixo `w` em minúsculo — não reconhecido por `extrair_nome_casal()`)

Lista completa:

| operacao | Correção necessária |
|---|---|
| `W - Amanda e Fernando - DDMMAA` | Substituir `DDMMAA` pela data real |
| `w - Ana Carolina e Leonardo - DDMMAA` | Corrigir `w` para `W` E substituir `DDMMAA` pela data real |
| `W - Ani e Fabiano - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Beatriz e Rodrigo - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Bruna e Carlos Eduardo - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Carol e Felipe - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Catherine e Rodolfo - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Darlene e Adnan - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Fabiana e Caio - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Gabriel e Fernando - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Isabelle e João - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - July e Roger - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - June e Leonardo - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Larissa e Otavio - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Letícia e Vinicius - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Lia e Fábio - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Lumie e Arthur - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Marcela e Nicolas - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Maria Eduarda e Kauê - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Maria Salete e Valdir - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Matheus e Lucas - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Mayara e Thiago - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Micaele e Samuel - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Nicolle e Luan - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Thelma de Denis - DDMMAA` | Substituir `DDMMAA` pela data real |
| `W - Yago e Matheus - DDMMAA` | Substituir `DDMMAA` pela data real |

**Impacto no parsing:**
- `extrair_data_evento()`: retorna `NULL` corretamente (sem data real para extrair)
- `extrair_nome_casal()`: extrai o nome correto para os 25 casos com `W -` maiúsculo (regex primário funciona porque `DDMMAA` não bate o pattern numérico, cai no fallback que remove apenas `W - `; na prática retorna `"Amanda e Fernando - DDMMAA"` incluindo o placeholder — ruído mas não dado errado)
- Para `w - Ana Carolina...` (minúsculo): `extrair_nome_casal()` não reconhece o prefixo e retorna a string completa `"w - Ana Carolina e Leonardo - DDMMAA"`

---

## Análise das Funções de Parsing

### `analytics.extrair_data_evento(p_operacao text)`

- Comportamento: busca `\d{1,2}[A-Z]{3}\d{2,4}$` no final da string
- **Funciona** para Categoria 1 (extrai data mesmo sem segundo hífen)
- **Retorna NULL** para Categoria 2 (placeholder `DDMMAA` não bate o regex)
- **Ponto de atenção:** não valida se o separador ` - ` está presente; extrai data de qualquer string que termine com o padrão numérico

### `analytics.extrair_nome_casal(p_operacao text)`

- Regex primário: `^W\s*-\s*(.+?)\s*-\s*\d{1,2}[A-Za-z]{3}\d{2,4}$`
- Fallback: `^W\s*-\s*(.+)$`
- **Falha para Categoria 1:** sem o segundo ` - `, o regex primário não casa; o fallback retorna tudo após `W - `, incluindo a data no nome do casal
- **Funciona** para Categoria 2 (via fallback, mas inclui o placeholder `- DDMMAA` no nome)
- **Falha para `w` minúsculo:** nenhum dos dois regex casa; retorna a string original completa

---

## Priorização dos Problemas

| Prioridade | Tipo | Qtd | Impacto | Ação |
|---|---|---|---|---|
| **ALTA** | Sem segundo hífen, com data real | 3 | `nome_casal` errado na UI (exibe data junto ao nome) | Corrigir no ERP (adicionar ` - ` antes da data) |
| **MÉDIA** | Placeholder `DDMMAA` não preenchido | 26 | `data_evento = NULL`, operação sem data na UI | Preencher datas reais no ERP |

---

## Próximos Passos para Yan

1. **Imediato (Categoria 1 — 3 operações):** Solicitar à gestora de Weddings que corrija no ERP:
   - `W - Kleiciane e Herbert 07JUL26` → `W - Kleiciane e Herbert - 07JUL26`
   - `W - Aline e Pedro 16MAY25` → `W - Aline e Pedro - 16MAY25`
   - `W - Bruna e Otavio 06APR24` → `W - Bruna e Otavio - 06APR24`
   - Após correção no ERP, reupar o CSV de Lançamentos por Operação para regenerar `dim_operacao_weddings`

2. **Curto prazo (Categoria 2 — 26 operações):** Verificar com a gestora quais dessas operações são reais (já têm data de evento confirmada) e preencher as datas. O caso `w - Ana Carolina...` também precisa ter o `w` corrigido para `W` maiúsculo.

3. **Considerar (futuro):** Adicionar validação no upload CSV que alerte quando o campo `operacao` não bate o padrão `^W - .+ - [0-9]{1,2}[A-Z]{3}[0-9]{2,4}$`, prevenindo novos cadastros mal formados.

4. **Não necessário:** As funções `extrair_data_evento()` e `extrair_nome_casal()` **não precisam de alteração** para lidar com a Categoria 1 — o problema é de dados (falta o ` - `), não de parsing. Corrigir os dados no ERP resolve o comportamento da UI sem tocar em código.

---

## Metodologia

Queries executadas via `npx supabase db query --linked` contra `analytics.dim_operacao_weddings` (proj ref: `awfdnjnzcxjjrqnhersg`). Nenhuma alteração de dados ou código foi realizada.
