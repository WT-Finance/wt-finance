# ADR-0171 — Conciliação entre regimes: a ponte Competência ↔ Caixa

- **Status:** aceito
- **Data:** 2026-08-26
- **Versão:** v5.8.1
- **Migrations:** nenhuma. Zero toque no banco, zero RPC nova.
- **Substitui/altera:** nada. Complementa a [ADR-0170](0170-dre-por-competencia-arvore-propria.md).

## Contexto

A v5.8.0 pôs dois regimes na MESMA página (`/financeiro/dre`): competência (fato gerador =
emissão) acima, caixa (fato gerador = movimentação) abaixo. Os dois estão certos e mostram
números diferentes — no YTD de 2026, **−79.434,67** por competência e **+136.811,39** por
caixa.

Pôr os dois lado a lado sem explicar a diferença transfere ao leitor um trabalho que ele não
tem como fazer: nada na tela diz se a distância é descasamento de prazo, float de
intermediação, safra de carga ou erro. A pergunta "qual dos dois está certo?" é a pergunta
errada, e é a que a página convidava a fazer.

Esta ADR registra o instrumento que responde à pergunta certa — *por que* são diferentes — e a
decisão de arquitetura que o torna barato.

## Decisões

### 1. A conciliação é DERIVADA no cliente, nunca buscada

Os três componentes da v5.8.1 (Resumo Executivo, decomposição da variação e ponte) saem
inteiramente dos **dois payloads que a página já buscava**. Nenhuma RPC nova, nenhuma tabela,
nenhuma migration.

**Por quê.** A conciliação é uma leitura, não um fato: ela não tem estado próprio, não é
editável e muda sempre que qualquer das duas bases muda. Materializá-la criaria uma terceira
fonte que pode divergir das duas que ela concilia — exatamente o defeito que ela existe para
expor. É a mesma decisão da AV (ADR da v5.7.0): *derivada, nunca buscada*.

**O que se aceita:** a aritmética roda no servidor a cada render da página (é Server
Component). Medido: irrelevante ao lado das RPCs, que já dominam o tempo.

### 2. A identidade fecha por CONSTRUÇÃO, e o residual não é um ajuste

Nos dois regimes, o Resultado do Exercício é a **soma de todas as folhas** da árvore:

```
caixa: REX = REPASSE + RV + IMP_H + CUSTO + ADM + COM + FIN + MKT + ESTR + RH
             + RHB + RNOP + DNOP + INV + IMOB + DIST_LUCROS
comp:  REX = RV + REEMB + IMP_H + CUSTO + ADM + COM + MKT + ESTR + RH + RHB
             + FIN + RNOP + DNOP + INV + DL
```

Logo, se o vocabulário da ponte for uma **partição** das folhas — cada folha em exatamente um
balde —, então `Σ degraus = Σ folhas_caixa − Σ folhas_comp = REX_caixa − REX_comp`, e a
identidade `REX_comp + Σ degraus = REX_caixa` é consequência, não coincidência.

Isso muda o que se testa. Um residual que absorve a diferença faria QUALQUER pareamento
"fechar" — e um card que sempre fecha não prova nada. O teste que importa não é o da soma, é
o da **totalidade**: nenhuma folha em dois baldes, nenhuma folha fora de todos. O
`rpc-contrato.test.ts` confronta isso contra a base VIVA a cada `npm test`, porque a árvore é
editável pela interface e uma folha nova criada no editor é o cenário realista de quebra.

**O que se aceita:** uma folha nova não pareada NÃO quebra a tela — cai no residual e a
identidade se mantém. É deliberado (a alternativa seria o card sumir), e é justamente por ser
silencioso que o caso de contrato existe: ele falha no `npm test` antes de o "Outros ajustes"
engordar em produção.

### 3. Bandeja e excluídas ficam FORA das cascatas

As "não classificadas" são órfãs do de-para: não pertencem a bloco nenhum e **não compõem o
REX**. A leitura literal de "toda folha dos dois payloads entra na conciliação" as incluiria no
residual — e quebraria a identidade da seção 2.

### 4. A janela YTD sai da COBERTURA da base, não do calendário

A tabela densa corta o YTD por `mesJanela` = mês corrente de `hojeSP()`. Para o caixa isso está
certo: a base de movimentação é contínua. A base de competência é um **upload periódico** e
fica defasada entre cargas — cortar pelo calendário somaria meses ainda não carregados como se
fossem zero, subestimando o YTD **em silêncio**, com um número que fecha e está errado para
menos.

Os três componentes novos cortam pela cobertura real (`cobertura_ate`) e **declaram a janela no
subtítulo**.

**O que se aceita:** quando a base atrasar, o "YTD 26" dos cards mostrará menos meses que a
coluna "YTD" da tabela logo acima. Dois números vizinhos diferentes na mesma tela é um custo
real — pago conscientemente, porque a alternativa é um número errado sem aviso. O subtítulo é
o que os reconcilia. A tabela densa **não foi alterada**: mudá-la é escopo maior que um patch,
e fica registrado como fronteira.

### 5. Vocabulário estático, árvore dinâmica

O pareamento (`PAREAMENTO_PONTE`) é uma lista estática de chaves, porque nomear e dar natureza
a um balde é decisão editorial, não derivável. Já as **folhas** vêm do payload vivo (o campo
`g` das linhas de categoria), sem lista fixa e sem chamada nova.

Duas divergências deliberadas do anexo do briefing, ambas resolvidas contra o repo real:

- **`FIN ↔ FIN`** — o `RFIN` do caixa foi dissolvido em `FIN` na v5.7.0 (`0251`); os dois
  regimes têm hoje um único Resultado Financeiro. `INV ↔ INV + IMOB` e `REPASSE = ENT_H +
  PAG_H` pela mesma verificação.
- **Distribuição de Lucros ganha degrau próprio** (decisão do Yan), em vez do residual que o
  anexo previa: ela pareia limpa nos dois lados (`DL` ↔ `DIST_LUCROS`) e é grande — no
  residual, viraria ruído exatamente no item mais explicável.

### 6. Narrativa gerada por regra, nunca escrita por linha

Cada degrau traz uma frase curta, derivada de `(natureza, sinal)`: despesa com Δ<0 é "pago além
do incorrido no período"; receita com Δ>0 é "recebido além do reconhecido"; e assim por diante.

**Por quê.** Uma frase por combinação sobrevive a mudanças na árvore. Dezesseis frases escritas
à mão envelheceriam na primeira conta que mudasse de bloco — e uma narrativa desatualizada é
pior que nenhuma, porque tem a mesma autoridade visual de uma correta.

## Consequências

- A pergunta "por que os dois regimes divergem?" passa a ter resposta na própria tela, com o
  Δ de capital de giro nomeado na âncora final.
- Um bloco novo criado no editor da estrutura **exige** atualizar `PAREAMENTO_PONTE`. O
  `npm test` avisa; a tela não quebra enquanto isso.
- A plataforma ganha um primitivo de cascata (`@/components/charts/cascata`) reutilizável.
- Segue fora: mix de receita, orçado (e a coluna "Orç YTD" do modelo da gerente), os cards de
  KPI no topo da seção e o CSV da DRE.
