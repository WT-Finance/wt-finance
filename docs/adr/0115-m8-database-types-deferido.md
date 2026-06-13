# ADR-0115 — Mapa Functions de database.ts e o cast BoundRpc: M8 deferido pelo teto

**Data:** 2026-06-13 · **Versão:** v4.17.0 (M8) · **Status:** aceito (deferido)

## Contexto

`src/types/database.ts` tem um mapa `Functions` **manual e desatualizado** (RPCs ativas
ausentes). Como o mapa é incompleto, chamar uma RPC não-listada via `supabase.rpc(...)` dá erro
de tipo — então 11 arquivos contornam com `(sb.rpc as unknown as BoundRpc).bind(sb)`, redeclarando
o tipo `BoundRpc` localmente. A type-safety do `.rpc` é, portanto, **enganosa** (o cast a anula);
a segurança de tipo real do RETORNO vem do `parseRpc` + schema Zod no call site.

O briefing da v4.17.0 ofereceu dois caminhos, **com um teto de reversibilidade vinculante**: se o
caminho escolhido cascatear em **mais de ~8 arquivos** de ajuste de tipo, PARAR e reportar — M8
sai da versão como resíduo, sem desfazer os Baldes 1–4 (independentes).

## Decisão

**M8 é DEFERIDO** (não entra na v4.17.0) — o teto é atingido pelos dois caminhos:

- **(a) `supabase gen types typescript`:** regenera o `database.ts` (645 linhas) com todas as
  Functions tipadas e exige remover os casts dos 11 call sites, reconciliando tipos estritos de
  argumento/retorno em cada um. Cascata muito acima de 8 arquivos.
- **(b) remover o mapa manual + helper Zod substituindo os 11 BoundRpc:** toca **≥14 arquivos** —
  os 11 call sites (com `BoundRpc` **não-uniforme**: 8 com `data`, 2 sem `data`, 2 declarados
  *dentro* de componentes via `RpcResult` local) + os 2 client factories (`server.ts`/`admin.ts`,
  que usam `createClient<Database>`) + o próprio `database.ts`. Também acima do teto, com risco
  real de regressão.

Conforme o teto, M8 vira **P-refactor na fila** (patch dedicado futuro).

## Consequências / mitigação

- **Risco residual é baixo:** o app tem **zero `.from()`** (nunca acessa tabela direto), então o
  mapa `Functions`/`Tables` desatualizado não afeta o caminho real; e a v4.17.0 **fortaleceu** a
  type-safety REAL de RPC (a que importa) via M13 (4 schemas Zod a mais na lista viva F7) e M7
  (cobertura do item-schema de `solic_json`). O cast `BoundRpc` continua confinado ao padrão
  conhecido.
- Os Baldes 1–4 (segurança, coerção, carga, gates) estão fechados e **não dependem** do M8.

## Caminho recomendado para o P-refactor

Preferir **(b)** num patch dedicado: criar um helper RPC único (`bindRpc`/`callRpc` tipado por
Zod, reusando `parseRpc`), uniformizar os 11 sites, e então decidir sobre a remoção do mapa
manual com os client factories no mesmo lote — fora do escopo de uma versão de saneamento amplo,
onde o teto protege contra o estouro.
