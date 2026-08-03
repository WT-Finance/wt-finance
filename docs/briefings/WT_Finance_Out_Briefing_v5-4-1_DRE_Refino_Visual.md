# Out-Briefing v5.4.1 — DRE: refino visual (Resumo Executivo + Decomposição)

**Tipo:** PATCH · **Rota A** · **Branch:** `feat/v5-4-1-dre-refino-visual` · **Base:** `main` @ `2444247` (v5.4.0)
**Migrations:** nenhuma · **ADR:** nenhum · **Data:** 2026-08-03
**Sessão A de duas em paralelo** (a B é a v5.4.2, Weddings) — esta mergeia primeiro.

> **Nenhum número mudou.** A versão inteira é apresentação. A conferência de que isso é
> verdade está na §6.

---

## 1. O que a versão entregou

| # | Missão | Estado |
|---|---|---|
| **M0** | Extração da gramática contábil compartilhada (`celula-contabil.tsx`) | ✅ (não estava no briefing — ver §2) |
| **M1** | Resumo Executivo com a identidade visual da tabela | ✅ |
| **M2** | "Editar estrutura" entre a tabela e o Resumo | ✅ |
| **M3** | Selo de última atualização | ✅ — **sem migration** (ver §3) |
| **M4** | Decomposição: pills, cor plana, expansão inline com cortina | ✅ |
| **M5** | Fechamento (este documento, CHANGELOGs, bump, PR) | ✅ |

---

## 1b. Rodada de ajustes (03/08, depois de o Yan ver a tela)

Sete ajustes pedidos após a primeira olhada, todos de apresentação e todos sem mexer em número:

| # | Ajuste | Nota |
|---|---|---|
| 1 | `Δ% 25·26` → **`Δ% YTD 25·26`** na visão Consolidado | A variação sempre foi entre YTDs; a coluna vizinha à esquerda é um ano cheio, o que tornava a leitura errada a mais natural |
| 2 | Resumo Executivo vira **card próprio** | Some uma duplicação: ele nunca dependeu de `dados`, só de `consolidadoAnos` — dentro da `TabelaDre` precisava ser renderizado nos dois ramos. A prop `anoCorrente` saiu da tabela (existia só para atravessá-la) |
| 3 | `Δ 24→25` → `Δ 24·25` · `Δ YTD` → **`Δ YTD 25·26`** | Mesma convenção do Consolidado; "Δ YTD" sozinho não dizia quais anos comparava |
| 4 | Linhas do Resumo: `--band` → **`--band-soft`** (subgrupos) | O box já é `--band`; com as linhas na mesma cor, cabeçalho e corpo viravam um bloco só |
| 5 | **Cor por sinal em TODA célula** do Resumo | Reverte a neutralidade dos absolutos. Sobre banda clara exige os `-deep`: `corPorSinal('sub', …)` — os tons base reprovariam AA, a mesma armadilha da §"Risco de acessibilidade" |
| 6 | Decomposição: **"‹ voltar" removido**; **Total fixo e alinhado** entre os lados; **scroll por lado** | Cada lado virou coluna flex `h-full max-h-[420px]` com o grid em `items-stretch`; só a lista rola (`ScrollAutoHide`, que já se dimensiona por cadeia flex), título e Total ficam fora dela |
| 7 | Mais respiro entre as pills e o conteúdo (`mb-5` → `mb-8`) | — |

**Detalhe que a integração pegou:** o thumb do `ScrollAutoHide` é `absolute right-1` e, sem folga,
flutuaria **por cima** dos valores alinhados à direita. Entrou o gutter `pr-3.5`, a mesma convenção
que a tabela da DRE já usa no limite do seu scroll.

**Sobre o alinhamento dos Totais:** o teto comum de altura é o mecanismo. O lado com menos barras
fica com espaço vazio antes do Total — isso é o que faz os dois caírem na mesma linha, e é
esperado, não sobra de layout. O `420px` foi escolhido para caber ~6–8 barras sem rolar; **é o
número mais arbitrário desta entrega** e o mais provável de o Yan querer ajustar depois de ver.

---

## 2. Três divergências entre o briefing e o repo (achadas no plan mode)

**(a) A M3 não precisava de migration.** O briefing previa "aditiva mínima se a RPC de status
não expuser a base". Ela expõe: `public.status_lancamentos_movimentacao()`
(`supabase/migrations/0185_raw_lancamentos_movimentacao.sql`) já devolve
`{total, ultima_atualizacao: max(carregado_em) FROM raw.lancamentos_movimentacao}` —
exatamente a semântica pedida. **Consequência:** sem migration, sem `revisor-db`, sem
backup-gate, e o passo das cópias 0950–0954 do `/nova-versao` não se aplicou (elas, aliás, já
foram renumeradas para 0210–0214 no merge da v5.4.0 — o passo 4 do ritual está pronto para ser
removido).

**(b) A escala das barras-filhas já era proporcional ao maior filho.** `montarDrill` já devolvia
`maior` e a largura já era `Math.abs(d.valor) / drill.maior` desde a v5.3.1. Item do briefing
satisfeito sem uma linha de código.

**(c) A M2 tinha DOIS call-sites, não um.** `<ResumoExecutivo>` + `<RodapeAcoes>` aparecem no
ramo normal **e** no ramo fail-safe de `tabela-dre.tsx`. Inverter num só faria os dois ramos
divergirem na ordem — o tipo de divergência que ninguém vê até a RPC de um ano falhar.

**A M0 nasceu da M1.** O briefing pedia "reuso de primitivos, nada duplicado", mas as duas peças
que o Resumo precisava (`ConteudoContabil` e `corPorSinal`) eram funções privadas de
`tabela-dre.tsx`. Extrair veio antes de reusar.

---

## 3. Decisões técnicas que valem registro

**Por que o selo lê pelo admin client.** `status_lancamentos_movimentacao` tem
`REVOKE ... FROM authenticated` e `GRANT` só para `service_role` (ela serve `/admin/uploads`). Duas
saídas: abrir `GRANT TO authenticated`, ou ler no servidor com o admin client. Escolhi a segunda —
a primeira exporia a **contagem de linhas da raw** a todo usuário logado, muito mais superfície do
que um selo de data pede. A leitura acontece dentro da página que já executou
`requireArea('financeiro/dre')`, e o que atravessa para o cliente é um timestamp. É o padrão vivo de
`src/lib/metas/ultima-sincronizacao.ts` (que lê `monde_ingest_status` assim desde a v5.1.8).

**Por que `UltimaAtualizacao` ganhou uma prop em vez de um clone.** O componente de Metas já
resolvia ícone, formatação e — de graça — o invariante "sem data nunca aparece" (`iso` nulo ⇒
retorna `null`). O que não servia era a vigília de atraso: os 45min embutidos em
`sincronizacaoAtrasada` são a régua do **cron do Monde**, que avança a cada ~15min. A fonte do selo
da DRE é um upload de **cadência humana** — com aquela régua o alerta ficaria vermelho quase sempre,
e alerta permanente não é alerta, é ruído. Prop `vigiarAtraso` (default `true`): os 3 call-sites de
Metas não mudaram uma linha.

**Um achado de acessibilidade que a M1 quase introduziu.** Mover as linhas do Resumo para `bg-band`
(a cor de `blocoH`) mantendo o `corDelta` local teria criado uma regressão silenciosa: os tons base
(`text-positive`/`text-negative`) dão **3,88–4,31:1** sobre as bandas claras e **reprovam AA** — a
tabela usa os `-deep` (7–10:1) exatamente por isso, e o Resumo, que antes vivia sobre fundo branco,
não tinha motivo para saber disso. Passar a usar `corPorSinal('blocoH', …)` resolve e é o mesmo
movimento do reuso. **É a segunda vez que a régua de contraste da DRE paga a extração** — vale como
argumento para nunca copiar cor de célula entre componentes deste card.

**Por que o drill é computado para TODA barra.** Com o conteúdo montado só quando o item está ativo,
ele desmontava no mesmo render em que `ativo` virava `false`: a cortina abria animada e **fechava
colapsando uma caixa vazia**. Manter montado nos dois estados (com `inert` no fechado) é o que o
`TopSection` faz, e é o que faz o fechamento animar igual à abertura. Custo: um filter+sort por
barra (≤7 barras × ~130 categorias), memoizado. **O subagente que implementou a M4 sinalizou esse
efeito por conta própria** ao entregar — foi corrigido na integração, não descoberto depois.

---

## 4. Arquivos

| Arquivo | O quê |
|---|---|
| `src/components/financeiro/dre/celula-contabil.tsx` | **NOVO** — `ConteudoContabil` + `corPorSinal` + `TipoLinha`, extraídos sem mudança de comportamento |
| `src/components/financeiro/dre/resumo-executivo.tsx` | Reescrito na gramática da tabela; título + "?"; sem subtítulo |
| `src/components/financeiro/dre/tabela-dre.tsx` | Perde as 2 funções extraídas; `CabecalhoCard` com o selo; ordem `RodapeAcoes` → `ResumoExecutivo` nos 2 ramos; prop `ultimaCargaMovimentacao` |
| `src/lib/dre/ultima-carga-movimentacao.ts` | **NOVO** — leitura fail-safe do frescor da base |
| `src/app/financeiro/dre/page.tsx` | Busca o frescor em paralelo e passa por prop |
| `src/components/metas/ultima-atualizacao.tsx` | Prop `vigiarAtraso` (default `true` — Metas intacta) |
| `src/components/financeiro/decomposicao-lancamentos.tsx` | Pills abaixo do título; cor plana; drill inline com cortina; chevrons do lucide |
| `CHANGELOG.md` · `src/data/changelog-diretoria.ts` · `package.json` | Documentação e bump 5.4.0 → 5.4.1 |

---

## 5. Gates

| Gate | Resultado |
|---|---|
| `npm run build` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run lint` | ✅ — 0 erros, **0 warnings** |
| `npm test` | ✅ — **595 testes**, 40 arquivos |

Gates por missão (`tsc` + `lint`) rodaram ao fim de cada uma. `.next` foi removido antes da rodada
final porque o `next dev` da §7 deixa `.next/dev/types/*` que o `tsc` varre (armadilha registrada na
v5.3.3).

---

## 6. Prova do invariante "nenhum número muda"

Verificado na FONTE, não por impressão visual:

- **Resumo:** as 6 chaves (`REPASSE`, `RB_H`, `ROL`, `LB`, `LOP`, `REX`) e a ordem estão idênticas;
  `valorLinha`, `delta`, `aa` e `encontrarAno` não aparecem no diff (inalteradas). O único campo
  novo em `LINHAS` é `prefixo`, que é rótulo. A troca `fmtContabil(valor ?? 0)` →
  `<ConteudoContabil valor={valor} />` preserva o caso nulo: ambos caem em `–`.
- **Decomposição:** o diff da superfície numérica (`pctBarra`, `pctTotal`, `larguraBarra`,
  `drill.maior`, `MAX_FATIAS`, `LIMITE_PCT`, os épsilons de `0.005`, a regra de sinal e a agregação
  em "Outros") é **puramente reindentação** — as linhas `-` e `+` são iguais módulo espaço em branco.
- **Escopo trancado:** nenhum arquivo de `performance/weddings`, `src/lib/fmt.ts`,
  `supabase/migrations/`, do motor (`get_dre_mensal`) ou do editor de estrutura foi tocado.
- **Selo conferido contra o dado real** por REST/`service_role`:
  `status_lancamentos_movimentacao` → `{"total": 115583, "ultima_atualizacao": "2026-07-27T12:51:20.842913-03:00"}`.
  Com `fmtDataHoraLongoSP` isso vira "27 de julho de 2026, 12:51".

---

## 7. ⚠️ O que ficou NÃO VERIFICADO — conferência visual ao vivo

**O invariante 4 do briefing ("conferência visual ao vivo obrigatória") NÃO foi cumprido, e esta é
a pendência mais importante desta entrega.**

A sessão rodou em **background**, onde duas coisas se somam:

1. O **MCP Playwright não sobe** em sessão headless/background (registrado na v5.3.3) — o
   `verificador-visual` voltaria "NÃO VERIFICADO" por falta das ferramentas `browser_*`.
2. A saída alternativa provada na v5.3.3 (script headless com o Chromium do cache do MCP) serve
   para telas **sem sessão**. `/financeiro/dre` exige sessão: subi o `npm run dev` e medi —
   `GET /financeiro/dre` responde **`307 → /login?next=%2Ffinanceiro%2Fdre`**. O proxy barra antes
   de a página renderizar, e eu não tenho (nem devo inventar) credencial.

**Nota:** existe `BYPASS_AUTH=true` no `.env.local`, mas **nenhum código em `src/` lê essa
variável** — é resíduo de uma versão antiga e não abre nada. Não confiar nela.

O que *foi* possível provar sem browser: o `next dev` subiu limpo, o build de produção passou e o
log do dev não registrou nenhum erro de runtime.

**Portanto, a conferência do checkpoint do Yan é a primeira e única passada visual desta versão.**
Vale olhar, em ordem (atualizado após a rodada de ajustes da §1b):

1. A sequência de cards: **[DRE: tabela + "Editar estrutura"] → [Resumo Executivo] → [Decomposição]**.
2. O **Resumo** — se lê como a mesma família visual da tabela; se as linhas em `--band-soft`
   destacam o cabeçalho; se o verde/vermelho por sinal ficou legível sobre a banda clara; e se
   2–3 valores batem com os da tabela.
3. Os rótulos de variação: **`Δ 24·25`** e **`Δ YTD 25·26`** no Resumo, **`Δ% YTD 25·26`** na visão
   Consolidado da tabela.
4. O **selo** no canto superior direito do card da DRE, com "27 de julho de 2026, 12:51" (a menos
   que haja upload novo).
5. A **Decomposição**: os dois **Totais na mesma linha horizontal** com quantidades diferentes de
   barras de cada lado; uma barra aberta mostrando os filhos logo abaixo dela, com o Total imóvel;
   o **fechamento animando igual à abertura**; e o scroll próprio de cada lado quando um deles
   estourar os 420px (⚠️ **esse número é o mais arbitrário da entrega** — se cortar cedo ou tarde
   demais, é um `max-h-[…]` de uma linha).
6. **Tela estreita:** o selo deve quebrar para baixo do título sem encostar na toolbar.
7. O **"?"** ao lado de "Resumo Executivo" mostrando a ressalva da ancoragem no ano corrente.

---

## 8. Parecer da revisão

**`revisor` — veredito: APROVADO COM RESSALVAS. Zero CRÍTICO, zero ALTO.**

### MÉDIO (1) — endereçado, não registrado

**`decomposicao-lancamentos.tsx:58` — `COR_OUTROS = '#B8B2A8'` é hex cru, fora do sistema de
tokens.** O revisor notou o agravante que fecha o caso: o token que serviria **já existia** —
`--text-subtle` (`#ACA39A`, "Pantone Warm Gray 5"), quase idêntico. E explicou por que o lint não
pegou: `wt/no-cor-hardcoded` inspeciona classes Tailwind, e essa cor entra por
`style={{ background: it.cor }}`. É um ponto cego real do enforcement, não uma falha de atenção.

**Corrigido:** `COR_OUTROS = 'var(--text-subtle)'`. A diferença de tom é imperceptível e a decisão
de produto do Yan ("Outros" dessaturado por ser agregado) fica preservada. Com isso o arquivo
**não tem mais nenhum hex cru** — o item "hex intermediários das paletas da Decomposição" das filas
ativas do WORKING-CONTEXT está integralmente quitado (sobra o `zinc`, que é outro item).

### BAIXO (2) — registro, ambos pré-existentes

1. **Tipografia do cabeçalho diverge da skill `tabela-densa`** (que pede caixa normal e
   `font-medium`; a DRE usa `uppercase`/`tracking-[0.09em]`/`font-semibold`). **Não é regressão
   desta versão** — o cabeçalho da própria tabela da DRE já divergia, e espelhá-lo aqui é
   justamente o objetivo da M1. Fica o registro para quem revisitar a tipografia da DRE:
   `ThConta` e `ThResumo` teriam de mudar **juntas**.
2. **O gatilho "?" não é alcançável por teclado** (é um `<span>` sem `tabIndex`, e o `<Tooltip>` do
   DS abre em `group-hover/tip`, não em `:focus`). Reuso byte-idêntico de um padrão já em produção
   (`posicao-projetado.tsx:251`, `fluxo-caixa/page.tsx:76`) — o texto está em `aria-label`, então
   leitor de tela alcança. A correção real é no primitivo e afeta os outros call-sites: fora do
   escopo de um refino da DRE. Ver §10.

### Verificado pelo revisor sem achado

Zero mudança de valor (as duas peças); fidelidade da extração de `celula-contabil.tsx`; contraste
AA no Resumo (confirmou que `CelulaDelta` usa os `-deep` e que o hardcode de `'blocoH'` é o correto,
porque as 6 linhas pousam todas na mesma banda clara independentemente do tipo estrutural real);
indexação `resultados[i] ↔ anosDre[i]` intacta e nenhum `.catch()` em thenable; a fronteira de
segurança do admin client (só `ultima_atualizacao` atravessa — a contagem nunca sai da função);
deps dos `useMemo`; ausência de `<button>` aninhado; `inert` no elemento certo; nenhum
`position:absolute` dentro da cortina; os 3 call-sites de Metas não passam `vigiarAtraso`; nenhum
`console.log`; escopo trancado.

**`revisor-db`: N/A declarado** — a versão não tem migration nem RPC nova.
**`verificador-visual`: NÃO EXECUTADO** — motivo e consequência na §7.

---

## 9. Pendências e decisões que ficam com o Yan

1. **Conferência visual (§7)** — a única passada visual desta versão.
2. **Mergear ANTES da v5.4.2** (Weddings), para o CHANGELOG ficar cronológico. Se a v5.4.2 ficar
   pronta primeiro, ela rebasa; esta não.
3. **Reconciliar a data do CHANGELOG_DIRETORIA** ao horário real do merge no `/pos-merge` (a
   entrada nasceu com o horário de autoria, `2026-08-03T13:25`).
4. Herdadas e ainda abertas na DRE: conceder a área `financeiro/dre` às roles; conferir o Resumo
   contra a planilha da controladoria; centavos na barra; 3 blocos do seed em CAIXA ALTA (ajuste é
   no editor da estrutura, não em código).

---

## 10. Aprendizado permanente (régua de 5 destinos)

**Destino 4 — skill de domínio (`ui-design-system`), duas adições:**

1. **§1.2 ganhou o ponto cego do lint de cor.** `wt/no-cor-hardcoded` inspeciona **classe**; cor
   que entra por `style={{ background: … }}` — o caminho obrigatório de barra e série de gráfico —
   passa batido. A regra do DS vale igual ali, e quem garante é a leitura. Registrado com o caso
   vivo desta versão.
2. **§2.1 (nova) — a cortina.** A curva (450ms `cubic-bezier(.32,.72,0,1)` sobre
   `grid-template-rows`) já existia em `top-section.tsx` mas não estava documentada em lugar
   nenhum, e a M4 precisou dela. Junto foram as duas regras que não são óbvias: **conteúdo montado
   nos dois estados com `inert`** (desmontar faz o fechamento colapsar caixa vazia — o defeito
   desta versão) e **nada de `position:absolute` dentro do clip**.

**Destino 1 — enforcement mecânico: proposta, NÃO aplicada (protocolo D5).** O caso ideal seria
o lint alcançar `style={{ background: '#…' }}`. A regra vive em `eslint-rules/`, que o hook
`protecao-config` **bloqueia por construção** — e o escape é variável de ambiente que o agente não
alcança, de propósito. Não contornei. **Fica como proposta para o Yan:** estender
`wt/no-cor-hardcoded` com um segundo seletor que pegue literal de hex em valor de propriedade
dentro de `JSXExpressionContainer` de `style`, com a mesma lista de exceções (`src/lib/email/**`).
Enquanto não existir, o destino 4 acima é a rede.

**Destinos 2, 3 e 5:** nada. Nenhum aprendizado desta versão é transversal o bastante para o core
(que está em 162 linhas de um teto de 180 — o espaço é para o que TODA sessão precisa), nenhum
procedimento novo virou ritual, e nada ficou coberto ao ponto de poder ser deletado.

**Convenção de banco:** inalterada — `banco-e-rpc` e o checklist do `revisor-db` não precisaram
de ajuste (nota D-12 não se aplica).

---

## 11. Achados fora do escopo (registro, não correção)

- **Débito das filas ativas QUITADO neste arquivo:** os "hex intermediários das paletas da
  Decomposição" saíram com a cor plana, e o último hex cru (`COR_OUTROS`) virou token na correção
  do MÉDIO. `decomposicao-lancamentos.tsx` **não tem mais nenhum hex**. O `zinc` do mesmo item do
  WORKING-CONTEXT continua lá, e é o que resta dele.
- **`BYPASS_AUTH` é resíduo morto** no `.env.local` (nenhum leitor em `src/`). Não é do escopo desta
  versão remover, mas vale saber que ela não protege nem libera nada — alguém pode confiar nela um dia.
- **O `<Tooltip>` do DS abre em `group-hover/tip`, não em `:focus`**, apesar de o comentário dele
  dizer "hover/foco". Quem navega por teclado não vê o balão. Nesta versão o texto foi duplicado em
  `aria-label` no gatilho (leitor de tela alcança), mas a correção real é no primitivo e afeta os
  outros call-sites — fora do escopo de um refino da DRE.
- **Passo 4 do `/nova-versao` está pronto para ser removido:** as migrations 0950–0954 já foram
  renumeradas para 0210–0214 no merge da v5.4.0. O bloco tem um comentário `REMOVER na renumeração
  pós-v5.3` que agora se aplica.
