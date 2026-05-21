# ADR-0051 — "Ver mais": drawer para listas compactas

**Status:** Aceito  
**Data:** 2026-05-20  
**Versão:** v3.8-M8

## Contexto

Listas compactas (Próximos Casamentos, Mix por Produto, Vendas em Aberto, Vendas com Receita Negativa) precisavam de um mecanismo para expor todos os itens sem ocupar espaço permanente na página.

Opções consideradas:
- **Expandir inline**: aumenta altura do card dinamicamente — causa layout shift, quebra o grid.
- **"Ver todos (N)"**: abre expansão na mesma área — mesmo problema de layout shift.
- **Drawer lateral**: overlay + panel slide-in 280ms — contexto preservado, zero impacto no layout.

## Decisão

Padronizar como "Ver mais" (sem contagem) que abre um `ListDrawer` lateral.

O botão mostra apenas "Ver mais" — sem número — para evitar inconsistências quando o total muda com filtros de período.

`ListDrawer` é um componente compartilhado em `src/components/shared/list-drawer.tsx` que segue o mesmo padrão do `KpiDetailDrawer` existente:
- Overlay semitransparente com clique para fechar
- Panel slide-in da direita (280ms cubic-bezier)
- Fechar com Esc, X, ou overlay
- Body scroll lock enquanto aberto

O conteúdo do drawer é passado via `children` — totalmente flexível.

## Consequências

- Zero layout shift ao expandir listas.
- Padrão reutilizável para qualquer lista compacta futura.
- Consistência visual com os drawers de KPI histórico já existentes.
- A contagem no header do drawer ("X casamentos") dá o contexto necessário sem expô-la no botão.
