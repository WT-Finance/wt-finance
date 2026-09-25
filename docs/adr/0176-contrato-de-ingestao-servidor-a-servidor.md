# ADR-0176 — Contrato de ingestão servidor-a-servidor

**Status:** aceito (v6.0.0) · **Data:** 2026-09-25 ·
**Contexto:** versão v6.0.0, "Fundação da ingestão" — Frentes B (rota/Storage), E (log/alarmes/
retenção) e F (grafo) · **Briefing:** `docs/briefings/briefing-v6-0-0-fundacao-ingestao.md` §4
(GATE 0), §5-B/E/F · **Contrato:** `docs/contratos/ingestao-v1.md` (congelado 21/09, com as
erratas 1–3) · **Migrations:** `0276` (tabela `ingestao.carga`, bucket `ingestao-cru`, RPCs de
abertura/conclusão/leitura), `0280`/`0281` (execução, alarme, expectativa, painel), `0282`
(retenção do cru) · **Anexos:** `anexo-v6-0-0-m4-desenho-da-rota.md`,
`anexo-v6-0-0-m6-desenho-log-e-alarmes.md`, `anexo-v6-0-0-m6b-retencao-do-cru.md`,
`anexo-v6-0-0-m7-desenho-grafo-e-leitura.md`

> Numeração conferida contra `docs/adr/` e `supabase/migrations/` na worktree (branch com `main`
> já mesclado em `81240e0`) em 25/09/2026 (últimos reais: ADR 0175, migration 0285); conferência
> contra o remoto é do orquestrador no fechamento.

## O problema

Até esta versão, ingerir as cinco planilhas do Monde exigia um humano no navegador: baixar o
export, subi-lo pelo card de `/admin/uploads`, esperar o parser do cliente e confirmar o
resultado. Automatizar a extração (as RPAs, v6.1+) exige uma máquina falando com o Janus sem
passar por essa tela — e o incidente de 12–13/09 já mostrou que, num banco onde a RPC é a
superfície de escrita, uma credencial ampla demais na mão de um processo automatizado é a mesma
classe de risco que uma varredura descuidada. Era preciso um contrato publicado **antes** do
código, para a RPA ser construída contra ele em paralelo (GATE 0 do briefing), e um caminho que
não dependesse de sessão de navegador.

## Decisão

**Três chamadas HTTP autenticadas por chave, arquivo entregue por Storage — nunca no corpo da
requisição.**

1. **Duas rotas, três passos** (`docs/contratos/ingestao-v1.md` §2): `POST
   /api/ingestao/{base}/upload-url` devolve uma URL assinada por arquivo e cunha o `carga_id`
   (que passa a viver **dentro do caminho do objeto**, não numa linha aberta previamente — decisão
   técnica da M4, ver o anexo: abrir a linha no passo 1 deixaria `extraido_em` sem onde gravar e
   faria de todo upload abandonado uma carga fantasma); `PUT <signed_url>` sobe os bytes crus
   direto para o bucket privado `ingestao-cru`; `POST /api/ingestao/{base}` dispara o fluxo que
   confere, promove e loga. **O arquivo não viaja no corpo da rota de carga** — decisão do Yan na
   abertura da versão (21/09), porque a Vercel recusa corpo acima de 4,5 MB e o export de
   Lançamentos por Movimentação já tem 6 MB.
2. **Autenticação por `x-api-key` com escopo por base, OU sessão `admin/uploads`.** A chave é
   registro em `app.api_chave` com `escopo_bases` (uma chave pode cobrir várias bases — molde
   idêntico ao da API externa de Solicitações, ADR-0172), resolvida por hash; a RPA usa a chave, o
   card humano usa a sessão do usuário na mesma rota — um único caminho, duas portas de entrada,
   nunca dois parsers. Sem chave e sem sessão ⇒ `401 AUTH_AUSENTE`. A rota entra em
   `API_AUTH_PROPRIA_PREFIXOS` do `src/proxy.ts`, pelo mesmo motivo de `/api/externo/`: ela
   autentica sozinha e precisa devolver o erro do contrato, não o 401 genérico do proxy.
3. **Idempotência por `x-ingestao-idempotencia`.** A mesma chave de idempotência devolve a mesma
   resposta, sem recarregar — necessário porque o `carga_id` sozinho não impede uma RPA de repetir
   a chamada por timeout de rede achando que ela não chegou.
4. **`confirmar` (booleano, default `true`) — errata 2(a).** Com `false`, o servidor executa
   parse, checksums, reconciliação e diff e **para antes de aplicar**, devolvendo `status:
   "conferida"`; não grava linha em `ingestao.carga` nem consome a idempotência, porque carga é o
   que aplica. Existe porque o card antigo, parseando no cliente, mostrava "a base tem N, o arquivo
   traz M" **antes de qualquer escrita** — um gate humano real, que pegava o arquivo legítimo
   porém ERRADO (só um ano em vez de todos), internamente coerente o bastante para passar por
   qualquer checksum. Mover o parse para o servidor sem repor essa etapa removeria uma proteção
   viva sem ninguém ter pedido. A RPA nunca envia o campo; o default preserva o contrato tal como
   foi congelado.
5. **Grafo de dependência declarado como dado** (`src/lib/ingestao/grafo.ts`): Vendas alimenta
   Movimentação e Aberto, que alimentam Operação; Demonstrativo é independente. **Só uma aresta é
   bloqueante pelo contrato**: Lançamentos por Operação exige carga de Lançamentos por Vencimento
   em Aberto **aplicada no dia** (data de `concluido_em` em São Paulo = hoje) — sem ela, `409
   DEPENDENCIA_AUSENTE`. As demais arestas são ordem declarada, não enforcement; inventar bloqueio
   nelas seria mudar o contrato por conta própria. O check roda **antes** de abrir a linha de carga
   (não consome idempotência, não alarma) e depois de uma leitura de idempotência que só olha
   carga já `aplicada` (replay 200, nunca 409 num retry legítimo). Falha ao ler a última carga
   aplicada ⇒ `500`, fail-closed: "não consegui saber" não vale como "está lá".
6. **Log de toda execução em `ingestao.carga`** (uma linha por chamada da rota de carga: base,
   origem, chave/usuário, arquivos com sha256, checksums, diff, status, erro, duração). Nasceu na
   M4, não na M6 como o briefing propunha, porque a idempotência do item 3 não tem como ser
   honrada sem persistência entre duas requisições possivelmente em instâncias serverless
   diferentes. Os crons existentes (`monde-ingest-incremental`, as três reconciliações, o CDI) **não
   gravam nessa mesma tabela** — o `CHECK` de `base` é fechado nas cinco bases de upload e alargá-lo
   seria `DROP CONSTRAINT`/`ADD CONSTRAINT`, destrutivo pelo classificador; e as colunas são de
   arquivo, que uma execução de cron não tem. Ganharam a tabela irmã `ingestao.execucao` (0280),
   com uma RPC de leitura que junta as duas para a tela.
7. **Reprocesso é carga NOVA com cópia dos arquivos, não "repetir o passo 3 com os mesmos
   `path`s" — errata 3(a).** O texto original do contrato não funciona com a idempotência do item
   3: o `carga_id` viaja dentro do caminho do objeto, então repetir o passo 3 com os mesmos `path`s
   devolveria a resposta guardada da primeira vez em vez de reprocessar. O reprocesso real recopia
   os mesmos bytes para caminhos novos sob um `carga_id` novo e roda o passo 3 com
   `x-ingestao-origem: reprocesso` — a tela `/admin/ingestao` faz essa cópia no servidor. A
   proteção contra aplicar a mesma carga duas vezes fica intacta.
8. **Retenção do cru declarada: 3 meses; 7 dias para o que nunca virou carga — errata 3(b),
   decisão do Yan de 24/09.** O arquivo de uma carga fica no bucket por 3 meses e é apagado depois;
   o que subiu mas nunca virou carga (conferência cancelada, reprocesso não confirmado) some em 7
   dias. **O dado carregado no banco não expira** — só o arquivo como chegou. Medido antes de
   decidir (`docs/WORKING-CONTEXT.md`): um conjunto das cinco bases tem ~20 MB; ao ritmo semanal de
   hoje isso é ~1 GB/ano, ~7 GB/ano no ritmo diário da RPA — o custo não pesou, e o Yan não viu
   motivo para guardar o cru por mais tempo (o texto original do briefing propunha 24 meses "a
   revisar"; a revisão aconteceu e o número caiu). A limpeza roda numa rota e cron **próprios**
   (`/api/ingestao/retencao`, `ingestao-retencao` diário 07:30 UTC, nascido inativo), não dentro do
   vigia: o vigia tem orçamento de 60 s a cada 15 min, a limpeza roda uma vez por dia, e uma falha
   ao apagar não pode parecer saúde (ou doença) do vigia. Travas: só o bucket da ingestão, só
   `path`s do próprio inventário, teto de 500 objetos por rodada, recusa com zero cargas
   conhecidas, `GET` sempre simula e só `POST` apaga (achado ALTO da revisão — um `GET` com sessão
   estava apagando de verdade, alcançável por CSRF de navegação de topo ou robô de pré-visualização
   de link).
9. **Dado pessoal de Vendas (CPF, CNPJ, e-mail) só existe no cru do bucket, nunca em tabela**
   (decisão 3 do briefing). O cru de Vendas é a única cópia desses campos no Janus, e por isso a
   retenção do item 8 tem prazo — passados os 3 meses, reprocessar exige reenviar o export; não há
   mais o arquivo original para copiar.

## Alternativas descartadas

- **Arquivo no corpo da requisição de carga (multipart direto).** Descartado na abertura da
  versão, pelo Yan: a Vercel recusa corpo acima de 4,5 MB e um dos cinco arquivos já excede isso
  hoje. A entrega por URL assinada não tem esse teto (o Storage recebe o `PUT` diretamente).
- **`CRON_SECRET` como autenticação da rota** (decisão 6 do briefing). É o mecanismo que já
  autentica `/api/monde/ingest` e `/api/cdi/ingest`, mas é um segredo único e global — sem escopo
  por base, sem revogação seletiva, sem log por chamador. O molde da API externa (`x-api-key` +
  hash em `app.api_chave`, ADR-0172) já resolve as três coisas e é o que o briefing pede
  explicitamente adotar.
- **JWT HS256 de validade longa fixo no `.env.local`** — era a decisão original do briefing v5.11.0
  para a credencial de máquina; ficou inviável no regime novo de chaves do Supabase (ver ADR-0175
  §5) e foi substituída por login + hook. Não é uma decisão desta versão, mas a rota de ingestão
  herda a substituição: a credencial `ingestor` que aplica a carga é a do ADR-0175, não um JWT
  cravado.
- **Validade curta (15 min) para a URL assinada de upload** (o texto original do §2.1 do contrato).
  `createSignedUploadUrl` do SDK do Supabase não aceita parâmetro de validade — quem a define é o
  servidor do Storage (hoje 2 h). A resposta passou a reportar o valor **real**, lido do claim
  `exp` do token emitido, em vez de repetir um número que o sistema não cumpre (errata 2(b)). O que
  protege o caminho não é a janela curta: é o `carga_id` dentro do próprio caminho do objeto,
  conferido no passo 3, mais o sha256 declarado e reconferido.

## Consequências

- **Positivas.** A ingestão passa a ter um caminho sem navegador, pronto para as RPAs de v6.1+ o
  construírem contra um documento congelado. O card humano de `/admin/uploads` e a futura RPA
  percorrem exatamente a mesma rota — divergência de comportamento entre os dois caminhos deixa de
  ser uma classe de bug possível. Duas alavancas independentes de revogação para o `ingestor`
  (revogar a chave ⇒ 401 imediato; desativar o usuário de máquina ⇒ `PERMISSAO_NEGADA` na RPC).
- **Negativas / custos.** O contrato ganhou três erratas depois de congelado (2, 3) porque a
  construção revelou o que a redação original não previa — nenhuma delas muda o que a RPA envia,
  mas exigem que quem ler o contrato leia também as erratas. O caso residual da idempotência × grafo
  (a mesma chave de idempotência com `carga_id` **novo**, num dia sem Aberto, ainda leva 409 em vez
  de replay) fica registrado, não construído — fechar exige uma RPC de leitura por chave, candidata
  a errata 4b em v6.1.
- **Limites.** A janela de 15 min do contrato original nunca vai existir — é uma limitação do SDK,
  não deste projeto. A retenção do cru de 3/7 dias significa que, passado esse prazo, um
  reprocesso é sempre reenvio do export, nunca cópia do que já subiu.
