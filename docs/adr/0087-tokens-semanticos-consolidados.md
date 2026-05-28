# ADR-0087 — Tokens semânticos consolidados

**Status:** Aceito  
**Data:** 2026-05-28  
**Contexto:** Cores de subsetores Weddings hardcoded em componentes desde v4.4. Duplicação entre `sumario-subsetor.tsx`, `weddings-kpis-section.tsx` e qualquer componente futuro que precise das mesmas cores. Ausência de catálogo visual de referência para desenvolvimento.

## Decisão

Centralizar tokens visuais em `src/styles/tokens.css` com nomenclatura semântica. Criar página `/admin/design-system` como catálogo visual de referência.

## Tokens adicionados

```css
/* Cores semânticas dos subsetores Weddings */
--subsetor-comercial:    #8C857B;  /* taupe quente */
--subsetor-planejamento: #8F7E35;  /* ocre/musgo */
--subsetor-producao:     #874B52;  /* vinho suave */
--subsetor-hospedagens:  #4B4F54;  /* cinza azulado escuro */
--subsetor-extras:       #7A8289;  /* cinza azulado médio */
```

## Convenção de nomenclatura

Padrão: `--{categoria}-{nome}[-{variante}]`

Categorias existentes:
- `--brand` — dourado Welcome (#BD965C)
- `--positive` — verdes (entradas, saldo positivo); variantes `-soft`, `-deep`
- `--negative` — vermelhos (saídas, saldo negativo); variantes `-soft`, `-deep`
- `--neutral` — dourado pálido (atenção, hoje); variante `-soft`
- `--danger` — terracota visível (pontos negativos em gráficos, #B85C5C)
- `--subsetor` — cores específicas por subsetor Weddings (novo nesta versão)

Variantes:
- `-soft`: mais claro (~15-30% saturação) — fundos de badge
- `-deep`: mais escuro (~70-90% saturação) — texto sobre fundo soft

## Catálogo visual

Página `/admin/design-system` renderiza todos os tokens com swatch de cor e valor hex. Acesso administrativo apenas — invisível para usuárias do produto.

## Justificativa

Cores hardcoded em componentes: (1) duplicam código, (2) inviabilizam ajuste centralizado, (3) não são descobríveis sem ler o código fonte. Tokens semânticos resolvem os três problemas. Catálogo visual reduz fricção para o desenvolvedor — consulta a página em vez de inferir padrões dos componentes.
