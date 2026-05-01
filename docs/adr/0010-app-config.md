# ADR 0010 — Tabela app.config como solução genérica de configuração

**Status:** aceito  
**Data:** 2026-05-01

## Contexto

O dashboard precisa de benchmarks de margem configuráveis (alvo=14%, atenção=12%, crítica=10%) que possam ser ajustados sem novo deploy ou migração. Hardcodar esses valores em constantes TypeScript funcionaria para v1, mas não escala — qualquer mudança exige PR, CI e deploy.

## Decisão

Criar `app.config`: tabela genérica chave-valor com `valor jsonb` no schema `app`.

```sql
CREATE TABLE app.config (
  id            serial PRIMARY KEY,
  chave         text NOT NULL UNIQUE,
  valor         jsonb NOT NULL,
  categoria     text NOT NULL DEFAULT 'geral',
  descricao     text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por text
);
```

**Por que `jsonb` em vez de `numeric`?**  
Permite armazenar no futuro valores complexos (ex: regra de alerta com múltiplos parâmetros, listas, objetos) sem mudar o schema. Para valores numéricos simples, lê com `(valor #>> '{}')::numeric`.

**Acesso:**
- Frontend/Server Components: via RPC `public.get_dashboard_config()` (retorna todos os valores como objeto JSON)
- SQL interno: via `app.get_config_numeric(p_chave)` para leituras unitárias
- Escrita: apenas `service_role` (SQL Editor manual por ora; evoluirá para UI admin em v3.2+)

**Fallback em TypeScript:** `getBenchmarks()` em `src/lib/config.ts` cai nos valores estáticos (`MARGEM_OK=14`, `MARGEM_ALERTA=12`) se a RPC falhar ou retornar vazio.

## Consequências

- **Positivo:** benchmarks ajustáveis sem deploy.
- **Positivo:** estrutura pronta para crescer (outros benchmarks, regras de alerta, parâmetros visuais).
- **Positivo:** `MARGEM_OK`/`MARGEM_ALERTA` continuam como constantes de fallback — sem regressão.
- **Negativo:** leitura adicional ao banco em cada render da página (mitigável com cache em v3.1).
- **Decisão adiada:** UI de edição dos benchmarks — adiada para v3.2 junto com login.
