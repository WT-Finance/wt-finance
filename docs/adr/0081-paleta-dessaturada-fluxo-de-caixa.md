# ADR-0081 — Paleta dessaturada para Fluxo de Caixa

**Status:** Aceito  
**Data:** 2026-05-27  
**Contexto:** Finanças genéricas usam verde saturado (#00C853) e vermelho saturado (#F44336). Esses tons não harmonizam com o design system Welcome (dourado Pantone 465 C, terrosos, zinc). O v4.2 usava azul-petróleo e dourado para entradas/saídas, sem tokens semânticos.

**Decisão:** Adotar paleta de verde e vermelho dessaturados, adicionando tokens semânticos ao design system (Forma B). Tokens adicionados em `src/styles/tokens.css` `:root`:

```
--positive:       #5F7A3D;  /* verde sage, harmônico com dourado Weddings */
--positive-soft:  #C4D5A6;  /* verde claro para fundos */
--positive-deep:  #3F5028;  /* verde escuro para acentos */
--negative:       #A35442;  /* terracota dessaturada */
--negative-soft:  #E8C9C0;  /* rosa terra claro para fundos */
--negative-deep:  #6B2D1F;  /* bordô para pontos de Resultado negativo */
--neutral:        #C99E5E;  /* dourado pálido derivado do brand */
--neutral-soft:   #F5E6CC;  /* amarelo claro para zonas neutras */
```

**Aplicação:**
- Barras de Entrada: `var(--positive)`, `fillOpacity` 1 (efetivada) ou 0.45 (prevista)
- Barras de Saída: `var(--negative)`, mesma lógica
- Linha Resultado mensal: `var(--text-primary)`, pontos negativos `var(--negative-deep)`
- Células do Calendário: `var(--positive-soft)` / `var(--neutral-soft)` / `var(--negative-soft)`
- KPIs com sinal: valor verde com `var(--positive)`, valor vermelho com `var(--negative)`

**Justificativa:** Tokens permitem mudança de saturação em iteração futura sem refatorar componentes. Verde sage + terracota são harmônicos com a paleta existente e menos agressivos visualmente.

**Risco:** Usuárias acostumadas a financeiro tradicional podem achar "sem energia". Mitigação: se feedback negativo, ajustar saturação via tokens sem tocar nos componentes.
