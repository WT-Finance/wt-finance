# Out-briefing — v6.2.1 · Solicitações: anexo que não baixava e "valor inválido" na abertura

Patch pedido pelo Yan em 06/10/2026 (rota B). Spec: `docs/briefings/spec-v6-2-1-solicitacoes-anexo-e-valor.md`.
Branch `fix/v6-2-1-solicitacoes-anexo-valor`. **Sem migration, sem ADR, sem RPC nova** (banco e API
externa inalterados).

## 1. Resumo

Os dois sintomas relatados eram **uma cadeia**: o banco aceita só um separador em `numero`/`moeda`
(`^-?[0-9]+([.,][0-9]+)?$`), então `1.234,56` era recusado com "Há um valor inválido em um dos campos";
na recusa, `criarSolicitacao` **apagava os anexos já enviados**, o modal seguia com os metadados, e o
reenvio criava a solicitação apontando para binários inexistentes. O move `tmp/ → sol/` falhava em
silêncio e o download dava "Não foi possível gerar o link do anexo". Medido em produção (leitura apenas):
**25 de 141 anexos** com binário ausente, de 12/08 a 05/10/2026, todos com a impressão digital da cadeia.
Campo obrigatório vazio disparava a mesma perda.

Missões (spec): M1 anexos sobrevivem à recusa · M2 valor pt-BR + prévia · M3 erro diz o campo · M4 aviso
"Arquivo indisponível" para os 25 (decisão do Yan: sem mexer nos dados).

## 2. Decisões técnicas

- **Normalização no ENVIO, não no `onChange`** (`normalizarRespostasNumericas`): normalizar enquanto se
  digita impediria escrever `1.234,56`. Leitura pelo `toNum` canônico (lint `wt/no-coercao-reimpl`).
- **`moeda` sempre normalizada** para vírgula decimal, sem milhar, 2 casas (`toCentavos`) — a forma de 76
  dos 126 valores gravados. Não muda o significado de nada que já passava (o drawer já exibia moeda pelo
  mesmo `toNum`). **`numero` que o banco já aceita vai como digitado** (identificador `000123`, medida
  `2.500` não são reinterpretados; achado MÉDIO 1 do revisor). Teto de magnitude no inteiro seguro.
- **Espelho do regex do banco** (`REGEX_NUMERICO_BANCO`) com teste de paridade que lê a 0212 — confirmado
  no catálogo de produção que `app.solic_validar_e_snapshotar` é quem valida.
- **Promoção por cópia** (`copy → solic_promover_anexos → remove` do original só se promovido), no lugar
  de `move`. O revisor sugeriu desfazer o move quando a promoção falha; a auto-auditoria viu que o `rpc`
  resolve com `{ error }` também em falha de REDE, quando o banco pode ter gravado — desfazer deixaria o
  banco em `sol/` e o objeto em `tmp/`, o mesmo defeito. Com cópia, em toda falha os dois caminhos
  existem. Custo: órfãos em `tmp/`, sem coleta (backlog).
- **"Indisponível" decide pela mensagem `Object not found`** (medido em produção: `statusCode '404'`,
  `status 400`); só o `404` também valeria para "Bucket not found" e pintaria todo anexo de perdido.
- **Indisponível só se descobre no clique** — saber antes custaria uma consulta ao Storage por anexo a
  cada drawer aberto. A linha fica marcada e o clique seguinte não reabre aba.
- **Instrução por papel**: solicitante → "Envie-o de novo em 'Outros anexos'"; atendente → "Peça ao
  solicitante…" (só o solicitante tem a cópia); encerrada → só o aviso.

## 3. Arquivos

- `src/app/solicitacoes/actions.ts` — sem remoção na recusa; promoção por cópia com log; `anexoUrl` com
  `indisponivel`; `traduzir` com o campo.
- `src/app/solicitacoes/actions.test.ts` (novo) — Storage dublê **com estado**, `rpc` como método de protótipo.
- `src/lib/solicitacoes/format.ts` / `format.test.ts` — `valorNumericoCanonico`, `previaValorNumerico`,
  `normalizarRespostasNumericas`, `REGEX_NUMERICO_BANCO`.
- `src/components/solicitacoes/modal-nova-solicitacao.tsx` — normaliza no envio.
- `src/components/solicitacoes/campos-dinamicos.tsx` — prévia; erro em `aria-live`; `aria-invalid`.
- `src/components/solicitacoes/drawer-solicitacao.tsx` — "Arquivo indisponível".
- Docs: spec, este out-briefing, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `WORKING-CONTEXT.md`,
  `package.json`/`package-lock.json` (6.2.1).

## 4. Gates e prova

- `npx tsc --noEmit` 0 · `npm run lint` limpo · `npm run build` verde.
- `npm test` (final, após as correções da revisão): **1.964 testes passaram**, 6 pulados, 109 de 110 arquivos verdes. Na 1ª rodada, 4 arquivos do oráculo de ingestão falharam por **fixture
  git-ignorada ausente na worktree**. Copiadas de `~/projects/arquivo-worktrees-janus/fixtures-ingestao/`,
  3 voltaram ao verde; `oraculo-demonstrativo` segue vermelho por `demonstrativo-cru.xlsx`, a fixture já
  registrada como **perdida (B-38, v6.0.1)**. Sem relação com este patch.
- Solicitações: 74 testes verdes.
- **Prova de mutação**: reinserida a linha antiga que apagava os anexos, os 2 testes de regressão ficam
  vermelhos (feito na versão `move` e de novo na versão `copy`).
- Medições de produção (só leitura, `db query --linked` + `createSignedUrl` com service_role): 25/141
  anexos sem binário; nenhum objeto com aqueles UUIDs no bucket; resposta exata do Storage para objeto ausente.
- ⚠️ **Não verificado contra o Storage real:** `storage.copy` (escrever no bucket de produção pedia
  permissão; é API padrão do SDK, coberta pelo dublê).

## 5. Conferência visual — NÃO FEITA pela sessão (D5)

O MCP Playwright não sobe em sessão de background (v5.3.3) e a tela exige login real. Roteiro para o Yan:
1. Nova solicitação de um tipo com campo moeda e anexo: digitar `1.234,56` → prévia "Será registrado como
   R$ 1.234,56"; digitar `abc` no campo não é possível (filtro), mas `-` sozinho → "Valor não reconhecido".
2. Anexar um arquivo, deixar um obrigatório vazio → erro "Preencha o campo obrigatório "<campo>"."; preencher,
   reenviar, abrir a solicitação e **baixar o anexo**.
3. Abrir #2400 (ou #2401) e clicar no anexo → "Arquivo indisponível" na linha + mensagem por papel.

## 6. Pendências — o que só o Yan tem

- 🔴 Conferência visual (§5).
- 🔴 **Logs após o deploy.** O `storage.copy` não foi exercitado contra o Storage real, mas falha de
  forma segura: se ele falhar, o banco segue em `tmp/`, o objeto também, e o anexo baixa. O risco é
  silencioso: todo anexo novo acumularia em `tmp/` sem ninguém ver. Na 1ª abertura real com anexo, procurar
  `[solicitacoes] #` nos logs da Vercel: nenhuma linha = ok; `não promovido` = olhar o `copy`.
- 🔴 **Os 25 anexos perdidos não têm recuperação** (o binário foi apagado; só o solicitante tem a cópia).
  Solicitações afetadas (anexos): #920 (2), #940, #992, #1003, #1066, #1067, #1227, #1312, #1377, #1379,
  #1385, #1394, #1505, #1547, #1548, #1554, #1573 (2), #2192, #2212, #2307, #2399, #2400, #2401.
  **Em andamento, aceitam reenvio:** #920, #2307, #2400 (abertas); #2192, #2401 (aprovadas) — avisar os
  solicitantes.
- Backlog (registrado, fora do escopo): coleta de órfãos em `tmp/`; validação client-side dos obrigatórios
  dinâmicos; API externa com o mesmo limite de um separador (o doc diz "aceitam vírgula"); `anexarEmSolicitacao`
  sem a checagem de `..` que `descartarAnexos` tem; `storage_path` gravado do cliente sem validar prefixo
  (pré-existentes, apontados pelo revisor; dependem de UUID inadivinhável hoje).

## 7. Parecer da revisão

**`revisor` — 1ª passada (sobre `ec8ed9b`): APROVADO COM RESSALVAS.** 0 CRÍTICO, 0 ALTO, 5 MÉDIO, 7 BAIXO.

| Achado | Endereçamento |
|---|---|
| M1 `numero` reinterpretado (`2.500`→`2500`, zero à esquerda) | Corrigido: o que o banco aceita vai como digitado |
| M2 atendente instruído a reenviar arquivo que não tem | Corrigido: mensagem por papel |
| M3 promoção que falha pela metade → anexo morto com `ok:true` | Corrigido **por outro desenho** (cópia), ver §2 |
| M4 erro inline sem `aria-live` | Corrigido: `role="status"` só no erro + `aria-invalid`. Foco no 1º campo com erro no submit **não feito** (o campo já mostra o erro; registrado) |
| M5 `404` também é "Bucket not found" | Corrigido: decide pela mensagem; teste do caso |
| B `moeda` sem trava de expoente | Corrigido: teto no inteiro seguro |
| B loop do modal sem teste | Corrigido: `normalizarRespostasNumericas` testada |
| B clique repetido em indisponível abre aba | Corrigido |
| B asserção de log por regex livre | Corrigido: ancorada no prefixo |
| B prévia transitória enganosa ao digitar (`1.234,` → R$ 1,23) | Registrado (transitório; a prévia final é a verdade) |
| B "Preencha o campo obrigatório" para campo de anexo | Registrado (cosmético) |
| B placeholder sem `…` | Registrado (pré-existente) |

**`revisor` — 2ª passada (delta `d96c63c`, `26cbb99`): APROVADO COM RESSALVAS.** Os 5 MÉDIOS da 1ª
passada resolvidos; desenho cópia → RPC → remoção validado ("a invariante 'qualquer caminho que o banco
tenha, o objeto existe' vale em todo passo"). 0 CRÍTICO, 0 ALTO, 1 MÉDIO novo, 6 BAIXO.

| Achado | Endereçamento |
|---|---|
| M original apagado só pela ausência de erro (RPC devolve contagem; `0` mataria o anexo) | Corrigido: remove só com `data >= copiados.length`; teste do `0` |
| B região `aria-live` montada condicionalmente | Corrigido: contêiner sempre montado |
| B caminhos do cliente só validados pelo prefixo `tmp/` | Corrigido: só `tmp/<uuid>/<nome sanitizado>` é copiado/removido; teste |
| B spec e comentário ainda diziam "move" | Corrigido |
| B sem teste para falha do `remove` dos originais | Corrigido |
| B foco no 1º campo com erro no submit | Registrado (não bloqueante pelo revisor; o erro traz o rótulo) |
| B reenvio após resposta PERDIDA de `criar_solicitacao` cria 2ª solicitação com anexo morto (logado) | Registrado — comportamento idêntico ao do `move` antigo, não é regressão |
| (fora do escopo) `solic_promover_anexos` aceita `p_de_para` arbitrário do solicitante | Registrado para um patch de banco (validar prefixo de `para` na RPC) |

**`revisor-db`:** N/A (sem migration/RPC). **`verificador-visual`:** não rodado (§5).

## Advisor

Sessão principal: **2 consultas**. A 1ª, antes de abordar (confirmou a cadeia, sugeriu os dois descartes — data da
0220 e resposta do Storage para objeto ausente — e o desenho de normalização no envio; mudou o rumo ao
apontar que o gatilho incluía `CAMPO_OBRIGATORIO` e que `anexarEmSolicitacao` não devia mudar). A 2ª, antes do PR: não mudou o rumo; pediu o registro do
`copy` como fail-safe com o sinal de log a conferir, esta contagem e o número do PR no WORKING-CONTEXT.
Revisor: nenhuma. Custo: pendência do Yan (`/usage`).
