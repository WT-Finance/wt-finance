# Briefing v5.6.0 — Gestão de Pessoas: Inventário de ativos

**Tipo:** MINOR *(módulo novo + seção nova de sidebar; confirmar numeração no `/nova-versao` conforme a fila com a v5.5.0)* · **Migrations:** **aditivas** (schema `patrimonio` novo — 5 tabelas + RPCs) · **ADR:** novo (razão append-only com estado derivado + seção nova de navegação — fechar ao FINAL da versão) · **Base:** `main` (após merge da v5.5.0) · **Branch:** `feat/v5-6-0-inventario-patrimonio` · **Rota A**

> ## ⛔ GATE — M0 antes de qualquer migration
> A **M0** entrega os mockups interativos das telas no design system do Janus (tema neutro Group) e **PARA** para o OK do Yan. Zero migration, zero tabela antes do OK. Existe um mockup provisório fora do DS (`patrimonio_welcome_group.html`, aprovado funcionalmente em Chat) que serve de **referência funcional** — o que a M0 precisa provar é a convivência com a sidebar, a seção nova e o tema neutro, não as funcionalidades.

## Objetivo

A empresa não sabe quem está com o quê. Entra o **Inventário de ativos**: cadastro de máquinas e equipamentos com ficha patrimonial documental, e um **razão append-only de movimentações** que responde "onde esteve, com quem, desde quando e por quê". Primeiro módulo da seção nova **Gestão de Pessoas** na sidebar. Cadastro 100% manual — não existe planilha a importar.

## Modelo de dados (firme — embutir, não rediscutir)

O razão é a fonte da verdade. **Localização e status do ativo são derivados da última movimentação, nunca colunas em `patrimonio.ativo`.**

- **`patrimonio.ativo`** — só identidade e ficha: `codigo` (UNIQUE normalizado, sequência server-side `WG-0001` com override manual permitido), `categoria_id`, `descricao`, `numero_serie`, `fornecedor`, `data_aquisicao`, `valor_aquisicao`, `nota_fiscal`, `estado_conservacao` (enum novo/bom/regular/ruim), `obs`, auditoria. **Não tem** `area_id`, `detentor_id` nem `status`.
- **`patrimonio.movimentacao`** — append-only. `ativo_id`, `tipo` (enum), `data_movimentacao`, **destino** (`detentor_destino_id` FK / `area_destino_id` FK / `destino_texto`), `motivo_baixa` (enum: venda/descarte/perda/doação/sinistro), `obs`, `registrado_por` (uuid **da sessão**, nunca digitado), `criado_em`. **CHECK por tipo** governa quais campos de destino são obrigatórios e quais são nulos.
- **`patrimonio.detentor`** — `nome` (UNIQUE normalizado) + `ativo` (boolean). Duas colunas, de propósito. Cadastro inline pelo próprio combobox. **Sem vínculo com usuário da plataforma** — decisão consciente; o caminho de volta é `ADD COLUMN usuario_id uuid NULL` um dia, puramente aditivo.
- **`patrimonio.categoria`** e **`patrimonio.area`** — `nome` (UNIQUE normalizado), `ordem`, `ativo`. Seed. Categoria: Informática, Mobiliário, Eletrônicos, Telefonia, Veículos, Outros. **Área = departamento administrativo, NÃO os três setores de negócio** — rótulo distinto na UI para não colidir com a taxonomia Trips/Weddings/Corporativo do resto da plataforma. Lista do seed confirmada pelo Yan no checkpoint.
- **Local e terceiro** (assistência técnica, sala) ficam como **texto livre com datalist** em `destino_texto`. Assimetria deliberada: pessoa vira tabela porque exige agregação ("o que a Maria tem?"); ninguém vai perguntar "quantos itens estão na assistência X". Se um dia perguntar, promove.

**Tipos de movimentação (enum):** `cadastro` (abertura) · `transferencia` · `devolucao_estoque` · `envio_manutencao` · `retorno_manutencao` · `emprestimo` · `baixa` · `reativacao`. O tipo de destino (colaborador/área/estoque/terceiro/baixa) é **derivado** do tipo por mapa fixo — não é coluna. **Status derivado** do tipo da última movimentação: em uso / em estoque / em manutenção / emprestado / baixado.

**`reativacao` existe para não criar deadlock:** ativo baixado bloqueia novas movimentações na UI; se a baixa foi erro, append-only exige um caminho de volta, e ele é uma movimentação explícita e auditável — não um DELETE.

## Invariantes (inegociáveis)

1. **Estado derivado, fonte única.** Área, detentor e status saem de `DISTINCT ON (ativo_id) ... ORDER BY data_movimentacao DESC, criado_em DESC`. Nenhuma coluna espelho em `ativo`, nem "cache".
2. **Origem NÃO é armazenada — é derivada.** A origem de uma movimentação é o destino da anterior na cadeia. Com movimentação retroativa liberada, gravar origem como snapshot **garante** divergência entre a coluna e a cadeia. Só o destino é gravado.
3. **Localização muda SÓ por movimentação — trava na RPC, não na UI.** `atualizar_ativo` **rejeita** qualquer tentativa de tocar localização. É aqui que "movimentação ≠ correção de cadastro" deixa de ser conceito e vira código.
4. **Append-only.** Movimentação não se edita nem se deleta: só `obs` é editável (via diário genérico da v5.3.0). Erro de destino se conserta com **nova movimentação**.
5. **Todo ativo nasce com movimentação de abertura** (`tipo = cadastro`), na mesma transação do INSERT. Nunca existe ativo sem razão — o razão é consistente desde a linha 1.
6. **Destino estruturado, nunca prosa.** A frase "Financeiro / João → Comercial / Maria" é montada na leitura. Nada de campo `detalhe` em texto livre.
7. **`registrado_por` vem da sessão.** Coluna distinta de `detentor_destino`: auditoria versus dado de negócio. Nenhum input de "registrado por" na UI.
8. **Retroativa liberada, ordenação determinística.** Data livre; ordenação sempre `(data_movimentacao, criado_em)`; a timeline **sinaliza** quando o registro entrou depois do fato.
9. **Rótulo contábil honesto.** O KPI de valor soma custo de aquisição de não-baixados ⇒ chama-se **"Custo histórico de aquisição"**, nunca "valor imobilizado". Sem depreciação nesta versão; nenhum número desta tela entra em DRE ou Fluxo de Caixa.
10. **Leitura consistente.** Ficha + histórico numa única transação (receita do `get_dre_mensal`) — imune a movimentação concorrente no meio.
11. **Tema neutro Group** (rota de plataforma, ADR-0103): pills, tabela, foco, tokens semânticos. **Zero hex** em componente — o mockup provisório tem paleta própria (petróleo/âmbar) que **não** vai para o Janus.
12. **Não-regressão da sidebar.** Mexer na navegação raiz afeta TODAS as páginas (lição da v3.2). Checklist de regressão em cada rota existente antes do PR da M2.
13. **RBAC padrão pós-v4.29:** RLS deny-by-default; RPCs SECURITY DEFINER com `exigir_acesso(ARRAY['gestao-pessoas/inventario'])` inline; REVOKE/GRANT explícitos. **Permissão única de página** — quem edita a página cadastra e movimenta. Sem dois níveis.
14. **Fail-safe:** RPC falhou ⇒ seção degrada (omite), página viva.
15. **Migrations aditivas** numeradas na hora (`git mv`), backup-gate, verificadas **executando via REST/service_role** (introspecção não prova execução).

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M0** | **GATE — mockups no DS do Janus.** Rota de preview (dev/protegida), tokens semânticos e tema neutro Group, dados verossímeis (fixture): (a) **Lista de ativos** — tabela densa, busca, filtros (categoria/área/status), badge de status, botão primário na linha das pills; (b) **Ficha em drawer** — grade de dados + timeline de histórico com origem→destino derivada e marcador de registro retroativo (padrão drawer analítico, ADR-0092); (c) **Movimentação** — modal com campos condicionais por tipo + combobox de detentor com cadastro inline; (d) **Visão geral** — KPIs, barras por categoria/área, últimas movimentações. Mostrar **a sidebar com a seção nova** em todas. **PARAR e apresentar ao Yan; iterar até o OK.** | gate honrado: zero migration antes do OK; nenhum hex fora de token |
| **M1** | **Banco.** Schema `patrimonio`: 5 tabelas + enums + CHECK por tipo + UNIQUE normalizados + seed (categoria, área). RPCs gated: `criar_ativo` (ficha + destino inicial + movimentação de abertura + código sequencial, uma transação) · `atualizar_ativo` (**rejeita** localização; grava no diário) · `registrar_movimentacao` · `atualizar_obs_movimentacao` · `listar_ativos` (estado derivado + filtros) · `detalhe_ativo` (ficha + histórico com origem derivada, transação única) · `listar_movimentacoes` · `resumo` (agregados) · `upsert_detentor`. Triggers do diário. RLS deny-by-default. | tentar mudar área/detentor por `atualizar_ativo` ⇒ **erro explícito**; inserir movimentação retroativa entre duas existentes e conferir que detentor atual e as origens da timeline recalculam sozinhos; ativo baixado recusa movimentação exceto `reativacao` |
| **M2** | **Seção nova + rota + permissão.** Item **Gestão de Pessoas** na sidebar (expansível, ícone Lucide) com sub-item **Inventário**; rota `/gestao-pessoas/inventario`; namespace de permissão novo; `requireArea` na page; tema neutro. Estrutura de abas no molde `gerencial-section.tsx` (abas sempre montadas, alternando por `hidden`); acessibilidade no molde `acessos-content.tsx`. | **fronteira de fase:** varrer TODAS as rotas existentes (desktop + drawer mobile) e confirmar zero regressão de navegação; usuário sem a permissão nova não vê o item nem alcança a rota |
| **M3** | **Ativos: lista + ficha + cadastro.** Aba Ativos (tabela densa, busca livre, filtros, badge de status derivado, clique abre drawer); drawer da ficha com timeline; formulário de cadastro/edição (edição **só** de identidade/ficha); **"Duplicar ativo"** (repete categoria/área/fornecedor/aquisição/valor, limpa série e código) e formulário retendo os últimos valores — o parque inteiro será digitado numa sentada. | cadastrar 5 ativos por duplicação em menos de 3 minutos; código duplicado barrado no banco tanto na criação **quanto na edição**; formulário de edição não exibe campo de localização |
| **M4** | **Movimentação + razão.** Modal com campos condicionais por tipo (transferência: área + detentor destino · manutenção: assistência em texto · devolução: sem detentor · baixa: motivo · empréstimo: detentor + previsão de retorno em `obs`); combobox de detentor com cadastro inline; aba **Movimentações** (razão completo, filtro por tipo, busca, clique abre a ficha do ativo). Origem renderizada da cadeia. | movimentar um ativo pelos 8 tipos em sequência e conferir status derivado a cada passo; devolução ao estoque deixa o ativo **sem detentor** e a lista mostra travessão, não erro |
| **M5** | **Visão geral + export.** KPIs (cadastrados, em uso, em estoque, em manutenção, baixados, **custo histórico de aquisição** dos não-baixados); barras por categoria e por área; últimas movimentações. Export CSV de ativos e de movimentações (BOM UTF-8, separador `;`). | KPIs somam com a lista filtrada equivalente; CSV abre no Excel pt-BR com acento correto; ativo sem valor não vira `0` no somatório nem `NaN` na tela |
| **M6** | **Fechamento.** v5.6.0; CHANGELOG; CHANGELOG_DIRETORIA ("a empresa passou a ter registro de quem está com cada equipamento, com histórico completo de movimentações"); **ADR** (razão append-only com estado derivado; origem derivada e por que não é gravada; detentor desacoplado de usuário; área ≠ setor de negócio; seção nova de navegação) fechado ao final; DS doc da seção nova; out-briefing com prints das quatro telas. | — |

## Gates

Escalonados: `tsc --noEmit` + lint ao fim de cada missão; `build` + `test` nas fronteiras (após o OK da M0; após M2 — a fronteira crítica de navegação; após M4) e no fechamento. **Fronteira de fase = estado em disco + `/clear`**, nunca `/compact` estratégico. Testes de tabela das RPCs: ativo sem movimentação (estado que deve ser inalcançável); movimentação retroativa reordenando a cadeia; devolução ao estoque (detentor nulo); baixa seguida de tentativa de movimentação; `reativacao` após baixa; CHECK por tipo recusando destino incoerente; código duplicado por variação de caixa/espaço. Migrations com backup-gate + verificação executando via REST. **verificador-visual** nas quatro telas, após gates e reviewers.

## Checkpoint do Yan

**(gate M0)** aprovar as quatro telas no DS, com atenção à convivência da seção nova com a sidebar existente. **(seed)** confirmar a lista de áreas/departamentos e de categorias. **(final)** cadastrar 3–5 ativos reais e movimentar cada um; inserir uma movimentação com data anterior à última e confirmar que o detentor atual e as origens da timeline recalculam sozinhos; confirmar que o formulário de edição não permite mudar área/detentor; conferir o rótulo "Custo histórico de aquisição"; abrir cada rota existente da plataforma e confirmar que a navegação não regrediu; conferir os dois CSVs no Excel.

## Fronteira

**Fora:** depreciação, centro de custo e qualquer contabilização — a ficha **registra** valor e aquisição, não calcula; os campos existem no v1 justamente porque só existem no momento do cadastro. Termo de responsabilidade, PDF e assinatura. Vínculo `detentor ↔ usuário` da plataforma (aditivo quando/se Gestão de Pessoas crescer para cadastro de colaboradores com cargo/admissão). Import de planilha (não existe base a importar). QR code, etiquetas e leitor. Garantia, contratos e custos de manutenção. Anexos e fotos do ativo. Permissão por área (gestor vendo só a própria) — superfície mínima até alguém pedir. Fluxo mobile de campo (responsivo padrão sim, fluxo dedicado não).

## Skills a ler (antes de implementar)

- `.claude/skills/banco-e-rpc/SKILL.md`
- `.claude/skills/contrato-rpc-front/SKILL.md`
- `.claude/skills/tabela-densa/SKILL.md`
- *(+ a skill de design system / tema neutro — confirmar o path no inventário do CLAUDE.md; leitura obrigatória por ser seção nova de navegação)*
