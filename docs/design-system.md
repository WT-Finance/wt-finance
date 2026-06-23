# WT Finance — Design System

**Versão:** 4.26 · Jun 2026

> **Referência VIVA:** a página `/admin/design-system` reflete o código real (tokens, gráficos e estilos de plataforma importados de verdade). Cor é **SEMPRE via token** — cor crua do Tailwind ou hex em classe **quebram o lint** (`wt/no-cor-hardcoded`, ADR-0129); `zinc` é permitido; `src/lib/email` é isento. Primitivos canônicos em `src/components/ui/` (`Button`, `Input`/`Select`/`Textarea`, `Badge`, `Tabs`, `Tooltip`, `Card`, `Checkbox`). Micro-texto: `text-2xs` (11px) / `text-3xs` (10px).

## Tokens CSS

Os tokens são declarados em `src/styles/tokens.css` e importados em `src/app/globals.css`. Estão disponíveis como variáveis CSS (`var(--brand)`) e como classes Tailwind (`bg-brand`, `text-brand`, etc.).

### Texto

| Token CSS      | Valor     | Uso                          |
|---------------|-----------|------------------------------|
| `--text-primary` | `#2D2A26` | Títulos, valores principais  |
| `--text-muted`   | `#75777B` | Labels, subtítulos           |
| `--text-subtle`  | `#ACA39A` | Metadados, placeholders      |

Classes Tailwind: `text-text-primary`, `text-text-muted`, `text-text-subtle`

### Superfícies

| Token CSS          | Valor     | Uso                          |
|-------------------|-----------|------------------------------|
| `--surface`        | `#FFFFFF` | Fundo de cards               |
| `--surface-soft`   | `#F5F1EB` | Fundo da plataforma          |
| `--surface-strong` | `#FAF6EF` | Hover, destaque sutil        |

Classes Tailwind: `bg-surface`, `bg-surface-soft`, `bg-surface-strong`

### Bordas

| Token CSS          | Valor     | Uso                          |
|-------------------|-----------|------------------------------|
| `--border`         | `#E8E0D2` | Bordas de cards              |
| `--border-strong`  | `#D4C8B4` | Bordas com ênfase            |

Classes Tailwind: `border-wt-border`, `border-wt-border-strong`

### Brand (dinâmico por aba)

O token `--brand` muda conforme a aba ativa via `data-theme` no elemento `<html>`.

| Aba           | `--brand`   | `--brand-soft` | `--brand-deep` |
|--------------|-------------|----------------|----------------|
| Weddings      | `#BD965C`   | `#FBF1E1`      | `#8F7E35`      |
| Trips         | `#0091B3`   | `#D9EEF5`      | `#005670`      |
| Corporativo   | `#0D5257`   | `#DDE7E9`      | `#072F33`      |
| Group (plat.) | `#75777B`   | `#EAE6DD`      | `#4B4F54`      |

Classes Tailwind: `bg-brand`, `text-brand`, `border-brand`, `bg-brand-soft`, `bg-brand-deep`

### Feedback (terrosos refinados)

| Estado   | Texto (`--*`)  | Fundo (`--*-bg`) | Quando usar                         |
|---------|----------------|-----------------|--------------------------------------|
| Positivo | `#4F8E54`     | `#E8F0E4`       | Crescimento, margem alta (≥15%)     |
| Alerta   | `#D9A23F`     | `#FAEFD5`       | Margem média (10–15%), atenção      |
| Negativo | `#B85C5C`     | `#F5DDDD`       | Queda, margem baixa (<10%), prejuízo |

Classes Tailwind: `text-success`, `bg-success-bg`, `text-warning`, `bg-warning-bg`, `text-danger`, `bg-danger-bg`

---

## Tipografia

Fonte oficial: **Avenir LT Std** (auto-hospedada em `public/fonts/avenir/`).
Stack de fallback: `'Avenir LT Std', 'Avenir Next', 'Inter', Arial, sans-serif`

| Uso               | Peso Avenir   | CSS weight | Tamanho   |
|------------------|--------------|-----------|-----------|
| Display (KPI)     | 85 Heavy     | 800       | 32–40px   |
| Heading 1 (seção) | 85 Heavy     | 800       | 20–22px   |
| Heading 2         | 65 Medium    | 600       | 18px      |
| Title (card)      | 65 Medium    | 600       | 16px      |
| Body strong       | 55 Roman     | 500       | 14–15px   |
| Body              | 45 Book      | 400       | 14px      |
| Numeric (tabelas) | 55 Roman     | 500       | 14px      |
| Subtitle/Caption  | 45 Book      | 400       | 12–13px   |

---

## Padrão de cards (ADR-0041)

```tsx
import { Card } from '@/components/ui/card'

<Card title="Nome do componente" subtitle="Descrição do conteúdo">
  {/* conteúdo */}
</Card>
```

Especificações:
- Background: `--surface` (#FFFFFF)
- Border: 1px solid `--border`
- Border-radius: 10px
- Padding: 24px horizontal, 20px vertical (`px-6 py-5`)
- Shadow: `0 1px 3px rgba(45,42,38,0.04)`
- Title: font-weight 600, 16px, `--text-primary`
- Subtitle: font-weight 400, 13px, `--text-muted`

---

## Seções recolhíveis

Apenas as 2 grandes seções mantêm comportamento recolhível (ADR-0042):
- **Visão Geral** (`TopSection`)
- **Visão Analítica por Operação** (`TopSection`)

Cards individuais ficam sempre visíveis.

`TopSection` usa padrão de alta visibilidade (chevron 20px, bold, fundo `--brand-soft`, faixa lateral `--brand`).
