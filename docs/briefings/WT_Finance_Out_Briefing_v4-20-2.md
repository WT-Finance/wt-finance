# WT Finance — Out-Briefing v4.20.2

**Data:** 2026-06-16 · **Branch:** `feat/v4-20-2-upload-worker` (empilhada sobre `fix/v4-20-1-uploads`) · **Versão:** 4.20.1 → **4.20.2** (PATCH)
**Tema:** **Desempenho do upload — parse em Web Worker + barra de progresso.** Sem migration, sem mudança de banco. **Merge e deploy ficam com o usuário.**

---

## Problema
Ao importar uma base, a página **travava** ("a página não está respondendo") e o **spinner congelava** durante a fase "Lendo planilha".

## Causa-raiz
O parse do Excel é **client-side e síncrono na main thread** (`parse-vendas-produto.ts` e as 3 irmãs): `XLSX.read` + `sheet_to_json` (monta array de ~45k linhas) + `parseXxxRows` (loop de 45k) rodam de uma vez, **bloqueando a thread** por alguns segundos → o navegador acusa "não responde" e a animação do spinner (que vive na main thread) congela. Acontece na fase `validando` (logo após escolher o arquivo). O loop de envio depois é rede (não trava), mas não tinha feedback de progresso.

## Fix (2 frentes)
1. **Web Worker no parse** — `src/lib/carga/parse.worker.ts` recebe `{ kind, file }`, roda o parser correspondente **fora da main thread** e devolve as linhas. **Reaproveita os 4 parsers isomórficos** (zero duplicação de lógica; o `File` é clonável p/ o worker). Helper `src/lib/carga/parse-em-worker.ts` (`parseArquivoEmWorker`) embrulha o worker numa Promise e tem **fallback** para o parser na main thread se o worker não existir (SSR) ou falhar ao carregar/executar — a importação **nunca quebra** por causa do worker. As 4 bases passam a parsear pelo worker.
2. **Barra de progresso** — o envio em lotes atualiza `progresso {feito,total}` por lote; o card mostra **"Enviando… X%"** com barra e, ao terminar os lotes, **"Processando no servidor…"** (validação + promote). Estado novo `progresso` em `EstadoUpload`.

## Por que Web Worker (e não API Route)
A regra do CLAUDE.md "upload/parse → API Route" vale para o caminho **Gerencial**. O upload das 4 bases é client-parse + server-actions em lote (deliberado, contorna o limite de payload). Mover o parse para o servidor (API Route) exigiria mandar o arquivo inteiro (vários MB) numa requisição — risco de estourar o limite de upload. O **Web Worker** tira a trava **sem** mudar a arquitetura nem o caminho de dados — fix cirúrgico, baixo risco. (Decisão do Yan entre as opções apresentadas.)

## Gates
`tsc` **0** · `lint` **13** (baseline; o flag em `uploads/page.tsx:297` é o `useEffect(carregarStatus)` **pré-existente**, só mudou de linha — zero novos) · `build` **EXIT 0** (o worker **bunda certo** no Next 16/Turbopack via `new Worker(new URL(...), { type: 'module' })`) · `npm test` **125**.

## Auto-auditoria
- Worker roda fora da main thread → spinner anima, sem "não responde". Fallback cobre ambiente sem Worker (correção > fluidez).
- Reaproveita os parsers existentes (sem duplicar lógica → sem risco de parsers divergentes, lição da v4.9.x).
- Barra: `feito/total` por lote; `feito===total` → "Processando no servidor…" (cobre o promote, que agora não estoura timeout — v4.20.1).
- Sem mudança de banco/contrato; testes estáveis (125).

## Arquivos
- **Novos:** `src/lib/carga/parse.worker.ts`, `src/lib/carga/parse-em-worker.ts`.
- **App:** `src/app/admin/uploads/page.tsx` (parse via worker nas 4 bases + estado/barra de progresso).
- **Fechamento:** `package.json` (4.20.2), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `CLAUDE.md` (convenção: parse grande no cliente → Web Worker), este out-briefing.

## Aprendizado permanente (CLAUDE.md) — adicionado
Convenção nova: **parse de planilha grande no cliente → Web Worker, nunca na main thread** (com o porquê, o helper, o fallback e a nota de que o `new Worker(new URL(...))` bunda no Turbopack).

## Nota de merge (empilhamento)
Esta branch foi criada **a partir de `fix/v4-20-1-uploads`** (PR #125) para manter o versionamento linear (4.20.1 → 4.20.2). **Mergeie a #125 primeiro**, depois esta; o PR desta encolhe automaticamente para só os commits de v4.20.2 quando a #125 entrar no `main`.

---
**PR:** `feat/v4-20-2-upload-worker` → `main`. Merge e deploy ficam com o usuário.
