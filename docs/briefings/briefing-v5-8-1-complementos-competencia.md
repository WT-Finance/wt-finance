# JANUS · Briefing v5.8.1 — Complementos da DRE por Competência

**PATCH** · **ZERO migrations** · base: main após o merge da v5.8.0 · testes novos obrigatórios

*Três componentes novos na TopSection "Regime de Competência", todos computados no cliente a partir dos DOIS payloads que a página já busca (`get_dre_competencia_mensal` + `get_dre_mensal`). Nenhuma base nova, nenhuma RPC nova, nenhum toque no banco. O critério vem do modelo da gerente (mesma fonte da v5.8.0), com as adaptações nomeadas abaixo. Origem: §5 da fronteira da v5.8.0 — orçado e mix de receita SEGUEM FORA.*

---

## 1. Decisões (firmes)

- **Layout da seção:** Linhas-chave (sumário executivo) ACIMA do Demonstrativo; abaixo dele, "Decomposição da variação" e "Ponte Competência ↔ Caixa" lado a lado (grid 2 colunas, empilha no mobile). Mesma ordem conceitual da seção de caixa (resumo → tabela → variações).
- **Janela YTD única:** jan → último mês coberto pela base de competência no ano corrente (o `mReal` que o as-built já deriva da cobertura). TODOS os três componentes usam essa janela, declarada nos subtítulos. O lado caixa da ponte usa a MESMA janela de meses (realizado por movimentação), nunca "até hoje" de um lado e "até o mês" do outro.
- **AV com a base da casa:** os percentuais das linhas-chave usam a base de AV vigente na página (**Receita Bruta, `RB_H`** — v5.7.2). Nunca dois denominadores na mesma página. Divergência deliberada do modelo da gerente (que usava %ROL).
- **Sem coluna de orçado** nas linhas-chave (o modelo da gerente tem "Orç YTD"; a plataforma não tem base orçamentária — fica na fronteira).
- **Nome do card de variação:** "**Decomposição da variação · YTD 26 × YTD 25**". O modelo da gerente chama de "Decomposição do desvio · previsto (= 2025 YTD)"; "desvio"/"previsto" sugerem um orçado que a plataforma não tem. Renomear é honestidade de rótulo — o conteúdo é idêntico. *(Se o Yan preferir manter o nome dela, é troca de string no checkpoint.)*
- **Fail-safe por card:** cada componente degrada sozinho. A ponte exige os dois payloads — sem o do caixa, o card não renderiza (aviso discreto); a seção nunca cai.
- **Threshold de agrupamento:** degraus/barras com |Δ| < R$ 500 vão para "Outros ajustes" (constante nomeada, mesma nas duas cascatas).

## 2. Componente A — Linhas-chave (sumário executivo)

Tabela compacta, uma linha por chave da árvore: **RB_H, ROL, LB, LOP, LL, RAIR, REX, REXG** (nessa ordem; rótulos vindos do `dre_comp_bloco` vivo, nunca hardcoded).

Colunas: `Linha | 2024 | 2025 | YTD 25 | YTD 26 | Δ% 26×25 | AV% 25 | AV% 26`

- Δ% = YTD26/YTD25 − 1; travessão quando |YTD25| < 0,005 (regra de base ≤ 0 da v5.7.0 vale aqui).
- AV% = linha ÷ RB_H do MESMO recorte (YTD25 com RB_H YTD25 etc.), sinal algébrico, 1 casa — reusar o módulo `av.ts` existente, não reimplementar.
- Totalizadores em peso forte; REXG com o rótulo completo da árvore.
- Anos cheios (2024/2025) vêm do payload como estão; se a cobertura de um ano for parcial, o cabeçalho da coluna diz (ex.: "2026 · até ago").

**Teste:** valores da tabela ≡ soma dos meses do payload (mesma fonte da tabela densa — nenhuma re-agregação própria); Δ% e AV com casos de borda (base zero, sinal negativo) cravados.

## 3. Componente B — Decomposição da variação (cascata)

Cascata âncora-a-âncora: **REX YTD25 → degraus por grupo → REX YTD26.**

- Um degrau por SUB da árvore de competência (RV, REEMB, IMP_H, CUSTO, ADM, COM, MKT, ESTR, RH, RHB, FIN, RNOP, DNOP, INV, DL), com Δ = YTD26 − YTD25 do grupo; |Δ| < 500 → "Outros ajustes".
- **Narrativa por degrau:** a categoria do grupo com maior |Δ| — "puxado por {categoria} ({±valor})". DL: narrativa fixa "decisão societária".
- **Residual obrigatório:** "Outros ajustes" fecha a identidade. **Teste de aditividade exata pré-arredondamento:** âncora inicial + Σ degraus ≡ âncora final, ao centavo — e a divergência de exibição (arredondamento) CRAVADA em teste, como a AV da v5.7.0.
- Ordenação por |Δ| decrescente. Cores: âncoras neutras, melhora/piora pelos tokens de gráfico (ADR-0090).
- Grupos são lidos da árvore VIVA (a lista acima é a atual; se a árvore mudar, o componente acompanha).

## 4. Componente C — Ponte Competência ↔ Caixa (cascata)

**O instrumento que responde "por que os dois regimes mostram números diferentes".**

Cascata: **Resultado competência (YTD, emissão) → 15 degraus → Resultado caixa (YTD, movimentação realizada).** Âncora final anotada com "Δ capital de giro: {±valor}".

- **Vocabulário e pareamento no anexo** `anexo-v5-8-1-ponte-vocabulario.csv`: 12 grupos pareados + 2 linhas exclusivas de regime ("Repasse — só existe no caixa"; "Reembolsos — só na competência") + residual "Outros ajustes". O lado competência é definido por chaves do `dre_comp_bloco`; o lado caixa está descrito por conceito — **o Code resolve as chaves vivas do struct de caixa no repo** (lição: simular contra o dado vivo, nunca presumir).
- **Sinal:** degrau = caixa − competência por balde, de modo que `REX_comp + Σ degraus = REX_caixa`.
- **Narrativa gerada por (natureza, sinal)** — não é texto fixo por linha:
  - despesa, Δ<0 → "pago além do incorrido no período"; Δ>0 → "incorrido ainda não pago"
  - receita, Δ>0 → "recebido além do reconhecido"; Δ<0 → "reconhecido ainda não recebido"
  - linhas especiais têm nota fixa (no anexo). Para RV, Δ>0 usa "recebido > emitido: conversão de backlog".
- **Invariante de TOTALIDADE (o teste que importa):** toda folha dos DOIS payloads é atribuída a exatamente UM degrau; o residual pega o resto (inclui DL e o que não parear). Teste: Σ degraus ≡ REX_caixa − REX_comp ao centavo, e nenhum balde vazio dos dois lados simultaneamente fora do residual.
- **Duas datas-base no card:** "competência carregada em X · caixa carregado em Y". As bases têm safras independentes e o leitor precisa ver isso (é a resposta curta para metade das perguntas que virão).
- Threshold |Δ| < 500 → residual, para a cascata não virar escadinha de centavos.

## 5. Engenharia

- **Módulos puros com teste** (padrão `av.ts`): `decomposicao-variacao.ts` e `ponte-regimes.ts` em `src/lib/dre/`, recebendo os dois payloads tipados e devolvendo as sequências prontas para o componente de cascata. As linhas-chave saem de seleção direta do payload (sem módulo próprio se ficar trivial).
- **Um componente de cascata reutilizado pelos dois cards** (Recharts, skill `graficos`; tooltips com a narrativa).
- Zero mudança em RPC, schema, banco. Zero mudança na seção de caixa (o padrão da v5.8.0: diff medido, não afirmado).
- ADR: conceito novo (conciliação entre regimes) — ADR próprio curto, **numeração conferida no REMOTO** (v5.9.0 em voo já tomou 0169; a lição está no out-briefing da v5.8.0).
- Gates + conferência visual: a pendência de sessão continua; entregar → Yan confere no ar → ajustar (modelo v5.4.1).

## 6. Parâmetros de sucesso e checkpoint do Yan

- Aditividade das DUAS cascatas ao centavo (pré-arredondamento), travada em teste.
- Totalidade da ponte provada (injetar par não-pareado em teste → cai no residual, identidade se mantém).
- Linhas-chave idênticas às células correspondentes da tabela densa (mesma fonte, mesmos números).
- **Checkpoint:** conferir a ponte contra a do modelo da gerente (mesma anatomia; números diferem por safra e por janela); conferir narrativas por sinal; decidir se mantém o nome "Decomposição da variação" ou volta ao "desvio" dela; conferir que caixa não mudou.

## 7. Fronteira (segue fora)

Mix de receita · orçado (coluna "Orç YTD" e o card de desvio contra orçado de verdade) · cards de KPI no topo da seção (os 4 do modelo dela: ROL/LB/REX/REXG — avaliar depois das linhas-chave no ar) · CSV da DRE (pendência antiga, agora cobrindo dois regimes quando entrar) · pendências do checkpoint v5.8.0 que ainda estiverem abertas.

## 8. Anexo

- `anexo-v5-8-1-ponte-vocabulario.csv` — 15 linhas: rótulo, lado competência (chaves), lado caixa (conceito a resolver no repo), natureza (para a narrativa por sinal), nota fixa das linhas especiais.

*Referência de validação (modelo da gerente, safra 20/08): rexC −15.989,95 + Σ 15 degraus = rexF 8.343,10, dif +24.333,05 — a identidade fecha ao centavo lá; tem de fechar aqui com os dados vivos.*
