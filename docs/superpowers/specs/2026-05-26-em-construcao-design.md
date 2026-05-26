# Em Construção — Design Spec

**Data:** 2026-05-26  
**Escopo:** Substituir seções incompletas por banner de construção com acesso via `?preview=1`

---

## Objetivo

Esconder atrás de uma tela neutra as 5 seções ainda não finalizadas do WT Finance, mantendo o sidebar intacto. Usuários autorizados acessam o conteúdo real via `?preview=1` na URL.

---

## Seções afetadas

| Rota | Arquivo |
|------|---------|
| `/executiva` | `src/app/executiva/page.tsx` |
| `/performance` | `src/app/performance/page.tsx` |
| `/performance/trips` | `src/app/performance/trips/page.tsx` |
| `/performance/corporativo` | `src/app/performance/corporativo/page.tsx` |
| `/metas` | `src/app/metas/page.tsx` |

Seções que **não** recebem o banner (já finalizadas): `/performance/weddings`, `/financeiro/fluxo-caixa`.

---

## Arquitetura

### Novos arquivos

**`src/components/shared/em-construcao.tsx`** — Server Component  
Props: `{ children: ReactNode; preview: boolean }`  
- `preview = true` → renderiza `{children}` sem alteração  
- `preview = false` → renderiza o banner de construção (filhos ignorados)  
- Sugestões hardcoded: `[{ label: 'Weddings', href: '/performance/weddings' }]`

**`src/components/shared/preview-button.tsx`** — Client Component (`'use client'`)  
- Usa `usePathname()` para obter a rota atual  
- Renderiza `<a href={pathname + '?preview=1'}>Ver preview →</a>`  
- Não recebe props; constrói o href autonomamente

### Modificação nas páginas afetadas

Cada `page.tsx` afetado:
1. Extrai `preview` do `searchParams`: `const preview = (await searchParams).preview === '1'`
2. Envolve o retorno existente: `return <EmConstrucao preview={preview}>{/* conteúdo atual */}</EmConstrucao>`

O layout de cada seção (sidebar) não é tocado.

---

## Visual do banner

```
┌─────────────────────────────────────────────┐
│                                             │
│                                             │
│               🪖  (HardHat icon)            │
│            zinc-300, 48 × 48px              │
│                                             │
│     Esta seção está em construção           │
│     text-lg · font-medium · text-zinc-500   │
│                                             │
│       Estamos finalizando esta área.        │
│       text-sm · text-zinc-400               │
│                                             │
│             Ver preview →                   │
│     text-sm · text-zinc-400 · underline     │
│     hover: text-zinc-600                    │
│                                             │
│       Você pode estar procurando:           │
│       text-xs · text-zinc-400               │
│       • Weddings  (link /performance/weddings)│
│         text-xs · text-zinc-500 · underline │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

- Layout: `flex flex-col items-center justify-center` com `min-h-[70vh]` e `gap-3`
- Fundo: branco (herda do layout da seção)
- Sem cores de alerta — tom neutro zinc

---

## Comportamento do `?preview=1`

- Qualquer usuário que conhece o param pode acessar o conteúdo real
- Não há autenticação extra — é uma convenção de URL, não um gate de segurança
- O param é passado junto ao `searchParams` das páginas; campos existentes (`preset`, `from`, `to`, etc.) continuam funcionando normalmente porque o App Router os lê individualmente
- Remover `?preview=1` da URL volta ao banner

---

## O que não muda

- Layouts (`layout.tsx`) de nenhuma seção são tocados
- Sidebar permanece 100% funcional em todas as rotas
- As rotas de Weddings e Fluxo de Caixa não recebem `EmConstrucao`
