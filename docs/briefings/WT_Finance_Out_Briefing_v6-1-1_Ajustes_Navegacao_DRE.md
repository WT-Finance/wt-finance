# Out-briefing — v6.1.1 · Ajustes de navegação, cabeçalho de Performance e Exportar do DRE

**Branch:** `feat/v6-1-1-ajustes-navegacao-dre` · **Spec:** `docs/briefings/spec-v6-1-1-ajustes-navegacao-dre.md`
· **Migration:** `0289` (aditiva, APLICADA em 01/10/2026) · **ADR:** 0180 · **Fechada em:** 01/10/2026

## 1. Resumo em linguagem clara

Patch pedido pelo Yan em 01/10 com cinco itens; quatro entregues, o EBITDA adiado por ele:

1. **Ingestão de Dados** — "Upload de Arquivos" e "Log de Ingestão" viraram subabas de um grupo
   novo na sidebar. O card "Sincronização Monde" saiu do Upload e abre o Log.
2. **Performance** — "Última atualização em…" na mesma linha do título, como no Demonstrativo.
3. **API Externa** — seção própria na sidebar (Chaves + Documentação), com **área de permissão
   própria** (`api-externa`), separada de Solicitações. Os atalhos dentro de Solicitações saíram.
4. **Exportar** — botão ao lado de "Ver em tela cheia" no DRE por Competência e por Fluxo de Caixa:
   planilha Excel com duas abas (Mensal e Consolidado), sempre com todas as linhas abertas.
5. **EBITDA** — **fora** (o Yan está discutindo internamente). Ver §8.

## 2. Divergências pedido × realidade e decisões do Yan

- **"Sincronização Monde" não era item da sidebar** — era um card no fim de `/admin/uploads`. Virou
  card no topo do Log.
- **"API externa" não era aba de Solicitações** — era a rota própria `/admin/api-externa`, fora da
  sidebar, alcançada por uma pill em Gerenciar solicitações (e a Documentação por uma pill em
  Solicitações). Rotas mantidas; só a navegação e a permissão mudaram.
- **Grupo de sidebar exige href-pai que seja prefixo das subabas** (`nav-model.test.ts`). Para não
  usar `/admin` (acenderia todo o admin), o Upload mudou para `/admin/ingestao/upload`;
  `/admin/uploads` e `/admin/uploads/financeiro` redirecionam. O Log (`/admin/ingestao`) não mudou —
  link do e-mail do vigia e mensagem do cliente da RPA seguem válidos.
- **Decisões do Yan (01/10):** Exportar com **duas abas sempre** (Mensal do ano em tela + Consolidado
  dos anos marcados); **tirar os dois atalhos** de Solicitações; **criar área própria** para a API
  Externa; **EBITDA fora** por ora. Aprovação antecipada do plano.

## 3. Missões

| Missão | Commit | O que mudou |
|---|---|---|
| M1 Ingestão de Dados | `feat(v6-1-1/M1)` | `nav-model.ts` (grupo `/admin/ingestao`), Upload movido para `src/app/admin/ingestao/upload/` (+ `loading.tsx` próprio — o do Log envolveria o filho), redirects, card `card-sincronizacao-monde.tsx` no Log (server-side no 1º render, relido no `atualizar`), `allSettled` do Upload reescrito com 6 itens |
| M2 Performance | `f3ddbc2` | `CabecalhoPerformance` (título + slot dos selos, `flex-wrap justify-between` do DRE) no conteúdo, no `loading.tsx` e na tela em construção; h1 saiu do layout do segmento |
| M3 API Externa | `beace8c` | área `api-externa` em `areas.ts` + 0289; grupo na sidebar; guards/actions; atalhos removidos; `bases-paridade.test.ts` acha a definição vigente de `api_chave_registrar` sozinho; runbooks |
| M4 Exportar | `ec8a8e1` | `src/lib/dre/exportar.ts` (montagem pura + teste), helpers movidos SEM mudança para `src/lib/dre/colunas-tabela.ts` (tela e planilha leem a mesma fonte), botão em `AcoesHierarquia` |
| Revisão | `423ac3c` | achados do revisor (§6) |

## 4. Migration 0289 (aditiva — APLICADA em 01/10/2026 ~13:35, antes do merge)

- Área `api-externa` (Administração, ordem 56) + concessão a toda role com `solicitacoes`, fora as de
  máquina (`Máquina · %`) ⇒ **Administrador e Financeiro**.
- 9 funções recriadas do **catálogo vivo** (`pg_get_functiondef`), trocando só o `exigir_acesso`:
  7 exclusivas ⇒ `['api-externa']`; `admin_solic_listar_tipos` ⇒ `['solicitacoes','api-externa']`
  (compartilhada); `solic_tipos_documentacao` ⇒ `['api-externa','solicitacoes/documentacao']`.
- Guard `DO $$` de efetividade (assinaturas, sobrecargas, corpo com a área, backfill, role de máquina).
- **Ensaio em transação revertida** antes de aplicar, com claims JWT reais: Financeiro passa nas 4
  RPCs testadas; Gestor (só `solicitacoes/documentacao`) lê a documentação e segue negado em chaves e
  tipos (como já era); pós-ROLLBACK nada ficou.
- Backup-gate **VERDE** (78/78, restore-test 3/3). Pós-push: área concedida a Administrador e
  Financeiro, 9 corpos citam `api-externa`. Baseline regenerado (só `ultima_migration` + 9
  `hash_corpo`), `schema-baseline` e `rpc-contrato` verdes.
- **Compatível com o código v6.1.0 em produção** até o merge: todo usuário que passa o guard antigo
  (`solicitacoes`) tem role com `api-externa`.

## 5. Conferência visual — NÃO FEITA pela sessão (D5)

O MCP do Playwright (do `verificador-visual`) falhou ao conectar nesta sessão, e o navegador do
Claude in Chrome (Edge no Windows) não alcançou o dev server do WSL (`localhost`/`127.0.0.1:3011`
em página de erro). **Não verificado ao vivo:** sidebar (grupos novos, subaba acesa), card Monde no
Log, cabeçalho de Performance (largo e estreito; Weddings com 2 selos), botão Exportar (em tela cheia
também) e a planilha gerada. 🔴 Yan: conferir no preview da Vercel e mandar print.

## 6. Parecer da revisão

**revisor-db (0289, antes de aplicar): APROVADA COM RESSALVAS** — sem CRÍTICO/ALTO.
- M1 (janela vermelha entre aplicação e merge: paridade de áreas e baseline) → código da área no
  mesmo commit da migration, baseline regenerado logo após aplicar.
- M2 (sem guard de efetividade) → guard `DO $$` adicionado.
- M3 (`bases-paridade.test.ts` preso à 0274) → teste acha a definição vigente.
- B1 (brecha da janela) → query de conferência em §8. B2 (filtro por nome exato) → `NOT LIKE
  'Máquina · %'`. B3 (docs) → runbooks. B4 (pill da doc em Solicitações) → a pill saiu. B5
  (`api-externa` lê o catálogo de tipos) → registrado no ADR-0180.

**revisor (versão inteira): CORREÇÕES NECESSÁRIAS → corrigidas.** (a) `allSettled` índice a índice,
(b) fidelidade do Exportar à tela e movimentação dos helpers, (c) permissões — limpos.
- **ALTO** botão Exportar sem spinner (trocava o rótulo) → `Loader2` girando, rótulo mantido.
- MÉDIO link "Ver solicitações" removido além do pedido → **restaurado**, só para quem tem
  `solicitacoes` (sem ela o destino daria /sem-acesso).
- MÉDIO card Monde mantinha valor velho se a releitura falhasse → vira "Status indisponível".
- MÉDIO o Monde passou a bloquear o 1º render do Log (antes era carregado no cliente do Upload) →
  **registrado, não alterado**: `monde_ingest_status` é leitura pequena, o `loading.tsx` cobre a
  espera; se pesar, passar a promise ao client com `use()` (react-padroes §2).
- MÉDIO guarda anti-fórmula do Exportar põe apóstrofo visível em rótulo que começa com `= + - @` →
  **não alterado**: a remoção foi barrada pelo classificador de permissões do harness (remoção de
  guarda de segurança). Hoje nenhum rótulo do DRE começa assim (blocos começam com "("). 🔴 Yan decide.
- BAIXO espaço entre atributos → corrigido; `console.error` no catch do export → adicionado;
  comentários/docs com o caminho antigo → atualizados (skeletons, seed, README, skill
  `ingestao-planilhas`, runbook). NaN→vazio e `cat` sem `g` (canto teórico) → registrados.

## 7. Gates (01/10, depois das correções e com `.next` limpo)

`npm run build` ✓ · `npx tsc --noEmit` ✓ · `npm run lint` ✓ · `npm test`: **1.870 passaram, 6
skipped**; 1 arquivo vermelho — `oraculo-demonstrativo.test.ts` (ENOENT de `demonstrativo-cru.xlsx`,
a fixture de 21/09 perdida, B-38; as outras 12 foram recompostas de
`~/projects/arquivo-worktrees-janus/fixtures-ingestao/`). Mesmo estado da v6.1.0.

## 8. Pendências

- 🔴 **Yan — EBITDA no DRE por Competência** (decisão interna). Achado: o plano de contas da
  Competência **não tem Depreciação/Amortização**; a proposta levantada é `(=) EBITDA = LOP − FIN`
  como bloco `tot` em `financeiro.dre_comp_bloco` (migration só de dado, sem DDL nem front), posição
  antes ou depois do LOP — na prática igual ao EBIT enquanto não houver D&A.
- 🔴 **Yan — conferência visual** (§5).
- 🔴 **Yan — guarda anti-fórmula do Exportar** (manter apóstrofo ou tirar — §6).
- 🔴 **No merge — brecha da janela da 0289**: conferir que nenhuma role ganhou `solicitacoes` sem
  `api-externa` desde a aplicação:
  `SELECT r.nome FROM app.rbac_role_permissoes rp JOIN app.rbac_roles r ON r.id = rp.role_id WHERE rp.area = 'solicitacoes' AND r.nome NOT LIKE 'Máquina · %' AND NOT EXISTS (SELECT 1 FROM app.rbac_role_permissoes x WHERE x.role_id = rp.role_id AND x.area = 'api-externa');`
  (vazio = ok; se não, conceder pelo editor de roles).
- Rótulo vivo de `solicitacoes/documentacao` ("Solicitações (documentação)", grupo Solicitações)
  ficou incoerente com a seção nova — renomear exige UPDATE (destrutiva, humano).
- h1 do Upload continua "Atualização de Dados" × sidebar "Upload de Arquivos" (pré-existente).
- `rotaInicial` sem entrada para quem tem só áreas de Solicitações (pré-existente).
- Pendências que a memória chamava de "v6.1.1" e ficaram para o próximo patch: split de
  `puladas[].ids` ("a|b") no cliente da RPA; registrar o GATE etapa 2 no WORKING-CONTEXT/out-briefing
  da v6.1.0.

## 9. Aprendizados (régua de 5 destinos)

- **`git mv` deixa o índice sujo — um `git add <arquivo>` + `commit` seguinte leva as renomeações
  junto.** Aconteceu no 1º commit (spec) e foi desfeito antes do push. Destino: nada novo — a regra
  "commits com arquivos específicos" já existe; o detalhe é que o `git mv` já É stage. Fica aqui.
- **Remover guarda de segurança (mesmo inócua no formato) é barrado pelo classificador do harness.**
  Protocolo D5 cumprido (não contornado, registrado, decisão ao Yan). Destino: nada (comportamento
  esperado da 3ª camada).
- **Grupo de sidebar = href-pai prefixo das subabas; subaba pode ter o mesmo href do pai.** Já
  enforçado por `nav-model.test.ts` (destino 1/2) — nada a acrescentar.

## Advisor

| Agente | Consultas | Mudaram o rumo |
|---|---|---|
| Orquestrador | 0 | — (Carta: não consulta) |
| explorador ×4 | 0 | — |
| implementador M1 (Ingestão) | 0 | — |
| implementador M2 (Performance) | 0 | — |
| implementador M3 (API Externa, código) | 1 (momento 3) | 1 — `api-externa` em `PRIORIDADE_INICIAL`; regex do localizador de migration mais tolerante |
| implementador M4 (Exportar) | 2 (momentos 1 e 3) | 0 — confirmou o caminho; pediu greps de sanidade e declarar as decisões |
| revisor / revisor-db | 0 | — |

Custo: pendência do Yan (`/usage`).
