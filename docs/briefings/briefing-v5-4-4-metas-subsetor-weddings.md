# Briefing v5.4.4 — Metas por subsetor de Weddings

> Rota A. Patch de produto sobre a área de Metas. Planejado em sessão de chat com o Yan em
> 2026-08-04, com seis decisões de produto tomadas por ele e três medições contra a base de
> produção antes de fechar o desenho.

**Numeração conferida no repo real (não no enunciado), 2026-08-04:** a v5.4.3 (PR #211 — anexo
com acento + erro do modal) **foi mergeada** durante o planejamento desta versão; a worktree
nasceu de `977c97a`, com `package.json` em `5.4.3`. Este patch é a **v5.4.4**.
Último ADR: `0162` → **próximo livre: 0163**.

⚠️ **Migrations renumeradas de 0230/0231 para `0233`/`0234` — colisão entre sessões
paralelas.** Ao conferir o conjunto pendente antes de aplicar (`npx supabase migration list`),
apareceu `{"local":"","remote":"0232"}`: uma migration **aplicada em produção que não existe
neste repo**. É a `0232_monde_reconciliacao_e_tripwire.sql` da branch
`fix/v5-4-5-reconciliacao-espelho` — uma **v5.4.5 em curso em paralelo** (reconciliação do
espelho Monde), que aplicou banco **antes de mergear**. Como nada desta versão havia sido
aplicado, renumerar foi de graça e mantém ordem aplicada == ordem numérica, evitando estado
fora de ordem no histórico (remédio idêntico ao percalço `0218`→`0220` da v5.4.0).

**Conferido que a 0232 não colide com nada desta versão:** ela cria/altera só
`monde_vendas_ausentes`, `monde_ingest_claim`, `monde_ingest_release` e `monde_ingest_status`;
não toca Metas, `get_sumario_subsetor__nucleo` nem `dim_produto_subsetor`. O único ponto de
contato é `monde_ingest_status`, que a tela de Metas lê para "Última atualização" — e a 0232
só **acrescenta** chaves ao jsonb (`ultima_sincronizacao` e `ultima_sync` seguem lá), enquanto
`ultima-sincronizacao.ts` lê por cast solto. Zero impacto nas duas direções.

**Pendência de contabilidade para o Yan (não decidida aqui):** quando esta versão mergear,
`main` terá `0233`/`0234` com um **buraco no 0232** até a branch da v5.4.5 mergear. A ordem de
merge das duas é decisão dele.

---

## 1. Objetivo

Dar à tela de Metas o eixo de **subsetor de Weddings**, para que a diretoria acompanhe meta versus
realizado no mesmo balde que a Performance já usa, e dar ao Cadastro a entrada dessas metas.

Três entregas visíveis:

1. Em `/metas`, o card de Weddings sai da fileira de três, desce para uma faixa full-width e ganha
   um chevron que revela os subsetores.
2. Em `/metas/cadastro`, um segundo quadro no mesmo molde do atual, para digitar as metas dos
   subsetores; a coluna Weddings do quadro de cima passa a ser **travada**, exibindo a soma.
3. Dentro da expansão, uma faixa recolhível **"Não Classificados"** listando os produtos que estão
   em Weddings mas fora do mapa de subsetor — para o Yan trabalhar o problema internamente com a
   lista na mão.

## 2. O que "subsetor" significa aqui (definição, não implementação)

Subsetor é **agrupamento de PRODUTO**, não de equipe. A regra vive em
`analytics.dim_produto_subsetor` (criada na `0026`, dividida em 5 pela `0071` / ADR-0069): 21
linhas curadas à mão da "matriz do Anexo A", com `produto` como PK. A atribuição de cada venda é
feita pelo nome do produto, e o join da RPC é `dps.produto_normalizado = UPPER(TRIM(dp.nome))` —
portanto **caixa e espaço não importam** (as duas linhas duplicadas do seed,
`Contrato de Casamento` e `Contrato de casamento`, colapsam no join). O que produz balde vazio é
**nome de produto novo**, não grafia.

Composição real do faturamento de Weddings em 2026 (fonte: upload):

| Subsetor | Produtos | % do faturamento |
|---|---|---|
| CONVIDADOS – Hospedagens | Diárias de Hospedagem (1 só) | 53,4% |
| PRODUÇÃO | Cerimonial de Casamento · Extras Casamento | 21,7% |
| PLANEJAMENTO | Pacote de Casamento · Pacote Turístico (passeios) · Eventos (festa de boas vindas) | 16,0% |
| CONVIDADOS – Extras | 10 produtos (Aluguel de Carro, Cruzeiros, Ingressos, Pacote Turístico, Passagem Aérea, Passes de Trem, Receptivo, Seguro Viagem, Transporte Rodoviario, Bagagens ou assentos) | 6,4% |
| COMERCIAL | Contrato de Casamento · Atualização de Contrato · Taxa de Serviço | 1,7% |
| *(NÃO_CLASSIFICADO)* | produto fora da matriz | 0,7% |

**Decisão do Yan, confirmada explicitamente:** meta por subsetor é **meta de MIX DE PRODUTO** —
"quanto do faturamento de Weddings deve vir de Diárias de Hospedagem, de Cerimonial, de Pacote de
Casamento…". Não é meta de equipe. Quem implementar não deve reinterpretar isso.

## 3. Medições feitas antes do desenho (produção, via REST com `service_role`)

### 3.1 As duas fontes divergem, e de forma irregular

O card do setor Weddings vem de `get_executiva_kpis` → **Monde**. Os subsetores vêm de
`get_sumario_subsetor` → **upload / `analytics.fato_venda_item`**. Faturamento de Weddings:

| Período | Monde (card do setor) | Upload (soma dos 5) | Δ |
|---|---|---|---|
| Ago/2026 (mês corrente) | 48.144,44 | 48.144,44 | **0,00** |
| Jul/2026 | 2.154.633,82 | 1.743.694,79 | −410.939,03 (**19,1%**) |
| Ano 2026 | 10.915.158,83 | 10.363.739,15 | −551.419,68 (**5,1%**) |

No mês corrente — a pill default da tela — elas batem ao centavo. A divergência aparece nas pills
Trimestral / Semestral / Anual. **Não maquiar:** o resíduo é declarado no "?" da expansão, com a
fonte de cada ponta.

### 3.2 O 6º balde existe, é estrutural, e a Performance o descarta em silêncio

`weddings-kpis-section.tsx:216` itera `SUBSETOR_ORDER.map(...)` — a lista fixa de 5 — e nunca
encontra o `NÃO_CLASSIFICADO` que a RPC devolve. Logo **os 5 cards da Performance já não fecham
com o total de Weddings hoje**, e isso nunca apareceu na tela.

Produtos no balde em 2026:

| Produto | Faturamento | Receita |
|---|---|---|
| `G - WelConnect - Colômbia AGO2026` | 41.731,53 | **−37.339,05** |
| `G - WelConnect - Mendoza MAR2026` | 18.071,43 | 0,00 |
| `Bloqueio Hospedagem` | 12.432,00 | 0,00 |
| `Vistos` | 482,45 | 0,00 |
| **Total** | **72.717,41** | **−37.339,05** |

Fecha ao centavo com o balde agregado, e **toda** a receita negativa vem de um único produto.

Histórico: o balde é não-nulo em **26 dos últimos 48 meses**, desde fev/2023, somando
R$ 382.763,15. Maior mês de todos: **abr/2024, R$ 105.550,25**. Em 2026: jan 16.478,02 · fev 5,00 ·
mar 1.588,41 · abr 12.432,00 · mai 5.968,72 (receita −15.495,25) · jun 18.145,26 · jul 18.100,00
(receita −21.842,26) · ago 0,00.

**Por que é estrutural:** `G - WelConnect - Colômbia AGO2026` mostra que o Monde recebe produtos
**batizados por grupo**, com destino e mês no nome. O namespace de produto é aberto e cresce; o
mapa é uma lista curada de 21 linhas, sem tela nem processo de manutenção (última carga por
migration, em 2024). Com meta por subsetor, produto novo passa a **parecer não-cumprimento de
meta**. Daí a faixa "Não Classificados" ser obrigatória, não decorativa.

**Registrado para o Yan, fora do escopo:** as duas viagens WelConnect (Colômbia/Mendoza) não têm
cara de casamento e estão classificadas como Weddings **no nível de setor**. Se estiverem no setor
errado, o problema é um nível acima do subsetor e a decisão é dele.

## 4. Decisões de produto (todas do Yan, nesta ordem)

| # | Decisão | Consequência |
|---|---|---|
| D1 | Weddings desce para faixa full-width, expansível por chevron | Trips e Corporativo dividem a largura em duas colunas em cima |
| D2 | Cards de subsetor no **padrão Metas** (meta, % da meta, % esperado, barra), não no padrão Performance | O cadastro de metas por subsetor é o que justifica o eixo |
| D3 | **Comercial tem DUAS metas**: contratos (manda na barra do card) e faturamento (compõe a soma de Weddings) | Fecha o furo de aritmética: numerador e denominador com os mesmos 5 subsetores |
| D4 | **Weddings travado** no quadro de setor, exibindo a soma dos subsetores | Weddings deixa de ser entrada direta; Group segue somando os 3 setores |
| D5 | Subsetores têm **Faturamento + % Rec**, mesmo molde do quadro atual | Card mostra "Margem X% ±Δ p.p. vs alvo Y%" |
| D6 | 6º card **"Não Classificados"**, abaixo dos 5 e recolhível por chevron, como **lista de produtos** | Fecha a aritmética visível e entrega a lista para o Yan tratar internamente |

### 4.1 A rampa (ponto deixado no default recomendado)

Existem R$ 23,8 Mi de metas de Weddings cadastradas para 2026. Como Group é a soma dos três
setores, travar Weddings sem rampa faria o card do **Group** perder esses R$ 23,8 Mi até os
subsetores serem preenchidos. Regra adotada, determinística por mês:

```
para cada (ano, mes):
  se existe ≥1 linha em app.meta_subsetor daquele (ano, mes):
      meta_weddings(mes)        = Σ valor_meta dos subsetores do mês
      pct_receita_weddings(mes) = Σ(valor_meta × pct_receita) / Σ(valor_meta com pct)
  senão:
      meta_weddings(mes)        = linha de app.meta_setor (setor_macro_id = 2)  ← comportamento atual
```

Nada zera na tela, nada é apagado da base, e a célula travada do Cadastro **diz em qual regime cada
mês está** — a rampa tem fim visível. Duas regras convivem por um tempo: é deliberado e tem caso de
contrato próprio (§9.4).

## 5. Alinhamento com o Scope B (restrição standing, pedida pelo Yan)

Corre em paralelo uma investigação para repontar ao Monde o que ainda vem do upload manual de
vendas por produto (e a base de Pessoas). Subsetor é eixo de **produto** e por isso só existe no
upload. ⚠️ **ERRATA (04/08):** a frase original dizia que o espelho "ainda não tem
granularidade de item" — **errado**. `monde.venda_item` está populada (47.150 itens, até
04/08/2026) e tem tudo o que a RPC consome. O que falta é o **de-para** do vocabulário de
produto do Monde (`description`/`product_kind`) para as 21 categorias curadas do mapa. Ver a
errata no ADR-0163.

**Regra desta versão: não escrever nenhuma query nova de subsetor.** Consequências concretas:

- A RPC de leitura de Metas é um **wrapper de 6 linhas** sobre o núcleo já existente
  (`public.get_sumario_subsetor__nucleo(date,date)`, hoje com `EXECUTE` só para `service_role`),
  seguindo exatamente o padrão da `0121`.
- A lista de produtos não classificados entra como **chave nova no payload do núcleo já
  existente**, não como função nova. Todos os schemas de `src/lib/schemas-rpc.ts` usam
  `.passthrough()` (o comentário do arquivo diz que é para "tolerar colunas extras vindas do
  banco"), então acrescentar chave é seguro para os consumidores atuais.
- Resultado: **o Scope B repointa UM corpo** e as duas telas (Performance e Metas) seguem juntas.
  Zero SQL duplicado para conflitar.

Quando o Scope B concluir, a divergência do §3.1 **desaparece por consequência** — as duas pontas
passam a medir o mesmo universo. A decisão D4 está certa para o destino e levemente torta hoje; o
resíduo é declarado na tela até então.

## 6. Modelo de dados

### 6.1 `app.meta_subsetor` (migration 0233, ADITIVA)

```sql
CREATE TABLE app.meta_subsetor (
  id             bigserial      PRIMARY KEY,
  subsetor       text           NOT NULL
    CHECK (subsetor IN ('COMERCIAL','PLANEJAMENTO','PRODUÇÃO',
                        'CONVIDADOS - Hospedagens','CONVIDADOS - Extras')),
  ano            int            NOT NULL,
  mes            int            NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_meta     numeric(14,2)  NOT NULL CHECK (valor_meta >= 0),
  meta_contratos int            NULL CHECK (meta_contratos IS NULL OR meta_contratos >= 0),
  pct_receita    numeric(5,2)   NULL CHECK (pct_receita IS NULL OR (pct_receita BETWEEN 0 AND 100)),
  fonte          text           NOT NULL CHECK (fonte IN ('real','ficticia')),
  criado_em      timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT meta_subsetor_contratos_so_comercial
    CHECK (meta_contratos IS NULL OR subsetor = 'COMERCIAL'),
  UNIQUE (subsetor, ano, mes)
);
```

Por que `text` com CHECK e não FK: **não existe dimensão de subsetor**.
`analytics.dim_produto_subsetor` tem PK em `produto`, e `subsetor_detalhado` é coluna TEXT sem
tabela própria. O precedente do repo é CHECK IN (a coluna `subsetor` grossa da `0026` já é assim).
Custo: a lista canônica passa a viver em **dois lugares** (SQL e `SUBSETOR_ORDER` em
`src/lib/config.ts`) — endereçado por guard mecânico no §9.1.

`app.meta_subsetor_historico` espelha o padrão de `app.meta_setor_historico` (`0004` + `0175`):
mesmas colunas + `alterado_em`, `alterado_por`, `valor_anterior`, `pct_receita_anterior`,
`meta_contratos_anterior`, `motivo_alteracao`. A tela atual já mostra "Última alteração por Yan ·
20/07/2026 às 11:06" e o quadro novo tem de mostrar o mesmo.

### 6.2 RPCs

Todas `SECURITY DEFINER`, `SET search_path = ''`, `app.exigir_acesso` inline,
`REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated` — padrão canônico da skill
`banco-e-rpc`.

| RPC | Guard | Papel |
|---|---|---|
| `metas_subsetor_listar(p_ano int)` | `['metas/acompanhamento','metas']` | irmã de `metas_listar`; devolve `{ano, metas:[{subsetor,mes,valor_meta,meta_contratos,pct_receita}], ultima_alteracao}` |
| `metas_subsetor_upsert(p_metas jsonb)` | `['metas']` | irmã de `metas_upsert`, mesmas validações + recusa `meta_contratos` fora de COMERCIAL; grava histórico só em mudança real (`IS DISTINCT FROM`) |
| `metas_sumario_subsetor(p_from date, p_to date)` | `['metas/acompanhamento','metas']` | **6 linhas**: `PERFORM app.exigir_acesso(...)` + `RETURN public.get_sumario_subsetor__nucleo(p_from,p_to)` |

Alterações em funções existentes (ambas `CREATE OR REPLACE` com assinatura idêntica → ADITIVAS):

- **`get_sumario_subsetor__nucleo`** ganha a chave `produtos_nao_classificados`: array de
  `{produto, faturamento, receita}` dos itens de Weddings cujo LEFT JOIN com o mapa resulta NULL,
  ordenado por faturamento desc. **Nenhum número existente muda** — é chave nova no payload, e o
  agregado `NÃO_CLASSIFICADO` continua idêntico. Prova exigida no fechamento: a soma da lista bate
  com o agregado do balde, ao centavo, em ≥3 períodos.
- **`metas_upsert`** passa a **recusar `setor_macro_id = 2`** (`ERRCODE 22023`), com mensagem
  dizendo que a meta de Weddings é derivada dos subsetores. O "travado" na fronteira do banco, não
  só na UI.

**Verificação pós-push obrigatória via REST com `service_role`** — `db query` não executa o corpo
(lição da v5.2.1).

## 7. Front-end

### 7.1 `/metas` — Acompanhamento

Layout: Trips e Corporativo em duas colunas em cima; **Weddings full-width embaixo**, com chevron à
direita do rótulo. Fechado, o card mostra exatamente o que mostra hoje.

Aberto, revela dentro do próprio card:

1. Fileira com os **5 cards de subsetor**, ordem de `SUBSETOR_ORDER`, cor de `SUBSETOR_COLORS`,
   rótulo de `SUBSETOR_LABELS` (com o par "Convidados" + subtítulo "Hospedagens"/"Extras", como a
   Performance faz). Cada card: faturamento · "% da meta" · "Meta: R$ …" · "% esperado" · barra ·
   Receita · "Margem X% ±Δ p.p. vs alvo Y%".
   **Comercial troca o topo por contratos** ("34 contratos · Meta: 140 contratos") e a barra dele
   mede contratos; o faturamento dele aparece na linha de baixo e é o que entra na soma.
2. Abaixo dos 5, a faixa **"Não Classificados"**, com chevron próprio (cortina aninhada). Fechada,
   mostra o resumo: `Não Classificados · R$ 72,7 k · 4 produtos`. Aberta, lista produto ·
   faturamento · receita, ordenado por faturamento desc.
   **A faixa só existe quando o balde é não-nulo**, e a condição é `faturamento ≠ 0 OU receita ≠ 0`
   — existe mês com faturamento 0 e receita não-nula (jan/2024: 0,00 / 118,80).
3. O "?" do cabeçalho da expansão declara a fonte de cada ponta e por que a soma pode não fechar com
   o card pai (§3.1), mais o fato de a meta de contratos de Comercial cobrir **um** produto enquanto
   a meta em R$ dele cobre **três**.

**Cortina:** `grid-template-rows`, conteúdo **montado nos dois estados** com `inert` no fechado —
lição da v5.4.1 (desmontar faz a cortina colapsar caixa vazia, abrir animado e piscar ao fechar).
Vale para os **dois** níveis de cortina.

Os subsetores **não** entram no gráfico "Ritmo do período": ele exige série diária, e não existe
série diária por subsetor (`metas_ritmo_diario` já foi repontada ao Monde e a mv só tem
`data_venda + setor_macro_id`). Construir uma seria mexer justamente no que o Scope B vai reescrever.

De carona: hoje `get_sumario_subsetor` é gated em `performance/weddings`, e quem tem só
`metas/acompanhamento` vê "Contratos —" no card de Weddings. A RPC-irmã **conserta isso**
(precedente: `solic_tipos_documentacao`, v5.4.0).

### 7.2 `/metas/cadastro`

Segundo card abaixo do atual: **"Metas por subsetor de Weddings"**, mesmo molde do quadro existente
— 12 linhas de mês + linha Total, clique na célula para editar, popover "aplicar ao ano", rodapé com
"Última alteração por …" e botão Salvar.

Colunas: Comercial [**Contratos**, Faturamento, % Rec] · Planejamento [Faturamento, % Rec] ·
Produção [Faturamento, % Rec] · Convidados–Hospedagens [Faturamento, % Rec] · Convidados–Extras
[Faturamento, % Rec] · **Total** [Faturamento, % Rec] (computado).

O Total em R$ **inclui** o faturamento de Comercial e **ignora** os contratos dele. O % Rec do Total
é média ponderada pela meta de faturamento, mesma regra que o Group já usa hoje
(`recAlvo / vtComPct` em `carregar-acompanhamento.ts`).

Onze colunas de valor exigem scroll horizontal com a coluna Mês **sticky** — receita completa na
skill `tabela-densa` (`border-separate`, fundo na célula sem alfa, bordas por célula).

No quadro de cima, **Weddings vira célula travada**, exibindo o Total do quadro novo e indicando o
regime do mês (soma × meta antiga da rampa, §4.1).

### 7.3 Reuso, não cópia

- `src/lib/metas/ritmo.ts` ganha `calcularRitmoAgregado` — mesmo `metaAcumulada`, mesmo
  `pctReceitaAlvoPeriodo`, mesmo `classificarRitmo`, mesma derivação de `hoje`/`pctDecorrido`, sem a
  série diária (o `esperadoAteHoje` é `metaPeriodo × pctDecorrido`, não depende de série). A
  derivação de `hoje`/`pctDecorrido` é fatorada em helper único usado pelas duas funções, para não
  poderem divergir.
- A derivação "Weddings = soma" fica em **um único lugar**: `metasDoSetor` em
  `carregar-acompanhamento.ts`. Group continua somando os três setores e pega o Weddings já
  derivado — atenção à ordem.
- `cadastro-grade.tsx` tem 637 linhas. **Não clonar.** Extrair os pedaços genuinamente
  compartilhados (célula editável, popover aplicar-ao-ano, parse/format de dinheiro e percentual) e
  deixar cada quadro dono do seu layout de colunas e dos seus totais. Os arquivos extraídos são
  **arquivo-ímã: dono único**, não paralelizar.

## 8. Missões e ordem

| # | Missão | Depende de | Arquivos |
|---|---|---|---|
| M1 | Banco: `0233` (tabela + histórico + 2 RPCs) e `0234` (wrapper de Metas + chave nova no núcleo + trava do `metas_upsert`) | — | `supabase/migrations/` |
| M2 | Lib: `calcularRitmoAgregado`, rampa e derivação de Weddings/Group, contrato Zod das RPCs novas | M1 | `src/lib/metas/*`, `src/lib/schemas-rpc.ts` |
| M3 | Extração dos primitivos compartilhados do Cadastro (arquivo-ímã, dono único) | — | novos em `src/components/metas/` |
| M4 | Cadastro: quadro de subsetores + Weddings travado | M1, M2, M3 | `cadastro-grade.tsx`, `cadastro/page.tsx`, `actions.ts` |
| M5 | Acompanhamento: layout, card expansível, cards de subsetor, faixa "Não Classificados" | M1, M2 | `acompanhamento-content.tsx`, `meta-card.tsx`, novos |
| M6 | Guards e casos de contrato (§9) | todas | `*.test.ts` |

M4 e M5 tocam arquivos disjuntos e podem correr em paralelo depois de M3. Gates escalonados:
`npx tsc --noEmit` + `npm run lint` ao fim de cada missão; `npm run build` + `npm test` na fronteira
de fase e no fechamento.

## 9. Guards mecânicos e casos de contrato

1. **Lista canônica em dois lugares** — teste lê a migration `0233` e compara os 5 literais do CHECK
   com `SUBSETOR_ORDER` de `src/lib/config.ts`. Igualdade por máquina, não por prosa.
2. **Weddings derivada == soma dos 5 em R$**, para o mesmo (ano, mês) — o par de números vizinhos
   que a tela mostra.
3. **Group == Trips + Weddings(derivada) + Corporativo.**
4. **Rampa determinística:** mês com ≥1 subsetor usa a soma; mês sem nenhum usa `meta_setor`. Ambos
   os ramos testados, incluindo a virada de um mês ao ser preenchido.
5. **Recusas do `metas_subsetor_upsert`:** mês fora de 1–12, valor negativo, pct fora de 0–100,
   subsetor fora da lista, `meta_contratos` em subsetor ≠ COMERCIAL.
6. **`metas_upsert` recusa `setor_macro_id = 2`.**
7. **Comercial:** a barra usa contratos e o faturamento dele entra na soma — o teste que prova o
   furo do D3 fechado.
8. **`calcularRitmoAgregado` × `calcularRitmo`:** para o mesmo período e as mesmas metas,
   `metaPeriodo`, `pctDecorrido`, `esperadoAteHoje` e `pctReceitaAlvo` **idênticos**.
9. **Lista de não classificados × agregado do balde:** soma da lista == `NÃO_CLASSIFICADO` agregado,
   ao centavo, em ≥3 períodos (contra a base, via REST).

Todo guard novo tem de ser **visto reprovando** o comportamento antigo antes de ser aceito.

⚠️ **`.env.local` não vem no `git worktree add`** e sem ele a suíte roda com ~112 casos
**SKIPPED** (os que batem no banco real) parecendo verde — o número de testes é a única pista
(lição da v5.4.3). O symlink já está posicionado nesta worktree.

## 10. Fora do escopo (deliberado)

- **Modo TV** (`/metas/tv`) — layout fixo 16:9 de parede; 5 cards a mais o quebram.
- **`/metas/comparacao`** — intocada.
- **Ritmo diário por subsetor** — não há fonte; construir colidiria com o Scope B.
- **Manutenção do mapa produto→subsetor** — pendência **nova e registrada**: hoje produto novo entra
  em Weddings, sai dos subsetores e ninguém é avisado. Com meta por subsetor isso passa a parecer
  não-cumprimento. Caminho provável: tela de admin ou alerta de balde crescendo. Outra versão.
- **Reclassificação de setor das viagens WelConnect** — decisão do Yan, um nível acima.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Soma dos subsetores não fecha com o card pai fora do mês corrente (5,1% no ano) | Faixa "Não Classificados" fecha parte; o "?" declara o resto; o Scope B elimina |
| Mapa de produto vaza com produto novo | A faixa torna o vazamento visível na tela |
| Rampa faz duas regras conviverem | Regime por mês visível na célula travada + guard nos dois ramos |
| Extração no `cadastro-grade.tsx` (637 linhas) regride o quadro atual | Dono único do arquivo-ímã; smoke do quadro de setor antes de fechar |
| `meta_contratos` cobre 1 produto e `valor_meta` de Comercial cobre 3 | Declarado no "?" do card |

## 12. Definition of Done

`/fechamento-versao` integral: gates, `revisor` (sempre) e `revisor-db` (há migration e RPC),
`verificador-visual` (há UI), out-briefing com Parecer da revisão, CHANGELOG.md +
CHANGELOG_DIRETORIA com a data real, bump para `5.4.4`, **ADR-0163** (definição da métrica: meta de
subsetor é mix de produto · Weddings derivada · rampa por mês), WORKING-CONTEXT e PR.

**Conferência visual é do Yan** — o agente não alcança tela autenticada em background
(`BYPASS_AUTH` é resíduo morto; `/metas` responde 307 → `/login`). Modelo que funcionou na v5.4.1 e
vale repetir: entregar → print → ajustar.
