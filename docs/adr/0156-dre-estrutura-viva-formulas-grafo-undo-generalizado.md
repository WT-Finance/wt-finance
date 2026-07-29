# ADR-0156 — DRE por Fluxo de Caixa: estrutura VIVA por chave, fórmulas-grafo, estado "excluída" e a generalização do diário/undo

- **Status:** aceito (v5.3.0)
- **Contexto:** v5.3.0 · DRE Gerencial Onda 2 (migrations 0204–0208). Investigação-base:
  `docs/relatorios/Relatorio_DRE_FluxoCaixa_Onda2_2026-07-24.md` (estrutura de 159 linhas
  extraída do dashboard da controladoria e fórmulas PROVADAS aritmeticamente).

## Contexto

A controladoria mantém a DRE gerencial em regime de caixa num dashboard próprio (HTML
autocontido, `struct.json` de 159 linhas, pipeline Python alimentado por exports do Monde).
A Onda 2 traz esse demonstrativo para a plataforma sobre `financeiro.fato_fluxo` (Onda 1),
com uma exigência de produto central (decisões firmes do Yan): a estrutura — ordem das
categorias, categoria→bloco, exclusões — deixa de ser arquivo e vira **dado global editável
na interface**, auditado e reversível.

Fatos da investigação que moldaram o desenho:
- **20 das 130 categorias são re-parenteadas** pelo struct em relação ao `grupo_categoria`
  nativo do Monde (contra-lançamentos `(-)` viram redutores do bloco de despesa; IMOB é
  sintetizado) → o de-para é **curado**, não derivável do Monde.
- Os nomes de categoria são únicos (0 duplicatas em `dim_categoria`, que é UNIQUE por nome).
- As linhas de resultado são **fórmulas sobre blocos** (REPASSE=ENT_H+PAG_H … REX=RAIR+
  DIST_LUCROS), não somas de categorias. No struct original, "Distribuição de Lucros" não
  tem chave (o modelo a alimenta por NOME); o oráculo do M0 provou que sem uma chave própria
  o REX erraria R$ 376.455,16/ano.

## Decisão

1. **Estrutura viva em duas tabelas** (`financeiro.dre_bloco`, `financeiro.dre_categoria_map`,
   0204), seed do struct provado (0205, com reconciliação FAIL-CLOSED: 29 blocos + 133 maps
   + 2 excluídas, senão o apply aborta).
2. **Fórmulas ancoradas por CHAVE de bloco** (`formula jsonb` = array de chaves — um grafo,
   nunca posição). Avaliação em ordem do demonstrativo; blocos não são reordenáveis no editor
   v1, então todo insumo precede quem o consome. "Distribuição de Lucros" ganhou a chave
   `DIST_LUCROS` (REX = RAIR + DIST_LUCROS).
3. **De-para keyed por `categoria_id`** (FK; o seed casa por nome no momento do apply).
   Categoria SEM linha no map = **bandeja "Não classificadas"** (consulta, não coluna —
   categoria nova do Monde aparece sozinha; nada some em silêncio). **Estado `excluida`**
   explícito (XOR com bloco, CHECK): as transferências internas ("Movimentação de Caixa
   C/D", que netam a zero) ficam FORA da DRE mas visíveis e reversíveis no editor.
4. **`get_dre_mensal(p_ano)`** (0207): uma chamada → um JSON com as ~160 linhas × 12 meses,
   montado da estrutura viva numa transação única (consistência de leitura). Mês corrente
   híbrido: realizado (`tipo='realizado'`) até hoje + `prev_corrente` (previsto do resto do
   mês); previsto vencido (data ≤ hoje) fica fora das colunas e viaja em `venc` por linha
   (a soma no Total é decisão adiada ao refino). "Hoje" = fuso SP por rolconfig (0152).
5. **Diário/undo GENERALIZADO** (0206 — primeira promoção do padrão da v5.2.1/ADR-0155):
   `financeiro.reverter_diario(bigint[])` mantém a assinatura e vira genérico — cada entrada
   do diário já carrega `tabela_alvo`; a restauração é dinâmica (`jsonb_populate_record` +
   `information_schema`, preservando a semântica da 0200: U-restore exclui id/criado_em/
   atualizado_em; D-restore reinsere com o mesmo id sem atualizado_em) com **allowlist
   estrutural**: só tabela com o trigger `fn_diario_alteracoes` anexado pode ser revertida
   (fail-closed). Wrappers do Gerencial intocados; wrappers novos da estrutura
   (`dre_estrutura_historico_*`/`dre_estrutura_desfazer_*`).
6. **Trava otimista global da estrutura** (0208): token = `greatest(max(atualizado_em))` das
   duas tabelas + `pg_advisory_xact_lock` serializando salvar E desfazer (mesma chave de
   lock) — o TOCTOU do token não existe. Salvar em lote (padrão Metas), no-op pulado (não
   polui o diário). Front: painel de histórico do Gerencial **prop-izado** (fetchers/
   camposDiff/título opcionais; defaults = Gerencial byte-idêntico).

## Divergência deliberada de permissão (vs Gerencial)

No Gerencial, desfazer **em massa** (lote >1) exige admin — lá, massa = import/exclusão em
massa (exceção). Na estrutura, TODO salvar-em-lote gera lote multi-linha (é o fluxo normal
do editor) → **massa própria é permitida**; só ação de TERCEIRO exige `admin/acessos`.

## Verificação registrada: rename de categoria no Monde

`dim_categoria` é sincronizada por UPSERT keyed em `categoria` (nome, UNIQUE — 0058/0069/
0187). Rename no Monde ⇒ nome novo = **linha nova (id novo)** ⇒ sem map ⇒ **cai na bandeja**
(visível; nada é mismapeado em silêncio). A linha antiga fica sem lançamentos novos (a
regeneração do fato aponta para o nome novo) — a DRE a mostra zerada até o editor arrumar
(reclassificar/excluir). Comportamento seguro por construção.

## Consequências

- A DRE é reproduzível e auditável: estrutura em dado + fórmulas em grafo + diário em tudo.
- O flag `x` do struct virou `nota_estrela` (cosmético); a auditoria de paridade provou que
  as 4 categorias marcadas têm valores zerados TAMBÉM no fato dos períodos comparados — sem
  semântica oculta de exclusão de valor.
- Paridade com o dashboard da controladoria (meses fechados): o MOTOR é exato — divergências
  residuais são re-edições retroativas do Monde pós-15/07 (nomeadas na auditoria do
  out-briefing), a mesma classe do relatório de divergência de receita.
- Follow-ups: vencidos no Total do ano (refino com o Yan); divisão ver/editar da permissão
  se precisar; drag-and-drop no editor; guarda de saída para navegação por link.

---

## Emenda (v5.3.1) — a Decomposição dos Lançamentos passa a agrupar por BLOCO CURADO, não pelo grupo nativo do Monde

*Registrada como emenda por ser refinamento da mesma decisão de estrutura viva (não gera ADR
próprio). O raciocínio fica aqui porque a alternativa "reusar a RPC que já existia" é
sedutora e voltaria a ser proposta.*

**Contexto.** O card da Composição (v5.2.0) decompunha o período pelo `grupo_categoria`
NATIVO do Monde, via `get_decomposicao_grupo`/`get_decomposicao_categoria` (0188/0197). A
v5.3.1 o move para dentro da seção "Regime de Caixa", logo abaixo da tabela da DRE, no mesmo
recorte visual. Isso muda o requisito: dois números lado a lado na MESMA seção têm de fechar.

**Por que o grupo nativo não serve.** O de-para da DRE é **curado**: 20 das 130 categorias
são re-parenteadas em relação ao grupo do Monde, e 2 são explicitamente excluídas
(transferência interna). Agrupar pelo grupo nativo produziria barras que **não fecham** com
os subtotais da tabela imediatamente acima — a pior forma de erro num demonstrativo: dois
números vizinhos, ambos plausíveis, discordando sem explicação.

**Por que não bastou reusar a RPC existente (a preferência era zero migration).** Medido em
produção, `get_decomposicao_categoria` tem dois desalinhamentos além do agrupamento:

1. **Não filtra `tipo`** — soma `realizado` + `previsto`. E `previsto` tem
   `data_competencia` RETROATIVA quando o título está vencido em aberto (0187: competência =
   vencimento, sem piso de data). Na janela 2026-01-01..2026-07-31: **699 linhas de previsto,
   R$ 4.327.007,77 em valor absoluto**, misturadas ao realizado. (`NOT pos_corte` não ajuda:
   `pos_corte` é o corte de HORIZONTE — competência > 31/12/2028 —, não o discriminador
   realizado × previsto.)
2. **Ignora `excluida`** — as 2 categorias de transferência interna somam net −R$ 30.000,00
   na mesma janela, ou seja **não se anulam sozinhas**.

Isso quebraria dois invariantes firmados: "a Decomposição é sempre REALIZADO" e "reconcilia
com a tabela". Daí a aditiva **0209** (`get_decomposicao_bloco`), que aplica exatamente o
mesmo filtro (`tipo='realizado'`) e o mesmo de-para (`dre_categoria_map WHERE NOT excluida`)
de `get_dre_mensal`, num intervalo de datas livre.

**Alternativa também descartada:** derivar a Decomposição de `get_dre_mensal` (zero migration,
já vem na leva da página). Ela devolve **baldes mensais** — atende as 5 pills alinhadas a mês,
mas torna "Personalizado ao dia" impossível (não há como recortar sub-mês de um balde) e
exigiria costurar meses de dois anos na virada. Degradar o Personalizado em silêncio é a
classe de defeito que este projeto pune.

**Reconciliação (provada, não afirmada).** As colunas mensais de `get_dre_mensal` são
`Σ valor FILTER (tipo='realizado')` por mês de competência — o previsto do mês corrente viaja
em `prev_corrente` e os vencidos em `venc`, ambos FORA de `meses[]`. Logo o net por bloco da
0209 fecha ao centavo com a soma das colunas correspondentes em toda janela alinhada a mês.
Conferido em produção (jan..jul/2026, os 18 blocos analíticos): **delta 0,00 em todos**. A
igualdade deixou de ser anedota — virou caso vivo em `rpc-contrato.test.ts`, que a checa
contra o mês fechado anterior. Se alguém "otimizar" uma das duas funções e a igualdade cair,
estoura no teste, não na tela.

**Sinal.** `dre_bloco` **não tem** coluna de sinal: entrada × saída é derivado do dado
(`valor >= 0`), como nas RPCs de decomposição desde a v5.2.0. Por isso a 0209 devolve o net
**SIGNADO** (não ABS): é o que permite derivar o LADO do próprio número e é o que reconcilia.
No nível de categoria isso obriga a noção de **contribuição** (`saida ⇒ −valor`), para que
Σ das categorias seja exatamente a magnitude do bloco mesmo quando uma categoria tem sinal
OPOSTO ao do bloco — **estorno, que existe de verdade** (9 casos medidos em RH/RHB/ESTR na
janela de teste). O estorno é exibido entre parênteses, sinalizando "reduz o total" sem
inventar um terceiro lado.

**Consequência colateral (registrada):** `get_decomposicao_grupo`/`get_decomposicao_categoria`
ficam **órfãs** — o card desta página era o único consumidor vivo (a `/executiva` consome
`get_decomposicao_variacao`, outra função). Nenhuma foi removida nesta versão; DROP futuro
exige a verificação de consumidores reais de sempre (app **e** `supabase/seed/`), que é
exatamente onde a v4.17.1 se enganou.
