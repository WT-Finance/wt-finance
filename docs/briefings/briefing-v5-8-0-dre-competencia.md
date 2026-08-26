# JANUS · Briefing v5.8.0 — DRE por Competência (TopSection)

**MINOR** · migrations ADITIVAS (nenhuma destrutiva) · ADR novo · base main @ v5.7.1

*Nova TopSection "Regime de Competência" na página `/financeiro/dre`, abaixo de "Regime de Caixa". Fato gerador: data de EMISSÃO. Fonte: nova base de upload — o export "Demonstrativo de Resultado" do Monde, tratado pelo script R (`tratamento_demonstrativo_v1.R`), 8 colunas tidy. Estrutura PRÓPRIA (árvore separada da DRE de caixa), derivada do modelo da gerente e validada numericamente contra a base real: REX ≡ Total Geral do arquivo, ao centavo, nos três anos. Escopo desta versão é SÓ o Demonstrativo — cards, linhas-chave, mix e ponte ficam para versões seguintes.*

---

## 1. Decisões do Yan (firmes — embutir, não rediscutir)

- **TopSection, não rota:** "Regime de Competência" vive em `/financeiro/dre`, abaixo de "Regime de Caixa". Mesma permissão da página. Cada TopSection é autocontida.
- **Árvore PRÓPRIA:** a estrutura de competência NÃO compartilha `dre_bloco`/`dre_categoria_map`. Tabelas novas, espelhando o desenho das existentes. Motivo: as árvores divergem de verdade (competência não tem REPASSE nem IMOB; tem ONOP_H, LL, DL e REXG que o caixa não tem). Convergência futura é decisão futura.
- **Critério da gerente adotado no conteúdo** (validado: 135/138 categorias dela batem ao centavo com a base; deltas restantes são safra 20/08 × 25/08):
  - **Fusão por nome:** linhas homônimas de origens diferentes viram UMA linha exibida. São exatamente 3 fusões: `Comissão` (Receita de Vendas + Receitas da venda), `Reembolso Cliente` e `Reembolso Fornecedor` (Receitas da venda + Descontos da venda). O critério é econômico — comissão é comissão, independente de o Monde registrar como lançamento ou como campo da venda.
  - **REEMB (Reembolsos) é subgrupo da Receita Bruta:** Desconto, Reembolso Cliente, Reembolso Fornecedor. Passagem de dinheiro, não resultado.
  - **RESULTADO GERENCIAL (REXG) = REX − REEMB**, como **linha da tabela** (última, após REX). NÃO é card nem destaque nesta versão.
  - **Distribuição de Lucros entre RAIR e REX** (no modelo dela essa linha está com ordenação defeituosa — cat antes do sub; aqui entra correta, como subgrupo DL de linha única).
- **Rótulos seguem a regra da v5.7.0, não o modelo dela:** agregação carrega operador, folha NUNCA. As folhas dela com prefixo "(-)" (ex.: "(-) Adiantamento 13º Salário") entram SEM prefixo. Divergência deliberada; a guarda mecânica de rótulos se estende à árvore nova.
- **Leitura por VIEW, não fato+regenerar:** a base já chega agregada no grão da DRE (~3,2 mil linhas). `financeiro.vw_dre_competencia` = raw × de-para. Nada a materializar; zero deriva possível entre base e leitura.
- **Sem editor da árvore nesta versão:** curadoria da árvore/de-para por migration. Par novo sem mapa cai na bandeja visível (nunca some). Editor por regime é pendência registrada.
- **Sem toggle Realizado/Previsto, sem híbrido:** o regime competência tem uma coluna por mês. A seção renderiza o que a base traz (a janela é escolha do export).
- **Escopo mínimo deliberado:** FORA desta versão os cards de KPI, a tabela de linhas-chave, o mix de receita, a ponte competência↔caixa e o orçado. Ver §5.

## 2. Invariantes (inegociáveis)

- **Motor de caixa INTOCADO:** `get_dre_mensal`, `fato_fluxo`, `dre_bloco`, `dre_categoria_map`, o editor e a TopSection "Regime de Caixa" não mudam em nada. Falha na competência OMITE a seção nova; a página nunca cai.
- **Oráculo aritmético travado em teste:** para cada ano, REX ≡ soma de TODAS as linhas da base do ano, ao centavo. Valores da amostra atual: 2024 = 208.743,77 · 2025 = 439.628,52 · 2026 (jan–ago) = −79.434,67. E REXG = REX − REEMB (2024 = 1.323.690,77, idêntico ao modelo da gerente). Se o oráculo quebrar, é a estrutura que está errada — nunca ajustar o número.
- **Reconciliação de completude:** linhas classificadas + bandeja ("Não classificadas") = total da base. Nada some em silêncio.
- **Chave de leitura COMPOSTA:** o de-para chaveia em (grupo_arquivo, descricao_arquivo) — três nomes existem sob dois pais. A fusão acontece no destino (mesma `sub_chave` + mesmo `rotulo_linha`), nunca na chave.
- **Alarme de ingestão nasce com a base:** contagem de linhas e soma do arquivo × soma gravada, exibidos no card de upload e conferidos no commit. Lição da v5.5.2 aplicada na fundação, não retrofit.
- **Parser padrão da casa:** `normalizeHeader` + interseção de colunas, nunca mapa literal; `accept=".xlsx"` (o export real é xlsx); colunas obrigatórias validadas por presença: Tipo, Grupo, Descrição, Ano, Mês Nº, Valor (aceitar `Competência` como data OU derivá-la de Ano + Mês Nº — tolerar as duas formas); guarda de coerção de milhar ativa mesmo com valores numéricos.
- **Full-swap com aviso destrutivo:** truncar → inserir_lote → (view lê direto), preview antes do commit, padrão dos uploads existentes.
- **RPC no contrato de `get_dre_mensal`:** mesma forma de resposta, para reusar a tabela densa, pills de ano, Análise Vertical (AV = linha ÷ ROL, mesma regra da v5.7.0) e tela cheia sem adaptação. Permissão: a mesma da página. Verificação da RPC via REST (nunca `db query`).
- **Cabeçalho da seção obrigatório:** "fato gerador: data de emissão · base carregada em DD/MM/AAAA · cobertura AAAA–AAAA (até mês X)". As duas TopSections podem ter safras diferentes e o leitor precisa ver isso.
- **Conferência visual ao vivo obrigatória** (classe de defeito que os gates não pegam). Registrar que a conferência das v5.7.0/v5.7.1 segue pendente de sessão.

## 3. Missões

| Bloco | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1 — Base + upload** | Migration aditiva `raw.demonstrativo_competencia` (tipo, grupo, descricao, ano, mes, mes_num, competencia date, valor numeric; índices em ano/competencia/grupo+descricao). RPCs `truncar_/inserir_lote_/contar_demonstrativo_competencia` no padrão gated. Parser client-safe novo. Card "Demonstrativo de Resultado (Competência)" em `/admin/uploads` com preview, contagem, soma e aviso de full-swap. Amostra real validada: 3.244 linhas, 141 pares, soma 568.937,62. | upload da amostra sobe sem perda; contagem e soma batem com o diagnóstico do script R; re-upload substitui |
| **M2 — Árvore + de-para + leitura** | Migrations aditivas: `financeiro.dre_comp_bloco` (seed = anexo `anexo-v5-8-0-arvore-competencia.csv`, 27 linhas, fórmulas por CHAVE) e `financeiro.dre_comp_map` (seed = anexo `anexo-v5-8-0-depara-competencia.csv`, 141 pares → sub_chave + rotulo_linha; flag `excluida` existe mas nasce toda falsa). View `vw_dre_competencia`. RPC `get_dre_competencia_mensal(ano)` no contrato de `get_dre_mensal`, agregando por (sub_chave, rotulo_linha) e computando totalizadores pelas fórmulas por chave. Testes: oráculo REX≡soma-da-base por ano; REXG=REX−REEMB; as 3 fusões provadas pelos DOIS pares de origem; guarda de rótulos (estado vivo) estendida à árvore nova; caso de contrato via REST. | oráculo ao centavo nos 3 anos; 141 pares mapeados, bandeja = 0 na amostra; par inventado em teste cai na bandeja e a reconciliação continua fechando |
| **M3 — TopSection** | Nova TopSection "Regime de Competência" abaixo de "Regime de Caixa": tabela densa reusada (Consolidado + Mensal), pills de ano aditivas, colunas de AV, "Ver em tela cheia", bandeja "Não classificadas" visível quando não-vazia, cabeçalho com fato gerador + data de carga + cobertura. REXG como última linha, formato de totalizador. Fail-safe: erro na RPC omite a seção com aviso discreto. Nada da TopSection de caixa muda (diff visual disciplinado). | as duas seções coexistem; navegação de pills independente entre regimes; AV divide por ROL da competência; zero regressão na seção de caixa |
| **M4 — Fechamento** | v5.8.0; CHANGELOG; **CHANGELOG_DIRETORIA com peso de critério** (a página passa a mostrar DOIS resultados para o mesmo mês; linguagem de negócio: caixa = o que andou na conta, competência = o que foi reconhecido pela emissão; Resultado Gerencial explicado em uma frase); ADR novo (regime novo, árvore própria, fusão por nome, REEMB/REXG, view sem fato, rótulos v5.7.0 sobre o modelo da gerente); out-briefing com prints e a prova do oráculo. | — |

## 4. Parâmetros de sucesso e checkpoint do Yan

- **Oráculo:** REX de cada ano idêntico ao centavo à soma da base do ano (2024: 208.743,77 · 2025: 439.628,52 · 2026: −79.434,67 na amostra). REXG 2024 = 1.323.690,77.
- **Fusões:** `Comissão` exibe UMA linha somando os dois pares; idem `Reembolso Cliente` e `Reembolso Fornecedor`. Total de linhas exibidas na amostra: 138.
- **Nada some:** retirar um par do seed em teste faz a linha aparecer na bandeja e a reconciliação seguir fechando.
- **Convivência limpa:** seção de caixa pixel-idêntica ao antes; seção nova degrada sozinha em falha.
- Gates globais: tsc 0, testes somam, lint limpo, build limpo. Migrations aditivas com backup-gate e `--fora-de-ordem` se preciso; RPCs verificadas via REST.

**CHECKPOINT do Yan:** carregar o export real e conferir o Demonstrativo por Competência contra o arquivo do Monde (Total Geral por ano); conferir as 3 linhas fundidas contra o modelo da gerente; alternar pills de ano nos dois regimes e confirmar independência; conferir o cabeçalho de cobertura; conferir que a seção de caixa não mudou em nada.

## 5. Fronteira (fora desta versão, registrado)

- **Cards de KPI e tabela de linhas-chave da competência** — decisão adiada pelo Yan.
- **Mix de receita** (composição da RV) e **ponte competência↔caixa** — a ponte já tem especificação pronta no modelo da gerente (cascata de 15 linhas com causa nomeada); registrar como candidata natural à próxima versão.
- **Orçado** — o modelo da gerente carrega série orçamentária em 22 linhas ("base orçamentária v4"). Fica fora; o contrato da RPC não deve impedir colunas adicionais no futuro (a v5.7.0 já provou que a tabela cresce colunas).
- **Editor da árvore/de-para de competência** — curadoria por migration nesta versão.
- **Confirmar com a gerente:** `Reembolso Fornecedor - C` (em RV) × `Reembolso Fornecedor` (em REEMB) — tratamentos muito diferentes para nomes quase iguais; validar que é deliberado.
- **`PartnerShip - Cotas`** existe no plano dela e nunca apareceu na base — quando aparecer, a bandeja pega.
- Pendências herdadas que seguem: conferência visual v5.7.0/v5.7.1; CSV da DRE (aberta desde a v5.7.0 — avaliar se cobre também a competência quando entrar); destrutiva 0254.

## 6. Anexos

- `anexo-v5-8-0-arvore-competencia.csv` — 27 linhas: ordem, tipo (blocoH/sub/tot), chave, rótulo (regra de rótulos já aplicada), fórmula por chave.
- `anexo-v5-8-0-depara-competencia.csv` — 141 pares (grupo_arquivo, descricao_arquivo) → (sub_chave, rotulo_linha). 140 derivados do modelo da gerente + 1 fallback pelo grupo do arquivo (`Estacionamento Vaga Rotativa` → RHB). As 3 fusões estão explícitas.
- Amostra real: `Demonstrativo_por_Competencia_tratado.xlsx` (3.244 × 8, gerada por `tratamento_demonstrativo_v1.R`, 556 checksums internos conferidos no tratamento).

*Origem do critério: modelo da gerente (HTML, seção "DRE Competência", base 20/08/2026), validado contra o export de 25/08/2026. Regra do modelo: "competência = data de EMISSÃO".*
