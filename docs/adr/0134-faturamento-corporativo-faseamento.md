# ADR-0134 — Faturamento Corporativo: arquitetura faseada 1a/1b + área RBAC própria

**Status:** Aceito · **Data:** 2026-06-30 · **Versão:** v4.30.0
**Relaciona:** ADR-0133 (Base de Pessoas / `buscar_pessoas`), ADR-0107/0121 (RBAC por área), ADR-0132 (RPC read-only sobre base não exposta). É a primeira metade da Fase 1 do projeto Faturamento (boletos via Asaas).

## Contexto

O Faturamento Corporativo automatiza o que hoje é manual (scripts R + Python via API do Asaas): emitir boletos e notas para clientes corporativos a partir de uma planilha. **Age sobre dinheiro de forma irreversível** — é a funcionalidade mais sensível da plataforma. A Fase 1 (boletos) foi subdividida em duas versões para **isolar o risco**:

- **Fase 1a (esta, v4.30.0):** pipeline (importar a crua → cruzar com a base de pessoas → classificar) + **tela de revisão**. **READ-ONLY:** zero chamada ao Asaas, zero escrita-no-mundo. Valida o dado e a UX sem risco — e revela, na prática, quantos clientes vêm sem dados fiscais (informa a 1b).
- **Fase 1b (próxima, v4.31.0):** emissão de boletos no **sandbox** do Asaas + tabela de registro. Concentra TRÊS primeiras-vezes perigosas: a primeira ação irreversível sobre dinheiro, a primeira escrita-no-mundo (migration de escrita), a primeira API externa de terceiro. Recebe atenção e auto-auditoria concentradas.

## Decisão

### 1. Faseamento 1a/1b — a parte irreversível isolada
A 1a entrega valor (revisão do faturamento) com **risco nenhum** e a 1b recebe toda a atenção. Juntar o pipeline+UX (sem risco) com a emissão (irreversível) misturaria o perigoso com o trivial. A 1a **termina na tela de revisão**: o usuário vê o que *seria* emitido, nada é emitido. Não há `src/lib/asaas/`, chave de API, nem botão que dispare.

### 2. Área RBAC própria e apertada (`financeiro/faturamento-corp`)
Por ser a capacidade mais sensível, ganha **área RBAC dedicada** (rótulo "Faturamento Corporativo", grupo Financeiro), **não** reusa `financeiro/gerencial` (não herda quem vê o fluxo de caixa). Padrão aditivo da v4.20.0 (migration 0161: `INSERT` em `app.rbac_areas` + `areas.ts` + nav + teste de paridade). Diferença de produto vs. a 0143 (solicitacoes/basico, concedida a todos): aqui o grant inicial vai **só aos roles administradores** (têm `admin/acessos`); o admin libera a finanças pelo editor de roles. Gate em todas as camadas: página `requireArea`, action `requireAreaAction`.

### 3. Cruzamento read-only reusando `buscar_pessoas` (gate estendido)
A coluna `Pessoa` (trimada) cruza com a base via `buscar_pessoas` (v4.29.0). O gate da RPC, que era `admin/uploads` (provisório), foi **estendido** (CREATE OR REPLACE aditivo na 0161) para `exigir_acesso(['admin/uploads','financeiro/faturamento-corp'])` — `exigir_acesso` com array é OR, então o consumidor de faturamento passa e o de upload segue funcionando. A classificação (pronta / faltam dados fiscais / não identificado) é pura, isomórfica e testável; acontece no cliente. A crua **não é persistida** (processamento client-side, como a Calculadora de Rateio).

### 4. `Fatura Cliente Nº` preservado como TEXT desde já
É o `externalReference` (chave de idempotência) da emissão na 1b. Já na 1a a coluna é coagida via `toStr` (nunca número) e carregada na tela — preservar como string desde já evita perda de zero/formato quando a 1b for emitir.

## Consequências

- **Positivas:** valor entregue (revisão) com risco zero; a parte irreversível isolada para a 1b; a tela **expõe** quantas faturas vêm sem CNPJ/endereço **antes de custar** (a maioria dos cadastros é incompleta — confirmado na v4.29.0); área RBAC apertada; `buscar_pessoas` agora serve o Faturamento como a v4.29.0 antecipou. Auto-auditoria adversarial (4 céticos) com foco em ZERO-Asaas/ZERO-escrita.
- **Negativas / limites:** o cruzamento por nome é frágil (homônimos — sinalizados com "múltiplos cadastros"); a 1a não emite nada (intencional). A confirmação dos fatos do Asaas (idempotência real, shape da resposta, dados fiscais dos clientes já cadastrados) depende do **sandbox** e dos scripts reais — pré-requisito da 1b, fora desta fase. Notas/download/e-mails são as fases 2–4.
