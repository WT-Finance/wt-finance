# ADR-0084 — Modelo de versionamento X.Y.Z

**Status:** Aceito  
**Data:** 2026-05-27  
**Contexto:** v4.3 adotava apenas major.minor na sidebar. Versões foram escalando sem semântica clara.

## Decisão

Adotar versionamento semântico tridimensional MAJOR.MINOR.PATCH (X.Y.Z) como padrão formal do projeto. Aplicação incremental: versões anteriores ficam como estavam (reclassificadas retroativamente como referência), nova convenção começa em v4.4.0.

## Semântica adotada

```
MAJOR (X) — quebra de premissa de domínio
  Novo domínio do produto ou mudança estrutural
  Usuário precisa reaprender mental model
  Cadência: 6 a 18 meses
  Exemplos: introdução de Aba Performance (v1→v2), Aba Financeiro (v3.10→v4.0)

MINOR (Y) — nova capacidade ou reformulação significativa
  Adiciona ADR formal, briefing .docx, migrations, novos componentes
  Cadência: 2 a 4 semanas
  Exemplos: v4.1 (Abordagem B), v4.2 (feedback Weddings), v4.3 (reformulação visual)

PATCH (Z) — correção, polimento ou ajuste sem decisão nova
  Sem ADR, sem migration semântica, sem briefing formal
  Cadência: dias após uma minor, ou conforme bugs aparecem
  Exemplos: hotfixes pós-merge, correções de cadastro, polimento visual
```

## Exposição na UI

Sidebar exibe versão completa MAJOR.MINOR.PATCH (ex: 'version 4.4.0'). Componente lê dinamicamente de `package.json`.

## Changelog

Registrado em `CHANGELOG.md` na raiz do repositório, formato Keep-a-Changelog (seções Adicionado / Alterado / Corrigido / Removido).

## Justificativa

Versionamento claro disciplina internamente a separar mudanças por natureza. Aplicação incremental (Caminho C) evita custo de reescrita retroativa.

## Referência histórica (reclassificação retroativa)

| Versão (tag antiga) | Reclassificação X.Y.Z | Tipo de mudança |
|---|---|---|
| v3.10 | 3.10.0 | MINOR — nova Aba Financeiro introduzida |
| v4.0 | 4.0.0 | MAJOR — Aba Financeiro completa (Fluxo de Caixa v1) |
| v4.0.1 | 4.0.1 | PATCH — correções pós-deploy |
| v4.0.2 | 4.0.2 | PATCH — polimento visual |
| v4.1.0 | 4.1.0 | MINOR — Fluxo de Caixa Abordagem B (regime caixa-banco) |
| v4.2.0 | 4.2.0 | MINOR — Feedback gestora Weddings; KPIs e Composição por Subsetor |
| v4.3.0 | 4.3.0 | MINOR — Reformulação visual Fluxo de Caixa; CalendárioLiquidez |
