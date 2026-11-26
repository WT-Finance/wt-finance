# JANUS · Briefing v6.5.3 — Solicitações: data limite, moeda e notas

**PATCH** (decisão do Yan, 26/11/2026 — pelo critério usual, tela nova + migration seria MINOR; registrado) · **Migration:** 1 aditiva (`0309`: tabela de notas, RPC `solic_nota_adicionar`, moeda no snapshot, moeda na API externa, notas em `app.solic_json`) · **ADR:** `0185` — notas como eventos imutáveis ao lado da projeção de movimentações · **Base:** `main` após o pós-merge da v6.5.2 (`38da4e57`) · **Branch:** `fix/v6-5-3-solicitacoes` · **Rota A** (planejado no chat de 26/11)

*Uma usuária no Safari do macOS não conseguia abrir solicitação: o campo Data limite mostrava a data de hoje, mas estava vazio. A versão corrige isso e o jeito como o formulário aponta erros, e traz duas melhorias: moeda (R$, US$, €) nos campos de valor e uma seção Notas no drawer, com a linha do tempo da solicitação e comentários.*

---

## 1. Decisões do Yan (firmes — embutir, não rediscutir)

**Bug da Data limite (diagnóstico de 26/11)**
- Causa: o Safari do macOS desenha a data de HOJE dentro de um `<input type="date">` vazio. A usuária via "26/11/2026", enviava e o modal recusava com "Informe a data-limite." (valor `''`). Nos 7 dias de log de produção, Solicitações teve só dois erros de servidor (e-mail transitório do Office 365 na #3068; o anexo 147 já conhecido da v6.2.1) — erro de validação no navegador não chega a log nenhum.
- **A Data limite nasce preenchida com hoje + 3 dias CORRIDOS** (fuso SP), editável.
- **O texto do "?" do campo fica como está** ("Data limite para resposta da solicitação. Prazo padrão de 3 dias.").

**Moeda**
- Todo campo do tipo **Moeda** ganha um seletor: **R$, US$, €** (o Yan escreveu "EUR$"; decidido **€**). Padrão R$.
- Guardado como código ISO (`BRL`/`USD`/`EUR`) no snapshot da resposta. Tudo o que já existe é R$.
- **A API externa também aceita a moeda** (pedido do Yan): o campo de moeda pode vir como texto/número (R$, como hoje) ou como objeto `{ "valor": "1500,00", "moeda": "USD" }`.

**Notas**
- Seção geral **Notas** no drawer, **abaixo de "Outros anexos"**: linha do tempo com as movimentações ("Aprovada por yan@… em 16/11/2026 às 16:42.") e os comentários ("yan@… comentou: …").
- Botão **"Adicionar nota"** para comentar.
- **Cores:** cada movimentação na cor do seu badge (Abertura neutra, Aprovação âmbar, Conclusão verde, Rejeição vermelha, Cancelamento cinza); **comentário em cor neutra própria, com o autor em negrito**.
- Os blocos atuais **"Aprovada por…" e "Encerramento" passam a viver SÓ dentro de Notas** (a justificativa da rejeição vai junto).
- **Quem comenta:** qualquer pessoa que vê a solicitação (solicitante, destinatário, gestão), **inclusive depois de encerrada**.
- **Comentário dispara e-mail** aos envolvidos, **menos o autor** do comentário.
- Comentário **não se edita nem se apaga** (registro).

## 2. Missões

| # | Missão | Arquivos |
|---|---|---|
| M1 | Data limite padrão + erro no campo (feita, `f13e6cc0`) | `format.ts`, `campo-data.tsx`, `campos-dinamicos.tsx`, `modal-nova-solicitacao.tsx`, `lib/ui/campos.ts` |
| M2 | Este briefing | `docs/briefings/` |
| M3 | Migration 0309 + aplicação + baseline + `database.ts` | `supabase/migrations/0309_*`, `supabase/baseline/`, `src/types/database.ts` |
| M4 | Moeda no front: seletor, exibição, Exportar, rota e documentação da API | `campos-dinamicos.tsx`, `modal-nova-solicitacao.tsx`, `format.ts`, `schemas.ts`, `exportar.ts`, `api/externo/solicitacoes/route.ts`, `documentacao-content.tsx`, `docs/api-externa-solicitacoes.md` |
| M5 | Notas: linha do tempo, Adicionar nota, e-mail | `linha-do-tempo.ts` (novo), `notas-solicitacao.tsx` (novo), `drawer-solicitacao.tsx`, `actions.ts`, `lib/email/` |
| M6 | Fechamento | ritual `/fechamento-versao` |

## 3. Invariantes

- Banco segue fonte de verdade da validação (`app.solic_validar_e_snapshotar`); o modal só antecipa o erro.
- Resposta sem `moeda` no snapshot = R$ (nada é reescrito; migration sem DML em dado existente).
- O valor gravado continua no formato que o banco já aceita (um separador); a moeda é chave à parte.
- Movimentações continuam **derivadas** das colunas da solicitação (ADR-0169); notas são **eventos** numa tabela própria, imutáveis.
- Comentar **não** muda status nem reabre nada.
- E-mail é camada adicional: falha não derruba a nota.

## 4. Fora desta versão (registrar no out-briefing)

- O mesmo `<input type="date">` nativo existe em Antecipações, Inventário, Estante e filtros de período — risco igual no Safari, não tratado aqui.
- Notas não entram no Exportar nem na página Movimentações (gestão).
- "Corrigir e reenviar" uma rejeitada (discutido em 13/10) — fora.
- A documentação da API dentro da plataforma omite o e-mail de "aprovada" (divergência antiga com o `.md`).
- Teste no Safari real fica com a usuária/Yan (o WebKit do Linux não reproduz).

## 5. Skills a ler

`banco-e-rpc`, `contrato-rpc-front`, `ui-design-system`, `react-padroes`, `email`, `tabela-densa` (só se mexer em tabela).
