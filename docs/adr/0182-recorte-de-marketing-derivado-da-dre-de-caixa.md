# ADR-0182 — Recorte de marketing derivado da árvore da DRE de caixa

**Status:** aceito (v6.3.0) · **Data:** 2026-10-08 ·
**Contexto:** versão v6.3.0, "Gastos de Marketing" (Rota A) ·
**Briefing:** `docs/briefings/briefing-v6-3-0-gastos-marketing.md` · **Medição:**
`docs/auditoria/v6-3-0-m0-marketing.md` · **Migration:** `0292` (aditiva, aplicada em 08/10/2026) ·
**Código:** `src/app/marketing/gastos/`, `src/components/marketing/gastos/`, `src/lib/marketing/`

> Numeração conferida contra `docs/adr/`, `supabase/migrations/` e as branches do remoto em 08/10/2026
> (últimos reais: ADR 0181, migration 0291).

## O problema

A gestão de marketing — o primeiro público do Janus fora do Financeiro — precisa acompanhar os gastos
**pagos** da área: por mês, por categoria, por fornecedor e lançamento a lançamento. A diretoria já vê
esse número numa linha da DRE de caixa, "(-) Despesas Marketing" (bloco `MKT`). Uma página nova que
definisse "marketing" por conta própria — lista de categorias no código, filtro pelo grupo de
categoria do Monde — produziria **dois números de marketing** que divergem na primeira vez que a
controladoria remapear uma categoria (como já aconteceu: Endomarketing, do grupo "Despesas Marketing"
do Monde, foi para RHB na 0251).

## A decisão

**Marketing é o bloco `MKT` da DRE de caixa, lido do mapa vivo.** As três RPCs da página
(`get_marketing_gastos_resumo|fornecedores|lancamentos(p_ano)`) usam **exatamente** o predicado do
Realizado de `get_dre_mensal` (0207):

```sql
FROM financeiro.fato_fluxo f
JOIN financeiro.dre_categoria_map m
  ON m.categoria_id = f.categoria_id AND NOT m.excluida AND m.bloco_chave = 'MKT'
WHERE f.tipo = 'realizado'        -- mês = mês de f.data_competencia (= data de movimentação)
```

Consequências que a decisão fixa:

1. **Por construção, o total da página é a linha MKT da DRE**, mês a mês, ao centavo. Não há lista de
   categorias de marketing em lugar nenhum; remapear uma categoria no editor da DRE a tira (ou põe) na
   página no mesmo instante. Provado: 34/34 células iguais (jan/2024–out/2026) na M0, no ensaio da 0292,
   via REST depois da aplicação e, de forma permanente, em `src/lib/rpc-contrato.test.ts`; a definição
   viva foi provada em transação revertida (mover "Licença de Software (MKT)" para ADM a tira da
   página e mantém a paridade; devolvê-la a traz de volta).
2. **"Pago" é `tipo = 'realizado'`, decidido na carga** (`regenerar_fluxo_caixa`), nunca recalculado
   por "data ≤ hoje" na consulta — senão a página divergiria da DRE entre duas cargas.
3. **Uma fonte, sem o raw.** `fato_fluxo` já carrega fornecedor (`pessoa`), descrição e nº do
   documento; o detalhe sai da mesma tabela que a DRE soma.
4. **Sinal da DRE.** O gasto é exibido **negativo**, como na DRE (decisão do Yan no GATE 0); um
   estorno, se houver, aparece positivo e reduz o gasto. Nenhuma inversão na exibição.
5. **Só o realizado.** A DRE troca realizado por previsto nos meses futuros do ano corrente; a página
   não (mês futuro = 0). A paridade é por mês já realizado.

## O que foi descartado

- **Lista de categorias de marketing no código / filtro por `grupo_categoria` do Monde.** Diverge da
  DRE na primeira remapeação; a M0 mostrou o caso concreto (Endomarketing em RHB, Feiras/Eventos em COM).
- **Derivar a página de `get_dre_mensal`.** Ela devolve baldes mensais por bloco/categoria, sem
  fornecedor nem lançamento.
- **Reusar `get_decomposicao_bloco` (0209).** Mesmo predicado, mas gated por `financeiro/dre` e sem o
  detalhe por lançamento; a gestora não herda nenhum acesso do Financeiro.

## Acesso

Área própria `marketing/gastos` (grupo "Marketing"), concedida na 0292 **explicitamente** a
Administrador, Financeiro e Máquina · verificação (exigência da suíte de contrato) — todas já tinham
`financeiro/dre`, então ninguém passou a ver mais do que via. A role e o usuário da gestora são criados
pelo editor de roles. As RPCs são `SECURITY DEFINER` com `app.exigir_acesso(['marketing/gastos'])`
inline; `anon` e `ingestor` sem EXECUTE; `verificador` com EXECUTE por assinatura (allowlist derivada
dos casos de contrato). A lista de colunas expostas é **fechada** (data, categoria, fornecedor,
descrição, nº do documento, valor): a conta bancária fica fora porque os cartões carregam o nome do
portador.

## Quando revisitar

- Se a gestora pedir uma visão que a DRE de caixa não tem (competência, "a pagar", orçado, setor): é
  outra fonte e outro ADR — esta decisão vale para o **pago**.
- Se a controladoria quiser que o recorte de marketing seja diferente do bloco MKT: a mudança é no
  mapa da DRE (e muda a DRE junto), nunca uma exceção na página.
