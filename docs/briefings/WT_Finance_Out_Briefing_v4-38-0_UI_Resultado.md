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

---

## Adendo — Ajustes pós-mockup (rodada de 11 itens, mesmo PR #171, 2026-07-07)

Feedback do Yan sobre o PR aberto (ainda **não mergeado** → mesma versão 4.38.0, commits adicionais; não é versão nova). Lógica de emissão/envio segue intacta.

1. **Nota em erro não fica mais "processando" eterno.** Causa-raiz: a classificação usava allowlist NEGATIVO (default → "processando") e o render combinava spinner + cor neutra com status de erro. Correção: módulo **`src/lib/faturamento/status-nota.ts`** (`classificarStatusNota`/`labelClasseNota`), **fonte única** para tabela + 2 modais, com **fail-safe INVERTIDO** — allowlist POSITIVO de andamento (`SCHEDULED/SYNCHRONIZED/PENDING/PROCESSING/IN_PROCESS/PROCESSING_CANCELLATION` + vazio); `AUTHORIZED`=autorizada; `CANCEL*`=cancelada; **qualquer outro (ERROR/desconhecido)=falhou** (vermelho, `AlertTriangle`, sem spinner, com motivo). `dbToItemNota`, `LinhaResultadoNota` e `ModalResultadoNotas` reescritos para classificar pelo status **fresco** (`status ?? item.status`), nunca pelo `resultado` congelado. Teste de tabela em `status-nota.test.ts`. **Migration 0173 (aditiva):** `atualizar_status_nota` → `erro = COALESCE(...)` (o refresh não apaga o motivo de emissão — era a única coluna sem COALESCE). *Nota:* o vocabulário de erro da NF nunca foi confirmado empiricamente; "desconhecido = falhou" é a escolha segura (nunca mascara erro). Validar a string real de rejeição em sandbox segue como follow-up.
2. **Barra de ações:** removida a linha "E-mails: N com boleto…" (o estado vive no modal); botões à direita, mesma linha (com `flex-wrap` p/ telas estreitas).
3. **Legendas ao pé da tabela** (parágrafo NF + bloco de e-mail) removidas → **"?" com tooltip** (`CabecalhoAjuda`, primitivo `Tooltip`) nos cabeçalhos **Status / Boleto / Nota fiscal** (Nota abre à esquerda p/ não vazar do container rolável). Aviso "!configurado" preservado.
4. **Coluna Boleto alargada** (`w-28`→`w-36`, `min-w` 54→56rem): "ver boleto" não quebra linha.
5. **"Atualizar status"** saiu do cabeçalho da coluna (↻) → **botão bordado à direita, sempre visível** (desabilitado sem nota com status).
6. **Coluna Valor da revisão** em formato **contábil** (`<ValorContabil>`).
7. **Coluna Pessoa** dos 2 modais **trunca** (reticências + `title`) via `table-fixed`.
8/9. **Modais com tamanho fixo** — nova prop **`alturaFixa`** de `ModalCentral` (`h-[85vh]`) nos 3 modais; o estado de carga do "Revisar e-mails" preenche a altura (não colapsa).
10. **Anexos "Outros"** no Revisar envio: **upload por-linha** na coluna Anexos → badges removíveis → base64 no payload → `OpcoesEnvioFatura.anexosExtra` → **camada `enviarFaturaEmail`** decodifica e anexa (ponto único). **Anexo inválido/vazio/>15 MB = envio FALHA com motivo** (mesma regra do boleto/nota; nunca e-mail incompleto). `filename` sanitizado (sem path/quebra). Contagem em `anexos.outros` (jsonb aditivo do `registrar_email`). Limite por arquivo no cliente = 10 MB; `bodySizeLimit` já é 25 MB. Testes novos em `fatura.test.ts`. **Decisão:** por-linha (cada e-mail é de uma fatura) — não global.
11. **Subtítulos/títulos:** modais de resultado → "Confira o status das emissões de {boleto|notas fiscais} através da API do Asaas" + chip de ambiente (sandbox/produção); "Revisar e-mails" → título "Revisar e-mails antes do envio" + subtítulo "Revise as informações antes do envio dos e-mails, edite destinatários e inclua anexos".

### Achados da auto-auditoria adversarial (rodada de ajustes) — tratados
- **`emailEnviados` (action) virou código morto** (só a linha de e-mail removida a consumia) → **removida** (era desta mesma branch não-mergeada; o modal re-deriva "já enviado" via `prepararEnvioEmails`). Estado `emailFeitos`/fetch correspondentes removidos de `faturamento-corp.tsx`.
- **Falha re-hidratada sem motivo** exibia `falhou:` (dois-pontos órfão, sem ícone) → unificado com o ramo rico (`AlertTriangle` + `item.erro || status`).
- **Aviso de autorização congelado** podia mascarar uma nota autorizada num refresh posterior → gate `classe !== 'autorizada'` na tabela e no modal.

### Follow-ups registrados (fora de escopo desta entrega)
- Confirmar em sandbox a **string real de rejeição** da prefeitura para exibir o motivo fresco no refresh (hoje o refresh preserva o erro de emissão via COALESCE, mas o Asaas GET-invoice não expõe campo de erro modelado).
- `CANCELLATION_DENIED` é rotulado "cancelada" (borda impossível no nosso fluxo — não emitimos cancelamento); parидade com o comportamento anterior, deixado como está.

### Gate (rodada de ajustes)
`npx tsc --noEmit` → **0** · `npm test` → **354** verdes · `eslint` nos arquivos alterados → **0** · `npm run build` → exit **0** (a worktree de ajustes nasceu **sem** o corpus não-versionado, então o build roda limpo). **Migration 0173 aplicada** via `npm run db:migrate -- --aditiva` (backup-gate **VERDE**: 45/45 tabelas, restore-test spot 4/4 conferido) e a RPC verificada via REST (HTTP 200, no-op).

### Arquivos (adendo)
- **Banco:** `supabase/migrations/0173_atualizar_status_nota_preserva_erro.sql` (aditiva).
- **App:** `src/lib/faturamento/status-nota.ts` (+ `.test.ts`) NOVO; `src/components/financeiro/faturamento-corp.tsx` (itens 1-8,11); `src/components/financeiro/revisar-envio-modal.tsx` (8,9,10,11); `src/components/shared/modal-central.tsx` (`alturaFixa`); `src/app/financeiro/faturamento-corp/actions.ts` (`anexosExtra`; remoção de `emailEnviados`); `src/lib/email/fatura.ts` (+ `.test.ts`) (anexos "Outros").
- **Docs/versão:** `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing. (Versão permanece **4.38.0**; sem ADR novo — polimento sob ADR-0143.)

---

## Adendo 2 — Ajustes de interface transversais (mesmo PR #171, 2026-07-07)

Segunda leva de feedback do Yan no PR aberto (opção explícita: **mesmo PR**, apesar de tocar áreas fora do Faturamento — registrado honestamente no CHANGELOG/diretoria). Sem migration, sem mudança de lógica.

- **Acervo de Documentos — só a lista rola.** Página em **altura cheia** (`acervo/page.tsx`: container `h-full flex flex-col`); `AcervoDocumentos` vira coluna flex (`flex flex-1 min-h-0 flex-col`) com **título + busca + faixas de erro FIXOS** (`shrink-0`) e a **lista** num wrapper `flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]`. O `<main>` do AppShell continua o único scroll container global; a página apenas o preenche e rola a lista por dentro — o `scrollbar-gutter:stable` evita o "salto" lateral (mesma lição do DS §12). Padrão de altura resolve: `<main>` é `flex-1` de altura definida.
- **Acervo — linha não é mais clicável; download só no botão.** O `<li>` deixa de ser um `<button>` de linha inteira: o conteúdo textual vira um `<div>` e o **download** acontece por um botão de ícone dedicado à direita, com **hover sombreado** (`hover:bg-zinc-100 hover:text-zinc-700`), espelhando o botão da lixeira (`hover:bg-danger-bg hover:text-danger`). Evita downloads acidentais ao clicar na linha.
- **Largura padronizada das telas de upload de arquivo externo.** Calculadora de Rateio (`calculadora-rateio/page.tsx`) e Upload de Arquivos (`admin/uploads/page.tsx`) sobem de `max-w-2xl` → **`max-w-7xl`**, igual ao Faturamento Corporativo (referência) — as três telas de upload passam a ter a mesma largura cheia.
- **Upload de Arquivos — botão morto removido.** O botão desabilitado "Selecione um arquivo para importar" (renderizado nos estados `idle`/`erro`) era inerte — a seleção sempre foi na zona de arrastar/clicar acima. Removido.

**Gate (adendo 2):** `tsc` 0 · `eslint` (arquivos alterados) 0 · `build` exit 0. Testes inalterados (nenhum arquivo coberto por teste mudou). Sem migration.

**Arquivos (adendo 2):** `src/components/financeiro/acervo-documentos.tsx`, `src/app/financeiro/acervo/page.tsx`, `src/app/admin/uploads/page.tsx`, `src/app/financeiro/calculadora-rateio/page.tsx`, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, este out-briefing.

---

## Adendo 3 — Barra de rolagem horizontal FANTASMA na tabela de revisão (causa-raiz achada por medição)

Sintoma: barra de rolagem horizontal persistente na tabela de revisão do Faturamento, revelando **espaço vazio** ao rolar — mesmo em tela larga, e mesmo após remover o `min-w` e estreitar colunas.

**Causa-raiz (medida em repro HTML isolado, servido local + medido via `scrollWidth` no navegador):** o primitivo `Tooltip` (`src/components/ui/tooltip.tsx`) aplica **`whitespace-nowrap`** no balão. O `CabecalhoAjuda` (o "?" dos cabeçalhos Status/Boleto/Nota) passa texto LONGO e adicionava só `whitespace-normal` (sem `!`), que **NÃO vencia** o `whitespace-nowrap` da base (ordem do CSS). Resultado: o balão (invisível, `visibility:hidden` — que **ainda contribui para o `scrollWidth`**) virava uma linha gigante e transbordava **~313px à direita** → barra horizontal com "espaço vazio". Repro: balão `nowrap` → overflow **313px**; balão `whitespace:normal` → **0px**.

**Fix:** `!whitespace-normal` (important) no `CabecalhoAjuda` — força o wrap do balão (313px → 0). Não mexe no primitivo `Tooltip` (outras dicas são curtas e dependem do nowrap). Também revertida a coluna Nota para `w-56` (não quebra mais linha — a redução anterior para `w-36` foi diagnóstico equivocado) e Vencimento/Fatura para `w-24`/`w-20`, reduzindo a largura da coluna Pessoa (pedido do Yan). O `min-w` da tabela permanece removido (padrão canônico).

**LIÇÃO (custou caro — 3 tentativas erradas antes de MEDIR):** o `Tooltip` de `@/components/ui` tem `whitespace-nowrap` no balão + `position:absolute`; com conteúdo LONGO isso transborda invisivelmente e cria barra de rolagem fantasma no container `overflow-x-auto`. Para tooltip de texto longo, forçar `!whitespace-normal` + largura fixa. E: **diagnosticar overflow horizontal MEDINDO `scrollWidth` vs `clientWidth`** (repro isolado quando a página exige auth), não teorizando.
