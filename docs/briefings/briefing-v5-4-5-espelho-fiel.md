# Briefing v5.4.5 — O espelho passa a espelhar: filtro de negócio sai da escrita e vai para a leitura

**Tipo:** PATCH (correção de defeito em produção + mudança de princípio de desenho) · **Migration:** `0237` aditiva · **ADR:** `0165`, emendando **0149** (ingestão) e **0164** (reconciliação) · **Base:** `main` @ v5.4.4 · **Branch:** `fix/v5-4-5-espelho-fiel` · **Rota A**

> **Numeração:** produção está na **5.4.4**; esta é a **5.4.5**. Última migration aplicada é a `0236` ⇒ **0237**. **`ADR-0163` segue RESERVADO** pela branch em stand-by (`feat/v5-4-4-metas-subsetor-weddings`, que tem o arquivo) e a `0164` é da v5.4.4 ⇒ **ADR-0165**. Se aquela versão for retomada, ela pega 5.4.6+.

---

## 1. O problema (medido, não suposto)

O espelho **mantém venda que a origem já não reconhece**, com os valores congelados de antes da mudança. Medido em 04/08/2026 contra a API, venda a venda:

| mês | vendas sobrando | faturamento inflado | receita inflada |
|---|---|---|---|
| **jul/2026** | **5** | R$ 432.237,61 (**+5,95%**) | R$ 294.675,76 (**+25,0%**) |
| jun/2026 | 5 | R$ 79.712,64 (+1,16%) | R$ 10.953,68 (+1,17%) |

**A receita de julho está inflada em um quarto.** Quase tudo vem de **uma venda**: a `73083` está no espelho com R$ 331.980,20 de faturamento e R$ 293.721,82 de receita; na API hoje ela vale **R$ 19.712**, receita **−R$ 687,96**, com o único produto **cancelado em 24/07**. O espelho não está atrasado — guarda um número que **foi apagado na origem**.

Corroboração independente: julho **sem** as sobrando dá R$ 6.833.727,29, contra R$ 6.831.043,54 do upload de Excel — **R$ 2,7 mil de diferença**. Tirar as sobrando alinha o espelho ao upload quase ao centavo.

Causa classificada nas 10, uma a uma: **todas** por *zero item ativo na API hoje*. Nenhuma é Welcome, nenhuma mudou de setor, nenhuma saiu da janela de data.

## 2. A causa-raiz: o filtro está na escrita, e o schema queria ele na leitura

`monde.venda_item` tem coluna **`status`** (`active`/`canceled`) e **`canceled_at`**, e a `monde.mv_vendas_diarias` filtra `WHERE i.status = 'active'`. Mas a tabela tem **47.154 itens, todos `active`, zero cancelados** — **o filtro da mv é código morto**. O comentário da própria `0178` diz que os cancelados eram para ser *"guardados (auditável)"*.

Quem desfaz isso é o `transformSale`: ele filtra `p.status === 'active'` **antes** de gravar e descarta a venda inteira se não sobrar item ativo. Isso cria a falha estrutural:

> O UPSERT só escreve sobre **o universo que ele pediu** — as vendas que a API devolveu **e** que passaram na transformação. Venda que **sai** desse universo fica invisível para a escrita: não pode ser atualizada e não pode ser removida. A linha velha sobrevive para sempre.

Nota: venda que **continua** qualificando e só muda de valor **já se corrige** (UPSERT por `raw_hash` regrava os itens). O furo é só na saída do conjunto.

## 3. Decisões já tomadas (firmes)

- **O princípio:** **o espelho espelha; a regra de negócio mora na leitura.** Guardar tudo o que a API devolve; as views decidem o que somar.
- **Exclusão é MARCAÇÃO, nunca DELETE.** Preserva auditoria e rollback, e torna a mudança **aditiva** em vez de destrutiva. Ninguém apaga linha de dinheiro para consertar um total.
- **Camadas na ordem certa:** primeiro a estrutural (§4.1), que torna o furo impossível; depois a reconciliação como igualdade de conjuntos (§4.3), que pega o resíduo; por último o alarme, que já existe.
- **O reprocesso do histórico é decisão à parte**, tomada com o número na mão (M6).

## 4. Desenho

### 4.1 O espelho passa a guardar tudo (a camada estrutural)

`transformSale` para de descartar:

- **Item cancelado é gravado** com `status`/`canceled_at` reais (as colunas já existem e estão vazias de conteúdo útil).
- **Venda que hoje é excluída por regra passa a ser gravada** com o motivo derivado numa coluna nova (`excluida_motivo`: `welcome` | `sem_setor` | `sem_item_ativo`), em vez de sumir.
- ⚠️ **O rateio de receita continua caindo SÓ nos itens ativos** (cancelado recebe `receitas = 0`). Sem esse cuidado, receita vaza para linha que a view não soma e o total por venda deixa de fechar com `total_revenue`.

Com isso, venda que perde todos os produtos deixa de "sair do universo": ela é **regravada** com os itens cancelados, e a view a ignora. **Auto-corretiva, sem ninguém mandar.**

### 4.2 As views passam a aplicar a regra

`monde.mv_vendas_diarias` mantém `status='active'` (que deixa de ser código morto) **e** passa a excluir venda com `excluida_motivo` preenchido. As views-compat da virada (`mv_vendas_diarias_compat`, `mv_vendas_mensais`) herdam por construção. `monde_vendas_ausentes` alinha a mesma regra — senão o detector e a mv discordam sobre o que "estar no espelho" significa.

### 4.3 A reconciliação afirma igualdade de conjuntos

Hoje a varredura diária garante metade: `espelho(mês) ⊇ espelháveis(API(mês))`. Passa a garantir as duas: ao fim de cada mês, o que está no espelho e a API já não considera espelhável é **marcado como excluído**. Ela **já calcula** esse conjunto a cada rodada — só não age. O tripwire passa a tratar `sobrando > 0` como invariante violado, não como aviso.

### 4.4 O que este briefing NÃO conserta

O furo de **venda com data retroativa** é de outra natureza: é sobre *o que se pergunta*, não sobre o que se guarda. A v5.4.4 já o cobriu (janela de 7 dias + varredura de 3 meses). Limite conhecido que permanece: **mês fora dos 3 últimos não é revisitado** — e é uma das perguntas ao provedor (§8).

## 5. Invariantes (inegociáveis)

1. **Nenhum número de tela muda além do efeito pretendido.** A remoção das sobrando é o objetivo; qualquer outra variação é bug. **Provar por cross-check antes/depois, mês a mês** — não por confiança.
2. **Rateio de receita só em item ativo**, e a soma por venda continua batendo com `total_revenue` **ao centavo**.
3. **Nenhum DELETE em dado de venda.** Exclusão é marcação.
4. **`monde.venda.raw` permanece intocado** — é a única fonte para o reprocesso do histórico.
5. **RPC/view nova ou alterada verificada EXECUTANDO via REST/service_role** — introspecção não prova execução.
6. **Migration aditiva, numerada na hora, com bloco `DOWN`.** ⚠️ E **nunca citar expressão de cron dentro de comentário `/* */`** — a sequência que fecha bloco encerra o comentário e o resto vira SQL (matou a 1ª aplicação da `0236`).
7. **O upload de Vendas continua vivo.** O Scope B segue bloqueado pelo pedido de receita por produto (§8).

## 6. Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Congelar o "antes".** Auditoria READ-ONLY dos últimos 12 meses: quantas vendas sobrando por mês e quanto inflam faturamento/receita. É a linha de base e o teste de aceitação. | o número de jun/jul reproduz o que está no §1 |
| **M2** | **O espelho guarda tudo.** `transformSale` grava item cancelado e venda excluída (com motivo); coluna nova em `monde.venda`. Rateio só nos ativos. | item cancelado aparece com status correto; soma dos ativos por venda = `total_revenue` ao centavo; venda SEM cancelado não muda em nada |
| **M3** | **As views filtram.** `0237`: coluna + mv + views-compat + `monde_vendas_ausentes` alinhados. | **cross-check mês a mês: só as sobrando saem** — nenhum outro valor se move |
| **M4** | **Reconciliação = igualdade de conjuntos.** Marca o que sobra no mês reconciliado; tripwire trata `sobrando > 0` como violação. | rodar 2× não muda nada na 2ª; as 10 vendas de hoje saem; tripwire vai a `sobrando = 0` |
| **M5** | **Caso de contrato** que reprova se `espelho(mês) ≠ espelháveis(API(mês))`. | visto **reprovando** antes da correção |
| **M6** | **Reprocesso do histórico (decisão do Yan).** Itens cancelados das vendas já espelhadas são reconstruíveis a partir do `raw` **sem chamar a API**; vendas nunca ingeridas exigem API. Medir custo e impacto, e só então decidir. | número medido e apresentado; nada aplicado sem o "sim" |
| **M7** | **Fechamento.** v5.4.5; CHANGELOG; CHANGELOG_DIRETORIA (negócio: *"alguns totais recentes caem — venda cancelada no Monde deixa de contar"*); **ADR-0165**; out-briefing com o antes/depois por mês; **e a §8 deste briefing consolidada como pauta para o provedor**. | — |

## 7. Gates e checkpoint

Gates escalonados: `tsc` + `lint` ao fim de cada missão; `build` + `test` na fronteira de fase (após M3) e no fechamento. Migration com backup-gate. Views verificadas executando via REST.

⚠️ **CHECKPOINT DO YAN — obrigatório, entre M3 e a aplicação.** Esta versão **muda números de meses fechados para baixo**. Antes de aplicar, o Yan vê a tabela de impacto por mês (faturamento e receita, antes × depois) e autoriza. Se julho já circulou na diretoria, a conversa é *corrigir e comunicar*, não só corrigir.

**Comunicação:** o faturamento recente **cai** — o oposto da v5.4.4, e pela mesma razão de fundo: o número está ficando certo. Vale a nota de uma linha, porque a v5.4.4 acabou de fazer julho **subir**.

## 8. Pauta para o provedor do Monde (consolidar e enviar)

> Registrado aqui a pedido do Yan, para dar um feedback único ao provedor. Somos piloto — o pedido é viável. Ordenado por **alavancagem**, não por facilidade.

### 8.1 Filtro por data de ALTERAÇÃO na listagem de vendas — o de maior alavancagem

Hoje a listagem (`resource=sales`) filtra **só por data da venda**. Como o Monde permite lançar venda com data retroativa, o Janus não tem como perguntar *"o que mudou desde X?"* — e por isso precisou construir uma varredura diária de 3 meses inteiros para não perder venda. **Medido: 42 vendas / R$ 392.070,01 ficaram fora do espelho**, com atraso de lançamento mediano de 4 dias e **máximo de 32**.

**Pedido:** um parâmetro de filtro por `updated_at`/`registered_at` (ou um endpoint "alterações desde X" devolvendo só `sale_number`). Isso substituiria a varredura inteira por uma chamada barata e **eliminaria a classe de erro**, em vez de remediá-la.

### 8.2 Receita por produto — desbloqueia o Scope B inteiro

`total_revenue` existe **por venda**, não por produto. Testados 4 candidatos de reconstrução a partir dos campos expostos por produto (comissão, over, taxa de agência, RAV, `passengers[].agency_fee`, `totals.agency_fee`): o melhor bate ao centavo em **26,8%** das vendas e cobre **55%** do valor. Sem isso o Janus precisa **ratear** a receita da venda entre os produtos, o que:

- torna a **margem por produto** uma alocação, não um fato (desvio medido de até 3,5 p.p. no ano e muito mais no mês);
- torna o **relatório de prejuízo por produto irreprodutível** (perda de um produto dentro de venda lucrativa desaparece);
- distorce a **receita por subsetor** de Weddings.

**Pedido:** expor a receita/comissão realizada **por produto**. É o pedido que conserta três coisas de uma vez.

### 8.3 `total_revenue` inclui produto cancelado — é intencional?

Casos medidos em que a receita da venda não corresponde aos produtos vivos: venda **61985** com `total_revenue` **−R$ 624.711,04** e apenas um produto ativo de R$ 2.341,31; venda **48522** com `final_value` 0 e receita **−R$ 157.235,84**. Aparentemente o total agrega produtos já cancelados/apagados.

**Pergunta:** o `total_revenue` deve incluir produto cancelado? Se sim, existe uma versão "só do que está vivo"?

### 8.4 Nome da operação — hoje só dá para 17% dos casos

`operation_id` vem na venda (95,9% das vendas de Weddings), mas o **nome** da operação só aparece em `raw.operation.name` (poucos casos) ou como produto no bucket `operations`. Juntando tudo, o Janus consegue nomear **51 de 303** operações (16,8%). Não existe `resource=operations`.

**Pedido:** um recurso de operações (`id`, `nome`, datas) ou o nome junto do `operation_id` na venda. Weddings depende desse vínculo.

### 8.5 Recurso `people` — campos fiscais e filtro incremental

O `people` expõe 10 campos e o Janus precisa de **17** para faturamento e NFS-e. **Faltam:** CEP, endereço, número, complemento, bairro, UF, país, razão social, inscrição estadual, inscrição municipal e telefone fixo. E **`city_name` vem nulo em 100%** de uma amostra de 1.000 (parece defeito, não ausência de dado).

Consequência: a base de Pessoas **continua sendo mantida por upload manual de planilha**, com todo o risco disso — hoje ela está com carga de 30/06 enquanto a API já tem 602 pessoas a mais.

Além dos campos: **`from`/`to`/`updated_since` são ignorados** em `people`, e `page_size` tem teto de 200 ⇒ **324 páginas por varredura completa**. Sem filtro incremental, sincronizar Pessoas é sempre varrer tudo.

**Pedido:** (a) os campos de endereço/fiscais; (b) corrigir `city_name`; (c) filtro incremental; (d) elevar o teto de `page_size`.

### 8.6 Vendas listadas sem `sale_id`

A listagem às vezes traz venda sem `sale_id`, e sem o id não há como buscar o detalhe — essa venda **nunca chega ao espelho**. Foi zero nos meses medidos, mas o contrato permite.

**Pergunta:** `sale_id` pode faltar de verdade? Em que situação?

### 8.7 Semântica de venda `opened` com todos os produtos cancelados

A venda **73083** está `opened` na API com o único produto cancelado. Do ponto de vista do negócio, ela é uma venda que existe, uma venda cancelada, ou um rascunho?

**Pergunta:** qual o estado canônico para "venda cujos produtos foram todos cancelados"? A resposta define se ela deve contar como zero ou não contar.

## 9. Fronteira

**Fora desta versão, e por decisão:**

- **Reprocesso do histórico** — medido na M6, aplicado só com o "sim" do Yan.
- **O resto do Scope B** (repontar `get_mix_produto`, `get_cagr` e as 4 de Weddings) segue **em espera** do pedido §8.2. `get_prejuizos` fica como está.
- **Pessoas** segue no upload manual, dependente do §8.5.
- **Alargar a janela de reconciliação além de 3 meses** — só se o §8.1 não vier; com o filtro por alteração, a varredura larga deixa de ser necessária.
