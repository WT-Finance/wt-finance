# Out-Briefing v5.9.1 — Anexos: excluir o arquivo errado, e "Outros anexos"

**Branch:** `feat/v5-9-1-anexos-excluir-e-rotulo` · **Emenda 2 do ADR-0169** (sem ADR novo)
**Migration:** `0264` (aditiva) — **APLICADA** em 02/09/2026
**Gates:** `tsc` · `lint` · `build` · **1147 testes** (1139 vinham da v5.9.0)
**Rota A** (produto): 4 decisões fechadas no chat antes de qualquer código.

---

## 1. O que entrou

### 1.1 Excluir anexo

Quem anexou o arquivo errado passa a poder removê-lo, enquanto a solicitação não estiver
encerrada. **Só quem anexou** (E2) — nem o atendente, nem a gestão. **Apaga de vez** (E3):
metadado na RPC, binário do Storage na action, nessa ordem. Confirmação antes, com o nome do
arquivo no texto, porque a remoção é definitiva.

**E4 — campo obrigatório não fica vazio.** Excluir o último arquivo de um campo obrigatório é
bloqueado, e o botão fica **inerte com explicação** em vez de sumir: controle que desaparece sem
motivo faz o usuário concluir que a funcionalidade não existe — foi o que motivou a reversão da
D7 na v5.9.0. O fluxo do arquivo trocado vira "anexa o certo → apaga o errado", que é a ordem
natural de quem corrige um upload.

### 1.2 "Outros anexos" (E1)

O bloco de anexo livre foi renomeado. Os dois blocos continuam coexistindo, e o rótulo diz que o
livre é **complementar**, não alternativo.

**O pedido original perguntava se dava para "fazer o campo de anexo do tipo permitir a inclusão
de outros arquivos" — e isso já funcionava desde a v5.9.0**: o campo lista N arquivos e o botão
de adicionar já estava lá. O que faltava era clareza de rótulo, não capacidade. Vale como
lembrete de medir o que existe antes de construir (mesma família da lição da v5.9.0 sobre a
estrutura já permitir anexo livre).

---

## 2. O achado que mais valeu a revisão

**A regra do campo obrigatório nasceu FAIL-OPEN, e não em teoria.**

A primeira versão consultava `app.solicitacao_campo` para saber se o campo era obrigatório. Só
que:

- `solicitacao_anexo.campo_id` é referência **lógica**, **sem FK** (`0127` — o comentário lá diz
  "referência lógica ao snapshot");
- `admin_solic_salvar_tipo` (`0216`) faz `DELETE` + re-`INSERT` de **todos** os campos a cada
  edição do tipo, e nada impede editar um tipo com solicitações abertas;
- o id é `IDENTITY` e nunca é reusado.

Logo, todo anexo de um tipo já editado tem `campo_id` órfão. A consulta não acha linha,
`coalesce(v_obrig, false)` lê "não sei" como "não é obrigatório", e a trava **abre exatamente
onde deveria fechar**.

**Medido antes de corrigir: 9 dos 68 anexos com campo já estavam nesse estado — e o snapshot de
todos eles diz `obrigatorio: true`.** Seriam precisamente os casos em que E4 falharia.

O `revisor-db` sugeriu inverter o `coalesce` para fail-closed. Preferi atacar a causa: ler do
**snapshot `respostas`** da própria solicitação, que o ADR-0112 criou para ser *"imutável e
legível mesmo após editar/arquivar o tipo"* — e que é a mesma fonte de onde a UI tira
`obrigatorio`. Tela e banco passam a concordar **por construção**, não por coincidência. O
fail-closed ficou como rede para o caso de nem o snapshot conhecer o campo (estado em que o
anexo sequer é renderizado).

**Precedente:** ao validar contra uma característica do TIPO, perguntar se aquilo se lê de uma
fonte **mutável** ou do **snapshot** da instância. O módulo já resolveu esse problema uma vez —
o snapshot existe por isso — e uma validação nova pode desfazer a garantia sem perceber.

---

## 3. O bug que o Yan reportou depois: o drawer não atualizava

Ao anexar ou excluir, a tela não refletia a mudança até fechar e reabrir.

**A causa não era o `router.refresh()`** — ele funcionava. Era um nível acima:
`solicitacoes-content` **copiava a solicitação para estado** no clique
(`useState<Solicitacao|null>`). O refresh trazia `lista` nova do RSC, e o drawer seguia lendo o
retrato congelado. É a armadilha da skill `react-padroes` §3: *cópia local do dado do servidor
envelhece e a tela passa a discordar de si mesma*.

**Correção:** o container guarda o **id** e **deriva** da lista viva. O refresh resolve sozinho,
sem round-trip extra e sem callback.

⚠️ **O segundo call-site teria ficado quebrado se eu parasse aí.** A página de **Movimentações**
abre o MESMO drawer com objeto vindo de *server action*, não de lista — não há de onde derivar, e
o `router.refresh()` não tem como devolvê-lo atualizado. Para ela, o drawer ganhou o gancho
opcional `onAtualizar`, que rebusca o detalhe. Quem deriva da lista não passa nada.

**Comportamento novo registrado:** se a solicitação sair da lista com o drawer aberto (mudança de
escopo pelo servidor), o drawer **fecha** em vez de exibir dado órfão.

---

## 4. Parecer da revisão

### `revisor-db` — `0264` APROVADA COM RESSALVAS · 0 CRÍTICO · **1 ALTO** · 1 MÉDIO

- **ALTO — E4 fail-open sob campo redefinido. CORRIGIDO na raiz** (§2). Ele leu o tokenizer do
  db-gate para confirmar a classificação aditiva, e conferiu a paridade de chaves do `solic_json`
  contra a `0261` uma a uma.
- **MÉDIO — processo, e é sobre mim:** a delegação listou só a skill `banco-e-rpc`, embora o
  patch criasse schema Zod e call-site novos, que são escopo de `contrato-rpc-front`. Corrigido
  na delegação seguinte (a do `revisor`), que incluiu as quatro skills do escopo.

### `revisor` — CORREÇÕES NECESSÁRIAS · 0 CRÍTICO · **2 ALTO** · 1 MÉDIO · 2 BAIXO — todos endereçados

- **ALTO — o `catch` do Storage nunca veria o erro. CORRIGIDO.** O SDK do Supabase **não lança**
  em falha de API: resolve com `{ data, error }`. O `try/catch` que prometia "logar e seguir" era
  decorativo — a falha real (permissão, path já removido) passaria como sucesso e o log nunca
  sairia, produzindo exatamente a cegueira que o comentário dizia prevenir. Agora checa `.error`,
  como `upload` e `createSignedUrl` já fazem no mesmo arquivo.
- **ALTO — `BotaoAnexo` remontava a cada render, com regressão de FOCO. CORRIGIDO** (içado ao
  módulo). Definido no corpo do drawer, a identidade da função era recriada a cada render, e o
  React remonta por TIPO, não por `key`: qualquer estado do drawer remontava todas as linhas de
  anexo. Em `confirmarExclusao` os setStates são agrupados num commit só — o modal fechava e a
  linha remontava juntos, e o cleanup de foco do `ModalCentral` (`anterior?.focus?.()`) devolvia o
  foco a um nó **já substituído**. `.focus()` em nó destacado é no-op: o foco caía no
  `document.body`. Confirmei o mecanismo lendo `modal-central.tsx:66`.
- **MÉDIO — botão bloqueado inacessível por teclado. CORRIGIDO.** `disabled` nativo **remove do
  tab-order**: quem navega por Tab passava direto e nunca sabia que o controle existia nem por que
  estava travado. Isso contradizia a própria decisão de "não esconder sem explicação" — o `title`
  só serve a quem usa mouse. Agora `aria-disabled` (mantém focável) + motivo no `aria-label` e num
  `aria-describedby` em `sr-only`.
- **BAIXO — assimetria de travamento. CORRIGIDO:** durante uma exclusão, o botão de baixar da
  mesma linha continuava clicável.
- **BAIXO — `NAO_ENCONTRADA` genérico. REGISTRADO, não corrigido.** O código traduz sempre para
  "Solicitação não encontrada", mesmo quando a entidade ausente é o **anexo**. É pré-existente ao
  padrão do módulo e cosmético; separar exigiria códigos distintos em várias RPCs, fora do escopo
  deste patch.

### Efeito colateral revelado pela correção do ALTO

Ao içar `BotaoAnexo`, o lint acusou `static-components` numa linha que **existia desde a v4.16.0**
e nunca havia disparado: `iconeArquivo` **retornava um componente**, e atribuí-lo a `const Icone`
parece "criar componente no render". Semanticamente era falso-positivo — selecionar um de quatro
ícones existentes não é criar nada —, mas a saída limpa foi a função devolver o **elemento**
pronto. Agora o lint está factualmente certo, em vez de silenciado.

---

## 5. Estado do banco

| | |
|---|---|
| `0264` (aditiva) | ✅ **APLICADA** em 02/09/2026, backup-gate VERDE. Última aplicada no projeto: **0264**; próxima livre: **0265** |

**Verificação pós-push (REST + `service_role`):** `solic_anexo_excluir` executa o corpo até o
`RAISE` esperado com id inexistente (sem erro de runtime); lê do **snapshot** e **não** consulta
mais `solicitacao_campo`; `anon` sem EXECUTE; e `solic_json` ganhou `sou_autor` **sem perder**
`origem` nem `aprovado_por_email` — a conferência que a v5.9.0 ensinou a fazer sempre.

**Classificação:** `DELETE` dentro do corpo de `CREATE FUNCTION` é **aditiva** — o tokenizer
excisa corpos `$$…$$`. Confirmado com `classificarSql` numa sonda antes de escrever, e revalidado
após a correção. Não precisou de TTY.

---

## 6. Pendências

**Do Yan:**
1. **Conferência visual** — excluir um anexo próprio; ver o botão ausente num anexo de terceiro;
   ver o botão inerte, com explicação, no último arquivo de campo obrigatório; e confirmar que a
   lista **atualiza sem fechar o drawer** (o bug do §3). Vale checar também por **teclado**, já
   que o estado bloqueado mudou de `disabled` para `aria-disabled`.
   A conferência visual da **v5.9.0** segue pendente e cabe na mesma passada.
2. Nada de banco — a `0264` já está aplicada e verificada.

**Registrado, não corrigido:**
- `NAO_ENCONTRADA` genérico entre solicitação e anexo (§4, BAIXO).
- O padrão `try/catch` sem checar `.error` do Storage existe em outros três pontos best-effort do
  módulo (`criarSolicitacao`, `descartarAnexos`, `anexarEmSolicitacao`). Eles não *prometem* log,
  então não são a mesma falha — mas compartilham a classe. Follow-up.
- **Anexo sem autor não seria excluível por ninguém.** Hoje não existe nenhum (0 de 72), mas se
  aparecer por importação futura ficará permanente. Sem exceção criada agora, de propósito.

---

## 7. Arquivos

**Banco:** `supabase/migrations/0264_solic_anexo_excluir.sql`

**Front:** `src/lib/solicitacoes/schemas.ts` · `src/app/solicitacoes/actions.ts` ·
`src/components/solicitacoes/drawer-solicitacao.tsx` · `solicitacoes-content.tsx` ·
`movimentacoes-content.tsx`

**Testes:** `src/lib/solicitacoes/ciclo-de-vida.test.ts` · `src/lib/rpc-contrato.test.ts`

**Docs:** `docs/adr/0169-…` (Emenda 2) · `CHANGELOG.md` · `src/data/changelog-diretoria.ts` ·
`docs/WORKING-CONTEXT.md` · `package.json`

---

## 8. Aprendizado (régua de 5 destinos)

1. **Validar contra característica do TIPO: ler do SNAPSHOT, não da tabela viva.** → **skill
   `banco-e-rpc`**. O caso é forte porque o dado inconsistente já existe em produção (9/68) e o
   modo de falha é fail-open silencioso.
2. **O SDK do Supabase Storage não lança — retorna `{data, error}`.** Um `try/catch` em volta é
   decorativo e produz a cegueira que pretendia evitar. → **skill `contrato-rpc-front`** (é
   contrato de cliente), com a nota de que o mesmo arquivo já tinha o padrão certo duas linhas
   acima.
3. **Componente definido no corpo de outro remonta por TIPO, e isso quebra FOCO, não só
   performance.** A v5.9.0 já registrou a regra; o que esta versão acrescenta é a **consequência
   concreta**: setStates agrupados + remount + cleanup de foco = foco no `document.body`. →
   **skill `react-padroes` §1c**, como exemplo do custo real.
4. **`disabled` nativo remove do tab-order** — decidir "não esconder, explicar" e usar `disabled`
   é contraditório: quem usa teclado nem alcança a explicação. `aria-disabled` + `aria-describedby`
   é o par. → **skill `web-design-guidelines`**.
5. **Cópia local do dado do servidor envelhece** — já está na `react-padroes` §3, e mesmo assim
   caí nela. O que faltava na skill era o **sintoma reconhecível**: "a ação funciona, o banco
   muda, e a tela só reflete ao fechar e reabrir". → acrescentar o sintoma à skill, porque a regra
   abstrata não me fez enxergar o caso.
