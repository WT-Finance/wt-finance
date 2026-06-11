# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).  
A partir de v4.4.0 este projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/) (ADR-0084).

---

## [4.14.2] — 2026-06-11

Versão PATCH: continuação dos refinamentos de plataforma da 4.14.1 — Design System no menu, nomenclatura mais clara na administração e botões de acessos alinhados às pills de período do Financeiro. ADR-0103 (extensão).

### Adicionado
- **Design System como aba na sidebar** (`/admin/design-system`, ícone Palette), **abaixo de "Usuários e Acessos"**, visível só para quem tiver a permissão `admin/design-system`. A página já era protegida pelo guard; agora tem entrada no menu.

### Corrigido / Melhorado
- **Renomes:** "Usuários & Acessos" → **"Usuários e Acessos"** (sidebar, título e rótulo da área — app + banco via migration **0126**); aba e termos **"Roles" → "Permissões"** em toda a tela de acessos (a chave de área/role no código não muda).
- **Botões da página de acessos no formato das pills de período** (`rounded-full`, borda fina, `px-3 py-1`), com hierarquia: **primária e aba ativa em bege suave neutro** (`--action-soft`/`-border`/`-fg`, espelhando o ativo do tema group); **secundária** cinza contornada; **destrutiva** em tom de perigo. Cor sempre neutra do Group, via tokens dedicados (sem `var(--brand)`). Estilos centralizados em `botoes.ts`.
- **Anel de foco das telas de plataforma só em `:focus-visible`** (teclado): clicar com o mouse numa aba/pill/botão não deixa mais o "sombreado"; inputs de texto seguem mostrando o anel ao clicar.

### Banco
- Migration **0126** (cosmética, já aplicada): rótulo da área `admin/acessos` em `app.rbac_areas` → "Usuários e Acessos". Não altera chaves, permissões nem guards.

## [4.14.1] — 2026-06-11

Versão PATCH: refino visual e de UX das telas de plataforma (login, trocar-senha, solicitar-acesso, sem-acesso, admin/acessos), que nasceram fora da identidade visual. ADR-0103 estendido.

### Corrigido / Melhorado
- **Identidade neutra do Group nas telas de plataforma.** Eliminado o dourado de Weddings (`#BD965C`) hardcoded nessas telas; agora usam tokens neutros dedicados (`--action-primary` #3F4144, `--focus-ring`) e a utilitária `.foco-neutro`, independentes de `[data-theme]` (sem flash dourado pré-hidratação). Abas de setor seguem com suas cores.
- **Telas públicas:** cabeçalho institucional único (logo + wordmark) padronizado nas quatro telas via novo `AuthHeader`; labels em caixa normal (fim do UPPERCASE); banner de erro via tokens `--danger`. No login: link **"Solicitar acesso"** e o texto do esqueci-a-senha movido para **dentro do card**, centralizado; microcopy "Voltar ao login".
- **/admin/acessos:** tabela de usuários no padrão CardTabela (headers caixa normal, `colgroup`, "Último acesso" em `DD/MM/AAAA` sem truncar); ações de linha reduzidas a **Senha** e **Excluir**; **Excluir** agora pede **confirmação** (modal) e **revoga a sessão** do usuário (`auth.admin.signOut`) — herdando o que o "Desativar" fazia; pills no padrão preenchido neutro; checkboxes do design system (componente novo `ui/checkbox`); removido o destaque dourado do chip "Usuários & Acessos".

### Notas
- As RPCs de desativar permanecem no banco (saíram só da UI). Selects nativos mantidos (sem Radix no projeto), com foco neutralizado.

## [4.14.0] — 2026-06-10

Versão MINOR: **login por e-mail + senha** (substitui o magic link como método primário) com troca obrigatória no 1º acesso, e **solicitações de acesso** moderadas pelo admin. Reduz o atrito do login sem depender de SMTP. ADR-0110.

### Adicionado
- **Login por senha** (`/login` → `signInWithPassword`). O magic link sai da tela de login e passa a ser **recuperação/anti-lockout** (rota `/auth/confirm` + botão "Link" no admin).
- **Criação de usuário com senha provisória** (admin): a senha é **exibida na tela (copiável)**, não por e-mail — sem dependência de SMTP. A pessoa é obrigada a trocar no 1º acesso (`/trocar-senha`).
- **Reset de senha pelo admin** ("Resetar senha"): nova provisória + troca obrigatória. Cobre "esqueci a senha".
- **Solicitação de acesso pública** (`/solicitar-acesso`, link "Ainda não tenho conta") + **aba Solicitações** em `/admin/acessos` (aprovar = cria usuário com senha provisória; rejeitar). Nada é criado sem aprovação.
- **Excluir usuário** já existia (v4.13.1); mantido.
- Role **Administrador** (todas as áreas) atribuída ao usuário inicial.

### Segurança
- **Troca obrigatória é portão forte:** com `precisa_trocar_senha` ligada, toda rota autenticada redireciona para `/trocar-senha` (páginas), 403 (APIs) ou bloqueia (actions).
- **`solicitar_acesso`** é o único endpoint público novo (anon): valida e-mail, no máx. 1 pendente por e-mail, nada criado até aprovação. Senha mínima elevada para 8; provisória ≥16.
- Migration **0125** (aditiva): coluna `precisa_trocar_senha`, tabela `app.rbac_solicitacoes` (RLS deny), RPCs (`solicitar_acesso`, `admin_listar_solicitacoes`, `admin_decidir_solicitacao`, `admin_marcar_trocar_senha`, `marcar_senha_trocada`), seed da role Administrador.

### Reversibilidade
- Tudo aditivo. Freio de emergência inalterado: kill switch (`admin_set_enforcement(false)`) + revert do deploy na Vercel (para v4.13.1 = volta ao magic link; para v4.12.1 = app público). Ver runbook.

## [4.13.1] — 2026-06-10

Versão PATCH: robustez do convite/login (pós-ativação da v4.13). Corrige links de acesso que chegavam "inválidos" e fecha lacunas da UI de administração.

### Corrigido
- **Magic link consumido por preview de link** (`/auth/confirm`): a confirmação passa a ser **em dois passos** — o GET só renderiza um botão; o `verifyOtp` roda no **POST** do clique. Bots de pré-visualização (WhatsApp/e-mail/antivírus) fazem só GET e não queimam mais o token de uso único. (Era a causa de "link inválido ao clicar".)

### Adicionado
- **"Link de acesso" por usuário** na tela Usuários & Acessos: re-gera um magic link sob demanda (campo copiável) — resolve o caso de o convite ter expirado/sido consumido e o link não poder ser recuperado.
- **"Excluir" usuário** (irreversível, com confirmação e proteção anti-lockout — não exclui a si mesmo), ao lado de "Desativar" (reversível).

### Alterado
- Validade do link de acesso de **1h → 24h** (config Supabase `mailer_otp_exp`), dando folga para o convidado abrir o link.

### Operação
- O e-mail nativo do Supabase tem limite baixo (2/h) e **SMTP próprio segue pendente** — para convidar em lote, usar o link copiável (não depende de e-mail).

## [4.13.0] — 2026-06-10

Versão MINOR: **autenticação e autorização**. O dashboard deixa de ser público — login obrigatório por **magic link**, cadastro **só por convite**, e permissões **RBAC dinâmicas por área de navegação** (em Performance, granular por setor). Enforcement em 4 camadas com janela de compatibilidade para a `main` seguir funcionando até o merge. ADRs 0106–0109.

### Adicionado
- **Login por magic link** (`/login`, `/auth/confirm` server-side aceitando `token_hash` e `code` PKCE, `/auth/signout`), anti-enumeração, sem signup público. (ADR-0106)
- **RBAC dinâmico** (migration 0119): roles criáveis com qualquer combinação de **11 áreas** de permissão; tabelas `app.rbac_*`; RPCs `admin_*` com anti-lockout; `get_minhas_permissoes`. Seed: role **Financeiro** (acesso total) + `yan@welcometrips.com.br`. (ADR-0107)
- **UI de administração** (`/admin/acessos`): convidar usuário (com link de convite copiável), atribuir role, desativar/reativar; criar/editar roles com matriz de permissões. Quem administra é uma permissão (`admin/acessos`).
- **Sessão SSR** (`@supabase/ssr`): `proxy.ts` (sessão obrigatória em tudo fora de `/login` e `/auth/*`), `getServerClient` por-request (RPCs correm como `authenticated`), guards `requireArea`/`requireAreaApi`/`requireAreaAction`. (ADR-0109)
- **Página standalone do Fluxo de Caixa Gerencial** (`/financeiro/fluxo-caixa/gerencial`) como porta de entrada de quem só tem essa área.
- Testes do mapa de áreas (`areas.test.ts`) + contrato RBAC no `rpc-contrato.test.ts` (paridade catálogo banco↔app, caminho negado, revogações). Suíte 68 → 84.

### Segurança
- **Enforcement em 4 camadas** (ADR-0108): proxy de sessão → guards de área (12 páginas, 23 rotas de API, 3 grupos de server actions) → guards nas RPCs do banco (44 wrappers `SECURITY DEFINER` por área, migration 0121) → **RLS deny-by-default** em todas as 33 tabelas dos 6 schemas (0120) com remoção das policies permissivas herdadas (0123).
- **Correção crítica de exposição** (migration 0122): todas as 72 funções `public` tinham `EXECUTE` para `anon` por *default privileges* do Postgres — incluindo `truncate_dynamic_tables`/`promover_carga_vendas`. Revogadas; `ALTER DEFAULT PRIVILEGES` impede recorrência.
- **Kill switch** (`app.config.auth_enforcement`): liga/desliga o enforcement anônimo no banco sem deploy — base do procedimento de emergência e da compatibilidade com a `main` (S5).

### Notas de ativação (pós-merge)
- Ligar o enforcement (`admin_set_enforcement(true)`), fechar o signup público do GoTrue e convidar os usuários reais — passo a passo no runbook `docs/runbooks/v4-13-auth-runbook.md`.

## [4.12.1] — 2026-06-09

Versão PATCH (saneamento técnico pós-v4.12): unificação dos parsers de Vendas e expansão da validação de contrato (Zod) às RPCs críticas restantes. Sem mudança de comportamento visível — reforça a resiliência da ingestão e a detecção de divergência de dados.

### Corrigido
- **Parser único de Vendas** (M1): a importação de Vendas passa a ter um único parser (`src/lib/carga/vendas-parser.ts`, isomórfico), consumido pela UI (`/admin/uploads`) e pela API Route (`upload-vendas`). A via servidor tinha parser próprio que **não** populava `operacao_propria` — uma carga por ela regrediria silenciosamente a correção da v4.9.x (convidados zerados, datas de evento ausentes, faturamento das operações errado). Casamento de cabeçalho tolerante a acento/caixa/espaço + aviso de coluna não-mapeada, agora nos dois caminhos.
- **`operacao_propria` no pipeline atômico** (M1, migration 0118): `inserir_lote_staging` e `promover_carga_vendas` (introduzidas na 0116) passam a gravar `operacao_propria` — a coluna existia na staging mas nunca era preenchida. Sem isso, unificar só o parser não fecharia a porta.

### Alterado
- **Validação de shape (Zod) nas RPCs críticas** (M2, F7): padrão `parseRpc` estendido de 1 para 8 RPCs — `get_executiva_kpis`, `get_tendencia_margem`, `get_ranking_vendedores_range`, `get_vendas_em_aberto`, `get_vendas_receita_negativa`, `get_operacoes_weddings`, `get_carteira_weddings` (além da semente `get_mix_produto`). Divergência de contrato → log + degradação para estado de erro (nunca quebra a tela em silêncio).

### Testes
- +12 testes do parser unificado (acento, `Data Início`/`Data de Início`, `Date` nativo, coluna não-mapeada, paridade de saída, mapeamento de `operacao_propria`). Suíte: 35 → 47.

---

## [4.12.0] — 2026-06-08

Versão MINOR de saneamento técnico (pós-auditoria v4.11): ingestão de dados resistente a falha, rede de testes automatizados, confiabilidade do dado exibido e fim do fan-out no ranking. F1 (auth) ficou fora por decisão (ver ADR-0029).

### Adicionado
- **Rede de testes (Vitest)** (M2, ADR-0105): unit dos helpers puros (`fmt`, `periodo`, `decomposicao-variacao`, `normalizeHeader`/`toIsoDate`) + contrato das RPCs críticas via REST (shape + invariantes: soma do Mix ≈ 100, margem ≈ receita/faturamento, vendas ≤ limite). Gate novo `npm test`.
- **Ingestão atômica de Vendas** (M1, ADR-0104, migration 0116): carga em staging → pré-validação (range de datas vs `dim_data`, contagem) → swap numa única transação (`promover_carga_vendas`). Falha → rollback → a base nunca fica vazia (corrige F2).
- **`get_ranking_vendedores_range`** (M4, migration 0117): ranking por intervalo agregado no banco.
- **Estado de erro discreto** (`ErroCarregamento`) e helpers `unwrapRpc`/`parseRpc` (Zod) para distinguir falha de RPC de período vazio.

### Alterado
- **Top Vendedores em 1 chamada** (M4, F3): fim do fan-out mensal (até 36 chamadas).
- **erro ≠ vazio** (M3, F5): ~28 desembrulhos de RPC migrados para `unwrapRpc` (erro logado com contexto, não mais silencioso); KPI principal mostra estado de erro em vez de skeleton eterno.
- **Datas locais** (M3, F6): `parseLocalDate` (parse de `YYYY-MM-DD` sem deslocamento de fuso) em `kpi-principal-drawer`, `proximos-casamentos`, `lista-operacoes`.
- **Truncamento sinalizado** (M3, F8): drawers de Vendas em Aberto/Receita Negativa mostram "mostrando X de N".
- **Headers de segurança** (M1, F10): HSTS, X-Frame-Options, nosniff, Referrer-Policy; `bodySizeLimit` 200mb→25mb.
- **React Compiler** (M5, F9, escopado): zerado em `weddings-kpis-section`, `sidebar`, `design-system` (baseline ~25→13; restante = follow-up).
- **Validação de shape (Zod)** (M5, F7): padrão `parseRpc` + `get_mix_produto` (semente; demais RPCs críticas = incremental).
- Flags `MOSTRAR_*` mantidas e documentadas (F12); `docs/changelog.md`/`bugs-resolvidos.md` congelados — `CHANGELOG.md` (raiz) canônico (F13).

### Registro
- **ADR-0104** (ingestão atômica), **ADR-0105** (estratégia de testes), nota de reavaliação no **ADR-0029** (auth admin mantida conscientemente; F1 fora do escopo).

## [4.11.0] — 2026-06-05

Versão MINOR: dois acabamentos — (1) padrão unificado de **card-tabela** nas três abas; (2) **histórico de versões** clicável para a diretoria. Sem migration. ADR-0103 estendido (regra de cor de cash-flow), não criado novo.

### Adicionado
- **Histórico de versões para a diretoria** (M2/M3): o `version X.Y.Z` da sidebar vira clicável (hover sublinha, sem mudar cor) e abre um **modal central** (`ModalCentral`) rolável com o histórico em **linguagem de negócio** — entradas por versão/patch (mais recente no topo), tipo com ícone/cor (Novidade/Correção/Melhoria), descrição e data exata. Fonte: `src/data/changelog-diretoria.ts` (`CHANGELOG_DIRETORIA`), populado **retroativo desde a v4.0** (19 entradas).
- **`CardTabela`** (`@/components/shared/card-tabela`, M1): componente base do padrão de card-tabela + utilitária `.card-tabela-vermais` (Ver mais neutro → cor da aba no hover) + constante `CARD_TABELA_TH`.

### Alterado
- **Padrão unificado de card-tabela** (M1): aplicado a Próximos Casamentos, Mix por Produto, Top Vendedores, Vendas em Aberto e Receita Negativa (Weddings + Trips/Corp). Título único sem subtítulo na página (subtítulo só no drawer); coluna `#` só em rankings; rótulo "no período selecionado" só onde o filtro se aplica; cabeçalho caixa-normal ~11px terciária; `table-fixed` + `colgroup`; Resultado Previsto (operação individual) via `fmtBRL2`. Top Vendedores ganha "no período selecionado". Documentado em `/admin/design-system`.
- **CLAUDE.md** (M4): workflow + DoD ganham o ritual de gerar a entrada no `CHANGELOG_DIRETORIA` a cada versão/patch (linguagem de negócio).

### Registro
- **ADR-0103 estendido** (M4): formaliza que o cash-flow tem **dois contextos de cor deliberados** (identidade turquesa/mostarda nos cards de página de Weddings vs semântica `--positive`/`--negative` no drawer de operação) — **regra, não dívida**. Encerra a pendência antiga.

## [4.10.1] — 2026-06-05

Versão PATCH: alinha o layout de **Trips e Corporativo** ao padrão de Weddings — uma única seção "Visão Geral" (recolhível) com card KPI principal único e clicável, no lugar dos KPIs soltos.

### Alterado
- **Layout Trips/Corp no padrão Weddings:** `PerformanceContent` reorganizado em uma única `TopSection "Visão Geral"` contendo, nesta ordem: pills de período → **card KPI principal único** (Faturamento | Receita Bruta | Margem, clicável, abre o drawer rico por setor) → **Mix por Produto** ("no período selecionado") **|** **Top Vendedores** → **Vendas em Aberto** **|** **Vendas com Receita Negativa**.
- **Card KPI unificado:** os 6 KPIs soltos deram lugar a um único card clicável (mesmo visual do card de topo de Weddings). `KpiColuna` extraído para componente compartilhado (`@/components/shared/kpi-coluna`); novo `KpiPrincipalCard` genérico por setor.
- **Vendas com Receita Negativa** (Trips/Corp): passa a usar o card de Weddings (conceito "receita bruta negativa"), alimentado pela nova RPC `get_vendas_receita_negativa(p_setor, …)` (migration 0115). Antes a tela mostrava Prejuízos (margem negativa).

### Removido (código preservado)
- Seções **Mix por Setor**, **Tendência de Margem** e **Prejuízos (margem negativa)** saíram da visão de Trips/Corp, atrás da flag `MOSTRAR_SECOES_LEGADAS` (recuperáveis). A Tendência de Margem segue acessível dentro do drawer rico (card KPI → "Ver mais").

## [4.10.0] — 2026-06-04

Versão MINOR: **ativa as abas Trips e Corporativo** (a infra já existia — RPCs por setor, tokens de cor, PerformanceContent) e **padroniza o sistema de cores** de toda a plataforma sob a paleta canônica (ADR-0103, extensão do 0095).

### Adicionado
- **Abas Trips e Corporativo ativas** (M8): removido o gate `?preview=1`; `/performance/trips` (setor Lazer) e `/performance/corporativo` renderizam a Visão Geral padrão.
- **Drawer rico parametrizável por setor** (M2): Faturamento/Receita de Trips/Corp abrem o `KpiPrincipalDrawer` (Indicadores + Comparação Ano Anterior + Tendência de Margem), com as seções de subsetor **podadas** quando setor ≠ Weddings. Weddings mantém os subsetores.
- **Pills de período** no PerformanceContent (M3), no lugar do dropdown; pill ativa na cor da aba.
- **Top Vendedores** no PerformanceContent (M5): Faturamento + Receita por vendedor (5 + "Ver mais"), agregado pelo período via `get_ranking_vendedores` (mensal) somado pelos meses do intervalo.
- **Vendas em Aberto** por setor (M6): nova RPC `get_vendas_em_aberto(p_setor, …)` (migration 0114) generalizando a lógica weddings; Receita Negativa já presente como Prejuízos (`get_prejuizos` por setor).

### Alterado
- **Sistema de cores canônico** (M1, ADR-0103): cor por contexto semântico, sempre via token. **Margem** em `--brand-deep` (elimina o indigo `#6366f1`). **Fallback de subsetor** central (`--brand`, fim do `#BA7517` hardcoded). **Mix por Produto** com tokens de texto (fim dos cinzas Tailwind crus). **Cash-flow:** semântica `--positive`/`--negative` no drawer de operação e no Financeiro; os **cards de cash-flow de Weddings** (Fluxo de Caixa Mensal, Acumulado de Recebimentos e Pagamentos) mantêm a **identidade visual** turquesa/mostarda (decisão de id visual — ver "Telas").
- **Afordância de clique** (M4): card clicável usa `.card-clicavel` — hover assume a cor da aba; fim do azul hardcoded.
- **CAGR ocultado** de Trips/Corp via flag (M7), código mantido (pendência futura).
- **Fluxo de Caixa Mensal de Weddings:** rótulos dos totais não liquidados "A RECEBER"/"A PAGAR" → "Total a receber"/"Total a pagar" (caixa normal, não mais uppercase).

### Telas que mudaram de cor (intencional)
- Weddings — **Tendência de Margem** no drawer simples (indigo `#6366f1` → `--brand-deep` oliva).
- Financeiro — gráfico de fluxo acumulado: tokenização do ponto negativo (`#B85C5C`→`--danger`, **sem mudança visual**).
- Mix por Produto — textos de valor passam de cinza Tailwind para tokens (variação mínima).
- (Os cards de cash-flow de Weddings **não** mudam de cor — decisão de manter a identidade turquesa/mostarda.)

---

## [4.9.2] — 2026-06-04

Patch de integridade de dados sobre a v4.9.1. Re-baseia faturamento/receita/hotel das operações Weddings na Operação Própria, removendo contaminação do vínculo por `venda_n`. ADR-0102.

### Corrigido
- **Faturamento/receita/hotel/contrato/subsetor de operações Weddings contaminados pelo `venda_n`** — esses dados de Vendas eram derivados do join por `venda_n` (digitado nos Lançamentos), que apontava para vendas de outros casamentos. Caso confirmado: *W - Darlene e Adnan* exibia R$ 375.523 que eram **100% da W - Daniella e Augusto** (e a Daniella era contada duas vezes). Agora vêm da soma por **Operação Própria** (faturamento real da Darlene: R$ 8.999). Das 231 operações casadas, 214 ficam idênticas; mudam só as ~17 contaminadas; total Weddings ajusta de R$ 44,38 Mi → R$ 44,14 Mi (remoção das duplas contagens).
- A correção abrange **a dim** (`regenerar_dim_operacao_weddings`, migration 0112: faturamento/receita/hotel) **e as RPCs** (migration 0113), pois a Lista de Operações e o drawer **recalculavam** faturamento/receita/subsetor/contrato por `venda_n` em vez de ler a dim. Com isso, o `venda_n` deixa de alimentar qualquer dado de Vendas na área Weddings — alinhando ao mapa de fontes: Hotel/Data/Duração/Contrato/Conv./Faturamento ← Vendas; Resultado Previsto ← Lançamentos; Margem = Resultado Previsto ÷ Faturamento.

### Pendências sinalizadas
- **Curadoria ERP:** corrigir os `venda_n` trocados nos Lançamentos (44374/44025/49444) e alinhar nomes de operação defasados (*Camila e Bruno* "SET"≠"SEP"; *Thelma* "DDMMAA") — estas ficam com faturamento 0 / "sem data" na Lista até o alinhamento.

---

## [4.9.1] — 2026-06-04

Patch de integridade de dados sobre a v4.9. Corrige a ingestão da coluna Operação Própria e a data do evento na Carteira e na Lista de Operações. ADR-0101.

### Corrigido
- **Parser de Vendas por Produto descartava a coluna "Operação Própria"** — o arquivo do ERP traz o cabeçalho como `Operação Propria` (sem acento em "Própria") e o parser casava `Operação Própria` ao pé da letra. Agora o casamento de cabeçalhos é **tolerante a acento/caixa/espaço** (corrige também `Mes`→`Mês`), e colunas não-mapeadas são avisadas no console em vez de sumirem em silêncio.
- **3 casamentos apareciam no ano errado** na Carteira: Vendas × Entrega e na Lista de Operações. A `data_evento` era derivada pelo `venda_n` (digitado no Lançamentos), que apontava para o contrato de outro casamento de nome parecido (ex.: *Paula e Fernando* ligada à venda da *Paula e Bruno*). Agora `data_evento` vem **sempre da `Data Início` da linha `Contrato de casamento` da base de Vendas, casada pela Operação Própria** — as 3 voltam a 2027.

### Alterado
- **Carteira: Vendas × Entrega** passa a ser construída **somente da base VendasPorProduto** (`get_carteira_weddings`): cada casamento = 1 linha `Contrato de casamento`; linha = ano de Data Venda, coluna = ano de Data Início; faturamento/receita = soma dos produtos da operação. Não depende mais de `dim_operacao_weddings`.
- **`regenerar_dim_operacao_weddings`** deriva `data_evento` e `data_venda_contrato` da Operação Própria (linha `Contrato de casamento`), sem fallback por `venda_n`. Operação com nome defasado no Lançamentos fica "sem data" honesto até alinhamento no ERP.

### Pendências sinalizadas
- `faturamento`/`receita`/`hotel` da dim ainda derivam do `venda_n` (mesma contaminação) — follow-up para re-basear na Operação Própria.

---

## [4.9.0] — 2026-06-03

Versão de **integridade de dados**: corrige três bugs de DADO que uma camada de transformação mascarava (Carteira, Convidados, Gerencial), adiciona uma coluna que elimina um join frágil, e leva ajustes visuais conectados (Weddings/Financeiro). ADRs 0097–0100.

### Corrigido
- **Carteira inventava o ano do evento** quando a Data Início era nula — o ETL caía num fallback que parseava o NOME da operação ("…11MAY27" → 2027). Agora `data_evento` usa **somente a Data Início real** do contrato; ausência → **"sem data"** honesto (detector de cadastro incompleto). Função órfã `extrair_data_evento` removida. (M1, migration 0105, ADR-0097)
- **Importação Gerencial invertia dia/mês** — o parser lia a data como **string** no formato de exibição da célula (americano `mm-dd-yy`) e a heurística DD/MM a invertia em junho. Passa a ler o **valor `Date` nativo** do Excel (inequívoco), com a heurística de string só como fallback. Após o re-import, os ~143 registros invertidos são limpos e a Visualização Agregada reflete junho. (M4, ADR-0099)
- **Contagem de convidados** dependia de um join frágil Vendas×Lançamentos. Passa a usar **filtro direto** por `operacao_propria` nas Diárias de Hospedagem (split de Passageiros por vírgula + normalização + DISTINCT + COUNT). (M3, migration 0109 — aplicada após o re-upload, ADR-0098)

### Adicionado
- **Coluna "Operação Própria"** em Vendas por Produto (vinda do ERP): vincula diárias à operação sem cruzar bases. Parser passa a ler a coluna; `raw.vendas_excel` ganha `operacao_propria`. Bundle: corrige também o header da **Data Início** (`'Data de Início'` → `'Data Início'`), que não era ingerido — após o re-upload, a Carteira (M1) volta a ter datas reais. (M2, migration 0107, ADR-0098)
- **Entradas/saídas não liquidadas** no canto do gráfico "Fluxo de Caixa Mensal de Weddings": dois KPIs discretos com o total a receber e a pagar pendentes, independente da data de vencimento. (M5, migration 0106)

### Alterado
- **Resultado Previsto unificado** = `entradas_total − saidas_total` na tabela Lista de Operações **e** no drawer (mesma fórmula explícita, exposta por `get_operacoes_weddings`). Nota: `resultado_caixa` já era coluna gerada igual a essa fórmula, então os **valores exibidos não mudaram**; a unificação agora é explícita no código. Rodapé do Fluxo de Caixa do drawer (Resultado de Caixa / Resultado Previsto / NCG) re-alinhado. (M6, migration 0108)
- **2 casas decimais** em todo valor monetário de **contexto de operação individual** (Lista de Operações e drawer), via helpers centrais `fmtBRL2`/`numBRL2`. Valores agregados e eixos de gráfico permanecem abreviados ("R$ 1,8 Mi"). Convenção documentada em `/admin/design-system`. (M8, ADR-0100)
- **Composição dos Lançamentos** (Fluxo de Caixa Gerencial) em **largura total**: dois donuts maiores (Entradas/Saídas) acima e tabela de decomposição em duas colunas abaixo (Grupo · % · Valor + Total + "Outros"). Drill preservado. (M7)

### Removido (da visualização; mantido no código)
- **Posição por Conta** (Fluxo de Caixa Gerencial) ocultada via flag `MOSTRAR_POSICAO_POR_CONTA` (componente e RPC preservados para revisão futura). (M7)

---

## [4.8.2] — 2026-06-02

Patch de refinamento visual (Weddings). Sem capacidade nova, sem migration.

### Alterado
- **Drawer "Análise Histórica":** pills de período grudadas ao cabeçalho (sem fresta); subtítulo "Indicadores" acima dos KPIs; "Não Classif." removido dos gráficos de Faturamento/Receita por Subsetor e da legenda; gráficos "Comparação Ano Anterior" e "Tendência de Margem" alinhados verticalmente (eixos Y de mesma largura); na Comparação, as linhas do período atual param no mês corrente (não se estendem até o fim do ano).
- **Drawer da Lista de Operações:** Duração, Tipo de Contrato e Convidados agora em dourado (como os demais); Fluxo de Caixa reorganizado — "A receber" abaixo de "Recebido", "A pagar" abaixo de "Pago", e a linha de baixo com **Resultado de Caixa**, **Resultado Previsto** (entradas − saídas totais) e **NCG**.
- **Próximos Casamentos a Entregar:** coluna "Data do Evento" → "Data" no formato "17 de jun de 2026"; tabela do card sem rolagem horizontal em telas menores (`table-fixed` + truncate, mantendo as 4 colunas — Data/Casal/Hotel/Resultado); pills do drawer agora flutuantes (sticky, sem fresta).
- **Carteira: Vendas × Entregas:** removidos os filtros Faturamento e Receita Bruta — exibe apenas Casamentos (sem seletor); RPC chamada 1× (antes 3×).
- **Lista de Operações — alinhamento das colunas:** Duração à **direita**; Contrato e Conv. **centralizados**; Faturamento e Resultado Previsto em **formato contábil** ("R$" à esquerda, valor à direita).
- **Duração** (Lista de Operações e drawer) passa a ser exibida em **meses com 1 casa** ("3,7 meses") em vez de dias.
- **Eixo Y sem quebra** nos gráficos de Weddings (Fluxo de Caixa Mensal e Acumulado); `fmtAxisBRL` passou a formato compacto (1 casa em Mi / 0 em k).
- **Cards de subsetor:** Receita/Margem alinham entre cards em telas menores (`flex flex-col h-full` + rodapé `mt-auto`); o valor principal não quebra mais em 2 linhas no layout de 5 colunas (`whitespace-nowrap` + fonte reduzida em `lg`).

### Corrigido
- Ordenar a Lista de Operações por **Duração, Contrato ou Convidados** retornava **HTTP 400** — o `z.enum` de `ordenar_por` na API route não incluía `duracao`/`tipo_contrato`/`convidados` (a RPC já suportava). Adicionados ao enum.

### Removido (da visualização; mantido no código)
- Cards "Vendas em Aberto" e "Vendas com Receita Negativa" ocultos via flag `MOSTRAR_VENDAS_DIAGNOSTICO` (componentes preservados para retorno futuro).

---

## [4.8.1] — 2026-06-01

Patch de refinamento visual sobre a v4.8 — drawers de Weddings, padrão de gráficos e cards clicáveis. Sem capacidade nova (refina dentro dos ADRs 0095 e 0096).

### Alterado
- **Drawer "Análise Histórica":** eixo Y sem quebra de linha em Faturamento/Receita por Subsetor e na Comparação Ano Anterior; **Comparação Ano Anterior** agora plota **4 linhas** (Faturamento + Receita, atual sólido / ano anterior tracejado; cor distingue métrica, traço distingue período) e o título perde "(Faturamento)"; pills sticky grudadas ao cabeçalho (sem fresta); tooltip de subsetor com nome à esquerda / valor à direita.
- **Drawer da Lista de Operações:** **Caixa Acumulado** agora mostra **duas linhas separadas** — Entradas (verde) e Saídas (vermelho) — cada uma com trecho efetivo sólido + projetado tracejado e marcador "hoje"; largura igualada à do drawer principal; KPIs 3×2 sem bordas pretas (divisórias finas); mais espaçamento entre seções.
- **Tooltip primitivo** (`CustomTooltip`): valores com `tabular-nums` (dígitos alinhados em todos os gráficos que o usam).

### Adicionado
- **Afordância de card clicável:** hover na cor da aba (borda + sombra + CTA "Ver mais" → `var(--brand)`). Utilitária `.card-clicavel`/`.card-clicavel-cta`; aplicada ao card KPI de Weddings (dourado), documentada na `/admin/design-system`. Vira convenção (abas futuras herdam pela var de tema).
- Token `--text-secondary` (#4B4F54) que estava documentado mas ausente em `tokens.css`/`globals.css`.

### Banco
- Migration **0104** — `get_operacao_weddings`: `acumulado_mensal` reescrito para `entrada_efetiva`/`entrada_projetada`/`saida_efetiva`/`saida_projetada` (entradas e saídas separadas), em vez de saldo único.

---

## [4.8.0] — 2026-06-01

Consolidação da área de dados + padrão de gráficos + reformulações Weddings. Dois temas paralelos independentes + faxina.

### Adicionado
- **Padrão de gráficos do design system** (ADR-0095): primitivos reutilizáveis em `@/components/charts` (tema Recharts central, grade/eixos/linha-do-zero, `ChartLegend`, `CustomTooltip` estendido, `fillMonths` para eixo temporal contínuo) + formatadores de eixo em `fmt.ts` (`fmtAxisBRL`/`fmtAxisPct`/`fmtAxisMes`) + cores de setor/subsetor consolidadas em `config.ts`. Documentado na `/admin/design-system` (§8) com showcase e convenção sólido/tracejado. Migração dos gráficos legados é incremental.
- **Lançamentos por Categoria** e **Fluxo de Caixa (CAP/CAR)** no menu unificado `/admin/uploads` (antes em página separada), reusando parsers e RPCs existentes.

### Alterado
- **Área de upload unificada** (ADR-0094): aviso forte (modal com contagem antes/depois) em **todas** as 4 bases; texto explicativo por base ("substitui toda a base; importe sempre o arquivo completo"); página dirigida por configuração. `/admin/uploads/financeiro` agora redireciona para `/admin/uploads`.
- **Drawer da Lista de Operações de Weddings** reformulado (ADR-0096): cabeçalho empilhado sem badge; Informações Gerais 3×2 (Duração/Tipo de Contrato/Convidados + Faturamento/Receita Bruta/Margem Bruta); Fluxo de Caixa com NCG (A pagar − A receber, sem rótulo); Composição por Subsetor (tabela completa); Caixa Acumulado Efetivo (sólido) + Projetado (tracejado) com marcador "hoje". **Removida a Equação Financeira** (Custos Internos não confiáveis), a Receita por Subsetor antiga e o Detalhamento dos Lançamentos.
- **Drawer "Análise Histórica" de Weddings** (polish): legenda dos subsetores entre os dois gráficos stacked; gráfico de Receita com escala Y independente; faixa de KPIs 3×2 sem vazio à direita; eixos sem quebra (primitivos do padrão de gráficos).

### Removido
- **Base morta "Vendas por Forma de Pagamento"** (`raw.vendas_pagamento`: 0 linhas, 0 consumidores) — código (parser/action/tipos/card) + tabela + RPCs.
- Action órfão `fetchWeddingsComposicao` (sem callers).
- RPCs órfãs `truncar/inserir_lote/contar_contas_pagar_receber` (tabela dropada na v4.2).

### Banco
- Migration **0102** — dropa `raw.vendas_pagamento` + suas RPCs (M3) e as RPCs órfãs de `contas_pagar_receber` (faxina #4).
- Migration **0103** — estende `get_operacao_weddings` (tipo_contrato, convidados, data_venda_contrato, decomposição no formato SumarioSubsetor, caixa acumulado efetivo/projetado contínuo).

### Notas
- Faxina #1 (`get_fluxo_caixa_kpis_b`): investigação mostrou que `_b` (KPIs de período da Visão Geral) e `_diario` (posição atual + 10 dias) **não são equivalentes** e ambas são usadas pela página. Decisão: **manter as duas**, não dropar `_b`.
- Carga incremental e DRE permanecem fora de escopo (reservadas; a dor de atualização será resolvida por RPA).

---

## [4.7.1] — 2026-05-31

Patch com dois ajustes pedidos pela diretoria na aba Weddings.

### Alterado
- **Lista de Operações:** removidas as colunas Rec. Bruta, Mg. Bruta e Custos; Rec. Líq. renomeada para **Resultado Previsto** e Mg. Líq. para **Margem** (12 → 9 colunas; aplicado em cabeçalhos, células, export Excel, colSpan e skeleton)
- **Card KPI Comercial:** passa a exibir o **nº de Contratos de Casamento vendidos** no período (em vez de faturamento), com YoY da contagem; Receita e Margem mantidas

### Banco
- Migration 0099 — `get_sumario_subsetor` estendida com `n_contratos` por subsetor (`COUNT(DISTINCT venda) FILTER produto = 'Contrato de Casamento'`)

---

## [4.7.0] — 2026-05-29

### Adicionado
- Drawer "Análise Histórica" de Weddings: KPIs em faixa 3×2 no topo + dois gráficos stacked por subsetor (Faturamento e Receita, mesma escala Y) + Composição por Subsetor sem box (ADR-0092)
- Composição dos Lançamentos com dois donuts (Entradas/Saídas) + agregação "Outros" + drill-down por categoria em lista (ADR-0093)
- API Route `/api/gerencial/import` (runtime nodejs) para importação de planilha — resolve PEND-001 (ADR-0091)
- RPC `get_weddings_historico_subsetor` (migration 0097) — série mensal por subsetor
- RPC `get_decomposicao_categoria` + correção de `get_decomposicao_grupo` (migration 0098)
- ADR-0091 (importação via API Route) + ADR-0092 (drawer Análise Histórica) + ADR-0093 (Composição donuts)

### Alterado
- Pills do drawer Weddings: Este ano / Últ. 3m / Últ. 6m / Últ. 12m / Personalizado (month picker, trava futuro); pills sticky
- Composição por Subsetor removida da vista principal de Weddings (agora vive só no drawer)
- Calendário de Liquidez: novo formato de dia com labels "A receber"/"A pagar"/"Saldo", sem sinais +/−; valor do Saldo em destaque
- Projeção diária do Gerencial fixa em 15 dias

### Corrigido
- PEND-001: importação de planilha Gerencial — `@e965/xlsx` isolado do contexto RSC via API Route
- Parser de importação robusto: valores monetários formatados (`R$ 1,000.00` US e BR), datas `DD/MM/YYYY` brasileiras, tipo case-insensitive
- Bug de agregação na Composição dos Lançamentos: grupos de categoria duplicados (uma linha por mês) → agregação correta por grupo no período

---

## [4.6.1] — 2026-05-28

### Adicionado
- Logos SVG Welcome Group e Welcome Weddings (alta resolução, @2x, @3x)
- Ícones do browser: `favicon.ico`, `icon.svg` com dark mode (`@media (prefers-color-scheme: dark)`), `apple-icon.png` (180×180), ícones PWA `icon0.png` (192×192) e `icon1.png` (512×512)
- Layout admin compartilhado (`src/app/admin/layout.tsx`) adicionado neste patch

### Corrigido
- Logo sidebar: `object-cover` → `object-contain` + `origin-left` corrige corte à esquerda no SVG
- Sidebar usa logos `.svg` em vez de `.png` (qualidade superior)
- `layout.tsx`: removidas referências manuais a `/apple-touch-icon.png` e `/favicon.ico` (Next.js auto-detecta os arquivos em `src/app/`)
- `icon.svg`: dark mode usa branco (`#FFFFFF`) em vez de dourado
- Link Weddings em `em-construcao.tsx` restaurado com cor `text-[#BD965C]`

### Pendência técnica registrada
- **Importação de planilha Gerencial (PEND-001)**: importação via Excel não funciona em produção — erro "An error occurred in the Server Components render" ao chamar `computeImportDiff` como Server Action. Parsing no browser funciona (`parseGerencialExcel`), dados chegam ao servidor, mas a execução da Server Action causa falha no re-render do Server Component. `ImportDrawer` foi isolado com `next/dynamic ssr:false` mas o erro persiste. Ver seção de investigação no out-briefing.

---

## [4.6.0] — 2026-05-28

### Adicionado
- Fluxo de Caixa Gerencial — terceira seção da sub-aba, com Visualização Agregada e Base de Dados
- Importação de planilha Excel de curadoria com mesclagem inteligente e preview de diff
- CRUD inline de lançamentos gerenciais (edição, adição e remoção de linhas)
- Saldos iniciais editáveis por conta (Itaú, Asaas, Blimboo, Clara)
- Projeção diária acumulada espelhando cálculo da planilha de curadoria
- Tokens semânticos de gráfico: `--chart-axis-tick`, `--chart-grid`, `--chart-success`, `--chart-warning`, `--chart-danger`, `--chart-neutral`, `--chart-info`
- Layout admin compartilhado em `src/app/admin/layout.tsx`
- ADR-0089 — Fluxo de Caixa Gerencial
- ADR-0090 — Tokens semânticos de gráfico
- `aria-label` em inputs date dos filtros de período

### Alterado
- 25+ hex hardcoded em componentes Recharts substituídos por `var(--chart-*)`
- Subtítulo diferenciador na Section "Fluxo de Caixa Diário": *Baseado em lançamentos de Contas a Pagar/a Receber*
- Migrado `xlsx` para `@e965/xlsx` (fork ativamente mantido, sem vulnerabilidades)

### Removido
- Vista admin `/admin/contas-bancarias` (não utilizada na prática)
- 6 RPCs órfãs: `get_fluxo_caixa_mensal`, `get_fluxo_caixa_mensal_b`, `get_historico_12m`, `get_proximos_vencimentos`, `get_proximos_vencimentos_v2`, `get_config_numeric`

### Corrigido
- Vulnerabilidades npm via `npm audit fix` (`brace-expansion`, `ws`, `next`)
- `labelFormatter` em `CustomTooltip` tipado corretamente para compatibilidade com Recharts

---

## [4.5.0] — 2026-05-28

### Adicionado
- Tokens CSS semânticos para cores de subsetores Weddings (`--subsetor-comercial`, `--subsetor-planejamento`, `--subsetor-producao`, `--subsetor-hospedagens`, `--subsetor-extras`)
- Página `/admin/design-system` — catálogo visual de tokens e componentes
- Filtros de tipo (Todos / A pagar / A receber) em Próximos Lançamentos com pills sticky no drawer
- Parâmetro `p_tipo` na RPC `get_proximos_lancamentos` (migration 0091)
- YoY nos cards de subsetor Weddings — aguarda extensão da RPC `get_sumario_subsetor` (pendência M3b)
- Relatório de audit completo em `docs/audits/2026-05-28-audit-completo-v4-5.md`
- ADR-0087 — Tokens semânticos consolidados
- ADR-0088 — Filtros sticky e padrão tabular em Próximos Lançamentos

### Alterado
- Próximos Lançamentos reformulado em formato tabular com 3 colunas (ícone+data | pessoa/descrição | valor)
- Card principal KPIs Weddings: padding compactado (sem vazio excessivo abaixo de "Ver mais ›")
- Cards Weddings: removido indicador MoM — exibido apenas YoY
- "Composição do Período" renomeada para "Composição dos Lançamentos" com subtítulo "no período selecionado"
- Cores de subsetores migradas de hex hardcoded para tokens semânticos `var(--subsetor-*)`
- Nota retroativa adicionada ao ADR-0071/0081 sobre uso de `var(--danger)` em pontos de gráfico negativos

### Corrigido
- Função `calcularDuracao` em Lista de Operações Weddings: timezone-safe + silencia durações negativas
- Import não usado em `periodo-filter.tsx`
- Card residual com `border border-[--border]` migrado para `shadow-sm`

### Removido
- RPC `get_sparklines` — morta no frontend desde v3.9 (migration 0090)
- Migration 0089 (`get_kpi_weddings_drawer`) descartada definitivamente — drawer KPI usa RPCs existentes

### Pendências registradas para v4.6+
- YoY nos cards de subsetor (aguarda extensão da RPC `get_sumario_subsetor`)
- Middleware de proteção `/admin/*` (atualmente depende de proteção upstream)
- 7 RPCs órfãs no banco
- Vulnerabilidades npm (next, xlsx — sem fix oficial disponível)
- Ver relatório completo em `docs/audits/2026-05-28-audit-completo-v4-5.md`

---

## [4.4.0] — 2026-05-27

### Adicionado
- ADR-0084: modelo de versionamento X.Y.Z formal
- ADR-0085: padrão único de Card no design system (sem sombra, border-radius 12px)
- ADR-0086: drawer rico para KPI principal Weddings
- CHANGELOG.md na raiz do repositório
- Sidebar exibe versão completa MAJOR.MINOR.PATCH
- KPIs Weddings reformulados: 1 card principal + 5 subsetores (Layout A)
- Drawer rico no card principal Weddings (gráfico, YoY, tendências, métricas, composição)
- Vista admin `/admin/contas-bancarias` para classificação de dim_conta_bancaria
- CalendárioLiquidez redesenhado: heatmap com intensidade proporcional ao saldo
- Tabela Próximos Lançamentos redesenhada: formato minimalista com paleta dessaturada
- Drawer Próximos Casamentos: pills 3m/6m/12m + subtítulo

### Alterado
- Padrão visual de Card unificado em todo o produto (sem sombra, rounded-xl)
- Sidebar mostra 'version 4.4.0' com 3 níveis (era major.minor)
- Gráficos Fluxo Mensal e Acumulado com eixo X alinhado verticalmente

### Corrigido
- Fundo vermelho removido das linhas da tabela Vendas com Receita Negativa
- RPC `get_proximos_lancamentos_10d` substituída por `get_proximos_lancamentos(p_dias)`
- UNIQUE constraint adicionada em `analytics.dim_produto_subsetor.produto_normalizado`

### Removido
- RPC `get_proximos_lancamentos_10d` (inerte após migração para versão paramétrica)

---

## Referência histórica (versões pré-convenção)

*Versões anteriores a 4.4.0 não seguiam a convenção X.Y.Z formal. Reclassificadas retroativamente como referência — ver ADR-0084.*

| Versão | Data aprox. | Principais mudanças |
|---|---|---|
| 4.3.0 | Maio 2026 | Reformulação visual Fluxo de Caixa; CalendárioLiquidez; ProximosLancamentos lateral |
| 4.2.0 | Mai 2026 | Feedback gestora Weddings; Composição por Subsetor; Vendas por Produto drag-and-drop |
| 4.1.0 | Abr 2026 | Fluxo de Caixa Abordagem B (regime caixa-banco); TopSection accordion |
| 4.0.0 | Mar 2026 | Aba Financeiro completa com Fluxo de Caixa v1 |
