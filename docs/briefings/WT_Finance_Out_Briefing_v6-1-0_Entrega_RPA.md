# Out-briefing — v6.1.0 · Entrega das RPAs: errata 4, chaves por RPA, cliente de entrega

Rota A. Briefing `docs/briefings/briefing-v6-1-0-entrega-rpa.md` (f90749b); validação e plano aprovado
`docs/briefings/anexo-v6-1-0-m0-validacao.md`. Branch `feat/v6-1-0-entrega-rpa`. Fechamento em 29/09/2026.
ADR-0179. Migrations 0287 e 0288 (aditivas, aplicadas pelo backup-gate antes do merge).

## 1. Resumo em linguagem clara

As RPAs já extraíam os relatórios do Monde; agora elas **entregam** sozinhas. Um script versionado no
repositório faz os três passos do contrato, e o robô só o chama com uma linha e lê o código de saída.
Cada RPA tem a sua chave, que só abre as bases dela. E uma operação de casamento que some de uma carga —
porque o robô não conseguiu extraí-la, ou por qualquer outro motivo — **não some mais em silêncio**: a
equipe recebe um e-mail com o nome. O GATE aplicou as cinco bases pelo robô em 29/09, com os checksums
fechando.

## 2. Divergências briefing × realidade (anexo M0) e as decisões do Yan

1. **As 201 linhas da Darlene e Adnan já tinham saído** — a carga de Operação de 29/09 pelo card já era o
   CSV da RPA. O checkpoint final do briefing perdeu o objeto; a prova de `operacoes_removidas` ficou
   sintética (testes).
2. **O parser descartava `Operacao_Id` em silêncio**; **conferência não grava linha nem alarma**;
   **`confirmar` tem default `true`** no servidor; **Operação exige Aberto aplicado no dia também na
   conferência**; **o "antes" do diff é a base viva**, não a carga anterior; **as chaves nascem pela tela**
   `/admin/api-externa`; **a sessão não executa PowerShell** (o harness bloqueia) — toda execução do cliente
   foi do Yan.
3. **Correção desta sessão:** o anexo M0 afirmou "hoje não existe nenhuma chave cadastrada". Havia uma: a
   `TARS` (id 48, ativa, escopo vazio — chave da API de Solicitações). A consulta usada tinha `LIMIT 0`.
   Sem efeito: a recusa nova só atinge escopo de ingestão; a `TARS` continua passando.
4. **Decisões do Yan (29/09):** GATE em **duas etapas** (transporte contra produção antes do merge;
   `puladas`/diff por operação ao vivo depois); fechar as **duas brechas** (chave de ingestão fora da API
   de Solicitações; origem amarrada à credencial).

## 3. Missões

| Missão | Commits | O quê |
|---|---|---|
| M0 | 3930190 | errata 4 (a)–(g) + anexo de validação; `fixtures.mjs` acha pelo nome canônico |
| M1 | da1ad9e | 0287: `operacao_id` nas três tabelas; staging/promoção do corpo vivo; `ingestao_operacoes_vigentes()` |
| M2 | 35b4528, 6fe4270, 3fad255 | parser/adaptador (`Operacao_Id`), `puladas`, diff por conjunto, alarmes, origem amarrada, 403 na API de Solicitações; 0288 (o "antes" dentro da promoção) e os achados das revisões |
| M3 | 3bcc2ef | runbook das chaves; as quatro chaves criadas pelo Yan |
| M4 | 4073f64, c7ef1e4, 3fad255 | cliente PowerShell 5.1 + README + sonda estática |
| M5 | — | GATE etapa 1 pelo Yan, contra produção (§5) |
| M6 | (este) | fechamento |

## 4. Migrations

- **0287** (aditiva, aplicada 29/09, backup-gate verde 78/78): `operacao_id text NULL` em
  `raw.lancamentos_operacao`, staging e fato; `inserir_lote_staging_operacao` e `promover_carga_operacao`
  reescritas do corpo vivo (diff = só a coluna); `ingestao_operacoes_vigentes()` service_role-only.
  Ensaio em tx revertida: fato idêntico (41.959 linhas, Σ 138.030.347,64, hash de todas as colunas de
  negócio). REST: service_role 200 (239 itens), anon 401; `has_function_privilege` só service_role.
- **0288** (aditiva, aplicada 29/09): `promover_carga_operacao` captura o "antes" chamando
  `ingestao_operacoes_vigentes()` sob o lock, antes do TRUNCATE, e o devolve em `operacoes_antes`.
  Ensaio: 239 itens; **replay com o mesmo `carga_id` devolve o mesmo "antes"**; fato idêntico.
- **Ordem cumprida:** 0287 e 0288 aplicadas ANTES do merge — nenhuma carga do código v6.1 promove sob a
  0287. `database.ts` regenerado (só a função nova); baseline regenerado e teste de drift verde.

## 5. GATE — etapa 1 (29/09, Windows, contra produção ainda no servidor v6.0.1)

| Base | Chave | Resultado | Linhas | Checksums |
|---|---|---|---|---|
| Vendas | `rpa-vendas` (265) | aplicada · `rpa-pad` | 49.191 | 16 / 0 falhos |
| Movimentação | `rpa-lancamentos` (266) | aplicada · `rpa-pad` | 95.914 | 149 / 0 |
| Aberto | `rpa-lancamentos` (266) | aplicada · `rpa-pad` | 35.503 | 98 / 0 |
| Operação | `rpa-operacao` (267) | aplicada · `rpa-pad` | 41.959 | 1 / 0 |
| Demonstrativo | `rpa-demonstrativo` (268) | aplicada · `rpa-pad` | 3.345 | 557 / 0 |

- **Prova negativa:** chave 267 (Operação) pedindo upload de Vendas ⇒ **403** (`app.api_chamada_log`,
  17:06 UTC) — o cliente saiu com código 3.
- **Procedimento:** Vendas, Movimentação e Aberto foram conferidas antes de aplicar (vê-se no log de
  chamadas); **Operação e Demonstrativo foram aplicadas direto**, sem conferência prévia. O resultado
  ficou certo; registrado como desvio do roteiro.
- **Alarme legítimo:** o Demonstrativo mudou **2025** (ano fechado): mesmas 1.248 linhas, Σ de
  R$ 470.395,76 para R$ 469.600,56 (**−R$ 795,20**). E-mail `ano_fechado_alterado` enviado às 17:28 UTC.
  Não é defeito da entrega — é um lançamento de competência 2025 que mudou no Monde. **Conferir com a gerente.**
- **Etapa 2 (depois do merge):** uma carga de Operação pela RPA com `-Log` ⇒ `diff.puladas` e o conjunto de
  operações gravados; origem amarrada e o 403 da API de Solicitações vistos negando em produção. Ver §5b.

## 5b. GATE — etapa 2 (30/09, contra produção já no servidor v6.1.0) — PROVADA

Registrado no pós-merge da v6.1.1 (01/10), conferido de novo no banco (`ingestao.carga`,
`ingestao.promocao`, `ingestao.alarme`) antes de escrever.

| Campo | Valor |
|---|---|
| Carga | `32cc194b-fc38-4ec0-98ce-3c3edf24a60c` · base `lancamentos-operacao` · recebida 30/09 14:55 UTC |
| Chave / origem | `rpa-operacao` (267) · `rpa-pad` (origem amarrada à credencial) |
| Status | **aplicada** · 41.973 linhas |
| Operações antes (medido na promoção, `operacoes_antes`) | 239 |
| `operacoes_removidas` | `[]` — **medido**, não "não medido" |
| `operacoes_novas` | 0 |
| `diff.puladas` | 3, todas por "nome ambíguo": `W - Darlene e Adnan - DDMMAA`, `W - Giovana e Victor - 05SEP27`, `W - Paula e Fernando - 11MAY27` |
| Alarme | `operacoes_puladas` aberto 14:55:49 e **notificado por e-mail 14:55:51 UTC** |

- Na mesma sessão de 30/09 o fato ficou com 41.973 de 41.973 linhas com `operacao_id` preenchido.
- **As 3 puladas não são defeito da entrega:** existiam no CSV do R de 28/09 como cópia exata de outra
  operação e saíram da carteira em 29/09 pelo card (sem alarme, antes da v6.1). Os casamentos reais de
  Giovana e Victor e de Paula e Fernando (e o de Darlene e Adnan) dependem de corrigir o cadastro
  duplicado no Monde — ato do Yan.
- **Não rodadas ao vivo** (cobertas só por teste automatizado): o 403 da API de Solicitações para a chave
  de ingestão e o 422 de origem declarada incompatível com a credencial.
- **Achado miúdo do cliente:** `puladas[].ids` chega como UMA string `"uuidA|uuidB"` (o `.log` da RPA junta
  ids ambíguos com `|`); o cliente deveria separar — próximo patch.

## 6. Parecer da revisão

**`revisor-db` — 0287: APROVADA COM RESSALVAS.** MÉDIO: sem `lock_timeout`/advisory lock contra uma
carga em voo (deadlock possível) — **corrigido**; MÉDIO: o consumidor não podia copiar o fail-soft do
`somaPorAno` e precisava de Zod `.nullable()` — **passado à M2 e feito**; MÉDIO: DOWN sem ordem —
**corrigido**. BAIXOs: COMMENT da coluna da staging, linha de classificação — feitos; armadilha do
`derivar-allowlist.mjs` no caso de contrato — **evitada** (padrão `pg` + READ ONLY).

**`revisor` — M2: CORREÇÕES NECESSÁRIAS.** **ALTO:** retentativa depois de promoção commitada perdia a
remoção sem alarme — **fechado pela 0288** (o "antes" na promoção, devolvido no replay). MÉDIO 1
(cargas intercaladas) — fechado para o "antes" pela mesma 0288 (a staging intercalada ficou no backlog,
B-43); MÉDIO 2 (rename por id invisível) — **registrado** (B-45); MÉDIO 3 (o card não mostrava o que ia
sumir) — **corrigido** (linhas em `alarmes[]`). BAIXOs: escopo bruto na API de Solicitações, tetos Zod de
`puladas`, chamada tipada, "estado incerto" — feitos; os demais registrados (B-46).

**`revisor` — M3/M4: CORREÇÕES NECESSÁRIAS.** **ALTO:** a linha de exemplo de Operação do README tinha
`-Aplicar` (e a sonda travava isso) — **corrigido**. MÉDIOs: log sem `RESUMO`, nome com `;`, `carga_id`
nas falhas e "resultado incerto", diagnóstico de variável ausente, sonda fraca — **corrigidos**. BAIXOs:
marcador de `-ExtraidoEm`, `-Log` obrigatório, `.resposta.json` antigo apagado, contagem de alarmes no OK —
feitos; acentos no stderr e "uma linha no stderr" em erro de binding — registrados.

**`revisor-db` — 0288: APROVADA COM RESSALVAS.** MÉDIO: duas cópias do SQL do "antes" — **corrigido**
(fonte única `ingestao_operacoes_vigentes()`); MÉDIO: o header exagerava (a staging intercalada não é
fechada) — **corrigido** + B-43; MÉDIO: baseline — regenerado. ALTO de fluxo: fallback "pré-lido" errado na
retentativa — **corrigido** (retentativa ⇒ "não medido", nunca `[]`). BAIXOs: lock no topo removido,
COMMENT atualizado, caso de catálogo — feitos; `transform_raw_to_analytics` sem `operacao_id` — B-46.

**`revisor` — re-revisão das correções: APROVADO COM RESSALVAS.** MÉDIOs: erro de transporte saía 422
(o cliente lia "base intacta") — **virou 500 "estado incerto"**; heurística de `code` — **regex de SQLSTATE/
PGRST**; `NAO_MEDIDO` no cliente — **feito**; caso de catálogo sem a ordem do lock — **feito**; baseline —
**conferido** (drift zero contra o vivo). BAIXOs — feitos ou registrados (B-44, B-46).

## 7. Gates

`tsc`, `lint` e `build` verdes. `npm test`: **1.804 verdes, 6 skipped**, 1 arquivo falha —
`oraculo-demonstrativo.test.ts`, fixture `demonstrativo-cru.xlsx` de 21/09 ausente (B-38, pré-existente).
O oráculo do CSV do R está **pulado inteiro** (sem a `Lista de Operações.csv`, B-38); a paridade do parser
no CSV do R foi provada à parte (parser novo × `main`, 41.750 linhas idênticas). Oráculo novo com o CSV
real da RPA (41.959 linhas, 239 operações ↔ 239 ids) roda. Sem UI ⇒ sem conferência visual.

## 8. Pendências

**Do Yan:**
- ~~**Mergear o PR**, depois rodar a **etapa 2 do GATE**~~ — feito: mergeado 29/09, etapa 2 provada em 30/09 (§5b).
- **Corrigir no Monde os cadastros duplicados** das 3 operações puladas (§5b).
- **Conferir a mudança de −R$ 795,20 em 2025 no Demonstrativo** (§5), com a gerente.
- Nas próximas execuções, **conferir antes de aplicar** também em Operação e Demonstrativo.
- Decisões de backlog: B-45 (rename), B-47 (nome de chave para sempre), B-48 (nomes de noivos em alarme).
- Fora do escopo (briefing §7): orquestração e agendamento das quatro RPAs; ligar as expectativas do vigia
  por base depois da 1ª execução automática; comunicar a cadência diária à liderança.
- Custo do advisor desta versão (`/usage`).

**Não verificado:** as construções mais frágeis do PowerShell 5.1 que o GATE não exercitou — a leitura do
corpo de erro HTTP (nenhuma execução deu 4xx além do 403 do passo 1), Vendas com um único arquivo, e o
parse do `.log` com linhas `PULADA` reais (o GATE rodou contra o servidor v6.0.1 e a RPA não pulou nada).
— *Atualização 01/10:* o parse de `PULADA` reais foi exercitado na etapa 2 (§5b, 3 puladas lidas), com o
defeito dos ids unidos por `|`.

## 9. Aprendizados (régua de 5 destinos)

- **O "antes" que decide um alarme mora dentro da RPC que muda o dado, e volta no replay** → skill
  `banco-e-rpc` §4 **e** checklist do `revisor-db` (D-12). O `somaPorAno` ainda viola — B-42.
- **Documentação de comando também é "default"**: nenhum exemplo de conferência carrega `-Aplicar` → skill
  `ingestao-planilhas` §9 (junto da regra da v6.0.1).
- **Cliente fora de Node muda junto com a rota** — o PowerShell não é executável pela sessão; a sonda
  estática e a 1ª execução humana são as provas → skill `ingestao-planilhas` §9.
- **`LIMIT 0` numa sonda "existe algo?" responde sempre "nada"** — errei assim (a chave `TARS`). Destino 2:
  já coberto pela regra geral de "sonda precisa de caso que prove que enxerga o positivo" (v5.9.6).

## Advisor

| Agente | Consultas | Mudaram o rumo |
|---|---|---|
| Orquestrador | 0 | — (Carta: não consulta) |
| implementador M2-A (parser) | 1 (momento 3) | 1 — placeholder com `operacaoId: null`; tirou `!` do teste |
| implementador M2-B (servidor) | 2 (momentos 1 e 3) | 1 — recusou "data null ⇒ []" (fail-closed); exportou o schema |
| implementador M2-C (API de Solicitações) | 2 (momentos 1 e 3) | 0 — confirmou o desenho |
| implementador M3 (runbook) | 1 (momento 3) | 1 — cinco pontos (layout de máquina, unicidade de nome, `Read-Host`) |
| implementador M4 (cliente) | 2 (momentos 1 e 3) | 2 — separador `\|`, sem `Set-StrictMode`, `confirmar` booleano, desembrulho da `WebException` |
| revisor ×3 / revisor-db ×2 | 0 | — |

Custo: pendência do Yan (`/usage`).
