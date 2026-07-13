# ADR-0146 — Metas por Setor (Acompanhamento + Cadastro)

**Status:** aceito · **Versão:** v5.0.0 (abertura da major 5) · **Data:** 2026-07-08

## Contexto

O diretor comercial acompanhava metas de faturamento por setor num dashboard externo
provisório ("Dash Comercial"). A plataforma já tinha um esqueleto de metas **seed-only**
(tabela `app.meta_setor`, RPC `inserir_metas`, rota `/metas` com o dashboard v1 legado atrás
de um "em construção"), mas sem fluxo operacional: as metas só entravam por `npm run seed`
com valores chumbados. A v5.0.0 absorve o provisório com **Acompanhamento** (leitura) e
**Cadastro** (edição) reais.

## Decisões

1. **Fonte única do real (inegociável).** O realizado do Acompanhamento vem das MESMAS funções
   da Performance: `get_executiva_kpis` (por setor) e o motor de período `src/lib/periodo.ts`
   (`resolverPeriodoCompleto`/`calcularYoYInteligente`, **importado, nunca reimplementado**). A
   RPC nova `metas_ritmo_diario` soma `analytics.mv_vendas_diarias` com o **mesmo JOIN/WHERE** de
   `get_executiva_kpis` → a Σ da série diária é idêntica ao faturamento do período. **Provado por
   teste de paridade** (`rpc-contrato.test.ts`: `metas_ritmo_diario[setor].Σserie === get_executiva_kpis.faturamento`,
   para todos/Weddings/Lazer/Corporativo). Assim "faturamento de julho" nunca diverge entre Metas e Performance.

2. **Modelo estende, não recria.** Migration **0175 (aditiva)**: `ADD COLUMN app.meta_setor.pct_receita`
   (alvo de % Rec = receita/VT, `numeric(5,2)`, CHECK 0..100) + `pct_receita`/`pct_receita_anterior`
   no histórico. A tabela `app.meta_setor_historico` (criada vazia em 0004, nunca usada) é
   **ATIVADA**: todo `metas_upsert` grava quem/quando/valor anterior. A chave é `setor_macro_id`
   (nunca o nome). As 108 metas de seed permanecem.

3. **RPCs no padrão inline (pós-v4.29).** `metas_listar(p_ano)` e `metas_ritmo_diario(p_from,p_to,p_setor)`
   (leitura, `exigir_acesso(['metas/acompanhamento','metas'])`); `metas_upsert(p_metas jsonb)`
   (escrita, `exigir_acesso(['metas'])`, upsert + histórico, `fonte='real'`). `REVOKE ... FROM PUBLIC, anon` /
   `GRANT ... TO authenticated, service_role`. **RPCs de produto filtram `fonte='real'`** — o seed
   fictício (2024/25) fica invisível ao produto.

4. **Group é COMPUTADO, nunca cadastrado.** Na leitura, o servidor soma os 3 setores (VT) e pondera
   o % Rec por VT. No Cadastro, o Group recalcula **ao vivo no cliente** enquanto o usuário digita.

5. **Ritmo em módulo puro testado** (`src/lib/metas/ritmo.ts`): meta do período = soma das metas
   mensais tocadas, **pró-rata por dias corridos** nos meses parciais das bordas; **"hoje" = data da
   última venda carregada** (não o calendário); régua com **constantes nomeadas**
   (`RITMO_META_ATINGIDA=100`/`RITMO_ATENCAO=60` — calibragem = trocar 1 linha); alvo de % Rec do
   período ponderado por VT (só meses com alvo). 10 testes cobrindo mês parcial, YTD, multi-mês
   fechado, personalizado cortando meses, hoje=última venda, régua e período futuro.

6. **RBAC em dois níveis** (molde de `solicitacoes`/`acervo`): `metas/acompanhamento` (leitura,
   liderança) + `metas` (edição/Cadastro, nome histórico — também libera a leitura). A tela de
   Acompanhamento libera com `areasAny ['metas/acompanhamento','metas']`; o Cadastro e o
   `metas_upsert` exigem só `'metas'`. Migration aditiva só INSERE a área nova (não altera a `metas`
   existente, que seria `UPDATE` destrutivo).

7. **Primitivo `<Gauge>`** (`@/components/shared/gauge`): medidor em semicírculo, arco em cor de
   IDENTIDADE (ADR-0103 — dourado de Weddings é legítimo no gauge de Weddings; Group neutro), tick de
   pace COM valor. A régua de status colore SÓ o "ritmo X%"/"% do esperado" (`text-success`/`warning`/`danger`).

8. **Autosave fail-safe** (padrão `contas-manager`, NÃO `lancamento-row`): blur/Enter → loader → check;
   **erro reverte** a célula ao valor anterior + aviso, nunca perde silencioso.

9. **Aposentadoria cética do dashboard v1.** Provado por grep que `MetasDashboard`, `components/dashboard/*`
   e as 5 API Routes eram consumidos SÓ por `/metas` → removidos. `get_historico_mensal` **permanece**
   (2º consumidor vivo: Executiva via `/api/dashboard/kpi-historico`). O DROP das 4 RPCs órfãs
   (`get_kpis`/`get_ritmo_diario`/`get_ranking_vendedores`/`get_ranking_produtos` + `__nucleo`) é a
   migration **0176 DESTRUTIVA**, PREPARADA mas **não aplicada** (exige confirmação humana num TTY, ADR-0131).

## Consequências

- Metas e Performance compartilham o número do real por construção (fonte única).
- O bump para **5.0.0** faz o histórico da diretoria dobrar a v4 sozinho (`VersionHistory` agrupa por
  `major` derivado de `APP_VERSION`, sem hardcode) — a v4 vira o card colapsado "Versões 4.x".
- Emenda deliberada de escopo: a **consolidação das 3 pills de período** (dívida M2) foi **deferida** —
  a variante de Weddings é baseada em Context (lida por múltiplos componentes) e migrá-la para URL é
  troca de comportamento em 4 dashboards vivos; o invariante é não-regressão. Metas reusa
  `PeriodoFilterPillsUrl` sem criar uma 4ª variante. Fica como follow-up para patch dedicado.
- Follow-up operacional: aplicar a migration 0176 (destrutiva) quando conveniente.

## Emenda — adendo de UI (v5.0.0, sobre mockups aprovados)

Após os primeiros previews, o Yan decidiu (firme) três mudanças de superfície, sem alterar o motor:

1. **Gauge → barra.** O `<Gauge>` semicírculo SAI (componente, usos e seção do DS doc). O elemento
   central dos cards vira `<MetaProgressBar>` (trilha + preenchimento na cor de identidade + tick mudo
   do esperado + tooltip escuro com decorrido/esperado/realizado/conclusão). Motivo: a barra comunica
   "quanto do combinado já entregou, e se está no ritmo" de forma mais direta e comparável entre setores;
   o esperado sai de texto fixo para o hover. Espessura 12px (Group) / 10px (setoriais) marca hierarquia.

2. **YoY REMOVIDO da superfície de Metas** (cards e rodapés — inteira). Motivo: *Metas responde "estamos
   entregando o combinado?"; Performance responde "estamos melhores que o ano passado?"* — cada página
   com a sua pergunta. O motor (RPCs `get_executiva_kpis` etc.) continua devolvendo YoY; só a superfície
   de Metas não o exibe (os campos saíram do contrato de apresentação `PainelSetor`). A **Margem** troca o
   ✓ binário por **delta em p.p. contra o alvo** de %Rec, colorido (acima=success, abaixo=danger).

3. **Cadastro: autosave-por-célula → edição local + salvar em lote.** Clique/Enter confirma LOCALMENTE
   (Group/Total recalculam ao vivo; célula suja = ponto âmbar); um botão **Salvar** persiste tudo numa
   chamada `metas_upsert` (o **histórico continua por célula** no banco). Rodapé com contador "N alterações
   não salvas". **Guarda de saída** (trocar de ano / fechar aba com pendências → confirmação; a edição
   nunca evapora). "**Aplicar ao ano**" no cabeçalho de cada %Rec preenche os 12 meses do setor como
   pendências (caso de uso: a primeira carga dos alvos em poucos gestos). Motivo: a grade tem ~72 células;
   salvar a cada tecla é ruidoso e frágil — lote + guarda é o padrão certo para edição em massa.

Os rótulos acompanham: "Meta VT" → "Faturamento"; subabas da sidebar "Acompanhamento"/"Cadastro"; o
antigo "ritmo X%" vira "% do esperado" em toda a superfície. O gráfico "Ritmo do período" permanece.

**Rodada 2 do checkpoint** (mesmos mockups, ajustes finos):

4. **Esperado é LINEAR sobre o período.** `esperado(hoje) = metaPeriodo × (dias decorridos / dias do
   período)` — "se 30% do período passou, esperava-se 30% da meta". Assim `esperado/meta ≡ % do período
   decorrido`, e o card compara **"X% da meta" (nosso) vs "Y% esperado" (referência)**; a régua colore o
   "% da meta". Substitui o acúmulo mês-a-mês do esperado (que ponderava por mês) — `metaPeriodo` continua
   sendo a soma das metas mensais com bordas pró-rata; só o ACÚMULO/esperado virou linear. A linha de meta
   do gráfico também virou rampa reta (o marcador do esperado cai sobre ela). Título "Acompanhamento das
   Metas"; "Faturamento" sai do topo do card Group (a label WELCOME GROUP já titula).

5. **Cards de Metas usam a cor de MARCA de cada setor, não a identidade `--setor-*`.** Trips #0091B3,
   Weddings #BD965C, Corporativo #0D5257 (o `--brand` de cada aba), expostos como tokens standalone
   `--marca-*` (`SETOR_MARCA_COLORS`) para uso cross-contexto (Metas roda em tema group). **Delibera-se
   uma EXCEÇÃO ao "cross-setor = --setor-*" (ADR-0103):** cada card de Metas É o card daquele setor, então
   leva a cor de marca dele (não a paleta de gráficos cross-setor). Os gráficos cross-setor (Executiva,
   breakdown) seguem em `--setor-*`. O tooltip da barra sai da LINHA DO ESPERADO (seta no tick; a caixa
   abre para o lado com espaço, sem vazar).

**Rodada 3 do checkpoint:**

6. **Períodos calendário-fixos.** As pills do Acompanhamento viram **Mensal (default) / Trimestral /
   Semestral / Anual** — o corte-calendário corrente que contém hoje (1º trimestre = jan–mar; nunca
   janela móvel tipo "últimos 3 meses"; sem Personalizado). Motivo: metas são cadastradas por
   mês-calendário — o acompanhamento fecha nos mesmos cortes em que a meta é combinada. Módulo puro
   `periodo-metas.ts` (testado) + `MetasPeriodoPills` (URL `?periodo=`; ativa em `--action-soft`).
   Metas deixa de usar as pills de janela móvel da plataforma.

7. **Seta do esperado + balão animado.** O tick reto que atravessava a barra vira uma **seta estática**
   apontando para baixo (o mesmo desenho/tom da seta do balão — "de onde o balão nasce"); no hover, o
   balão abre com animação fluída (fade+deslize nos dois sentidos, `motion-reduce` respeitado).

## Fora de escopo

Metas por Vendedor (M1/M2/M3, níveis TP) → v5.1. Aba Geral/mix cross-setor (destravável) → futuro.
