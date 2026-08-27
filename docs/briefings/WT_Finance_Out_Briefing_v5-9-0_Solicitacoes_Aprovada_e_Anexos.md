# Out-Briefing v5.9.0 — Solicitações: etapa "Aprovada" e anexos ao longo da vida

**Branch:** `feat/v5-9-0-solicitacoes-aprovada-anexos` · **ADR-0169**
**Migrations:** `0261` (aditiva) e `0262` (destrutiva) — **NENHUMA APLICADA** (ver §5)
**Gates:** `tsc` · `lint` · `build` · **1011 testes** (eram 998) — todos verdes
**Rota A** (produto): briefing commitado no 1º commit; 11 decisões fechadas com o Yan em duas
rodadas de perguntas antes de qualquer código.

---

## 1. O que entrou

### 1.1 Status "Aprovada" — etapa intermediária OPCIONAL

```
aberta ──aprovar──▶ aprovada ──concluir──▶ concluida
   │                    │
   ├──concluir──────────┼──▶ concluida     (atalho: aprovar é opcional)
   ├──rejeitar──────────┼──▶ rejeitada
   └──cancelar──────────┴──▶ cancelada     (solicitante, nos dois estados)
```

Autorizar e executar deixaram de ser o mesmo ato. Só o **atendente** aprova — aprovar o próprio
pedido não é aprovação, e isso espelha `solic_rejeitar`, que já era atendente-only (`solic_concluir`
admite também o solicitante, porque fechar o próprio pedido é legítimo). **Não existe desfazer
aprovação**: o ciclo só anda para a frente, como sempre foi.

### 1.2 Anexo ao longo da vida

Enquanto a solicitação não estiver encerrada, **os dois lados** anexam: o solicitante complementa,
o atendente devolve o comprovante do pagamento efetuado. Encerrada segue **imutável**. Não há
anexo livre (D7): todo anexo pertence a um campo `tipo_campo='anexo'` daquele tipo — para o
comprovante, o admin cadastra um campo **não-obrigatório**.

No anexo pós-criação o id da solicitação já é conhecido, então o objeto vai direto a
`sol/<id>/<uuid>/<arq>` e dispensa a dança `tmp/` → move → `solic_promover_anexos` (que, além
disso, é solicitante-only e não serviria ao atendente).

### 1.3 UI e API

Aba **"Aprovadas"** (com contagem) na caixa de entrada; **coluna "Aprovadas"** em Minhas
solicitações; `multiple` no anexo da criação; e-mail de aprovação com cor própria. Na API externa,
o parceiro **só lê** o estado novo — sem endpoint de aprovar.

---

## 2. O achado que definiu o desenho do banco

**`solic_movimentacoes` nunca foi um log de eventos — é uma projeção do estado atual.** Ela deriva
a ação de `CASE s.status WHEN 'concluida' THEN 'Conclusão' …`. Funcionava porque, até aqui, toda
solicitação tinha no máximo **uma** transição depois da abertura: o estado final carregava toda a
informação sobre o que havia acontecido.

Uma etapa intermediária quebra essa equivalência. Se `aprovada` fosse só uma passagem de `status`,
no instante em que a solicitação virasse `concluida` a **aprovação desapareceria do histórico** —
sem registro de que houve, de quem aprovou, de quando. Sem erro e sem aviso.

Daí as colunas próprias `aprovado_por`/`aprovado_em` e o terceiro ramo do `UNION` derivado de
`aprovado_em IS NOT NULL`. O teste `ciclo-de-vida.test.ts` **prova** que a derivação não é pelo
status: se alguém trocar por `status = 'aprovada'`, ele reprova.

### 2.1 A migration foi escrita a partir do CATÁLOGO VIVO, não das migrations de origem

`app.solic_json` viva **já divergia** da 0130: ganhou a chave `origem` (plataforma da API externa)
na 0217. Reescrevê-la a partir do arquivo antigo teria **apagado em silêncio** o selo "via
integração" que o board exibe — sem erro de banco e sem erro de build.

Isso não é anedota: é o motivo de a verificação ter sido feita com `pg_get_functiondef` contra o
banco em vez de arqueologia entre dez migrations. E o **achado ALTO do `revisor-db`** foi que a
nota de `DOWN` do meu próprio header repetia o erro — citava 0130 como fonte de reversão. Corrigido
com a lista real de fontes por função (0217 / 0225 / 0222 / 0142 / 0133).

---

## 3. Parecer da revisão

### `revisor-db` — 0261 e 0262 APROVADAS COM RESSALVAS · **1 CRÍTICO · 2 ALTO · 3 MÉDIO · 2 BAIXO**

- **CRÍTICO — colisão de numeração entre branches. CORRIGIDO.** A worktree `feat+v5-8-0-dre-competencia`
  reivindicava `0255`, `0256` **e** `0257`. Quando esta versão começou, ela tinha só a `0255` — avançou
  no meio do caminho. O CLI identifica a migration pelo **prefixo numérico**, não pelo nome: duas
  branches com o mesmo número fariam a segunda a aplicar ser tratada como "já aplicada" e **pulada em
  silêncio**, deixando a estrutura ausente em produção sem erro nenhum. Só visível olhando as duas
  worktrees ao mesmo tempo. Renumerado para **0261/0262**, com o gate de reconferência escrito no
  cabeçalho dos dois arquivos.
- **ALTO — a `0262` é pré-requisito do MERGE, não pós-merge. REGISTRADO E SINALIZADO.** O front já
  chama `solic_aprovar` e já renderiza o botão; o que o mantém inofensivo é o PR não estar mergeado
  (a Vercel deploya no merge). Com a `0261` aplicada e a `0262` pendente, o primeiro clique estouraria
  violação de CHECK. Escrito no cabeçalho da `0262`, no PR e aqui. Como rede adicional, `traduzir()`
  passa a converter esse erro numa mensagem acionável — **rede não é ordem**.
- **ALTO — nota de `DOWN` citava a fonte errada. CORRIGIDO** (§2.1).
- **MÉDIO — sem teste de paridade SQL↔TS. CORRIGIDO:** `ciclo-de-vida.test.ts` (9 casos).
- **MÉDIO — comentário do `coalesce` creditava a defesa à coluna errada. CORRIGIDO.** O comentário
  atribuía a proteção do caso ROLE a `solicitante_id` (que é `NOT NULL`), quando ela mora dentro de
  `app.sou_atendente` (fix 0129). Podia induzir alguém a remover o coalesce interno por parecer
  duplicado — reabrindo o vazamento.
- **MÉDIO — sem índice para `aprovado_em`. REGISTRADO como dívida.** `solic_movimentacoes` filtra
  `WHERE aprovado_em IS NOT NULL` em varredura sequencial; inofensivo na escala atual (histórico
  zerado na 0220, RPC gestão-only). Candidato a índice parcial se o volume crescer.
- **BAIXO — "corpos idênticos aos vivos" escondia os `coalesce` acrescentados. CORRIGIDO.**
- **BAIXO — `solic_aprovar`/`solic_anexar` sem teste automatizado** (política do `rpc-contrato.test.ts`
  é só-leitura). Reforça a necessidade da verificação REST/`service_role` pós-aplicação — **pendente**,
  porque o banco não foi aplicado.

#### Segundo passe (delta das correções) — **`0261` e `0262` APROVADAS** · 0 bloqueante

Como as correções tocaram a migration (assinatura de retorno de `solic_aprovar`) e a superfície de
segurança, o delta voltou ao `revisor-db`. Ele confirmou o `RETURNING aprovado_em INTO` ponta a ponta
(sintaxe plpgsql, tipo da variável, serialização ISO do `timestamptz` em `jsonb_build_object` — a
mesma rota que já serializa `decidido_em` — e o consumo em `fmtDataHoraSP`), reconferiu **uma a uma**
as sete atribuições de fonte do `DOWN` contra o histórico real, e não encontrou vetor em
`uploadAnexo` nem em `descartarAnexos`.

- **BAIXO — limpeza de `anexarEmSolicitacao` sem os mesmos guardas. CORRIGIDO.** Ela era segura
  **por transitividade** (depois do fix, `uploadAnexo` não deixa o caller obter caminho fora da
  própria posse), mas segurança que depende de um gate distante volta a ser vetor no dia em que
  alguém mexe naquele gate sem ter esta linha em mente. Ganhou o mesmo filtro de prefixo.

### `revisor` — CORREÇÕES NECESSÁRIAS · **0 CRÍTICO · 4 ALTO · 2 MÉDIO · 1 BAIXO** — todos endereçados

- **ALTO — e-mail de aprovação sairia SEM DATA. CORRIGIDO.** `notificarMovimentacao` resolvia o
  "quando" como `criada ? criado_em : decidido_em`, e `solic_aprovar` não toca `decidido_em` **de
  propósito** (é o que faz a Aprovação sobreviver à conclusão). O template trata `quando` ausente como
  string vazia — silencioso por desenho. `solic_aprovar` passa a devolver o `aprovado_em` que acabou
  de gravar. **Nenhum teste exercitava `movimentacao: 'aprovada'`** — foi por isso que o gate passou
  verde com o defeito; agora há dois, e um EXIGE a data no corpo.
- **ALTO — brecha de escrita no Storage. CORRIGIDO.** `uploadAnexo` aceitava um `solicitacao_id`
  arbitrário do cliente e gravava com `service_role` (que ignora RLS) **antes** de qualquer checagem
  — a validação só corria no passo seguinte, que um cliente malicioso simplesmente não chamaria (e é
  lá que mora a limpeza). Qualquer autenticado poderia despejar arquivos de 10 MB na pasta de qualquer
  solicitação, sem teto e sem coleta. Não era vazamento (a leitura segue gated), mas era poluição
  ilimitada. Agora valida posse e estado antes de escrever um byte.
- **ALTO — controle "Adicionar arquivo" inacessível por teclado. CORRIGIDO.** `<input type="file"
  hidden>` dentro de `<label>`: `display:none` tira do tab-order e `<label>` não é focável — só
  respondia a mouse. Trocado por `sr-only` + `peer-focus-visible`.
- **ALTO — `docs/api-externa-solicitacoes.md` desatualizado. CORRIGIDO.** Eu havia corrigido só a
  documentação DENTRO da plataforma. Esse `.md` é **a cópia que sai do repositório para o
  integrador** e seguia afirmando que "não existe estado aprovado" — o oposto do que a versão pedia.
- **MÉDIO — lote parcial deixava órfão no bucket. CORRIGIDO** (com uma reviravolta — ver §4).
- **MÉDIO — sem caso de contrato com `aprovado_em`/`aprovado_por_email` PREENCHIDOS. CORRIGIDO:**
  três formas (ausente/null/preenchido) + um caso provando que concluída carrega os dois pares com
  atores distintos.
- **BAIXO — "≤10 MB" sem espaço não-quebrável. CORRIGIDO** nos dois call-sites.

---

## 4. Auto-auditoria: uma correção que quase virou um defeito pior

Ao corrigir o MÉDIO do lote parcial, criei `descartarAnexos(anexos)` — uma Server Action exportada
que recebia caminhos de storage **do cliente** e os apagava com `service_role`. Ou seja: uma
primitiva de **deleção arbitrária de anexo**, disponível a qualquer autenticado. Trocar "lixo
acumulando no bucket" por "apagar anexo alheio" é um negócio péssimo.

A auto-auditoria pegou antes do fechamento. A versão final exige que o caller **possa agir naquela
solicitação** e que todo caminho esteja sob o prefixo `sol/<id>/`. Como os caminhos carregam um UUID
que a leitura nunca expõe (`anexoSchema` não traz `storage_path`), na prática só se alcança o que a
própria sessão acabou de subir.

**A lição para o harness:** corrigir achado de revisor é escrever código novo, e código novo pede a
mesma desconfiança do original. Um achado endereçado não é um achado fechado até passar pela mesma
régua.

---

## 5. Estado do banco — NADA APLICADO (decisão do Yan)

| | |
|---|---|
| `0261` (aditiva) | escrita, revisada, **não aplicada** |
| `0262` (destrutiva) | escrita, revisada, **não aplicada**, em `supabase/patches/` |

**Ordem acordada:** a **v5.8.0 aplica primeiro** (`0255`-`0257`) e a v5.9.0 espera — assim nenhuma
das duas precisa de `--fora-de-ordem` e o histórico fica sequencial.

**Como aplicar, quando for a hora:**

```bash
# 1. RECONFERIR o número livre nas DUAS worktrees (a v5.8.0 já avançou uma vez)
ls supabase/migrations/ | tail -3
ls ../feat+v5-8-0-dre-competencia/supabase/migrations/ | tail -3

# 2. aditiva (autônoma sob backup-gate)
npm run db:migrate -- --aditiva

# 3. destrutiva — TTY humano, PRÉ-REQUISITO DO MERGE
mv supabase/patches/0262_solic_status_aprovada_checks.sql supabase/migrations/
npm run db:migrate -- --destrutiva

# 4. verificar as RPCs novas via REST com service_role (db query NÃO executa o corpo)
```

A `0262` **não pode** ficar em `supabase/migrations/` antes da hora: `db push` empurra todo o
conjunto pendente e uma destrutiva parada lá é arrastada por qualquer push (v5.2.0).

---

## 6. Pendências e registros

**Do Yan:**
1. **Aplicar a `0261` e depois a `0262`** na ordem acima — a `0262` exige TTY e é pré-requisito do
   merge.
2. **Conferência visual** — só faz sentido **depois** do banco aplicado: sem a `0262` o estado
   `aprovada` não pode existir, e nenhuma tela tem o que mostrar. Modelo de sempre: entrega → print
   → ajuste.
3. **Cadastrar um campo de anexo não-obrigatório** (ex.: "Comprovante de pagamento") nos tipos que
   vão receber comprovante — sem ele não há onde o atendente anexar (consequência direta de D7, que
   você escolheu: sem anexo livre).

**Riscos aceitos conscientemente:**
- **Contrato do parceiro sem aviso prévio (D11).** A doc foi corrigida nas duas cópias, mas o Vitor
  não foi avisado. Se a integração dele tiver um `switch` fechado nos quatro status, `aprovada` cai
  no `default` sem aviso. Foi decisão sua, registrada aqui.
- **Índice de `aprovado_em`** — dívida registrada (§3).
- **Verificação REST das RPCs novas** — não feita, porque o banco não foi aplicado. Fica como parte
  do passo 4 acima.

**Nota de merge:** a v5.8.0 também bumpa `package.json` e escreve no `CHANGELOG.md`/
`changelog-diretoria.ts`. Conflito nesses três arquivos entre as duas branches é esperado e trivial
— resolver mantendo **as duas** entradas, na ordem de versão.

---

## 7. Arquivos

**Banco:** `supabase/migrations/0261_solic_aprovada_e_anexo_pos_criacao.sql` ·
`supabase/patches/0262_solic_status_aprovada_checks.sql` *(pasta nova)*

**Contrato/lib:** `src/lib/solicitacoes/schemas.ts` · `format.ts` · `src/lib/email/template.ts` ·
`src/app/solicitacoes/actions.ts`

**UI:** `src/components/solicitacoes/` — `drawer-solicitacao.tsx` · `board-solicitacoes.tsx` ·
`minhas-solicitacoes.tsx` · `campos-dinamicos.tsx` · `movimentacoes-content.tsx` ·
`src/components/admin/api-externa/documentacao-content.tsx`

**Testes:** `src/lib/solicitacoes/ciclo-de-vida.test.ts` *(novo)* · `src/lib/rpc-contrato.test.ts` ·
`src/lib/email/email.test.ts`

**Docs:** `docs/adr/0169-…` *(novo)* · `docs/api-externa-solicitacoes.md` · `CHANGELOG.md` ·
`src/data/changelog-diretoria.ts` · `package.json` · `docs/WORKING-CONTEXT.md`

---

## 8. Aprendizado (régua de 5 destinos)

1. **`aprovada` no enum ↔ CHECK do banco → ENFORCEMENT MECÂNICO.** Virou
   `ciclo-de-vida.test.ts`, que lê o SQL e reprova a divergência. Nada de prosa.
2. **Estado novo num enum não é pego pelo `tsc`** — os pontos de decisão usam `switch` com `default`
   ou filtram por igualdade, e o build passa verde enquanto a tela mente. Três defeitos desta versão
   foram exatamente isso (board classificando aprovada como encerrada; a coluna que sumia; o bloco de
   encerramento renderizando "Aprovada por — em [vazio]"). → **skill `contrato-rpc-front`**: ao
   acrescentar valor a um enum que atravessa banco→contrato→UI, varrer manualmente os pontos de
   decisão, porque o typecheck não varre.
3. **`CREATE OR REPLACE` se escreve a partir do CATÁLOGO VIVO, não da migration de origem.** A
   função viva pode já ter divergido do arquivo (aqui, `app.solic_json` × `origem`), e o REPLACE
   apaga a diferença em silêncio. → **skill `banco-e-rpc`**. Vale também para a nota de `DOWN`:
   citar a fonte errada é induzir a perda na volta.
4. **Numeração de migration entre branches paralelos é um ponto cego estrutural.** Cada worktree,
   isolada, parece sequencial e correta; a colisão só existe no conjunto — e o modo de falha é
   silencioso (a segunda a aplicar é tratada como "já aplicada" e **pulada**). O número livre precisa
   ser conferido nas DUAS árvores, e **imediatamente antes de aplicar**, porque a outra branch se
   move. → **skill `banco-e-rpc`** + candidato a **enforcement mecânico** (checagem no wrapper
   `db:migrate` varrendo `.claude/worktrees/*/supabase/migrations/`).
5. **Corrigir achado de revisor é escrever código novo — e código novo pede a mesma desconfiança.**
   Minha correção do lixo de storage nasceu como uma primitiva de deleção arbitrária (§4). → **core
   (CLAUDE.md)**, se couber no teto: a auto-auditoria adversarial roda **depois** das correções da
   revisão, não antes.
6. **Um teste que não existe é um gate que mente.** O e-mail de aprovação saía sem data e a suíte
   passava verde, porque nenhum caso exercitava a movimentação nova. Já coberto pela disciplina de
   "todo schema novo ganha caso de contrato" — mas vale estender a **toda variante de enum que
   entra num template**. → **skill `email`**.
