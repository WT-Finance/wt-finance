# Briefing v5.4.1 — DRE: refino visual (Resumo Executivo + Decomposição)

**Tipo:** PATCH · **Migration:** provavelmente nenhuma (só se a RPC de status não expuser a base de movimentação → aditiva mínima) · **ADR:** nenhum (refino) · **Base:** `main` @ v5.4.0 · **Branch:** `feat/v5-4-1-dre-refino-visual` · **Rota A**

> **Sessão A de duas em paralelo.** A outra é a v5.4.2 (Weddings). Esta **mergeia primeiro**. Fronteiras em *Coordenação*, no fim.
> **Nenhum número muda** — esta versão é apresentação.

## Objetivo

Refinar as duas peças que entraram na v5.3.1. O **Resumo Executivo** hoje destoa da tabela da DRE, embora seja apenas uma visualização das linhas-chave dela — passa a ter a mesma identidade visual. A **Decomposição dos Lançamentos** ganha as pills abaixo do título, cor plana e expansão no lugar certo. E o card da DRE ganha o selo de última atualização.

## Decisões do Yan (firmes — embutir, não rediscutir)

- **Resumo Executivo com a gramática visual da tabela:** cabeçalho igual, prefixo `R$` esmaecido antes do valor, negativos entre parênteses, `tabular-nums`, rótulos em caps com o prefixo contábil (`(=)`, `(+)`).
- **Cor das linhas do Resumo = cor das linhas de grupo de categoria (`blocoH`)** — *não* a banda escura dos totalizadores (6 bandas escuras seguidas viravam parede, e a banda perdia a função de contraste).
- **Título "Resumo Executivo" na mesma hierarquia do título da DRE, sem subtítulo.** O texto que estava no subtítulo (o Resumo não acompanha o ano selecionado) vai para um **ícone de info discreto** ao lado do título — *confirmar com o Yan; se vetado, sai sem substituto*.
- **Botão "Editar estrutura": abaixo da tabela e acima do Resumo** (hoje está abaixo do Resumo).
- **Selo de última atualização** no canto superior direito do card da DRE: `Última atualização em 3 de agosto de 2026, 12:00`, ícone de relógio, via `fmtDataHoraLongoSP`, lendo o status do upload de **Lançamentos por Movimentação**. Nulo ⇒ a linha **não aparece**. Em largura estreita quebra para baixo antes de colidir com "Expandir/Recolher tudo".
- **Decomposição — pills abaixo do título** (hoje à direita, na linha do título).
- **Decomposição — cor plana:** um único verde para todas as barras de Entradas, um único vermelho para as de Saídas. Sem escala. *(Opcional, decisão do Yan: "Outros (N)" pode manter um tom dessaturado por ser agregado; default é cor plana igual.)*
- **Decomposição — expansão inline:** os filhos abrem logo abaixo da **própria barra**, não depois do Total. O Total permanece sempre no fim do painel.
- **Decomposição — cortina + chevron:** animação do TopSection (450ms, `cubic-bezier(.32,.72,0,1)`) e o chevron `>`/`v` da DRE. **Reusar os primitivos, não recriar.**
- **Decomposição — escala das barras-filhas:** proporcional ao **maior filho** (a maior fica cheia). Não proporcional à barra-pai.

## Invariantes (inegociáveis)

1. **Zero mudança de valor.** Resumo, tabela e barras exibem os mesmos números de antes — conferir no checkpoint.
2. **Reuso de primitivos:** chevron da DRE, cortina do TopSection, `fmtDataHoraLongoSP`, helper de staleness. Nada duplicado.
3. **"sem data" nunca aparece** (lição da v5.2.1): campo nulo ⇒ elemento omitido.
4. **Conferência visual ao vivo obrigatória.** A v5.3.0 registrou três degradações silenciosas que passaram por tsc/lint/build: thenable do Supabase com `.catch()`, `behavior:'smooth'` como no-op, `relative` × `sticky` decidido pela ordem do CSS gerado. Esta classe só cai no olho.
5. **Clip da cortina:** confirmar que nada com `position:absolute` (popover/tooltip) vive dentro do bloco expandido das barras — foi o risco MÉDIO registrado na v5.1.9.
6. **Se houver migration:** aditiva mínima, backup-gate, numerada na hora conforme o estado do repositório, e **verificada executando via REST/service_role** (introspecção não prova execução — lição da v5.2.1).
7. **Escopo trancado:** não tocar o motor (`get_dre_mensal`, estrutura viva, editor), nem `performance/weddings`.

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Resumo com identidade.** Apresentação do Resumo Executivo na gramática da tabela; linhas com a cor de `blocoH`; título na mesma hierarquia, sem subtítulo, com o ícone de info carregando o texto da ancoragem. | lado a lado com a tabela, mesma família visual; números idênticos aos de antes |
| **M2** | **Editar estrutura** movido para entre a tabela e o Resumo, mantendo gating por permissão e comportamento. | permissão e destino intactos |
| **M3** | **Selo de atualização.** Canto superior direito do card, `fmtDataHoraLongoSP`, fonte = status do upload de Lançamentos por Movimentação (verificar se a RPC de status já expõe; se não, aditiva mínima). Nulo ⇒ omite. Responsivo. | bate com a data real do último upload; nulo não gera "sem data" |
| **M4** | **Decomposição.** Pills abaixo do título; cor plana; expansão inline sob a própria barra com cortina e chevron; filhas proporcionais ao maior filho; Total sempre no fim; drill "Outros (N blocos)" e o voltar preservados. | expansão no lugar certo; Total não se desloca; drill preservada |
| **M5** | **Fechamento.** v5.4.1; CHANGELOG; CHANGELOG_DIRETORIA (negócio: "o resumo executivo passou a ter a mesma leitura da DRE e a decomposição ficou mais direta"); sem ADR; DS doc se a barra expansível virar primitivo; out-briefing com prints antes/depois. | — |

## Gates

Escalonados: `tsc --noEmit` + lint **ao fim de cada missão**; `build` + `test` na **fronteira de fase** (após M4) e no **fechamento**. Conferência visual ao vivo obrigatória. Se houver migration: backup-gate verde + verificação via REST.

## Checkpoint do Yan

Abrir a página e olhar o card inteiro (tabela → Editar estrutura → Resumo), o selo com a data real, e a Decomposição com uma barra aberta. Conferir em tela estreita que nada colide. Conferir 2-3 valores do Resumo e 2-3 barras contra a versão anterior.

## Fronteira

**Fora:** qualquer mudança de cálculo ou definição; o editor de estrutura; o Consolidado; satélites da DRE. Esta versão é pele.

## Coordenação (duas sessões em paralelo)

- **Mergeia antes** da v5.4.2 (Weddings), para o CHANGELOG ficar cronológico.
- **Não tocar `performance/weddings`** (território da outra sessão).
- **`fmt.ts` é território desta sessão** — a outra foi instruída a criar helper local se precisar.
- Conflito garantido só nos arquivos-meta (`package.json`, CHANGELOG, changelog-diretoria, WORKING-CONTEXT): **quem fecha por último rebase** — e esta fecha primeiro.

## Skills a ler (antes de implementar)

- `.claude/skills/ui-design-system/SKILL.md`
- `.claude/skills/tabela-densa/SKILL.md`
- `.claude/skills/react-padroes/SKILL.md`
- `.claude/skills/banco-e-rpc/SKILL.md` — **só se** a M3 concluir que precisa da aditiva

## Commits sugeridos

1. `style(dre): resumo executivo com a identidade visual da tabela`
2. `fix(dre): editar estrutura entre a tabela e o resumo`
3. `feat(dre): selo de ultima atualizacao (upload de movimentacao)`
4. `style(dre): decomposicao — pills, cor plana, expansao inline com cortina`
5. `chore(release): v5.4.1`
