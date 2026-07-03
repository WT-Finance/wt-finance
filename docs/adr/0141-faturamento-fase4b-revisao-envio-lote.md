# ADR-0141 — Faturamento Fase 4b: revisão do envio, disparo em lote e a capacidade da virada

**Status:** Aceito · **Data:** 2026-07-03 · **Versão:** v4.36.0
**Relaciona:** ADR-0140 (Fase 4a — pipeline de envio em modo teste), ADR-0134/0135/0136/0137 (Faturamento Fases 1-3), ADR-0127 (camada de e-mail). **Sem migration** (as RPCs da 0169 + `buscar_cliente_corporativo` da 0164 cobrem).

## Contexto

A 4a (v4.35.0) entregou o **pipeline** de envio isolado, em modo teste: uma fatura por vez, tudo derivado no servidor, idempotência por modo, anexo-falha = envio-falha. Faltava a **operação** por cima: revisar em massa, editar destinatários pontualmente, disparar em lote e — a última capacidade antes de produção — **a virada para o modo real**. A Fase foi subdividida justamente para que o mecanismo perigoso (e-mail sai de verdade, sem sandbox) fosse validado em isolamento antes da operação em volume. **Esta entrega constrói a virada, mas não a aciona:** `EMAIL_MODO` segue `teste` em todos os ambientes.

## Decisão

### 1. Checkpoint de layout do e-mail ANTES de qualquer implementação (M0)
O layout do e-mail se decide no cliente-alvo (o preview verdadeiro é o e-mail **recebido**, não o navegador). O template da 4a foi revisado e ajustado com aprovação do Yan **antes** de M1-M4: sem botão "Acessar o boleto" (o boleto vai como anexo), corpo enxuto (`Segue em anexo a fatura … juntamente com boleto e nota fiscal`; só "boleto" quando sem nota), "Caso tenham dúvidas" no mesmo bloco. Poda do encanamento morto de `boletoLink`.

### 2. Snapshot de destinatários EFÊMERO, re-validado no servidor
A edição de destinatários no modal vale **só para aquele disparo** — **sem write-back** no Cadastro (o permanente é a tela de Cadastro). Confirmado o envio, os destinatários efetivos são **congelados** e alimentam o lote, inclusive entre blocos (nenhum bloco re-consulta o cadastro). O servidor **RE-VALIDA** o override (`splitDestinatarios`) a cada chamada — o cliente **nunca** é fonte de verdade. Como efeito, o override habilita o **envio avulso** (cliente inativo/fora do cadastro) desde que haja ≥1 destinatário válido — o operador vê o estado e decide.

### 3. Idempotência POR MODO, sem UNIQUE (herdada, não mexida) → resume por consulta
`app.fatura_email` continua **append-only** (0169). O "já enviado" vem sempre de **consulta** (`email_existentes(refs, modo)`), nunca de assumir um registro por fatura. O **resume** é isto: fechar e reabrir o modal re-monta os enviados e o disparo continua dos restantes, sem duplicar. O **reenvio deliberado** (`forcarReenvio`) pula a idempotência e registra novo envio.

### 4. Disparo em blocos orquestrado pelo cliente, com throttle por construção
O cliente dispara **um e-mail por vez** com **~2,1s de intervalo** (≤30/min por construção) — independe do `maxDuration` desconhecido da função serverless e mantém cada chamada curta. Cada chamada é **isolada** (try/catch por fatura): uma sessão que expira no meio marca só aquela linha como falha e o laço segue. Falha parcial + progresso vivo + resumo ao fim.

### 5. A VIRADA é uma CAPACIDADE construída, não executada (dupla trava)
Quando `emailAmbiente() === 'real'`, a UI exige digitar **ENVIAR** e a Server Action exige `confirmacaoReal` (recusa sem ela) — molde da confirmação "EMITIR" de produção do Asaas. `EMAIL_MODO` permanece `teste` em todos os ambientes, então o ramo real **nunca roda** nesta entrega; os testes cobrem a **recusa**. A virada (flip conjunto `ASAAS_BASE_URL` produção + `EMAIL_MODO=real`) é decisão consciente do Yan, fora desta versão, com primeira rodada real de poucas faturas.

### 6. Fonte única da validação de e-mail (isomórfica)
`splitDestinatarios`/`emailValido` foram extraídos para `src/lib/email/destinatarios.ts` (**sem `server-only`**) — a MESMA regra usada no servidor (`fatura.ts`/actions) e na célula editável do cliente (validação ao vivo, trecho inválido em vermelho). Não se duplica a regra (mesmo espírito de `@/lib/carga/coercao`). `enviarEmailFatura` ganhou opções **aditivas** (`destinatariosOverride`, `soBoleto`, `forcarReenvio`, `confirmacaoReal`), preservando o botão por-linha da 4a (que chama só com `ref`).

## Consequências

- **Positivas:** o Faturamento fica completo (planilha → e-mail) e validável ponta a ponta em lote, sem risco a clientes; o snapshot efêmero re-validado no servidor + a dupla trava tornam a operação e a futura virada seguras por construção; o resume por idempotência sobrevive a fechar/reabrir o modal; a validação isomórfica elimina a divergência de regra entre cliente e servidor.
- **Negativas / limites:** o **resume** cobre fechar/reabrir o **modal** na mesma sessão de página — um F5 duro perde a lista de faturas da sessão (que é estado de memória desde a 1a; não há RPC "listar faturas emitidas recentemente"); a UI de destinatários é por-linha (sem edição em massa multi-linha); a virada só após validação ponta a ponta em teste. Refinos de UI do modal (coluna de valor, densidade, "fora do cadastro" como bloqueio duro vs. aviso) ficam para iteração com o Yan.
