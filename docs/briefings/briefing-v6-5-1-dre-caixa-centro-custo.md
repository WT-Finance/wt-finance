# JANUS · Briefing v6.5.1 — DRE de caixa por centro de custo

**PATCH** (decisão do Yan; pelo critério das v6.3.0 e v6.4.0, base nova no contrato de ingestão seria MINOR — o `/nova-versao` registra a escolha) · **Migrations:** aditivas — (1) base nova Lançamentos por Centro de Custo (raw + tabela de rateio + `promover_carga_*` + grant do `ingestor`); (2) RPCs de leitura da DRE por centro + grant do `verificador`. Numerar na hora (banco na 0302; 0303 reservada para a destrutiva da v6.5.0; provável 0304 em diante, conferir no banco e nas worktrees) · **ADR:** 1 novo — "DRE de caixa por centro de custo: rateio do Monde por Número e antecipações atribuídas a quem precisou do caixa" (provável `0184`, conferir no remoto) · **Base:** `main` após o merge da v6.5.0 · **Branch:** `feat/v6-5-1-dre-caixa-centro-custo` · **Rota A**

*A DRE de caixa passa a poder ser lida por centro de custo (Trips, Weddings, Corp, CSC). O centro vem do relatório Lançamentos por Centro de Custo do Monde, cruzado pelo Número com a base de Lançamentos por Categoria (movimentação) que a DRE já usa. As antecipações de recebíveis deixam de distorcer o caixa de cada operação: o recebível antecipado volta ao vencimento original no centro dono, e o dinheiro antecipado, a devolução e a taxa ficam com o centro que precisou do caixa. Entra na página Demonstrativo do Resultado, regime de caixa, com a formatação das outras DREs. A pergunta que a versão responde: qual operação é deficitária no fluxo de caixa, quando, e quem está cobrindo.*

---

> ## ⛔ GATE 0 — Medição (M0)
> Um explorador lê o dado vivo e o código e responde às perguntas da §5. A M0 termina com um relatório e **PARA**. O relatório não leva nome de pessoa física; usa rótulos.

> ## ⛔ GATE 1 — Mockup do DS (M1)
> Mockup na rota real, com componentes de produção e fixture: o seletor de centro, as três visões da §4, o bloco de antecipação, as linhas de memória, as notas de cobertura, os estados vazio e de erro, a largura estreita. **PARA** para o Yan. A visão Empresa aparece no mockup idêntica à de hoje.

## 1. Decisões do Yan (firmes — embutir, não rediscutir)

**Lugar e forma**
- Entra na página **Demonstrativo do Resultado, regime de caixa**, por enquanto. Segue a formatação das outras DREs: mesma árvore (mapa vivo), mesmos totalizadores, mesma tabela densa, mesmas pills.
- Só **Realizado** (data de movimentação), o mesmo critério da DRE de caixa.

**Centro de custo**
- **Fonte:** relatório **Lançamentos por Centro de Custo** do Monde, exportado por movimentação, com todos os grupos abertos. Junção pelo **Número** com Lançamentos por Categoria (movimentação).
- **Só 2026.** 2024 e 2025 não têm centro de custo preenchido no Monde. Cada centro começa 2026 com **saldo zero**.
- **CSC é um centro próprio.** O rateio do CSC entre as unidades vem depois.
- **Lançamento sem centro se resolve no Monde,** no próprio lançamento. A plataforma mostra "Sem centro" como coluna visível e nunca redistribui.

**Antecipações de recebíveis**
- O Monde não marca o recebível antecipado. A plataforma o **identifica** casando cada antecipação do registro (conta, data, valor) com os recebimentos na conta (regra na §3.3).
- O **recebível antecipado volta ao mês do vencimento original, no centro dono dele.** O resultado operacional mostra o que cada operação gerou ou consumiu por conta própria.
- **Antecipação de recebíveis - C** (dinheiro que entrou, no mês da antecipação), **Antecipação de recebíveis - D** (devolução, no mês do vencimento original) e **Taxa de antecipação** ficam com **o centro que precisou do caixa**: os centros com saldo operacional acumulado negativo no mês da antecipação, na proporção do déficit. Se nenhum estiver negativo, ficam com o dono dos recebíveis.
- **O D acompanha o C:** cada antecipação é devolvida pelos mesmos centros, nas mesmas proporções em que foi tomada.
- O dono do recebível não ganha linha de antecipação. De quem foram os recebíveis usados aparece numa **linha de memória**, fora das somas.
- **A taxa na DRE é a do Monde.** O registro de antecipações do Janus é a conferência: o que falta lançar no Monde aparece como pendência.
- O **registro de antecipações** (`financeiro.antecipacao`, v6.4.0) é a fonte dos eventos. Ele não muda nesta versão.

## 2. O formato

Visões novas da DRE de caixa (a §4 diz onde ficam):

1. **Árvore operacional** — a mesma árvore da DRE de caixa, calculada por centro, com duas diferenças declaradas: os recebíveis antecipados identificados ficam no mês do vencimento original e no centro dono; e as linhas da categoria de taxa de antecipação saem do bloco onde estão hoje e vão para o bloco de antecipação.
2. **(=) Resultado operacional de caixa** — o último totalizador da árvore, com esse rótulo nas visões por centro.
3. **(+) Antecipação de recebíveis - C · (−) Antecipação de recebíveis - D · (−) Taxa de antecipação.**
4. **(=) Resultado de caixa** — mês a mês, a soma dos centros é **igual ao último totalizador da visão Empresa**.
5. **Memória (fora das somas, estilo distinto):** Recebíveis próprios cedidos para antecipação · Saldo operacional acumulado · Saldo de caixa acumulado. No Consolidado, os saldos mostram o fim do período.

## 3. O que o protótipo já provou (Chat, 20/10 a 06/11)

Protótipo: `DRE_caixa_por_centro_de_custo_2026_v06-11.xlsx` (anexo §12). As regras abaixo são o que ele implementa. A M0 confirma o que depende do código e do banco.

### 3.1 O relatório de centro de custo

- **Layout:** 12 colunas. O cabeçalho "Pessoa" está na coluna A, mas o dado está na B (descoberta posicional resolve; nunca mapa por posição). Linhas de outline `Centro de Custo : <nome> (<n>, R$ <soma>)`, com o estado `-`/`+` na coluna A. **Nome vazio = sem centro.**
- **Grupo recolhido (`+`) não traz as linhas de detalhe.** O primeiro export de teste veio com 3 de 5 grupos recolhidos (83% das linhas faltando). **Grupo recolhido rejeita a carga** (fixture negativa no anexo).
- **Grão:** lançamento × movimentação × centro.
- **Valores:** `Valor Centro Custo` = |`Valor Movimentação`| × `% Centro Custo`, sem sinal; o sinal vem de `Valor Movimentação`. `Valor Lançamento` é o total do lançamento e não entra em conta.
- **Checksum:** o outline por centro (linhas e Σ de `Valor Centro Custo` com sinal) bateu ao centavo nos quatro exports completos. A linha de total do rodapé soma `Valor Movimentação` repetido por centro e **não serve de checksum**.
- **`Pessoa` não entra em tabela:** a DRE não usa. A lista fechada de colunas vai à M0.

### 3.2 O rateio

- **O % é do lançamento, não da movimentação:** é o mesmo em todas as movimentações do Número (0 de 16.882 pares lançamento × centro variam). Por isso a chave é o Número.
- **Peso de cada centro = % do centro ÷ Σ % do lançamento.** Os pesos somam exatamente 1, e a soma dos centros fecha com a DRE ao centavo. O Monde reparte a sobra quando os % somam mais de 100% (8 lançamentos no export de 06/11); por isso o subtotal dele difere do rateio em até R$ 225 num centro.
- **Lançamentos de valor líquido zero vêm sem % no export** (361 em 06/11), embora tenham centro informado. Vão em partes iguais entre os centros informados (na prática, 100% no único centro). Sem essa regra, cerca de R$ 3 mi de receita bruta cairiam em Sem centro. O peso **nunca** vem de `Valor Centro Custo`, que é zero nesses casos.
- **Lançamento só com linha sem centro → Sem centro.** Linhas sem centro de R$ 0,0000 a R$ 0,0002 num lançamento que tem centro são sobra de arredondamento e saem.
- **O % vale igual para todas as categorias do lançamento:** o Monde não permite centro por categoria. 53 lançamentos têm várias categorias e vários centros (1,8% do valor movimentado).
- **Cobertura:** em 06/11, 100% dos lançamentos da base por categoria acharam rateio.
- **As duas bases precisam ser do mesmo dia.** Entre 20/10 e 03/11 entraram lançamentos com data anterior (conciliação atrasada). Base de centro mais velha que a de movimentação gera Sem centro, mostrado como cobertura (§4).

### 3.3 A identificação dos recebíveis antecipados

- **A marca:** o recebível antecipado chega à conta antes do vencimento. No Asaas, o recebimento normal cai no dia do vencimento (mediana 0 dia); na Blimboo, chega até 7 dias antes em 90% dos casos. Os antecipados chegam de 10 a 51 dias antes (mediana por evento).
- **Regra** (constantes nomeadas, com teste; mudar é decisão de produto):
  - **Candidatos:** linhas de Receita de Vendas, positivas, da conta da antecipação.
  - **Janela:** movimentação de 1 dia antes a 2 dias depois da data do registro. O Monde registra o dia em que o dinheiro caiu: as antecipações de 08/04 e 09/04 aparecem em 09 e 10/04.
  - **Antecedência mínima** (vencimento − movimentação): mais de 2 dias no Asaas, mais de 7 dias na Blimboo.
  - **Preenchimento:** os candidatos de maior antecedência primeiro, depois os de maior valor, até completar o valor antecipado. O último entra pela fração que falta.
  - **Ordem:** antecipações processadas em ordem cronológica; cada recebível entra em uma só.
  - **O que se desloca:** só as linhas de Receita de Vendas do recebível vão para o mês do vencimento. A taxa do cartão fica onde está.
- **Resultado em 06/11:**
  - **Cobertura:** 16 antecipações em 2026, R$ 3,85 mi; R$ 3,26 mi identificados (85%). Sem a de 30/10 no Asaas (R$ 520 mil), cujos recebíveis ainda não foram baixados no Monde, a cobertura é de 98%.
  - **Taxa:** registro R$ 84,0 mil, Monde R$ 60,9 mil. Faltam no Monde R$ 23,1 mil, de 24/09, 09/10, 13/10 e 30/10.
- **A regra confere com o registro:** as taxas lançadas avulsas no Monde caem exatamente nas datas encontradas, e os totais por conta batem de perto com o registro.

### 3.4 Quem tomou a antecipação

- **Saldo operacional acumulado** = soma do resultado operacional de caixa do centro desde 01/01, no fim de cada mês.
- **Peso de cada centro no mês m** = max(0, −saldo) ÷ Σ max(0, −saldo) dos centros elegíveis (todos, menos Sem centro).
  - Se nenhum centro estiver negativo: mix dos donos dos recebíveis antecipados no mês.
  - Mês sem antecipação identificada e com taxa no Monde: a taxa fica no centro em que o Monde a lançou.
- **C do mês** = antecipado identificado no mês × peso. **Taxa do mês** = taxa do Monde no mês × peso.
- **D no mês v** = Σ, sobre os meses de antecipação a, do recebível com vencimento em v antecipado no mês a × peso do mês a.
- **Recebível com vencimento depois do período:** o C aparece, o D só vem depois, e a diferença fica como "antecipação tomada e ainda não devolvida".

## 4. A página (proposta, confirmar no GATE 1)

- **Seletor de centro** junto das pills atuais: **Empresa** (padrão, a DRE de hoje, intocada) · Trips · Weddings · Corp · CSC · Sem centro · **Lado a lado**.
- **Um centro, Mensal:** meses em colunas, como hoje, com o bloco de antecipação e a memória.
- **Um centro, Consolidado:** anos em colunas, só os anos com cobertura de centro (derivada do dado, nunca fixa). Em 2026 não há Δ% contra o ano anterior.
- **Lado a lado:** um ano; colunas Trips · Weddings · Corp · CSC · Sem centro · Total (= Empresa). AV por centro só onde houver receita (a M1 decide como mostrar a AV do CSC).
- **Fora da visão Empresa:**
  - "Realizado + Previsto" fica desabilitado, com o "?" explicando: o título em aberto quase nunca tem centro no Monde (90% do valor em aberto de 2026 está sem centro).
  - Os anos sem cobertura ficam desabilitados.
- **Carimbo no topo,** uma linha por fonte (padrão da v6.5.0): Lançamentos · Centro de custo · Antecipações (último registro).
- **Notas sob a tabela nas visões por centro:**
  - cobertura do centro no ano (% do valor movimentado com centro);
  - antecipações identificadas × registradas (R$ e %), com as não identificadas nomeadas por data;
  - taxa ainda não lançada no Monde.
- **Exportar** baixa a visão da tela; em Lado a lado, uma aba por centro mais a consolidada.
- **Quem cobre quem** (decidir no GATE 1): tabela mensal sob a DRE na visão Lado a lado. Usos = déficit dos centros negativos; fontes = saldo dos centros positivos + recebíveis antecipados ainda não vencidos, por dono − taxas pagas + caixa que a empresa já tinha. O protótipo tem a forma (aba Pressão de caixa, seção 9). Se ficar fora, vai para a fronteira.

## 5. M0 — Perguntas que a medição responde

| # | Pergunta | Decide |
|---|---|---|
| Q1 | `raw.lancamentos_movimentacao` guarda `Número`, `Conta` e `Vencimento` por linha? Com que preenchimento? | junção e identificação das antecipações sem base nova adicional |
| Q2 | Qual fonte e qual predicado o Realizado de `get_dre_mensal` usa? Que tipo devolve? Há categoria excluída da árvore (`excluida`, transferências entre contas)? | como a RPC por centro reusa a mesma fonte e o mesmo mapa sem re-derivar (inv. 2); o oráculo do protótipo (inv. 5) |
| Q3 | Em que bloco está hoje a categoria "Taxa de Antecipação" no `dre_categoria_map`? Há outra categoria que represente antecipação? Por `categoria_id`. | o que sai da árvore para o bloco de antecipação |
| Q4 | Os valores de `conta` do registro (`Asaas`, `Blimboo`) e da base (`ASAAS`, `Blimboo`) casam por forma normalizada ou pedem tabela de-para? | casamento das contas |
| Q5 | Último totalizador da árvore de caixa e como a página monta Mensal × Consolidado, pills e Exportar. A tabela aceita colunas que não são meses nem anos? | onde entra o seletor; o tamanho da mudança no front |
| Q6 | O relatório de centro de custo pode vir com filtro por ano de movimentação? Um arquivo por ano, como Vendas? | N arquivos por carga ou um |
| Q7 | Lista fechada de colunas da base nova (o que a DRE usa) e onde `Pessoa` e `Descrição` aparecem. | sonda de lista fechada |

Relatório em `docs/auditoria/v6-5-1-m0-dre-centro-custo.md`, com evidência por pergunta. O explorador só lê.

## 6. Invariantes (inegociáveis)

1. **Paridade com a visão Empresa.**
   - Mês a mês, a soma dos centros (com Sem centro) no Resultado de caixa ≡ o último totalizador de `get_dre_mensal` (Realizado), ao centavo.
   - **Com o ajuste de antecipação desligado** (modo de teste), a soma dos centros ≡ a visão Empresa linha a linha, mês a mês. Essa prova separa o rateio do ajuste.
2. **Uma fonte, nenhuma re-derivação** (lição da v6.3.0). A RPC por centro lê a mesma fonte e o mesmo mapa vivo que o Realizado de `get_dre_mensal`. Remapear uma categoria no editor muda as duas visões no mesmo instante (prova em transação revertida).
3. **Rateio fechado.**
   - Σ pesos por Número = 1.
   - Todo lançamento da base de movimentação tem rateio ou cai em Sem centro.
   - Nada some.
4. **Antecipação conservada.**
   - Σ C = Σ do que foi deslocado.
   - Por mês: operacional + C + D + taxa ≡ Empresa.
   - Pesos do mês somam 1 quando há antecipação.
   - D usa os pesos do mês do C.
   - Recebível nunca entra em duas antecipações.
5. **Oráculo do protótipo.** Com as fixtures de 06/11 (§12), por centro, ao centavo, ressalvadas as categorias que a Q2 mostrar fora da árvore:

   | Centro | Resultado operacional | C | D | Taxa | Resultado de caixa | Recebíveis cedidos |
   |---|---|---|---|---|---|---|
   | Trips | 1.541.966,69 | – | – | – | 1.541.966,69 | 965.817,92 |
   | Weddings | 353.518,44 | 266.196,12 | −266.142,93 | −7.661,94 | 345.909,69 | 2.138.663,46 |
   | Corp | 1.310.380,28 | – | – | – | 1.310.380,28 | 159.191,84 |
   | CSC | −4.071.516,46 | 2.997.477,10 | −2.649.407,30 | −53.249,47 | −3.776.696,13 | – |
   | Total | −865.651,05 | 3.263.673,22 | −2.915.550,23 | −60.911,41 | −578.439,47 | 3.263.673,22 |

   - **Pesos por mês** (Weddings / CSC): jan 52,06% / 47,94% · fev 27,42% / 72,58% · mar 0 / 100% · abr 8,56% / 91,44% · mai, set, out 0 / 100%.
   - **Por evento:** identificado e cobertura idênticos à aba Antecipações do protótipo.
6. **A base nova segue o contrato da v6.0.0:**
   - cru no Storage, parser no servidor, oráculo cru↔tratado com fixture real;
   - **outline por centro como checksum** (linhas e soma com sinal) e **grupo recolhido rejeita**;
   - `promover_carga_*` atômica, que regenera a tabela de rateio dentro da mesma transação;
   - linha em `ingestao.carga`;
   - card de upload com instruções (padrão da v6.1.3); base nova no `docs/contratos/ingestao-v1.md` (mudança aditiva, registrada no ADR);
   - grant só da `promover` na allowlist do `ingestor`.
7. **Lista fechada de colunas** da base nova, com sonda estática. `Pessoa` não entra em tabela.
8. **Regras como constantes nomeadas** (janela, antecedência por conta, ordem de preenchimento, elegíveis do déficit), cada uma com teste. Mudar uma é decisão de produto, de volta ao Chat.
9. **Zero mudança na visão Empresa,** em `get_dre_mensal`, no `dre_categoria_map`, no editor da DRE e no registro de antecipações. A visão Empresa fica pixel-idêntica. O diff é medido, não afirmado.
10. **`app.exigir_acesso` não muda.** Área: a mesma da DRE de caixa (confirmar na M0; área nova só se o Yan pedir).
11. **RPCs novas nascem fora da allowlist do `verificador`;** grant deliberado, por assinatura, na mesma migration.
12. **Convenções vigentes:** despesa negativa; mês corrente "· parcial"; ano parcial com `*`; carimbo por fonte no topo; cobertura derivada do dado, nunca do nome do arquivo.

## 7. Engenharia (proposta; a M0 pode mudar com evidência)

- **Banco:**
  - `raw.lancamentos_centro_custo` (lista fechada);
  - tabela de rateio `(numero, centro, peso)`, regenerada na `promover`;
  - uma função interna que identifica os recebíveis antecipados a partir do registro e da movimentação (determinística, regra da §3.3; laço cronológico em plpgsql serve, são ~16 eventos por ano).
- **RPCs de leitura** (nomes finais na M2):
  - **DRE por centro:** árvore operacional por centro × mês, já com o deslocamento e sem a taxa.
  - **Antecipações por centro:** por evento, identificado, cobertura e taxa Monde × registro; antecipado por dono × mês; matriz mês da antecipação × mês do vencimento; taxa do Monde por mês.
  - Ambas leitura pura, `exigir_acesso` da área da DRE de caixa, Zod + `parseRpc`.
- **Módulo puro com teste** em `src/lib/dre-centro/`: pesos por déficit, C, D, taxa, saldos acumulados, memória e Quem cobre quem (se entrar). A atribuição é aritmética sobre agregados; fica no módulo para ser testada contra o protótipo e reusada pelo Exportar. AV e Δ reusam o que existe (`av.ts`, `deltaYtd`).
- **Pós-aplicação:** `database.ts` e baseline de schema regenerados no mesmo commit; teste de drift verde; verificação via REST (`db query` não executa corpo).

## 8. Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M0** | **GATE 0** — medição da §5, relatório, PARA. | toda resposta com evidência |
| **M1** | **GATE 1** — mockup DS na rota real com fixture (§4); PARA. | visão Empresa idêntica no mockup |
| **M2** | Base nova: parser com oráculo cru↔tratado (fixture de 06/11) e fixture negativa (grupo recolhido); `promover` atômica com checksum e rateio; card de upload + instruções; contrato de ingestão; grant do `ingestor`. `revisor-db` antes; ensaio em transação revertida (checksum falso ⇒ RAISE, base intacta). | inv. 3, 6 e 7 verdes; rateio da fixture ≡ protótipo |
| **M3** | RPCs da DRE por centro e das antecipações; identificação no banco; módulo puro; grant do `verificador`. | inv. 1, 2, 4 e 5 verdes contra o banco |
| **M4** | Front: seletor, as três visões, bloco, memória, notas de cobertura, carimbos, Exportar; visão Empresa intocada. | Empresa pixel-idêntica; cada visão degrada sozinha |
| **M5** | Contratos via REST com `SUPABASE_VERIFICADOR_KEY`: shapes, paridade, `anon` negado, sem área negado; `ingestor` só na `promover`. | allowlist derivada bate com os grants |
| **M6** | Fechamento: versão; CHANGELOG; CHANGELOG_DIRETORIA (uma linha: "a DRE de caixa passa a mostrar o resultado de cada operação, com as antecipações atribuídas a quem precisou do caixa"); ADR; skills tocadas (`ingestao-planilhas` com a base nova e o grupo recolhido; `banco-e-rpc`); out-briefing com a M0, o mockup, os oráculos e prints; WORKING-CONTEXT. | — |

## 9. Gates

`tsc`+`lint` por missão; `build`+`test` após M2, após M3 e no fechamento. `revisor-db` na M2 e na M3; `revisor` ao fim. `verificador-visual` na página se subir; senão, "entregar → Yan confere no preview → ajustar".

## 10. Checkpoint do Yan

- **(M0)** Ler o relatório, em especial Q2 (categorias fora da árvore, que mexem no oráculo) e Q3 (onde está a taxa hoje).
- **(M1)** Aprovar o mockup: seletor, Lado a lado, AV do CSC, Quem cobre quem dentro ou fora.
- **(M2)** Parecer do `revisor-db`; primeira carga real da base de centro de custo pelo card, no mesmo dia da de movimentação.
- **(final)** Conferir um centro no preview contra o protótipo; a soma dos centros contra a visão Empresa em dois meses; as antecipações de 2026 contra o registro. Pedir ao Financeiro o lançamento das taxas pendentes no Monde. **Mostrar à diretoria e anotar o que ela pede.**

## 11. Fronteira (fora desta versão)

Rateio do CSC entre as unidades (chave a decidir) · Previsto por centro (títulos em aberto quase sem centro) · competência por centro (prototipada em 21/10 e deixada de lado: o Demonstrativo do Monde não traz centro, setor nem venda) · 2024 e 2025 · RPA da base de centro de custo (upload manual por enquanto) · página própria para a análise de caixa por operação · prejuízo por setor na página Geral (a base nova pode servir; versão própria) · qualquer mudança no registro de antecipações.

## 12. Anexos (fixtures — copiar para `tests/fixtures/ingestao/` e `docs/`)

| Arquivo | O que é | Uso |
|---|---|---|
| `Lancamentos_por_centro_custo_2026_785564.xlsx` | export de 06/11, 4 grupos abertos (Trips 5.505 · Weddings 10.810 · Corp 2.980 · CSC 1.849 linhas; Σ −578.668,68), sem grupo "sem centro" | oráculo cru↔tratado e checksum |
| `Lancamentos_por_centro_custo_2026.xlsx` | export de 20/10 com 3 de 5 grupos recolhidos | **fixture negativa**: a carga tem de ser rejeitada |
| `Lancamentos_por_categoria_2026_100c44.xlsx` | Lançamentos por Categoria (movimentação) de 06/11, 36.285 linhas, Σ −578.439,47 | junção e oráculo do protótipo |
| `antecipacoes-2026-11-06.xlsx` | export do registro de antecipações do Janus, 44 linhas (16 de 2026) | eventos do oráculo |
| `DRE_caixa_por_centro_de_custo_2026_v06-11.xlsx` | protótipo (abas Consolidado, Pressão de caixa, Antecipações, Qualidade) | oráculo (inv. 5) e referência da forma |

## 13. Skills a ler

`ingestao-planilhas` · `banco-e-rpc` · `contrato-rpc-front` · `ui-design-system` · `tabela-densa` · `react-padroes` · `orquestracao` (Carta, antes de despachar)

## 14. Commits sugeridos

1. `docs(v6-5-1): briefing da versao`
2. `docs(auditoria): medicao da m0 — dre de caixa por centro de custo` — **GATE 0**
3. `docs(v6-5-1): mockup da dre por centro` — **GATE 1**
4. `test(ingestao): fixtures e oraculo da base de centro de custo` (vermelhos)
5. `feat(ingestao): base lancamentos por centro de custo — parser, promover atomica, rateio`
6. `feat(db): rpcs da dre de caixa por centro + identificacao de antecipacoes + grant do verificador`
7. `feat(dre): visoes por centro de custo na dre de caixa`
8. `test: contratos da dre por centro`
9. `chore(release): v6.5.1`
