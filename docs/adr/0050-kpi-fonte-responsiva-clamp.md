# ADR-0050 — KPI: fonte responsiva via clamp()

**Status:** Aceito  
**Data:** 2026-05-20  
**Versão:** v3.8-M5

## Contexto

Os KPI cards usavam `text-3xl` (30px fixo) para o valor principal. Em telas menores (ex: grid de 6 colunas em tablet), valores longos como "R$ 1.234.567" transbordavam ou ficavam truncados.

## Decisão

Substituir `text-3xl` por `font-size: clamp(20px, 2.5vw, 32px)`.

- Mínimo: 20px (legível em qualquer dispositivo)
- Ideal: 2.5vw (proporcional à largura da tela)
- Máximo: 32px (sem crescer demais em telas largas)

Aplicado via `style` inline no elemento de valor, já que Tailwind v4 não suporta `clamp()` sem um plugin adicional.

Adicionalmente, as zonas do card foram fixadas em altura mínima para evitar layout shift:
- Label: `h-5 flex items-start`
- Valor: `min-h-16 flex items-center`
- Nota proporcional: `h-4` (sempre presente, conteúdo condicional)
- Comparações: `min-h-12 space-y-0.5` (linhas com `h-4 overflow-hidden`)

## Consequências

- Valores numéricos longos não transbordam em grids compactos.
- Layout dos cards é estável independente do tamanho do valor — sem layout shift ao trocar filtros.
- `clamp()` é suportado em todos os browsers modernos.
