# Out-briefing — v6.4.2 "Ajustes em Despesas de Marketing e na DRE de caixa"

**Rota:** C (patch pedido direto no chat, 26/10). **Branch:** `feat/v6-4-2-ajustes-marketing-dre`, a partir
de `origin/main` (10ffb40, merge do #305). **Banco:** patch DESTRUTIVO pendente (vira a 0300). **ADR:** nenhum
(livre segue 0184).

## 1. O pedido e as decisões

Três pedidos do Yan:

1. **URL de Despesas de Marketing:** de `/marketing/gastos` para `/marketing/despesas`.
2. **"Inverter todos os gráficos de barras" da página de Marketing.** Lido como inverter o eixo: a despesa
   (negativa) sobe a partir do zero, como na grade de proporção da DRE. A leitura se apoia na pendência
   registrada na v6.3.0 ("decidir o sentido do eixo do card de proporção: hoje as barras descem do zero; na DRE o
   eixo é invertido"), que fica resolvida aqui.
3. **DRE por fluxo de caixa: excluir o grupo "Despesas com Imobilizados".** Perguntei ao Yan, que decidiu:
   - **dissolver em Investimentos:** as categorias do `IMOB` passam para "(-) Despesas com Investimentos e
     Empréstimos" (`INV`) e o grupo some. As outras opções eram excluir do demonstrativo, o que muda o resultado,
     ou voltar para as despesas operacionais, o que reverte a v5.7.0;
   - **manter o cabeçalho** "(+/-) INVESTIMENTOS, IMOBILIZADO E EMPRÉSTIMOS" como está.

## 2. O que foi feito (um commit por item + correções da revisão + fechamento)

| commit | o quê |
|---|---|
| `feat(marketing): rota /marketing/gastos vira /marketing/despesas` | `page.tsx` e `loading.tsx` foram movidos para `src/app/marketing/despesas/`. `/marketing/gastos/page.tsx` virou só redirect e preserva a query (`?anos=`/`?ano=`), como o precedente de `/admin/uploads`. `nav-model.ts` e `rotaInicial` apontam para a rota nova, e `FORA_DA_SIDEBAR` registra a legada. A área `marketing/gastos`, as RPCs e os componentes mantêm o nome técnico; trocar a chave da área seria destrutivo. |
| `feat(marketing): eixo invertido nos graficos de barras de Despesas` | `ChartYAxisBRL` ganhou `invertido` (→ `reversed`), no mesmo molde do `ChartYAxisPct`. Os 3 `BarChart` da página usam o eixo invertido: Despesas mensais, painel Total e Proporção. O `LabelList` da proporção escolhe a ponta livre pela orientação, e o texto de ajuda do card foi atualizado. |
| `feat(dre): grupo "Despesas com Imobilizados" dissolvido em Investimentos` | O patch `supabase/patches/dre-dissolver-imobilizado-em-investimentos.sql` e os consumidores: `ponte-regimes.ts` (caixa `['INV']`) com o teste, o comentário de `folhas.ts`, os casos da v5.7.0 em `rpc-contrato.test.ts` e o `dre-oracle.mjs`. |
| `fix(dre): correcoes da revisao…` | Ver §4. |

### O patch (aplicação humana, em TTY)

O passo a passo está no header do arquivo:

1. Rodar o oráculo e gravar o retrato **antes**.
2. `migration list` e `mv` para `supabase/migrations/0300_dre_dissolver_imobilizado_em_investimentos.sql`.
3. `npm run db:migrate -- --destrutiva`.
4. Oráculo `--comparar`.
5. `npm run db:baseline`, e commitar o `mv` junto com o baseline.
6. `npm test`.

O que o patch faz: as categorias do `IMOB` vão para o `INV`, ao fim e na ordem relativa que tinham. As fórmulas
ficam `INV_H = [INV]` e `RAIR = [LL, INV]`, e o bloco `IMOB` é removido (`DELETE`).

**Oráculo** (em álgebra): `INV_H`, `RAIR` e `REX` não mudam um centavo; a linha `IMOB` some e o `INV` cresce
exatamente o valor dela. Valores de `IMOB` no header da 0251: 2024 ≈ R$ 20,9 mil, 2025 ≈ R$ 99,3 mil, 2026 ≈ R$ 236,6
mil (medido em 19/08; o de 2026 anda).

**Sem número cravado.** A sessão não conseguiu ler a produção (o classificador do harness negou a leitura).
Por isso o patch:

- tira um retrato do estado vivo no ato;
- exige como pré-condição o estado deixado pela v5.7.0: `IMOB` e `INV` são folhas, `INV_H = [INV, IMOB]` e
  `RAIR = [LL, INV, IMOB]`;
- reconcilia contra o retrato em contagem **e conteúdo**: o conjunto exato de categorias de `INV ∪ IMOB` termina
  no `INV`, um hash do resto do de-para e dos blocos não se move, e o rótulo de `INV_H` fica intacto.

## 3. Gates

- `npx tsc --noEmit` limpo · `npm run lint` limpo · `npm run build` verde (`/marketing/despesas` e
  `/marketing/gastos` dinâmicas).
- `npm test`: **2.567 verdes, 6 skipped, 2 vermelhos + 2 arquivos vermelhos**. Todos esperados:
  - os 2 casos de contrato do `IMOB` (`rpc-contrato.test.ts`, "camada firme da v5.7.0") leem a produção e só
    ficam verdes **depois do patch aplicado**, como no precedente da 0251;
  - `oraculo-demonstrativo` e `oraculo-contas-receber` falham por fixture ausente: `demonstrativo-cru.xlsx` (B-38,
    perdida) e `contas-receber-cru-24.xlsx` (no arquivo de resgate ela está como "Contas a receber 24.xlsx"). É
    lacuna de ambiente anterior a este patch. As outras fixtures foram copiadas de
    `~/projects/arquivo-worktrees-janus/fixtures-ingestao/`, e os demais 25 arquivos de ingestão passam.
  - Na 1ª rodada, os contratos de Marketing estouraram tempo (10,5 s) sob a suíte inteira. Passaram 29/29
    isolados e na 2ª rodada completa.
- `classificarSql` do backup-gate sobre o patch dá **`destrutiva`** (conferido).

## 4. Parecer da revisão

**`revisor`** — APROVADO COM RESSALVAS, sem CRÍTICO ou ALTO.

- MÉDIO, **corrigido:** comentário de teste dizia "0300 aplicada pelo Yan" e, na mesma frase, "vermelho até ser
  aplicada".
- MÉDIO, **corrigido:** o oráculo falhava aberto quando um invariante sumia do "depois" (`NaN >= 0.005` é falso).
- BAIXO, **corrigido:** a checagem `INV = INV + IMOB` agora é automática, não "a olho".
- BAIXO, **registrado:**
  - `folhas.test.ts:93` ainda soma `['INV','IMOB']`. É o caso genérico de "chave ausente vale 0" e é inofensivo.
  - O redirect não tem `requireArea`. O destino tem, e `proxy.ts` exige sessão.
  - Com o eixo invertido, o valor exatamente 0 leva o rótulo para baixo da linha.
  - O campo "Código" do ADR-0182 cita `src/app/marketing/gastos/`. O ADR é histórico e não foi editado.
- As respostas do revisor confirmam:
  - nenhum consumidor esquecido do caminho ou do `IMOB`;
  - `barRadius.top` e o rótulo continuam certos com `reversed`;
  - o redirect está correto no Next 16;
  - os contratos são coerentes com o pós-estado.

**`revisor-db`** — CORREÇÕES NECESSÁRIAS, todas feitas.

- **ALTO, corrigido:**
  - **Defeito:** a 1ª versão tinha todo o DML dentro de um `DO $$`. O classificador do backup-gate ignora corpos
    dollar-quoted e leria o patch como **aditivo**. A flag `--destrutiva` protege a aplicação, mas um arquivo
    esquecido em `migrations/` seria aplicado por qualquer `--aditiva` seguinte, inclusive de agente.
  - **Correção:** o DML voltou ao top-level, como na 0251, e os `DO` ficaram só como guardas. Classificação
    conferida: `destrutiva`.
- MÉDIO, **corrigido:**
  - a reconciliação conferia só contagens; agora confere também conjunto e hash;
  - faltavam as pré-condições de `INV`/`IMOB` folhas;
  - faltavam `db:baseline` no header e a ordem de gate × aplicação.
- BAIXO, **corrigido:**
  - lock do editor (`pg_advisory_xact_lock`, o mesmo de `dre_estrutura_salvar`);
  - caminho de recuperação no header (`mv` de volta se abortar; desfazer o lote pelo painel ou restaurar o backup
    se o oráculo reprovar);
  - pré-requisitos de ambiente no header;
  - nome desatualizado do teste.
- **Sugestão não executada** (a leitura de produção foi negada à sessão): pré-voo `SELECT proname FROM pg_proc
  WHERE prosrc ILIKE '%IMOB%'`. O grep das migrations acha `IMOB` só em 0205, 0251 e num comentário da 0256.
  Vale o Yan rodar antes de aplicar.

**`verificador-visual`** — **NÃO RODOU.** O MCP do Playwright não conectou nesta sessão, então a inversão das barras
e o redirect **não foram vistos na tela**. A correção vem da leitura do código (revisor) e do precedente de
`barRadius.top` com eixo invertido, documentado em `chart-theme.ts`. Fica para o Yan no preview (§6).

## 5. Advisor

Uma consulta antes do item 3 e nenhuma depois. Ela não mudou o rumo, mas acrescentou três pontos:

- `supabase/seed/` e `scripts/` entraram no grep de consumidores;
- seguir o precedente da v5.7.0 para os contratos vermelhos;
- verificação visual indisponível declarada.

Custo: pendência do Yan (`/usage`).

## 6. 🔴 Pendências do Yan

1. **Aplicar o patch** (passo a passo no header do arquivo), de preferência **antes do merge**. Os 2 contratos
   do `IMOB` só ficam verdes depois. A ordem não quebra a tela em nenhuma direção: com código novo e banco velho, o
   `IMOB` cai no residual da ponte; com código velho e banco novo, o `IMOB` vale 0. Antes de aplicar, vale o
   pré-voo `prosrc ILIKE '%IMOB%'` (§4).
2. **Conferir no preview:**
   - `/marketing/despesas` com as 3 barras subindo;
   - o rótulo da proporção acima da barra;
   - `/marketing/gastos?anos=2025,2026` redirecionando com os anos;
   - a sidebar acendendo "Despesas";
   - depois do patch, a DRE de caixa sem a linha "(-) Despesas com Imobilizados" e com as 3 categorias em
     Investimentos.
3. A entrada da diretoria sobre o imobilizado só é verdade **depois do patch aplicado**.
4. **v6.4.1 (#305):** o pós-merge não foi feito. A data da diretoria foi reconciliada aqui (16:46). Falta, na raiz:
   `git pull --ff-only`, remover a worktree `feat-v6-4-1-antecipacoes-fluxo` (o trabalho está no `main`) e
   `git branch -d feat/v6-4-1-antecipacoes-fluxo`.
5. Mergear o PR da v6.4.2 e rodar `/pos-merge`.

## 7. Arquivos

- `src/app/marketing/despesas/{page,loading}.tsx` (movidos) · `src/app/marketing/gastos/page.tsx` (redirect)
- `src/components/layout/nav-model.ts` + `.test.ts` · `src/lib/auth/areas.ts` + `.test.ts`
- `src/components/charts/chart-primitives.tsx` · `src/components/marketing/gastos/{serie-mensal,proporcao-receita}.tsx`
- `supabase/patches/dre-dissolver-imobilizado-em-investimentos.sql` (novo)
- `src/lib/dre/ponte-regimes.ts` + `.test.ts` · `src/lib/dre/folhas.ts` · `src/lib/rpc-contrato.test.ts` ·
  `scripts/dre-oracle.mjs`
- `CHANGELOG.md` · `src/data/changelog-diretoria.ts` · `package.json` · `package-lock.json` ·
  `docs/WORKING-CONTEXT.md` · este out-briefing
- `.claude/skills/banco-e-rpc/SKILL.md` · `.claude/agents/revisor-db.md` (aprendizado, §8)

## 8. Aprendizado (régua de 5 destinos)

- **O classificador do backup-gate não enxerga DML dentro de `DO $$`.** Um patch destrutivo escrito todo em bloco
  `DO` passa como aditivo. Destino:
  - **(1) enforcement mecânico** seria o ideal: um caso em `classificar.test.mjs` e o classificador tratando o
    corpo de `DO` (não o de `CREATE FUNCTION`) como top-level. Isso mexe no gate, então fica **proposto, não
    feito**: registrado aqui para decisão do Yan;
  - até lá, **(4) skill `banco-e-rpc`**: a regra "destrutiva tem DML no top-level; `DO` só para guardas"
    entrou na seção de destrutivas da skill, e o mesmo item entrou no checklist do `revisor-db` (D-12). Os dois
    arquivos estão neste PR, para revisão.
