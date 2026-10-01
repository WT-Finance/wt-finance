# Spec v6.1.1 — Ajustes de navegação, cabeçalho de Performance e Exportar do DRE

Patch pedido pelo Yan em 01/10/2026 (rota A/B sem briefing de Chat: o pedido é o escopo; as
decisões de produto abaixo foram tomadas por ele na abertura). Aprovação antecipada do plano.

## Escopo

### M1 — Grupo "Ingestão de Dados" na sidebar
- Item-pai `/admin/ingestao` ("Ingestão de Dados") com duas subabas, mesmo molde de
  `PERFORMANCE_SUBS` (subaba com o mesmo href do pai é suportada):
  - **Upload de Arquivos** → rota nova `/admin/ingestao/upload` (página movida de `/admin/uploads`).
  - **Log de Ingestão** → `/admin/ingestao` (inalterada — o link do e-mail do vigia e a mensagem do
    cliente da RPA continuam valendo).
- `/admin/uploads` e `/admin/uploads/financeiro` ficam como redirect para `/admin/ingestao/upload`.
- O card **"Sincronização Monde"** sai do fim do Upload de Arquivos e passa a ser exibido no
  **Log de Ingestão** (mesmos dados — `monde_ingest_status` — e mesmo visual).
- Área RBAC inalterada (`admin/uploads`).

### M2 — "Última atualização em…" alinhado ao título em Performance
- Hoje o `<h1>` mora em `src/app/performance/layout.tsx` e o selo no conteúdo (árvores diferentes),
  por isso fica numa linha abaixo. Passa a seguir o padrão do DRE (`src/app/financeiro/dre/page.tsx`):
  título à esquerda e selo(s) à direita, `flex-wrap justify-between`.
- Cobre Geral/Trips/Corporativo (`PerformanceContent`) e Weddings (`WeddingsContent`, 2 selos). O
  título não pode sumir na tela "em construção" nem no `loading.tsx`.

### M3 — "API Externa" como seção própria da sidebar, com área RBAC própria
- Item-pai `/admin/api-externa` ("API Externa") com subabas **Chaves** (`/admin/api-externa`) e
  **Documentação** (`/admin/api-externa/documentacao`). Rotas inalteradas.
- **Decisão do Yan:** saem os DOIS atalhos de dentro de Solicitações (pill "API externa" em Gerenciar
  solicitações e pill "Documentação API" em Solicitações). Acesso só pela sidebar.
- **Decisão do Yan:** área RBAC própria (`api-externa`) no lugar de `solicitacoes` para a gestão de
  chaves/config da API. Migration aditiva 0289: área nova em `app.rbac_areas`, concessão da área a
  quem hoje tem `solicitacoes` (ninguém perde acesso no deploy) e RPCs exclusivas da API externa
  reescritas a partir da definição viva para exigir a área nova. RPCs compartilhadas com a tela de
  Solicitações não perdem `solicitacoes`. Detalhe fechado na missão, após o mapa de RBAC.

### M4 — Botão "Exportar" no DRE (Competência e Fluxo de Caixa)
- Ao lado de "Ver em tela cheia" (componente único `tabela-dre.tsx`, serve os dois regimes).
- Excel `.xlsx` gerado no cliente (`@e965/xlsx`, import dinâmico), **sempre com todas as linhas
  expandidas** (blocos + todas as categorias + bandeja "Não classificadas").
- **Decisão do Yan:** duas abas sempre — **Mensal** (ano em tela) e **Consolidado** (anos marcados),
  no modo (realizado/previsto/tudo) em tela.
- Números crus (não texto formatado), ausência = célula vazia (não 0), AV como percentual.

## Fora do escopo (registrado)
- **EBITDA no DRE por Competência** — adiado pelo Yan (discussão interna). Achado: não há conta de
  Depreciação/Amortização no plano da Competência; a proposta levantada foi EBITDA = LOP − FIN
  (bloco `tot` em `financeiro.dre_comp_bloco`, migration só de dado).
- Pendências antigas que a memória chamava de "v6.1.1" (split de `puladas[].ids` no cliente da RPA,
  registro do GATE etapa 2) ficam para o próximo patch.

## Gates
`npx tsc --noEmit` + `npm run lint` por missão; `npm run build` + `npm test` no fechamento;
revisor (sempre), revisor-db (M3), verificador-visual (UI).
