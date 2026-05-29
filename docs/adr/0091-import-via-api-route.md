# ADR-0091 — Importação de arquivo via API Route

**Status:** Aceito
**Data:** 2026-05-29
**Contexto:** A importação de planilha Excel do Fluxo de Caixa Gerencial (v4.6) ficou quebrada em produção (PEND-001) com o erro "An error occurred in the Server Components render". A investigação isolou que `@e965/xlsx` falha no SSR/RSC do Next.js 16, e que o crash ocorre na cadeia de import quando o parser convive com Server Actions no mesmo grafo de módulos.

## Decisão

Mover o fluxo de importação (parse + diff + commit) de Server Action para uma **API Route dedicada** (`/api/gerencial/import`) com `export const runtime = 'nodejs'`. A API Route roda em Node runtime isolado do React Server Components, eliminando a classe inteira de problemas de serialização e SSR.

## Padrão estabelecido

Processamento de upload de arquivo binário (Excel, CSV, etc.):

- **NÃO** usar Server Action para parsing de arquivo com libs que tocam SSR
- **USAR** API Route (`route.ts`) com `runtime = 'nodejs'` explícito
- Cliente envia arquivo via `fetch` multipart/form-data
- API Route parseia, retorna JSON (diff/resultado)
- Mutações no banco continuam via RPCs SECURITY DEFINER (schema `public`)
- A lib de parsing (`@e965/xlsx`) só pode ser importada pela API Route — nunca por Client Component ou Server Action

Aplica-se a qualquer feature futura que faça upload + parse de arquivo.

## Estrutura implementada (v4.7)

```
src/lib/gerencial/import-types.ts   ← tipos puros + chaveDuplicata (sem xlsx, sem server)
src/lib/gerencial/parser.ts         ← parseGerencialExcel (import estático xlsx) — só a API Route consome
src/app/api/gerencial/import/route.ts ← runtime=nodejs; POST action=preview|commit
src/components/financeiro/gerencial/import-drawer.tsx ← só fetch multipart, sem parser/xlsx
```

O `import-drawer.tsx` envia o arquivo com `action=preview` (retorna diff) e depois `action=commit` (executa `batch_gerencial_import` e retorna resumo).

## Justificativa

8 hipóteses foram testadas na v4.6 sem sucesso (useTransition, dynamic import, Promise.allSettled, isolamento de ImportDrawer com `ssr:false`). A descoberta-chave foi que remover `GerencialSection` eliminava o erro, e que `@e965/xlsx` falha no SSR. A raiz é a fronteira RSC/Server Action contaminada pela lib de Excel. API Route é o padrão canônico para upload de arquivo em Next.js justamente por rodar fora do contexto RSC. Resolve a causa, não o sintoma.

Validação local (v4.7 M0): upload de planilha de teste → `preview` retornou diff (HTTP 200), `commit` gravou 2 lançamentos (HTTP 200), página `/financeiro/fluxo-caixa` carregou (HTTP 200) sem o crash de Server Components.
