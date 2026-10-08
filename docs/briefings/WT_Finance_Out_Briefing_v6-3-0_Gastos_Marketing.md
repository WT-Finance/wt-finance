# Out-briefing — v6.3.0 · Gastos de Marketing

Rota A com briefing (`docs/briefings/briefing-v6-3-0-gastos-marketing.md`), aberta e fechada em 08/10/2026.
Branch `feat/v6-3-0-gastos-marketing`. **Migration 0292 (aditiva, APLICADA 08/10).** **ADR-0182.**
Medição da M0: `docs/auditoria/v6-3-0-m0-marketing.md`.

## 1. Resumo

Seção nova **"Marketing"** na sidebar, com a página **`/marketing/gastos`** e área RBAC própria
`marketing/gastos`. Ela é para a gestora de marketing acompanhar os gastos **pagos** da área. É o
primeiro público do Janus fora do Financeiro, e a gestora não herda acesso nenhum do Financeiro.

**Marketing é o bloco `MKT` da DRE de caixa, lido do mapa vivo (ADR-0182).** As 3 RPCs novas usam o
predicado do Realizado de `get_dre_mensal`, sem lista de categorias. Por construção, o total da página
**é** a linha "(-) Despesas Marketing" da DRE. Isso foi provado de quatro formas:

- na M0: 34/34 células iguais ao centavo, de jan/2024 a out/2026;
- no ensaio da 0292 em transação revertida;
- via REST depois da aplicação;
- para sempre, em `rpc-contrato.test.ts`.

Remapear uma categoria no editor da DRE a tira da página (ou a põe) no mesmo instante. A prova foi feita
em transação revertida: mover "Licença de Software (MKT)" para ADM a tira, e a paridade fecha nos dois estados.

**A página tem:**

- cabeçalho com o carimbo "Última atualização" e a cobertura;
- aviso "Cartão lançado até DD/MM" no ano corrente;
- indicadores com Δ% sobre o mesmo período do ano anterior, usando a mesma função da DRE;
- série mensal, com o ano em barras e o ano anterior tracejado;
- tabela categoria × mês com % do total;
- ranking de fornecedores, em que o clique filtra os lançamentos;
- tabela de lançamentos com filtros, busca, ordenação e **Exportar** (xlsx com as mesmas linhas da tela).

O gasto aparece **negativo, como na DRE**. Cada card degrada sozinho.

## 2. Decisões

### Do Yan (GATE 0, 08/10)

| # | Decisão |
|---|---|
| D1 | Sem filtro de setor: o dado não tem setor, nem no fato nem no raw. |
| D2 | **Gasto com o sinal da DRE (negativo)**. Foi decisão do Yan contra a recomendação da M0, que era exibir positivo. Um estorno aparece positivo. |
| D3 | Lista FECHADA de colunas: data, categoria, fornecedor, descrição, nº do documento, valor. **Sem conta bancária**, porque os cartões "WCLARA - <nome>" carregam o nome do portador. |
| D4 | Carimbo vigente ("Última atualização…"), **sem "· parcial"** (decisões da v6.0.0, out-briefing :212/:280, que a invariante 10 do briefing contrariava). Em vez disso, o aviso de defasagem do cartão. |
| D5 | Mapa vivo sem exceção. Endomarketing (RHB) e Feiras/Eventos (COM) ficam fora, salvo remapeamento no editor da DRE, que muda a DRE junto. |

**GATE 1:** o Yan aprovou o mockup sem ajustes. Nos 4 pontos que ele podia decidir, ficou como estava
implementado:

- Δ negativo = desfavorável, com a palavra escrita;
- 3º KPI = último mês do recorte;
- carimbo no formato longo;
- Marketing logo depois de Gestão de Pessoas na sidebar.

### Técnicas (orquestrador)

- **Correções ao briefing:**
  - migration 0292, e não a 0291 (que foi da v6.2.3);
  - base = main pós-v6.2.3;
  - a área também é concedida a **Máquina · verificação**, porque `rpc-contrato.test.ts` exige que essa role tenha toda área fora de Administração;
  - "pago" = `tipo='realizado'` decidido na carga;
  - o Δ% vem de `deltaYtd` (`colunas-tabela.ts`), não de `av.ts`;
  - a lacuna do `rotaInicial` é de 11 áreas, e esta versão só fecha a de Marketing.
- **Inv. 3 como ensaio avulso, não como teste permanente que escreve no banco.** O gatilho de
  reavaliação do ambiente de teste (skill `banco-e-rpc` §6) já está tocado, com 5 casos. Um 6º por
  conveniência não se justifica, e a definição viva continua coberta por construção (o predicado não tem lista).
- **Mockup na rota real**, com componentes de produção alimentados por fixture e área provisória
  `admin/design-system` até a migration (precedente v5.6.0). Na M3 só a fonte do dado trocou.
- **Sem paginação no servidor:** são ~230 lançamentos por ano, então filtro, busca e ordenação rodam no cliente.
- **Clamp do `?ano=` em `[2001, ano corrente]`**, com pills vindas de `anosDisponiveis` (o dado real),
  e não a janela de 3 anos da DRE, que esconderia 2024 a partir de 2027.
- **Componentes locais** no lugar de `KpiCard` (a seta ↑/↓ reforçaria a leitura errada do Δ negativo),
  `SeletorMeses` (é um range entre anos, com portal) e `AnoPills` (vive dentro de `tabela-dre.tsx`;
  importá-lo acoplaria a página à DRE).

## 3. Arquivos

- **Banco:** `supabase/migrations/0292_marketing_gastos.sql`. Contém a área, as 3 concessões explícitas,
  `get_marketing_gastos_{resumo,fornecedores,lancamentos}(p_ano)` (STABLE, SECURITY DEFINER,
  `exigir_acesso` inline), o REVOKE de `anon`, o GRANT ao `verificador` por assinatura e o guard de efetividade.
  Também `src/types/database.ts` (gerado) e `supabase/baseline/schema-v6.json` (regenerado; diff lido:
  3 funções + allowlist + `ultima_migration`).
- **Página:** `src/app/marketing/gastos/{page,loading}.tsx`; `src/components/marketing/gastos/*`.
- **Módulos puros + testes:** `src/lib/marketing/{agregacao,escala,exportar,formatar,indicadores,lancamentos,periodo,schemas,tipos,fixture}.ts`
  e os `*.test.ts`, incluindo `completude.test.ts`.
- **Catálogos:** `src/lib/auth/areas.ts` (`AREAS`, `AREA_INFO` ordem 70, `areasDaRota`,
  `PRIORIDADE_INICIAL`) e `src/components/layout/nav-model.ts`, com os testes.
- **Contrato:** `src/lib/rpc-contrato.test.ts`, com um bloco "Gastos de Marketing" e 3 entradas F7.
- **Docs:** ADR-0182, `docs/auditoria/v6-3-0-m0-marketing.md`, CHANGELOG, CHANGELOG_DIRETORIA, este out-briefing e o WORKING-CONTEXT.
- **Invariante 5 medida** (`git diff --stat origin/main...HEAD`): nada em `src/lib/dre/`,
  `src/components/financeiro/`, `src/app/financeiro/`, `get_dre_mensal`, `dre_categoria_map` ou `app.exigir_acesso`.

## 4. Gates e prova

- **M0 (só leitura):** Q1–Q7 com query e resultado, e o pré-oráculo 34/34.
- **Ensaio da 0292 em transação revertida:**
  - o guard passou;
  - a paridade com a DRE fechou nas 34 células, com resumo ≡ fornecedores ≡ lançamentos e qtd coerente;
  - remapear uma categoria a tirou e depois a devolveu, com a paridade fechando nos dois estados;
  - ano vazio e ano inválido se comportaram como esperado;
  - depois do ROLLBACK não ficou função nem área.
- **Aplicação:** `db:migrate --aditiva` com backup-gate VERDE (81/81, restore-test spot ok).
- **REST pós-aplicação** (credencial `verificador`): as 3 RPCs responderam 200 em 2024–2026,
  34/34 células com a DRE, e `anon` foi recusado (401/42501).
- **Contrato** (`rpc-contrato.test.ts`, contra produção): todos os casos de Marketing rodaram e passaram:
  - shape (F7);
  - paridade por ano;
  - completude por mês, mês×fornecedor e mês×categoria;
  - lista fechada no JSON cru;
  - ano vazio e ano inválido;
  - anon negado;
  - usuário sem a área negado (conexão READ ONLY), com contraprova de um usuário que tem a área.

  A allowlist derivada (`derivar-allowlist.mjs verificador`) bate com os 3 grants da 0292.
- **Fechamento:** ver §4.1.

### 4.1 Gates de fechamento (08/10, depois das correções do revisor)

- `npm run build`: verde (`/marketing/gastos` dinâmica). `npx tsc --noEmit`: limpo. `npm run lint`: limpo.
- `npm test`: **2.118 passam**, 6 pulados, em 119 arquivos. O único vermelho é
  `oraculo-demonstrativo.test.ts` (fixture B-38, §5), que é anterior a esta versão.
- Seção nova: 113 testes em 9 arquivos de `src/lib/marketing/`, incluindo a completude e o "ano anterior
  indisponível × zero real".
- `knip`: zero achados na seção. Seis símbolos de uso interno perderam o `export`. O repo continua com
  os achados que já existiam antes.
- Conferido por grep, depois da rodada de correções:
  - não sobra selo, `fonte` nem `EstadoMockup`;
  - "Nº do documento" está na tela;
  - o singular está certo e a busca tem `name`/`autoComplete`;
  - não há rótulo "(-) Despesas Marketing" fixo nos componentes;
  - "Sem dados em AAAA" aparece no tile.

Notas da rodada de correções:

- A coluna "Nº do documento" passou de 128 para 152 px, e a largura mínima da tabela de 1040 para 1064, para
  caber o rótulo. Conferir no visual.
- O header da migration 0292 (linha ~31) cita `src/components/marketing/gastos/tipos.ts`, mas o arquivo
  mudou para `src/lib/marketing/tipos.ts`. É só comentário de migration já aplicada e não foi editado.

## 5. Não verificado pela sessão

- **Conferência visual ao vivo.** O MCP do Playwright não sobe em sessão de background, e o Yan
  conferiu o **mockup** no preview da Vercel (GATE 1). A página com dado real (M3 em diante) não foi
  vista por ninguém. Ver §6.
- O oráculo de ingestão do Demonstrativo segue vermelho na suíte completa por causa da fixture
  `demonstrativo-cru.xlsx`, perdida desde a v6.0.1 (B-38). Não tem relação com esta versão. As outras
  12 fixtures foram restauradas do arquivo de resgate com o sha256 conferido.

## 6. Pendências — o que só o Yan tem

1. **Criar a role e o usuário da gestora** pelo editor de roles, só com `marketing/gastos`.
2. **Conferir no ar** (preview ou depois do merge):
   - abrir com o usuário só-Marketing: ele entra direto em `/marketing/gastos` e não vê nada do Financeiro;
   - comparar um mês da página com a linha de Marketing da DRE de caixa;
   - ver 2024, que não deve mostrar o ano anterior como zero;
   - ver 2026, com o aviso de cartão;
   - testar o Exportar;
   - abrir em largura de celular.
3. **Mostrar à gestora e anotar o que ela pedir.** É o insumo da próxima versão da seção.
4. Observações de dado da M0 para o Financeiro (não são da página):
   - empresas do grupo aparecem como fornecedor no MKT;
   - descrições sugerem categoria trocada no Monde: "Licença de Software (ADM)", "Tecnicópias", "iCloud+".

## 7. Parecer da revisão

### revisor-db (0292, antes da aplicação) — APROVADA COM RESSALVAS, sem CRÍTICO/ALTO

**Conferido:** as invariantes 1–6, a classificação aditiva, os nomes das roles, o guard sem condição
vacuosa e o timeout com folga.

**Ressalvas:**

| Achado | Destino |
|---|---|
| MÉDIO 1 — flip do TS incompleto | Feito na M3 |
| MÉDIO 2 — `anosDisponiveis` fora do tipo | Feito na M3 |
| BAIXO 1 — `btrim` × `trim()` | **Corrigido antes de aplicar**: `btrim(pessoa, E' \t\r\n' \|\| chr(160))` |
| BAIXO 5 — guard | **Corrigido**: exatamente 3 roles com a área, `prosecdef` e `search_path` vazio |
| BAIXO 6 — header | **Corrigido** |
| BAIXO 2 — snapshots separados | Registrado: risco igual ao de qualquer página multi-RPC; o contrato reprova alto se acontecer |
| BAIXO 3 — `id` renumera | Documentado em `tipos.ts`, usado só como key |
| BAIXO 4 — carimbo é do arquivo | Registrado: mesma propriedade da DRE, mantida |
| BAIXO 7 — contrato + allowlist | Feito na M4 |

**Pré-aplicação conferida:**

- as 3 roles já tinham `financeiro/dre`, então ninguém passou a ver mais do que via;
- nenhum rótulo duplicado no MKT;
- só a 0292 estava pendente.

### revisor (fechamento) — APROVADO COM RESSALVAS, sem CRÍTICO/ALTO

| Achado | Destino |
|---|---|
| MÉDIO 1 — zero fabricado: em 2024 o ano anterior aparecia como R$ 0,00 e a linha tracejada ia a zero | **Corrigido**: ano anterior fora de `anosDisponiveis` = indisponível ("—", "Sem dados em AAAA", sem linha de referência), com teste |
| MÉDIO 2 — recorte de meses e filtros fora da URL | **Desvio consciente, registrado**: mesmo padrão da DRE e de Metas, e só o ano vai para a URL. Candidato a backlog se a gestora pedir link compartilhável |
| MÉDIO 3 — agregado em 2 casas (`fmtBRL2`) | **Mantido**: exceção deliberada, porque a página existe para bater ao centavo com a DRE, que também mostra centavos |
| BAIXOS 1–8 | **Corrigidos**: resíduo do mockup removido (selo, `fonte`, `EstadoMockup`); `tipos.ts` e `fixture.ts` movidos para `src/lib/marketing/`; comentários atualizados; rótulo do bloco sem texto fixo; aviso de cartão também no Δ; "Nº do documento" igual na tela e na planilha; singular, "…", `name`/`autoComplete` |
| BAIXO 9 — tooltip do "?" dentro do scroll | A conferir no visual |
| Ponto de opinião — import de `src/lib/dre/exportar` | Bundle desprezível, acoplamento aceitável e coberto pelo teste local. Backlog: subir `rotuloSeguro`/`Celula`/`FMT_MOEDA` para `src/lib/planilha/` |
| Ponto de opinião — `Tile` | Já existe um quase idêntico no inventário; extrair na 3ª cópia |

**Pré-existentes anotados:**

- `GatilhoAjuda` com área de toque de 12px;
- nenhuma página com `<title>` próprio;
- os oráculos de ingestão **quebram com ENOENT** quando falta fixture, em vez de se auto-pular como o
  README de `tests/fixtures/ingestao/` afirma.

## 8. Backlog gerado

- `rotaInicial`: 10 áreas continuam sem entrada (`financeiro/dre`, `financeiro/acervo{,/gestao}`,
  `financeiro/faturamento-corp`, `solicitacoes{,/basico,/documentacao}`, as 3 de `gestao-pessoas`).
  Quem tem só uma delas cai em `/sem-acesso`.
- Módulo compartilhado de células de planilha (`src/lib/planilha/`).
- Estado do recorte na URL (`?de=&ate=&forn=`), se pedido.
- Oráculos de ingestão: auto-skip real quando a fixture falta.

## 9. Aprendizado (régua de 5 destinos)

- **Recorte derivado de uma árvore viva, com oráculo de paridade.** A decisão de arquitetura está no
  ADR-0182; o padrão de prova (predicado copiado + paridade no contrato + definição viva em transação
  revertida) já está na skill `banco-e-rpc` (§6, ensaio da migration). Destino: **(2) já coberto**.
- **Relatório de medição commitado não leva nome de pessoa física nem de portador de cartão.** O push do
  relatório da M0 foi barrado pelo classificador de permissões até os nomes serem trocados por rótulos.
  É situacional e de método. Destino: **memória de feedback** (não é convenção de banco nem de código).
- **Oráculo de ingestão quebra em vez de pular** quando falta a fixture. É defeito de enforcement.
  Destino: **(1)**, no backlog (§8). Não foi corrigido aqui, porque está fora do escopo.

## Advisor

Consultas declaradas nos retornos. Só o `implementador` consulta pelo protocolo.

| Agente / missão | Consultas | Momentos | Mudou o rumo |
|---|---|---|---|
| implementador — M1 (mockup) | 2 | 1 e 3 | sim, nas duas |
| implementador — M2 (migration) | 2 | 1 e 3 | sim, nas duas |
| implementador — M3 (ligação às RPCs) | 1 | 3 | sim |
| implementador — M4a (exportar) | 1 | 3 | sim |
| implementador — M4b (contrato) | 2 | 1 e 3 | sim, nas duas |
| implementador — correções do revisor | 1 | 3 | sim |
| revisor-db, revisor | 0 | — | — |
| exploradores (plan mode, tipo Explore) | não declarado | — | — |

Total: **9 consultas, todas do `implementador`, todas no protocolo (momentos 1 e 3), todas mudaram o
rumo**. Nenhuma consulta do orquestrador.

**Custo:** pendência do Yan (`/usage`).
