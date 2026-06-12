# ADR-0111 — Caminho real de upload de Vendas migra ao pipeline atômico (F2-real)

**Data:** 2026-06-12 · **Versão:** 4.15.0 · **Status:** aceito
**Relacionado:** ADR-0104 (ingestão atômica de Vendas — staging + swap, migrations 0116/0118)

## Contexto

A ingestão de Vendas tinha **dois caminhos** desde a v4.12:

1. **Caminho real (UI):** `/admin/uploads` → Server Actions (`inserirLoteVendasAction`,
   `finalizarVendasAction`). Parse no cliente (parser único), lotes via Action.
   **Não-atômico:** no 1º lote rodava `truncate_dynamic_tables` (CASCADE) e só depois,
   no finalizar, `transform_raw_to_analytics`. Se o transform falhasse (ex.: data fora
   do range de `analytics.dim_data` → erro de FK), a base de leitura ficava **VAZIA**
   em produção (os dados crus sobreviviam em `raw.vendas_excel`). É o **F2** — já custou
   caro (migration 0100).
2. **Caminho vestigial (API Route `upload-vendas`):** atômico via 0116/0118 (staging →
   validação → swap numa transação), mas **não chamado** pela app.

A v4.12/v4.12.1 tornou atômico apenas o caminho vestigial. O caminho **real** — o que a
diretoria usa de fato — seguia com o `truncate`-antes-do-transform. F2 permanecia aberto
para a UI.

## Decisão

Migrar as Server Actions do caminho real para o **mesmo pipeline atômico** (0116/0118),
espelhando a lib `carregarVendas` (que a API Route já usava):

- `inserirLoteVendasAction(lote, isFirst)`: no 1º lote chama `limpar_staging_vendas`
  (NÃO-destrutivo) e carrega via `inserir_lote_staging`. **Não trunca mais a base.**
- `finalizarVendasAction(...)`: `validar_carga_staging` (pré-validação não-destrutiva) →
  se reprovar, erro explícito e base intacta; senão `loadMetas` (movida do 1º lote para
  cá, após validar) e `promover_carga_vendas` (swap atômico: truncate + copy staging→raw
  + transform + dims + refresh, tudo numa transação → ROLLBACK preserva a base).

As **assinaturas das Actions e o shape de sucesso são inalterados** → `page.tsx` não muda
→ **zero mudança de UX** no fluxo feliz. Erro de validação/promoção retorna mensagem
explícita ("base preservada"), nunca sucesso silencioso nem tela vazia.

Cobertura Zod: `cargaValidacaoSchema`/`cargaPromocaoSchema` (`schemas-rpc.ts`), validadas
por `parseRpc` no finalizar; contrato testado (`validar_carga_staging` live não-destrutivo;
`promover` coberto estruturalmente, pois é destrutivo).

**Sem migration nesta versão:** o pipeline (0116/0118) já está em produção (v4.12/v4.12.1)
e é `service_role`-only; as Actions usam `getAdminClient` (service role), então as RPCs já
são chamáveis. Como rodam fora do anon, não há risco do `statement_timeout` de 3s.

## Alternativas consideradas

- **Apontar a UI para a API Route vestigial (`upload-vendas`)** e aposentar as Actions:
  rejeitada nesta fase — mudaria o fluxo do cliente (upload por multipart de arquivo
  inteiro vs lotes parseados no cliente), com risco de UX e de limite de payload; é uma
  reescrita maior. Manter as Actions e trocar só o miolo é a mudança mínima e reversível.
- **Remover já o caminho antigo** (`truncate_dynamic_tables`/`inserir_lote_raw`): rejeitada
  — é a rede de rollback. Coexistência deliberada (ver abaixo). Remoção = fase 2.
- **Nova migration com wrapper `authenticated`** para o pipeline: desnecessária — as Actions
  usam service role; um wrapper só adicionaria superfície sem ganho.

## Coexistência e rollback

O caminho antigo (`truncate_dynamic_tables`, `inserir_lote_raw`, `transform_…` soltos)
**permanece intacto e funcional** no banco. Rollback desta versão = **reverter as Actions**
ao caminho antigo (mudança de aplicação, sem migration de desfazer). Nenhuma estrutura é
removida.

## Fase 2 (futura, NÃO nesta versão)

Só após **≥2 cargas reais validadas em semanas distintas, sem incidente**: aposentar a
rota vestigial, as RPCs antigas de carga, e as RPCs órfãs de desativar usuário (fora da UI
desde a v4.14.1). Nada disso é tocado agora.

## Consequências

- F2 fechado para o caminho real: uma carga com erro **não esvazia mais** a base — ou
  promove tudo, ou nada (atomicidade).
- Erro de validação é reportado explicitamente na UI antes de qualquer destruição.
- O parser único (`vendas-parser.ts`) e a leitura de Date nativo (ADR-0099) seguem
  intocados — a paridade de colunas (incl. `operacao_propria`) é garantida por 0118.
