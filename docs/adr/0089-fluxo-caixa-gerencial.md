# ADR-0089 — Fluxo de Caixa Gerencial

**Status:** Aceito  
**Data:** 2026-05-28  
**Contexto:** O ERP da Welcome apresenta erros sistêmicos no contas a pagar e a receber, exigindo curadoria manual antes de qualquer análise de fluxo de caixa futuro. Hoje essa curadoria vive em planilha Excel local, inacessível de forma centralizada e desconectada da plataforma.

## Decisão

Criar terceira seção colapsável na sub-aba Fluxo de Caixa, denominada "Fluxo de Caixa Gerencial", com modelo de dados próprio persistente. Solução transitória até o ERP resolver seus problemas sistêmicos — mas projetada para uso ativo por anos.

## Estrutura

```
Fluxo de Caixa
  ├─ ▼ Visão Geral
  ├─ ▼ Fluxo de Caixa Diário       [dados do ERP via raw.fluxo_caixa_titulos]
  └─ ▼ Fluxo de Caixa Gerencial    [dados curados manualmente — esta feature]
       ├─ Tab 1: Visualização Agregada
       └─ Tab 2: Base de Dados
```

## Modelo de dados

Duas tabelas em `analytics`:
- `gerencial_lancamentos`: lançamentos curados (origem='planilha' ou 'manual')
- `gerencial_saldos`: saldos iniciais editáveis por conta (Itaú, Asaas, Blimboo, Clara)

## Decisões-chave

- **Modelo independente** — não overlay sobre `raw.fluxo_caixa_titulos`
- **Importação inteligente** — mesclagem por chave (tipo+pessoa+valor_final+vencimento); preserva manuais; preview de diff antes de confirmar
- **Edição inline** — CRUD completo via Server Actions; last-write-wins
- **Saldos manuais** — não sincronizam com `dim_conta_bancaria` nesta versão
- **Sem auditoria por usuário** — primeira versão minimalista
- **Status 'Conferido' ignorado** — curadoria acontece antes do upload

## Cálculo da Visualização Agregada (espelha planilha)

```
Saldo Itaú(d) = Saldo Itaú(d-1) + Resultado(d)
Saldo Consolidado(d) = Saldo Itaú(d) + Saldo Asaas + Saldo Blimboo
Saldo Consolidado+Clara(d) = Saldo Consolidado(d) + Saldo Clara
```

## Justificativa

Trazer o workflow de curadoria para dentro da plataforma traz: (1) acesso multi-usuário centralizado, (2) visualização integrada com outras vistas, (3) primeira capacidade de escrita persistente, abrindo caminho para futuras features com persistência de decisões humanas.
