# ADR-0152 — Auto-refresh da tela de Metas (reintrodução; emenda ao ADR-0148)

- **Data:** 2026-07-15
- **Status:** aceito
- **Contexto de versão:** v5.1.6

## Contexto

A v5.1.0 (ADR-0148) introduziu o Modo TV (`/metas/tv`) com um auto-refresh no cliente
(`TvAutoRefresh` = `setInterval` → `router.refresh()`), marcado como INTERIM até o tempo-real
chegar. A **v5.1.4 REMOVEU** esse componente sob a premissa registrada de que "o pull de 15min
o substitui".

**A premissa estava errada.** O pull (cron do Monde, ~15min) atualiza o **BANCO**, não a **TELA**:
`/metas` e `/metas/tv` são Server Components (retrato do instante do render). Após a virada
(v5.1.4/v5.1.5), o dado passou a ficar fresco no banco, mas a tela — sobretudo a **TV da sala
comercial** — só refletia isso num recarregamento manual. Ou seja, a atualização automática do
dado não tinha valor prático (foi o próprio Yan quem apontou: "sem ele a atualização automática
dos dados não tem relevância").

## Decisão

Reintroduzir o auto-refresh como um componente client **isolado e genérico**
(`MetasAutoRefresh`, `src/components/metas/metas-auto-refresh.tsx`), montado nos **dois** modos:

- **`/metas/tv`** (Modo TV) — intervalo **60s** (parede; tem de parecer viva).
- **`/metas`** — intervalo **5min** (tela interativa).

Mecanismo: `router.refresh()` re-executa o Server Component (re-chama `carregarAcompanhamento` →
`monde_ingest_status`/`get_executiva_kpis`) e re-hidrata **sem full reload** — números **e**
"Última atualização" avançam preservando scroll/seleção. O intervalo é prop (`intervaloMs`),
trivial de ajustar.

## Consequências

- A tela **converge ao banco** no intervalo — **não** é tempo-real de ingestão. Reagir no instante
  em que a venda entra exigiria outra arquitetura (Supabase Realtime / SSE), **fora deste escopo**.
- **INTERIM:** quando houver tempo-real, `MetasAutoRefresh` é removido — está isolado de propósito
  (nada depende dele), como o antecessor.
- **Emenda o ADR-0148:** o auto-refresh volta a valer; a remoção da v5.1.4 partiu de premissa
  incorreta e é revertida.
- Custo desprezível (uma TV + poucos analistas; `router.refresh()` é barato; as RPCs correm como
  `authenticated`, orçamento de 8s). O dado real só muda a cada ~15min, então intervalos < ~30s não
  agregam — 60s/5min são folgados.
