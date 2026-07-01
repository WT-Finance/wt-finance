# ADR-0138 — Faturamento (Emissão): UX em "dois momentos" + resultado co-locado após a ação

**Status:** Aceito · **Data:** 2026-07-01 · **Versão:** v4.33.1
**Relaciona:** ADR-0134/0135/0136 (Faturamento Fases 1-3). PATCH de apresentação — nenhuma mudança de lógica, banco ou capacidade.

## Contexto

A tela de Emissão do Faturamento (Fases 1a/1b/2) funcionava, mas a disposição confundia: a coluna "Cruzamento" acumulava três coisas (status + resultado do boleto + "faltam"), os painéis de resultado ficavam **acima** da revisão (ordem invertida), os erros repetiam por fatura (bloco vermelho longo), havia texto em inglês ("NF synchronized") e um não-identificado de ~R$ 300 mil passava despercebido no rodapé. O desenho de refino foi validado com o Yan por mockups.

## Decisão

### 1. Tabela de revisão em "dois momentos"
A mesma tabela serve a duas etapas, com hierarquia clara:
- **Antes de emitir (decisão):** a coluna **Cruzamento** mostra **só o status** (Pronta / Faltam dados fiscais / Não identificado). A coluna **Boleto** tem o checkbox; a coluna **Nota fiscal** tem o seletor (rótulo curto Normal/Avulsa/Não emitir), com o valor da avulsa **inline** (mesma linha) — altura constante em todas as linhas.
- **Depois de emitir (resultado co-locado):** o resultado de cada documento aparece **na sua própria coluna** — boleto na coluna Boleto, nota na coluna Nota. O erro fica ao lado do que falhou (fim da ambiguidade de ter o status do boleto na coluna Cruzamento). A coluna Cruzamento entra em **de-ênfase** (o foco passou às colunas próprias).

### 2. Ordem = fluxo real (resultado é consequência)
Sequência: cabeçalho + abas (compartilhados, Fase 3) → **upload** → **revisão** (com os botões "Emitir boletos"/"Emitir notas" ao pé) → **resultado abaixo, só depois de emitir**. Os painéis de resultado nascem da ação (não ocupam o topo antes da revisão).

### 3. Painel de resultado: contagem + erros agrupados por motivo + "Ver detalhes"
Cartões de contagem (número em destaque, tom semântico) + os erros **agrupados por motivo** (cada motivo uma vez, com a contagem — ex.: "Endereço do cliente incompleto · 6 faturas") em vez de repetir por fatura. Cada motivo tem um **"Ver detalhes"** (estado local, `aria-expanded`) que expande as faturas afetadas (Pessoa · Fatura Nº · Valor). Uma fatura com vários problemas aparece em cada motivo (esperado do agrupamento). O detalhe fatura-a-fatura também vive na linha da tabela.

### 4. PT-BR em tudo
Status da NF do Asaas mapeado para PT-BR (`labelStatusNota`): processando / autorizada / falhou / cancelada — fim do "NF synchronized" e de qualquer resíduo em inglês.

## Invariante preservado (o crítico)

**A lógica de emissão é byte-idêntica em comportamento.** Esta fase mexeu SÓ nos componentes de apresentação de `src/components/financeiro/faturamento-corp.tsx` (o que renderiza a tabela e os painéis) + helpers de exibição. As Server Actions (`emitirBoletos`/`emitirNotas`/`atualizarStatusNotas`), a camada `src/lib/asaas/`, a idempotência (dupla, `-AVULSA`), a falha parcial, o modelo assíncrono da NF e a confirmação de produção enforced **não mudaram** — provado por `git diff` (só `faturamento-corp.tsx` no diff; o único `useState` novo é o expansor local do "Ver detalhes"; as chamadas às actions permanecem idênticas). A aba Cadastro (Fase 3) e o wrapper de abas ficam intocados.

## Consequências

- **Positivas:** tela escaneável (dois momentos, resultado co-locado, ordem do fluxo real); o erro fica ao lado do documento que falhou; não-identificado de alto valor destacado; painel enxuto (contagem + motivos agrupados) em vez de lista repetida; PT-BR consistente. Sem risco de regressão (apresentação isolada, git diff prova).
- **Negativas / limites:** não conserta os erros de dados (Endereço/E-mail/CEP incompleto) — só muda como aparecem (a origem é investigação à parte do Yan). O agrupamento por motivo faz uma fatura com N problemas aparecer em N grupos (esperado). O refresh de status da NF continua manual (Fase 2). Envio de e-mails = Fase 4.
