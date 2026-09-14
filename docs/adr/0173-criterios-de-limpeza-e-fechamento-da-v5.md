# ADR-0173 — Critérios de limpeza e fechamento da v5

**Status:** aceito (v5.10.0) · **Data:** 2026-09-10 ·
**Contexto:** versão v5.10.0, "Limpeza de fechamento da v5" · **Briefing:**
`docs/briefings/briefing-v5-10-0-limpeza-fechamento-v5.md` · **Spec:**
`docs/auditoria-v5/relatorio-triado.md`

> Numeração conferida contra `docs/adr/` no remoto (último real: 0172).

## Decisão 1 — `src/types/database.ts` é GERADO, não manuscrito

A convenção anterior ("arquivo congelado + helper de tipagem frouxa para RPC nova") **morre**.

**Por quê.** O arquivo não era um `gen types` congelado: era **manuscrito na era M1** (o próprio
cabeçalho dizia "Tipos gerados manualmente com base nas migrations da M1") e cobria **~55 de
~215 RPCs** do banco real. O efeito não foi conter a tipagem frouxa — foi torná-la o caminho
**majoritário**: 3 em cada 4 chamadas de RPC passavam por `RpcFrouxa`/`BoundRpc`/`as unknown as`,
e 34 call-sites chegaram a usar `(x.rpc as any)`, um segundo padrão não documentado e ainda mais
frouxo. Um arquivo que envelhece por desenho empurra todo código novo para fora do tipo.

**O que passa a valer.**
1. O arquivo é regenerado com `npx supabase gen types typescript --linked` e **commitado junto do
   version bump** sempre que a versão criar ou alterar RPC. Passo 5 da seção 5 do ritual
   `/fechamento-versao`.
2. A adoção na v5.10.0 foi feita com `tsc --noEmit` **limpo** (0 erros) e suíte **1217/1217**.
3. O helper de tipagem frouxa **continua existindo** para o intervalo entre criar uma RPC e
   regenerar o arquivo, e para retorno `jsonb` que o gerador tipa como `Json`. Deixa de ser
   convenção e volta a ser exceção com prazo.

**Limitação conhecida do gerador, documentada de propósito.** O `gen types` **não modela
nulidade de PARÂMETRO**: todo parâmetro de função Postgres aceita `NULL`, mas o gerador emite o
tipo base (com `?` quando há `DEFAULT`). Nos 4 pontos que o spike apontou, o arquivo manuscrito
era **mais preciso** que o gerado:

| ponto | manuscrito | gerado |
|---|---|---|
| `admin_registrar_usuario.p_nome` | `string \| null` | `string` |
| `get_operacoes_weddings.p_periodo_inicio` | `string \| null` (opcional) | `string` (opcional) |
| `get_operacoes_weddings.p_periodo_fim` | `string \| null` (opcional) | `string` (opcional) |
| `get_operacoes_weddings.p_busca` | `string \| null` (opcional) | `string` (opcional) |

Ou seja: os 4 `TS2322` do spike **não eram** código assumindo não-nulo onde o banco permite nulo
— eram o inverso, código passando `NULL` corretamente contra um tipo que perdeu essa informação.
A troca é deliberada: perde-se precisão em 4 parâmetros e ganha-se cobertura de ~160 RPCs que
antes não tinham tipo nenhum. Regra para quando o `tsc` acusar isso de novo: tratar o nulo **na
fronteira** — omitir a chave quando o parâmetro tem `DEFAULT NULL`, ou usar sentinela **só com
equivalência provada no corpo da função** —, **nunca** com cast. Registrado no ritual.

## Decisão 2 — o relatório de auditoria APONTA; o commit PROVA

Um relatório de auditoria é uma **hipótese verificável**, não um inventário de verdades. A
exclusão só se justifica pelo grep feito **no ato do commit**, transcrito na mensagem — e a
varredura inclui `docs/runbooks/` e `docs/adr/` (ver skill `banco-e-rpc`, §5).

**Evidência: em 7 itens a verificação no ato salvou a versão de um erro — e em 2 deles o
relatório triado mandava apagar código vivo.** Quatro vieram do Bloco 1 (grep) e três do
Bloco 3 (catálogo vivo). O caso mais instrutivo é o último: um achado errado do relatório
foi por mim copiado para dentro de um `COMMENT ON FUNCTION`, e só o `revisor-db` impediu
que o engano virasse documentação permanente no catálogo do banco.

| item | o relatório dizia | o grep no ato provou |
|---|---|---|
| **D1-016** | apagar `listMonths` | é o **motor** do `fillMonths` (`fill-months.ts:56`) — só perdeu o `export` |
| **D1-020** | apagar as 4 funções | só 2 eram mortas; `calcularPeriodoAnteriorInteligente` e `calcularYoYInteligente` são usadas por `resolverPeriodoCompleto` (linhas 235-236) |
| **D1-015** | 6 exports supérfluos | 4 são importados por `scripts/db-gate/exportar.mjs:19` (o knip os deu como mortos porque marcou o próprio `exportar.mjs` como arquivo não usado — falso positivo **em cascata**); e `getPool` tem consumidor no **runbook de restore**, achado ALTO do `revisor` |
| **D1-025** | consolidar export duplicado | achado **INVÁLIDO**: `LIMITE_MESES` e `JANELA_LARGA_FRENTE` são constantes semanticamente distintas com o mesmo valor (36), **ambas vivas** |
| **D2-010** (Bloco 3) | "21 funções sem grant" | são **8**: a consulta da Fase 1 não olhava o grant DEFAULT para PUBLIC, então reportava "sem grant" justamente onde o grant era o **pior** (PUBLIC inclui `anon`). Das 21, 12 já estavam corretas e dar-lhes o `GRANT` que o item pedia teria **alargado** acesso; e `app.norm_nome`, a mais chamada das 8 (13 funções), não estava na lista |
| **D9-015** (Bloco 3) | "as duas funções" com o texto pré-rebranding | é **uma** (`app.exigir_acesso`). As migrations 0119 e 0133 contêm o texto, mas a 0133 é reaplicação — ler a migration em vez do catálogo conta duas vezes o mesmo objeto |
| **D3-006 / B-12** (Bloco 3) | `v_estado_atual` "sem índice de suporte" | o índice **existe e é usado**: `mov_ativo_ordem_idx`, 102 scans. Pego pelo `revisor-db` num `COMMENT` que eu havia escrito **repetindo o achado** — o erro do relatório quase virou documentação permanente no catálogo do banco |

Corolário para a próxima auditoria: um achado de ferramenta estática é **classe de suspeita**,
não sentença. Três padrões de falso positivo já têm nome — chamada por processo
(`execFileSync`), chamada por config (hooks no `settings.json`) e citação em Markdown
executável (runbook/ADR) — e estão registrados em `knip.json` para não serem redescobertos.

## Decisão 3 — o que saiu, o que ficou de propósito

**Contagens de antes/depois** (43 commits, `e6f3c9e..HEAD`; 121 arquivos removidos ao todo):

| frente | antes | depois |
|---|---|---|
| `docs/briefings/` | 164 | **72** (só v5; os 92 pré-v5 saíram) |
| `docs/audits/` | 9 | **0** (a pasta saiu inteira) |
| `docs/superpowers/` | 3 | **0** |
| `docs/runbooks/` | 5 | **3** (v4-15 e v4-16 migrados para skill e `estado-do-projeto`) |
| `docs/design-system.md` | 496 linhas | **0** (a página viva é a referência única) |
| `docs/WORKING-CONTEXT.md` | 1.252 linhas | **~190** (só estado; o histórico é git) |
| componentes órfãos em `src/` | — | **7 apagados** |
| scripts de seed de diagnóstico | — | **6 apagados** (+ `limpeza-anexos-solicitacoes.mjs`) |
| funções no banco | — | **13 dropadas** + 2 tabelas + 1 constraint (0270) |
| grants default-PUBLIC | 8 | **0** (REVOKE explícito na 0269) |
| `COMMENT ON FUNCTION` | poucos | **+31** nas RPCs centrais (0269) |
| branches remotas | 137 | **17** · locais: 41 → **8** |

Saldo em código: `src/` **−567 linhas** líquidas (1.541 entradas, 2.108 saídas — as entradas são
sobretudo teste novo e schemas Zod), `scripts/` −228, e `docs/` reorganizado.

*O que já estava decidido antes do fechamento:*

### Sobreposição deliberada de uma reserva de ADR

O **ADR-0107** guardou a remoção de `get_my_profile()` para uma decisão futura do usuário:
*"preservar em vez de remover, por política do projeto. Documentados como legado; remoção
pode ser decidida pelo usuário em versão futura."* A migration destrutiva desta versão
(0270) a remove. **Isso não é descuido: é o exercício da reserva.** O Yan listou
`public.get_my_profile` nominalmente no escopo do Bloco 5, e a "versão futura" que o
ADR-0107 previa é esta.

O registro existe porque a primeira redação da migration quase o perdeu: ela tratou os
ADRs só pela pergunta "isto é procedimento executável?" — a lição do `getPool`, do Bloco 1
— e com isso passou por cima do **conteúdo** da decisão. O `revisor-db` levantou como
achado ALTO, e com razão: a régua do core é "decisão de produto é do usuário; na dúvida,
é produto", e um ADR que reserva algo *para o usuário* é produto por definição. A lição
mais geral que o caso: **ao encontrar um ADR citando o objeto que se vai remover, a
pergunta não é só se ele é executável — é se ele contém uma decisão sobre aquele objeto.**

`app.usuarios` e `app.convites`, citadas no mesmo parágrafo do ADR-0107, **continuam
intocadas**: nenhuma entrou no escopo da triagem.

### O que ficou de propósito, e por quê

| objeto | por que fica |
|---|---|
| `public.admin_set_enforcement` | kill switch de emergência, sem chamador **por desenho** (runbook v4-13). Ganhou `COMMENT` na 0269 justamente para a próxima varredura de código morto não propor o DROP |
| `public.get_decomposicao_bloco` | tem consumidor vivo: 3 casos de contrato em `rpc-contrato.test.ts` e o `decomposicaoBlocoSchema`. Sai só depois do ciclo remover-código → deployar → dropar |
| `public.get_sumario_subsetor` | viva na Performance de Weddings. Compartilha o núcleo com a `metas_sumario_subsetor` que saiu — nome parecido, função diferente |
| as 12 funções com `postgres=X/postgres` | já tinham `PUBLIC` revogado pela 0122; conceder-lhes `service_role`, como a leitura literal do D2-010 pedia, teria **alargado** acesso |
| ADRs supersedidos | regra 4 do briefing: ADR é histórico, não sai — ganha marcador |

## Decisão 4 — critério de documentação: "medição fica, opinião sai"

Vinte documentos de auditoria e planejamento estavam parados em `docs/audits/`,
`docs/superpowers/` e `docs/harness/`. O critério que separou o que fica do que sai não foi idade
nem tamanho:

- **Fica** o documento que é a **única fonte de um número que ninguém vai refazer** — as cinco
  medições de `docs/investigacoes/` (baseline de vendas retidas, de-para de produto do Monde,
  paridade item-level do Scope B, delta DRE×competência, coerção de milhar).
- **Sai** o documento cujo valor era a **lista de prioridades de um momento**, hoje vencida. Um
  item dessa lista não pode ser confiado sem reverificação contra o código atual — e a prova disso
  é o próprio E1: o achado "A1" da auditoria de 13/06 já estava fechado pela migration `0132` havia
  meses, e só se descobriu isso relendo o catálogo vivo.

**Pré-condição da exclusão:** os achados que a leitura daqueles 20 documentos rendeu (E1–E8)
foram registrados em `docs/backlog-v6.md` **antes** de qualquer `rm`. Apagar a fonte sem preservar
o que ela rendeu seria perder o trabalho, não limpá-lo.

A mesma lógica vale para a nova divisão de documentos: **`estado-do-projeto.md`** responde "como o
sistema funciona" (permanente), **`WORKING-CONTEXT.md`** responde "o que está acontecendo"
(perecível, e item resolvido sai), **`README.md`** responde "o que é e como rodo", e o histórico
mora no git e nos out-briefings. Um fato só pode ter um dono.

## Decisão 5 — marcação de supersessão, e a exceção de nomenclatura do apêndice

**Supersessão.** O **ADR-0055** instituiu que a marcação vai no cabeçalho do ADR **superado** —
é ali que o leitor desavisado cai. A v5.10.0 varreu os 108 hits de `supersed|substitui|revoga|
emenda` em `docs/adr/` (o achado D8-018 contava 42; eram 108, em 55 arquivos), separou as **10
relações reais** dos **93 de prosa** e corrigiu **7 cabeçalhos**: 0109, 0137, 0142, 0148, 0149,
0151 e 0164.

O marcador usado nesses sete é **`Emendado por:`, não `Supersedido por:`** — eles continuam
vigentes e tiveram só uma parte revista. Escrever "supersedido" mandaria o leitor descartar
decisão viva, que é exatamente o defeito que a marcação existe para evitar. **A distinção passa a
ser convenção:** *supersedido* = a decisão inteira foi substituída; *emendado* = uma parte foi
revista e o resto vale.

Observação registrada de propósito: o lado que **supersede** não se autodeclara (0051, 0042 e 0048
não dizem "eu supersedo X"). Isso é o ADR-0055 funcionando como escrito, não uma falha — mas o
ADR-0172 faz os **dois** lados, e é o formato mais útil. Recomendação para ADR novo: declarar nos
dois.

**Exceção de nomenclatura (D8-016).** `docs/adr/v3-6-apendice.md` é o único arquivo de
`docs/adr/` sem prefixo numérico, e **fica assim**. Ele não é um ADR: é o apêndice de um conjunto
de decisões da v3.6, e numerá-lo o faria aparecer na sequência como se fosse uma decisão própria —
inventando um ADR que nunca existiu e deslocando a leitura de quem procura pela numeração. A
regra geral ("todo arquivo de `docs/adr/` é `NNNN-slug.md`") vale; esta é a exceção, e está
nomeada aqui para não ser "corrigida" por uma varredura futura.

## Consequências

- **Positivas.** O repositório passa a se explicar sozinho (`estado-do-projeto.md` + README
  reescrito). O espelho de tipos deixa de envelhecer por desenho. Oito funções deixam de ser
  executáveis por `PUBLIC`. Três classes de falso positivo de análise estática têm nome e estão em
  `knip.json`, então não serão redescobertas. A próxima auditoria começa de um relatório triado com
  a coluna `nota` preenchida — cada item diz o que foi provado, não só o que foi proposto.
- **Negativas.** Perde-se precisão de nulidade em 4 parâmetros (tabela da Decisão 1). O histórico
  de prioridades pré-v5 sai do repositório e passa a existir só no git. E o `database.ts` regenerado
  cria uma obrigação nova no fechamento de toda versão que toca RPC — se for esquecida, o espelho
  volta a mentir, agora sem a desculpa de estar declarado congelado.
- **Risco residual conhecido.** A varredura que originou o incidente de 306.261 linhas apagadas em
  produção mostrou que "ler o catálogo" e "chamar a função" são atos de natureza diferente num banco
  onde a RPC é a superfície de escrita. A lição está na skill `banco-e-rpc`; o que **não** existe
  ainda é enforcement mecânico para ela.
