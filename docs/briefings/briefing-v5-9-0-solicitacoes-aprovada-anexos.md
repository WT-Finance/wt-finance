# Briefing v5.9.0 — Solicitações: status "Aprovada" e anexos ao longo da vida

**Rota A (produto).** Origem: pedido do Yan em 25/08/2026. Decisões de produto fechadas em
duas rodadas de perguntas antes deste documento — este briefing as embute; **não rediscutir**.

## Objetivo

Duas frentes no módulo de Solicitações:

1. **Status "Aprovada"** — uma etapa intermediária **opcional** entre `aberta` e `concluida`,
   para o caso em que autorizar e executar são momentos distintos (aprovo o pagamento hoje,
   pago amanhã).
2. **Anexos ao longo da vida da solicitação** — hoje só se anexa na abertura. Passa a ser
   possível anexar enquanto a solicitação não estiver encerrada, pelos **dois lados**
   (solicitante e destinatário), para que o comprovante do pagamento efetuado chegue a quem
   abriu o pedido.

---

## Decisões firmes (embutir, não rediscutir)

| # | Decisão | Consequência |
|---|---|---|
| D1 | `aprovada` é **etapa intermediária**, não terminal | Quebra a premissa da constraint `solicitacao_terminal_decidido` |
| D2 | **Aprovar é opcional** — dá para concluir direto de `aberta` | Não há flag por tipo; nenhum fluxo existente é forçado a mudar |
| D3 | Quem aprova é o **mesmo destinatário** que hoje conclui/rejeita | Zero RBAC novo; reusa `app.sou_atendente` |
| D4 | De `aprovada` saem: **concluir, rejeitar, cancelar** | **Não existe** "desfazer aprovação" — o ciclo só anda para frente |
| D5 | Anexo pós-criação: **enquanto não encerrada** (`aberta` ou `aprovada`) | Solicitação encerrada continua imutável |
| D6 | Quem anexa: **solicitante e destinatário** | Reusa `app.pode_ver_solic` (que inclui a área de gestão) |
| D7 | **Sem bloco de anexo livre** — só campos `tipo_campo='anexo'` do tipo | O comprovante vai num campo anexo **não-obrigatório** que o admin cria |
| D8 | Board ganha **aba própria "Aprovadas"** (3 abas) | Abertas · Aprovadas · Encerradas |
| D9 | API externa: o parceiro **só LÊ** o status novo | Sem endpoint de aprovar |
| D10 | API externa: o parceiro **pode cancelar** solicitação já aprovada | Mexe na trava do endpoint de cancelar (hoje exige `aberta`) |
| D11 | A doc da API é **corrigida**, sem comunicação prévia ao parceiro | Registrar no out-briefing (ver §Risco 3) |

### Assunções declaradas (o briefing não perguntou; corrigir aqui se divergir)

- **`aprovada` ainda pode vencer.** `vencida()` hoje é `status === 'aberta' && data_limite < hoje`.
  Passa a valer para `aberta` **e** `aprovada` — uma aprovação parada há duas semanas continua
  sendo atraso.
- **`aprovada` continua contando como pendência.** `solic_minhas_pendencias` (o número no menu)
  passa a contar `status IN ('aberta','aprovada')` — ainda é trabalho a fazer na sua caixa.
- **A aprovação dispara e-mail de movimentação**, como as outras três ações
  (`notificarMovimentacao(id, 'aprovada')`), por simetria com criada/concluída/rejeitada/cancelada.

---

## Ciclo de vida resultante

```
aberta ──aprovar──▶ aprovada ──concluir──▶ concluida
   │                    │
   ├──concluir──────────┼──▶ concluida     (atalho: aprovar é opcional — D2)
   ├──rejeitar──────────┼──▶ rejeitada     (justificativa obrigatória)
   └──cancelar──────────┴──▶ cancelada     (solicitante, nos dois estados)
```

---

## O achado que sustenta o desenho do banco

**O histórico de movimentações NÃO é um log de eventos — é uma projeção do estado atual.**
`public.solic_movimentacoes` (migration 0142) monta a linha da decisão assim:

```sql
CASE s.status WHEN 'concluida' THEN 'Conclusão'
              WHEN 'rejeitada' THEN 'Rejeição'
              WHEN 'cancelada' THEN 'Cancelamento' ... END
...
WHERE s.status <> 'aberta' AND s.decidido_em IS NOT NULL
```

Se `aprovada` fosse apenas uma passagem de `status`, no instante em que a solicitação virasse
`concluida` **a aprovação desapareceria do histórico** — não haveria registro de que houve
aprovação, nem de quem aprovou, nem de quando. O passado seria reescrito pelo presente.

Por isso `aprovado_por` / `aprovado_em` são **colunas próprias**, e não derivadas de `status`:
são elas que sustentam um **terceiro ramo** no `UNION ALL` do histórico, independente do estado
em que a solicitação parar. Uma solicitação concluída que passou por aprovação exibe as
**três** movimentações: Abertura · Aprovação · Conclusão.

---

## Banco — duas migrations, nesta ordem

Numeração: **0255 já está tomada pela v5.8.0** (`0255_raw_demonstrativo_competencia.sql`, em
implementação paralela). A v5.9.0 usa **0256 e 0257**. Conferir em
`supabase_migrations.schema_migrations` antes de escrever — não confiar neste texto (regra do
CLAUDE.md).

### `0256` — ADITIVA (autônoma sob gate)

- `ALTER TABLE app.solicitacao ADD COLUMN aprovado_por uuid REFERENCES auth.users(id)` (anulável)
- `ALTER TABLE app.solicitacao ADD COLUMN aprovado_em timestamptz` (anulável)
- `ADD CONSTRAINT solicitacao_aprovada_registrada CHECK (status <> 'aprovada' OR (aprovado_por IS NOT NULL AND aprovado_em IS NOT NULL))`
  — `ADD CONSTRAINT` é aditivo; nenhuma linha existente viola (nenhuma tem `status='aprovada'`).
- `CREATE FUNCTION public.solic_aprovar(p_id bigint)` — exige `status='aberta'`, `app.sou_atendente`,
  grava `status='aprovada'`, `aprovado_por=app.uid_jwt()`, `aprovado_em=now()`.
  **Não** toca `decidido_por`/`decidido_em` (que são da decisão TERMINAL).
- `CREATE FUNCTION public.solic_anexar(p_id bigint, p_anexos jsonb)` — exige
  `status IN ('aberta','aprovada')` e `app.pode_ver_solic`; insere em `app.solicitacao_anexo`.
  Valida que `campo_id` pertence a um campo `tipo_campo='anexo'` do tipo da solicitação
  (D7: não existe anexo livre — `campo_id` NULL deve ser **recusado** nesta RPC).
- `CREATE OR REPLACE` de `solic_concluir`, `solic_rejeitar`, `solic_cancelar` — a trava
  `IF v_sol.status <> 'aberta'` passa a `IF v_sol.status NOT IN ('aberta','aprovada')`.
- `CREATE OR REPLACE` de `solic_movimentacoes` — terceiro ramo `'Aprovação'` a partir de
  `aprovado_em IS NOT NULL` (independente do status atual).
- `CREATE OR REPLACE` de `solic_minhas_pendencias` — `status IN ('aberta','aprovada')`.
- `CREATE OR REPLACE` da RPC externa de cancelamento — aceita `aprovada` (D10).

Toda RPC nova: `SECURITY DEFINER` + `app.exigir_acesso()` inline + `REVOKE`/`GRANT` explícitos
(skill `banco-e-rpc`). Verificação pós-push **via REST com service_role** — `db query` não
executa o corpo.

### `0257` — DESTRUTIVA (exige TTY do Yan)

Relaxa **duas** CHECK constraints. Relaxar não destrói dado — nenhuma linha existente se torna
inválida — mas passa por `DROP CONSTRAINT`, e pela regra do projeto isso é destrutivo:

```sql
ALTER TABLE app.solicitacao DROP CONSTRAINT solicitacao_status_check;
ALTER TABLE app.solicitacao ADD  CONSTRAINT solicitacao_status_check
  CHECK (status IN ('aberta','aprovada','concluida','rejeitada','cancelada'));

ALTER TABLE app.solicitacao DROP CONSTRAINT solicitacao_terminal_decidido;
ALTER TABLE app.solicitacao ADD  CONSTRAINT solicitacao_terminal_decidido
  CHECK (status IN ('aberta','aprovada')
         OR (decidido_por IS NOT NULL AND decidido_em IS NOT NULL));
```

⚠️ **Conferir o nome REAL das constraints no banco** antes de escrever (o `CHECK` inline do
0127 gera nome automático; `solicitacao_status_check` é a forma esperada, não a confirmada).

⚠️ **A 0257 NÃO entra em `supabase/migrations/` antes da hora de aplicá-la** — `db push`
empurra todo o conjunto pendente, e uma destrutiva parada na pasta é arrastada por qualquer
push (custou caro na v5.2.0). Fica em `docs/` (ou fora do repo) até o momento do TTY.

---

## Front

**Arquivos-ímã (dono único, nunca em paralelo):** `src/lib/solicitacoes/schemas.ts` e
`src/lib/solicitacoes/format.ts` — todo o resto depende deles.

- `schemas.ts` — `STATUS_SOLIC` ganha `'aprovada'`; `solicitacaoSchema` ganha
  `aprovado_por_rotulo` / `aprovado_em` (`.optional()` se a RPC puder não emitir — skill
  `contrato-rpc-front`).
- `format.ts` — `STATUS_LABEL.aprovada = 'Aprovada'`; `statusBadge('aprovada')` com token
  próprio (nem o verde de concluída nem o cinza de aberta — proposta: `--gestao`, o mesmo do
  aviso de data, já usado no módulo); `acaoBadge('Aprovação')`; `vencida()` passa a aceitar
  `aberta` **e** `aprovada`.
- `board-solicitacoes.tsx` — `FiltroStatus` vira `'abertas' | 'aprovadas' | 'encerradas'`
  (D8). Hoje é `'abertas' | 'concluidas'` com `ehAberta = status === 'aberta'` e o complemento
  caindo em "Concluídas" — **atenção: com um estado novo, o complemento passa a incluir
  `aprovada` por acidente se a condição não for reescrita explicitamente.**
- `drawer-solicitacao.tsx` — botão **Aprovar** quando `status === 'aberta'` e o usuário é
  atendente; bloco "Aprovada por X em DD/MM/AAAA" quando aprovada; Concluir/Rejeitar seguem
  disponíveis nos dois estados; bloco de anexo por campo ganha o **botão de adicionar arquivo**
  quando não encerrada e o usuário é solicitante ou destinatário (D5/D6).
- `modal-nova-solicitacao.tsx` / `campos-dinamicos.tsx` — atributo **`multiple`** no
  `<input type="file">`. O estado já é array por campo e `onAnexoSelect` já itera
  `Array.from(files)`: hoje dá para acumular vários clicando repetidas vezes, mas não
  selecionando de uma vez. É uma linha, e é o que o pedido "mais de um anexo na criação"
  literalmente pede.
- `minhas-solicitacoes.tsx` / `solicitacoes-content.tsx` — refletir o status novo.
- `actions.ts` — `aprovarSolicitacao(id)`, `anexarEmSolicitacao(id, anexos)`;
  `MovimentacaoEmail` ganha `'aprovada'`; `traduzir()` — `TRANSICAO_ILEGAL` hoje diz
  *"Esta solicitação não está mais aberta"*, que fica **errado** com dois estados válidos.
- E-mail — `enviarNotificacaoSolicitacao` ganha o caso `aprovada` (skill `email`; conferir
  render no Outlook real).

## API externa

- `documentacao-content.tsx` §1 afirma hoje: *"Não existe estado 'aprovado' nem estados
  intermediários — se a plataforma integradora tem um conceito próprio de aprovação, ele vive
  do lado dela"*. **Reescrever**: o Janus passa a ter o estado, e ele é opcional.
- Atualizar a lista `status ∈ aberta · concluida · rejeitada · cancelada` (§ do GET) e a linha
  de erro `CONFLITO_ESTADO — Cancelamento de solicitação não-aberta` (D10 muda a regra).
- Nenhum endpoint novo (D9).

---

## Invariantes (inegociáveis)

1. **Solicitação encerrada é imutável** — nem anexo, nem transição. `concluida`, `rejeitada`
   e `cancelada` continuam terminais.
2. **A aprovação nunca some do histórico**, qualquer que seja o estado final.
3. **Aprovar continua opcional** — nenhum fluxo existente ganha um passo obrigatório.
4. **Anexo só em campo `tipo_campo='anexo'` do tipo** — `campo_id` NULL é recusado (D7).
5. **RLS deny-by-default preservado** — acesso só via RPC `SECURITY DEFINER`; o bucket
   `solicitacoes-anexos` continua privado, download só por signed URL de 60s.
6. **Nome de arquivo continua sanitizado para ASCII** na chave do Storage (lição v5.4.3 — um
   acento derruba o upload com `400 InvalidKey`), com o nome original preservado em
   `nome_arquivo`.

---

## Riscos de coordenação

1. **v5.8.0 em paralelo.** Ela é DRE-competência: **nenhum arquivo em comum** com esta versão.
   O único ponto de contato é a numeração de migration (ela tem a 0255).
2. **`db push` cruzado.** A worktree da v5.9.0 nasce do `main` e não terá a 0255 da v5.8.0.
   Um push da v5.9.0 antes do merge da v5.8.0 aplica 0256/0257 deixando buraco na sequência
   — precisa de `--fora-de-ordem`, e a v5.8.0 precisará do mesmo depois. Lição da v5.4.4:
   *migration de branch não mergeada trava o `db push` de toda outra branch.* **Combinar a
   ordem de aplicação com o Yan antes do primeiro push de banco.**
3. **Contrato com o parceiro externo.** D11 decidiu corrigir a doc sem comunicação prévia,
   assumindo que o código do parceiro trata `status` como string opaca. Se ele tiver um
   `switch` fechado nos quatro valores, `aprovada` cai no `default` sem aviso. **Registrar no
   out-briefing** como risco aceito conscientemente.

---

## Missões

**Fase 1 — Banco** (serializada; a sessão principal roda banco/git/gates)
- **M1** — `0256` aditiva completa (colunas + 2 RPCs novas + 5 `CREATE OR REPLACE`).
  Revisão obrigatória por `revisor-db` **antes** da aplicação.
- **M2** — `0257` destrutiva escrita **fora** de `supabase/migrations/`, com os nomes reais das
  constraints conferidos, pronta para o TTY do Yan.

**Fase 2 — Contrato e front** (paralelizável por arquivos disjuntos, exceto os ímãs)
- **M3** — ímãs: `schemas.ts` + `format.ts` (dono único, primeiro; todo o resto depende).
- **M4** — `drawer-solicitacao.tsx`: aprovar, exibir aprovação, anexar pós-criação.
- **M5** — `board-solicitacoes.tsx` + `minhas-solicitacoes.tsx`: terceira aba.
- **M6** — `modal-nova-solicitacao.tsx` + `campos-dinamicos.tsx`: `multiple`.
- **M7** — `actions.ts` + camada de e-mail.
- **M8** — API externa: trava do cancelamento + `documentacao-content.tsx`.

**Fase 3 — Fechamento**
- **M9** — testes (transições legais e ilegais; anexo em encerrada recusado; histórico com as
  três movimentações; `campo_id` NULL recusado).
- **M10** — `/fechamento-versao` (DoD integral: gates, `revisor` + `revisor-db` +
  `verificador-visual`, out-briefing, CHANGELOG, version bump, ADR do ciclo de vida, PR).

**Gates escalonados:** `npx tsc --noEmit` + `npm run lint` ao fim de cada missão;
`npm run build` + `npm test` na fronteira de fase e no fechamento.

## Checkpoints humanos

1. **Antes de aplicar a `0257`** — destrutiva exige TTY do Yan (o agente não consegue aplicar,
   por construção).
2. **Ordem de aplicação de banco vs. v5.8.0** — combinar antes do primeiro `db push`.
3. **Conferência visual** — após os gates, pelo modelo estabelecido (entregar → Yan manda print
   → ajustar).
