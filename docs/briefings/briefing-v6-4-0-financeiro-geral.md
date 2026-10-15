# JANUS · Briefing v6.4.0 — Financeiro · Geral (visão executiva)

**MINOR** · **Migrations:** aditivas — (1) base nova de contas a receber (raw + fotos por carga + `promover_carga_*` + grant do `ingestor`); (2) registro de antecipações (tabela sob o diário, RPCs de escrita, carga inicial da planilha); (3) leitura da página (área RBAC, concessões, RPCs, grant do `verificador`). Numerar na hora (provável `0295` em diante, conferir no banco e nas worktrees) · **ADR:** 1 novo — "Indicadores gerais: recortes da DRE de caixa, contas a receber com a marcação do Financeiro e antecipações registradas no Janus" (provável `0183`, conferir no remoto) · **Base:** `main` após a v6.3.1 · **Branch:** `feat/v6-4-0-financeiro-geral` · **Rota A**

*Página nova "Geral" dentro de Financeiro, para leitura executiva da diretoria. Uma faixa de indicadores no topo e cinco seções no padrão das TopSections da DRE: Recebíveis e inadimplência, Antecipações, Perdas e prejuízos, Custos financeiros e Prazos médios. Três seções usam bases que já existem. Recebíveis ganha uma base nova (o relatório Contas a receber do Monde, com a marcação de inadimplência do Financeiro). Antecipações passa a ser registrada no próprio Janus, e a planilha gerencial se aposenta. As cinco saem juntas.*

---

> ## ⛔ GATE 0 — Medição (M0)
> Um explorador lê o dado vivo e responde às perguntas da §4. A M0 termina com um relatório e **PARA**. O Yan decide os pontos marcados "decidir na M0". O relatório não leva nome de pessoa física, de colaborador nem de portador de cartão; usa rótulos (lição da v6.3.0).

> ## ⛔ GATE 1 — Export definitivo do Contas a receber (M1)
> Sem o arquivo no formato definitivo, sem parser (lição da v6.0.0). A amostra de 15/10 (contas a pagar e a receber juntas, vencimentos de 2026 até o dia do export) já foi analisada no Chat (§3). O Yan traz o export no recorte decidido na §3; a M1 confere a estrutura contra o que este briefing diz e **PARA**. A base entra no `docs/contratos/ingestao-v1.md` como base nova (mudança aditiva do contrato, registrada no ADR).

> ## ⛔ GATE 2 — Mockup do DS (M2)
> O protótipo aprovado no Chat é ponto de partida, não spec visual. Mockup na rota real com componentes de produção e fixture (precedente da v6.3.0): página, estados vazio e de erro por seção, largura estreita, e o registro de antecipações (lista + formulário). **PARA** para o Yan.

## 1. Decisões do Yan (firmes — embutir, não rediscutir)

- **Público: diretoria, leitura executiva.** Sem listas operacionais de títulos ou lançamentos na página. O detalhe para em top-N, faixas e naturezas.
- **Estrutura:** faixa de indicadores no topo + cinco seções temáticas (padrão DRE), cada uma autocontida.
- **Custos financeiros, Perdas e prejuízos e Prazos médios usam bases existentes.**
- **Prejuízos = categoria(s) de prejuízo no Monde** (lançamentos realizados). A solicitação "Registro de prejuízos" não é fonte da página.
- **Inadimplência vem do relatório Contas a receber do Monde, pela marcação do Financeiro.** Os lançamentos do Monde sozinhos não são confiáveis para isso (mesmo problema do fluxo de caixa gerencial). Nada de reconstruir a posição pela movimentação.
- **Antecipações são registradas no Janus.** A planilha "Histórico de Antecipações" se aposenta; o registro passa a ser a fonte. A estrutura é a da tabela da planilha (conta, data, valor antecipado, valor líquido, desconto). A anotação "Taxa cartão" fora da tabela é ignorada.
- **Entrega única:** as cinco seções saem juntas na v6.4.0.

**Do protótipo aprovado (refinável na M2):**

- Estoque × fluxo: Recebíveis é **posição numa data** e ignora as pills de ano. As outras quatro são fluxo e respeitam as pills. Cada seção declara o próprio recorte.
- O custo de antecipação pertence a **Custos financeiros**. Antecipações mostra o volume; o desconto aparece só como contexto, sem que os cards somem o mesmo real duas vezes.
- Comparação por indicador: estoque contra a posição da carga do fim do mês anterior; fluxo contra o mesmo período do ano anterior (`deltaYtd`, como na DRE).

## 2. Invariantes (inegociáveis)

1. **Paridade com a DRE de caixa.** Custos financeiros e Perdas e prejuízos usam o predicado do Realizado de `get_dre_mensal`; cada total ≡ a soma das células correspondentes da DRE, ao centavo, por ano e mês. Teste de contrato via REST. Se quebrar, a página está errada, nunca a DRE (molde da v6.3.0).
2. **Nenhum recorte por lista de categorias em código.** Custos financeiros vem do bloco FIN no mapa vivo. Se prejuízos não for um bloco próprio, o recorte vive numa tabela curada por migration, com bandeja visível para categoria nova não mapeada (molde do `dre_comp_map`). A M0 decide.
3. **A base de contas a receber segue o contrato da v6.0.0:** cru no Storage, parser no servidor, **linha de total do arquivo como checksum**, `promover_carga_*` atômica, linha em `ingestao.carga`, oráculo cru↔tratado com fixture real, card de upload com instruções (padrão v6.1.3), grant só para a `promover` na allowlist do `ingestor`.
4. **Fotos por carga.** A marcação de inadimplência é um estado atual; o histórico só existe se a plataforma guardar. Cada carga aplicada grava uma foto da posição (por título: vencimento, liquidação, valor, marcação), atomicamente na mesma `promover`. A evolução mensal usa a última foto de cada mês e **começa na v6.4**; antes disso, a seção diz "histórico a partir de MM/AAAA", sem fabricar zero.
5. **Lista fechada de colunas da base de contas a receber** (§3), com sonda estática que reprova qualquer outra. `Observações`, `Pendente com:`, `Documento` e `Conta (Previsão)` nunca entram em tabela.
6. **Registro de antecipações auditado e coerente.** A tabela fica sob o diário (`fn_diario_alteracoes`), com reversão pelo `reverter_diario`. O desconto é **derivado** (antecipado − líquido), nunca digitado. `CHECK` de valores positivos e líquido ≤ antecipado; conta de uma lista curada.
7. **Carga inicial com oráculo.** As 38 linhas da tabela da planilha entram por migration. Totais conferidos **contra a tabela, não contra as dinâmicas** (que estão desatualizadas): antecipado R$ 7.245.412,45; líquido R$ 7.057.349,44; desconto R$ 188.063,01; por conta e ano: Asaas 2024 1.521.381,14 · 2025 823.881,69 · 2026 1.343.423,51; Blimboo 2025 3.102.209,43 · 2026 454.516,68.
8. **Cada seção degrada sozinha e mostra a própria data de carga ou de último registro.**
9. **Zero mudança fora da página, das duas bases novas e do card de upload.** `get_dre_mensal`, `dre_categoria_map`, o editor da DRE e as telas existentes ficam intocados. O diff é medido, não afirmado.
10. **`app.exigir_acesso` não muda.** Se precisar, PARE e volte ao Chat.
11. **RPCs de leitura nascem fora da allowlist do `verificador`;** o grant é deliberado, por assinatura. As RPCs de escrita das antecipações **não** entram na allowlist do `verificador` nem na do `ingestor`. A área de leitura também é concedida a **Máquina · verificação** (lição da v6.3.0).
12. **Quem tem só `financeiro/geral` entra direto na página** (`rotaInicial`), com caso de teste.
13. **Convenções vigentes:** despesa negativa como na DRE; ano parcial marcado com `*`; carimbo "Última atualização" no formato da casa.

## 3. Contas a receber — o que a amostra de 15/10 mostrou

Arquivo `Contas_a_pagar_e_a_receber_2026.xlsx`: 17.707 títulos + 1 linha de total, 17 colunas, uma aba.

- **A coluna da marcação é `Conferido`**, com os valores `Sim`, `Enviado para o banco`, `Pendente`, `Inadimplente` e vazio. É um status de fluxo de trabalho, e `Inadimplente` é um dos estados.
- **Marcados como inadimplentes: 21 títulos**, 20 em aberto (R$ 195.708,79) e 1 já liquidado (R$ 1.228,64, uma recuperação). Todos de natureza a receber (`Fatura Cliente`, `Pagamento venda`, `Reembolso Interno`).
- **Vencido ≠ inadimplente.** Entre os títulos a receber vencidos e em aberto (117 títulos, ~R$ 688 mil), só 19 estão marcados como inadimplentes (R$ 195 mil). 76 estão `Pendente` (R$ 341 mil), 21 sem marcação (R$ 101 mil) e 1 `Sim`. Ver a decisão (b) abaixo.
- **Pagar e receber vêm misturados**, todos com valor positivo. A linha de total, porém, é **com sinal** (R$ −10.118.191,87 no `Valor Final`): o Monde sabe a natureza de cada título, só não a exporta.
- **A janela de vencimento vai de 01/01/2026 até o dia do export.** Faltam os títulos a vencer (sem eles não há carteira nem a faixa "a vencer") e os inadimplentes de anos anteriores.
- **`Valor` × `Valor Final` divergem em 9.842 linhas** (taxas descontadas, por exemplo 512,00 → 499,75). A linha de total usa `Valor Final`.
- **Sujeira:** 4 `Emissão` com data zero (hora 00:00 sem data) e 1 nula. Emissão não é essencial: vira nula e é contada no log, sem rejeitar a carga.
- **Colunas com dado pessoal ou interno:** `Pessoa` (clientes pessoa física), `Observações` (texto livre com nomes), `Pendente com:` (nome de colaborador) e `Conta (Previsão)` (cartões com o nome do portador).

**Decisões para o GATE 1 (recomendação entre parênteses):**

- **(a) Recorte do export.** Só **contas a receber** nesta versão, porque a página não usa o lado a pagar (recomendo exportar já filtrado no Monde). Vencimentos de todos os anos com título em aberto **e também os a vencer**, em um ou vários arquivos (a carga aceita N arquivos, como Vendas). Se o Monde não conseguir separar a receber, o parser classifica pela categoria, e a linha de total com sinal **prova** a classificação ao centavo; se não fechar, a carga é rejeitada.
- **(b) O que a página chama de inadimplência.** Proponho dois números lado a lado: **inadimplente** (a marcação, número principal) e **vencido em aberto** (pela data, como contexto). A distância entre os dois é informação para a diretoria: mostra quanto do vencido ainda não teve tratamento. As faixas de atraso são sobre o vencido, com a parte marcada em destaque.
- **(c) Valor.** `Valor Final`, que é o que a linha de total soma (o checksum fecha).
- **(d) Nome do devedor.** A concentração precisa de `Pessoa`. Entra na lista fechada, mas a página mostra nome só no top 10 de inadimplentes? (Recomendo "10 maiores = X%" sem nome na faixa e com nome na seção, só para a área `financeiro/geral`.)

**Lista fechada proposta:** `Número`, `Emissão`, `Pessoa` (se (d) confirmar), `Descrição` (categoria), `Vencimento`, `Liquidação`, `Valor Final`, `Conferido`, `Operação Própria`.

## 4. M0 — Perguntas que a medição responde

| # | Pergunta | Decide |
|---|---|---|
| Q1 | Quais categorias o bloco FIN tem hoje? Ele mistura receitas financeiras (rendimentos) com custos? Como se agrupam em juros, tarifas, IOF e custo de antecipação? | **decidir na M0:** só custos ou resultado financeiro líquido; grupos da tabela |
| Q2 | Quais categorias do Monde são prejuízo, em que bloco da DRE caem, e com que volume por ano? Formam um bloco ou sub próprio? (Na amostra de contas, `Prejuízos` aparece como categoria, com 94 títulos em 2026.) | **decidir na M0:** recorte pelo mapa ou por tabela curada (inv. 2) |
| Q3 | O método contábil de prazos médios (saldo médio ÷ fluxo do período × dias) dá números plausíveis? De onde vêm os saldos, agora que a reconstrução pela movimentação saiu: das fotos de contas a receber (só a partir da v6.4) ou da base de títulos em aberto? Quais linhas são "receita" e "custo" no denominador? | **decidir na M0:** método e definição; se o histórico não sustenta, a seção nasce curta e cresce com as fotos |
| Q4 | Como a antecipação aparece hoje no Monde: categoria do desconto, lançamento do valor antecipado? O desconto registrado bate com essa categoria? | conciliação entre o registro e o FIN, sem contagem dupla (cruzamento informativo, não gate) |
| Q5 | Quais roles representam a diretoria no RBAC hoje? Quem registra antecipações? | concessões das duas áreas |

Relatório em `docs/auditoria/v6-4-0-m0-financeiro-geral.md`, com query e resultado por pergunta. O explorador só lê.

## 5. Registro de antecipações

- **Tabela** `financeiro.antecipacao` (nome final na M4): conta (FK para uma lista curada: Asaas, Blimboo), data, valor antecipado, valor líquido, desconto como coluna gerada, criado/atualizado por e em. Sob o diário.
- **Escrita** por RPCs `exigir_acesso` numa área de edição própria (proposta: `financeiro/geral/antecipacoes`), concedida ao Financeiro e ao Administrador. A diretoria só lê.
- **Interface:** na própria seção Antecipações, um botão "Registrar antecipação" visível só para quem tem a área de edição, abrindo um painel com a lista dos registros (editar, excluir com confirmação) e o formulário. Valor pt-BR normalizado no envio (padrão da v6.2.1).
- **Indicadores:** volume antecipado no período, desconto e desconto % sobre o antecipado, nº de antecipações, e **dias desde a última antecipação** com o maior intervalo do ano (a gerência já acompanha isso na planilha; é o sinal de pressão de caixa). Saem do protótipo o "custo % ao mês" (não há o prazo dos recebíveis) e o "% da receita antecipada" (não há o denominador).
- **Testes que escrevem no banco:** os de escrita seguem a convenção de escrever-e-reverter (v5.9.6). O gatilho de reavaliação do ambiente de teste (skill `banco-e-rpc` §6) já está tocado; registrar a contagem no out-briefing.

## 6. A página

**Rota proposta:** `/financeiro/geral`, subaba "Geral" no grupo Financeiro. A posição na sidebar é confirmada no GATE 2.

| Componente | Conteúdo |
|---|---|
| **Cabeçalho** | título, pills de ano (multi-seleção, padrão da v6.3.0), "Última atualização" |
| **Faixa de indicadores** | Inadimplência (marcado, com o vencido como contexto); Antecipações (volume no ano, dias desde a última); Prejuízos (no ano, Δ); Custos financeiros (no ano, % da RB); Prazos médios (destaque proposto: o ciclo) |
| **Recebíveis e inadimplência** | estoque · "posição na carga de DD/MM": a vencer e faixas 1–30, 31–60, 61–90, 90+ sobre o vencido, com a parte marcada em destaque; evolução pelas fotos (a partir da v6.4); concentração; recuperado no ano (marcados que foram liquidados) |
| **Antecipações** | fluxo: volume por mês; volume, desconto e nº no ano; dias desde a última e maior intervalo; botão de registro (só edição) |
| **Perdas e prejuízos** | fluxo: prejuízo por mês; total por natureza (categoria) |
| **Custos financeiros** | fluxo: tabela por grupo (Q1) × ano, com total e % da RB do mesmo regime |
| **Prazos médios** | fluxo · janela móvel de 12 meses: recebimento × pagamento, com a folga entre as linhas (método da Q3) |

Cada seção: título, etiqueta do recorte (estoque ou fluxo), data de carga ou de último registro, "?" com a definição do indicador.

## 7. Engenharia

- **RPCs de leitura** por seção (nomes na M5), `exigir_acesso(['financeiro/geral'])`, leitura pura, schemas Zod + `parseRpc`. A de Recebíveis recebe a data de posição; as de fluxo, o ano.
- **Módulos puros com teste** em `src/lib/financeiro-geral/`: faixas de atraso, fotos, prazos médios, indicadores de antecipação (incluindo dias sem antecipar), faixa do topo. Δ% reusa `deltaYtd`; não reimplementar.
- **Base de contas a receber:** `raw.contas_receber` + tabela de fotos (nomes na M3), parser em `src/lib/ingestao/parsers/`, `promover_carga_*` gravando foto, card em `/admin/ingestao/upload` com `INSTRUCOES_UPLOAD` e a sonda de colunas.
- **Pós-aplicação:** `database.ts` e baseline de schema regenerados no mesmo commit de cada migration; teste de drift verde; verificação via REST (`db query` não executa corpo).

## 8. Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M0** | **GATE 0** — medição da §4, relatório, PARA. | toda resposta com query e resultado |
| **M1** | **GATE 1** — conferência do export definitivo contra a §3 (colunas, valores de `Conferido`, linha de total com sinal, janela de vencimento); PARA. | divergência entre arquivo e briefing vira pergunta, não suposição |
| **M2** | **GATE 2** — mockup DS na rota real com fixture, incluindo o registro de antecipações; PARA. | revisão do Yan antes de qualquer migration de leitura |
| **M3** | **Contas a receber:** migration aditiva (raw, fotos, `promover`, grant do `ingestor`), parser + oráculo cru↔tratado, sondas (lista fechada, emissão inválida, mutante), card de upload, contrato atualizado. `revisor-db` antes. | carga pelo card aplica e grava foto; total falso ⇒ RAISE, base intacta |
| **M4** | **Antecipações:** migration aditiva (contas, tabela sob o diário, RPCs de escrita, carga inicial das 38 linhas com o oráculo do inv. 7); painel de registro. `revisor-db` antes. | totais por conta e ano ≡ inv. 7; editar e reverter pelo diário funcionam |
| **M5** | **Leitura:** migration aditiva (área, concessões, RPCs, grant do `verificador`). `revisor-db` antes; ensaio em transação revertida; REST depois. | paridade com a DRE (inv. 1) verde contra o banco |
| **M6** | **Front:** `nav-model`, `rotaInicial`, página, módulos puros com teste. | usuário só-Geral entra direto e não vê o botão de registro; cada seção degrada sozinha |
| **M7** | **Contratos via REST** com `SUPABASE_VERIFICADOR_KEY`: shape, paridade, `anon` negado, sem área negado, escrita negada a quem só lê. | allowlist derivada bate com os grants |
| **M8** | **Fechamento:** v6.4.0; CHANGELOG; CHANGELOG_DIRETORIA (uma linha: "a diretoria passa a ter no Janus uma visão geral das finanças: inadimplência, antecipações, prejuízos, custos financeiros e prazos"); ADR; skills (`ingestao-planilhas` com a base nova; `banco-e-rpc` com o registro sob o diário); out-briefing com a M0, a M1, os oráculos e prints; WORKING-CONTEXT. | — |

## 9. Gates

`tsc`+`lint` por missão; `build`+`test` após M3, após M4, após M7 e no fechamento. `revisor-db` em M3, M4 e M5; `revisor` ao fim. `verificador-visual` na página, no painel de registro e no card de upload se subir; senão, "entregar → Yan confere no preview → ajustar".

## 10. Checkpoint do Yan

- **(M0)** FIN só custo ou líquido; recorte de prejuízos; método de prazos; quem é diretoria e quem registra antecipações.
- **(M1)** Decisões (a)–(d) da §3; trazer o export definitivo.
- **(M2)** Aprovar o mockup.
- **(M3/M4/M5)** Pareceres do `revisor-db`.
- **(final)** Conferir Custos financeiros e Prejuízos contra a DRE de um mês; conferir os inadimplentes da página contra o filtro `Conferido = Inadimplente` no Monde; registrar uma antecipação real e desfazê-la; abrir com usuário só-Geral; avisar quem mantém a planilha que ela se aposenta; **mostrar à diretoria e anotar o que ela pede.**

## 11. Fronteira (fora desta versão)

Contas a pagar · listas operacionais de títulos e lançamentos · histórico de inadimplência anterior à v6.4 · RPA do Contas a receber · antecipação por desconto de boletos no banco · "Taxa cartão" como coluna · provisão para devedores duvidosos · cancelamentos e reembolsos · exposição cambial · orçado · uso do tipo de solicitação "Pagamentos fora do prazo" · qualquer mudança na DRE.

## 12. Skills a ler

`banco-e-rpc` · `contrato-rpc-front` · `ingestao-planilhas` · `ui-design-system` · `tabela-densa` · `graficos` · `react-padroes` · `orquestracao` (Carta, antes de despachar)

## 13. Commits sugeridos

1. `docs(v6-4-0): briefing da versao`
2. `docs(auditoria): medicao da m0 — financeiro geral` — **GATE 0**
3. `docs(v6-4-0): conferencia do export de contas a receber` — **GATE 1**
4. `docs(v6-4-0): mockup da pagina geral` — **GATE 2**
5. `feat(ingestao): base de contas a receber — raw, fotos, parser, promover, card`
6. `feat(financeiro): registro de antecipacoes + carga inicial da planilha`
7. `feat(db): area financeiro/geral + rpcs de leitura + grant do verificador`
8. `feat(financeiro): pagina geral`
9. `test: contratos da pagina geral`
10. `chore(release): v6.4.0`
