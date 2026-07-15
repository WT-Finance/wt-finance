# Out-briefing — v5.1.6 · Auto-refresh da tela de Metas e do Modo TV

**Tipo:** PATCH · **SEM migration** · **ADR-0152** (emenda o ADR-0148) · base main @ **v5.1.5**.

> Motivo: com a virada (v5.1.4/v5.1.5) o dado das Metas fica fresco no banco (cron do Monde ~15min),
> mas `/metas` e `/metas/tv` são Server Components — sem auto-refresh no cliente a tela só reflete o
> dado novo num recarregamento manual. A **TV da sala comercial** nunca se atualizava sozinha. O Yan
> pediu explicitamente o auto-refresh ("sem ele a atualização automática dos dados não tem relevância").

## O que foi entregue

| # | Entrega |
|---|---|
| **1** | **`MetasAutoRefresh`** (`src/components/metas/metas-auto-refresh.tsx`) — componente client isolado, genérico, que chama `router.refresh()` a cada `intervaloMs`. Re-executa o Server Component (re-`carregarAcompanhamento`) e re-hidrata **sem full reload** — números **e** "Última atualização" avançam preservando scroll/seleção. Reintrodução do `TvAutoRefresh` removido na v5.1.4 (agora serve os 2 modos). |
| **2** | **Montado nos dois modos:** `/metas/tv` (`tv-tela.tsx`) a **60s**; `/metas` (`acompanhamento-content.tsx`, já `'use client'`) a **5min**. |
| **3** | **ADR-0152** — emenda o ADR-0148 (a remoção da v5.1.4 partiu de premissa errada: "o pull substitui" — o pull atualiza o banco, não a tela). |

## Correção de premissa (auto-auditoria honesta)

A v5.1.4/M4 (minha) removeu o `TvAutoRefresh` registrando "o pull de 15min o substitui". Isso estava
**errado** — o pull mantém o **banco** fresco, não a **tela**. A remoção regrediu silenciosamente a
auto-atualização da TV. Esta versão reverte e o ADR-0152 documenta a correção.

## Escopo / ressalva

Isto faz a **tela convergir ao banco** no intervalo — **NÃO** é tempo-real de ingestão. "Tempo-real"
de verdade (a tela reagir no instante em que a venda entra) seria Supabase Realtime/SSE, fora deste
patch. Quando vier, `MetasAutoRefresh` é removido (isolado de propósito).

## Gates

`npx tsc --noEmit` **0** · `npx eslint` (arquivos alterados) **0** · `npm test` **415/415** ·
`npx next build` **OK**. `react-hooks` v7 (React Compiler): o padrão `setInterval` no `useEffect` com
cleanup passa (idêntico ao `TvAutoRefresh` original, que já passava). **Parecer do `revisor`: APROVADO**
(0 CRÍTICO/ALTO/MÉDIO; 2 BAIXO registrados abaixo). Sem migration → `revisor-db` não se aplica.

## Parecer da revisão (revisor)

**APROVADO** — 0 CRÍTICO/ALTO/MÉDIO. Dois **BAIXO**, ambos registrados (não bloqueiam):

1. **Refreshes poderiam empilhar** se um `router.refresh()` demorar mais que o intervalo (60s na TV).
   Improvável na prática (orçamento de 8s do papel `authenticated`; volume trivial — uma TV + poucos
   analistas). **Não corrigido:** uma guarda de "refresh em andamento" seria complexidade sem ganho real
   hoje; reavaliar se a orquestração crescer.
2. **Operacional (não é bug de código):** a TV volta a fazer uma requisição real a cada 60s — reengata o
   refresh de sessão do usuário "TV Comercial" (comportamento correto do `proxy.ts`/`@supabase/ssr`, nada
   novo introduzido). Observar apenas se a TV algum dia cair para a tela de login sem ninguém notar.

Verificado sem achado: deps do efeito estáveis (`[router, intervaloMs]`) + cleanup correto (sem vazamento
no unmount / ao trocar `intervaloMs`); `router.refresh()` roda em `startTransition` → **não** reexibe o
fallback do `loading.tsx` nem perde scroll/estado (conteúdo anterior fica até o novo RSC chegar);
Server Component montando Client Component é padrão válido de App Router; sem duplicação de montagem
(rotas distintas, sem `layout.tsx` intermediário); sem cache de fetch (a RPC é POST).

## Nota de release

Também **corrigido** o timestamp da entrada v5.1.5 no `CHANGELOG_DIRETORIA` (estava `12:45`, futuro;
ajustado para o horário real `10:40`) — a v5.1.6 nasce com `10:49` (hora real de autoria, SP).

## Pendências (inalteradas)

- **Reconciliar `CRON_SECRET` (Vercel) = `monde_cron_secret` (Vault)** — o cron do Monde estava em 401
  (ingestão parada 14/07); o Yan ajustou o secret em 15/07, confirmação do 200 em verificação.
- (seguem) `SMTP_*`, `%Rec` no Cadastro; **Scope B** (aposentar o upload).
