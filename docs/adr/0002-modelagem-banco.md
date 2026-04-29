# ADR 0002 — Modelagem Inicial do Banco de Dados

**Status:** Aceito  
**Data:** 2026-04-29  
**Missão:** M1 — Modelagem do banco  

---

## Contexto

A plataforma WT Finance precisa de uma base de dados que suporte:
- Ingestão de dados históricos de planilhas Excel (2024, 2025, 2026)
- Análises analíticas de performance de vendas por setor, vendedor e produto
- Gestão de metas mensais por setor macro
- Evolução futura para autenticação, múltiplos módulos e integração com RPA

As decisões aqui são as mais difíceis de reverter — moldam toda a v1 e as ondas seguintes.

---

## Decisões

### 1. Arquitetura multi-schema

Adotamos 4 schemas com responsabilidades separadas:

| Schema    | Propósito                                     | Quem grava           |
|-----------|-----------------------------------------------|----------------------|
| `raw`     | Espelho das planilhas, imutável pela app      | Script seed          |
| `analytics` | Dimensões e fatos, consumidos pelo frontend | Funções de transformação |
| `app`     | Metas e configurações da plataforma           | Aplicação (Onda 2+)  |
| `audit`   | Logs de carga                                 | Triggers automáticos |

**Motivo:** Separação clara de responsabilidades. O schema `raw` permite reprocessar a transformação sem reler os Excel originais — se descobrirmos uma regra de negócio nova amanhã, apenas re-rodamos raw → analytics.

### 2. Setor por item de venda, não por venda

`setor_id` fica em `fato_venda_item`, não em `fato_venda`.

**Motivo:** Uma mesma venda pode ter itens de setores diferentes (ex: pacote Lazer com extra de Weddings). Se colocássemos setor no cabeçalho, uma venda mista precisaria ser partida em duas, ou teríamos perda de granularidade. Toda soma por setor passa obrigatoriamente por `fato_venda_item`.

**Consequência:** Qualquer query de receita/valor por setor faz JOIN com `fato_venda_item`. Isso é esperado e correto.

### 3. dim_setor_micro com UNIQUE em nome (9 linhas)

A taxonomia de dados (cap. 10.2 do briefing) mostra "Hospedagem" sob dois setores: WedMe e Weddings. Mantemos `UNIQUE` em `nome` (9 linhas distintas, per briefing), linkando "Hospedagem" ao setor "Weddings".

**Motivo:** O setor correto de cada item de venda é determinado pela coluna `setor_id` em `fato_venda_item`, não pelo FK informacional em `dim_setor_micro`. O FK setor_id em dim_setor_micro é contexto informacional — não determina o setor do item.

**Alternativa considerada e descartada:** UNIQUE em (nome, setor_id), que daria 10 linhas. Descartada para manter coerência com a especificação do briefing.

### 4. Truncate-and-reload para idempotência do seed

O script seed faz `TRUNCATE` em raw, analytics e app antes de recarregar tudo do zero. O schema `audit` é preservado.

**Motivo:** Volume pequeno (~31k linhas) e carga única manual na v1. Abordagem simples, sem risco de duplicata. `audit.ingestao_log` preserva o histórico de cada execução. Quando houver RPA contínuo (Onda seguinte), evoluiremos para upsert.

### 5. dim_data pré-populada (2024–2030)

Tabela de calendário populada via migration com `generate_series`, incluindo `dia_util`, `dia_util_mes` e `dias_uteis_no_mes`.

**Motivo:** `dia_util_mes` e `dias_uteis_no_mes` são essenciais para o cálculo de ritmo diário (linha ideal vs realizado acumulado) e para a projeção de fechamento de mês. Feriados nacionais ficam para iteração futura.

### 6. Metas 2024 e 2025 são fictícias

Metas 2026 são reais (fornecidas pelos gestores). Metas 2025 = meta_2026 / 1.15 por mês. Metas 2024 = meta_2026 / 1.3225 por mês. Campo `fonte` registra `'real'` ou `'ficticia'`.

**Motivo:** Necessário para comparativos históricos (YoY) funcionarem na v1. O dashboard exibe aviso no rodapé quando anos 2024 ou 2025 estão selecionados.

### 7. RLS permissivo para v1 sem autenticação

RLS ativo em todas as tabelas, mas com políticas de leitura aberta para `anon` em `analytics` e `app`. `raw` e `audit` bloqueados para `anon`.

**Motivo:** A URL não é pública nem divulgada, não há dados pessoais sensíveis, e a estrutura de RLS já está pronta para evoluir quando login for adicionado na iteração seguinte — sem reescrita de schema.

---

## Consequências

**Positivas:**
- Schema `raw` permite reprocessamento sem reler Excel
- Modelo de fatos granular suporta análises futuras por setor micro, produto, etc.
- dim_data pré-calculada evita computação em tempo de query para dias úteis
- RLS estruturado desde o início facilita adicionar autenticação depois

**Negativas / riscos:**
- Todas as queries de setor exigem JOIN com `fato_venda_item` (mais verboso)
- dim_setor_micro com UNIQUE em nome pode exigir revisão se "Hospedagem" precisar ser diferenciada por setor no futuro
- Metas fictícias 2024/2025 podem confundir se usuários não lerem o aviso

---

## Referências

- Briefing WT Finance Dashboard v1, capítulos 4 (Modelagem), 5 (Carga) e 10 (Premissas)
- ADR 0001 — Stack Inicial
