# JANUS · Briefing v6.5.0 — Financeiro · Geral, segunda versão

**MINOR** (número a confirmar no `/nova-versao`: a v6.4.1 do realce de antecipação no Fluxo de Caixa pode sair antes) · **Migrations:** 1 aditiva (RPCs de leitura das três seções + grants do `verificador`); **1 destrutiva só se a M0 mostrar que é preciso** (ver §6, GATE 2) · **ADR:** nenhum novo; **emenda datada ao ADR-0183** com a forma nova da página · **Base:** `main` após a última versão mergeada · **Branch:** `feat/v6-5-0-financeiro-geral-v2` · **Rota A**

*Refinamento da página `/financeiro/geral` entregue na v6.4.0. A página passa a ter cinco TopSections, nesta ordem: Vendas, Recebíveis e inadimplência, Perdas e prejuízos, Antecipações e Cartões de crédito. Vendas e Cartões entram só como casca, cada uma com versão própria depois. As outras três são redesenhadas sobre as fontes que já existem: a base de contas a receber com as fotos por carga, a DRE de caixa e o registro de antecipações. Nenhuma base nova.*

---

> ## ⛔ GATE 0 — Medição (M0)
> Um explorador lê o dado vivo e o código e responde às perguntas da §5. A M0 termina com um relatório e **PARA**. O relatório não leva nome de pessoa física; usa rótulos.

> ## ⛔ GATE 1 — Mockup do DS (M1)
> Mockup na rota real, com componentes de produção e fixture: a página inteira, os três placeholders, estados vazio e de erro por seção, largura estreita. **PARA** para o Yan. (Na v6.4.0 este gate foi dispensado; aqui ele volta, porque a versão é justamente sobre a forma.)

> ## ⛔ GATE 2 — Destrutiva, se houver (M5)
> Só existe se a M0 mostrar que uma RPC precisa mudar de tipo de retorno (§6). Escrita depois que o código que a referenciava saiu e foi deployado; fora de `supabase/migrations/` até a hora; TTY do Yan; backup-gate.

## 1. Decisões do Yan (firmes — embutir, não rediscutir)

**Página**

- Cinco TopSections, nesta ordem: **Vendas · Recebíveis e inadimplência · Perdas e prejuízos · Antecipações · Cartões de crédito**.
- **Vendas** e **Cartões de crédito**: TopSection criada, conteúdo vazio. Cada uma vira versão própria (Vendas provavelmente precisa de outro relatório; Cartões, de outras informações).
- Custos financeiros e Prazos médios já saíram (RPCs removidas por destrutiva anterior). Nada deles volta.

**Recebíveis e inadimplência** (estoque · "posição na carga de DD/MM", ignora as pills)

- Linha 1, três cards: **Recebíveis em aberto | Recebíveis vencidos | Inadimplência**.
- Linha 2: **Faixas de atraso | 10 maiores inadimplentes**.
- Linha 3: **Evolução do inadimplente, por semana**, com uma linha só (a do inadimplente).
- As faixas de atraso são **só sobre os títulos marcados como inadimplentes**.
- O Δ dos três cards é **contra a última foto da semana anterior**.
- Inadimplência continua sendo **a marcação** `Conferido = Inadimplente`.

**Perdas e prejuízos** (fluxo · pills de ano)

- Linha 1: **Prejuízo por pessoa | Prejuízo por setor**.
- Linha 2: **Prejuízo bruto por mês/ano**, no formato do gráfico "Despesas mensais" de Marketing (barras agrupadas por ano + painel "Total por ano").
- "Pessoa" = **o campo pessoa do lançamento no Monde**.
- **Por setor fica adiado:** o card existe, com o espaço reservado e conteúdo vazio, até haver fonte de setor.
- **Reversão e líquido saem da página.** Tudo é bruto.

**Antecipações** (fluxo · pills de ano, exceto o primeiro card)

- Linha 1, três cards: **Dias sem antecipação | Custo efetivo no ano | Custo percentual no ano**.
- Linha 2: **Volume antecipado por mês/ano** (mesmo formato do gráfico de Marketing).
- Linha 3: **Volume antecipado por conta | Comparativo (custo efetivo e percentual por conta)**.
- O que o Yan chamou de "bandeira" é a **conta** do registro (Asaas, Blimboo). Na tela, o rótulo é **"Conta"**: "bandeira" significa outra coisa (Visa, Mastercard) para quem lê finanças.
- Cards com vários anos selecionados: **uma linha por ano selecionado**, padrão do card de Marketing, com o ano corrente em destaque e Δ contra o mesmo período do ano anterior.
- O card "Dias sem antecipação" mostra, como linha secundária, o **maior intervalo do ano**.
- O registro (botão, painel, desfazer pelo diário) fica como está.

## 2. Especificação por seção

### 2.1 Recebíveis e inadimplência

| Componente | Definição | Conteúdo |
|---|---|---|
| Recebíveis em aberto | títulos a receber sem liquidação na posição (a vencer + vencidos), `Valor Final` | valor · nº de títulos · Δ |
| Recebíveis vencidos | em aberto com vencimento anterior à data da posição | valor · nº · "X% do em aberto" · Δ |
| Inadimplência | em aberto com `Conferido = Inadimplente` | valor · nº · "X% dos vencidos" · Δ |
| Faixas de atraso | sobre os inadimplentes; dias entre vencimento e data da posição: 1–30, 31–60, 61–90, 90+ | tabela simples: faixa · títulos · valor · % · total |
| 10 maiores inadimplentes | agregado por devedor (`Pessoa` aparada: espaço, `\xa0`, tab), não por título | tabela simples: posição · devedor · títulos · valor · % do inadimplente · maior atraso (dias); linha "demais N devedores"; total |
| Evolução do inadimplente | última foto de cada semana (segunda a domingo), valor inadimplente | série semanal; semana corrente marcada parcial; semana sem carga é **lacuna, nunca zero**; "histórico a partir de DD/MM"; vencido no tooltip |

### 2.2 Perdas e prejuízos

| Componente | Definição | Conteúdo |
|---|---|---|
| Prejuízo por pessoa | categorias de prejuízo da DRE de caixa (por `categoria_id`, como na v6.4.0), bruto, agregado pela pessoa do lançamento | tabela simples: pessoa · lançamentos · valor · % · "demais" · total; sem pessoa = "(sem pessoa)", visível |
| Prejuízo por setor | — | **placeholder** (ver §3) |
| Prejuízo bruto por mês/ano | o mesmo recorte, por mês | componente compartilhado do gráfico de Marketing; despesa negativa como na DRE; ano parcial com `*` |

### 2.3 Antecipações

| Componente | Definição | Conteúdo |
|---|---|---|
| Dias sem antecipação | dias entre a última antecipação registrada e hoje | dias · data da última · "maior intervalo do ano: N dias"; não depende das pills |
| Custo efetivo no ano | Σ desconto (antecipado − líquido), em R$ | uma linha por ano selecionado, Δ |
| Custo percentual no ano | Σ desconto ÷ Σ antecipado: **média ponderada pelo volume**, nunca média simples das taxas | uma linha por ano selecionado, Δ |
| Volume antecipado por mês/ano | Σ valor antecipado (bruto), por mês | componente compartilhado do gráfico de Marketing |
| Volume antecipado por conta | Σ antecipado por conta no recorte | tabela simples: conta · nº · volume · % · total |
| Comparativo por conta | custo em R$ e % por conta, com a **mesma fórmula** dos cards | tabela simples: conta × anos selecionados, padrão "bloco por ano" de Marketing |

O "?" do card de custo efetivo diz o que o número é (desconto sobre o valor antecipado), porque "custo efetivo" em finanças lembra CET, que envolve prazo, e o registro não tem prazo.

## 3. Placeholders e faixa do topo

- **Vendas, Cartões de crédito e o card "Prejuízo por setor"** usam o mesmo estado: título no lugar e uma linha discreta "em construção", no padrão da tela em construção que já existe em Performance. Nunca vazio total, que a diretoria leria como erro de carga.
- **Faixa de indicadores (proposta, confirmar no GATE 1):** três tiles, um por seção com conteúdo: Inadimplência (valor, Δ da semana), Prejuízos (bruto no ano corrente, Δ) e Antecipações (dias sem antecipação). Vendas e Cartões ganham tile quando forem preenchidas, nunca um tile vazio.

## 4. Invariantes (inegociáveis)

1. **Paridade com a DRE de caixa:** o prejuízo bruto por mês ≡ a soma das células de prejuízo de `get_dre_mensal`, ao centavo (o teste da v6.4.0 segue valendo, agora só no bruto).
2. **Completude por seção, ao centavo:**
   - Recebíveis: Σ das faixas ≡ total inadimplente; top 10 + "demais" ≡ total inadimplente.
   - Prejuízos: Σ por pessoa ≡ Σ da série ≡ total bruto da DRE no recorte.
   - Antecipações: Σ por conta ≡ Σ da série ≡ total do registro no recorte; custo % dos cards e do comparativo saem de **um único módulo puro**.
3. **Funil:** inadimplente ⊂ vencido ⊂ em aberto. Título marcado como inadimplente com vencimento futuro (a marcação é manual) **continua contando** na inadimplência e gera um aviso visível na seção, sem sumir nem forçar o funil.
4. **Nada some:** sem pessoa, sem devedor ou semana sem carga aparecem explicitamente, nunca descartados nem zerados.
5. **Gráfico compartilhado, não copiado.** Se o gráfico "Despesas mensais" está escrito dentro da página de Marketing, ele é extraído para um componente compartilhado (skill `graficos`) e as duas páginas o usam. **Marketing fica pixel-idêntica**: é a única mudança fora de `/financeiro/geral`, declarada e medida.
6. **Tabelas simples seguem o padrão da plataforma.** Antes de escrever as cinco tabelas, a implementação procura como as tabelas simples existentes estão formatadas ("Por fornecedor" em Marketing, as tabelas da v6.4.0, as linhas-chave da DRE) e segue o padrão. Se divergirem entre si, escolhe um, registra no design system (`design-system.md` e `/admin/design-system`) e reforça a skill `ui-design-system`. A divergência do backlog entra aqui: a skill `tabela-densa` proíbe caixa alta, mas a DRE e Marketing usam; decidir e alinhar skill e código.
7. **O registro de antecipações não muda:** tabela, RPCs de escrita, diário e desfazer intactos; os 38 registros históricos seguem batendo com o oráculo do inv. 7 da v6.4.0.
8. **Retenção das fotos:** a evolução semanal lê as fotos por título agregadas na RPC. Antes de qualquer limpeza futura do detalhe (decisão ainda pendente), o agregado semanal precisa estar persistido, senão a série some junto. Registrar no ADR e na skill `banco-e-rpc`.
9. **`app.exigir_acesso` não muda;** áreas e concessões (`financeiro/geral`, `financeiro/geral/gestao`) ficam como estão.
10. **RPCs novas ou com assinatura alterada nascem fora da allowlist do `verificador`;** grant deliberado, por assinatura, na mesma migration.
11. **Cada seção degrada sozinha** e mostra a própria data de carga ou de último registro.
12. **Zero mudança fora da página** além da extração do gráfico (inv. 5) e do design system (inv. 6). O diff é medido, não afirmado.

## 5. M0 — Perguntas que a medição responde

| # | Pergunta | Decide |
|---|---|---|
| Q1 | A primeira carga real de contas a receber já foi feita? Quantas fotos existem, em que datas, e quantas semanas a evolução já cobre? | o que a evolução mostra no primeiro dia |
| Q2 | Existe título marcado como inadimplente sem estar vencido? Quantos? | o aviso do inv. 3 |
| Q3 | No top 10, o mesmo devedor aparece com grafias diferentes depois de aparar os espaços? | nota na seção, se houver |
| Q4 | A fonte que a DRE usa para o prejuízo carrega a pessoa do lançamento? Com que preenchimento? Há variações de grafia? (O mesmo caminho que deu o "Por fornecedor" de Marketing.) | desenho da RPC de prejuízo por pessoa |
| Q5 | O tipo de retorno das RPCs atuais da página (TABLE, composto ou jsonb). Mudar o formato da resposta exige `DROP`? | se há destrutiva (GATE 2) ou se tudo é `CREATE OR REPLACE` / RPC nova |
| Q6 | Onde está o gráfico "Despesas mensais" de Marketing: componente próprio ou escrito na página? | o tamanho da extração (inv. 5) |
| Q7 | Inventário das tabelas simples da plataforma: onde estão, como estão formatadas, onde divergem. | o padrão do inv. 6 |

Relatório em `docs/auditoria/v6-5-0-m0-financeiro-geral-v2.md`, com evidência por pergunta. O explorador só lê.

## 6. Engenharia

- **RPCs:** preferir **RPC nova** quando o formato da resposta muda, e remover a antiga só na destrutiva do GATE 2, depois do deploy. Se a M0 mostrar que as atuais devolvem jsonb, `CREATE OR REPLACE` resolve e o GATE 2 não existe. Leitura pura, `exigir_acesso(['financeiro/geral'])`, schemas Zod + `parseRpc`.
- **Módulos puros com teste** em `src/lib/financeiro-geral/`: agregação semanal das fotos, faixas sobre os inadimplentes, top 10 por devedor, custo efetivo e percentual (fórmula única), dias sem antecipação e maior intervalo. Δ reusa `deltaYtd`; não reimplementar.
- **Componentes:** gráfico mensal/anual compartilhado (inv. 5); placeholder único reutilizado nas três cascas.
- **Pós-aplicação:** `database.ts` e baseline de schema regenerados no mesmo commit; teste de drift verde; verificação via REST (`db query` não executa corpo).

## 7. Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M0** | **GATE 0** — medição da §5, relatório, PARA. | toda resposta com evidência |
| **M1** | **GATE 1** — mockup DS na rota real com fixture; PARA. | revisão do Yan antes de qualquer migration |
| **M2** | Migration aditiva: RPCs das três seções, grants do `verificador`. `revisor-db` antes; ensaio em transação revertida; REST depois; `database.ts` + baseline. | paridade (inv. 1) e completudes (inv. 2) verdes contra o banco |
| **M3** | Front: extração do gráfico (Marketing pixel-idêntica), padrão de tabela simples + design system, as cinco TopSections na ordem, placeholders, faixa do topo, módulos puros com teste. | cada seção degrada sozinha; funil e lacunas em teste |
| **M4** | Contratos via REST com `SUPABASE_VERIFICADOR_KEY`: shapes, paridade, completudes, `anon` negado, sem área negado. | allowlist derivada bate com os grants |
| **M5** | **GATE 2** (só se houver): destrutiva das RPCs aposentadas, depois do deploy; TTY do Yan. | REST das removidas ⇒ 404; nada 500 |
| **M6** | Fechamento: versão; CHANGELOG; CHANGELOG_DIRETORIA (uma linha: "a página Geral do Financeiro ganha nova organização: recebíveis com evolução semanal da inadimplência, prejuízos por pessoa e custo das antecipações por conta"); emenda ao ADR-0183; skills tocadas; out-briefing com a M0, o mockup, os oráculos e prints; WORKING-CONTEXT. | — |

## 8. Gates

`tsc`+`lint` por missão; `build`+`test` após M2, após M4 e no fechamento. `revisor-db` na M2 (e na M5, se houver); `revisor` ao fim. `verificador-visual` na página e em Marketing (pixel-idêntica) se subir; senão, "entregar → Yan confere no preview → ajustar".

## 9. Checkpoint do Yan

- **(M0)** Ler o relatório, em especial Q1 (o que a evolução mostra no primeiro dia) e Q5 (se há destrutiva).
- **(M1)** Aprovar o mockup, incluindo a faixa de três tiles e o texto dos placeholders.
- **(M2)** Parecer do `revisor-db`.
- **(final)** Conferir o prejuízo bruto de um mês contra a DRE; os inadimplentes contra o filtro `Conferido = Inadimplente` no Monde; o custo % de um ano contra a conta à mão no registro; Marketing sem mudança visual; **mostrar à diretoria e anotar o que ela pede.**

## 10. Fronteira (fora desta versão)

Conteúdo de Vendas · conteúdo de Cartões de crédito · prejuízo por setor (depende de fonte de setor, provavelmente a base de centro de custo em avaliação) · reversão e líquido de prejuízos · bandeira do cartão nas antecipações · realce de antecipação no Fluxo de Caixa (v6.4.1, versão própria) · retenção das fotos por título (decisão pendente) · Contas a receber pela API v3 · qualquer mudança na DRE ou no registro de antecipações.

## 11. Skills a ler

`banco-e-rpc` · `contrato-rpc-front` · `ui-design-system` · `tabela-densa` · `graficos` · `react-padroes` · `orquestracao` (Carta, antes de despachar)

## 12. Commits sugeridos

1. `docs(v6-5-0): briefing da versao`
2. `docs(auditoria): medicao da m0 — financeiro geral v2` — **GATE 0**
3. `docs(v6-5-0): mockup da pagina geral v2` — **GATE 1**
4. `feat(db): rpcs de leitura da pagina geral v2 + grant do verificador`
5. `refactor(graficos): grafico mensal/anual compartilhado (marketing sem mudanca)`
6. `feat(ui): padrao de tabela simples no design system`
7. `feat(financeiro): pagina geral v2`
8. `test: contratos da pagina geral v2`
9. `chore(db): remove rpcs aposentadas da pagina geral — destrutiva` — **GATE 2**, só se houver
10. `chore(release): v6.5.0`
