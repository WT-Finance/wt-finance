# Estado do projeto — Janus

> **Para que serve este arquivo.** Um leitor novo — pessoa ou agente em outra conta — se põe em dia
> sobre o Janus lendo só o repositório, e este é o ponto de partida. Ele descreve **o que existe e
> por quê**: arquitetura, módulos, de onde vem cada número, integrações, decisões vigentes e as
> convenções da casa.
>
> **O que ele NÃO é.** Não é o estado de uma versão em voo (isso é `docs/WORKING-CONTEXT.md`), não é
> histórico (isso é o git e os out-briefings em `docs/briefings/`), e não é o "como fazer" de cada
> domínio (isso são as skills em `.claude/skills/`). Quando este arquivo e o código discordarem,
> **o código está certo** — e este arquivo está com defeito.

Escrito em 10/09/2026, contra o repositório da v5.10.0.

---

## 1. O que é o Janus

Plataforma financeira **interna** do Welcome Group (ex-"WT Finance"; o rebranding é o ADR-0145).
Substituiu um Power BI. Serve a diretoria e as áreas de Financeiro, Performance comercial, Metas,
Faturamento corporativo e Gestão de Pessoas — três unidades de negócio: **Weddings**, **Trips** e
**Corporativo**.

Não é um produto vendido, não tem multi-tenant, não tem usuário anônimo. Toda tela exige sessão, e
quase toda tela exige uma **área** de permissão específica.

**Um detalhe que muda tudo na leitura do código:** não há ORM nem consulta montada no app. O front
**nunca** faz `.from('tabela')` — todo acesso a dado passa por uma **RPC** (função Postgres
`SECURITY DEFINER`) exposta via PostgREST. O banco não é um depósito: é a camada de regra de
negócio. É por isso que uma mudança de número quase sempre é uma migration, não um `.tsx`.

---

## 2. Arquitetura em uma tela

```
   navegador
      │
      │  (1) proxy.ts — portão de sessão: sem sessão, não entra
      ▼
   Next.js 16 (App Router, React 19, RSC) ── Vercel
      │
      │  (2) requireArea / requireAreaApi / requireAreaAction — portão de ÁREA
      │
      ├── page.tsx (Server Component)  ─┐
      ├── actions.ts (Server Action)    ├─→  db.rpc('...')  →  parseRpc (Zod)  →  UI
      └── route.ts (API Route)         ─┘
                                             │
                                             ▼
                              Supabase / Postgres + PostgREST
                                             │
      (3) app.exigir_acesso(...) INLINE dentro de cada RPC — o portão que vale
                                             │
      ┌──────────────────────────────────────┴───────────────────────────────┐
      │  public.*   RPCs (a única superfície exposta ao PostgREST)           │
      │  app.*      RBAC, config, solicitações, metas                        │
      │  analytics.*  dims e fatos (o modelo dimensional)                    │
      │  raw.*      o que os uploads depositam, antes de transformar          │
      │  financeiro.*  DRE, fluxo de caixa, gerencial, faturamento           │
      │  monde.*    espelho da API do Monde                                  │
      │  patrimonio.*  inventário de ativos                                  │
      │  audit.*    trilha                                                   │
      └──────────────────────────────────────────────────────────────────────┘
```

**As três camadas de enforcement** existem porque cada uma falha de um jeito diferente:

1. **`proxy.ts`** — portão de sessão na borda. Rota sem sessão não chega ao servidor. Tem uma
   exceção nomeada: rotas de API com **auth própria** (a API externa de Solicitações, o cron do
   Monde) — ADR-0153, emenda ao ADR-0109.
2. **`requireArea` / `requireAreaApi` / `requireAreaAction`** (`src/lib/auth/`) — portão de área no
   app. É o que decide se a página renderiza.
3. **`app.exigir_acesso(p_areas)` inline em cada RPC** — o portão que **realmente** vale. Os dois
   primeiros protegem a *tela*; este protege o *dado*. Quem chamar a RPC por fora do app (com um
   token de sessão válido) esbarra aqui.

O `supabase/config.toml` expõe ao PostgREST **apenas** `["public", "graphql_public"]`. Os schemas
`app`, `analytics`, `raw`, `financeiro`, `monde`, `patrimonio` e `audit` **não são alcançáveis** de
fora; chegam ao app só pelo que uma RPC de `public` decidir devolver.

---

## 3. Módulos e a fonte de verdade de cada um

A pergunta que este quadro responde é: **"este número veio de onde?"**

| Módulo (rota) | Fonte de verdade | Como o dado entra |
|---|---|---|
| **Executiva** (`/executiva`) | `analytics.fato_venda` + dims | derivado de Vendas |
| **Performance** (`/performance`, `/trips`, `/weddings`, `/corporativo`) | `analytics.fato_venda`, `fato_venda_item`, `dim_operacao_weddings` | upload de **Vendas** (Excel) e, para Weddings, a virada ao **Monde** (ADR-0151) |
| **Metas** (`/metas`, `/cadastro`, `/comparacao`, `/tv`) | `app.meta_setor` (+ histórico) | digitação humana no Cadastro; o **realizado** vem do Monde |
| **Fluxo de Caixa** (`/financeiro/fluxo-caixa`) | `financeiro.fato_fluxo` | upload de **Lançamentos por Operação** e de **Títulos em Aberto** |
| **Gerencial** (`/fluxo-caixa/gerencial`) | `financeiro.gerencial_lancamentos` + `gerencial_saldos` | importação por fatia + **edição humana na tela**, com diário e desfazer (ADR-0155) |
| **DRE por Caixa** (`/financeiro/dre`) | `financeiro.fato_fluxo` via `financeiro.dre_bloco` (estrutura VIVA, editável) | mesma origem do Fluxo de Caixa |
| **DRE por Competência** (`/financeiro/dre`, aba) | `raw.demonstrativo_competencia` via `financeiro.dre_comp_bloco` | upload do **Demonstrativo de Competência** |
| **Faturamento Corporativo** (`/financeiro/faturamento-corp`) | `financeiro.fatura_emissao`, `fatura_nota`, `fatura_email`, `cliente_corporativo` | cadastro na tela + **Asaas** (boletos e NFS-e) |
| **Acervo** (`/financeiro/acervo`) | `financeiro.acervo_documento` + Storage | upload humano |
| **Calculadora de Rateio** | RPC sobre `analytics` | — |
| **Solicitações** (`/solicitacoes`, `/admin/solicitacoes`) | `app.solicitacao` (+ `_tipo`, `_campo`, `_anexo`) | formulário interno **e** a API externa (ADR-0172) |
| **Acessos** (`/admin/acessos`) | `app.rbac_usuarios`, `rbac_roles`, `rbac_role_permissoes`, `rbac_areas` | administração humana |
| **Inventário de Ativos** (`/gestao-pessoas/inventario`) | `patrimonio.ativo`, `movimentacao`, `v_estado_atual` | cadastro humano |
| **Uploads** (`/admin/uploads`) | — | é a **porta de entrada** dos quatro arquivos acima |

### O pipeline de upload de Vendas, em uma frase

`limpar_staging_vendas` → `inserir_lote_staging` (por lote) → `validar_carga_staging`
(pré-checagem **não-destrutiva**) → `promover_carga_vendas` (transação única: trunca, copia
staging→raw, transforma, regenera dims, refresh das MVs). **Se qualquer etapa falha, a base de
leitura continua a anterior** — antes disso (v4.15.0, ADR-0111) uma carga ruim podia deixar a
tabela de vendas vazia em produção. Operação detalhada na skill `ingestao-planilhas` §5.

### Solicitações — o que um operador precisa saber

Tabelas em `app`, RLS *deny-by-default*: o acesso é **só** por RPC `SECURITY DEFINER`. As respostas
ficam em **snapshot JSONB** — editar os campos de um tipo **não altera** solicitações já abertas,
porque cada uma guarda os campos como estavam na abertura (ADR-0169; foi assim que se descobriu que
9 de 68 anexos estavam órfãos: validar contra o TIPO lê do snapshot, não do tipo atual).

- **Área `solicitacoes` = gestão** (ver todas + administrar tipos). A página `/solicitacoes`
  (abrir / minhas / caixa) é de **qualquer autenticado** (`solicitacoes/basico`);
  `/admin/solicitacoes` exige a área de gestão.
- **Tipo arquivado** some do formulário de abertura, mas histórico e board permanecem; desarquivar
  a qualquer momento. **Excluir** só é permitido para tipo **sem nenhuma solicitação** — com
  vínculo, a RPC recusa (`TIPO_EM_USO`) e a UI orienta arquivar.
- **Anexos** vivem no bucket privado `solicitacoes-anexos`, sem policy pública: o download é sempre
  por *signed URL* curta gerada no servidor, depois da checagem de visibilidade. O upload nasce em
  `tmp/<uuid>/<arquivo>` (quando a solicitação ainda não tem id) e, na criação, o **binário é
  movido** para `sol/<id>/<uuid>/<arquivo>` e só então o caminho é reescrito no banco. Consequência
  operacional: **`tmp/` contém apenas órfãos** — uploads que nunca viraram solicitação —, e é
  seguro limpá-lo; anexo vivo está sempre em `sol/<id>/`. Apagar uma solicitação faz CASCADE nos
  metadados, mas o objeto no Storage exige remoção à parte.

---

## 4. O mapa dos regimes: caixa × competência

A mesma empresa tem **dois resultados diferentes** e os dois estão certos. Confundi-los é o erro
mais caro que se pode cometer lendo este sistema.

| | **Caixa** | **Competência** |
|---|---|---|
| Fato gerador | a **movimentação realizada** (dinheiro entrou/saiu) | a **emissão** (o fato econômico aconteceu) |
| Origem | `financeiro.fato_fluxo` (Lançamentos por Operação) | `raw.demonstrativo_competencia` |
| Estrutura da DRE | `financeiro.dre_bloco` | `financeiro.dre_comp_bloco` |
| Pergunta que responde | "tenho dinheiro?" | "o negócio deu lucro?" |

**A ponte entre eles** (`src/lib/dre/ponte-regimes.ts`, v5.8.1, ADR-0171) é uma cascata: parte do
resultado por competência e chega ao de caixa, um degrau por balde de conta, cada degrau sendo
`caixa − competência` daquele balde. A identidade `REX_comp + Σ degraus = REX_caixa` fecha **por
construção**, não por ajuste — nos dois regimes o resultado é a soma de *todas* as folhas da
árvore, e o pareamento é uma partição. Por isso o teste que importa é o de **totalidade** (nenhuma
folha em dois baldes), não o de soma: um residual esconderia o erro fechando a conta mesmo assim.

---

## 5. Integrações

| Integração | Direção | Onde vive | Como é acionada |
|---|---|---|---|
| **Monde** (ERP de viagens) | leitura | `src/lib/monde/`, schema `monde.*`, `/api/monde/ingest` | **cron diário 09:00 UTC** (`vercel.json`) + disparo manual |
| **BACEN / SGS** (série do CDI) | leitura | `src/lib/cdi/serie-sgs.ts`, `/api/cdi/ingest` | ingestão sob demanda; alimenta o rendimento do float |
| **Asaas** (boletos e NFS-e) | **escrita no mundo** | `src/lib/asaas/` | ação humana na tela de Faturamento |
| **API externa de Solicitações** | escrita, *pull-only* | `src/lib/api-externa/`, `/api/externo/*` | sistema de terceiro, autenticado por **chave** (ADR-0172) |
| **SMTP (Office 365)** | **escrita no mundo** | `src/lib/email/` | envio de fatura, convite de acesso, avisos |

**Duas integrações agem sobre o mundo de forma irreversível** — Asaas (cobra dinheiro de cliente
real) e e-mail (chega na caixa de alguém). As duas são **fail-closed em modo teste** por desenho, e
a virada para o modo real é **decisão humana**, nunca do agente (ADR-0140/0141, skill `email`).

**O espelho do Monde espelha.** O filtro de negócio fica na **leitura**, não na escrita (ADR-0165):
o espelho guarda o que a origem diz, inclusive o que ela deixou de reconhecer, e quem decide o que
conta é a consulta. A regra nasceu de um defeito real — o espelho retinha venda cancelada com os
valores congelados de antes (24 vendas, R$ 896.718,90).

---

## 6. Decisões vigentes

Os ADRs em `docs/adr/` são a fonte; **a numeração real no diretório é a verdade**, nunca a que um
briefing supõe. Um ADR revisto por outro traz no cabeçalho `Supersedido por:` ou `Emendado por:` —
a convenção é do ADR-0055 e marca o lado **superado**, que é onde o leitor desavisado cai.

As que mais moldam o dia a dia:

| Assunto | ADR |
|---|---|
| Sessão SSR e guards de área | **0109** (emendado por 0153) |
| Auth própria em rota de API é isenta do portão do proxy | **0153** |
| RBAC dinâmico: roles criáveis, permissão por área de navegação | **0107** |
| Backup-gate como rede de recuperação, não autorização | **0116** |
| Confirmação humana em TTY para migration destrutiva | **0131** |
| Coerção numérica canônica (+ lint que a impõe) | **0130** |
| Pipeline atômico de carga de Vendas | **0111** |
| Ingestão do Monde / A Virada / reconciliação / espelho fiel | **0149**, **0151**, **0164**, **0165** |
| DRE: estrutura viva, competência, ponte entre regimes | **0156**, **0170**, **0171** |
| Diário de alterações + desfazer no Gerencial | **0155** |
| Solicitações: eixo por contexto · etapa "Aprovada" e histórico não-derivado | **0117**, **0169** |
| Faturamento: fases, modo teste, a virada | **0134**–**0141** |
| API externa de Solicitações (as-built) | **0172** (supersede 0158–0161) |
| Rebranding Janus | **0145** |
| Harness: core + skills + rituais | **0157** |
| Critérios de limpeza e fechamento da v5 | **0173** |

---

## 7. Convenções da casa — o que é canon e o que é método

**Canon** é o que não se negocia sem um ADR novo. **Método** é como se trabalha, e pode mudar com
uma boa razão registrada.

### Canon

- **Todo dado passa por RPC.** Nada de `.from()` no app.
- **RPC nova nasce** `SECURITY DEFINER` + `app.exigir_acesso` inline + `REVOKE`/`GRANT` explícitos.
  Verificação pós-push é **via REST com service_role** — `db query` não executa o corpo.
- **Cor é sempre token.** Hex ou cor crua do Tailwind em classe quebra o lint (`wt/no-cor-hardcoded`).
  A referência viva é a página `/admin/design-system`; o *porquê* está na skill `ui-design-system`.
- **Coerção de célula vem de um módulo só** (`@/lib/carga/coercao.ts`); reimplementar quebra o lint.
- **Migration destrutiva exige TTY humano**, e não se escreve na pasta `supabase/migrations/` antes
  da hora — `db push` empurra **todo** o conjunto pendente (custou bases dropadas por arrasto na
  v5.2.0). Destrutiva estacionada fica em `supabase/patches/`.
- **Merge humano é a única fronteira de entrada em produção.** O agente não mergeia e não deploya.
- **Decisão de produto é do usuário.** Na dúvida entre técnico e produto, é produto.

### Método

- **Pesquisar antes de codar**: adotar/estender > construir. Reinventar o que já existe é a
  causa-raiz histórica de divergência nesta base.
- **Gates escalonados**: `tsc --noEmit` + `lint` ao fim de cada missão; `build` + `test` na
  fronteira de fase e no fechamento. Não existe `npm run typecheck`.
- **Um commit por missão**, com `git add` de arquivos específicos — nunca `-A`.
- **Prova no ato.** Relatório **aponta**, commit **prova**: nenhuma exclusão sem o grep no momento,
  transcrito na mensagem do commit. "Órfão" por análise estática não é órfão de fato — símbolo
  citado em **runbook ou ADR** é código vivo, e a varredura tem de incluir `docs/`.
- **Auto-auditoria adversarial** antes de declarar concluído, **depois** das correções da revisão:
  corrigir um achado é escrever código novo, e código novo pede a mesma desconfiança.
- **Régua de 5 destinos** para aprendizado novo, nesta ordem: enforcement mecânico > deletar >
  `CLAUDE.md` (teto de 180 linhas) > skill de domínio > ritual. Adicionar é também podar.

---

## 8. As skills — o conhecimento situacional

`CLAUDE.md` é o **core** (o que toda sessão precisa). O resto vive em `.claude/skills/`, e a regra
de ouro é: **antes de implementar numa área, ler a skill do domínio.**

**Nove de domínio:** `banco-e-rpc` · `contrato-rpc-front` · `ui-design-system` · `tabela-densa` ·
`graficos` · `react-padroes` · `email` · `ingestao-planilhas` · `orquestracao`.

**Três rituais invocáveis:** `/nova-versao` · `/fechamento-versao` · `/pos-merge`.

**Duas externas**, que não são do projeto e não seguem suas convenções:
`web-artifacts-builder` e `web-design-guidelines`.

Subagentes (`explorador`, `implementador`, `revisor`, `revisor-db`, `verificador-visual`) recebem
**caminhos** de SKILL.md para ler no próprio contexto — nunca conteúdo colado. São **editores
puros**: não rodam git, banco, build nem servidor.

---

## 9. Utilitários fora do grafo de build

Scripts que **nenhum `import` alcança** — ferramenta de análise ou reprodução manual, e não código
da aplicação. Análise estática (`knip`, `depcheck`) os aponta como mortos; não são. As exceções
estão declaradas em `knip.json`.

| Arquivo | O que é |
|---|---|
| `scripts/dre-oracle.mjs` | oráculo da DRE: recalcula fora do banco para conferir a tela |
| `scripts/gera-seed-dre-competencia.mjs` | gera o seed da DRE por competência |
| `scripts/db-gate/` | o backup-gate: `migrate.mjs`, `gate.mjs`, `classificar.mjs`, `lib.mjs`… — é o que `npm run db:migrate` executa |
| `supabase/seed/seed.ts` (+ `parse-excel.ts`, `load-metas.ts`) | `npm run seed`; usa o caminho **antigo** de carga (`truncate_dynamic_tables`, `inserir_lote_raw`), que por isso **não é órfão** |
| `supabase/seed/seed-fluxo-caixa.ts` | seed do Fluxo de Caixa |

**Três classes de falso positivo de análise estática** já nomeadas nesta base, e é bom reconhecê-las
antes de apagar algo: **chamada por processo** (`execFileSync`), **chamada por configuração** (hook
declarado em `settings.json`) e **citação em Markdown executável** (procedimento de runbook ou ADR
que manda importar o símbolo).

---

## 10. Rotina de dependências

Segurança de dependência **não tinha dono**, e o sintoma foi medido: `next` com advisory HIGH e
correção disponível em *minor* apareceu **três vezes** (28/05, 13/06 e 10/09/2026) antes de alguém
agir. A rotina abaixo é a resposta mínima enquanto não há CI (item **B-16** do backlog v6).

**No fechamento de cada minor**, junto dos gates:

```bash
npm audit            # o que tem advisory
npm outdated         # o que está para trás
```

Critério: **o que tem correção sem major, entra**; o que exige major vira item de backlog com o
CVE nomeado, e **nunca** se usa `npm audit fix --force`. Patch de segurança pode sair como versão
própria (Rota C) fora da fila de produto — foi o que a v5.9.7 fez com duas CVEs críticas de RCE no
`next`.

Os majors represados hoje (`nodemailer` 9→10, `vitest` 3→5, `typescript` 5.9→7, `eslint` 9→10)
estão no backlog v6, cada um com o motivo de não ter entrado.

---

## 11. Estado atual

| | |
|---|---|
| Versão em produção | **v5.9.7** |
| Última migration aplicada | **0270** (`v5_10_0_drop_objetos_orfaos`) — 254 arquivos em `supabase/migrations/` |
| Último ADR | **0173** (critérios de limpeza e fechamento da v5) |
| Suíte | ~1.220 testes, zero `skip` silencioso (há sonda que reprova se aparecer) |
| Documentos | 153 ADRs · 72 briefings (todos da v5; os anteriores saíram na v5.10.0) |
| Banco | 8 schemas, ~75 tabelas e views; só `public` exposto ao PostgREST |

**Onde olhar em seguida:** `docs/WORKING-CONTEXT.md` (o que está em voo agora) · `README.md` (como
rodar) · `CLAUDE.md` (as regras do harness) · `docs/backlog-v6.md` (o que ficou para depois).
