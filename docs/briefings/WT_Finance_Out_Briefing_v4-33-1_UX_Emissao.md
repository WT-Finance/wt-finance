# WT Finance — Out-Briefing v4.33.1 · Faturamento — Refinamento de UX (tela de Emissão)

**Data:** 2026-07-01 · **Branch:** `feat/v4-33-1-faturamento-ux-emissao` (base `main` @ v4.33.0) · **Versão:** 4.33.0 → **4.33.1** (PATCH)
**Tema:** Refino de apresentação da tela de Emissão — dois momentos na tabela, ordem do fluxo, painel de resultado agrupado. **SEM migration / SEM banco.** **ADR-0138.** A lógica de emissão é **byte-idêntica** (provado por git diff). **Merge e deploy ficam com o usuário.**

## O que é
Só apresentação da aba **Emissão** do Faturamento Corporativo (a aba Cadastro e a lógica de emissão não mudam). Reorganiza a tabela de revisão (antes/depois de emitir), a ordem da tela e o painel de resultado.

## Missões

### M1 — Tabela de revisão (dois momentos)
- **Antes de emitir:** Cruzamento = **só o status** (badge). Boleto = checkbox. Nota = seletor **rótulo curto** (Normal/Avulsa/Não emitir) com **valor avulso inline** (mesma linha, à direita → altura constante). Colunas de referência mantidas (Vencimento, Fatura Nº). Valores à direita/tabulares. **Não-identificado destacado** (linha + valor em tom de alerta). Densidade menor (`py-1`).
- **Depois de emitir:** resultado **co-locado na coluna própria** — boleto na coluna Boleto (emitido + “ver boleto” / falhou: motivo / pulado); nota na coluna Nota (autorizada + “ver nota” / processando / falhou). Cruzamento em **de-ênfase** (`opacity-50`). Boletos e notas são ações separadas → cada coluna reflete a sua.
- **PT-BR:** `labelStatusNota` mapeia o status do Asaas → processando / autorizada / falhou / cancelada. **“NF synchronized” eliminado.** Explicação Normal/Avulsa movida para a legenda ao pé.

### M2 — Ordem da tela + painel de resultado
- **Ordem:** upload → revisão (botões ao pé) → **resultado ABAIXO, só depois de emitir** (os painéis saíram de cima da revisão).
- **Painel:** cartões de contagem (`Contagem`, número em destaque) + **erros agrupados por motivo** (`ErrosAgrupados`/`GrupoErro`) — cada motivo uma vez com a contagem + **“Ver detalhes”** (estado local, `aria-expanded`) que expande as faturas afetadas (Pessoa · Fatura Nº · Valor); “Ocultar” colapsa.

### M4 — Ajustes de refino (mesmo PR #159, follow-up do Yan)
Aproveitando o PR aberto (ainda no checkpoint), nove ajustes de apresentação/default — **sem tocar a lógica de emissão**:
1. **Boleto vira seletor** Emitir / Não emitir (espelha o da NF); `ControleBoleto` substitui o checkbox. Handler `toggleEmitir` → `setEmitir(linha, val)` (mesmo efeito, valor explícito).
2. **Default da NF = Normal** nas faturas prontas-NF (`classificar.ts`: `modoNf = prontaNf ? 'normal' : 'nao'`); as não-prontas nem exibem seletor.
3. **Coluna “Cruzamento” → “Status”**.
4. **Larguras ajustadas + `table-fixed`** — o texto da coluna Nota (“falhou: Endereço do cliente incompleto”) **quebra dentro da coluna** e não escapa/estoura a tabela.
5. **Botões lado a lado, sem número** — “Emitir boletos” / “Emitir notas fiscais”; o de boleto ganhou ícone (`Barcode`).
6. **Atualizar status (↻) migra para o cabeçalho da coluna Nota fiscal** — ícone único (spinner ao atualizar), aparece só quando há nota com status a acompanhar; saiu do painel de resultado (props `onAtualizar/atualizando/podeAtualizar` removidas do `ResultadoNotaCard`).
7. **Cadastro: “OBS” → “Observações”**.
8. **Cadastro: filtro de origem removido** (pills Toda/Planilha/Manual + estado `origemFiltro` + escopo de origem no “Apagar todos”).
9. **Cadastro: filtro de situação abre em “Ativo”** (default).

Não-regressão preservada: `classificar.ts` é a preparação da tela (defaults de seleção), não a emissão; `cadastro-clientes.tsx` é a aba Cadastro (não a Emissão). A camada Asaas e as Server Actions de emissão permanecem intocadas.

### M3 — Fechamento
v4.33.1, CHANGELOG, CHANGELOG_DIRETORIA, ADR-0138, este out-briefing. SEM migration.

## Invariantes — auto-auditoria
1. **NÃO-REGRESSÃO da emissão (o crítico)** ✅ — **provado por `git diff`**: só `src/components/financeiro/faturamento-corp.tsx` no diff (175+/94−, apresentação). As chamadas `emitirBoletos(payload, {confirmacaoProducao})`/`emitirNotas(...)`/`atualizarStatusNotas(itens)` byte-idênticas; o único `useState` novo é o `aberto` do "Ver detalhes" (estado local de exibição). `src/lib/asaas/`, as Server Actions, a aba Cadastro (Fase 3) e o wrapper de abas **fora do diff**.
2. **Altura constante** ✅ — avulsa inline (mesma linha do seletor); sem “pulo”.
3. **Resultado co-locado** ✅ — boleto na coluna Boleto, nota na coluna Nota.
4. **Ordem** ✅ — resultado só após emitir, abaixo dos botões.
5. **Erros agrupados + Ver detalhes** ✅ — um motivo uma vez, expansor local acessível.
6. **PT-BR** ✅ — nenhum “NF synchronized”; status em PT-BR.
7. **Não conserta erros de dados** ✅ — validação/emissão intactas; só mudou como os erros aparecem.

## Gate de fechamento
- `npx tsc --noEmit` → **0** · `npm run lint` → **limpo** · `npm test` → **300** (lógica de emissão mantém seus testes) · `npm run build` → exit 0. **SEM migration** (backup-gate não se aplica).

## CHECKPOINT do Yan (antes do merge)
1. Abrir a tela, subir uma planilha → conferir a **ordem nova** (upload → revisão → resultado depois).
2. Tabela mais limpa: **avulsa inline sem pulo**, valores à direita, **não-identificado destacado**, **sem “NF synchronized”**.
3. Emitir no sandbox → resultado **co-locado** (boleto na coluna Boleto, nota na Nota) + painel com **erros agrupados** e **“Ver detalhes”**.
4. **Confirmar que a emissão (boleto/nota) funciona igual à v4.33.0.**

## Fora de escopo
- **Investigação do Yan:** por que os erros de dados (Endereço/E-mail/CEP incompleto) acontecem — a origem, não a exibição.
- **Fase 4:** envio de e-mails (M365, throttling, anexos, destinatários do cadastro).
- **Produção:** só após todas as fases.

## Arquivos
- **Modificados:** `src/components/financeiro/faturamento-corp.tsx` (só apresentação: tabela dois-momentos, ordem, painéis, helpers `Contagem`/`ErrosAgrupados`/`GrupoErro`/`labelStatusNota`); `CHANGELOG.md`; `src/data/changelog-diretoria.ts`; `package.json`/`package-lock.json` (4.33.1).
- **Novos:** `docs/adr/0138-faturamento-ux-dois-momentos.md`; este out-briefing.
- **SEM migration.** Lógica de emissão, camada Asaas e aba Cadastro **intocadas**.
