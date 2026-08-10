# ADR-0166 — Rendimento potencial do float: conta virtual composta, simétrica e projetada

- **Status:** aceito
- **Data:** 2026-08-07
- **Versão:** v5.5.0 (Weddings: rendimento potencial do float)
- **Contexto:** Weddings — `analytics.fato_lancamento_operacao`, `analytics.dim_taxa_cdi`,
  `analytics.vw_rendimento_float_operacao`, ingestão SGS/BACEN. Registra a **definição de uma
  métrica** e o **mecanismo de alimentação da taxa**.

## O problema

Weddings recebe antes de pagar. Entre o sinal do contrato e o pagamento dos fornecedores há
meses de caixa parado, e esse float é valor financeiro real do modelo de negócio — só que
invisível na plataforma. Nenhuma tela dizia quanto ele vale.

Medir isso exige responder três perguntas que não têm resposta óbvia, e é para fixá-las que
este ADR existe: **qual é a conta**, **qual é a taxa**, e **de onde a taxa vem sem depender de
alguém lembrar de atualizá-la todo mês**.

## Decisão 1 — A conta é uma CONTA VIRTUAL REMUNERADA, composta e simétrica

```
saldo_virtual(t) = saldo_virtual(t−1) × (1 + i_t) + fluxo_t
saldo_real(t)    = saldo_real(t−1) + fluxo_t
indicador        = saldo_virtual_final − saldo_real_final
```

Regime **composto**, nunca juros simples: o dinheiro que rendeu no mês passado rende de novo
neste. Granularidade **mensal** — o saldo do mês rende o mês cheio; refinamento diário é dívida
consciente, não escopo (a série diária do SGS existe).

**Simétrico por construção.** Saldo virtual negativo "rende" negativamente, e isso é o custo
teórico de ter de captar à CDI. Não há ramo especial no código para isso: sai de graça da
fórmula. Uma operação que ficou devedora no meio do caminho paga por isso no indicador, e é o
comportamento certo — o float é uma faca de dois gumes e a métrica precisa dizer os dois.

**Corolário que vale registrar** (é o que permite abrir o total sem uma segunda conta): como a
diferença entre os dois saldos acumula exatamente os termos de juro,
`indicador = Σ juros_t`, com `juros_t = saldo_virtual(t−1) × i_t`. Por isso
`rendimento = rendimento_positivo + custo_negativo` é uma **identidade**, não uma
reconciliação — as três linhas do bloco do drawer não podem discordar entre si.

**O juro do 1º mês não incide sobre o fluxo do próprio 1º mês.** O dinheiro chega ao longo do
mês; render sobre ele desde o dia 1 seria otimismo embutido.

## Decisão 2 — PROJETADO, na mesma base do Resultado Previsto

A conta inclui lançamentos **efetivados** (pela data de liquidação) **e previstos** (pela data
de vencimento) — em SQL, `date_trunc('month', COALESCE(liquidacao_dt, vencimento_dt))`. É
exatamente a régua da `0141`, que alimenta o gráfico de Acumulado, e a mesma base do Resultado
Previsto.

Consequência aceita: quando a taxa real de um mês entra pela ingestão, o número previsto
**flutua**. É o mesmo comportamento do Resultado Previsto, e a coerência entre eles vale mais
do que a estabilidade de um número que seria falsamente firme.

## Decisão 3 — Benchmark 100% do CDI; o mês corrente usa a última taxa FECHADA

A referência é o CDI acumulado no mês (série **4391** do SGS/BACEN, em % a.m.), guardado em
`analytics.dim_taxa_cdi` como **fração decimal** (`0.0122` = 1,22% a.m.). Guardar percentual
espalharia um `/100` por todo o código e a próxima divergência nasceria aí.

Para o mês corrente e os futuros vale a **última taxa fechada conhecida, mantida constante**.
Não é uma aproximação preguiçosa: o CDI de um mês só existe depois de o mês fechar, então
qualquer outra escolha seria inventar dado.

⚠️ **Esta decisão tem uma armadilha que custou uma migration corretiva.** O SGS **publica o mês
corrente parcial** — em 07/08/2026 a série devolveu ago/2026 = 0,21%, que é o acumulado de sete
dias corridos, não do mês. O estrago não fica no mês corrente: como a regra de projeção repete a
**última taxa conhecida** sobre todo o futuro, o parcial gravado virava a taxa de *todos* os
meses à frente, e o rendimento projetado inteiro saía calculado a 0,21% a.m. em vez de ~1,15% —
**cinco vezes menor, e plausível o bastante para ninguém desconfiar olhando a tela**.

A correção ficou nas **duas pontas**: a ingestão não grava mês aberto, e a **leitura não aceita
mês aberto** (`0240`). Só a escrita não bastaria — a linha parcial já estava gravada, e removê-la
seria DELETE. Com o filtro na leitura ela fica inerte e se autocorrige quando o mês fechar. É a
mesma lição da v5.4.5: **filtro de negócio mora na leitura**.

## Decisão 4 — A ingestão é a própria carga inicial, e não tem modo separado

A rota `/api/cdi/ingest` busca **sempre a série inteira** (ago/2024 → hoje, ~25 linhas, uma
requisição). Com isso o backfill e o tique mensal são literalmente a mesma chamada — o que o
briefing pediu como "fonte única" — e a rotina fica **auto-curativa**: um mês que tenha falhado
é preenchido no tique seguinte sem ninguém perceber. Um modo `backfill` separado só existiria
para poupar tráfego que não é problema nesta escala.

**Mecanismo de agendamento: `pg_cron` + `net.http_post` chamando a rota interna.** O briefing
preferia o banco buscar e gravar no mesmo corpo, sem passar pelo app — **isso não é executável
aqui**: o projeto só tem `pg_cron` e `pg_net` habilitados, e `pg_net` é **assíncrono** (enfileira
a requisição; a resposta cai em `net._http_response` depois), então uma função plpgsql não
consegue buscar e parsear na mesma transação. Não há extensão HTTP síncrona. O caminho adotado é
o que já roda em produção desde a `0182` para o Monde.

**Falha é ALTA, mas não derruba nada.** A rota devolve **502** quando o BACEN não responde ou
muda de formato — nunca 200 silencioso, porque "200 sem conteúdo" é o modo de falha que já
enganou este projeto (v5.1.11). Ao mesmo tempo o indicador continua de pé com as taxas já
gravadas, e a premissa da Decisão 3 já cobre naturalmente o período sem taxa nova. O sinal
operacional de que algo parou é `atualizado_em` estagnado — e é por isso que ele é reescrito a
**toda** ingestão bem-sucedida, inclusive quando o valor não mudou: assim ele significa "última
vez CONFIRMADO pela fonte", e não "última vez que a taxa mudou".

## Decisão 5 — Teórico nunca se mistura com contábil, e a cor carrega isso

Nenhuma célula soma o float a resultado, margem ou faturamento. No drawer o bloco é uma **caixa
própria**, fora da caixa contábil — a separação é geometria, não intenção.

Cor: token novo **`--teorico`** (`#8A6413`). Não é `--setor-weddings` (`#BA7517`), que dá
**3,72:1** sobre branco e reprova AA — a mesma armadilha da v5.4.1. O tom adotado mede **5,4:1**.
É token **separado** de `--warning-deep` apesar de coincidirem hoje: se "atenção" virar laranja
um dia, valor teórico não pode ir junto.

**Nunca verde.** Verde e vermelho já significam resultado real na mesma linha da tabela; pintar
o teórico de verde faria a tela afirmar que a empresa ganhou aquele dinheiro.

**Nulo é travessão, nunca zero.** Operação sem lançamento e série de CDI ausente produzem
`NULL`, não `0` — zero é a afirmação "não rendeu nada", que seria falsa nos dois casos.

## Decisão 6 — O gráfico mede a JANELA, e diz isso

O card de Fluxo de Caixa rebaseia todo acumulado na borda esquerda sempre que o slider se move
(v5.4.2). As duas curvas do float **seedam no mesmo ponto** dessa borda, então o gap começa em
zero e o que o gráfico mostra é o rendimento gerado **dentro da janela visível** — **menor** que
a coluna da Lista, que mede a vida inteira da operação. Os dois números aparecem na mesma tela e
divergem de propósito; o subtítulo do gráfico diz isso com todas as letras.

**A curva virtual não pode ser fatiada.** Juro é composto, então o valor de um mês depende de
onde a série começou; recortar uma curva pronta na janela carregaria juros de meses fora da
vista e daria o desenho errado em **toda** posição do slider menos a default — de um jeito que
parece certo, porque a curva continua subindo. Por isso o banco devolve a **série de taxas**
(igual para toda operação e todo filtro) e as curvas são recompostas no cliente a partir do
fluxo mensal que `fatiarJanela` já derivava. Arrastar o slider segue sem refetch.

## Alternativas descartadas

- **Materializar a view do float.** Foi a recomendação do `revisor-db` para o custo da recursão.
  Descartada porque **MATERIALIZED VIEW não aceita `CREATE OR REPLACE`** (v5.4.5): toda alteração
  futura da métrica viraria `DROP`+`CREATE` destrutivo, com humano em TTY — caro demais para uma
  métrica recém-nascida. Em vez disso, a aplicação foi **sequenciada**: os objetos novos primeiro
  (risco zero, superfície nova), medição contra produção, e só então o join na RPC viva. Medido:
  a Lista foi de 2304 ms para 2660 ms frio (teto do role = 8000 ms), então materializar não era
  necessário. Se um dia for, o caminho é manter a DEFINIÇÃO na view comum e a materializada como
  `SELECT * FROM` ela, preservando a alterabilidade por REPLACE.
- **Juros simples.** Rejeitado na definição: subestima sistematicamente e não é como dinheiro
  aplicado se comporta.
- **Ramo especial para saldo negativo.** Desnecessário — a simetria sai da fórmula.
- **Série 4392 (CDI anualizado).** É a mesma série do CDI, porém ao ano; entraria na conta
  composta inflada em uma ordem de grandeza. Há guard de faixa na conversão, mas ele **não é
  proteção completa** (com CDI anual em ~4% a.a., como em 2020, o valor anualizado passaria pelo
  teto) — o que garante a série certa é a constante, não o guard.

## Emenda — 2026-08-10 (v5.5.1): a Decisão 5 admite UMA exceção nomeada

Depois de ver a v5.5.0 no ar, o Yan pediu uma coluna **"Margem Teórica (a.a.)"**: a margem
anualizada considerando o Resultado Previsto **mais** o rendimento potencial do caixa livre.

Isso **contraria a Decisão 5** acima, que proibia somar o float a resultado, margem ou
faturamento. A proibição continua valendo como regra geral — o que muda é que passa a existir
**uma exceção, e ela é nomeada**: uma coluna cujo próprio rótulo diz "Teórica", com tooltip
declarando que embute rendimento a 100% do CDI que não representa aplicação real, exibida **ao
lado** das colunas contábeis intactas, para que a diferença entre as duas seja legível.

O que continua proibido, e é o núcleo da decisão original: somar o float dentro de um número que
se apresente como contábil. "Margem", "Margem (a.a.)", "Resultado Prev." e "Faturamento" seguem
sem nenhum componente teórico.

**Detalhe de implementação que vale registrar:** o percentual é arredondado **uma única vez, no
SQL**, e viaja pronto no payload. Derivá-lo no cliente exigiria arredondar lá, e `Math.round`
(meio-para-cima) discorda do `ROUND` do Postgres (meio-para-longe-de-zero) nos valores negativos —
que esta métrica produz de verdade. A coluna passaria a exibir um número diferente do que o
`ORDER BY` usa.

Na mesma versão, e sem efeito sobre a definição da métrica: o gráfico passou a se chamar
**"Rendimento Potencial do Caixa Livre"**, perdeu o total "na janela" e o subtítulo, e a linha do
saldo real ficou preta. ⚠️ **O subtítulo removido carregava a nota teórica do gráfico** — a
Decisão 5 pedia a nota nos três pontos de UI, e agora ela vive só na coluna e no drawer. A
distinção "janela × vida inteira" passou a depender dos nomes diferentes entre o gráfico e a
coluna.

## Consequências

- Weddings passa a ter um número para o valor financeiro do próprio modelo de recebimento.
- A `dim_taxa_cdi` é gerida **exclusivamente** pela ingestão. Não há UI de administração de
  taxas; intervenção excepcional é ato humano via SQL.
- O indicador herda a cadência do **upload** de Weddings, não do Monde:
  `analytics.fato_lancamento_operacao` é alimentada pelo upload de planilha.
- A taxa futura constante é **premissa validada pelo Yan** no fechamento desta versão.
