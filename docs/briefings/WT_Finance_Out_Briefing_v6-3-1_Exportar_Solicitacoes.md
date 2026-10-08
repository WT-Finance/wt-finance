# Out-briefing — v6.3.1 · Solicitações: exportar todas para Excel

Patch pedido pelo Yan em 08/10/2026 (rota C com gates; sem briefing — o pedido fixou as três decisões de
produto: **"pode exportar quem tem acesso a solicitações (gestão); exporta tudo; não entra movimentações"**,
e o número: v6.3.1, porque a v6.3.0 está em implementação). Formato escolhido antes, na mesma conversa, sobre
uma extração pontual: **Excel multi-aba** (aba geral + uma por tipo + anexos). Branch
`feat/v6-3-1-exportar-solicitacoes`, **PR #300**. **Sem migration, sem RPC nova, sem ADR** (`database.ts` não muda).

## 1. Resumo

Botão **"Exportar"** na página `/solicitacoes`, no grupo de botões de gestão (ao lado de "Movimentações"),
visível só com a área `solicitacoes`. O clique baixa `solicitacoes-AAAA-MM-DD.xlsx` com **todas** as
solicitações do sistema, independentemente da visão (Caixa/Minhas), do escopo ("Ver todas"/"Minha caixa") e
da busca da tela. Abas:

| Aba | Conteúdo |
|---|---|
| Todas | uma linha por solicitação: Nº, tipo, status, origem (Janus/API), solicitante, destinatário, aberta em, prazo, aprovada em/por, decisão em/por, descrição, justificativa, nº de anexos |
| uma por tipo | Nº, status, solicitante, aberta em, prazo, decisão em, descrição + **os campos do formulário como colunas** |
| Anexos | todo arquivo: nº, tipo, campo de origem (ou "Anexo posterior"), nome, formato, tamanho |
| Sobre | data de geração, contagens e notas de leitura |

Movimentações não entram (decisão do Yan).

## 2. Decisões técnicas

1. **Planilha montada no servidor** (`GET /api/solicitacoes/exportar`), não no cliente como a da DRE: a tela
   nem sempre tem a lista inteira (na "Minha caixa" ela vem recortada pelo destinatário). A rota usa a
   **mesma leitura** da visão "Ver todas" — `getCaixa('todas')` → `solic_caixa` + `parseRpc` — então não vê
   nada que a tela de gestão não veja. Gate duplo: `requireAreaApi('solicitacoes')` + `tem_area` no banco (0128).
2. **Montagem em módulo puro** (`src/lib/solicitacoes/exportar.ts`, molde de `src/lib/dre/exportar.ts`): a
   rota só converte as matrizes com `aoa_to_sheet`. O contrato inteiro é testável no vitest.
3. **Coluna de campo = rótulo + tipo do campo, não `campo_id`.** `admin_solic_salvar_tipo` apaga e recria os
   campos a cada save, então o mesmo campo tem ids diferentes por versão. Agrupado por id, "Pagamentos fora do
   prazo" saía com 19 colunas para 10 campos (medido na extração de 08/10). Dois campos de mesmo rótulo e tipo
   na mesma solicitação continuam colunas distintas (a n-ésima ocorrência vai para a n-ésima coluna).
4. **Número é número, data é data.** Moeda pelo **mesmo `toNum`** da tela (`fmtValor`): o que o drawer mostra
   como R$ 1.318,00 sai 1318. Datas como serial do Excel; timestamptz em **horário de parede de São Paulo**.
   Campo `numero` fica texto (pode ser identificador, como a tela o trata).
5. **Sem guarda anti-fórmula.** Em `.xlsx` texto nunca vira fórmula, e o apóstrofo da guarda da DRE apareceria
   no texto digitado pelo usuário. Texto acima do teto de 32.767 caracteres do Excel é cortado com "[…]".
6. **Pessoas por e-mail**, como a tela mostra (`solic_json` não traz nome). Trocar por nome pediria mudar a RPC —
   fora do escopo do patch.

## 3. Arquivos

- `src/lib/solicitacoes/exportar.ts` (novo) — montagem das abas.
- `src/lib/solicitacoes/exportar.test.ts` (novo) — 19 casos.
- `src/app/api/solicitacoes/exportar/route.ts` (novo) — rota do download.
- `src/components/solicitacoes/botao-exportar.tsx` (novo) — botão (spinner + aviso de erro, molde da DRE).
- `src/components/solicitacoes/solicitacoes-content.tsx` — botão no bloco `podeGestao`.
- `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`/`package-lock.json` (6.3.1),
  `docs/WORKING-CONTEXT.md`, este out-briefing.

## 4. Gates e prova

- `npm run build` ✅ (rota `ƒ /api/solicitacoes/exportar` no manifesto) · `npx tsc --noEmit` ✅ (de novo após
  `rm -rf .next`, depois do `next dev`) · `npm run lint` ✅.
- `npm test`: **1.919 verdes, 3 falhas + 4 arquivos sem rodar — nenhuma da v6.3.1**:
  - `rpc-contrato` (catálogo de áreas; áreas do verificador) e `schema-baseline`: o banco de produção já tem a
    área `marketing/gastos`, as RPCs `get_marketing_gastos_*` e a allowlist delas — **migration 0292 da v6.3.0,
    aplicada, PR #299 ainda não mergeado**. O `main` não tem. Somem quando o #299 entrar.
  - 4 oráculos de ingestão: fixtures git-ignoradas não vêm na worktree. Copiadas de
    `~/projects/arquivo-worktrees-janus/fixtures-ingestao/`: **3 passam (68 testes)**; o do Demonstrativo segue
    sem `demonstrativo-cru.xlsx` (fixture perdida, B-38 — pré-existente).
- **Prova com dado real (somente leitura):** o JSON de `app.solic_json` de todas as linhas de produção passou
  no `solicitacoesListaSchema` e, pelo módulo, bateu **ao centavo** com uma extração independente feita antes por
  script (joins próprios): 166 solicitações; linhas×colunas por tipo 56×17, 37×18, 33×11, 21×18, 11×10, 8×11;
  somas de moeda 360.387,03 / 92.998,96 / 53.442,80 / 8.768,32 / 724.298,97; 152 anexos. Repetido após as
  correções da revisão — idêntico.
- **Rota sem sessão:** `next dev` + `curl` → **HTTP 401**.

## 5. Não verificado pela sessão

- **Conferência visual e download autenticado.** A página exige login real e a sessão roda em background
  (o MCP Playwright não sobe nela — v5.3.3). Roteiro para o Yan, depois do merge (ou no preview do PR):
  1. Com usuário de **gestão**: o botão "Exportar" aparece ao lado de "Movimentações", com o mesmo visual âmbar.
  2. Clicar em "Minha caixa" e depois em "Exportar": o arquivo traz as **166+** solicitações (não só as da caixa).
  3. Abrir no Excel: abas Todas / uma por tipo / Anexos / Sobre; valores em R$ somam; datas filtram como data;
     horários batem com a tela (São Paulo).
  4. Com usuário **sem gestão** (só `solicitacoes/basico`): o botão não aparece; abrir
     `/api/solicitacoes/exportar` direto devolve 403.
- Navegadores além do Chromium (o revoke do blob foi adiado um tique por precaução).

## 6. Pendências — o que só o Yan tem

- 🔴 Mergear o PR e fazer a conferência do §5.
- 🔴 **Conflito esperado com o PR #299 (v6.3.0)** em `package.json`/`package-lock.json` (versão),
  `CHANGELOG.md`, `src/data/changelog-diretoria.ts` e `docs/WORKING-CONTEXT.md` — os dois partiram do mesmo
  `main`. Quem mergear por segundo resolve: versão final **6.3.1**, as duas entradas nos CHANGELOGs (6.3.1 em
  cima). Nenhum arquivo de código em comum.
- Dado a corrigir na origem (visto no export): a **#1894** ("Registro de prejuízos", rejeitada) tem valor
  "695194" sem vírgula — R$ 695.194,00 na planilha; foi reaberta como #1895 (R$ 6.951,94). Somas por tipo
  precisam filtrar o status.

## 7. Parecer da revisão

**`revisor`: APROVADO COM RESSALVAS — 0 CRÍTICO, 0 ALTO, 1 MÉDIO, 9 BAIXO.** Itens verificados sem achado:
segurança da rota (401/403/área, proxy, `no-store`, sem parâmetro), fuso, moeda, campos opcionais, lista vazia,
`tipo_nome` nulo, injeção de fórmula, consistência do botão com os pills vizinhos.

| Sev. | Achado | Destino |
|---|---|---|
| MÉDIO | `colunasDoTipo`: dois campos de mesmo rótulo+tipo na mesma solicitação abriam uma coluna nova a cada versão do tipo (o mesmo sintoma que a decisão 3 evita) | **Corrigido** (lista de colunas por chave; teste com 3 versões) |
| BAIXO | cabeçalho de campo podia colidir com coluna fixa ("Status") | **Corrigido** (desduplicado contra as fixas; teste) |
| BAIXO | nome de aba com apóstrofo nas pontas / "History" | **Corrigido** (inclusive após o corte em 31; teste) |
| BAIXO | célula > 32.767 caracteres | **Corrigido** (corte com "[…]"; teste) |
| BAIXO | `getCaixa` null sem log na rota | Sem mudança: `parseRpc` já loga a causa (`[RPC solic_caixa] …`) |
| BAIXO | KB arredondado mostrava 0 | **Corrigido** (`Math.ceil`) |
| BAIXO | sort por `localeCompare` de ISO | **Corrigido** (`Date.parse`) |
| BAIXO | revoke síncrono / `<a>` fora do DOM | **Corrigido** (anexa, clica, remove; revoke adiado) |
| BAIXO | `disabled` tira o foco do botão; `opacity` duplicada | Opacidade duplicada removida; `disabled` mantido — é o molde do Exportar da DRE (consistência > variação local) |
| BAIXO | nome do arquivo calculado no cliente e no servidor | Sem mudança: só o do cliente vale no download |

`revisor-db`: N/A (sem migration/RPC). `verificador-visual`: não rodado (§5).

## Advisor

`revisor`: 0 consultas. Sessão principal: 0 consultas. Custo: pendência do Yan (`/usage`).
