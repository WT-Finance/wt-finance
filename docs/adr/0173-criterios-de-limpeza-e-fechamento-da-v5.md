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

**Evidência do próprio Bloco 1: em 4 itens o grep no ato salvou código vivo — e em 2 deles o
relatório triado mandava apagar.**

| item | o relatório dizia | o grep no ato provou |
|---|---|---|
| **D1-016** | apagar `listMonths` | é o **motor** do `fillMonths` (`fill-months.ts:56`) — só perdeu o `export` |
| **D1-020** | apagar as 4 funções | só 2 eram mortas; `calcularPeriodoAnteriorInteligente` e `calcularYoYInteligente` são usadas por `resolverPeriodoCompleto` (linhas 235-236) |
| **D1-015** | 6 exports supérfluos | 4 são importados por `scripts/db-gate/exportar.mjs:19` (o knip os deu como mortos porque marcou o próprio `exportar.mjs` como arquivo não usado — falso positivo **em cascata**); e `getPool` tem consumidor no **runbook de restore**, achado ALTO do `revisor` |
| **D1-025** | consolidar export duplicado | achado **INVÁLIDO**: `LIMITE_MESES` e `JANELA_LARGA_FRENTE` são constantes semanticamente distintas com o mesmo valor (36), **ambas vivas** |

Corolário para a próxima auditoria: um achado de ferramenta estática é **classe de suspeita**,
não sentença. Três padrões de falso positivo já têm nome — chamada por processo
(`execFileSync`), chamada por config (hooks no `settings.json`) e citação em Markdown
executável (runbook/ADR) — e estão registrados em `knip.json` para não serem redescobertos.

## Decisão 3 — o que saiu, o que ficou de propósito

*(a preencher ao final da Fase 2, com as contagens de antes/depois)*
