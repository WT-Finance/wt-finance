# WT Finance — Out-Briefing v4.38.0 · Faturamento — melhorias de interface (resultado em modal, re-hidratação, Revisar envio final)

**Data:** 2026-07-06 · **Branch:** `feat/v4-38-0-faturamento-ui-resultado` (base `main` @ v4.37.1) · **Versão:** 4.37.1 → **4.38.0** (MINOR)
**Tema:** Pacote de UI pós-Faturamento-completo, aprovado por mockup (4 rodadas, item a item). O resultado da emissão sai dos painéis inline e vira **dois modais sob demanda**; a barra ganha **dois momentos**; a tela **re-hidrata do banco** (lembra o que já foi feito, sem reemitir); o "Revisar envio" chega à forma final (status puro em 4 cores + checkbox por linha). **Lógica de emissão/envio INTACTA.** Migration **0172 (aditiva)** · **ADR-0143** (emenda ao registro/leitura do Faturamento). Merge e deploy ficam com o usuário.

> **Numeração (verificada contra a realidade, não o briefing):** o prompt/briefing diziam "migration 0170" e "base v4.37.0" — **desatualizados**. Real: `main` @ v4.37.1; migrations até 0171 → a próxima é **0172**; maior ADR real = 0142 → **ADR-0143**. **PR #170 (v4.37.2) segue ABERTO** (não mergeado) e compartilha os arquivos de versão/CHANGELOG — conflito trivial esperado quando os dois PRs forem mergeados (recomendado mergear #170 primeiro).

## Missões

### M1 — Registro + leitura (migration 0172)
- **`app.fatura_emissao`** ganha `juros_aplicado`/`multa_aplicada` (`int`, `NULL`). `registrar_emissao` grava o **aplicado** (do cadastro ou default 2) **só ao criar boleto NOVO**; `jaExistia` → `NULL`; registros antigos → `NULL` (UI exibe **"—"**, nunca inventa 2% retroativo). Guard `WHERE asaas_payment_id IS NULL` mantido (o aplicado só "pega" na 1ª sucesso; falha nunca sobrescreve sucesso).
- **RPCs de leitura** (padrão inline, `exigir_acesso` + REVOKE/GRANT): `resultado_boletos(p_refs)` e `resultado_notas(p_refs)` — **não filtram por sucesso** (trazem os que falharam). `emitirBoletos` grava o aplicado (`registrarSucesso`); `registrarFalha` grava a falha sem juros/multa (→ "—"). Actions fail-safe `resultadoBoletos`/`resultadoNotas`/`emailEnviados` (retornam `[]` em erro).

### M2 — Barra "dois momentos" + modais de resultado
- Barra: cada `Emitir X` vira `Ver resultado · X` (min-w **fixo** — não pula) **quando há resultado no banco**; `Enviar e-mails` fixo à direita, **sem contador**.
- Removidos: painéis inline de resultado (`ResultadoEmissaoCard`/`ResultadoNotaCard`), erros agrupados, coluna E-mail por-linha (`EmailCell`/`enviarEmail`/`emailPorRef`).
- **`ModalResultadoBoletos`**: Pessoa · Fatura Nº · Valor (contábil, `ValorContabil`) · **Juros** · **Multa** · Status (emitido verde ✓ · ver↗ / já emitido cinza · ver↗ / falhou vermelho + motivo). Juros/multa **≠ 2 → negrito**, **= 2 → discreto**, `NULL` → "—".
- **`ModalResultadoNotas`**: contagens + **"Atualizar status" DENTRO** do modal (o ↻ do cabeçalho da coluna na tabela permanece); status PT-BR (autorizada/processando/falhou/já emitida) + ver nota.
- Modais usam `ModalCentral` com **`corpoFlex`** (cabeçalho fixo + tabela rolável, receita `border-separate`/DS §7).

### M3 — Re-hidratação (read-only + fail-safe)
- Ao **cruzar** e após cada emissão/atualização, `recarregarResultados(refs)` lê o banco e repõe boleto/nota/e-mail por ref, **sem reemitir**. `boletosDB`/`notasDB`/`emailFeitos` viram a fonte que sobrevive ao reload; `refsComBoleto` e os botões "Ver resultado" passam a vir do banco. `invoice_id` re-hidratado → "Atualizar status" funciona pós-reload (fecha follow-up da Fase 2). Fail-safe: leitura que cai → `[]` → tela segue como hoje.
- Célula co-locada da tabela: sessão (rica) → senão banco (adaptadores `dbToItemBoleto`/`dbToItemNota`) → senão o seletor.

### M4 — Revisar envio final (`revisar-envio-modal.tsx`)
- Status = **mensagem pura em 4 cores** (Pronto/Sem destinatário/Nota fiscal pendente/Já enviado) — sem pills/links/sublabels. Cor = situação; decisão de envio = checkbox.
- Colunas: Pessoa · Fatura Nº · **Anexos** (badges clicáveis Boleto ↗ / Nota fiscal ↗) · Destinatários (editável, inválido em vermelho) · Status · **Enviar** (checkbox).
- Semântica do checkbox (exata): Pronto **marcado por default**; Nota fiscal pendente marcável = **só boleto**; Já enviado marcável = **reenvio**; Sem destinatário **desabilitado** até corrigir (→ Pronto marcado). Cabeçalho marca **só os Prontos**. Contador **"N marcados" só no rodapé** + "Enviar N e-mails" (desab. com 0). Cabeçalho e rodapé **fixos**; tabela rola.
- **Disparo em lote (~2,1s), idempotência (resume por `jaEnviado`) e dupla-trava do modo real: INALTERADOS.** `estado`/`marcado` derivados de `draft`/`soBoleto`/`reenviar`/`desmarcado` (sem `set-state` em efeito).
- `ModalCentral` ganha **`rodape`** (footer fixo) + **`corpoFlex`** (props opcionais, callers existentes intocados).

### M5 — Fechamento
- Versão 4.37.1 → **4.38.0** (`package.json` + `package-lock.json` ×2; `version.ts` deriva de `pkg.version`). `CHANGELOG.md`, `CHANGELOG_DIRETORIA` (3 itens, linguagem de negócio), **ADR-0143**, este out-briefing.

## Invariantes / retrocompatibilidade
- **Lógica de emissão/envio intacta:** `emitirBoletos`/`emitirNotas`/`enviarEmailFatura`, idempotências, throttle do lote e dupla-trava do modo real idênticos. As actions só passaram a **gravar o aplicado** (M1) e a **ler** (M3).
- **Migration aditiva:** só `ADD COLUMN NULL` + `CREATE OR REPLACE` + RPCs novas; não reescreve dado. Aplicada via `npm run db:migrate -- --aditiva` (backup-gate **VERDE**); colunas + RPCs verificadas.
- **`ModalCentral`:** `rodape`/`corpoFlex` são opcionais → retrocompatível.

## Auto-auditoria adversarial (achados e decisões)
- **`registrarFalha` grava falhas** (status `erro`, sem `payment_id`, juros/multa `NULL`) → `resultado_boletos` traz sucessos + falhas; o UPSERT (`WHERE asaas_payment_id IS NULL`) nunca deixa falha sobrescrever sucesso. ✔
- **Limitação do desenho aprovado (a considerar, fora de escopo):** como o botão vira `Ver resultado` sempre que **há qualquer linha no banco** (inclusive falhas antigas), **não há re-emissão in-place** de uma fatura que falhou antes; a re-hidratação pode exibir uma falha antiga/estranha na tabela até o dado ser resolvido. É fiel ao toggle aprovado; um caminho de "reprocessar falhas" seria trabalho futuro.
- **"emitido" × "já emitido"** no modal usa o resultado de **sessão** quando presente; em reload puro, tudo emitido aparece como "emitido" (fiel — o boleto está emitido).
- **Negrito de juros/multa** usa heurística **≠ default (2)** — o banco não guarda "veio do cadastro" × "caiu no default"; entrega a intenção (destacar o não-usual), mas um cadastro de 2% aparece discreto.

## Gate de fechamento
`npx tsc --noEmit` → **0** · `npm test` → **345** verdes · `eslint` nos arquivos alterados → **0** · `npm run build` → exit **0** (o corpus **não versionado** `agent/` — assets de teste com deps não instaladas — quebra o typecheck do `next build`; buildado sem ele, refletindo o repo que a Vercel constrói). Migration 0172 aplicada (backup-gate VERDE) e verificada.

## Arquivos
- **Banco:** `supabase/migrations/0172_fatura_emissao_juros_multa_leitura.sql` (aditiva).
- **App:** `src/app/financeiro/faturamento-corp/actions.ts` (grava aplicado + 3 leituras fail-safe + `notaUrl`), `src/components/financeiro/faturamento-corp.tsx` (barra dois momentos, re-hidratação, 2 modais), `src/components/financeiro/revisar-envio-modal.tsx` (status puro + checkbox), `src/components/shared/modal-central.tsx` (`rodape` + `corpoFlex`).
- **Docs/versão:** `docs/adr/0143-resultado-emissao-modais-rehidratacao.md`, `package.json`/`package-lock.json` (4.38.0), `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing.
