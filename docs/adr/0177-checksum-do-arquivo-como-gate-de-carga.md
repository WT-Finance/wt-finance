# ADR-0177 — Checksum do arquivo como gate de carga

**Status:** aceito (v6.0.0) · **Data:** 2026-09-25 ·
**Contexto:** versão v6.0.0, "Fundação da ingestão" — Frente D (carga atômica) ·
**Briefing:** `docs/briefings/briefing-v6-0-0-fundacao-ingestao.md` §5-D, invariantes 1/4/5 ·
**Contrato:** `docs/contratos/ingestao-v1.md` §4 · **Migrations:** `0277` (staging `UNLOGGED` das
quatro bases + `raw.lancamentos_operacao` + `ingestao.promocao`), `0278` (as quatro
`limpar_staging_*`/`inserir_lote_staging_*`/`validar_carga_*`/`promover_carga_*` + a nova
assinatura de `promover_carga_vendas`), `0279` (a credencial `ingestor` passa a aplicar de fato),
`0284` e `0285` (correções exigidas pelas cargas reais da M9) · **Anexos:**
`anexo-v6-0-0-m5-desenho-da-atomicidade.md`, `anexo-v6-0-0-m9-cargas-reais.md`

> Numeração conferida contra `docs/adr/` e `supabase/migrations/` na worktree (branch com `main`
> já mesclado em `81240e0`) em 25/09/2026 (últimos reais: ADR 0175, migration 0285); conferência
> contra o remoto é do orquestrador no fechamento.

## O problema

Os cinco exports do Monde já carregam a própria prova de integridade: linha de totais, linhas de
outline ("Grupo de Categoria: X (n, R$ v)"), Total Geral do pivot. Até esta versão esses números
eram lidos e **descartados** pelos scripts R antes de o arquivo tratado chegar ao Janus — jogar
fora a linha de totais sem lê-la primeiro é jogar fora o checksum que o próprio export já
oferecia de graça. Ao mesmo tempo, as quatro bases fora de Vendas carregavam por
`truncar_*`/`inserir_lote_*` em requisições HTTP separadas: entre o truncamento e a última
inserção a base ficava vazia ou parcial para qualquer leitor concorrente — o oposto do invariante
"carga é atômica ou não é".

## Decisão

**O arquivo confere a si mesmo, duas vezes, e nenhuma versão parcial fica visível.**

1. **Os totais são lidos ANTES de descartar.** Cada parser (Frente C) trata a linha de totais e as
   linhas de outline como **checksums**, não como ruído a remover — extrai o valor declarado pelo
   próprio Monde antes de excluí-las do conjunto de dados. Números por base: Demonstrativo **557**
   (556 subtotais do pivot + Total Geral); Vendas **4 por arquivo** (contagem + somas — o servidor
   confere 4 grandezas por arquivo, e o banco reconfere 2 das 4, porque as outras duas não têm
   coluna de destino em `raw.vendas_excel`); Movimentação **149** (148 grupos/categorias + total);
   Lançamentos em Aberto **96** (95 + total); Lançamentos por Operação **não tem checksum
   monetário** — o arquivo não declara total, e a gate é um **cruzamento**: todo `Número` sem
   `Liquidação` tem de existir em Aberto ∪ Movimentação, com `Vencimento` coincidente (baseline: 1
   ausente, hoje o literal `"NA"`, resíduo do R virando texto no scrape).
2. **Conferido duas vezes, em duas camadas diferentes.** O servidor confere o que **leu** contra o
   que o arquivo **declara** (parser); a RPC de promoção confere de novo, **contra o que ficou
   gravado** na tabela, depois do `INSERT` — o que cobre o trecho que a conferência do servidor não
   alcança: serialização, cast, arredondamento de `NUMERIC(18,2)`, lote perdido. É contra o valor
   já arredondado (`Checksum.centavosArredondados`) que o banco confere, nunca contra a soma bruta
   com mais de duas casas — o próprio export declara o total como o arredondamento da soma dos
   valores exatos (medido em Movimentação: 717.710,7392 no cru vira 717.710,74 declarado), e somar
   linha a linha já arredondado erraria de 1 a 6 centavos por grupo.
3. **Carga atômica: staging → validar → promover em uma transação, advisory lock por base.** Molde
   de `promover_carga_vendas`, estendido às quatro bases: `TRUNCATE` + `INSERT … SELECT` da
   staging para a raw e a regeneração (`regenerar_*`/`provisionar_*`/`transform_*`) rodam **dentro**
   da mesma função, sob `pg_advisory_xact_lock` por base (cada base ganhou a própria chave numérica)
   e `SET LOCAL lock_timeout`. Qualquer divergência de checksum levanta `RAISE` e a transação
   inteira volta — a base anterior **fica**, nunca meio-aplicada. Staging é `UNLOGGED` (não
   sobrevive a crash no meio de uma carga multi-lote; o sintoma é staging vazia na validação, e a
   base viva permanece intacta).
4. **"Conferido" ≠ "não conferível".** A resposta da RPC distingue explicitamente quantos checksums
   ela conseguiu reagrupar e comparar contra quantos existiam — "conferi 0 de 557" não pode ter a
   mesma aparência que "conferi 557 de 557". Essa distinção nasceu de um defeito real: a primeira
   versão da rota (M4) fazia a cobertura do cruzamento de Operação sumir em silêncio quando ele não
   se aplicava.
5. **`p_checksums = []` não passa.** Um lote de checksums vazio promovia a base inteira devolvendo
   sucesso — um checksum **ausente** não é "falho", mas o efeito prático era idêntico: a base
   inteira era substituída sem nenhuma verificação, uma porta dos fundos direta no invariante 5.
   Corrigido antes da aplicação da M5: lote vazio é rejeitado.
6. **Checksum falho nunca aplica — sem flag, nem manual.** A única via de exceção é corrigir o
   arquivo na origem e reprocessar o cru (contrato §4). Não existe bypass de operador, nem em
   emergência.
7. **Ensaio em transação revertida contra produção (M5, 22/09).** Chamando `promover_carga_demonstrativo`
   dentro de `BEGIN … ROLLBACK`: um checksum errado (−3.234,00 no lugar de −3.234,56 declarado pelo
   arquivo) levantou `CHECKSUM_FALHOU`, nomeando o que não fechou e por quanto; o checksum certo
   aplicou; a base ficou com **3.334 linhas antes e depois** do ensaio — nada persistiu além da
   prova. Um ensaio irmão, por conexão direta sem claim JWT (a mesma condição que produz `42501` do
   Postgres), provou o `EXCEPTION WHEN insufficient_privilege` (nunca `WHEN OTHERS`, que engoliria
   um bug real como se fosse aviso intermitente) capturando exatamente esse erro — e nada mais. A
   migration `0279` deu à credencial `ingestor` o `EXECUTE` na função interna que faltava; com o
   privilégio concedido, esse erro deixou de poder acontecer no caminho real, e o `EXCEPTION` foi
   **removido** do corpo (catch para um erro que não pode mais acontecer é ruído que engana quem lê
   depois). O ensaio assumindo a identidade real (`SET LOCAL ROLE ingestor` + claims do JWT) provou
   o resultado seguinte: a credencial aplica o checksum certo, recusa o errado **pelo motivo do
   checksum, não por permissão** (`avisos: []`), e não alcança `raw.*` por `SELECT` direto.

## As três correções que as cargas reais da M9 exigiram

A prova em ensaio não substitui a carga real; as cinco cargas reais de 25/09 acharam três
defeitos que nenhum ensaio havia coberto, **todos com a base anterior intacta** — nenhum deles
chegou a aplicar dado errado:

1. **Vendas recusada por uma guarda que a M5 e a 0283 (filtro Welcome) não tinham enumerado.** A
   guarda de setor de `validar_carga_staging` (originada na 0132) cobrava as 210 linhas Welcome
   contra `dim_setor` — mas o filtro Welcome, movido para o `transform` na M5/M7, nunca chegou a
   essa guarda, que lê a **staging**, não o que o transform de fato promove. **Migration 0284**:
   a guarda passou a olhar só o que o transform lê. Provado sobre a staging real (48.862 linhas):
   antes `setor_fora: 210` (todas Welcome); depois `setor_fora: 0`.
2. **O rótulo do modal de Vendas dizia "29.458 → 29.599"** — contava as vendas Welcome no "depois",
   quando o que interessa ao operador é o que vai virar `fato_venda`. Corrigido para contar o que
   de fato entra no fato (`vendasDistintasQueEntramNoFato()`); o oráculo prova 29.458.
3. **Operação recusada com `invalid input syntax for type bigint: "NA"`.** O CSV é saída do
   script R: 5.185 ocorrências de `"NA"` em `Lançamento N°`, 124 em `Venda`, 41 em `Liquidação`, e
   ainda traz números de parcela com sufixo (`"197848-2"`) que quebrariam o mesmo cast em seguida.
   **Migration 0285**: o fato só converte o que é inteiro puro — a mesma regra que o `toNum` do
   caminho antigo aplicava — via um `semNaDoR` nas três colunas do parser. Ensaiado em transação
   revertida antes de o Yan tentar de novo: a promoção inteira roda sem erro, o fato nasce com
   41.745 linhas, 5.371 `lancamento_n` nulos e a **mesma** soma da produção.

O padrão comum às três: uma decisão tomada numa missão (M5/M7 movendo o filtro Welcome; o parser
tratando "NA" como o R o produz) tem consumidores em mais de um lugar, e só a carga real — com o
arquivo de verdade, na credencial de verdade — força todos eles à luz ao mesmo tempo. O ensaio em
transação revertida prova o **mecanismo** do checksum; não prova que **toda guarda a montante**
já foi atualizada para o novo desenho.

## Consequências

- **Positivas.** Os invariantes 1, 4 e 5 do briefing (zero mudança de número; base nunca vazia ou
  parcial; checksum falho nunca aplica) têm hoje prova em produção, não só em teste: cinco cargas
  reais de dados de verdade, com diff quase zero contra o estado anterior, e as três divergências
  que apareceram foram capturadas — nunca aplicadas com o dado errado.
- **Negativas / dívida registrada.** A guarda de data de `validar_carga_staging` e de
  `promover_carga_vendas` ainda olha a staging inteira (não escopada ao que o transform de fato lê)
  — uma linha Welcome com data fora de `dim_data` reprovaria a carga toda hoje. Não dispara agora
  (`fora_do_range: 0`), mas é a mesma classe do defeito corrigido pela 0284, endereçado só
  parcialmente. Fica para migration futura (registrado no out-briefing pelo `revisor-db`, achado
  MÉDIO). O aviso de `operacao_propria` tem o mesmo denominador não-escopado.
- **Limite conhecido.** Lançamentos por Operação não tem checksum monetário — a natureza do arquivo
  (scrape web, sem linha de totais) não permite. O cruzamento com Aberto/Movimentação é a única
  gate possível, e uma ausência acima do baseline é **alarme**, não bloqueio, por decisão
  explícita do contrato §4.
