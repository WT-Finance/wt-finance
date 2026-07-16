# Out-briefing — v5.1.11 · Rótulo vermelho quando a sincronização do Monde atrasa

**Tipo:** PATCH · **SEM migration · SEM ADR** · base main @ v5.1.9 (independente do #188/v5.1.10).

## Origem

Diagnóstico desta sessão (a pedido do Yan): "se a API para de transmitir, o rótulo trava ou continua?
saberíamos sem investigar?". Conclusão — **falha DURA** (API fora do ar / cron parado / RPC de carga
falhando): a rota `/api/monde/ingest` cai no `catch`, devolve 500 e **não grava** o marcador
`ultimo_incremental` → `ultima_sincronizacao` **congela**; mas **não havia nenhum alerta** — o único
sinal era o rótulo, absoluto, dependendo de alguém reparar. Esta é a **opção 1** oferecida (sinal visual
passivo no próprio rótulo). As opções 2 (alerta ativo por e-mail) e 3 (detectar a falha silenciosa)
ficaram como follow-up no WORKING-CONTEXT.

## Entrega

O rótulo "Última atualização em <ts>" fica **vermelho** (`text-danger`) com o relógio trocado por
`TriangleAlert` quando `ultima_sincronizacao` não avança há **>45 min** (`TICKS_ATE_ATRASO=3` ×
`INTERVALO_SYNC_MIN=15`). Avaliado no **cliente** contra `Date.now()`, re-checado a cada 30 s → cruza
para vermelho sozinho (não espera reload) e volta ao neutro quando a sincronização retoma (auto-refresh
5 min já existente). Começa neutro no 1º render (sem mismatch de hidratação).

Aplicado nos **3 lugares** onde o rótulo aparece:
- Acompanhamento (`/metas`) — `acompanhamento-content.tsx`
- Comparação (`/metas/comparacao`) — `comparacao-content.tsx`
- Modo de Exibição / TV (`/metas/tv`) — `tv/tv-tela.tsx` (server component; recebe o client island)

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/lib/metas/sync-atraso.ts` | **NOVO.** Puro/isomórfico: `sincronizacaoAtrasada(iso, agoraMs)` + constantes (`LIMITE_ATRASO_MS`=45min). |
| `src/lib/metas/sync-atraso.test.ts` | **NOVO.** Tabela de casos (null/inválido/agora/15min/44/45/46/2h + offset de fuso). |
| `src/components/metas/ultima-atualizacao.tsx` | **NOVO.** Client island: relógio interno 30 s, vermelho+alerta no atraso; props `iso`/`prefixo`/`className`/`corNeutra`/`iconSize`. |
| `acompanhamento-content.tsx` | Rótulo inline → `<UltimaAtualizacao>`; removidos imports órfãos `Clock`/`fmtDataHoraLongoSP`. |
| `comparacao-content.tsx` | Idem; `fmtDataHoraLongoSP` fora do destructure (mantém `numBRL2`/`fmtAxisMes`). |
| `tv/tv-tela.tsx` | Idem (prefixo "Atualizado em", `text-lg`, ícone 18); `fmtDataHoraLongoSP` fora (mantém `fmtMi`). |
| `docs/design-system.md` | Nova §"Rótulo Última atualização — sinal de saúde da sincronização". |
| `CHANGELOG.md`, `changelog-diretoria.ts`, `WORKING-CONTEXT.md`, `package.json` (5.1.11) | Versão/histórico. |

## Escopo / limites (honesto)

- **Cobre a falha DURA** (marcador congela → cruza 45min → vermelho). **NÃO cobre a falha SILENCIOSA**
  (API responde 200 sem vendas → marcador avança → parece saudável; indistinguível de janela quieta
  pelo rótulo). Registrado no `sync-atraso.ts` e no WORKING-CONTEXT.
- **45 min = 3 ticks** — cadência normal é 0–15 min, então não há falso-positivo em operação normal
  (2 ticks de margem).
- Sinal **passivo** (precisa a tela aberta); alerta ativo por e-mail = follow-up (opção 2).

## Nota de coordenação (2 PRs abertos)

Este patch é **independente** do #188 (v5.1.10 — sombra dos cards); arquivos disjuntos, exceto os de
versão/histórico (`package.json`, `CHANGELOG.md`, `changelog-diretoria.ts`, `WORKING-CONTEXT.md`).
**Recomendação: mergear o #188 (v5.1.10) primeiro.** No 2º merge haverá conflito TRIVIAL nesses 4
arquivos (ambos mexem no topo) — reconciliação de 1 linha de versão + ordenar as entradas de CHANGELOG.
Posso reconciliar assim que o #188 mergear (merge de `main` na branch, sem force-push).

## Gates

`npx tsc --noEmit` · `npx eslint` (arquivos alterados) · `npm test` · `npx next build` — [preencher].
**revisor** — [preencher].

## Pendências herdadas (inalteradas)

- Faturamento em MODO TESTE; Monde Scope B (aposentar o upload); `SMTP_*` na Vercel; `%Rec` no Cadastro.
- Follow-up alerta: (2) e-mail ativo, (3) detecção da falha silenciosa.
