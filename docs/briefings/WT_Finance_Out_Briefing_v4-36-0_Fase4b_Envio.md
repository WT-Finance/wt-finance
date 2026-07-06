# WT Finance — Out-Briefing v4.36.0 · Faturamento Fase 4b (Revisão do envio + lote + a virada)

**Data:** 2026-07-03 · **Branch:** `feat/v4-36-0-faturamento-fase4b-envio` (base `main` @ v4.35.0) · **Versão:** 4.35.0 → **4.36.0** (MINOR)
**Tema:** A **operação** sobre o pipeline da 4a — o modal **"Revisar envio"**, o disparo em **lote** e a **capacidade** da virada para produção. O Faturamento fica completo (planilha → e-mail), em **MODO TESTE**. **A virada não é acionada: `EMAIL_MODO` segue `teste` → o modo real permanece inalcançável.** **ADR-0141 · sem migration.** **Merge e deploy ficam com o usuário.**

## Missões

### M0 — Checkpoint de layout do e-mail (bloqueante) ✅ aprovado
Dois exemplos renderizados (com nota / sem nota) enviados à caixa de teste com o template + logo reais e os PDFs reais (sandbox). Ajustes aprovados pelo Yan e aplicados ao `templateFaturaEmail`:
- Removido o botão "Acessar o boleto" (o boleto vai como anexo).
- Removida a linha secundária "Fatura … Os documentos … seguem em anexo".
- "Caso tenham dúvidas, estamos à disposição." fundido ao bloco do corpo.
- Texto padrão: `Segue em anexo a fatura referente aos serviços prestados, juntamente com boleto e nota fiscal.` — só "boleto" quando sem nota.
- Poda do encanamento morto de `boletoLink` (template → `fatura.ts` → action).

### M1 — Preparo do envio (server-side) + opções da action
- `prepararEnvioEmails(refs)`: deriva server-side documentos (`buscar_docs_fatura`), cadastro (`buscar_cliente_corporativo`) e idempotência (`email_existentes` no modo) e classifica cada fatura em **pronto / atenção (com motivo) / enviado**. Ordena Atenção → Prontos → Enviados. Read-only.
- `enviarEmailFatura(ref, opts?)` ganhou opções **aditivas** (o botão por-linha da 4a segue chamando só com `ref`): `destinatariosOverride` (snapshot re-validado no servidor; habilita envio avulso), `soBoleto` (ignora a nota mesmo pendente), `forcarReenvio` (pula a idempotência), `confirmacaoReal` (dupla trava do modo real).
- `splitDestinatarios`/`emailValido` extraídos para o módulo **isomórfico** `src/lib/email/destinatarios.ts` (fonte única, reusável no cliente).

### M2 — Modal "Revisar envio" (tabela)
- `ModalCentral` ganhou a prop **`largura`** (aditiva, default `lg`; `5xl` para a tabela densa) — reusa a pilha de Esc / trava de scroll / portal / foco.
- Modal: cabeçalho (título + badge de modo âmbar/`teste` ou vermelho/`MODO REAL` + fechar) · **pills de filtro** Todos/Atenção/Prontos/Enviados **com contagem** · a tabela · rodapé fixo (dica + botão verde "Enviar N e-mails").
- Colunas **Pessoa · Nº · Anexos · Destinatários · Status**. **Destinatários** = célula **editável efêmera** (só para este envio, sem write-back), validação **ao vivo** (trecho inválido em vermelho). **Status** = badge Pronto/Atenção/Enviado + motivo + ações como links: **enviar só o boleto**, **reenviar**, **ver boleto**. Sem coluna de valor.

### M3 — Disparo em blocos + progresso + resume
- Confirmado → snapshot **congelado** → o cliente chama a action **1 fatura por vez**, com **~2,1s** entre chamadas (≤30/min por construção). Cada chamada isolada em try/catch (uma sessão expirada marca só aquela linha e o laço segue).
- Progresso vivo (barra + "enviados X de N" + status por fatura) + resumo (enviados/falharam/pulados).
- **Resume por idempotência:** fechar e reabrir o modal re-monta os enviados (`email_existentes`) e continua dos restantes, sem duplicar.

### M4 — A virada (construída, não acionada) + fechamento
- Dupla trava quando `emailAmbiente()==='real'`: UI exige digitar **ENVIAR** + action exige `confirmacaoReal`. Testes cobrem a **recusa** do real sem confirmação. **`EMAIL_MODO` segue `teste` → nada é enviado em real.**
- v4.36.0, CHANGELOG, CHANGELOG_DIRETORIA, ADR-0141, este out-briefing.

## Invariantes — auto-auditoria
1. **Override no ponto único (4a) intacto** ✅ — o lote inteiro em teste vai para `EMAIL_TESTE_DESTINO` (a substituição vive dentro de `enviarFaturaEmail`; o lote não cria caminho novo).
2. **Snapshot efêmero re-validado no servidor** ✅ — `destinatariosOverride` passa por `splitDestinatarios` na action; sem write-back no cadastro.
3. **Idempotência POR MODO, sem UNIQUE** ✅ — não mexida; `email_existentes(refs, modo)`; resume por consulta.
4. **Validação bloqueia inválido** ✅ — célula re-valida ao vivo; linha sem destinatário válido não fica "pronto"; sem nenhum pronto = botão desabilitado.
5. **Throttle por construção** ✅ — ~2,1s no cliente entre chamadas.
6. **Falha parcial + registro** ✅ — cada e-mail isolado; a action registra toda tentativa (herdado da 4a).
7. **A virada não é executada** ✅ — `EMAIL_MODO` segue teste; a action recusa real sem `confirmacaoReal`; testes provam a recusa.
8. **Emissão e Cadastro intactos** ✅ — nada de `emitirBoletos`/`emitirNotas`/`src/lib/asaas`/cadastro alterado.

## Gate de fechamento
`npx tsc --noEmit` → **0** · `npm run lint` → **limpo** · `npm test` → **332** (306 base 4a + isomórfico `destinatarios` + contrato) · `npm run build` → **exit 0**. **Sem migration.**

## CHECKPOINT do Yan (antes do merge)
(1) M0 já aprovado; (2) rodar um **lote completo em teste**: progresso, falha parcial (se houver), **resume** (fechar no meio e reabrir), **reenviar**, **enviar só o boleto**, edição efêmera com a dica; (3) conferir `app.fatura_email` (efetivos vs reais, modo); (4) confirmar que a virada NÃO aconteceu (badge teste; real recusado).

## Fora de escopo / próximos
- **A VIRADA (decisão do Yan, fora desta entrega):** flip conjunto `ASAAS_BASE_URL` produção + `EMAIL_MODO=real` (Vercel, escopo Production), com primeira rodada real de poucas faturas — só após o fluxo validado ponta a ponta.
- **Pendências vivas (fora):** investigação dos erros de dados (em curso); migrations destrutivas 0167/0168 (aplicação humana); PDFs de briefing corrompidos (verificar); re-hidratar `invoiceId` da NF (follow-up).
- **Refinos do modal:** coluna de valor, densidade, "fora do cadastro" como bloqueio duro vs. aviso — iteração com o Yan.

## Arquivos
- **Camada (isomórfica):** `src/lib/email/destinatarios.ts` (novo) + `destinatarios.test.ts` (novo); `src/lib/email/fatura.ts` (re-exporta de destinatarios); `src/lib/email/template.ts` + `fatura.test.ts` (ajustes M0).
- **Action:** `src/app/financeiro/faturamento-corp/actions.ts` (+`prepararEnvioEmails`, +`LinhaEnvioEmail`/`OpcoesEnvioFatura`, opções em `enviarEmailFatura`).
- **UI:** `src/components/financeiro/revisar-envio-modal.tsx` (novo), `src/components/shared/modal-central.tsx` (prop `largura`), `src/components/financeiro/faturamento-corp.tsx` (botão + modal).
- **Docs/versão:** `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `docs/adr/0141-…`, este out-briefing, `package.json`/`package-lock.json` (4.36.0).
