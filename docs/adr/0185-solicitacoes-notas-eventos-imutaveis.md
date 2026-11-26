# ADR-0185 — Solicitações: notas são eventos imutáveis ao lado das movimentações derivadas

**Status:** aceito (v6.5.3) · **Data:** 2026-11-26 ·
**Contexto:** patch v6.5.3, "Solicitações: data limite, moeda e notas" (Rota A) ·
**Briefing:** `docs/briefings/briefing-v6-5-3-solicitacoes-correcoes-melhorias.md` ·
**Migration:** `0309` (aditiva, aplicada em 26/11) ·
**Código:** `src/lib/solicitacoes/linha-do-tempo.ts`, `src/components/solicitacoes/notas-solicitacao.tsx`,
`src/app/solicitacoes/actions.ts` (`adicionarNota`), `src/lib/email/template.ts` (variante `nota`)

> Numeração conferida contra `docs/adr/` e as worktrees em 26/11/2026 (último real: ADR 0184).

## O problema

Não havia onde conversar dentro de uma solicitação: a dúvida sobre um valor, o aviso de que o comprovante
subiu, a explicação depois de uma rejeição — tudo ia para fora da plataforma. E o histórico que o drawer
mostra não é um registro de eventos: o ADR-0169 fixou que as movimentações são **derivadas** das colunas da
solicitação (`criado_em`, `aprovado_*`, `decidido_*` + `status`). Um comentário não é estado da solicitação;
não cabe numa coluna.

## A decisão

1. **Notas são EVENTOS numa tabela própria** (`app.solicitacao_nota`: autor, texto, instante). Uma linha por
   comentário, **sem edição nem exclusão** — nenhuma RPC as altera depois de escritas. É o registro da conversa.
2. **Movimentações seguem DERIVADAS** (ADR-0169 intacto). A seção Notas do drawer **intercala** as duas fontes
   por instante numa função pura (`linhaDoTempo`): abertura, aprovação, comentários e desfecho (com a
   justificativa da rejeição). Os blocos "Aprovada por…" e "Encerramento" passaram a viver só ali.
3. **Comentar não muda estado.** Vale em qualquer status, inclusive encerrada (decisão do Yan): não reabre, não
   aprova, não conta como resposta. Quem comenta é quem vê (`app.pode_ver_solic`: solicitante,
   destinatário/membro da role, gestão).
4. **As notas viajam em `app.solic_json`** (chave `notas`), o ponto único das leituras (`solic_minhas`,
   `solic_caixa`, `solic_detalhe`) — o drawer deriva da linha da lista. Volume medido: 284 solicitações.
5. **Comentário avisa por e-mail** os envolvidos, menos o autor. O instante e o autor vêm do retorno da RPC
   que gravou (`solic_nota_adicionar`), não do contexto genérico do e-mail.

## Alternativas descartadas

- **Tabela de eventos para TUDO (movimentações inclusive).** Resolveria também o "a rejeição some se a
  solicitação for reaberta" discutido em 13/10, mas reescreve `solic_movimentacoes`, o Exportar e a API, e
  pede backfill de 284 históricos reconstruídos das colunas. Fica para quando houver reabertura de verdade.
- **Comentário como coluna de texto na solicitação.** Um só por solicitação, sobrescrevível — o oposto de
  registro.
- **Notas só no `solic_detalhe`.** O drawer da tela principal não chama o detalhe; teria de buscar ao abrir,
  com estado de carregamento próprio, para um volume que cabe na lista.

## Consequências

- A lista carrega todas as notas de todas as solicitações visíveis num jsonb só. Hoje é desprezível; se a
  conversa crescer (achado B4 do `revisor-db`), o caminho é a lista levar só a contagem e as últimas N, e o
  detalhe o resto.
- Sem limite de quantidade por usuário (B5): aceitável numa ferramenta interna.
- O `DOWN` da 0309 apaga as notas escritas (`DROP TABLE`): exportar antes.
- Notas não entram no Exportar nem na página Movimentações (fora da v6.5.3).
