# Out-briefing v5.4.3 — Anexo com acento no nome + erro do modal fora da vista

**Tipo:** PATCH (rota C — dois defeitos bem delimitados, nenhuma decisão de produto aberta)
**Origem:** relato do Yan a partir de um erro real em produção (print do usuário)
**Migration:** nenhuma · **ADR:** nenhum (ver §6) · **Versão anterior:** 5.4.2

---

## 1. Os dois defeitos

### 1.1 — Anexo com acento no nome não subia

Sintoma relatado, com print: ao anexar `Nota Fiscal - Bruna e João.pdf` na abertura de uma
solicitação, a tela mostrava

```
Nota Fiscal - Bruna e João.pdf — Falha no upload: Invalid key: tmp/2bb4b2…
```

O agravante do relato: **o mesmo usuário já havia aberto duas solicitações com anexos
semelhantes, minutos antes, sem erro.** Era isso que fazia o defeito parecer intermitência.

**Causa raiz.** `src/app/solicitacoes/actions.ts` montava a chave do objeto no Storage com o
nome CRU do arquivo:

```ts
const path = `tmp/${randomUUID()}/${file.name}`
```

O Supabase Storage valida a chave com `isValidKey` (`storage-api`, `src/storage/limits.ts`):

```ts
/^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/
```

O `\w` está **sem a flag `u`**, então vale `[A-Za-z0-9_]` — ASCII puro. No nome do relato, o
**`ã` (U+00E3) é o ÚNICO caractere ilegal**: espaço, `-` e `.` estão todos na lista de
permitidos. A resposta é `400 InvalidKey` e a linha seguinte repassava a mensagem crua para a
UI (`Falha no upload: ${error.message}`).

**Por que parecia intermitente e não era.** A falha é **determinística por nome de arquivo**.
Os dois anexos anteriores tinham nome ASCII puro. Nada a ver com sessão, permissão, MIME ou
tamanho — cada um desses tem mensagem própria (`Tipo não permitido: …`, `Arquivo acima de
10 MB.`) e colisão de nome é impossível pelo `randomUUID()`.

Vale nos dois sistemas operacionais: o macOS envia o nome em **NFD** (`a` + U+0303) e o
combinante também está fora do `\w`.

### 1.2 — O erro do modal nascia fora do campo de visão

No modal de nova solicitação, a `FaixaMensagem` de erro era o **primeiro** elemento do corpo
rolável, enquanto o botão **"Enviar solicitação"** era o último. Quem clicava no botão não via
a mensagem ("Informe a data-limite.", "Escolha um destinatário.") e o modal parecia
simplesmente não responder.

Vale para os dois caminhos de erro, porque os dois passam pelo mesmo `setErro`: as validações
do cliente em `enviar()` **e** o erro devolvido pela RPC (`res.erro`) — que é por onde chegam
os campos dinâmicos obrigatórios, validados no banco.

---

## 2. O que foi feito

### 2.1 — A correção já existia no repo, no lugar errado

O **Acervo** tinha `sanitizarNomeArquivo` desde a v4.34.0. O docstring dele **documentava a
divergência explicitamente**:

> *"Diferente de Solicitações (bucket restrito a poucos MIME, usa o nome cru) — aqui o bucket
> aceita QUALQUER tipo de arquivo, então endurecemos o nome do OBJETO no Storage."*

A premissa era falsa: **restrição de MIME não tem relação nenhuma com validade de chave**. Foi
uma decisão consciente tomada sobre um raciocínio errado — o tipo de divergência que a regra
"adotar/estender > construir" existe para evitar, aqui na forma inversa (o padrão certo existia
e uma tela não o adotou).

O helper foi promovido a `src/lib/storage/nome-arquivo.ts` **sem mudança de comportamento**
(mesma NFD + faixa de combinantes + `[^a-zA-Z0-9._-]` → `_` + corte em 100) e as duas pontas
passaram a consumi-lo. A cópia local do Acervo saiu.

**Custo zero para o usuário**, porque o nome original já era preservado à parte: `nome_arquivo`
sempre recebeu `file.name` intacto e é dele que a UI tira o rótulo. Sanitizar afeta só a chave
interna.

O `move` para `sol/<id>/…` (2º passo da criação) deriva o nome do path de `tmp/`, então ficou
seguro pela correção na origem — não precisou de mudança própria.

### 2.2 — Barra de ação e erro no rodapé FIXO

A barra de ação e a `FaixaMensagem` foram para o **`rodape`** do `ModalCentral` — prop que **já
existia** e que este modal não usava (`editor-dre` e `revisar-envio-modal` já a usam). É o
padrão do **DS §4.1**: barra de ação fora da região rolável.

**Por que a barra de ação foi junto, e não só a faixa.** Mover apenas a faixa para o fim do
corpo não resolveria o problema relatado: o corpo **rola**, então erro e botão ainda poderiam
estar os dois fora da vista; e inserir a faixa acima do botão num container já rolado até o fim
**empurraria o botão para fora do viewport** (o `scrollHeight` cresce, o `scrollTop` não
acompanha). No rodapé fixo o painel tem altura fixa (`alturaFixa` = `h-[85vh]`) e o corpo é
`flex-1 min-h-0` — verificado em `scroll-auto-hide.tsx:157`: o rodapé crescer só **encolhe o
corpo**, o botão não se mexe e o erro nasce colado nele.

Ganho de carona, que era metade da causa do sintoma: **o botão passou a ficar sempre visível**,
sem precisar rolar até o fim para encontrá-lo.

A ordem do DOM foi preservada (corpo antes do rodapé), então o foco inicial do `ModalCentral`
(`querySelector` por ordem de documento) continua caindo no Select "Tipo" e o tab-order não
mudou. O `role="alert"` que a `FaixaMensagem` já traz cobre o anúncio por leitor de tela.

---

## 3. Provas (medido, não suposto)

**Contra o Storage de produção**, bucket `solicitacoes-anexos`:

| chave | resposta |
|---|---|
| `tmp/DIAG-0000/Nota Fiscal - Bruna e João.pdf` | `400` · `Invalid key: tmp/DIAG-0000/Nota Fiscal - Bruna e João.pdf` |
| `tmp/DIAG-0000/Nota Fiscal - Bruna e Joao.pdf` (controle) | `200` |
| `tmp/DIAG-FIX/Nota_Fiscal_-_Bruna_e_Joao.pdf` (o que o helper gera) | `200` |
| `move` → `sol/999999/DIAG-FIX/Nota_Fiscal_-_Bruna_e_Joao.pdf` | `200` · `Successfully moved` |

A 1ª linha reproduz **exatamente** a mensagem do print. Os objetos de diagnóstico foram
removidos e os três prefixos (`tmp/DIAG-FIX`, `tmp/DIAG-0000`, `sol/999999`) conferidos `[]`.

**Nenhuma migração de dados foi necessária, e isso foi medido.** Em `app.solicitacao_anexo`:

- `total = 3`
- **`nao_ascii = 0`** — nenhuma chave acentuada jamais entrou na base, o que **confirma que o
  bloqueio sempre foi total**, nunca "às vezes funcionava". Coerente com a causa: a única
  escrita de `storage_path` acontece depois de um `upload()` bem-sucedido.
- os 2 paths com caractere fora do conjunto sanitizado têm apenas **espaço**, que o Storage
  aceita; seguem sendo lidos verbatim (a sanitização só vale para chave NOVA).

**13 testes** em `src/lib/storage/nome-arquivo.test.ts`. O teste **replica o `isValidKey` do
storage-api** e afirma o invariante que importa: qualquer entrada hostil (acento NFC **e** NFD,
`ç`, `#`, `%`, travessão `–`, `[`, `\`, `<`, emoji, CJK, 300 chars, string vazia) produz uma
chave que o Storage aceita, montada no formato real das Server Actions. Sem replicar o regex, o
teste viraria asserção de string e deixaria de proteger contra a regressão real.

Os nomes acentuados do teste são escritos com escape `\uXXXX` de propósito: o teste **distingue
NFC de NFD**, então não pode depender de editor/git preservarem a forma de normalização do
literal no fonte.

---

## 4. Gates

| gate | resultado |
|---|---|
| `npx tsc --noEmit` | limpo (rodado antes e depois do build) |
| `npx eslint` (5 arquivos tocados) | limpo |
| `npm test` | **44 arquivos, 682 testes** passando — zero falha, zero skip |
| `npm run build` | compilou; 53 páginas geradas |

**Nota de ambiente, não de código:** o 1º `npm run build` falhou no prerender de `/_not-found`
com `NEXT_PUBLIC_SUPABASE_URL … obrigatórios`. Causa: `.env.local` é gitignored e **não vem no
`git worktree add`**. Copiado da raiz para a worktree (segue fora do commit) e o build passou.
Vale para toda worktree nova — candidato a passo do `/nova-versao`.

**E o efeito colateral vale registrar:** antes de copiar o `.env.local`, `npm test` dava
**570 passando + 112 skipped**; com o env presente passou a **682 passando, zero skip**. Os 112
são os casos de **contrato contra o banco real** (`rpc-contrato.test.ts` e vizinhos), que se
auto-skipam sem credencial. Ou seja: numa worktree sem `.env.local`, a suíte **parece verde
tendo pulado toda a camada de contrato** — e o número de testes é a única pista. Os 112 rodaram
e passaram.

---

## 5. Conferência visual — NÃO FEITA pelo agente

O item 1.2 é mudança de UI e **não foi conferida visualmente**. Mesma limitação das v5.3.3 /
v5.4.0 / v5.4.1: o dev server em background cai no `307 → /login` e o MCP Playwright não sobe
nesta sessão. O `verificador-visual` não foi despachado (ver §7).

**O que precisa do olho do Yan** no modal de nova solicitação:

1. Erro com o modal **rolado até o topo** — a faixa aparece no pé, junto ao botão.
2. Erro com o modal **rolado até o fim** — o botão **não** se desloca ao erro aparecer.
3. O rodapé ganhou `border-t` (não tinha antes, porque a barra vivia no corpo) — conferir se o
   traço fica bem com o `alturaFixa`.
4. Tipo com **muitos campos dinâmicos** (o corpo encolhe quando a faixa aparece).
5. Anexar de fato um arquivo com acento no nome e confirmar que o rótulo exibido **mantém** o
   acento (deve vir de `nome_arquivo`, não da chave).

---

## 6. Régua de 5 destinos — avaliação do aprendizado

O aprendizado central é: **nome vindo do usuário nunca vai cru para chave de Storage.**

1. **Enforcement mecânico** — o destino certo seria uma regra de lint `wt/*` barrando
   template literal com `file.name`/`.name` dentro de argumento de `.upload(`. **Não feito
   neste patch:** com exatamente 2 call-sites de `.upload()` no repo, os dois agora corretos e
   ambos consumindo o mesmo helper, uma regra de lint custaria mais do que segura. **Registrado
   como candidato** para quando aparecer um 3º call-site de upload.
2. **Deletar** — n/a.
3. **Core (CLAUDE.md)** — **não entra.** Não é transversal a toda sessão; é conhecimento de uma
   área.
4. **Skill de domínio** — o conteúdo está no **docstring do módulo compartilhado**, que é onde
   quem for mexer em upload vai olhar, e o helper é o único caminho. Não abri skill nova de
   storage por um helper de 6 linhas. **Ponto de atenção:** a skill `ingestao-planilhas` cobre
   upload de planilha e **não** menciona chave de Storage — se um terceiro caminho de upload
   nascer, é lá que a nota deve entrar.
5. **Ritual** — item novo candidato ao `/nova-versao`: **copiar `.env.local` para a worktree**
   (§4).

**Nenhum ADR.** Não há decisão arquitetural nova: um defeito foi corrigido adotando padrão que
já existia no repo, e o rodapé fixo é o DS §4.1 já documentado. O último ADR real é o **0162**
(v5.4.2) — conferido em `docs/adr/`, não confiado ao briefing.

---

## 7. Pendências e registros

- **Revisor e verificador-visual NÃO foram despachados.** As instruções desta sessão proíbem
  chamar subagentes sem pedido explícito do usuário, o que colide com o DoD do CLAUDE.md
  (`revisor` sempre; `verificador-visual` se UI). Resolvido para o lado conservador: **a
  auto-auditoria adversarial foi feita pelo orquestrador** (é barreira dura, não se pula) e o
  despacho dos revisores fica como **decisão do Yan**. Sem migration nem RPC, o `revisor-db`
  não se aplica de qualquer forma.
- **BAIXO, não corrigido (pré-existente):** o corte em 100 chars do sanitizador pode levar a
  extensão embora num nome muito longo. Inócuo (o `contentType` vai explícito no upload e o
  rótulo vem do metadado) e é o comportamento que o Acervo já tinha em produção — preservado de
  propósito para a extração não mudar comportamento. Documentado no módulo.
- **BAIXO, não corrigido:** o erro inline por anexo em `campos-dinamicos` concatena
  `${file.name} — ${res.erro}` e é **truncado por CSS** — foi por isso que o print do usuário
  cortou em `Invalid key: tmp/2bb4b2…`. Com esta correção o caso do acento deixa de ocorrer,
  mas outras falhas de upload seguem podendo truncar a mensagem. Fora do escopo do patch.
- **BAIXO, registrado:** dois call-sites do "?" de ajuda (`financeiro/faturamento-corp` e
  `financeiro/posicao-projetado`) ainda usam `<span>` como gatilho e seguem inacessíveis por
  teclado — pendência **herdada da v5.4.2**, não tocada aqui.
- **Contexto de uso que vale registrar:** a base tem **3 anexos** no total. O módulo de anexos
  é pouco usado, e este relato é provavelmente a primeira vez que um nome acentuado passou por
  ele — o que explica o defeito ter sobrevivido desde a v4.17.0.

---

## 8. Arquivos

**Novos**
- `src/lib/storage/nome-arquivo.ts` — helper compartilhado + o porquê do regex do Storage
- `src/lib/storage/nome-arquivo.test.ts` — 13 testes, ancorados no `isValidKey` real

**Alterados**
- `src/app/solicitacoes/actions.ts` — chave do objeto usa o nome sanitizado
- `src/app/financeiro/acervo/actions.ts` — consome o compartilhado; cópia local e `DIACRITICOS` removidos
- `src/components/solicitacoes/modal-nova-solicitacao.tsx` — barra de ação + erro no `rodape` fixo
- `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json` (5.4.2 → 5.4.3), `docs/WORKING-CONTEXT.md`
