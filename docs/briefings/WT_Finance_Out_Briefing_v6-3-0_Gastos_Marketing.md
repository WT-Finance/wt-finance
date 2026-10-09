# Out-briefing — v6.3.0 · Gastos de Marketing

Rota A com briefing (`docs/briefings/briefing-v6-3-0-gastos-marketing.md`), aberta e fechada em 08/10/2026.
Branch `feat/v6-3-0-gastos-marketing`, **PR #299**. **Migration 0292 (aditiva, APLICADA 08/10).** **ADR-0182.**
Medição da M0: `docs/auditoria/v6-3-0-m0-marketing.md`.

## 1. Resumo

Seção nova **"Marketing"** na sidebar, com a página **`/marketing/gastos`** e área RBAC própria
`marketing/gastos`. Ela é para a gestora de marketing acompanhar os gastos **pagos** da área. É o
primeiro público do Janus fora do Financeiro, e a gestora não herda acesso nenhum do Financeiro.

**Marketing é o bloco `MKT` da DRE de caixa, lido do mapa vivo (ADR-0182).** As 3 RPCs novas usam o
predicado do Realizado de `get_dre_mensal`, sem lista de categorias. Por construção, o total da página
**é** a linha "(-) Despesas Marketing" da DRE. Isso foi provado de quatro formas:

- na M0: 34/34 células iguais ao centavo, de jan/2024 a out/2026;
- no ensaio da 0292 em transação revertida;
- via REST depois da aplicação;
- para sempre, em `rpc-contrato.test.ts`.

Remapear uma categoria no editor da DRE a tira da página (ou a põe) no mesmo instante. A prova foi feita
em transação revertida: mover "Licença de Software (MKT)" para ADM a tira, e a paridade fecha nos dois estados.

**A página ("Despesas de Marketing", subtítulo "Detalhamento das despesas de marketing"), no estado final
depois das duas rodadas de ajustes do Yan (§2), tem:**

- cabeçalho com o carimbo "Última atualização";
- pills de ano com **seleção múltipla** (até 3; ano fechado = ano inteiro, ano corrente = até o mês atual);
- card **"Total de despesas no período"** (soma dos anos selecionados);
- card **"Proporção sobre a Receita Bruta"**: barras por ano, o mesmo % do gráfico da DRE, em regime de
  **competência** (migration 0293);
- gráfico **"Despesas mensais"**: jan–dez, uma barra por ano selecionado em cinzas progressivos, e um
  painel "Total" ao lado com escala própria;
- tabela categoria × mês e ranking de fornecedores, somando os anos selecionados.

A seção "Lançamentos" e o Exportar **saíram** na 2ª rodada.

A despesa aparece **negativa, como na DRE**. Cada card degrada sozinho.

## 2. Decisões

### Do Yan (GATE 0, 08/10)

| # | Decisão |
|---|---|
| D1 | Sem filtro de setor: o dado não tem setor, nem no fato nem no raw. |
| D2 | **Gasto com o sinal da DRE (negativo)**. Foi decisão do Yan contra a recomendação da M0, que era exibir positivo. Um estorno aparece positivo. |
| D3 | Lista FECHADA de colunas: data, categoria, fornecedor, descrição, nº do documento, valor. **Sem conta bancária**, porque os cartões "WCLARA - <nome>" carregam o nome do portador. |
| D4 | Carimbo vigente ("Última atualização…"), **sem "· parcial"** (decisões da v6.0.0, out-briefing :212/:280, que a invariante 10 do briefing contrariava). O aviso de defasagem do cartão, que entrou no lugar do "· parcial", **saiu nos ajustes de 09/10** (ver abaixo). |
| D5 | Mapa vivo sem exceção. Endomarketing (RHB) e Feiras/Eventos (COM) ficam fora, salvo remapeamento no editor da DRE, que muda a DRE junto. |

**GATE 1:** o Yan aprovou o mockup sem ajustes. Nos 4 pontos que ele podia decidir, ficou como estava
implementado:

- Δ negativo = desfavorável, com a palavra escrita;
- 3º KPI = último mês do recorte;
- carimbo no formato longo;
- Marketing logo depois de Gestão de Pessoas na sidebar.

### Ajustes do Yan com o PR aberto (09/10)

1. **"Gastos" → "Despesas"** em todo texto visível (título "Despesas de Marketing", subaba "Despesas",
   cards, dicas, planilha e nome do arquivo exportado), para alinhar com o nome do grupo de categoria na
   DRE. Identificadores técnicos ficam: rota `/marketing/gastos`, área `marketing/gastos` e
   `get_marketing_gastos_*`. Renomeá-los seria só cosmético e, no caso da área, exigiria migration
   destrutiva. O **rótulo da área no editor de roles continua "Gastos"**: ele vem de `app.rbac_areas`, e
   trocá-lo é um `UPDATE` em dado existente, que pelo regime do projeto é destrutivo (humano em TTY).
   Fica como opção do Yan.
2. **Saíram** a linha "Dados de … a …" (cobertura), o aviso "Cartão lançado até …" (cabeçalho, tile do
   mês e dica do Δ) e a **seleção de meses**. Ficaram só as pills de ano, com o recorte fixo no padrão
   do ano. A RPC continua devolvendo `cobertura` e `ultimaDataCartao`; só não são mais exibidos.
3. **Subtítulo** passou a ser "Detalhamento das despesas de marketing". A nota "Mesmo número da linha de
   Marketing da DRE de caixa. Gasto em negativo, como na DRE." saiu da tela. A paridade continua garantida
   por construção e pelo contrato (ADR-0182).

### 2ª rodada de ajustes do Yan com o PR aberto (09/10)

Pedidos:

1. pills de ano selecionáveis em conjunto;
2. o 1º card vira "Total de despesas no período", e o 2º e o 3º viram um único "Proporção sobre a Receita
   Bruta", repetindo o gráfico da DRE em barras e respeitando as pills;
3. "Despesas mensais" com os anos anteriores como barras à esquerda, em cinzas mais claros, meses até
   dezembro e uma coluna Total;
4. excluir "Lançamentos".

O pedido pulava o item 4 da numeração; o Yan não indicou item faltante.

Decisões do Yan (perguntadas, 09/10):

- **Proporção igual à DRE**: competência, um valor por ano. O resto da página segue caixa, e o card diz
  "Regime de competência · igual ao gráfico da DRE".
- **Visível a todos com a área** `marketing/gastos`. O % permite estimar a receita, e o risco foi aceito.
- **Total num painel ao lado**, com escala própria. No mesmo eixo ele achataria os meses.
- **Multi-ano soma os anos** na tabela e no ranking.

Consequências técnicas:

- **Migration 0293:** `get_marketing_proporcao_receita` lê as mesmas views da RPC de competência da DRE,
  sem tocar a DRE (ADR-0182, adendo). Devolve **só o %**: o `revisor-db` mostrou que devolver os centavos
  entregaria a receita exata.
- **Saíram com "Lançamentos":** Exportar, filtro por clique no ranking, cards de Δ% e mês corrente, e os
  módulos `exportar`, `lancamentos` e `indicadores`. `get_marketing_gastos_lancamentos` fica sem uso na
  tela, mantida e coberta pelo contrato.
- **Limites de seleção:** até 3 anos, mínimo 1. A 4ª pill fica bloqueada com o motivo acessível.
- **Falha parcial:** se um ano falha, os cards que somam fecham em erro em vez de somar só parte.
- **Cores por posição entre os selecionados:** o mais recente usa `--action-primary`, os anteriores
  `--action-soft-border` e `--text-subtle`. A escala desceu um degrau por contraste (ALTO do `revisor`).

### 3ª rodada de ajustes do Yan com o PR aberto (09/10)

Pedidos e o que virou:

1. **Pills sem limite.** As pills correspondem aos anos da base. Saem o teto de 3, o "máx. 3 anos" e o
   bloqueio da 4ª pill. Com mais de 3 anos, os mais antigos repetem o cinza mais claro; hoje a base tem 3.
   O título do card total perde o período ("· 2024 + 2025 + 2026 (até out)").
2. **Card total com 2+ anos.** Uma linha por ano, do mais recente ao mais antigo, e no fim o "Acumulado".
   Cada linha traz a **variação %** sobre o ano selecionado logo abaixo, no **mesmo recorte de meses**:
   2026 (jan–out) × 2025 (jan–out), e ano fechado × ano fechado. A conta é `deltaYtd`, a mesma da DRE.
   Despesa que cresce é Δ negativo, rotulado "desfavorável"; Δ de 0,0% é "estável".
3. **Card de proporção.** Sem subtítulo; o "?" fica junto do título e passa a explicar o regime de
   competência e o `*`. O rótulo do ano parcial é só "2026*".
4. **"Despesas mensais".** Sem subtítulo; o painel Total diz só "Total por ano". Havia um **defeito na
   ordem das barras**: o Recharts posiciona cada série pela ordem de *montagem*. Partindo de `?anos=2026`
   e ligando 2025 e depois 2024, as barras novas iam para a direita. Agora o gráfico remonta quando os
   anos mudam (`key`), e os anteriores ficam à esquerda. Uma sonda estática trava a `key`, mas o efeito
   só a tela prova: conferir clicando ano a ano, não recarregando.

### Técnicas (orquestrador)

- **Correções ao briefing:**
  - migration 0292, e não a 0291 (que foi da v6.2.3);
  - base = main pós-v6.2.3;
  - a área também é concedida a **Máquina · verificação**, porque `rpc-contrato.test.ts` exige que essa role tenha toda área fora de Administração;
  - "pago" = `tipo='realizado'` decidido na carga;
  - o Δ% vem de `deltaYtd` (`colunas-tabela.ts`), não de `av.ts`;
  - a lacuna do `rotaInicial` é de 11 áreas, e esta versão só fecha a de Marketing.
- **Inv. 3 como ensaio avulso, não como teste permanente que escreve no banco.** O gatilho de
  reavaliação do ambiente de teste (skill `banco-e-rpc` §6) já está tocado, com 5 casos. Um 6º por
  conveniência não se justifica, e a definição viva continua coberta por construção (o predicado não tem lista).
- **Mockup na rota real**, com componentes de produção alimentados por fixture e área provisória
  `admin/design-system` até a migration (precedente v5.6.0). Na M3 só a fonte do dado trocou.
- **Sem paginação no servidor:** são ~230 lançamentos por ano, então filtro, busca e ordenação rodam no cliente.
- **Clamp do `?ano=` em `[2001, ano corrente]`**, com pills vindas de `anosDisponiveis` (o dado real),
  e não a janela de 3 anos da DRE, que esconderia 2024 a partir de 2027.
- **Componentes locais** no lugar de `KpiCard` (a seta ↑/↓ reforçaria a leitura errada do Δ negativo),
  `SeletorMeses` (é um range entre anos, com portal) e `AnoPills` (vive dentro de `tabela-dre.tsx`;
  importá-lo acoplaria a página à DRE).

## 3. Arquivos

- **Banco:** `supabase/migrations/0292_marketing_gastos.sql`. Contém a área, as 3 concessões explícitas,
  `get_marketing_gastos_{resumo,fornecedores,lancamentos}(p_ano)` (STABLE, SECURITY DEFINER,
  `exigir_acesso` inline), o REVOKE de `anon`, o GRANT ao `verificador` por assinatura e o guard de efetividade.
  Também `src/types/database.ts` (gerado) e `supabase/baseline/schema-v6.json` (regenerado; diff lido:
  3 funções + allowlist + `ultima_migration`).
- **Página:** `src/app/marketing/gastos/{page,loading}.tsx`; `src/components/marketing/gastos/*`.
- **Módulos puros + testes:** `src/lib/marketing/{agregacao,escala,exportar,formatar,indicadores,lancamentos,periodo,schemas,tipos,fixture}.ts`
  e os `*.test.ts`, incluindo `completude.test.ts`.
- **Catálogos:** `src/lib/auth/areas.ts` (`AREAS`, `AREA_INFO` ordem 70, `areasDaRota`,
  `PRIORIDADE_INICIAL`) e `src/components/layout/nav-model.ts`, com os testes.
- **Contrato:** `src/lib/rpc-contrato.test.ts`, com um bloco "Gastos de Marketing" e 3 entradas F7.
- **Docs:** ADR-0182, `docs/auditoria/v6-3-0-m0-marketing.md`, CHANGELOG, CHANGELOG_DIRETORIA, este out-briefing e o WORKING-CONTEXT.
- **Invariante 5 medida** (`git diff --stat origin/main...HEAD`): nada em `src/lib/dre/`,
  `src/components/financeiro/`, `src/app/financeiro/`, `get_dre_mensal`, `dre_categoria_map` ou `app.exigir_acesso`.

## 4. Gates e prova

- **M0 (só leitura):** Q1–Q7 com query e resultado, e o pré-oráculo 34/34.
- **Ensaio da 0292 em transação revertida:**
  - o guard passou;
  - a paridade com a DRE fechou nas 34 células, com resumo ≡ fornecedores ≡ lançamentos e qtd coerente;
  - remapear uma categoria a tirou e depois a devolveu, com a paridade fechando nos dois estados;
  - ano vazio e ano inválido se comportaram como esperado;
  - depois do ROLLBACK não ficou função nem área.
- **Aplicação:** `db:migrate --aditiva` com backup-gate VERDE (81/81, restore-test spot ok).
- **REST pós-aplicação** (credencial `verificador`): as 3 RPCs responderam 200 em 2024–2026,
  34/34 células com a DRE, e `anon` foi recusado (401/42501).
- **Contrato** (`rpc-contrato.test.ts`, contra produção): todos os casos de Marketing rodaram e passaram:
  - shape (F7);
  - paridade por ano;
  - completude por mês, mês×fornecedor e mês×categoria;
  - lista fechada no JSON cru;
  - ano vazio e ano inválido;
  - anon negado;
  - usuário sem a área negado (conexão READ ONLY), com contraprova de um usuário que tem a área.

  A allowlist derivada (`derivar-allowlist.mjs verificador`) bate com os 3 grants da 0292.
- **Fechamento:** ver §4.1.

### 4.1 Gates de fechamento (08/10, depois das correções do revisor)

- `npm run build`: verde (`/marketing/gastos` dinâmica). `npx tsc --noEmit`: limpo. `npm run lint`: limpo.
- `npm test`: **2.118 passam**, 6 pulados, em 119 arquivos. O único vermelho é
  `oraculo-demonstrativo.test.ts` (fixture B-38, §5), que é anterior a esta versão.
- Seção nova: 113 testes em 9 arquivos de `src/lib/marketing/`, incluindo a completude e o "ano anterior
  indisponível × zero real".
- `knip`: zero achados na seção. Seis símbolos de uso interno perderam o `export`. O repo continua com
  os achados que já existiam antes.
- Conferido por grep, depois da rodada de correções:
  - não sobra selo, `fonte` nem `EstadoMockup`;
  - "Nº do documento" está na tela;
  - o singular está certo e a busca tem `name`/`autoComplete`;
  - não há rótulo "(-) Despesas Marketing" fixo nos componentes;
  - "Sem dados em AAAA" aparece no tile.

Depois dos ajustes de 09/10:

- build, `tsc` e `lint` verdes;
- `npm test`: 2.113 passam, com o mesmo único vermelho do Demonstrativo. São 5 a menos porque saíram
  os testes de `normalizarRecorte`/`ajustarRecorte`/`fmtDiaMes`, que só serviam ao seletor de mês e ao
  aviso de cartão;
- knip com zero achados na seção;
- grep sem texto visível com "Gasto", "Dados de", "Cartão lançado" ou "DRE de caixa", e sem select de mês.

Depois da 2ª rodada de 09/10 (multi-ano, proporção, sem Lançamentos) e das correções do `revisor`:

- build, `tsc` e `lint` verdes;
- `npm test`: **2.149 passam**, 6 pulados, com o mesmo único vermelho do Demonstrativo (B-38);
- knip com zero achados na seção;
- contrato de Marketing contra produção: 33 casos verdes, depois da 0293 aplicada;
- conferido por grep: escala de cinzas com `--action-primary`/`--action-soft-border`/`--text-subtle`,
  `aria-describedby` + sr-only + "máx. 3 anos" na pill, aviso de falha parcial no mensal, e
  `rotuloAnoNoTotal` (`2026*`) com a nota no painel Total.

Notas da rodada de correções:

- A coluna "Nº do documento" passou de 128 para 152 px, e a largura mínima da tabela de 1040 para 1064, para
  caber o rótulo. Conferir no visual.
- O header da migration 0292 (linha ~31) cita `src/components/marketing/gastos/tipos.ts`, mas o arquivo
  mudou para `src/lib/marketing/tipos.ts`. É só comentário de migration já aplicada e não foi editado.

## 5. Não verificado pela sessão

- **Conferência visual ao vivo.** O MCP do Playwright não sobe em sessão de background, e o Yan
  conferiu o **mockup** no preview da Vercel (GATE 1). A página com dado real (M3 em diante) não foi
  vista por ninguém. Ver §6.
- O oráculo de ingestão do Demonstrativo segue vermelho na suíte completa por causa da fixture
  `demonstrativo-cru.xlsx`, perdida desde a v6.0.1 (B-38). Não tem relação com esta versão. As outras
  12 fixtures foram restauradas do arquivo de resgate com o sha256 conferido.

## 6. Pendências — o que só o Yan tem

1. **Criar a role e o usuário da gestora** pelo editor de roles, só com `marketing/gastos`.
2. **Conferir no ar** (preview ou depois do merge):
   - abrir com o usuário só-Marketing: ele entra direto em `/marketing/gastos` e não vê nada do Financeiro;
   - comparar um mês da página com a linha de Marketing da DRE de caixa;
   - ver 2024, que não deve mostrar o ano anterior como zero;
   - selecionar 2025 + 2026: total, mensal (barras lado a lado, cinzas), painel Total (`2026*`), tabela e ranking somando;
   - conferir o card de proporção contra o gráfico "Proporção sobre a Receita Bruta" da DRE (2024 −6,2%, 2025 −5,0%, 2026* −6,8% em 09/10);
   - textos dizem "Despesas"; sem "Dados de", sem aviso de cartão, sem "Lançamentos";
   - abrir em largura de celular.
3. **Mostrar à gestora e anotar o que ela pedir.** É o insumo da próxima versão da seção.
4. **Decidir o sentido do eixo do card de proporção** (achado MÉDIO do `revisor`, 2ª rodada). Hoje as
   barras descem do zero, coerentes com "Despesas mensais". O gráfico da DRE **inverte** o eixo ("mais
   despesa = mais alto"). Os dois gráficos leem o mesmo número em sentidos opostos. Trocar é uma linha.
5. **Opcional:** trocar o rótulo da área no editor de roles de "Gastos" para "Despesas". É um `UPDATE` de
   uma linha em `app.rbac_areas` mais o `AREA_INFO` no código, em migration destrutiva aplicada por você
   em TTY. Basta pedir.
6. Observações de dado da M0 para o Financeiro (não são da página):
   - empresas do grupo aparecem como fornecedor no MKT;
   - descrições sugerem categoria trocada no Monde: "Licença de Software (ADM)", "Tecnicópias", "iCloud+".

## 7. Parecer da revisão

### revisor-db (0292, antes da aplicação) — APROVADA COM RESSALVAS, sem CRÍTICO/ALTO

**Conferido:** as invariantes 1–6, a classificação aditiva, os nomes das roles, o guard sem condição
vacuosa e o timeout com folga.

**Ressalvas:**

| Achado | Destino |
|---|---|
| MÉDIO 1 — flip do TS incompleto | Feito na M3 |
| MÉDIO 2 — `anosDisponiveis` fora do tipo | Feito na M3 |
| BAIXO 1 — `btrim` × `trim()` | **Corrigido antes de aplicar**: `btrim(pessoa, E' \t\r\n' \|\| chr(160))` |
| BAIXO 5 — guard | **Corrigido**: exatamente 3 roles com a área, `prosecdef` e `search_path` vazio |
| BAIXO 6 — header | **Corrigido** |
| BAIXO 2 — snapshots separados | Registrado: risco igual ao de qualquer página multi-RPC; o contrato reprova alto se acontecer |
| BAIXO 3 — `id` renumera | Documentado em `tipos.ts`, usado só como key |
| BAIXO 4 — carimbo é do arquivo | Registrado: mesma propriedade da DRE, mantida |
| BAIXO 7 — contrato + allowlist | Feito na M4 |

**Pré-aplicação conferida:**

- as 3 roles já tinham `financeiro/dre`, então ninguém passou a ver mais do que via;
- nenhum rótulo duplicado no MKT;
- só a 0292 estava pendente.

### revisor (fechamento) — APROVADO COM RESSALVAS, sem CRÍTICO/ALTO

| Achado | Destino |
|---|---|
| MÉDIO 1 — zero fabricado: em 2024 o ano anterior aparecia como R$ 0,00 e a linha tracejada ia a zero | **Corrigido**: ano anterior fora de `anosDisponiveis` = indisponível ("—", "Sem dados em AAAA", sem linha de referência), com teste |
| MÉDIO 2 — recorte de meses e filtros fora da URL | **Desvio consciente, registrado**: mesmo padrão da DRE e de Metas, e só o ano vai para a URL. Candidato a backlog se a gestora pedir link compartilhável |
| MÉDIO 3 — agregado em 2 casas (`fmtBRL2`) | **Mantido**: exceção deliberada, porque a página existe para bater ao centavo com a DRE, que também mostra centavos |
| BAIXOS 1–8 | **Corrigidos**: resíduo do mockup removido (selo, `fonte`, `EstadoMockup`); `tipos.ts` e `fixture.ts` movidos para `src/lib/marketing/`; comentários atualizados; rótulo do bloco sem texto fixo; aviso de cartão também no Δ; "Nº do documento" igual na tela e na planilha; singular, "…", `name`/`autoComplete` |
| BAIXO 9 — tooltip do "?" dentro do scroll | A conferir no visual |
| Ponto de opinião — import de `src/lib/dre/exportar` | Bundle desprezível, acoplamento aceitável e coberto pelo teste local. Backlog: subir `rotuloSeguro`/`Celula`/`FMT_MOEDA` para `src/lib/planilha/` |
| Ponto de opinião — `Tile` | Já existe um quase idêntico no inventário; extrair na 3ª cópia |

**Pré-existentes anotados:**

- `GatilhoAjuda` com área de toque de 12px;
- nenhuma página com `<title>` próprio;
- os oráculos de ingestão **quebram com ENOENT** quando falta fixture, em vez de se auto-pular como o
  README de `tests/fixtures/ingestao/` afirma.

### revisor-db (0293, antes da aplicação) — APROVADA COM RESSALVAS, sem CRÍTICO/ALTO

**Conferido por leitura:** equivalência com a 0260 (numerador MKT, denominador `RB_H` pela expansão,
janela, fonte de `cobertura_ate`), exatidão em centavos, grants e guard.

| Achado | Destino |
|---|---|
| MÉDIO — `rbCentavos` entregaria a Receita Bruta exata a quem só tem Marketing | **Corrigido antes de aplicar**: a RPC devolve só `pct`. O contrato compara com `montarProporcaoGrupos` com tolerância de 1e-9 p.p. |
| BAIXO — `mes_num` sem piso | **Corrigido**: `BETWEEN 1 AND v_meses` |
| BAIXO — virada de ano (base sem o ano novo) | Registrado no header |
| BAIXO — guard sem `service_role` | Registrado; a verificação REST cobre |
| BAIXO — snapshots separados no teste | Registrado (mesma ressalva da 0292) |

**Ensaio em transação revertida:** % ≡ grade em 2024 (−6,22), 2025 (−5,00) e 2026 (10 meses, −6,76);
a resposta traz só `ano`, `coberturaAte`, `mesesCobertos`, `parcial` e `pct`.

**Aplicada em 09/10** com backup-gate verde (81/81). Contrato contra produção: **33 casos de Marketing
verdes**, incluindo a proporção ≡ grade e `anon`/sem-área negados nas 4 RPCs. A allowlist derivada bate
com o grant.

### revisor (2ª rodada, e7d3778..b951d8f) — APROVADO COM RESSALVAS

| Achado | Destino |
|---|---|
| ALTO — 3º tom (`--band`) invisível sobre branco | **Corrigido**: escala um degrau abaixo |
| MÉDIO — ramo vazio do mensal escondia falha parcial | **Corrigido** |
| MÉDIO — motivo da 4ª pill só em `title` | **Corrigido**: `aria-describedby` + sr-only + hint visível; sem hover de clicável |
| MÉDIO — painel Total sem marcar o ano parcial | **Corrigido**: `2026*` com nota |
| MÉDIO — eixo da proporção desce, e o da DRE é invertido | **Decisão do Yan pendente** (§6) |
| BAIXO — seleção sem pill em falha total | **Corrigido** |
| BAIXO — cor do mesmo ano divergente sob falha | **Corrigido** |
| BAIXO — folga do rótulo em passos, não em pixels | Registrado; confortável nos valores atuais |
| BAIXO — `fmtAxisPct` × `fmtAv` no mesmo gráfico | Registrado; mesma mistura da DRE |
| BAIXO — tabela com 12 colunas e um ano parcial ("—" em nov/dez) | Registrado; segue o "até Dez" pedido |
| BAIXO — `limitar` antes do filtro de pills | Registrado; improvável com a base atual |
| BAIXO — estados do total reimplementam o card | Registrado |

### Incidente: o computador reiniciou no meio da 2ª rodada (09/10)

**O que aconteceu:**

- O reinício deixou 47 arquivos de objeto vazios no repositório. A ref local do ramo apontava para um
  commit vazio (`2c25dd4`) e o reflog terminava com uma linha corrompida.
- O índice desta worktree referenciava objetos vazios.
- Nenhuma alteração não commitada se perdeu (os arquivos estavam íntegros no disco). A 0293 ainda não
  tinha sido aplicada.

**Recuperação:**

1. Backup dos arquivos da worktree em `$CLAUDE_JOB_DIR/tmp/backup-reboot/`.
2. A ref do ramo voltou ao último commit íntegro, `61df214`, igual ao remoto (com o valor antigo
   conferido).
3. Os 47 objetos vazios foram apagados. Todos eram de 09/10 e tinham zero bytes, então nada se perdeu.
4. O índice foi refeito a partir do disco.
5. A checagem de integridade ficou limpa no repositório inteiro, e as outras worktrees e o checkout raiz
   não foram afetados.

## 8. Backlog gerado

- `rotaInicial`: 10 áreas continuam sem entrada (`financeiro/dre`, `financeiro/acervo{,/gestao}`,
  `financeiro/faturamento-corp`, `solicitacoes{,/basico,/documentacao}`, as 3 de `gestao-pessoas`).
  Quem tem só uma delas cai em `/sem-acesso`.
- Módulo compartilhado de células de planilha (`src/lib/planilha/`).
- Estado do recorte na URL (`?de=&ate=&forn=`), se pedido.
- Oráculos de ingestão: auto-skip real quando a fixture falta.

## 9. Aprendizado (régua de 5 destinos)

- **Recorte derivado de uma árvore viva, com oráculo de paridade.** A decisão de arquitetura está no
  ADR-0182; o padrão de prova (predicado copiado + paridade no contrato + definição viva em transação
  revertida) já está na skill `banco-e-rpc` (§6, ensaio da migration). Destino: **(2) já coberto**.
- **Relatório de medição commitado não leva nome de pessoa física nem de portador de cartão.** O push do
  relatório da M0 foi barrado pelo classificador de permissões até os nomes serem trocados por rótulos.
  É situacional e de método. Destino: **memória de feedback** (não é convenção de banco nem de código).
- **Oráculo de ingestão quebra em vez de pular** quando falta a fixture. É defeito de enforcement.
  Destino: **(1)**, no backlog (§8). Não foi corrigido aqui, porque está fora do escopo.

## Advisor

Consultas declaradas nos retornos. Só o `implementador` consulta pelo protocolo.

| Agente / missão | Consultas | Momentos | Mudou o rumo |
|---|---|---|---|
| implementador — M1 (mockup) | 2 | 1 e 3 | sim, nas duas |
| implementador — M2 (migration) | 2 | 1 e 3 | sim, nas duas |
| implementador — M3 (ligação às RPCs) | 1 | 3 | sim |
| implementador — M4a (exportar) | 1 | 3 | sim |
| implementador — M4b (contrato) | 2 | 1 e 3 | sim, nas duas |
| implementador — correções do revisor | 1 | 3 | sim |
| implementador — ajustes 09/10 (Despesas, só ano, subtítulo) | 0 | — | — |
| implementador — 2ª rodada: front multi-ano | 2 | 1 e 3 | sim, nas duas |
| implementador — 2ª rodada: migration 0293 + contrato | 2 | 1 e 3 | sim, nas duas |
| implementador — 2ª rodada: card de proporção | 2 | 1 e 3 | sim, nas duas |
| implementador — correções do revisor (2ª rodada) | 1 | 1 | sim |
| revisor-db, revisor | 0 | — | — |
| exploradores (plan mode, tipo Explore) | não declarado | — | — |

Total: **16 consultas (9 na 1ª fase + 7 nos ajustes de 09/10), todas do `implementador`, todas no protocolo (momentos 1 e 3), todas mudaram o
rumo**. Nenhuma consulta do orquestrador.

**Custo:** pendência do Yan (`/usage`).
