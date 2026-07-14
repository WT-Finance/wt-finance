# Out-briefing — v5.1.1 · Correções de rolagem + ajustes de Solicitações

**Tipo:** PATCH · **SEM migration** · **Sem ADR** (correção + refinos; padrão registrado no DS) · base main @ v5.1.0

## Itens (pedidos do Yan, checkpoint pós-v5.1.0)

1. **Modal de Nova Solicitação vazando sem barra (BUG, regressão da v5.0.0).**
   - **Causa-raiz:** a migração das barras (v5.0.0) trocou o corpo do `ModalCentral` por
     `<ScrollAutoHide>`, cujo viewport usava **`h-full`**. Porcentagem de altura não resolve
     quando o ancestral tem altura **INDEFINIDA** — exatamente o painel default do `ModalCentral`
     (`max-h-[85vh]`, sem `h`). O viewport crescia até o conteúdo e vazava do painel. (Os casos
     com altura DEFINIDA — drawers `inset-y-0`, modais `alturaFixa` — funcionavam, por isso o
     histórico de versões não quebrou.)
   - **Fix (no primitivo):** o viewport dimensiona por **cadeia flex** — wrapper
     `flex flex-col` + viewport `flex-1 min-h-0` (fim do `h-full`). Vale para os dois regimes
     (altura definida OU `max-h`) e, em fluxo normal, degrada para altura de conteúdo.
     **PROVADO por medição DOM** (playwright na estrutura real): painel 680px (85vh), viewport
     597px rolando 1424px de conteúdo, `vazou: false`.
   - **Modal com tamanho fixo:** `alturaFixa` no `ModalCentral` da Nova Solicitação — não
     "pula" quando o Tipo troca os campos dinâmicos.

2. **Acervo — botões colados na barra:** `pr-5` no viewport da lista (respiro entre
   download/excluir e a barra overlay).

3. **Painéis de Solicitações em colunas — barra própria por coluna + header fixo** (caixa de
   entrada `board-solicitacoes` e Minhas solicitações `minhas-solicitacoes`): header da coluna
   (título + contagem) FORA do scroll; cards rolam por dentro com
   `<ScrollAutoHide className="max-h-[max(18rem,calc(100vh-24rem))] px-1 pb-1" contentClassName="space-y-2">`.
   Altura viewport-relativa com piso de 18rem; o container horizontal do board mantém a barra
   nativa (afordância de "há mais colunas"). **Registrado no DS** como padrão "painel em colunas".
   Medição DOM: coluna 416px (`calc(100vh-24rem)` @ 800px) rolando 686px, header fixo.

4. **"?" na Data limite** (Nova Solicitação): dica on-hover "Data limite para resposta da
   solicitação. Prazo padrão de 3 dias." — mesmo padrão de "?" dos cabeçalhos do Faturamento
   (v4.38), via primitivo `Tooltip` com `!whitespace-normal`.

## Arquivos
`src/components/shared/scroll-auto-hide.tsx` (fix raiz) · `src/components/solicitacoes/modal-nova-solicitacao.tsx`
(alturaFixa + "?") · `board-solicitacoes.tsx` / `minhas-solicitacoes.tsx` (colunas) ·
`src/components/financeiro/acervo-documentos.tsx` (pr-5) · `docs/design-system.md` (padrões) ·
version/CHANGELOGs.

## Gates
`npx tsc --noEmit` 0 · `npx eslint <arquivos>` 0 · `npx next build` OK · `npx vitest run` 402 verdes.
Verificação por **medição DOM real** (estrutura do modal + coluna replicadas com o CSS buildado;
números acima) — o SSR não renderiza `ModalCentral` (portal), por isso a prova foi via DOM.

## Aprendizado (DS, sem CLAUDE.md — específico do primitivo)
`h-full` em viewport de scroll é armadilha: só funciona sob altura DEFINIDA. Cadeia flex
(`flex-col` → `flex-1 min-h-0`) cobre definida E `max-h`. Registrado no DS §Barras de rolagem
("Dimensionamento do viewport") para não reintroduzirem.
