# ADR-0143 — Resultado da emissão em modais + re-hidratação do banco (juros/multa registrados; leitura por ref)

**Status:** Aceito · **Data:** 2026-07-06 · **Versão:** v4.38.0
**Relaciona / emenda:** ADR-0142 (Visão B parcial — deixou explícito "sem UI dos valores aplicados nem registro em `fatura_emissao`, melhorias de interface, depois" — **este ADR fecha esse gap**). ADR-0134/0135/0136 (Faturamento Fases 1-2), ADR-0137 (Cadastro), ADR-0140/0141 (envio de e-mail 4a/4b). **Migration 0172 (aditiva).**

## Contexto

Com o Faturamento funcionalmente completo (Fases 1-4 + v4.37.0), o Yan listou melhorias de interface do uso real, iteradas por mockup (4 rodadas — desenho final aprovado item a item). Três convergências tornam o pacote maior que "cosmético":

1. **O modal de resultado com juros/multa EXIGE registrar o aplicado** — a UI não tinha de onde ler o percentual efetivamente aplicado a cada boleto (a ADR-0142 aplicou juros/multa por cliente mas não persistiu o aplicado).
2. **Ler o resultado do banco ENTREGA a re-hidratação** — a tela dependia do estado de sessão (perdido no reload); o follow-up do `invoice_id` da Fase 2 (o "Atualizar status" parava de funcionar após reload) se resolve aqui.
3. **O checkbox do "Revisar envio" ABSORVE as ações** "enviar só o boleto" e "reenviar" (que deixam de ser links), unificando a semântica de seleção.

**Invariante que rege tudo:** a **lógica de emissão/envio é INTACTA** — `emitirBoletos`/`emitirNotas`/`enviarEmailFatura`, idempotências, throttle do lote e dupla-trava do modo real seguem idênticos. Esta versão muda **apresentação** + **registro/leitura**.

## Decisão

### 1. Migration 0172 (aditiva): registrar o aplicado + RPCs de leitura
`app.fatura_emissao` ganha `juros_aplicado`/`multa_aplicada` (`int`, `NULL`). `registrar_emissao` grava o percentual **efetivamente aplicado** (do cadastro ou o default 2) **só ao criar o boleto NOVO**; boleto que **já existia** grava `NULL` (não sabemos o que o Asaas aplicou na criação) e registros **antigos** ficam `NULL`. A UI exibe `NULL` como **"—"** — **NUNCA inventa 2% retroativo**. O guard `WHERE asaas_payment_id IS NULL` do UPSERT garante que o aplicado só "pega" na 1ª gravação de sucesso. Duas RPCs de leitura novas (padrão **inline** — `exigir_acesso` na 1ª linha, `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated, service_role`): `resultado_boletos(p_refs)` e `resultado_notas(p_refs)` — **não filtram por sucesso** (trazem também os que falharam, `status='erro'`, pois o modal mostra emitido/falhou).

### 2. Resultado em DOIS MODAIS sob demanda + barra "dois momentos"
Os painéis inline de resultado + a coluna E-mail por-linha **saem**. Cada `Emitir X` da barra **vira** `Ver resultado · X` (largura **fixa** por botão — não "pula" na troca de texto) **quando há resultado no banco** para as refs carregadas (não só após emitir na sessão); `Enviar e-mails` fixo à direita, **sem contador** (o contador vive no rodapé do modal de lote). Modais lidos do banco: **boletos** (Pessoa · Fatura Nº · Valor contábil · **Juros · Multa** · Status) e **notas** (com "Atualizar status" **dentro**). Juros/multa: valor **≠ padrão** (do cadastro) em **negrito**, **= padrão** (2) discreto, `NULL` → "—".

### 3. Re-hidratação read-only + FAIL-SAFE
Ao carregar/cruzar a planilha, a tela consulta o banco por ref (boleto emitido+URL; nota status+`invoice_id`+PDF; e-mail enviado no modo) e **popula os status SEM reemitir** — a tela lembra o que já foi feito. As três leituras são **fail-safe** (a action devolve `[]` em erro): uma leitura que caia **não quebra** a tela nem esconde os controles (a emissão é idempotente). O `invoice_id` re-hidratado faz o "Atualizar status" da nota funcionar pós-reload.

### 4. Revisar envio final: status puro em 4 cores + checkbox com semântica exata
O Status vira **mensagem pura** em 4 cores (Pronto / Sem destinatário / Nota fiscal pendente / Já enviado) — **sem pills, links ou sublabels**; a **cor reflete a situação**, a **decisão de envio vive no checkbox**. Coluna **Enviar**: Pronto **marcado por default**; Nota fiscal pendente marcável = enviar **só o boleto**; Já enviado marcável = **reenvio**; Sem destinatário **desabilitado até corrigir** a célula (→ Pronto, marcado). O cabeçalho marca/desmarca **só os Prontos**. Anexos viram **badges clicáveis** (Boleto ↗ / Nota fiscal ↗). Cabeçalho e rodapé **fixos** (a tabela rola — receita `border-separate`/DS §7); contador "N marcados" só no rodapé. **Disparo em lote, idempotência (resume) e dupla-trava do modo real: inalterados.**

### 5. `ModalCentral` ganha `rodape` (footer fixo) + `corpoFlex`
Duas props **opcionais** (retrocompatíveis — callers existentes inalterados): `rodape` renderiza um footer fixo (`shrink-0` + `border-t`); `corpoFlex` faz o corpo ser um flex-col **sem scroll próprio**, para o caller controlar o scroll interno (sub-cabeçalho fixo + tabela `flex-1 min-h-0 overflow-auto`).

## Consequências

- **Positivas:** o resultado da emissão fica em detalhe (com juros/multa por cliente) num painel próprio; a tela lembra o que já foi feito e sobrevive ao reload (fecha o follow-up do `invoice_id`); a semântica de envio fica unificada no checkbox; `ModalCentral` reutilizável para modais com cabeçalho/rodapé fixos. Lógica de emissão/envio preservada.
- **Negativas / limites:** a barra "dois momentos" implica que, **havendo qualquer linha de resultado no banco** (inclusive falhas antigas), o botão fica em `Ver resultado` — logo **não há re-emissão in-place** de uma fatura que falhou antes, e a re-hidratação pode exibir uma falha antiga/estranha na tabela até que o dado seja resolvido. É fiel ao desenho aprovado (toggle), mas é uma limitação a considerar (ex.: um caminho de "reprocessar falhas" seria trabalho futuro). O rótulo "N boletos"/"N notas" conta as **linhas de resultado** (inclui falhas). A distinção "emitido" × "já emitido" no modal usa o resultado de **sessão** quando presente; em reload puro, tudo que está emitido aparece como "emitido" (fiel — o boleto está emitido). O negrito de juros/multa usa a heurística **≠ default (2)** (o banco não guarda "veio do cadastro" × "caiu no default"); entrega a intenção (destacar o não-usual), mas um cadastro com 2% aparece discreto.
