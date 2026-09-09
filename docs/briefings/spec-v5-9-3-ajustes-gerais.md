# v5.9.3 — Ajustes gerais (títulos, grade da DRE, badges, ordenação)

## Contexto

Cinco pedidos do Yan depois de ver a v5.9.2 no ar, todos de UI/leitura, um deles com RPC nova.
Numeração dos itens segue o pedido original (não há 4 e 5).

| # | Pedido | Estado verificado no repo |
|---|---|---|
| 1 | Normalizar cor de títulos/subtítulos e registrar no DS; subtítulo em cinza claro | **Sem primitivo de cabeçalho.** 16 telas em `text-zinc-900`/`text-zinc-400` inline; a DRE (v5.9.2) em `text-text-secondary` (#4B4F54, mais escuro — é a diferença dos prints); auth em `style={{color:var(--text-muted)}}`; subtítulos de seção em 3 dialetos. `docs/design-system.md` só fixa cor do card; `admin/design-system` prescreve "cor terciária" sem nomear token (a brecha). |
| 2 | Gráfico "Resultado Financeiro" ao lado de "Custo dos Serviços Prestados" | Bloco `FIN` existe vivo na árvore de competência (0256 L117, 15 categorias; rótulo `(+/-) Resultado Financeiro` já limpo por `rotuloBloco`). Sai de graça de `folhasPorGrupo`. **Risco:** a escala assume série ≤ 0 (`topo = Math.min(0, …)`); FIN positivo num ano sumiria do gráfico sem erro. |
| 3 | Badge vermelho numérico em "Abertas" e "Aprovadas" (não em "Encerradas") | `Badge variant="count"` é o círculo canônico (`ui/badge.tsx:31-37`). Hoje "Aprovadas (7)" é texto; a contagem já é client-side por escopo (`board-solicitacoes.tsx:72`). |
| 6 | Badge de solicitações de acesso pendentes: sidebar + pill "Solicitações de acesso" | Pill mostra "(N)" em texto (`acessos-content.tsx:38,43`). **Não existe RPC de contagem** — sidebar exige uma (a lista inteira em toda rota é cara). Sidebar tem o mecanismo de badge só para `/solicitacoes`, hardcoded por href (`sidebar.tsx:295`). |
| 7 | Inverter o padrão de ordenação de Vencimento no Gerencial | Default atual: `vencimento` + `desc` (data maior primeiro). **Decisão do Yan:** passa a `asc` (mais antigo → mais novo). |

**Decisões de produto tomadas com o Yan (09/09):** subtítulo = `--text-subtle` (#ACA39A);
alcance = cabeçalho de página **e** subtítulos de seção; item 7 = abrir em `asc`.

**Numeração real:** última migration aplicada `0265` → esta versão toma **`0266`**. Sem ADR novo
(próximo livre segue `0172`; a regra de cor entra no `docs/design-system.md`, não é decisão
arquitetural). `package.json` 5.9.2 → **5.9.3**.

## Abertura (ritual `/nova-versao`, Rota B: o plano é a spec)

1. Esta sessão está numa worktree (`docs+pos-merge-v5-9-2`), então `EnterWorktree name` não
   cria outra. Criar por git a partir daqui (sem `-C` para a raiz):
   ```bash
   git worktree add ../feat+v5-9-3-ajustes-gerais -b feat/v5-9-3-ajustes-gerais origin/main
   ```
   depois `EnterWorktree path=…/feat+v5-9-3-ajustes-gerais`. Se o harness recusar o `worktree
   add`, pedir ao Yan para rodar o comando (`! git worktree add …` na raiz) — não contornar.
2. Ambiente: symlinks `node_modules` e `.env.local` da raiz + `supabase/.temp` (passo 3 do ritual).
3. **1º commit:** este plano vira `docs/briefings/spec-v5-9-3-ajustes-gerais.md`.
4. Ler `.claude/skills/orquestracao/SKILL.md` (Carta) antes de despachar subagentes.

## Missões (paralelização por arquivos disjuntos)

Subagentes `implementador` (Sonnet) com campo "Skills a ler". Arquivos-ímã de dono único:
`src/lib/rpc-contrato.test.ts` (M2 e M6 o tocam → **só a sessão principal edita**),
`acessos-content.tsx` (M6 é o dono; M1 **não** o toca), `grade-proporcao.tsx` (M2 é o dono;
M1 não o toca). Onda 1 em paralelo: **M1, M2, M3, M7**. Onda 2: **M6** (depende do padrão de
cabeçalho de M1 para aplicar em `acessos-content.tsx`). Gates `tsc`+`lint` por missão na sessão principal.

### M1 — Cabeçalho de página e subtítulos: um token só (item 1)
Skills a ler: `ui-design-system`.

**Regra que fica:** título de página `text-xl font-semibold text-text-primary`; subtítulo
`mt-0.5 text-sm text-text-subtle`; wrapper `mb-6`. Subtítulo de **seção/card** também
`text-text-subtle` (via classe; onde hoje é `style`, migrar para classe — o lint só vê classe).
Títulos de seção não mudam de identidade: `TopSection` segue `--brand-deep` (ADR-0037); títulos
de card seguem `--text-primary`.

- Cabeçalhos de página (h1/p) — trocar `text-zinc-900`→`text-text-primary`, `text-zinc-400`→
  `text-text-subtle`: os 17 pares listados pelo mapeamento (`admin/solicitacoes/page.tsx:24-25`,
  `admin/solicitacoes/movimentacoes`, `admin/api-externa/{page,documentacao}`, `admin/uploads:707`,
  `performance/layout.tsx:10-11`, `metas/comparacao:59`, `financeiro/dre/estrutura{,-competencia}`,
  `solicitacoes/solicitacoes-content.tsx:61-62`, `gestao-pessoas/inventario/inventario-content:104`,
  `financeiro/calculadora-rateio:120`, `financeiro/acervo-documentos:157`, `metas/cadastro-grade:482`,
  `metas/acompanhamento-content:34`, `financeiro/faturamento-corp-content:36`) +
  `financeiro/dre/page.tsx:363-364` (`text-text-secondary`→`subtle`) + `admin/design-system/page.tsx:13,16`
  + auth (`login`, `trocar-senha`, `solicitar-acesso`, `auth/confirm`, `sem-acesso`: subtítulo
  `--text-muted`→`--text-subtle`). **Excluir** `acessos-content.tsx` (M6) e `grade-proporcao.tsx` (M2).
- Subtítulos de seção: `shared/top-section.tsx:63`, `ui/card.tsx:32`,
  `financeiro/collapsible-section.tsx:36`, `financeiro/fluxo-caixa/page.tsx:95` (CardTitle local),
  `dre/cascata-card.tsx:48,55`, `dre/editor-dre.tsx:291,426,508,514`, `weddings/sumario-subsetor.tsx:55`.
- **Documentar:** `docs/design-system.md` — seção nova "Cabeçalho de página" + coluna de cor na
  tabela de tipografia (l.73-89) + `--text-secondary` entra na tabela de tokens (l.11-19, hoje
  ausente) com uso declarado; `.claude/skills/ui-design-system/SKILL.md` §3 ganha a regra em 4 linhas;
  `src/app/admin/design-system/page.tsx:117-123,556-559` passa a dizer o que o código faz
  (`text-xl`, tokens nomeados, não "cor terciária").
- **Enforcement (régua destino 1):** `eslint.config.mjs` é protegido pelo hook → não editar. Em vez
  disso, teste-sonda `src/styles/cabecalho-pagina.test.ts` (molde: `nav-model.test.ts:228-249`) que
  varre `src/app/**` e `src/components/**` e reprova `<h1` com `zinc-` e `<p` de subtítulo com
  `zinc-400`/`text-text-secondary`/`text-text-muted` logo após um h1. Deixar no out-briefing o diff
  pronto do lint (`zinc` no `COR_CRUA_TAILWIND`) para o Yan decidir — é o "follow-up futuro" que a
  skill anuncia, mas mexe em 400+ ocorrências e é decisão dele.

### M2 — "Resultado Financeiro" na grade de proporção (item 2)
Skills a ler: `graficos`.

- `src/lib/dre/proporcao-grupos.ts:42-44` — `GRUPOS_PROPORCAO = ['CUSTO','FIN','ADM','COM','MKT','ESTR','RH','RHB']`.
  `janela` (L214-241): **tirar o pressuposto ≤ 0** — o clamp `topo = Math.min(0, …)` só vale quando
  todos os pontos da série são ≤ 0; série com ponto positivo tem topo livre (ticks dentro do domínio
  como hoje). Comentários "sete"→"oito" (L109, L153).
- `src/components/financeiro/dre/grade-proporcao.tsx` — L191 `[custo, fin, ...despesas]`; L216 vira
  `grid grid-cols-1 gap-3 sm:grid-cols-2` com os dois; `AJUDA` (L30-39) deixa de afirmar "são negativos
  porque são despesa" e passa a "oito gráficos", explicando que Resultado Financeiro é (+/−). Subtítulo
  L212 → `text-text-subtle` (regra da M1). Δ: mantém a semântica (Δ positivo = melhora) — vale para FIN.
- Testes: `proporcao-grupos.test.ts` — "oito séries, CUSTO primeiro, FIN segundo"; `dominio[1] ≤ 0`
  só para séries sem ponto positivo; caso novo: série com ponto positivo cabe no domínio. Sessão
  principal ajusta `rpc-contrato.test.ts:1804-1851` (rótulos "8 grupos"; o caso das janelas já mede
  o sinal REAL do FIN nos 3 anos contra a base viva — é o gate).
- `dre/page.tsx` não muda (recebe a lista da constante).

### M3 — Badges em "Abertas" e "Aprovadas" (item 3)
Skills a ler: `ui-design-system`.

- `src/components/solicitacoes/board-solicitacoes.tsx` — extrair os predicados de `ABA` (L19-24) para
  `src/lib/solicitacoes/abas.ts` (`contarPorAba(lista)`), testado em `ciclo-de-vida.test.ts`; L86-93:
  `Badge variant="count"` (já importado, L8) para `abertas` e `aprovadas` quando > 0, remover o
  `(${nAprovadas})` textual; `encerradas` sem badge. Contagem sobre `solicitacoes` (escopo atual, antes
  da busca) — igual ao "(7)" de hoje. Registrar no out-briefing que a "Caixa de entrada" conta
  abertas+aprovadas de `mim+role` pela RPC (`solic_minhas_pendencias`), e por isso os três só somam
  quando o escopo é `mim_e_role` — comportamento pré-existente, não defeito novo.

### M6 — Pendências de acesso: RPC + sidebar + pill (item 6)
Skills a ler: `banco-e-rpc`, `contrato-rpc-front`, `ui-design-system`, `react-padroes`.

- `supabase/migrations/0266_admin_acesso_pendentes.sql` (**ADITIVA**, declarada no header):
  `public.admin_acesso_solicitacoes_pendentes() returns integer`, `plpgsql STABLE SECURITY DEFINER
  SET search_path=''`, `PERFORM app.exigir_acesso(ARRAY['admin/acessos'])`, `count(*)` em
  `app.rbac_solicitacoes WHERE status='pendente'`; REVOKE PUBLIC/anon, GRANT authenticated/service_role
  (molde: `0261:339-351`). Antes de aplicar: conferir `0266` livre no banco (`npx supabase migration
  list`) e nas worktrees irmãs. Aplicar com `npm run db:migrate -- --aditiva`; verificar via REST.
- `src/lib/acessos/pendencias.ts` — `getAcessosPendentes = cache(() => call(..., z.number()))`
  (molde `src/lib/solicitacoes/rpc.ts:12-33`, helper de tipagem frouxa).
- `src/app/layout.tsx:39-40` — segunda promise **não-aguardada**, criada **só** se a sessão tem
  `admin/acessos` (gate no TS, antes da RPC; `.catch(() => null)`).
- `src/components/layout/sidebar.tsx` — generalizar: `UsuarioSidebar.pendenciasPromise` vira
  `badgesPorHref?: Record<string, Promise<number|null>>`; L295 passa a `badgesPorHref?.[href]`. Manter
  os invariantes de `nav-model.test.ts:228-249` (2× `<SidebarContent`, sem redeclarar NAV_*).
- `src/components/admin/acessos/acessos-content.tsx` — pill com `Badge variant="count"` (importar),
  sem o "(N)" textual; aplicar aí o padrão de cabeçalho da M1 (L49-50).
- `src/app/admin/acessos/page.tsx:32-33` — `erroCarga` passa a considerar `solicitacoesRes.error`
  (hoje falha da lista vira 0 silencioso; com o badge da sidebar vindo de outra RPC, seriam dois
  números vizinhos discordando).
- Sessão principal: `rpc-contrato.test.ts` — RPC nova na lista viva (bloco L285-302) e negação anon
  (molde L833-835). `revisor-db` obrigatório antes de aplicar.

### M7 — Gerencial abre do mais antigo para o mais novo (item 7)
- `src/components/financeiro/gerencial/base-dados-tab.tsx` — extrair `DIR_PADRAO_COL` (L121-123) e
  `comparadorLancamentos` (L143-161) para `src/lib/gerencial/ordenacao.ts` (molde
  `weddings/ordenacao-operacoes.test.ts`); `vencimento: 'asc'` e `useState<DirOrd>('asc')` (L249);
  comentário L243-247 atualizado. Teste puro fixa o default e a direção (`asc` = data menor primeiro).
  Toggle (L250-253) inalterado: 1º clique em Vencimento vai para `desc`.

## Fechamento (`/fechamento-versao`)

- Gates: `tsc`+`lint` por missão; `npm run build` + `npm test` na fronteira e no fim (baseline 1171).
- `revisor` (sempre) + `revisor-db` (0266) antes dos gates finais; `verificador-visual` se disponível;
  senão, modelo "entregar → Yan confere → ajustar" com `npm run dev -H 0.0.0.0`.
- Out-briefing, `CHANGELOG.md`, `src/data/changelog-diretoria.ts` (sem reescrever entradas antigas
  que dizem "sete"), version bump 5.9.3, `docs/WORKING-CONTEXT.md` (0266 aplicada, próxima 0267),
  PR **draft** `feat/v5-9-3-ajustes-gerais` → main. Merge é do Yan.

## Verificação ponta a ponta

- `npm test`: sonda de cabeçalho reprova qualquer `zinc` restante; `proporcao-grupos` com 8 séries;
  contrato vivo prova que `FIN` tem folhas vivas e que os 8 pontos×3 anos cabem no domínio (mede o
  sinal real do resultado financeiro); `contarPorAba`; ordenação do Gerencial; RPC 0266 no contrato
  e negada a anon.
- REST com service_role: `admin_acesso_solicitacoes_pendentes` devolve inteiro = pendentes reais.
- Tela: `/financeiro/dre` (subtítulo mais claro; 1ª linha da grade com 2 gráficos; FIN legível mesmo
  quase reto), `/solicitacoes` (badges em Abertas/Aprovadas, Encerradas sem), `/admin/acessos` e
  sidebar (badge de pendentes; sem badge para quem não tem a área), `/financeiro/fluxo-caixa/gerencial`
  (abre 2024 no topo), varredura visual dos cabeçalhos das 25 telas.

## Fora do escopo (registrar no out-briefing)
Tokenizar as ~400 ocorrências de `zinc-*` fora dos cabeçalhos · estender o lint `wt/no-cor-hardcoded`
a `zinc` (diff pronto, decisão humana: config protegida) · fazer a "Caixa de entrada" respeitar o
escopo selecionado · reescrever textos históricos do changelog que citam "sete gráficos".
