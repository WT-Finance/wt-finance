# Out-Briefing v5.5.0 — Weddings: Rendimento potencial do float

**Data:** 2026-08-07 · **Tipo:** MINOR · **Branch:** `feat/v5-5-0-rendimento-float`
**Migrations:** `0238`–`0243` (todas aditivas, **aplicadas e verificadas**) · **ADR:** `0166`
**Briefing de entrada:** `docs/briefings/briefing-v5-5-0-rendimento-float.md`
**Rota:** A (produto, com briefing e plan mode)

---

## 1. O que a versão entrega

Weddings recebe antes de pagar. Esse float é valor financeiro real do modelo de negócio e não
aparecia em lugar nenhum da plataforma. A v5.5.0 mede **quanto o caixa antecipado de cada
operação renderia a 100% do CDI**, em regime composto, com a taxa alimentada automaticamente da
API SGS do BACEN — a feature nasce completa, sem rotina manual residual.

Três pontos de UI, nenhum KPI agregado (decisão do briefing; a visão de portfólio emerge do
gráfico com o filtro "Todas").

A definição da métrica está registrada por extenso no **ADR-0166**.

---

## 2. Missões

| # | Entrega | Estado |
|---|---|---|
| **M1** | `analytics.dim_taxa_cdi`, a view da conta virtual, `get_rendimento_float`, `get_taxas_cdi` e a chave de ordenação na RPC da Lista | ✅ |
| **M2** | Ingestão do CDI (SGS/BACEN), upsert idempotente, backfill pela própria rota, agendamento mensal | ✅ (agendamento em espera — ver §7) |
| **M3** | Coluna **"Rend. Float"** na Lista de Operações, ordenável e no Exportar | ✅ |
| **M4** | Bloco do float no drawer da operação | ✅ |
| **M5** | **GATE** — gráfico saldo real × conta virtual no card de Fluxo de Caixa | ✅ **aprovado pelo Yan** |
| **M6** | Fechamento | ✅ (este documento) |

---

## 3. Os três achados que mudaram o desenho (e que o briefing não previa)

### 3.1 A coluna ordenável obrigou o float a existir DENTRO da RPC da Lista

A whitelist de `ORDER BY` de `get_operacoes_weddings__nucleo` termina em `ELSE 'd_data_evento'`
— **fallback silencioso**. Pedir uma chave que a RPC não conhece não dá erro: ordena por data do
evento e ninguém percebe. Como a Lista pagina no **servidor**, ordenar no cliente também não
serve. Foi a mesma armadilha que a `0228` documentou na v5.4.2.

### 3.2 A curva virtual não pode ser fatiada — tem de ser RECOMPUTADA da borda

Juro composto depende do saldo inicial, e o card rebaseia todo acumulado na borda esquerda a
cada movimento do slider (v5.4.2). Uma curva pronta recortada nessa janela carregaria juros de
meses fora da vista e ficaria **errada em toda posição do slider menos a default** — de um jeito
que parece certo, porque a curva continua subindo.

A saída: o banco devolve a **série de taxas** (igual para toda operação e todo filtro) e as duas
curvas nascem no cliente, a partir do fluxo mensal que `fatiarJanela` **já derivava**. Arrastar
segue sem refetch.

### 3.3 O total da coluna e o gap do gráfico são números diferentes, de propósito

Coluna e drawer medem a **vida inteira** da operação; o gráfico mede o rendimento gerado **dentro
da janela** (as curvas seedam na borda). Os dois aparecem na mesma tela e vão discordar — e "dois
números vizinhos que discordam sem explicação" é a classe de erro que este projeto já pagou caro.
O subtítulo do gráfico diz isso com todas as letras.

---

## 4. Os dois defeitos que a própria versão encontrou

### 4.1 O SGS publica o mês CORRENTE parcial, e isso contaminava TODO o futuro

**Medido em 07/08/2026:** a série devolveu ago/2026 = **0,21%** — o acumulado de sete dias
corridos, não do mês. O estrago não ficava no mês corrente: como a regra de projeção repete a
**última taxa conhecida** sobre todos os meses à frente, o rendimento projetado inteiro passou a
ser calculado a 0,21% a.m. em vez de ~1,15% — **cinco vezes menor**, e plausível o bastante para
não levantar suspeita olhando a tela.

Corrigido nas **duas pontas**: a rota deixou de gravar mês aberto (`apenasMesesFechados`, que lê
o mês pelo fuso de **São Paulo** — em UTC, na última noite do mês, um mês ainda aberto seria
tratado como fechado), e a `0240` fez a **leitura** nunca aceitar mês aberto. Só a escrita não
bastaria: a linha parcial já estava gravada e removê-la seria `DELETE`. Com o filtro na leitura
ela fica inerte e **se autocorrige** quando setembro fechar. Mesma lição da v5.4.5: filtro de
negócio mora na leitura.

### 4.2 O total do float não fechava com a soma das partes

As três colunas (`rendimento`, `rendimento_positivo`, `custo_negativo`) eram arredondadas
**independentemente**, então `(+48.767,94) + (−73,10) = 48.694,84` enquanto o total exibia
`48.694,83`. O bloco do drawer mostra as três lado a lado e o usuário soma com os olhos. A `0242`
define o total **como** a soma das parcelas já arredondadas.

---

## 5. Verificação — o que foi provado contra produção, não só contra teste

| Prova | Resultado |
|---|---|
| **Conta virtual recomputada por fora** (7 operações, a partir das séries cruas) | bate com a view; pior Δ **R$ 0,0046** (arredondamento). Inclui rendimento **negativo** ⇒ simetria provada |
| **Idempotência da ingestão** (2 passadas seguidas) | 25 linhas / 25 novas → **0 novas, 0 alteradas**, total intacto |
| **Série 4391 conferida contra a API pública** | `01/07/2026 → 1.22` — dia 1º do mês e percentual mensal, coerente com CDI anual de ~14% |
| **Coluna × drawer** (6 operações) | idênticos; abertura `(+) + (−)` fecha o total; `meses_positivos ≤ meses_total` |
| **Ordenação por `rend_float`** | monotônica asc **e** desc; `margem_aa` sem regressão; chave inexistente cai no fallback silencioso (esperado — é o que prova que o teste vale algo) |
| **Latência da Lista** (239 operações) | **2304 → 2660 ms frio**, 293 → 325 ms quente. Teto do role `authenticated` = **8000 ms** |
| **Latência da view sozinha** | 1836 ms frio / 418 ms quente |
| **Falha explícita com tabela vazia** | `get_rendimento_float` devolveu `no_data_found` com a mensagem correta, e `get_taxas_cdi` devolveu `taxa: null` (sem curva plana falsa) |

**Gates finais:** `npm run build` ✅ · `npx tsc --noEmit` ✅ · `npm run lint` ✅ · **753 testes** ✅
(711 antes da versão; +42). `.next` limpo antes da sequência (o `next dev` da conferência visual
deixa `dev/types` que quebram o `tsc`).

---

## 6. Conferência visual — feita, e pagou

⚠️ **O `verificador-visual` NÃO foi despachado**, e a razão é concreta: o MCP Playwright não sobe
em sessão de background (registrado na v5.3.3 e no WORKING-CONTEXT), então ele voltaria com
**NÃO VERIFICADO**. Em vez disso a conferência foi feita **por mim, no Chrome real do usuário**
(MCP `claude-in-chrome`), com dados reais de produção — a primeira vez que a verificação visual
autônoma funcionou neste projeto.

Ela encontrou **dois defeitos que `tsc`, `lint`, `build` e 744 testes deixaram passar**:

- **Tooltip do gráfico imprimindo `R$ NaN`.** A `Area` que pinta a faixa entre as curvas tem
  `dataKey` devolvendo um **par** `[saldo_real, saldo_virtual]`, e o formatador tentava formatar
  o array. `tooltipType="none"` **não basta** nesta versão do Recharts (testado na tela): a faixa
  é filtrada do payload explicitamente, e o gap honesto vem de uma `Line` invisível. Conferido
  depois: `3.425.670 − 2.874.072 = 551.598`, os três números do tooltip fecham entre si.
- **"Custo teórico R$ 0,00" em vermelho** no drawer — a leitura mais errada possível para uma
  operação que nunca ficou devedora. Cor agora só quando o valor existe.

**O que foi conferido e está certo:** as duas curvas saem **juntas** da borda esquerda (gap
começa em zero); estreitar a janela de 24 para 12 meses de passado levou o rendimento de
**R$ 2.664.077 para R$ 1.080.226**, com as curvas re-semeadas na borda nova (é a prova visual da
§3.2); a coluna aparece em dourado na Lista; o bloco do drawer bate com a coluna (R$ 580,64 nos
dois, "Maria Cecília e Andrison").

**Caso exemplar visto na tela:** "Gabriela e Bernard" tem Resultado Prev. **−R$ 2.252,51** (vermelho)
e Rend. Float **+R$ 438,48** (dourado) na mesma linha. Está certo, e é exatamente o que a métrica
existe para mostrar — a operação deu prejuízo, mas segurou caixa positivo no caminho.

**Ponto deixado ao Yan (estética, não defeito):** o fundo dourado do bloco no drawer ficou muito
sutil e lê quase como caixa branca. A cor do texto foi escurecida para passar em AA; o fundo ficou
discreto de propósito. Ajuste de uma linha se ele quiser mais destaque.

---

## 7. Parecer da revisão

Os dois revisores foram despachados em contexto separado, com a lista exata de arquivos. **Os
dois bloquearam o fechamento**, e os dois tinham razão.

### 7.1 `revisor` — CORREÇÕES NECESSÁRIAS → **corrigidas**

**CRÍTICO — `'rend_float'` faltava no enum Zod da API Route.** ✅ **CORRIGIDO.**
`src/app/api/dashboard/weddings/operacoes/route.ts` valida `?ordenar_por=` com um `z.enum`, e a
chave nova entrou no `CASE` do SQL e no cabeçalho clicável, mas **não ali**. Clicar no cabeçalho
da própria coluna entregue nesta versão fazia a rota devolver **400** e a Lista inteira virar uma
linha de erro. E de carona, com `ordem` já em `'rend_float:…'`, o botão Exportar também falhava —
engolido por um `catch {}` mudo pré-existente.

Por que escapou: **a verificação da ordenação foi feita via REST/service_role direto contra a
RPC**, que pula exatamente essa camada. O comentário imediatamente acima do enum — escrito na
v5.4.2 — já avisava que "as duas pontas precisam andar juntas". O aviso estava lá em prosa, e
prosa não segura.

**Correção estrutural, não pontual (régua D1 — enforcement mecânico):** a lista saiu para
`src/lib/weddings/ordenacao-operacoes.ts` e ganhou **guard mecânico**
(`ordenacao-operacoes.test.ts`, 5 casos) que lê o `CASE` da migration vigente e compara com o
enum **nas duas direções** — porque os dois lados falham de formas opostas e igualmente
invisíveis: faltar no SQL ordena por outra coisa em **silêncio**; faltar no enum derruba a tela.
O guard foi **visto reprovando** o defeito original, com a mensagem
`chaves no 0241 que a rota rejeitaria: rend_float`.

**ALTO — sem nenhuma taxa, a view devolvia `0.00` em vez de `NULL`.** ✅ **CORRIGIDO
(migration `0243`).** Dois mecanismos do Postgres conspiravam: o ramo `n = 1` da recursão gravava
`0::numeric` incondicionalmente, e **`GREATEST`/`LEAST` IGNORAM NULL** (`GREATEST(NULL,0)` = `0`),
assim como `SUM`. Com `dim_taxa_cdi` vazia, o indicador colapsava para `0.00` — a coluna exibiria
**"R$ 0,00" para o portfólio inteiro**, que é a afirmação "não rendeu nada": exatamente a mentira
que a versão foi desenhada para nunca contar, e que a Decisão 5 do ADR-0166 promete não contar.
Alcançável só pela Lista (o drawer tem guard explícito antes de tocar a view), e não ativo hoje
(a série tem 25 meses) — mas real em qualquer ambiente que aplique as migrations antes da 1ª
ingestão. A `0243` **não confia em propagação de NULL** (foi ela que falhou): usa `CASE` explícito
sobre a contagem de meses com taxa conhecida. Verificado depois: os valores das 6 operações da
amostra ficaram **idênticos**.

**MÉDIO — comentário do `AjudaHeader` desatualizado.** ✅ Corrigido: ele dizia "esta é a ÚLTIMA
coluna" para justificar a âncora à direita, e agora há um 2º call-site no meio da tabela.

**MÉDIO — sem schema Zod/`parseRpc` para `get_rendimento_float` e `get_taxas_cdi`.**
📋 **REGISTRADO, não corrigido.** As duas são lidas por cast bruto, seguindo o padrão dominante do
arquivo (não é regressão isolada). O risco que o schema cobriria — divergência de shape — passou a
ser coberto pelos **3 casos de contrato novos** contra as RPCs vivas. Fica como dívida.

**BAIXO — as 3 notas teóricas são strings independentes.** 📋 Registrado. Cumprem a invariante em
substância; podem divergir com o tempo. Candidato a constante compartilhada.

**BAIXO — `Promise.all` misturando obrigatório e best-effort.** ✅ Corrigido para `allSettled`: com
`all`, uma rejeição de rede da chamada declaradamente degradável derrubaria o drawer inteiro,
contradizendo o próprio comentário ao lado.

### 7.2 `revisor-db` — APROVADA COM RESSALVAS → ressalvas endereçadas

**Nenhum CRÍTICO. Nenhuma migration corretiva exigida por ele** (a `0243` veio do achado ALTO do
outro revisor).

**ALTO — a regra existe em QUATRO implementações e nenhuma tinha caso de contrato.**
✅ **CORRIGIDO.** `taxa_por_mes` (view), `get_taxas_cdi`, `get_rendimento_float` e `curvasFloat`
(cliente). Ele conferiu byte a byte que estão idênticas **hoje** — e a skill `banco-e-rpc` §7 diz
que "idêntico hoje" sem rede é como a próxima otimização quebra a tela em silêncio. Foram
adicionados **3 casos em `rpc-contrato.test.ts`**: `taxa_vigente_mes` igual nas três RPCs **e**
provadamente um mês fechado; coluna da Lista == bloco do drawer com a abertura fechando o total;
ordenação por `rend_float` monotônica **mais** a prova de que chave inexistente cai no fallback
silencioso (é o que faz a 1ª asserção significar algo). A ponta do cliente segue fixada por
fixture numérica em `float-virtual.test.ts`.

**MÉDIO — `CHECK (taxa > -1 AND taxa < 1)` é frouxo para o caminho "ato humano via SQL".**
📋 **REGISTRADO com justificativa.** Ele propõe apertar para ±5%. Concordo com o raciocínio — um
`0.5` digitado no lugar de `0.05` passaria e contaminaria toda a projeção via carry-forward. **Não
apliquei** porque `ALTER TABLE ... DROP CONSTRAINT` é classificado como **destrutivo** pelo gate e
exige humano em TTY; e porque o ADR-0166 já registra que intervenção manual na tabela é ato
humano excepcional. Fica como sugestão de hardening para o Yan aplicar quando quiser
(`0244`, uma linha).

**BAIXO — cabeçalho do patch pendente citava só "0238 e 0239".** ✅ Corrigido para 0238–0243.
**BAIXO — `timeout_milliseconds` = 60000 igual ao `maxDuration` = 60, sem folga.** ✅ Corrigido
para 75000.
**BAIXO — comentário citava `route.test.ts`, arquivo que não existe.** ✅ Corrigido para
`serie-sgs.test.ts`.
**BAIXO — header da `0242` sem linha "REVERSIBILIDADE".** 📋 Registrado e **não corrigido de
propósito**: migration aplicada não se edita, nem em comentário (o banco guarda os `statements` em
`supabase_migrations.schema_migrations`). Nit de documentação, sem efeito funcional.
**Resíduo de ago/2026:** ele concordou com o diagnóstico — nenhuma ação de banco necessária.
Acrescentou um item operacional: **confirmar em setembro** que a substituição ocorreu (checar
`atualizado_em` da linha `2026-08-01`).

### 7.3 O que os dois confirmaram sem achado

RBAC/grants das funções novas (nenhum `GRANT` a `anon`), RLS de `dim_taxa_cdi`,
`SET search_path = ''` com tudo qualificado (inclusive dentro do SQL dinâmico), `CURRENT_DATE`
resolvendo em fuso de SP por não haver caminho de leitura fora das funções `SECURITY DEFINER`,
idempotência e reversibilidade das 5 migrations, a `0242` segura (nenhum consumidor soma
`rendimento` entre operações), `.bind()`/`.call()` corretos nos três call-sites novos de RPC
frouxa, `useMemo` com dependências certas, `colSpan={11}` e skeleton atualizados nos três ramos,
zero hex hardcoded, zero `console.log` residual, e os dois fixes visuais confirmados no código.

**Gates finais, depois de todas as correções:** `build` ✅ · `tsc` ✅ · `lint` ✅ ·
**753 testes** ✅ (744 antes das correções da revisão; +9).

---

## 8. Pendências e decisões que ficam com o Yan

1. **Mergear o PR.** Merge humano é a única fronteira de entrada em produção.
2. ⚠️ **Aplicar `supabase/patches/PENDENTE-agendamento-cdi.sql` DEPOIS do deploy.** Ele está fora
   de `supabase/migrations/` de propósito: agendar antes do deploy da rota responde 200 e o job
   fica **VERDE em `cron.job_run_details` sem ter feito nada** (lição da v5.4.4). A ordem completa
   de ativação está no cabeçalho do arquivo. Recebe o número livre na hora de aplicar.
   **Sem ele, a taxa não se atualiza sozinha** — o backfill até ago/2026 já está no banco, então
   nada quebra, mas o mês de setembro não entra até alguém rodar a rota.
3. **A premissa da taxa futura** (mês corrente e futuros = última taxa fechada constante) foi
   embutida conforme o briefing. Vale a validação formal.
4. **Conferir 3 taxas da `dim_taxa_cdi` contra o site do BACEN** — eu conferi jan/26 (1,16) e
   jul/26 (1,22) contra a API; a conferência contra o site é do checkpoint dele.
5. **Resíduo de dado declarado:** a linha de **ago/2026 com a taxa parcial (0,21%)** continua
   gravada em `dim_taxa_cdi`, **inerte** pelo filtro da `0240`. Ela é substituída pelo valor
   fechado na primeira ingestão de setembro. Removê-la agora seria `DELETE` (destrutivo) e
   desnecessário.
6. **O fundo do bloco do drawer** (§6), se quiser mais destaque.
7. **Hardening opcional do `CHECK` da taxa** (sugestão do `revisor-db`): apertar de ±100% para
   ±5% a.m. Não apliquei porque `ALTER TABLE ... DROP CONSTRAINT` é **destrutivo** pelo gate e
   exige você em TTY. Uma linha:
   `ALTER TABLE analytics.dim_taxa_cdi DROP CONSTRAINT dim_taxa_cdi_taxa_plausivel, ADD CONSTRAINT dim_taxa_cdi_taxa_plausivel CHECK (taxa > -0.05 AND taxa < 0.05);`
   Toda taxa gravada hoje (inclusive a parcial de ago/26) está bem dentro da faixa.
8. **Em setembro:** confirmar que a linha `2026-08-01` de `dim_taxa_cdi` foi substituída pelo
   valor FECHADO — `atualizado_em` deve ter avançado e a taxa sair de 0,21% para ~1,1%.

---

## 9. Aprendizado permanente — régua de 5 destinos

| Aprendizado | Destino |
|---|---|
| **Série de taxa pública publica o mês corrente PARCIAL, e carry-forward espalha isso pelo futuro** | Skill `banco-e-rpc` — é sobre fonte de dado externa, e a forma do erro (plausível, silencioso, multiplicado pela projeção) se repete em qualquer série assim |
| **`WITH RECURSIVE` não é inlineada pelo planner** ⇒ sem pushdown de filtro; injetar uma numa RPC viva é decisão de latência, não de estilo | Skill `banco-e-rpc` |
| **MATERIALIZED VIEW não aceita `CREATE OR REPLACE`** ⇒ materializar congela a métrica atrás de uma destrutiva | **Já no WORKING-CONTEXT** desde a v5.4.5 — reforçado aqui como critério de escolha |
| **Sequenciar a aplicação (superfície nova → medir → ligar no caminho vivo)** resolve "não dá para medir antes do push" sem staging | Ritual `/fechamento-versao` ou skill `banco-e-rpc` — é procedimento |
| **Arredondar partes e total independentemente** faz a soma não fechar onde eles aparecem juntos | Skill `ui-design-system` (formatação) |
| **`Area` de faixa no Recharts (`dataKey` devolvendo par) entra no tooltip como array e imprime NaN**; `tooltipType="none"` não basta | Skill `graficos` |
| **A conferência visual autônoma FUNCIONA pelo MCP do Chrome** quando o Playwright não sobe | Skill `orquestracao` / WORKING-CONTEXT — muda o protocolo de verificação visual |
| Convenção de banco mudou? | **Não** — nenhuma convenção nova de banco; o `revisor-db` não precisa de atualização de checklist por esta versão (nota D-12 conferida) |

---

## 10. Arquivos modificados

**Banco:** `supabase/migrations/0238`–`0242`, `supabase/patches/PENDENTE-agendamento-cdi.sql`

**App:**
`src/app/api/cdi/ingest/route.ts` (novo) ·
`src/app/api/dashboard/weddings/operacao/[id]/route.ts` ·
`src/lib/cdi/serie-sgs.ts` + `.test.ts` (novos) ·
`src/lib/weddings/float-virtual.ts` + `.test.ts` (novos) ·
`src/components/weddings/lista-operacoes.tsx` ·
`src/components/weddings/drilldown-drawer.tsx` ·
`src/components/weddings/fluxo-caixa-card.tsx` ·
`src/components/performance/weddings-content.tsx` ·
`src/lib/schemas-rpc.ts` · `src/types/api.ts` · `src/proxy.ts` ·
`src/styles/tokens.css` · `src/app/globals.css`

**Documentação:** `docs/adr/0166-rendimento-potencial-do-float.md` (novo) · `CHANGELOG.md` ·
`src/data/changelog-diretoria.ts` · `package.json` · `docs/WORKING-CONTEXT.md` · este out-briefing
