# ADR-0057 — Ícones nas sub-abas Performance

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v3.10-m1

## Contexto

As 4 sub-abas de Performance (Geral, Trips, Weddings, Corporativo) não tinham identidade visual diferenciada além do texto — idênticas em aparência, só variando o label.

## Decisão

Adicionar ícones Lucide React a cada sub-aba:

| Sub-aba     | Ícone Lucide | Justificativa |
|-------------|--------------|---------------|
| Geral       | Building     | Tom institucional, agregação de todos os setores |
| Trips       | Plane        | Padrão consagrado para viagens |
| Weddings    | Sparkles     | Celebração sofisticada |
| Corporativo | Briefcase    | Padrão B2B em ferramentas corporativas |

Tamanho 14px, stroke 1.8. Cor inativa: `text-zinc-400`. Cor ativa: `var(--brand)` via inline style (mesma convenção dos outros ícones da sidebar).

## Consequências

- Identificação visual rápida das sub-abas
- lucide-react já é dependência do projeto (sem nova dep)
- Padrão extensível para futuras sub-abas
