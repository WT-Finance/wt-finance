# ADR-0173 — Critérios de limpeza e fechamento da v5

**Status:** RASCUNHO (fecha ao final da Fase 2 da v5.10.0) · **Data:** 2026-09-10 ·
**Contexto:** versão v5.10.0, "Limpeza de fechamento da v5" · **Briefing:**
`docs/briefings/briefing-v5-10-0-limpeza-fechamento-v5.md` · **Spec:**
`docs/auditoria-v5/relatorio-triado.md`

> ⚠️ Rascunho vivo. As seções ganham conteúdo à medida que os blocos da Fase 2 fecham; a
> numeração já foi conferida contra `docs/adr/` (último real: 0172).

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

*(contagens de antes/depois entram no fechamento; o que já está decidido:)*

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
