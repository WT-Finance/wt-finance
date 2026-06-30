# ADR-0133 — Base de Pessoas (Monde) + validação de colunas obrigatórias na Atualização de Dados

**Status:** Aceito · **Data:** 2026-06-26 · **Versão:** v4.29.0
**Relaciona:** ADR-0104 (ingestão atômica de Vendas, migration 0116 — modelo do pipeline), ADR-0107 (RBAC por área), ADR-0130 (coerção canônica), ADR-0132 (RPC read-only sobre base não exposta). Pré-requisito da Fase 1 do projeto Faturamento.

## Contexto

O Faturamento (automação, frente seguinte) precisa de uma fonte cadastral/fiscal dos clientes — hoje um script R junta a planilha crua com uma `pessoas.xlsx` (extraída do Monde, o ERP) por nome. Trazemos essa base para a plataforma como **base persistida de primeira classe** na Atualização de Dados (`admin/uploads`), ao lado de Vendas e das demais — para que o Faturamento e funcionalidades futuras a consumam de dentro do sistema.

Em paralelo (mesma versão, por coerência de UX), tornamos **explícito** o aviso de colunas obrigatórias nas 5 bases de importação: as planilhas exportadas têm colunas configuráveis, então uma falta de coluna deve virar uma mensagem clara antes de processar, não um erro técnico no meio.

## Decisão

### 1. `raw.pessoas` + carga full-replace ATÔMICA (migration 0160, aditiva)

Tabela nova `raw.pessoas` (schema `raw`, onde moram as bases cruas). **Todos os campos TEXT** — documentos (`cnpj`/`cpf`/`cep`/inscrições) preservam zero à esquerda (nunca numérico; 14 dígitos numéricos virariam notação científica = dado fiscal errado). `nome` guardado com **TRIM** (a origem traz espaço à esquerda; o lookup também trima). Carga **full-replace atômica** — modelo 0116 (Vendas): `limpar_staging_pessoas` → `inserir_lote_staging_pessoas` (lotes) → `validar_carga_pessoas` (não-destrutivo) → `promover_carga_pessoas` (TRUNCATE + cópia staging→raw numa transação; **aborta se a staging estiver vazia**). O Faturamento vai depender da base — ela **não pode ficar vazia** no meio de uma recarga (uma carga ruim faz ROLLBACK, a base anterior fica intacta). `status_pessoas` (count + última carga) e `buscar_pessoas(text[])` (lookup READ-ONLY por nome trimado, modelo `cruzar_vendas_setor`/0159, gate `exigir_acesso(['admin/uploads'])` — o Faturamento re-gateará à sua própria área). Tudo `SECURITY DEFINER` + `REVOKE`/`GRANT` explícitos; RLS deny-by-default nas tabelas novas.

**Chave de cruzamento = NOME (trimado).** A planilha de faturamento só traz o nome (`Pessoa`); o CNPJ/CPF é o identificador de negócio mais robusto, mas o lookup parte do nome. Nome é frágil (homônimos) — tratado explicitamente (não-casados sinalizados pela diferença, como o "Não identificado" do rateio). Sem unicidade rígida (espelho do Monde aceita o que vier).

### 2. Validação = COLUNAS presentes, não células

O mínimo obrigatório de Pessoas são as **17 colunas no cabeçalho** (formato completo do Monde); as **células podem vir vazias** (a maioria vem — a base é um espelho incompleto) e viram `null`. Validar célula preenchida rejeitaria ~99% da base de 64k. O parser exige as 17 colunas (casamento tolerante a acento/caixa via `normalizeHeader`) e processa o resto.

### 3. Helper compartilhado de colunas obrigatórias — espelha, não muda

`validarColunasObrigatorias(headers, requisitos)` (`src/lib/carga/colunas-obrigatorias.ts`) é usado pelas 5 bases. Para as **4 existentes**, a lista obrigatória foi **derivada do código** (não assumida) e os requisitos passados ao helper produzem **exatamente** o mesmo conjunto aceito/rejeitado de antes (comparação exata sobre headers trimados; `aceitos` = as chaves do `COL_MAP` que mapeiam ao campo, equivalente a `headers.some(h => COL_MAP[h] === campo)`). **Vendas é tolerante** (o parser nunca exigiu coluna — só avisa não-mapeadas); não ganhou trava nova (lista vazia, nota informativa no card). **Invariante de não-regressão:** uma planilha que importa hoje continua importando; só a *mensagem* de falta ficou amigável (lista as colunas faltantes) e aparece *antes* de processar.

## Consequências

- **Positivas:** a plataforma passa a ter a base de pessoas (pré-requisito do Faturamento), consumível por qualquer feature via RPC read-only; documentos fiscais íntegros (zero preservado, provado no banco); carga robusta (base nunca vazia); aviso de colunas claro e coerente nas 5 bases sem mudar o que cada uma aceita. Auto-auditoria adversarial (4 céticos) com foco em não-regressão.
- **Negativas / limites:** o cruzamento por nome é frágil (homônimos) — aceito por ora (a origem só dá o nome); a unicidade não é imposta (espelho). `buscar_pessoas` ainda não é consumido (scaffolding do Faturamento) e está gateado a `admin/uploads` provisoriamente. A preservação de zero depende de a **origem** exportar os documentos como TEXTO (fora do controle do código). Unificar com `analytics.dim_pagante` (a "pessoa" pobre, só-nome) fica fora de escopo.
