# Out-briefing — v5.1.0 · Modo TV (Metas na parede do comercial)

**Tipo:** MINOR · **SEM migration** · **ADR:** 0148 · base main @ v5.0.1

## O que entrou
Uma **pele de exibição** do Acompanhamento de Metas numa rota irmã `/metas/tv`: tela única
16:9, tema claro, **zero interação**, para a TV da sala do comercial. Group + 3 setores numa
só tela, com a barra na cor do setor + a seta do esperado + o "% da meta" colorido pela mesma
régua do app. Desenho fechado por mockup v7 (checkpoint do Yan valida na TV real).

## Missões
- **M1 — Rota e fonte única.** Orquestração de dados extraída de `src/app/metas/page.tsx` para
  `src/lib/metas/carregar-acompanhamento.ts` (server-only), consumida por `/metas` E `/metas/tv`
  — **sem terceiro caminho** (mesmos `get_executiva_kpis` ×4 + `metas_listar` + `calcularRitmo`;
  Group computado). `corComparacao` extraída p/ `src/lib/metas/cor-comparacao.ts`. Rota
  `/metas/tv` (Server Component) com guard `['metas/acompanhamento','metas']` + `loading.tsx`.
- **M2 — A tela.** `tv-tela.tsx`: cabeçalho (JANUS + "Metas · {período}" + "Atualizado em
  {fmtDataHoraLongoSP}" + "Sair do modo TV"); faixa GROUP (valor + "Meta do mês" + barra neutra
  com seta + "% da meta" colorido); 3 cards setoriais (label na cor do setor; valor + "% da
  meta" colorido; "de R$ {meta}"; barra na cor do setor com seta); legenda fixa no rodapé. SEM
  margem/receita/tooltip/pills. **Contratos não aparece** (o usuário TV não tem
  `performance/weddings`; 3 cards simétricos).
- **M3 — Seta + cor (reuso).** `<MetaProgressBar>` ganhou `mostrarTooltip` (TV = false → só
  trilha+preenchimento+seta) e `setaEscala` (amplia a seta p/ a parede, mesmo desenho/tom).
  "% da meta" pela `corComparacao` reusada (≥0 verde · até −3 âmbar · <−3 vermelho).
- **M4 — Refresh + botão.** `TvAutoRefresh` (client isolado, `router.refresh()` ~10min, INTERIM
  descartável). Botão "Modo TV" (ícone de monitor) no cabeçalho do Acompanhamento → `/metas/tv`
  mantendo `?periodo=`. "Sair do modo TV" na própria TV. **Sidebar intocada.**
- **M5 — Fechamento.** v5.1.0; CHANGELOG; CHANGELOG_DIRETORIA; ADR-0148; DS doc (padrão "tela de
  exibição/quiosque"); este out-briefing.

## Como o "sem AppShell" foi feito (nota de arquitetura)
O AppShell é montado no **layout raiz** (não há route group para o chrome). Escapar por route
group exigiria múltiplos root layouts (mover toda rota) — grande e arriscado. Optou-se pelo
mínimo: `AppShell` (client) e `WelcomeJanusModal` fazem `usePathname()` e, em `/metas/tv`,
renderizam sem chrome. **Proxy/auth e Sidebar intocados.** (ADR-0148.)

## Gates
`npx tsc --noEmit` 0 · `npx eslint <arquivos>` 0 · `npx next build` OK (`/metas/tv` rota
dinâmica ƒ) · `npx vitest run` **402 verdes**. SEM migration. Verificação visual por **screenshot
SSR a 1920×1080** (os 3 estados de cor do "% da meta": Trips verde, Weddings âmbar, Corporativo
vermelho; seta na posição do esperado; legenda no rodapé; "Atualizado em …").

## Checkpoint do Yan (antes do merge)
Abrir `/metas/tv` num 1920×1080 (idealmente na TV) logado no "TV Comercial"; conferir paridade
com o Acompanhamento (números idênticos no mesmo período); cor do "% da meta" nos 3 estados;
seta; legenda; "Atualizado em …" com data real; auto-refresh; botão "Modo TV" e o "sair";
sidebar sem item novo; "está legível do fundo da sala?".

## Operacional (Yan)
- **Criar o usuário "TV Comercial"** no Usuários & Acessos (só `metas/acompanhamento`); login
  manual único no navegador da TV; deixar `/metas/tv` como página inicial/bookmark.
- Pendências herdadas da v5.0 (não bloqueiam): % Rec no Cadastro (sem eles o "% da meta" mostra
  "—" na TV também); SMTP_* na Vercel; follow-up do contrato de `solicitar_acesso_admin`.

## Fronteira (versão seguinte)
A **API** trará o **tempo-real** (substitui o auto-refresh interim) — primeiro definir O QUE
expõe e QUEM consome (ler de fora × ser lido de fora). NADA de API nesta versão.
