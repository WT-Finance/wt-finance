# Out-briefing v5.4.2 — Weddings: Margem anualizada + Fluxo de Caixa unificado

**Tipo:** PATCH · **Migration:** 0228 (aditiva, aplicada e verificada) · **ADR:** 0162 ·
**Base:** `main` @ v5.4.1 (rebase feito) · **Branch:** `feat/v5-4-2-weddings-margem-fluxo` ·
**Rota A** · Sessão B de duas em paralelo (a v5.4.1 mergeou primeiro, #207+#208)

---

## 1. O que o briefing errou (achado antes de escrever código)

O briefing declarava **"Migration: uma aditiva (alargar a janela da RPC dos gráficos)"**.
Isso está errado: a janela **sempre foi parâmetro do chamador**, e
`get_acumulado_weddings` já a clampava em `LEAST(GREATEST(p_meses_passados,1),120)` e
`...,60)` desde a **migration 0141** (linhas 46–47). Os 48+36 sugeridos cabiam folgados.
Alargar foi **mudança de argumento no call-site**, não de schema.

Em compensação, o briefing **não previu** a migration de que a versão realmente
precisava. A M1 pede a coluna nova **ordenável**, e a Lista de Operações **pagina no
servidor** (`ROW_NUMBER()` + `p_pagina`/`p_por_pagina`) com a whitelist de `ORDER BY`
terminando em `ELSE 'd_data_evento'` — um **fallback silencioso**. Ordenar só no cliente
reordenaria as 10 linhas visíveis enquanto o cabeçalho anuncia ordenação global; pedir
`margem_aa` sem tocar o SQL ordenaria por data do evento **sem avisar**. Daí a **0228**.

Coincidência útil: "uma migration aditiva" seguiu verdadeiro — mas é outra migration,
por outro motivo.

**Outros dois pontos do briefing checados contra o repo:**

- **"Duração"** (item aberto do plano de paralelização): confirmada como
  `data_evento − data_venda_contrato` em **dias** no servidor (`d_duracao`), exibida em
  meses de **30,44 dias** (`fmtMeses`). Servidor e cliente concordam (transformação
  monotônica), então é seguro dividir por ela. Registrado no tooltip e no ADR.
- **Totais imunes ao slider**: o briefing pedia; a RPC **já** calculava
  `total_a_receber`/`total_a_pagar` sem recorte de data (só por operação). Confirmado por
  **medição**, não por leitura: idênticos ao centavo em 24+18 e em 48+36
  (R$ 10.230.558,92 e R$ 11.396.318,12).

---

## 2. Missões

| # | Estado | Notas |
|---|---|---|
| **M1** — Lista de Operações | ✅ | Coluna "Margem (a.a.)", renomes, Exportar, migration 0228 |
| **M0** — GATE (mockup) | ✅ | Aprovado pelo Yan, com 2 pedidos de ajuste (slider + limites) |
| **M2** — TopSection + totais + filtro | ✅ | TopSection própria; filtro no topo; totais em card próprio |
| **M3** — Card único + slider | ✅ | Slider entre os gráficos; acumulado reinicia; referência na janela |
| **M4** — Fechamento | ✅ | Este documento, ADR-0162, CHANGELOGs, bump, WORKING-CONTEXT, PR |

### Decisões do Yan no gate (e depois dele)

1. **Mockup aprovado.**
2. **Slider deve seguir o padrão do Fluxo de Caixa** → a geometria de
   `financeiro/posicao-projetado.tsx` foi **extraída** para o primitivo
   `components/shared/slider-horizonte.tsx` em vez de reimitada de olho.
3. **Limite de 36 meses para cada lado.**
4. **`*` de ciclo curto → ajuda "?" no cabeçalho.** ⚠️ **Consequência:** não há mais
   marca **por linha** nas operações curtas — o aviso vive só no cabeçalho. Se a marca
   por linha for desejada de volta, é uma linha de código.
5. **"Margem a.a." → "Margem (a.a.)"** (a coluna do Excel seguiu `Margem a.a. (%)`;
   `Margem (a.a.) (%)` duplicaria os parênteses — decisão pequena, reversível).
6. **Mesma regra de cor da "Margem"** (faixa alvo/atenção), no lugar da cor por sinal
   que eu havia implementado. **Medido antes de aplicar:** 79 das 237 operações (33%)
   caem em banda diferente nas duas colunas — 25 vermelhas no a.a. com Margem verde (o
   efeito pretendido) e 10 no inverso (ciclo curto). Exemplo real: *Amanda e Felipe*,
   margem 10,5% (vermelho) em 1,6 meses → 76,7% a.a. (verde).
7. **Referência de saídas mantida como especificada.** Registrado que ela **coincide por
   construção** com o acumulado de saídas do último mês visível (era assim antes também);
   antes da borda direita, funciona como benchmark prospectivo.

---

## 3. Banco

**Migration 0228** — `CREATE OR REPLACE` de `get_operacoes_weddings__nucleo` acrescentando
a coluna derivada `d_margem_aa` à CTE `base` e a entrada `WHEN 'margem_aa'` à whitelist de
`ORDER BY`. Assinatura idêntica (9 parâmetros) ⇒ REPLACE puro, sem `DROP+CREATE` (o
precedente do ADR-0126 vale para **parâmetro novo**, que não é o caso). Shape do retorno
idêntico — `d_margem_aa` é chave interna e **não entra** no `jsonb_build_object`, logo
nenhum schema Zod muda.

- Classificador do gate (rodado antes de aplicar): **`aditiva`, zero motivos**.
- Conjunto pendente conferido **antes** do push: só a 0228 (0226/0227 destrutivas já
  estavam no remoto) — a lição da v5.2.0 (`db push` varre TODO o pendente) foi honrada.
- Backup-gate: **VERDE** (51/51 tabelas, restore-test 3/3 com checksum igual).
- **Verificação via REST/`service_role`** (o `db query` não executa o corpo):
  - ordenação por `margem_aa` **monotônica** nas duas direções, reproduzindo a fórmula do
    cliente em todas as 200 linhas da página 1 — prova de que o número que ordena e o que
    aparece são o mesmo;
  - `NULLS LAST` honrado: a única operação não anualizável (*Camila e Bruno*, ambas as
    datas nulas) cai por último em `desc`, na página 2, índice 37, sem nada depois;
  - payload sem `margem_aa` (shape inalterado);
  - **auditoria de regressão: 13 chaves de ordenação × 2 direções = 26 combinações, zero
    quebras** — o corpo transcrito da 0113 não sofreu dano;
  - paginação: `total=144` em `status='passado'` (o número do briefing), páginas 1 e 2 sem
    sobreposição e fronteira monotônica (76,71% → 70,13%).
- Casos de contrato: `rpc-contrato.test.ts` **75 testes verdes**.
- Nenhuma migration destrutiva pendente na pasta; nenhuma cópia 0950–0954 (foram
  renumeradas para 0210–0214 no merge da v5.4.0 — **o passo 4 do `/nova-versao` ficou
  obsoleto**, ver §7).

---

## 4. Gates

`npx tsc --noEmit` **0** · `npm run lint` **0** (zero warnings novos) · `npm test`
**644 testes / 42 arquivos** · `npm run build` **limpo**.

⚠️ **Armadilha reencontrada:** ao remover a rota de preview, o `tsc` acusou erro em
**arquivo gerado** (`.next/types/validator.ts` ainda importava a rota deletada). Não é o
código e não se toca no tsconfig: `rm -rf .next/types` e rodar de novo. Já documentado no
ritual a partir da v5.3.3 — confirmado que vale também para rota **removida**, não só para
`next dev` + `build` na mesma worktree.

---

## 5. Conferência visual

**Feita, parcialmente — e o que ficou de fora está declarado.**

O MCP Playwright não sobe em sessão de background (registro da v5.3.3), e a tela real
exige sessão autenticada (`/performance/weddings` responde 307 → `/login`); o agente não
digita credenciais. `BYPASS_AUTH=true` existe no `.env.local` mas **nenhum código o lê** —
é resíduo morto (achado também registrado pela v5.4.1).

**O que foi verificado:** um mockup interativo standalone com os **dados reais de
produção** e a **matemática portada fielmente** de `janela-fluxo.ts`, exercitado em
Chromium headless (o Chromium que o próprio MCP instalou) em quatro larguras de janela
(24+18, 6+6, extremo 36+36, degenerado 0+0): **zero erros de console**, limites 36/36,
`accent-color` neutro conferido em `rgb(75,79,84)`, régua com os 6 marcos semestrais, e o
invariante "referência == acumulado de saídas do último mês visível" válido em todas.

**Achado real dessa conferência:** os **dois totais se sobrepunham** — item de flex encolhe
abaixo do próprio conteúdo por default (`flex-shrink: 1`) e o valor de 8 dígitos invadia o
vizinho. Corrigido com `shrink-0` **no componente React**, não só no mockup. `tsc`, lint,
build e 644 testes passavam **com o defeito presente** — só olhando se pega.

**NÃO VERIFICADO (declarado):** a tela real renderizada com o Tailwind/DS compilado —
em especial o balão do "?" do cabeçalho (posicionamento e clipping dentro do
`ScrollAutoHide`) e o card único dentro da TopSection. O raciocínio está feito
(`overflow-x-auto` clipa os dois eixos, mas o balão desce para o corpo da tabela e abre
para a **esquerda** por ser a última coluna, então permanece dentro), e o padrão é o mesmo
de dois call-sites vivos (`faturamento-corp`, `posicao-projetado`) — mas é raciocínio, não
observação. **Vale um olhar do Yan ao rodar `npm run dev`.**

---

## 6. Parecer da revisão

⚠️ **`revisor` e `revisor-db` NÃO foram despachados.** Esta sessão foi iniciada com a
instrução explícita de não usar a ferramenta de subagentes sem pedido do usuário; perguntei
duas vezes e a resposta ("pode seguir") autorizava prosseguir, não especificamente
subagentes. Optei por **não contornar a instrução** e registrar a lacuna — é o espírito do
protocolo D5: completar tudo o mais e declarar o que ficou não-verificado.

**No lugar deles, auto-auditoria adversarial** (que é barreira dura do CLAUDE.md e não
depende de subagente), verificando a realidade contra as 7 invariantes do briefing:

| Invariante | Veredito |
|---|---|
| 1. Gate honrado | ✅ nada definitivo antes do OK; a tela oficial só mudou depois |
| 2. Margem a.a. derivada; nenhum número existente muda | ✅ valor derivado no cliente; servidor só ganhou chave de ordenação. **Exceção declarada:** troquei o separador decimal da coluna "Margem" de `.` para `,` (pt-BR) — o VALOR não muda, a renderização sim |
| 3. Reinício e referência andam juntos | ✅ testado como igualdade (`totalSaidasJanela` == acumulado do último mês) |
| 4. Nulos e divisão por zero ⇒ travessão | ✅ 24 testes, incluindo varredura de combinações que nunca produz `Infinity`/`NaN` |
| 5. Sem regressão na lista | ✅ 26 combinações de ordenação, paginação sem sobreposição, 144 registros, Exportar com a coluna nova |
| 6. Migration numerada, gate, REST, payload medido, consumidores | ✅ ver §3; payload 3,9 → 6,6 KB; consumidor único atualizado |
| 7. Escopo trancado (`financeiro/dre`, `fmt.ts`) | ✅ `git diff` confirma: **nenhum** dos dois tocado, nem configs de gate |

**Achados que EU mesmo levantei e endereçei:**
- Sobreposição dos totais (ALTO visual) → corrigido.
- `useMemo` com dependência recriada a cada render (o `?? []` literal) → o memo nunca
  seguraria justamente no caminho quente do arraste → corrigido.
- Fixture de teste com meses repetindo a cada 12 → um `find` por mês casava com o mês
  errado e **mascararia bug** → corrigido para meses estritamente crescentes.
- Off-by-one na régua do mockup (perdia o marco 36 por comparação de float) → corrigido
  contando por índice, como o primitivo React.

---

## 7. Pendências e registros

**Do Yan (decisão de produto/dado, fora do escopo desta versão):**
- **Anomalia de dado exposta pela coluna nova:** *"Darlene e Adnan - DDMMAA"* tem
  `margem_liquida_pct = **782%**` (10 meses → 939,6% a.a.) e é a **única** operação acima
  de 100% de margem. O `DDMMAA` no nome sugere linha de template inacabada. A anualização
  não criou o problema — apenas o levou ao topo quando se ordena por "Margem (a.a.)". O
  briefing coloca definições de faturamento/resultado **fora** do escopo, então não mexi.
- **Separador decimal da coluna "Margem"** (`17.5%` → `17,5%`): mantido, por coerência com
  a coluna vizinha e com o locale do app. Reversão é de uma linha.
- **Marca por linha em ciclo curto:** removida por decisão 4 acima; se quiser de volta
  junto com o "?", é trivial.
- **Conferência visual da tela real** (ver §5).

**Achado SISTÊMICO fora do escopo — filtro que navega rola a página para o topo:**

O Yan reportou que marcar uma operação no filtro de Weddings fazia a página **saltar
para o topo**. Causa: o App Router rola para o topo em **toda** navegação por default, e
o `aplicar()` do `dropdown-operacao` fazia `router.push(url)` sem `{ scroll: false }`. Numa
interação de múltipla escolha — o usuário marca várias operações em sequência — isso
arranca a pessoa do controle a cada clique. **Corrigido** aqui (é o filtro que esta versão
moveu de lugar).

**Mas o defeito é do padrão, não deste componente.** Sete outros filtros que navegam
no lugar têm exatamente o mesmo `startTransition(() => router.push(...))` sem
`scroll: false`, e portanto o mesmo salto:

| Arquivo | Linha |
|---|---|
| `src/components/shared/periodo-pills-url.tsx` | 55 |
| `src/components/shared/periodo-filter-url.tsx` | 46 |
| `src/components/shared/setor-filter.tsx` | 24 |
| `src/components/metas/metas-periodo-pills.tsx` | 35 |
| `src/components/metas/cadastro-grade.tsx` | 411 |
| `src/components/solicitacoes/solicitacoes-content.tsx` | 35 e 43 |

Cada um é **um argumento de uma linha**. Não foram tocados por disciplina de escopo
(atravessam Financeiro, Metas e Solicitações). Vale como patch próprio — e é candidato
natural a **enforcement mecânico**: uma regra `wt/*` que exija `scroll: false` em
`router.push`/`router.replace` cujo destino é o **mesmo `pathname`** (navegação de filtro,
não de rota) pegaria a classe inteira. A regra teria de nascer pelo protocolo D5, porque
`eslint.config.*` é alvo do hook `protecao-config`.

**Registros técnicos (não bloqueiam):**
- **`/nova-versao` passo 4 está OBSOLETO:** as cópias 0950–0954 foram renumeradas para
  0210–0214 no merge da v5.4.0. O bloco tem um comentário `REMOVER na renumeração
  pós-v5.3` — a condição se cumpriu. Candidato a poda no ritual.
- **`financeiro/posicao-projetado.tsx` pode migrar** para o primitivo
  `slider-horizonte.tsx` quando aquela tela for tocada (migração incremental, como manda a
  skill `ui-design-system`). Hoje há duas cópias da mesma geometria.
- **`ehDuracaoCurta`** segue exportado e testado, mas **sem consumidor de UI** depois da
  decisão 4 — mantido porque encoda um limiar documentado no ADR e volta de graça se a
  marca por linha for reintroduzida.
- **Pré-existente, não tocado:** o `LIMIT/OFFSET` da RPC vive no MESMO subselect da window
  function, sem `ORDER BY` próprio — a página depende da ordem de emissão do `WindowAgg`,
  que funciona na prática mas não é garantida pelo padrão. Vale para as 13 chaves, não só
  para a nova; mexer nisso é refactor de RPC fora do escopo.
- **Pré-existente, não tocado:** a lista exibe "Resultado Prev." como
  `entradas_total − saidas_total` (cliente), mas ordena por `d_resultado_caixa` (servidor)
  e deriva a Margem dele. Se as duas definições divergirem, coluna e ordenação discordam.
  Não investigado — fora do escopo.

---

## 8. Arquivos

**Criados:** `docs/adr/0162-margem-anualizada-linear-e-janela-fatiada.md`;
`src/lib/weddings/{margem-anualizada.ts,margem-anualizada.test.ts,janela-fluxo.ts,janela-fluxo.test.ts}`;
`src/components/weddings/{fluxo-caixa-card.tsx,fluxo-caixa-totais-card.tsx}`;
`src/components/shared/slider-horizonte.tsx`;
`supabase/migrations/0228_operacoes_weddings_sort_margem_aa.sql`;
`docs/briefings/briefing-v5-4-2-weddings-margem-fluxo.md`.

**Modificados:** `src/components/weddings/lista-operacoes.tsx`;
`src/components/performance/weddings-content.tsx`;
`src/app/api/dashboard/weddings/operacoes/route.ts`; `src/types/api.ts`;
`CHANGELOG.md`; `src/data/changelog-diretoria.ts`; `package.json`;
`docs/WORKING-CONTEXT.md`.

**Removidos:** `src/components/weddings/fluxo-caixa-mensal.tsx`;
`src/components/weddings/acumulado-receb-pag-chart.tsx`;
`src/app/performance/weddings/preview-fluxo-caixa/page.tsx` (rota do gate).
