# ADR-0164 — Reconciliação do espelho Monde: janela curta + varredura diária, e um tripwire que só fala do que mediu

- **Status:** aceito
- **Data:** 2026-08-04
- **Versão:** v5.4.4 (Onda 0 — fechar o furo do espelho do Monde)
- **Contexto:** ingestão do Monde (`/api/monde/ingest`, `monde.*`) — emenda ao **ADR-0149**
  (ingestão) e ao **ADR-0151** (a virada, que fez o espelho virar fonte de produção)

## O problema

A API do Monde filtra a listagem de vendas por **data da venda**. O modo `incremental`, que o
`pg_cron` chama a cada 15 min desde a v5.1.4, pedia a janela `hoje−2d..hoje`. Venda
**registrada com atraso** e data retroativa entra na API depois que a janela já passou por
aquele dia — e o incremental **nunca volta lá**. Não é uma janela pequena demais: é uma janela
que anda para frente sobre um eixo que a origem escreve para trás.

Medido em 04/08/2026, venda a venda contra a API: **42 vendas fora do espelho, R$ 392.070,01 de
faturamento**; 37 de 38 registradas mais de 2 dias após a data da venda, atraso mediano **4
dias** e **máximo 32**. Como o espelho é a fonte de `get_executiva_kpis`, `metas_ritmo_diario`,
`get_tendencia_margem`, `get_decomposicao_variacao`, `get_historico_12m_setores`,
`get_mix_setor` e `get_historico_mensal` desde a v5.1.4, isso era **subestimação de faturamento
em produção**, crescendo a cada venda lançada com atraso.

## Decisão 1 — Janela curta frequente + reconciliação larga diária, não janela larga

A saída óbvia seria alargar o incremental até caber o pior caso. **Rejeitada:** 32 dias é o
atraso *observado*, não um teto garantido — a janela larga continua sendo uma aposta sobre a
cauda, e ainda custa puxar ~35 dias 96 vezes por dia.

Adotado:

1. **Incremental de `hoje−7d`** (o atraso mediano é 4). Cobre o caso comum, barato.
2. **`mode=reconciliacao`:** reprocessa **um mês inteiro por invocação**, ciclando os 3 últimos
   meses por cursor, 3 disparos/dia. Cobre a cauda **e** pega edição retroativa.

A propriedade que importa é que a reconciliação é **auto-curativa**: ela não depende de acertar
o tamanho de janela nenhuma. Se o atraso máximo dobrar amanhã, ela continua fechando o furo sem
mudança de código. Barata por construção — o UPSERT por `raw_hash` ignora venda inalterada
(medido: 2ª passada em jul/2026 inseriu **0** de 775 lidas).

## Decisão 2 — O lock de ingestão é obrigatório, e é uma LINHA de controle, não advisory lock

`monde_ingest_limpar_staging` dá `TRUNCATE` em `monde.venda_staging` e
`monde.venda_item_staging` — **compartilhadas** — no início de **toda** janela. Duas ingestões
sobrepostas fazem uma apagar as linhas da outra em pleno vôo, e as vendas lidas da API nunca são
promovidas: **perda silenciosa**. A race é **pré-existente** (um ciclo que passe de 15 min já se
sobrepõe ao tick seguinte); a reconciliação diária a tornaria rotina.

O briefing oferecia "lock **ou** horário fora do slot do `*/15`". **Horário não basta** — a
reconciliação de um mês dura minutos e o tick de 15 min cai no meio. Ficou lock.

**Por que não `pg_advisory_lock`:** a janela atravessa várias chamadas HTTP (lista → detalhe →
lotes → promover → refresh) sobre conexões **pooladas** do PostgREST; um lock de sessão/transação
não sobrevive entre elas. O lock durável é uma linha em `monde.ingest_control`
(`ingest_em_curso`) com TTL; o advisory lock aparece **só** para tornar atômica a decisão do
claim (o par "expira o velho / insere o meu").

**`release` compara o dono** (`DELETE ... WHERE valor = p_dono`). Sem isso, um `finally` que
chame `release()` sem checar o retorno de `claim()` — o caminho fácil de escrever — libera o lock
de um processo **vivo**, reabrindo a race na hora, sem nem a margem do TTL. (Achado ALTO do
`revisor-db`.) O `p_dono` é token por execução, não nome do modo.

**Invariante do TTL:** não há heartbeat nem fencing token, então o TTL **tem de ficar > 2× o
`maxDuration` da rota** (hoje 900s contra 300s). Mexeu num, mexa no outro.

## Decisão 3 — O tripwire compara contra a API, mas NÃO por contagem crua

O briefing especificava "contagem mensal do espelho × `total` da API, 12 chamadas
`page_size=1`". **Medido e descartado:** a API conta vendas que a transformação exclui por regra
— em jul/2026, **8 Welcome + 12 sem setor + 9 sem item ativo, de 775**. O espelho **nunca** iguala
o total da API, então esse tripwire acende **todo mês, para sempre**. Rodado uma vez, acendeu nos
12 meses. Alarme sempre aceso não é alarme: é a falha silenciosa invertida.

A comparação exata sai **de graça**: a reconciliação já baixa o detalhe de cada venda do mês,
então sabe quantas eram espelháveis e quantas excluiu, **por motivo**. O tripwire virou
**subproduto dela** — zero chamada extra — e grava por mês:

```
api · lidas · sem_sale_id · espelhaveis · excluidas{welcome,sem_setor,sem_item_ativo}
erros · espelho · sobrando · conta_fecha
```

O alarme é `erros > 0 || sobrando > 0 || sem_sale_id > 0 || !conta_fecha`, sendo `conta_fecha` a
checagem de integridade `lidas == espelhaveis + Σexcluidas + erros` — é ela que dá sentido ao
resto. **Mês que a reconciliação ainda não visitou aparece como `nao_verificado` e nunca
acende.** Perde-se a cobertura barata de 12 meses; ganha-se um alarme em que dá para acreditar.

**Consequência aceita:** o tripwire só enxerga o que a janela de reconciliação alcança (3 meses).
Drift em mês mais antigo não é detectado — decisão consciente, registrada aqui para quem for
alargar depois.

## Decisão 4 — `ultima_sincronizacao` passa a ser só do incremental

A `0183` definiu `ultima_sincronizacao` como `max(atualizado_em)` das chaves `ultimo_incremental`
**e** `ultimo_promover`. Como `monde_ingest_promover` grava `ultimo_promover` sempre que promove
algo, a reconciliação diária passaria a empurrar esse selo e **mascararia por ~45 min um
incremental morto** — justo o alarme de `src/lib/metas/sync-atraso.ts` (3 ticks de 15 min).

Estreitado para **só `ultimo_incremental`**, que a rota grava a cada ciclo mesmo sem venda nova.
Hoje o `max()` já é ele na prática, então **o rótulo de `/metas` não muda de valor — muda de
garantia**. A reconciliação ganhou campo próprio (`ultima_reconciliacao`).

**Efeito colateral honesto** (apontado pelo `revisor-db`): depois disto, um `backfill`/`window`
manual **não reseta mais** o relógio do alarme. É a leitura correta — o alarme mede a saúde do
cron automático, não a última escrita qualquer —, mas confunde quem olhar `/metas` logo após um
backfill manual durante um incidente: o rótulo segue vermelho mesmo com dado fresco.

## Decisão 5 — O agendamento não entra na mesma migration que o código ainda não suporta

A `0232` (detector, lock, status) é **inerte**: nada em `src/` a chama até o deploy. O
`cron.schedule` da reconciliação ficou de fora dela, na **`0236`**, aplicável **só depois** do
`route.ts` estar em produção — o cron chama a URL de produção, do Vault.

Agendar antes faria os 3 jobs baterem em `mode=reconciliacao`, cair no ramo `incremental`
default, responder **200** e aparecer **verdes** em `cron.job_run_details` — exatamente o que o
checkpoint manda conferir — sem reconciliar nada. Seria fabricar a falha silenciosa que esta
versão existe para caçar. (Achado CRÍTICO do `revisor-db`; era erro de **ordem no plano**, não da
migration.)

Corolário operacional: **a `0236` não é escrita em `supabase/migrations/` antes da hora** — o
`db push` empurra todo o conjunto pendente e ela entraria de arrasto (a armadilha que custou a
v5.2.0).

**Nota de numeração.** O corpo da `0232` fala em "0233" porque era o número livre quando ela foi
escrita. A versão paralela (*Metas por subsetor*, hoje em stand-by) tomou 0233/0234/0235 antes, e
o agendamento passou a ser a **0236**. A `0232` **não foi editada**: o banco guarda os
`statements` de cada migration aplicada, então corrigir o comentário a faria divergir do próprio
histórico. Migration aplicada é registro.

**Dívida que esta versão criou, e que vale registrar contra a próxima.** A `0232` foi aplicada a
partir de uma branch não mergeada. Como o arquivo não estava no `main`, o `db push` da sessão
paralela quebrou com `LegacyDbPushMissingLocalError`, e só destravou quando ela trouxe os arquivos
para o `main` (PR #215). **Aplicar migration antes do merge trava toda outra branch** — quem faz
isso avisa as sessões paralelas na hora, ou mergeia o arquivo primeiro.

## O que NÃO foi decidido aqui

- **`transformSale` fica intacto** (invariante 1 do briefing). O furo é de **alcance**, não de
  interpretação; mexer na transformação exigiria reprocesso do histórico.
- **As vendas "sobrando"** — 5 em jul/2026 e 5 em jun/2026 que continuam no espelho tendo deixado
  de ser espelháveis (perderam o último item ativo depois de ingeridas; o UPSERT nunca remove).
  Achado desta versão, **medido e reportado** (campo `sobrando`), **não corrigido**: remover linha
  é escrita destrutiva em dado e faria faturamento de mês fechado **cair**. Decisão do Yan.
- **Vendas que a API lista sem `sale_id`** — a ingestão não as alcança (precisa do id para o
  detalhe). Zero nos meses medidos; o campo existe para o dia em que não for.
