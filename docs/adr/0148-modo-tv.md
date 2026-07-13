# ADR-0148 — Modo TV (pele de exibição do Acompanhamento de Metas)

- **Status:** aceito (v5.1.0)
- **Data:** 2026-07-13
- **Tipo:** MINOR · SEM migration · base main @ v5.0.x

## Contexto

O comercial quer as metas do mês numa TV na parede da sala, atualizando conforme vende.
O Acompanhamento de Metas (`/metas`, v5.0) já tem todo o dado e a linguagem visual (barra
na cor do setor + seta do esperado + "% da meta" colorido pela régua). Faltava uma forma de
**exibir** isso em tela cheia, sem interação e sem o chrome do app.

## Decisão

Uma **pele de exibição** — rota irmã `/metas/tv` — sobre os MESMOS dados. Não é um dashboard
novo; é o app escalado para a parede e despido de interação.

1. **Fonte única — sem terceiro caminho.** A orquestração de dados do Acompanhamento
   (`get_executiva_kpis` ×4 + `metas_listar` + `calcularRitmo`; Group = soma computada) foi
   **extraída** de `src/app/metas/page.tsx` para `src/lib/metas/carregar-acompanhamento.ts`,
   consumida por DOIS lugares: `/metas` e `/metas/tv`. Os números batem por construção (mesmo
   motor). Nenhuma RPC nova, nenhum cálculo duplicado. `corComparacao` também foi extraída para
   `src/lib/metas/cor-comparacao.ts` (reusada pelo card e pela TV).

2. **Sem AppShell via curto-circuito por pathname (não por route group).** O AppShell é
   montado no **layout raiz** (`app/layout.tsx`), condicional a sessão — não há route group
   para o chrome. Escapar dele por route group exigiria múltiplos root layouts (mover TODA
   rota para um grupo) — restruturação grande e arriscada. Optou-se pelo mínimo não-invasivo:
   o `AppShell` (client) faz `usePathname()` e, em `/metas/tv`, renderiza `{children}` **sem o
   chrome**; o `WelcomeJanusModal` idem (null em `/metas/tv`). **Proxy/auth e a Sidebar ficam
   intocados.** A tela ocupa o viewport por si (`h-screen`), sem Fullscreen API.

3. **Auth por usuário dedicado (sem migration).** A rota exige leitura de Metas
   (`metas/acompanhamento`). O Yan cria no Usuários & Acessos um usuário **"TV Comercial"** com
   só essa área — login manual único no navegador da TV; a sessão renova sozinha (refresh
   token). Mínimo privilégio: se a TV vazar, o pior caso é ver o que já está na parede. Por não
   criar papel/área novos no código, **não há migration**.

4. **Auto-refresh ~10min = INTERIM DESCARTÁVEL.** `TvAutoRefresh` (client isolado) chama
   `router.refresh()` num intervalo. É **provisório**: os dados vêm de uploads (sem tempo-real
   hoje). Será **substituído pelo tempo-real da API** (versão seguinte). Está isolado de
   propósito — nenhum acoplamento; removê-lo é apagar um componente e uma linha.

5. **Zero interação; tema claro.** Sem pills/tooltip/hover/botão na TV. O balão do esperado
   (hover no app) some; a **seta** + a **legenda fixa no rodapé** o substituem. Reusa os tokens
   de plataforma (tema group/neutro). Tema escuro fica para evolução futura.

## Alternativas rejeitadas

- **Route group com root layout próprio:** exigiria mover todas as rotas para um grupo `(app)`
  e criar um segundo root layout — restruturação ampla, alto risco, contra "sidebar intocada".
- **Overlay `fixed inset-0` cobrindo o AppShell:** renderizaria a sidebar por trás (desperdício
  + risco de flash) — não é "sem AppShell".
- **Header de pathname no proxy:** tocaria o arquivo de auth por um dado de renderização; o
  curto-circuito client resolve sem mexer no proxy.
- **Terceiro caminho de dados / RPC própria da TV:** quebraria a fonte única (números poderiam
  divergir da /metas e da /executiva).

## Consequências

- `/metas` e `/metas/tv` compartilham a orquestração — mudança de motor reflete nos dois.
- A TV depende de um login manual persistente no navegador da sala (operacional do Yan).
- O auto-refresh é dívida consciente, a ser trocada pela API (registrado aqui).
- Nada de API nesta versão (a integração de tempo-real é a versão seguinte, sensível).
