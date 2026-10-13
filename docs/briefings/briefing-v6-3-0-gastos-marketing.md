# JANUS · Briefing v6.3.0 — Gastos de Marketing (seção nova)

**MINOR** · **Migration:** 1 aditiva (área RBAC, concessões, RPCs de leitura, grant na allowlist do `verificador`; numerar na hora — provável `0291`, conferir no banco e nas worktrees) · **ADR:** 1 novo — "Recorte de marketing derivado da árvore da DRE de caixa" (provável `0182`, conferir no remoto) · **Base:** `main` após a v6.2.2 · **Branch:** `feat/v6-3-0-gastos-marketing` · **Rota A**

*Seção nova "Marketing" na sidebar, com a página de detalhamento dos gastos de marketing **pagos**, para uso da gestora de marketing. Fonte: a base de Lançamentos por Categoria (movimentação) que já existe. O recorte de "marketing" não é definido aqui: é o bloco MKT da DRE de caixa, lido do mapeamento vivo. Por construção, o total da página é o mesmo número da linha de Marketing que a diretoria vê na DRE.*

---

> ## ⛔ GATE 0 — Medição antes do desenho (M0)
> Um explorador lê o dado vivo e responde às perguntas da §3 **antes** de qualquer mockup ou migration. A M0 termina com um relatório curto e **PARA**. O Yan decide os três pontos marcados "decidir na M0". Nada de desenho presumido sobre colunas que ninguém conferiu.

> ## ⛔ GATE 1 — Mockup do DS (M1)
> "Marketing" é seção nova na sidebar e a primeira tela de um público que não é do Financeiro. Mockup antes da migration (precedente: v5.6.0, Gestão de Pessoas). Ele mostra a integração com a navegação existente, o tema neutro Group e a página inteira.

## 1. Decisões do Yan (firmes — embutir, não rediscutir)

- **Só o realizado (pago).** Fato gerador = data de movimentação (o mesmo critério do "Realizado" da DRE de caixa). Ficam fora o "a pagar" (em aberto) e a competência.
- **Definição de marketing = categorias mapeadas ao bloco MKT no `dre_categoria_map` vivo.** Não existe lista de categorias de marketing em código, nem filtro pelo grupo de categoria do Monde. Quando alguém remapeia uma categoria no editor da DRE de caixa, ela entra ou sai da página no mesmo instante. A página e a DRE nunca divergem.
- **Seção nova "Marketing" na sidebar**, com área de permissão própria. A gestora não herda nenhum acesso do Financeiro.

## 2. Invariantes (inegociáveis)

1. **Oráculo de paridade com a DRE de caixa.** Para todo ano e mês da base, o total da página ≡ a célula de Marketing (bloco MKT, Realizado) de `get_dre_mensal`, ao centavo, com a convenção de sinal da §4 aplicada. O teste de contrato roda via REST. Se o oráculo quebrar, quem está errada é a página, nunca o número da DRE.
2. **Uma fonte, nenhuma re-derivação do filtro.** A RPC da página lê da **mesma** fonte e pelo **mesmo** mapeamento que `get_dre_mensal` usa para o Realizado. Se essa fonte não carregar o detalhe do lançamento (fornecedor, descrição), o detalhe vem do raw por **chave de lançamento**. O critério de pertencimento ao MKT nunca é reimplementado. A M0 mede qual dos dois casos vale.
3. **Prova de que a definição é viva.** Em transação revertida, remapear uma categoria para fora do MKT a tira da página, e trazê-la de volta a devolve, com a paridade (invariante 1) fechando nos dois estados.
4. **Completude interna.** Σ lançamentos do detalhe ≡ Σ por categoria ≡ Σ por fornecedor ≡ total do período. Lançamento sem fornecedor aparece como "(sem fornecedor)", visível, nunca some.
5. **Zero mudança fora da seção nova.** `get_dre_mensal`, `dre_categoria_map`, o editor da DRE e as telas existentes ficam intocados. O diff é medido, não afirmado.
6. **`app.exigir_acesso` não muda.** Se precisar mudar, PARE e volte ao Chat.
7. **A área nova não amplia o acesso de ninguém** além das concessões declaradas na migration.
8. **Quem tem só `marketing/gastos` entra direto na página.** Hoje `rotaInicial` não tem entrada para quem tem só áreas de Solicitações (pendência da v6.1.1); a gestora não pode cair no mesmo buraco. Caso de teste com usuário só-Marketing.
9. **A RPC nova nasce fora da allowlist do `verificador`, de propósito.** O grant é deliberado, na mesma migration, por assinatura, e o caso de contrato prova o 200 com `SUPABASE_VERIFICADOR_KEY`.
10. **Os padrões de leitura da v6.0.0:** mês corrente marcado "· parcial"; carimbo "base carregada em DD/MM/AAAA"; cobertura derivada do dado (min/max), nunca do nome do arquivo.

## 3. M0 — Perguntas que a medição responde

| # | Pergunta | Por que importa |
|---|---|---|
| Q1 | Qual fonte o Realizado de `get_dre_mensal` lê para o bloco MKT, e ela carrega o detalhe por lançamento (fornecedor, descrição, nº)? | decide o desenho da RPC (invariante 2) |
| Q2 | Quais categorias caem hoje em MKT no `dre_categoria_map`, com contagem e soma por ano? Alguma categoria excluída (`excluida`) ou ambígua? | é o universo da página; o Yan confere se faz sentido para a gestora |
| Q3 | O lançamento carrega setor (Trips/Weddings/Corporativo), centro de custo ou operação? Com que preenchimento? | **decidir na M0:** filtro de setor entra ou não |
| Q4 | Qualidade do fornecedor/pessoa nos lançamentos de MKT: vazios, variações do mesmo nome, pessoa física? | ranking por fornecedor só vale se o nome agrupar |
| Q5 | Existem valores com sinal invertido (estornos, devoluções) dentro do MKT? Quantos e de que tamanho? | **decidir na M0:** convenção de sinal (§4) |
| Q6 | Volume de lançamentos de MKT por ano. | paginação no servidor ou não |
| Q7 | Quais colunas do raw existem e quais têm algo que a gestora não deveria ver (conta bancária, observações internas)? | **decidir na M0:** lista FECHADA de colunas expostas |

Relatório em `docs/auditoria/v6-3-0-m0-marketing.md`, com evidência por pergunta (query e resultado). Explorador só lê.

## 4. A página

**Rota proposta:** `/marketing/gastos`, com seção "Marketing" na sidebar e subaba "Gastos". O href-pai `/marketing` é prefixo da subaba (regra do `nav-model.test.ts`). A seção já nasce pronta para receber outras páginas de marketing no futuro. A rota final é confirmada no GATE 1.

**Convenção de sinal (recomendação, confirmar na M0):** o gasto é exibido **positivo** (= −valor da base), e o estorno aparece como linha negativa, reduzindo o total. A regra é declarada no cabeçalho da página e no ADR. Só o rótulo e o sinal da exibição mudam; o número é o mesmo da DRE.

**Filtro global:** pills de ano (padrão da DRE) + intervalo de meses. Todos os componentes respeitam o mesmo recorte, declarado nos subtítulos.

| Componente | Conteúdo |
|---|---|
| **A · Cabeçalho** | título; "pago · data de movimentação"; base carregada em DD/MM/AAAA; cobertura; nota curta: "mesmo número da linha Marketing da DRE de caixa" |
| **B · Indicadores** | gasto no período; mesmo período do ano anterior + Δ% (travessão quando a base é < 0,005, regra da v5.7.0); mês corrente (marcado parcial) |
| **C · Série mensal** | barras do ano selecionado × linha do ano anterior (skill `graficos`, tokens de gráfico) |
| **D · Por categoria** | tabela densa reusada (categoria × mês + total + % do total de marketing). Denominador único na página: o total de marketing do recorte |
| **E · Por fornecedor** | ranking do período com valor, % e nº de lançamentos; clique filtra o detalhe |
| **F · Lançamentos** | tabela com data, categoria, fornecedor, descrição, valor (colunas = lista fechada da Q7); filtros por categoria, fornecedor e busca na descrição; ordenação; **Exportar** (xlsx, mesmo recorte da tela) |

Cada componente degrada sozinho: erro numa RPC omite o card com um aviso discreto, e a página nunca cai.

## 5. Engenharia

- **RPCs** (nomes finais na M2): uma de resumo (mensal por categoria e por fornecedor, por ano) e uma de lançamentos (filtros + paginação no servidor se a Q6 pedir). Ambas `exigir_acesso(['marketing/gastos'])` e leitura pura. Schemas Zod + `parseRpc` (skill `contrato-rpc-front`).
- **Módulos puros com teste** em `src/lib/marketing/` para indicadores, Δ% e montagem do export. AV e Δ% reusam o que já existe (`av.ts`), não se reimplementam.
- **Área e concessões na migration:** área `marketing/gastos` (seção Marketing), concedida a **Administrador** e **Financeiro**. A role e o usuário da gestora são criados pelo editor de roles (ato do Yan, fora da migration).
- **Pós-aplicação:** `database.ts` e o baseline de schema regenerados no mesmo commit; o teste de drift fica verde; verificação via REST (`db query` não executa corpo).

## 6. Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M0** | **GATE 0** — medição da §3, relatório, PARA. | toda resposta com query e resultado |
| **M1** | **GATE 1** — mockup DS: sidebar com a seção nova, página inteira, estado vazio, estado de erro de card, largura estreita. PARA. | revisão do Yan antes de qualquer migration |
| **M2** | Migration aditiva: área, concessões, RPCs, grant na allowlist do `verificador`. `revisor-db` **antes** de aplicar; ensaio em transação revertida; REST depois; `database.ts` + baseline. | oráculo de paridade (inv. 1) e prova da definição viva (inv. 3) verdes contra o banco |
| **M3** | Front: `nav-model` (seção + subaba), `rotaInicial` para só-Marketing, página com os componentes A–F, módulos puros com teste. | usuário só-Marketing entra direto na página e não vê nada do Financeiro; completude (inv. 4) em teste |
| **M4** | Exportar + casos de contrato via REST (com `SUPABASE_VERIFICADOR_KEY`) + negação a `anon` + negação a usuário sem a área. | xlsx ≡ a tela no mesmo recorte |
| **M5** | Fechamento: v6.3.0; CHANGELOG; CHANGELOG_DIRETORIA (uma linha: "a gestão de marketing passa a acompanhar no Janus os gastos pagos da área, com o mesmo número da DRE"); ADR; out-briefing com o relatório da M0, o oráculo e prints; WORKING-CONTEXT. | — |

## 7. Gates

`tsc`+`lint` por missão; `build`+`test` após M2, após M4 e no fechamento. `revisor-db` na M2; `revisor` ao fim. `verificador-visual` na página e na sidebar se subir; senão, o modelo "entregar → Yan confere no preview → ajustar".

## 8. Checkpoint do Yan

- **(M0)** Decidir o filtro de setor (Q3), a convenção de sinal (Q5) e as colunas expostas (Q7). Conferir a lista de categorias do MKT (Q2) com o olho de quem vai usar.
- **(M1)** Aprovar o mockup.
- **(M2)** Ler o parecer do `revisor-db`.
- **(final)** Criar a role e o usuário da gestora pelo editor. Conferir um mês da página contra a linha de Marketing da DRE de caixa. Abrir com usuário só-Marketing. **Mostrar à gestora e anotar o que ela pede**: é o insumo da próxima versão da seção.

## 9. Fronteira (fora desta versão)

"A pagar" (títulos em aberto) · visão por competência · orçado de marketing (não há base) · filtro por setor, se a Q3 mostrar que o dado não sustenta · campanhas, ROI ou integração com plataformas de anúncio · edição do mapeamento pela gestora (o editor da DRE segue do Financeiro) · qualquer mudança na DRE de caixa.

## 10. Skills a ler

`banco-e-rpc` · `contrato-rpc-front` · `ui-design-system` · `tabela-densa` · `graficos` · `react-padroes` · `orquestracao` (Carta, antes de despachar)

## 11. Commits sugeridos

1. `docs(v6-3-0): briefing da versao`
2. `docs(auditoria): medicao da m0 — lancamentos de marketing` — **GATE 0**
3. `docs(v6-3-0): mockup da secao marketing` — **GATE 1**
4. `feat(db): area marketing/gastos + rpcs de leitura + grant do verificador`
5. `feat(marketing): secao na sidebar e pagina de gastos`
6. `feat(marketing): exportar + casos de contrato`
7. `chore(release): v6.3.0`
