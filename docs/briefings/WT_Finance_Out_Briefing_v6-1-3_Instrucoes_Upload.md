# Out-briefing — v6.1.3 · Instruções de upload em cada card

**Branch:** `feat/v6-1-3-instrucoes-upload` · **Rota:** C (o escopo é o pedido do Yan de 05/10: "na página
de upload de arquivos, para cada card adicionar um botão 'Ver instruções' com as instruções para o usuário
sobre como fazer o upload de cada base de dados, por exemplo como deve vir do monde, quais as colunas
obrigatórias, etc") · **Migrations:** N/A · **ADR:** N/A · **Fechada em:** 05/10/2026

## 1. Resumo

Os seis cards de `/admin/ingestao/upload` ganharam o botão **"Ver instruções"** no cabeçalho (fora da zona de
arrastar). Ele abre, em cortina, um painel com cinco seções:

1. **De onde vem o arquivo** — o relatório do Monde ou, em Operação, o CSV do robô.
2. **Atenção** — as armadilhas, primeiro.
3. **Passo a passo.**
4. **Colunas obrigatórias** — os campos da tabela dinâmica, no caso do Demonstrativo.
5. **Bom saber** — substitui a base inteira, conferência antes × depois, só a 1ª aba, cabeçalho tolerante e o limite de MB nas cinco bases do contrato.

Ao levantar o que o servidor exige, apareceu um **defeito de três versões**. A linha "Colunas obrigatórias" do card estava errada em 5 das 6 bases desde a v6.0.0, porque lia as listas dos parsers antigos do navegador, que o fluxo do servidor não usa mais. Corrigido, junto com a descrição do Demonstrativo.

## 2. Decisões técnicas

- **Fonte única + sonda.** O texto vive em `src/lib/ingestao/instrucoes-upload.ts`, um módulo de dados puro.
  - A página é client component, por isso não importa os parsers do servidor.
  - A linha curta do card e o painel leem a mesma fonte.
  - A sonda `instrucoes-upload.test.ts` passa as colunas exibidas pelo **mesmo** `mapearColunas`/`camposFaltando` do parse e exige um rótulo por campo obrigatório. Para isso, `COL_MAP`/`OBRIGATORIOS` (Vendas, Operação, Lançamentos por Categoria) e `CAMPOS_CANONICOS` (Demonstrativo) passaram a ser exportados, como `readonly`.
  - Mutação conferida à mão: um rótulo desconhecido e uma coluna omitida reprovam, cada um com a mensagem certa.
  - O limite de MB é pinado no `LIMITE_BYTES_ARQUIVO` de `storage.ts`, lido como texto porque o arquivo é `server-only`.
- **`BaseKey = BaseUpload`.** A página e o módulo compartilham a união de bases: base nova sem instruções não compila.
- **Conteúdo só do que o código e a documentação sustentam.**
  - O campo `ondeNoMonde` (caminho de menu, filtros, período) ficou **ausente em todas as bases**: nenhum documento do repositório o registra (§6).
  - A receita do Demonstrativo vem do cabeçalho de `docs/legado/scripts-r/tratamento_demonstrativo_v1.R`.
  - O teto de 30 mil linhas de Vendas vem do briefing da v6.0.0.
- **UI:** cortina do DS (molde `TopSection`: 450 ms, mesma curva, conteúdo montado e `inert` quando fechado, `motion-reduce`), com tokens neutros de plataforma. O botão é o primitivo `Button` (`livre`), com `aria-expanded`/`aria-controls`.

## 3. Arquivos

| Arquivo | Mudança |
|---|---|
| `src/lib/ingestao/instrucoes-upload.ts` | **novo** — texto por base e `INSTRUCOES_GERAIS` |
| `src/lib/ingestao/instrucoes-upload.test.ts` | **novo** — sonda colunas × parser do servidor e MB × Storage |
| `src/components/admin/painel-instrucoes-upload.tsx` | **novo** — o painel |
| `src/components/admin/painel-instrucoes-upload.test.ts` | **novo** — render (`react-dom/server`) das 6 bases, aberto e fechado |
| `src/app/admin/ingestao/upload/page.tsx` | botão + painel; sai `BaseConfig.obrigatorias` e os imports dos `*_COLUNAS` antigos; descrição do Demonstrativo corrigida |
| `src/lib/ingestao/parsers/{vendas-produto,lancamentos-operacao,lancamentos-categoria,demonstrativo-competencia}.ts` | só `export` (+ `readonly`) das constantes |
| `.claude/skills/ingestao-planilhas/SKILL.md` | §8: `INSTRUCOES_UPLOAD` é a fonte do que o card exibe |

Também mudaram: `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`/`package-lock.json` (6.1.3), este out-briefing e `docs/WORKING-CONTEXT.md`.

## 4. Gates e prova

- `npx tsc --noEmit` ✓ · `npm run lint` ✓ (0 warnings) · `npm run build` ✓.
- `npm test`: **1.884 passaram, 6 skipped**. Um arquivo vermelho, `oraculo-demonstrativo.test.ts`: ENOENT da fixture `demonstrativo-cru.xlsx`, perdida, B-38.
  - **Controle:** a v6.1.2 registrou 1.870 + 6 skipped com o mesmo vermelho.
  - A diferença (+14) são exatamente os testes novos (7 + 7). Nada pré-existente mudou de resultado.
  - Fixtures recompostas com `scripts/ingestao/fixtures.mjs` a partir do arquivo fora do repo: 12 ok, 2 faltando, as conhecidas.

## 5. Conferência visual — NÃO FEITA pela sessão (D5)

A página exige login real, e a sessão não tem credencial. O MCP do Playwright não sobe em sessão de background (precedente da v6.1.1). Substitutos que rodaram:

- o **render** do painel nas seis bases (seções, chips de coluna e `inert` quando fechado);
- o **build** de produção, que compila o bundle cliente da rota.

🔴 **Yan — no preview da Vercel, `/admin/ingestao/upload`:** abrir e fechar o painel de 2 ou 3 cards (animação, quebra de linha da lista de colunas em Vendas, que tem 17) e conferir a linha "Colunas obrigatórias" em largura estreita. Mandar print.

## 6. Pendências — o que só o Yan tem

🔴 **Conteúdo "como deve vir do Monde" — caminho de menu, filtros e período.** O repositório não documenta isso em lugar nenhum (código, contrato, briefings, anexos, scripts R e README da RPA). Para não mandar o usuário ao lugar errado, o campo `ondeNoMonde` ficou vazio. Basta ditar o texto que a sessão preenche:

1. **Vendas por produto** — menu, filtros e período de cada arquivo (um por ano ou período).
2. **Lançamentos por Categoria, por movimentação** — menu, filtros e período.
3. **Lançamentos por Categoria, por vencimento em aberto** — menu e filtros.
4. **Demonstrativo de Resultado** — menu até a tabela dinâmica. A disposição dos campos já está no painel.
5. **Pessoas** — onde fica a exportação do cadastro.
6. **Lançamentos por Operação** — **não há caminho manual**: o arquivo é o CSV do robô (raspagem da "Análise de Operações"). É decisão de produto se o card deve dizer algo além de "use o CSV entregue pelo robô".

Outros registros, todos fora do escopo:

- **Sem guarda no servidor contra trocar Movimentação por Em aberto**, achado do revisor e pré-existente. Um arquivo de vencimento enviado ao card de Movimentação é gravado. O painel avisa ("a plataforma não impede trocar"). Sugestão de backlog: guarda "layout esperado × base" no parse.
- Os `*_COLUNAS` dos parsers antigos do navegador (`src/lib/carga/parse-*.ts`) ficaram só com os próprios testes como consumidores. São candidatos a poda numa varredura, com grep em `supabase/seed` antes.
- `parse-pessoas.ts:94` lê o xlsx com `raw:false`, contra a §3 da skill. É pré-existente e mitigado, porque tudo é texto.
- Herdadas, inalteradas: fixture do Demonstrativo (B-38), conferências visuais das versões anteriores, guarda anti-fórmula do Exportar, EBITDA, split de `puladas[].ids`, cadastros duplicados no Monde.

## 7. Parecer da revisão

**revisor: APROVADO COM RESSALVAS** — sem CRÍTICO nem ALTO. **Todos os MÉDIOS foram corrigidos** no commit `dc66626`:

- **MÉDIO — o texto prometia recusa ao apagar *qualquer* linha de agrupamento** (Movimentação e Em aberto). O código só recusa se não sobrar nenhuma (`CHECKSUM_AUSENTE`); sem parte delas, a carga passa com menos conferências. **Corrigido:** o texto agora diz exatamente isso e pede para não apagar nenhuma.
- **MÉDIO — "Limite de 50 MB" estava nas regras gerais, exibidas também em Pessoas**, que não passa pelo Storage. **Corrigido:** o campo `limiteMB` existe só nas cinco bases, pinado pela sonda. "Só esse número o denuncia" virou "o principal sinal é essa diferença".
- **MÉDIO — contraste da nota** (`zinc-500` sobre `surface-soft` ≈ 4,3:1). **Corrigido:** `zinc-600`.
- **BAIXOS corrigidos:**
  - "17 colunas" agora é derivado de `PESSOAS_COLUNAS`.
  - A nota de Movimentação não sugere mais obrigatoriedade.
  - `Operacao_Id`: "em todas as linhas de lançamento".
  - Zeros à esquerda: "desde que a coluna esteja como texto".
  - O comentário do módulo ficou preciso.
  - As constantes exportadas viraram `readonly`.
- **BAIXOS registrados, sem mudança:**
  - O teste de Pessoas é tautológico por construção (comentado no teste).
  - A sonda não cobre a prosa, nem o mapeamento `BASES.key → baseIngestao` da página: as irmãs Movimentação e Em aberto têm as mesmas colunas, então uma troca não reprovaria.
  - `role="region"` na cortina é SHOULD.
  - `Button livre` em vez de `contorno`, aceito pelo DS.
- Confirmado sem achado: acurácia de cada frase contra parsers, `carga.ts`, `grafo.ts`, `matriz.ts`, `storage.ts`, contrato e script R; teclado e aria; tokens; hooks; a página não importa nenhum parser do servidor.

**Auto-auditoria depois das correções:** as frases foram relidas uma a uma contra o código. "Editar estrutura" confere com o rótulo real do DRE (`src/app/financeiro/dre/page.tsx`).

## Advisor

| Agente | Consultas | Mudaram o rumo |
|---|---|---|
| Orquestrador | 2 — antes de implementar e depois do 1º commit | 2. A 1ª: não inventar caminho de menu, armadilhas primeiro, botão fora da zona de drop. A 2ª: baseline da suíte com fixtures, teste de render no lugar do visual, e o limite de 50 MB + "17" fixo, depois também apontados pelo revisor. |
| revisor | 0 | — |

Custo: pendência do Yan (`/usage`).
