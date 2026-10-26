# v6.5.0 · M0 — Medição para a Financeiro · Geral v2

**Data:** 26/10/2026 · **Branch:** `feat/v6-5-0-financeiro-geral-v2` · **Banco:** produção (0300), só leitura via
`npx supabase db query --linked` · **Briefing:** `docs/briefings/briefing-v6-5-0-financeiro-geral-v2.md` §5

Nenhum nome de pessoa neste relatório. Devedores e pessoas aparecem só como contagens.

---

## 0. Divergência do briefing que mudou o escopo (resolvida com o Yan em 26/10)

O §1 do briefing diz que *"Custos financeiros e Prazos médios já saíram (RPCs removidas por destrutiva anterior)"*.
**Isso não se confirma.** Nenhuma migration derruba esses objetos; os `DROP` da 0297:89–98 são só a nota de DOWN. No
catálogo vivo continuam existindo:

| Objeto | Retorno | `verificador` | Quem usa |
|---|---|---|---|
| `public.get_geral_custos_financeiros(p_ano int)` | `json` | EXECUTE | `src/app/financeiro/geral/page.tsx:73` |
| `public.get_geral_prazos()` | `json` | EXECUTE | `page.tsx:76` |
| `public.registrar_foto_prazos(p_carga_id uuid)` | `jsonb` | — | **ingestão**: `src/lib/ingestao/carga.ts:~1405` via `foto-prazos.ts`, a cada carga do Aberto |
| `financeiro.geral_prazo_calcular()` | `TABLE(...)` | — | `registrar_foto_prazos` |
| `financeiro.geral_prazo_foto` | tabela | — | **3 fotos**, de 15/10 a 26/10/2026 |
| `financeiro.geral_fin_grupo` | tabela (seed, 11 linhas) | — | **só** `get_geral_custos_financeiros` (0297:466) |

**Decisão do Yan (26/10): remover tudo, inclusive a série de prazos.** A M3 tira as seções, os módulos
(`custos.ts`, `prazos.ts`, `foto-prazos.ts`), os schemas, os testes e a chamada na ingestão. A destrutiva do GATE 2
derruba as 4 funções e as 2 tabelas acima, mais as 3 RPCs de leitura substituídas. `geral_prazo_foto` é exportada
antes do DROP. A ordem é obrigatória: a destrutiva só roda **depois do deploy**, porque até lá a ingestão em produção
chama `registrar_foto_prazos`.

Consulta (catálogo):

```sql
SELECT n.nspname||'.'||p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid),
       p.prosrc ILIKE '%geral_fin_grupo%', has_function_privilege('verificador', p.oid, 'EXECUTE')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname LIKE 'get_geral_%' OR p.proname IN ('registrar_foto_prazos','geral_prazo_calcular')
   OR p.prosrc ILIKE '%geral_fin_grupo%' OR p.prosrc ILIKE '%geral_prazo_foto%';
```

Nenhuma outra função referencia `geral_fin_grupo` nem a cadeia de prazos.

---

## Q1 — Contas a receber: quantas fotos e quantas semanas

**Uma foto**, a primeira carga real, feita pelo card:

| data_posicao | títulos | em aberto (n) | inadimplente (n) | inadimplente (R$) | linhas de detalhe |
|---|---:|---:|---:|---:|---:|
| 15/10/2026 | 38.957 | 4.830 | 21 | 199.767,74 | 4.831 |

O resultado bate com o esperado do WORKING-CONTEXT (21 / R$ 199.767,74).

**Consequências para o primeiro dia:**
- A evolução semanal tem **um ponto** (semana de 12 a 18/10). Depois dele, até a próxima carga, a série mostra
  **lacuna, nunca zero**. A legenda diz "histórico a partir de 15/10".
- O Δ dos três cards (contra a última foto da semana anterior) **ainda não tem base**. O estado "sem semana
  anterior" é o normal hoje e precisa estar no mockup.
- `contas_receber_foto_carga` guarda só contagens, `a_vencer_*` e `inadimplente_*`; **não guarda o valor em aberto
  nem o vencido**. Para eles, e para o "vencido no tooltip" da evolução, a RPC agrega o detalhe por título de
  `contas_receber_foto` (que tem `vencimento`, `liquidacao`, `valor_final` e `conferido` por carga). Isso amarra a
  série à retenção do detalhe (inv. 8).

## Q2 — Inadimplente ainda não vencido

**Zero hoje.** Funil na foto de 15/10, com vencido = `vencimento < data_posicao` e `liquidacao IS NULL`:

| | títulos | R$ |
|---|---:|---:|
| Em aberto | 4.830 | 12.146.832,84 |
| Vencidos | 182 | 1.029.384,12 |
| Inadimplentes (abertos) | 21 | 199.767,74 |
| Inadimplente com vencimento ≥ posição | **0** | — |

- O funil fecha: os 21 inadimplentes estão todos vencidos.
- Há **um 22º título marcado `Inadimplente` já liquidado**. Ele fica fora, porque a definição é "em aberto com a
  marcação", e o 21 do esperado confirma isso.
- `conferido` assume 4 valores na foto: vazio (4.589), `Pendente` (138), `Sim` (82) e `Inadimplente` (22).
- Proposta para o inv. 3: o aviso e uma **faixa "a vencer"** aparecem só quando houver caso. Assim Σ faixas ≡ total
  continua valendo por construção, e hoje nenhum dos dois aparece.

## Q3 — Grafias de devedor no top 10

**Nenhuma variação.** Os 21 títulos inadimplentes são de **18 devedores**, e a contagem distinta dá 18 em todas as
formas: crua, `btrim` simples, aparada (espaço, tab, CR/LF, `chr(160)`) e normalizada (minúsculas e espaços
colapsados). Nenhum devedor tem espaço estranho nem está vazio.

- Top 10 + "demais **8** devedores".
- **Não precisa de nota na seção.**
- A RPC nova usa o mesmo aparo de Marketing (`NULLIF(btrim(pessoa, E' \t\r\n'||chr(160)),'')`, 0292:206), não o
  `btrim` simples da 0297.
- `pessoa` existe só em `raw.contas_receber` (carga atual), não nas fotos. O top 10 é sempre o da posição mais
  recente, coerente com "posição na carga de DD/MM".

## Q4 — Pessoa do lançamento de prejuízo

A fonte é `financeiro.fato_fluxo`, com `pessoa TEXT` (0187:40). É o mesmo recorte de `get_geral_prejuizos`:
`geral_perda_map` (papel `prejuizo`) + `dre_categoria_map` não excluída + `tipo='realizado'`, por `data_competencia`.

| Ano | Lançamentos | Prejuízo bruto (R$) | Pessoas | Sem pessoa | Top 10 (% do ano) | Maior pessoa (%) |
|---|---:|---:|---:|---:|---:|---:|
| 2024 | 48 | −77.892,96 | 32 | 0 | 85,8 | 30,3 |
| 2025 | 56 | −175.808,35 | 31 | 0 | 83,8 | 36,7 |
| 2026 | 123 | −224.574,79 | 50 | 0 | 78,5 | 24,8 |

- **Preenchimento de 100%**, e as quatro formas de contagem distinta coincidem (sem variação de grafia).
- Uma única categoria carrega todo o prejuízo.
- "(sem pessoa)" continua previsto (inv. 4), mas hoje não aparece.
- O formato "top N + demais + total" se justifica: 50 pessoas em 2026, com o top 10 em ~80%.
- A reversão (papel `reversao`: R$ 7,3 mil, 39,8 mil e 81,1 mil) sai da página, por decisão do briefing.

## Q5 — Tipo de retorno das RPCs da página

As **5 RPCs de leitura devolvem `json`** (catálogo vivo, tabela da §0). O shape muda com `CREATE OR REPLACE`, sem
`DROP`. **Mesmo assim, a recomendação é RPC nova** (briefing §6): trocar o shape de uma RPC viva quebra o front em
produção entre a aplicação da migration e o deploy, porque o Zod de hoje recusa o shape novo. As três antigas
(`get_geral_recebiveis`, `get_geral_prejuizos`, `get_geral_antecipacoes`) caem no GATE 2, que já existe por causa da
§0.

## Q6 — O gráfico "Despesas mensais" de Marketing

- Componente próprio: `src/components/marketing/gastos/serie-mensal.tsx` (249 linhas). O painel "Total por ano" está
  **dentro** dele (:213–242).
- **Já existe uma cópia** em `src/components/financeiro/geral/grafico-mensal.tsx` (101 linhas). Ela importa as cores e
  o período de Marketing, mas reimplementa o gráfico.
- **A cópia já derivou.** O eixo invertido da v6.4.2 está em `serie-mensal.tsx:60,176,218`
  (`ChartYAxisBRL({ invertido: true })`) e não está na cópia da Geral. É o que o inv. 5 quer impedir.
- **Tamanho da extração:** mover `serie-mensal.tsx` para um componente compartilhado parametrizado (série, rótulo,
  `invertido`) e trocar as duas páginas para ele.
  - O prejuízo é negativo e usa `invertido` como Marketing.
  - O volume antecipado é **positivo** e não inverte, então o parâmetro é necessário.
  - Marketing continua chamando com os mesmos parâmetros (pixel-idêntica).

## Q7 — Tabelas simples: inventário e divergência

Há três padrões de cabeçalho em produção:

| Padrão | Onde | Cabeçalho |
|---|---|---|
| **A — o da skill** | `CARD_TABELA_TH` (`src/components/shared/card-tabela.tsx:35`), usado pela Geral v6.4.0 (`comum.tsx:15-16`) e por `painel-antecipacoes.tsx` | `text-2xs font-medium text-[var(--text-muted)]`, caixa normal |
| B | Marketing: `gastos/tabela-estilos.ts:23` (`TH`), em "Por categoria" e "Por fornecedor" | `text-[10px] font-semibold uppercase tracking-[0.09em]` |
| C | DRE: `financeiro/dre/tabela-dre.tsx`, `resumo-executivo.tsx` | `uppercase` + `font-semibold` |

A skill `tabela-densa` (`SKILL.md:38-39`) diz: *"Caixa normal — NUNCA `uppercase`/`tracking-wide`. Peso
`font-medium`."* Quem diverge são Marketing e a DRE, não a Geral. O briefing (inv. 6) dava a entender o contrário.

Fora de tabela, `comum.tsx:45` (`CLASSE_ROTULO`) usa `uppercase` em **rótulo de card**, o que é outro elemento.

**Recomendação para o GATE 1:**
- As cinco tabelas novas seguem o **padrão A**, sem mudar a skill.
- O padrão A é registrado no `design-system.md` e em `/admin/design-system` como "tabela simples".
- Marketing (B) e DRE (C) ficam como estão nesta versão, porque alinhá-las quebraria "Marketing pixel-idêntica" e o
  inv. 12. A divergência fica registrada no backlog como exceção conhecida.
- Se o Yan preferir o B, a skill muda e a decisão volta ao gate.

---

## Antecipações (insumo dos cards e do inv. 7)

| | Linhas | Antecipado (R$) | Desconto (R$) | Custo % ponderado |
|---|---:|---:|---:|---:|
| 2024 | 9 | 1.521.381,14 | 43.964,39 | 2,8898 |
| 2025 | 18 | 3.926.091,12 | 102.130,34 | 2,6013 |
| 2026 | 11 | 1.797.940,19 | 41.968,28 | 2,3342 |
| **Total** | **38** | **7.245.412,45** | **188.063,01** | |
| Asaas | 22 | 3.688.686,34 | 92.863,14 | |
| Blimboo | 16 | 3.556.726,11 | 95.199,87 | |

- **Inv. 7:** os 38 registros e os dois totais batem com o guard da 0296:228–235. Não há registro novo desde a
  v6.4.0.
  - Esse oráculo **não é um teste vivo**: é só uma guarda dentro da migration. A M4 escreve o teste em
    `rpc-contrato.test.ts`.
- **Dias sem antecipação:** a última é de 21/09/2026, o que dá **35 dias** em 26/10. Nenhuma data se repete.
- **Maior intervalo de 2026:** **117 dias**, entre registros dentro do ano. Duas definições ficam para o GATE 1:
  - se o intervalo em curso (até hoje) entra na conta (hoje não muda o resultado: 35 < 117);
  - se o intervalo que atravessa a virada do ano entra.

---

## Resumo para o checkpoint do Yan

1. **Q1:** uma foto (15/10). A evolução começa com um ponto e o Δ semanal ainda não tem base: o estado "sem semana
   anterior" é o de hoje.
2. **Q5 / §0:** **há GATE 2**. RPCs novas para as três seções. A destrutiva, depois do deploy, derruba custos,
   prazos (com a série de 3 fotos exportada antes), `geral_fin_grupo` e as 3 RPCs de leitura substituídas.
3. Q2 e Q3 sem caso hoje: o aviso do inv. 3 e a faixa "a vencer" ficam condicionais, e não há nota de grafia.
4. Q4: pessoa 100% preenchida. Top 10 + demais.
5. Q6: a extração do gráfico corrige a deriva do eixo invertido que já existe.
6. Q7: tabelas novas no padrão da skill (A); Marketing e DRE ficam como exceção registrada.

**Pontos para o Yan decidir no GATE 1 (mockup):**
- **Prejuízo por pessoa com vários anos selecionados:** somar os anos numa tabela só, ou um bloco por ano (como o
  comparativo de antecipações)?
- **Maior intervalo:** conta o intervalo em curso e o que atravessa a virada do ano?
- **Exposição de nomes:** o top 10 de inadimplentes e o prejuízo por pessoa mostram nomes (em parte pessoas físicas)
  a quem tem a área `financeiro/geral`. O top 10 já existia na v6.4.0; o prejuízo por pessoa é novo. Confirmar que o
  público da área pode ver.
