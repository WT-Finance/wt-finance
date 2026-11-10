# Out-briefing — v6.5.2 · Faturamento Corporativo: Cadastro de clientes alinhado à planilha oficial

**Rota C (patch), pedido direto do Yan em sessão, 10/11/2026.** Branch `fix/v6-5-2-cliente-eventual`.
Migration **0307 APLICADA** (aditiva). Sem ADR.

## 1. Origem

Na retomada do Faturamento Corporativo (o Yan voltou ao processo após meses), a reimportação da planilha oficial
`Faturamento Clientes - Corporativo.xlsx` (OneDrive, 8. Financeiro/Faturamento corporativo) expôs quatro defeitos:

1. a planilha abre na aba "calculo reverso" — o import lia só a 1ª aba e recusava ("precisa conter EMPRESA");
2. juros/multa em texto ("padrão", "1% ao mês", "10% sobre o valor integral…") — `parsePctContrato` é estrito e a
   reimportação crua rebaixaria em silêncio ~28 clientes (juros 1%) e ~27 (multa 5/10%) para 2%/2% em boleto de
   PRODUÇÃO (o Asaas já está em produção);
3. a situação **EVENTUAL** (28 clientes sem contrato) virava NULL no import — e NULL é tratado como inativo no envio
   do e-mail de fatura;
4. a coluna **CONTRATO** (Sim/Não) não existia no Janus.

No mesmo dia, a planilha de faturamento (`faturamento.xlsx`) mostrou a linha de TOTAL do Monde entrando como fatura
"não identificada" e dobrando o resumo.

Decisões do Yan: criar "Eventual" no Janus, com e-mail igual ao Ativo; coluna Contrato com selo ✓/✗; botão de tela
cheia no canto superior direito da tabela; levar junto as melhorias pequenas (aba pelo cabeçalho, juros/multa na
entrada, linha de total). EXCOM: vale a linha da planilha.

## 2. Entregue

| Item | Onde |
|---|---|
| Situação `ativo`/`eventual`/`inativo`, regra única e **fail-closed** (match exato) + `situacaoEnviavel` | `src/lib/faturamento/situacao-cliente.ts` (+ teste) |
| Envio de e-mail aceita eventual (`enviarEmailFatura`, `prepararEnvioEmails`); motivo "inativo ou sem situação" | `src/app/financeiro/faturamento-corp/actions.ts` |
| Contrato `sim`/`nao` no import, criação e edição; selo ✓/✗ editável | `parse-clientes-corp.ts`, `cadastro-actions.ts`, `cadastro-clientes.tsx` |
| Tela cheia (Fullscreen API sobre o bloco, molde do Demonstrativo); confirmação de apagar sai da tela cheia antes | `cadastro-clientes.tsx` |
| Import acha a aba pelo cabeçalho EMPRESA | `parse-clientes-corp.ts` |
| `normalizarPctEntrada` (regra da 0170) no import E na criação/edição manual | `juros-multa.ts`, `cadastro-actions.ts` |
| Normalização reaplicada **no servidor** (situação, contrato, juros/multa) | `cadastro-actions.ts` |
| Linha de total do Monde ignorada (sem Pessoa, sem Fatura Cliente Nº e sem datas) | `parse-faturamento.ts` (+ teste novo) |
| Migration 0307: coluna `contrato` + CHECK; 3 RPCs gravam/aceitam `contrato` | `supabase/migrations/0307_cliente_corporativo_contrato.sql` |

Prova com a planilha oficial real pelo parser novo: 249 clientes, 101 ativos / 28 eventuais / 120 inativos; juros
222×2% / 27×1%; multa 223×2% / 20×10% / 6×5%; contrato 27 Sim / 222 Não — sem preparação manual.

## 3. Banco

- **0307 aplicada** em 10/11 via `npm run db:migrate -- --aditiva`: backup-gate VERDE (93/93, restore-test 3/3),
  guard interno passou. Antes, a 0304–0306 (v6.5.1, já aplicadas) foram copiadas idênticas só para o `db push` e
  **removidas** antes do commit (não pertencem a esta branch).
- **Prova REST com service_role** (executa o corpo): listar → 249 linhas, todas com a chave `contrato` (NULL);
  inserir sonda com `contrato='sim'`/`eventual` → gravou; atualizar `nao` → `nao`; `''` → NULL; `'Sim'` → **23514**
  (CHECK recusa); sonda excluída, cadastro de volta a 249.
- `supabase/baseline/schema-v6.json` regenerado (`ultima_migration` 0307). Traz também os objetos das 0304–0306
  (produção real). **Conflita com o PR #311**: quem mergear por último rebaseia e roda `npm run db:baseline`.
- `src/types/database.ts` **não** regenerado: a 0307 não muda assinatura de RPC (as do Cadastro são chamadas fora dos
  tipos gerados); regenerar agora traria as RPCs da v6.5.1, que são do #311.
- **Ordem obrigatória cumprida:** a 0307 já está no banco antes do merge — o front novo chama
  `atualizar_cliente_corp(p_campo='contrato')`, que a função anterior recusaria.

## 4. Gates

`npm run build` OK · `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` **2.608 passaram**; 2 arquivos de oráculo
(`oraculo-contas-receber`, `oraculo-demonstrativo`) não carregam por fixture inexistente na máquina
(`contas-receber-cru-24.xlsx`, `demonstrativo-cru.xlsx` — B-38, pré-existente, sem relação com o patch).

## 5. Parecer da revisão

### `revisor-db` — APROVADA, liberada para aplicar
- MÉDIO ordem de deploy (0307 antes do front) → cumprida e registrada.
- MÉDIO a migration não corrige dado → 🔴 reimport pelo Yan (§7).
- MÉDIO baseline/conflito com #311 → regenerado; nota no PR e WORKING-CONTEXT.
- BAIXO header sem DOWN → acrescentado.
- Pediu não commitar as cópias 0304–0306 → removidas.

### `revisor` — 1 ALTO, 4 MÉDIOS (todos corrigidos)
- **ALTO** confirmação de "Apagar" invisível em tela cheia (`ModalCentral` faz portal no `<body>`) → `abrirConfirmApagar`
  sai da tela cheia antes de abrir.
- MÉDIO linha de total ampla demais → assinatura estreita (4 campos vazios) + teste de linha com data que não some.
- MÉDIO `normalizarPctEntrada` só no import → também em criação/edição (servidor).
- MÉDIO `includes('ativ')` fail-open → match exato + testes "desativado"/"não ativo".
- MÉDIO servidor confiava no navegador → normalização reaplicada nas actions.
- BAIXOS: filtro abria em "Ativo" → decidido pelo Yan: rótulo "Toda" vira "Todos" e é o padrão ao abrir; `normalizarContrato` ganhou teste próprio; mensagem
  "inativo" virou "inativo ou sem situação". Não endereçados (pré-existentes, fora do escopo): falha de salvar na
  edição inline sem aviso; `<span onClick>` sem teclado; `page.tsx` engole falha de `listar_clientes_corp`.

### `verificador-visual`
**Não rodou** — sessão de background sem credencial de login. A tela (selo Eventual âmbar, coluna Contrato ✓/✗,
botão de tela cheia, Esc, apagar em tela cheia) fica para o Yan conferir no preview.

## 6. Advisor

Orquestrador: 2 consultas na sessão, as duas mudaram o rumo. (1) Antes da primeira atualização do Cadastro:
preparar o arquivo para o Importar da tela em vez de SQL por fora, e não escolher a EXCOM pelo Yan. (2) No
fechamento: auditar o código pós-revisão contra os arquivos REAIS (feito — delta exato: 27 vazios→eventual, EXCOM
na linha da planilha, contrato nos 249, nada mais muda; `faturamento.xlsx` real → 9 faturas, total ignorado) e
trocar dados reais de cliente nos testes por fictícios. Revisores: 0. 🔴 Custo: pendência do Yan (`/usage`).

## 7. 🔴 Pendências do Yan

1. **Mergear** (a 0307 já está aplicada). Se o #311 entrar antes, rebasear esta branch e rodar `npm run db:baseline`.
2. **Depois do deploy:** Faturamento Corp → Cadastro → **Importar** a planilha oficial do OneDrive, direto. Só isso grava
   os 28 Eventuais e o Contrato dos 249. A EXCOM passa à linha da planilha (vencimento 10/20/30, 2%/2%, controladoria@).
3. Conferir no preview: selo Eventual, coluna Contrato ✓/✗ (editar), tela cheia (entrar/sair/Esc), apagar em tela cheia.

## 8. Arquivos

`src/lib/faturamento/situacao-cliente.ts` (novo) · `situacao-cliente.test.ts` (novo) · `parse-faturamento.test.ts`
(novo) · `parse-clientes-corp.ts` / `.test.ts` · `juros-multa.ts` / `.test.ts` · `parse-faturamento.ts` ·
`src/app/financeiro/faturamento-corp/actions.ts` · `cadastro-actions.ts` · `src/components/financeiro/cadastro-clientes.tsx`
· `supabase/migrations/0307_cliente_corporativo_contrato.sql` · `supabase/baseline/schema-v6.json` · `CHANGELOG.md` ·
`src/data/changelog-diretoria.ts` · `package.json` · `docs/WORKING-CONTEXT.md` · este out-briefing.
