# ADR-0048 — Cabeçalho de seção: Opção B

**Status:** Aceito  
**Data:** 2026-05-20  
**Versão:** v3.8-M2

## Contexto

Os cabeçalhos de seção (`TopSection`) precisavam de um tratamento visual que comunicasse hierarquia sem competir com o conteúdo dos cards. Duas opções foram consideradas:

- **Opção A**: texto simples com divisor horizontal (discreto, sem cor)
- **Opção B**: fundo `--brand-soft` + borda esquerda `--brand` + texto `--brand-deep` em Heavy uppercase (ativa, imediata)

## Decisão

Opção B: barra colorida com fundo suave da marca.

```
bg-[--brand-soft]  border-l-4 border-[--brand]  px-6 py-[18px]
font-[800] uppercase tracking-[1.5px] text-[14px] color: var(--brand-deep)
chevron rotacionado (0° fechado → 90° aberto)
```

O componente foi extraído para `src/components/shared/top-section.tsx` e reutilizado em toda a aba Weddings e em `performance-content.tsx`.

## Consequências

- Hierarquia visual clara entre seções recolhíveis e cards.
- Cor de destaque muda automaticamente conforme o setor (`data-theme`) — Weddings âmbar, Trips teal, Corporativo cinza escuro.
- O componente compartilhado garante consistência. Customizações futuras (ex: ícone por seção) são feitas no componente, não em cada uso.
