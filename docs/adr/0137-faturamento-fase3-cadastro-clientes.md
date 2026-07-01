# ADR-0137 — Faturamento Corporativo Fase 3: cadastro de clientes (base central; reuso do Gerencial; import simples; Visão A)

**Status:** Aceito · **Data:** 2026-07-01 · **Versão:** v4.33.0
**Relaciona:** ADR-0136/0135/0134 (Faturamento Fases 1-2), ADR-0126 (Gerencial — importação por fatia, origem planilha/manual), ADR-0133 (raw.pessoas / buscar_pessoas — molde do parser + lookup). Estrutura de abas espelha o Fluxo de Caixa Gerencial.

## Contexto

O faturamento usa hoje uma planilha paralela ("Faturamento Clientes - Corporativo.xlsx", 241 clientes) com situação, dias de faturar/vencer, regras fiscais (texto livre), % juros/multa, forma de pgto, contato e os e-mails de destino. Esta fase traz isso para a plataforma como **cadastro gerenciável** — elimina a planilha paralela, rumo à base central de clientes corporativos. É a Fase 3 do Faturamento; a Fase 4 (envio de e-mails) consome os destinatários deste cadastro.

## Decisão

### 1. Reuso do padrão do Fluxo de Caixa Gerencial (não inventar)
A aba "Cadastro de Clientes" reusa a mecânica do Gerencial "Base de Dados": tabela editável (edição inline por célula), controles Importar/Nova linha/Apagar, filtro de origem (Toda/Planilha/Manual), estado otimista + `router.refresh()`. Tabela PRÓPRIA (`app.cliente_corporativo`), não os lançamentos do fluxo de caixa.

### 2. Estrutura de abas — Emissão preservada byte-idêntica (não-regressão)
Faturamento Corporativo ganha duas abas via um wrapper client (`faturamento-corp-content.tsx`, molde `gerencial-section.tsx` — abas sempre montadas, alterna por `hidden`, preserva o estado de cada aba; a11y role=tablist/tab/tabpanel): **Emissão** (`<FaturamentoCorp>` das Fases 1a/1b/2, **inalterado**) e **Cadastro de Clientes** (novo). A `page.tsx` passa a renderizar o wrapper, mantendo `requireArea('financeiro/faturamento-corp')` + `asaasAmbiente()`/`asaasConfigurado()` e carregando o cadastro (SSR via `listar_clientes_corp`). A lógica de emissão (idempotência, falha parcial, ambiente, status de NF) permanece IDÊNTICA — é o invariante crítico.

### 3. Import SIMPLES (não a fatia-por-originador do Gerencial)
O Gerencial usa diff-por-fatia porque vários usuários importam fatias distintas; o cadastro de clientes tem **uma planilha canônica única**. Então `importar_clientes_corp` = `DELETE WHERE origem='planilha'` + `INSERT`, numa transação — os `origem='manual'` nunca são tocados. **Sem diff-preview, sem staging** (241 linhas). A RPC **reporta** (não quebra): nomes que colidem com um cadastro MANUAL existente (não sobrescritos) e nomes repetidos DENTRO da própria planilha (importa o primeiro).

### 4. Nome único (impedir duplicados) — normalização robusta
`empresa` é a chave (casa a fatura com o cadastro e com `raw.pessoas`). Índice UNIQUE em `app.norm_nome(empresa)`. O briefing pediu "TRIM+minúsculo"; adotei **trim + minúsculo + colapso de runs de espaço interno** (helper `app.norm_nome`, IMMUTABLE) — serve melhor o invariante "impedir duplicados" (a auto-verificação mostrou que só trim+lower deixava "Acme Ltda" ≠ "Acme  Ltda"; espaço duplo em planilha digitada à mão é real). Impede duplicados entre qualquer origem; a UI comunica a colisão em vez de estourar erro técnico.

### 5. Cadastro é REFERÊNCIA (Visão A), não motor
As regras (obs, juros/multa, dias) ficam registradas e legíveis; a plataforma **NÃO** as aplica automaticamente no faturamento. A Emissão não lê o cadastro nesta fase. Nada interpreta a OBS (texto livre) sem critério. Aplicar regras = Visão B (evolução futura, peça a peça).

### 6. Destinatários como texto; campos TEXT; parser client-side
`destinatarios` guarda a string concatenada do "ENVIAR PARA" ("email1; email2") — **ignora** as colunas EMAIL 1-6 (decomposição da planilha). O split por `;` e a validação são da Fase 4 (envio). Todos os campos de negócio são TEXT (Visão A — dias como "01 / 10 / 20" não são estruturados). Parser `parse-clientes-corp.ts` (molde `parse-pessoas.ts`, client-side): obrigatória apenas EMPRESA (`validarColunasObrigatorias`), `toStr` em tudo, situação normalizada.

### 7. Schema `app`, RLS deny-by-default, lookup para a Fase 4
`app.cliente_corporativo` (coerente com `fatura_emissao`/`fatura_nota`; não exposto pelo PostgREST → tudo via RPC `SECURITY DEFINER` + `exigir_acesso('financeiro/faturamento-corp')` + GRANT authenticated). Área RBAC **reusa** `financeiro/faturamento-corp` (sem área nova). Incluído já o lookup `buscar_cliente_corporativo(p_nomes)` (read-only, análogo a `buscar_pessoas`) — scaffolding leve para a Fase 4 pegar os destinatários; o consumo (split, só-ativos) é Fase 4.

## Consequências

- **Positivas:** a planilha paralela some (cadastro na plataforma); reuso do padrão provado do Gerencial (menos invenção); Emissão intacta (não-regressão); nome único robusto; import preserva o trabalho manual; lookup pronto para a Fase 4. Auto-auditoria adversarial sobre os invariantes (não-regressão, nome único, import-mantém-manual, Visão A, destinatários-texto).
- **Negativas / limites:** o cadastro não aplica regras (intencional — Visão A); o import não tem preview (intencional — simples); a normalização de nome colapsa espaços mas não trata abreviações/variações semânticas (fora de escopo); coexiste com `raw.pessoas` (complementares, casam por nome, não unificados). Fase 4 (envio via M365, split dos destinatários, anexos) usa este cadastro.
