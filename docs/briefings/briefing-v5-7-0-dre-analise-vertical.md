# Briefing v5.7.0 — DRE: reestruturação (camada firme), padronização de rótulos e Análise Vertical

**Tipo:** MINOR *(confirmar numeração no `/nova-versao`)* · **Migration:** **1 de estrutura, DESTRUTIVA** (UPDATEs em `dre_bloco`/`dre_categoria_map` + DELETE do bloco RFIN — classifica destrutiva no db-gate ⇒ **aplicação em TTY do Yan**, numerada na hora, fora de `supabase/migrations` até aplicar) · **ADR:** **novo** — mudança de critério de apresentação da DRE (fechar ao FINAL) · **Base:** `main` · **Branch:** `feat/v5-7-0-dre-reestruturacao-av` · **Rota A**

> ## ⛔ GATE leve — densidade real do Consolidado
> A missão da AV no Consolidado apresenta a **tabela real completa** (todos os anos + VENCIDOS + Δs, com colunas AV) e **PARA** para o OK do Yan. O mockup aprovado tinha 2 anos; a tela real pode ter 5–6. As demais missões não dependem do gate.

## Objetivo

Três frentes na DRE, numa versão: **(1) reestruturação — camada firme** decidida com a gerente: fusão das linhas financeiras em "(+/-) Resultado Financeiro" e descida do bloco de Imobilizados para baixo da linha; **(2) padronização de rótulos** com regra de uma frase — operador marca agregação, linha-folha não tem operador — vigiada por guarda mecânica; **(3) Análise Vertical** — % de cada linha sobre a ROL, coluna por ano no Consolidado e no total da Mensal. O REX não muda um centavo em nenhum ano (oracle da migration); mudam os subtotais intermediários e a apresentação.

## Frente 1 — Reestruturação (decisões firmes; embutir, não rediscutir)

- **Fusão FIN+RFIN:** as 3 categorias de RFIN (Acréscimos Cobrados, Aplicações e Investimentos C, Desconto Obtido) entram no bloco `FIN`, que vira rótulo **"(+/-) Resultado Financeiro"** e passa a ser a **última linha** dentro de "(-) DESPESAS" (reordenar `ordem` entre RHB e LOP). O bloco `RFIN` sai de `DESP_H` e `LOP` e a linha dele é **deletada**. Chave `FIN` preservada (âncora de fórmula). **Neutro por construção:** LOP idêntico antes×depois.
- **Descida do IMOB:** o bloco `IMOB` sai das fórmulas de `DESP_H` e `LOP` e desce para o grupo de investimentos, como **subgrupo próprio** (não dissolver categorias em INV): `INV_H` vira `INV + IMOB`, `RAIR` vira `LL + INV + IMOB`, `ordem` reposicionada entre LL e RAIR. Cabeçalho `INV_H` renomeado para **"(-) INVESTIMENTOS, IMOBILIZADO E EMPRÉSTIMOS"** (prefixo "(-)": decisão do Yan no checkpoint — ver lá).
- **As duas listas mudam JUNTAS:** `DESP_H` e `LOP` enumeram os mesmos subgrupos cada um por conta própria (assimetria documentada) — remover RFIN e IMOB **das duas fórmulas**, de forma idêntica.
- **Passe único ASC:** toda reordenação respeita "insumo computado antes de quem o consome". Nenhuma fórmula pode referenciar chave de `ordem` posterior (soma zero em silêncio — a armadilha documentada).
- **NÃO entram** (aguardam a gerente): par Aplicações e Investimentos C/D fica onde está; Empréstimo C fica em RNOP; Empréstimos do RH intocados; repasse fora de pauta.

## Frente 2 — Rótulos (regra + guarda)

- **Regra:** cabeçalhos, totalizadores e subgrupos carregam prefixo padronizado `(+)` `(-)` `(+/-)` `(=)`; **categoria (folha) nunca carrega operador** — o sinal de folha é do valor (parênteses), não do rótulo.
- Aplicação na mesma migration: os `=` soltos entram na fôrma `(=)`; subgrupos ganham operador pelo papel dominante ("(-) Custo dos Serviços Prestados", "(+) Receita de Vendas", "(-) Distribuição de Lucros"…); os **18 overrides "(-) …" de categoria perdem o prefixo** (overrides de capitalização ficam).
- **Guarda mecânica (régua, destino 1):** teste que lê as duas tabelas de estrutura e cobra as duas direções — todo rótulo de `blocoH`/`tot`/`sub` casa `^\((\+|-|\+/-|=)\)` e nenhum rótulo/override de categoria começa com token de sinal. **Vista reprovando** (rodar contra o estado antigo) antes de valer.
- Tooltip "?" da tabela ganha uma frase: o prefixo é o papel da linha na leitura do demonstrativo, não o sinal do valor do período.

## Frente 3 — Análise Vertical (firme)

- **Base = ROL do período** (linha `ROL` do payload). AV = valor ÷ ROL, **sinal algébrico preservado**; todas as linhas, inclusive acima da ROL.
- **Consolidado:** coluna AV estreita à direita de **cada ano**; VENCIDOS sem AV. **Mensal:** **uma** coluna AV ao lado do "Total do ano"; as 12 colunas de mês não ganham AV. **Resumo Executivo: fora** (decisão do Yan).
- **Forma:** subordinada — fonte menor, tom muted, 1 casa decimal, **sem % por célula** (header "AV" + tooltip "% sobre a Receita Operacional Líquida do período"); negativo em parênteses **neutros, nunca vermelhos**; par valor+AV do mesmo ano visualmente colado.
- **Derivada, nunca buscada:** módulo puro em `src/lib/dre/` computado no cliente do payload existente. Zero RPC, zero mudança de contrato.
- **Guardas:** ROL ≤ 0/ausente ⇒ travessão na coluna AV inteira do período; bandeja e VENCIDOS ⇒ travessão sempre; nunca NaN/∞.
- **Aditividade pré-arredondamento** travada em teste; a exibição com 1 casa pode divergir ±0,1 p.p. na soma — inerente, **não se maquia** (exceção consciente à lição da v5.5.0/0242: aqui a correção de cada linha contra a ROL vence a soma cosmética; comentar no módulo).
- **CSV das duas visões** com colunas AV ("2025", "2025 AV"), percentual como número, padrão pt-BR do export.

## Invariantes (inegociáveis)

1. **REX idêntico ao centavo em TODOS os anos, antes×depois da migration** — o oracle. Deltas de LOP/LL/RAIR exatamente iguais aos blocos movidos, por ano.
2. A migration de estrutura é **destrutiva** (DELETE de bloco): mora fora de `supabase/migrations` até a aplicação, numerada na hora, aplicada pelo Yan em TTY, backup-gate.
3. A mudança é **retroativa a todos os anos exibidos** (estrutura viva não reprocessa) — a saída inclui o **quadro de-para por ano** (LOP/LL/RAIR antes×depois) pronto para a comunicação de mudança de critério à liderança.
4. Nenhuma alteração em `fato_fluxo`, RPCs, schemas ou no de-para além do especificado; editor de estrutura intocado.
5. Sem regressão na tabela: colunas fixas, scroll, sombra, z-index, modos, navegação de ano, Decomposição e Fluxo de Caixa (que lê o mesmo fato) intactos.
6. Formatação via `fmt.ts`; guarda de rótulos vista reprovando; AV pelo módulo puro com testes.

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Migration de estrutura** (frentes 1+2): fusão FIN+RFIN, descida do IMOB, fórmulas de `DESP_H`/`LOP`/`INV_H`/`RAIR`, reordenações, rótulos padronizados, remoção dos prefixos das 18 categorias. Ensaiar em transação REVERTIDA (método validado) antes de entregar ao Yan. | **oracle:** REX por ano idêntico ao centavo; ΔLOP = ΔLL = −(IMOB) por ano (a fusão é neutra); ΔRAIR = 0; fórmulas sem referência a chave posterior |
| **M2** | **Guarda mecânica de rótulos** (teste sobre as tabelas de estrutura, duas direções) + tooltip "?" com a frase do prefixo. | rodar contra o estado ANTIGO e ver reprovar; contra o novo, passar |
| **M3** | **Módulo puro de AV** (`src/lib/dre/av.ts` + testes): base ROL, sinal, ROL ≤ 0/nula, ano só-previsto, bandeja/VENCIDOS, contra-conta, aditividade pré-arredondamento até o REX. | casos listados; nenhum NaN/∞ possível por construção |
| **M4** | **Consolidado:** coluna AV por ano, estilo subordinado, VENCIDOS sem AV, Δs inalterados. **GATE leve:** apresentar a tabela real completa e aguardar OK. | varredura vertical lê composição; largura ~"(100,0)" |
| **M5** | **Mensal:** coluna AV do total; **CSV das duas visões** com AV. | Excel pt-BR: AV como número, separador/acento OK (receita da skill) |
| **M6** | **Fechamento:** v5.7.0; CHANGELOG; CHANGELOG_DIRETORIA (critério novo + AV, linguagem de diretoria); **ADR** da mudança de critério (o que desceu, por quê, REX invariante) fechado ao final; **quadro de-para por ano** no out-briefing; conferência de 3 AVs à mão. | — |

## Gates

Escalonados: tsc+lint por missão; build+test nas fronteiras (após M2; após M4) e no fechamento. Migration destrutiva: backup-gate + verificação via REST/service_role do payload pós-aplicação (a RPC devolvendo os blocos novos com os totais do oracle). verificador-visual nas duas visões e na Decomposição (que agrupa pela estrutura viva — os grupos mudam de nome/composição junto).

## Checkpoint do Yan

**(migration)** aplicar em TTY; conferir o oracle (REX por ano) e o quadro de-para. **(decisão no ato)** prefixo do cabeçalho de investimentos: manter **"(-)"** (leitura dominante) ou **"(+/-)"** (tecnicamente pode fechar positivo em ano de captação — hoje só há amortização no bloco, o "(-)" é defensável). **(gate M4)** densidade do Consolidado real — a válvula pré-decidida é o toggle "AV" no vocabulário de modos, só se o gate pedir. **(final)** ler a DRE inteira com os rótulos novos; conferir a Decomposição agrupando pelo Resultado Financeiro novo; varrer uma coluna AV; abrir os CSVs; validar o texto da comunicação de mudança de critério antes de enviar à liderança.

## Fronteira

**Fora:** Resumo Executivo com margens (adiado); toggle AV (só se o gate pedir); AV mensal por mês; par Aplicações e Investimentos C/D, Empréstimo C/RNOP e Empréstimos do RH (aguardam a conversa com a gerente — a rota preferida registrada é resolver na fonte via plano de contas do Monde, com o par parado onde está como interim); repasse líquido (fora de pauta por decisão); edição de blocos/fórmulas no editor (segue v1 só de de-para).

## Skills a ler (antes de implementar)

- `.claude/skills/banco-e-rpc/SKILL.md`
- `.claude/skills/tabela-densa/SKILL.md`
- `.claude/skills/ui-design-system/SKILL.md`
- `.claude/skills/react-padroes/SKILL.md`

## Commits sugeridos

1. `feat(dre): migration de estrutura — resultado financeiro unificado + imobilizado abaixo da linha + rotulos padronizados`
2. `test(dre): guarda mecanica de rotulos da estrutura`
3. `feat(dre): modulo puro de analise vertical com guardas de borda`
4. `feat(dre): colunas av no consolidado — GATE`
5. `feat(dre): av do total na mensal + csv das duas visoes`
6. `chore(release): v5.7.0`
