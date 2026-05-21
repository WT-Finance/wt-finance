# ADR-0040 — Sistema de tokens CSS semânticos

**Status:** Aceito  
**Data:** 2026-05-19  
**Versão:** v3.7-M2

## Contexto

Antes da v3.7, as cores do dashboard eram definidas diretamente nas classes Tailwind dos componentes (`text-emerald-600`, `bg-red-50`, `border-amber-400`, `text-zinc-400`). Isso criava três problemas:

1. **Inconsistência** — a mesma semântica (ex: "erro") aparecia com tons diferentes em componentes distintos
2. **Acoplamento** — mudar a paleta exigia busca e substituição em dezenas de arquivos
3. **Ausência de identidade por aba** — a cor de marca era fixa; não havia como distinguir visualmente Weddings de Trips

## Decisão

Criar `src/styles/tokens.css` com três camadas de tokens, importado em `globals.css`:

**Camada 1 — Tokens globais** (texto, superfície, borda):
```css
--text-primary, --text-muted, --text-subtle
--surface, --surface-soft, --surface-strong
--border, --border-strong
```

**Camada 2 — Tokens de feedback** (semântica de resultado):
```css
--success / --success-bg   (#4F8E54 / #E8F0E4)
--warning / --warning-bg   (#D9A23F / #FAEFD5)
--danger  / --danger-bg    (#B85C5C / #F5DDDD)
```

**Camada 3 — Token de marca por aba** (via `data-theme`):
```css
[data-theme="weddings"]    → --brand: #BD965C (âmbar)
[data-theme="trips"]       → --brand: #0091B3 (teal)
[data-theme="corporativo"] → --brand: #75777B (cinza)
```

Todos os tokens registrados no `@theme inline` de `globals.css` como `--color-*` para que Tailwind gere as utilities (`text-success`, `bg-warning-bg`, `border-danger`, etc.).

## Consequências

- Mudança de paleta requer alteração apenas em `tokens.css`
- Componentes usam nomes semânticos, não valores hardcoded
- A cor de marca muda automaticamente conforme o usuário navega entre abas (sem re-render de componentes)
- Tailwind v4 exige que os tokens estejam em `@theme inline` — não há `tailwind.config.ts`
