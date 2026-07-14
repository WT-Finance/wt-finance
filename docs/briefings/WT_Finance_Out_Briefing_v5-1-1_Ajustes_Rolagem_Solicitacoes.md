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

## 2ª rodada de checkpoint (2026-07-14) — pós-preview do Yan

5. **Tooltip da Data limite cortado dentro do modal:** o balão abria à direita e era recortado
   pelo viewport rolável. Fix `!left-auto right-0` (abre à esquerda, padrão `CabecalhoAjuda` do
   Faturamento). Provado por medição DOM (balão 518→742 dentro do viewport 384→896, sem vazar).

6. **Nova Solicitação — texto (clareza do destinatário):** subtítulo →
   "Abra um pedido para um usuário ou para um grupo de usuários" (sem ponto final, como os demais);
   o modo de destinatário **"Permissão" → "Grupo"** (rótulo do toggle + placeholder "Selecione o
   grupo…" + `aria-label`), coerente com "grupo de usuários". **Só rótulo de UI** — o modo interno
   segue `destMode='role'` e a lógica de destinatário/RBAC é intocada.

7. **Colunas de Solicitações — borda do hover cortada + barra colada (BUG visual):** o
   `box-shadow` de realce do hover (`.card-clicavel-neutra`, ring 1px + drop-shadow) do **1º card**
   de cada coluna era cortado no topo pelo `overflow` do viewport (sem `pt`), e o thumb vertical
   (`right-1 w-1.5`, 4–10px da borda) ficava em cima do card (só `px-1`). Fix: viewport
   `pl-1 pr-4 pt-2 pb-2` (`pt-2` = respiro topo p/ o ring; `pr-4` = goteira p/ o thumb) +
   header `mb-1` (compensa o gap). Vale para caixa de entrada e Minhas solicitações; DS atualizado.

8. **Largura total das páginas (pedido: "todas as páginas devem usar toda a largura"):** removido
   o cap `max-w-7xl`/`max-w-5xl mx-auto` de **TODOS** os containers-raiz — 16 páginas/conteúdos
   (Executiva, Performance, Weddings, Metas, Metas/Cadastro, Fluxo de Caixa, Gerencial, Acervo,
   Calculadora de Rateio, Faturamento Corp, Uploads, Solicitações, Admin/Solicitações,
   Movimentações, Acessos, Design System) + **10 skeletons `loading.tsx`** (mantidos em paridade
   com a página, senão saltaria na troca). Preservado o `px-*` (respiro horizontal) e o
   `scrollbar-gutter:stable` do `<main>`. **Convenção atualizada** em CLAUDE.md §Respiro,
   na DS page (`/admin/design-system`) e no comentário do `<main>` (AppShell). `modal-central.tsx`
   (largura de MODAL) e blocos internos estreitos (`max-w-xl` de forms) **não** foram tocados.

**Nota de escopo/tradeoff (item 8):** largura total contradiz a convenção anterior (7xl/5xl por
tipo de tela) — foi decisão de produto explícita do Yan. Em monitores muito largos, dashboards e
tabelas passam a esticar de ponta a ponta; se alguma tela específica ficar esparsa, é ajuste
pontual de `px`/`max-w` por tela (reversível), não reversão da convenção.

## 3ª rodada de checkpoint (2026-07-14) — pós-preview do Yan

9. **Respiro conteúdo↔sidebar vira FONTE ÚNICA no `<main>`** (pedido: "aumentar o respiro à
   esquerda"): o `<main>` do AppShell ganha `px-8` e o `px-4`/`px-6` próprio de cada página é
   **removido** — o respiro horizontal passa a viver num lugar só (como o `py-8` vertical já vivia).
   `SkeletonPagina.container` virou **opcional** (default `''`); os `loading.tsx` deixam de passar
   `px`. **Afinar o gap lateral no futuro = mudar só o `px` do `<main>`**, não 26 páginas.
   Convenção reescrita em CLAUDE.md §Respiro, DS page e comentário do `<main>`. Exceção preservada:
   página que preenche a altura mantém `h-full flex flex-col` no root (Acervo, Solicitações).

10. **Painel de Solicitações preenche a ALTURA** (pedido: "há espaço abaixo não utilizado"): trocado
    o `max-h-[max(18rem,calc(100vh-24rem))]` fixo (offset chumbado que sobrava espaço embaixo) por
    uma **cadeia flex de altura** — página `h-full flex flex-col` → tabpanel `flex-1 min-h-0` →
    board `h-full flex-col` / grid `sm:grid-rows-[minmax(0,1fr)]` → container de colunas
    `flex-1 min-h-0` → coluna `flex flex-col min-h-0` → `<ScrollAutoHide>` (já `flex-1` por dentro).
    As colunas vão até o rodapé do `<main>` e rolam por dentro; em Minhas, o preenchimento é só em
    `≥sm` (no mobile as 3 colunas empilham em altura natural). Vale para Caixa de entrada e Minhas
    solicitações; padrão de "painel em colunas" reescrito no DS. **PROVADO por medição DOM** (cadeia
    real replicada com playwright, viewport 1440×900): `<main>` 900px, container de colunas
    190→868px = **fim exato do `<main>` (gap abaixo = 0px)**, coluna de 12 cards com viewport 651px
    rolando 1030px de conteúdo (`ROLA_INTERNO: true`).
