# Anexo v6.0.0 / M6b — Retenção do arquivo cru

Decisões do Yan em 24/09 (errata 3(b) do contrato `docs/contratos/ingestao-v1.md`): o arquivo cru
de uma carga fica **3 meses** no bucket `ingestao-cru`; o que subiu e **nunca virou carga** sai em
**7 dias**. O dado carregado no banco não expira. Esta missão constrói a limpeza.

## 1. Medido antes de desenhar (24/09)

- O bucket tem 4 objetos e `ingestao.carga` tem 2 linhas: os 2 excedentes são órfãos reais de hoje.
  (Corrigido depois de medir o inventário: são DUAS cópias do MESMO reprocesso da carga `c633873f`,
  de um único clique — muito provavelmente o modo estrito do React em desenvolvimento rodando duas
  vezes o efeito do modal. Em produção o efeito roda uma vez; as cópias são órfãs que a limpeza
  recolhe. Registrado como BAIXO.)
- `ingestao.carga.arquivos` é um array jsonb de `{path, nome, sha256}` — é o que liga objeto a carga.
- `postgres` lê `storage.objects` (dono `supabase_storage_admin`). **Apagar é só pela API do
  Storage**: linha removida por SQL não apaga o arquivo físico (e o Supabase bloqueia o DELETE direto).
- Um conjunto das cinco bases tem ~20 MB; 3 meses de RPA diária ≈ 1,8 GB.

## 2. Onde roda — rota e cron PRÓPRIOS, não dentro do vigia

- `ingestao.execucao.processo` tem `CHECK` fechado em 4 processos; incluir `ingestao-retencao`
  exigiria `DROP CONSTRAINT` + `ADD CONSTRAINT` — destrutivo pelo gate. A limpeza tem log próprio.
- O vigia tem `maxDuration` de 60 s e roda a cada 15 min; a limpeza roda uma vez por dia.
- Uma falha ao apagar não pode ficar parecendo saúde (ou doença) do vigia.

Rota `/api/ingestao/retencao` (mesma auth das rotas de cron: `CRON_SECRET` ou sessão
`admin/uploads`), cron `ingestao-retencao` diário às 07:30 UTC (04:30 em São Paulo, fora do horário
de carga), **criado INATIVO** — como o vigia, a rota só existe em produção depois do deploy (M9).

## 3. A regra (função pura, testada exaustivamente)

Entrada: `agora` (do relógio do BANCO), a lista de objetos do bucket (`path`, `criado_em`) e o
conjunto de `path`s citados em `ingestao.carga.arquivos`. Saída: o que apagar e por quê.

- **expirado** — objeto com `criado_em` anterior a `agora − 3 meses` (calendário), com ou sem carga;
- **órfão** — objeto que nenhuma carga cita e com `criado_em` anterior a `agora − 7 dias`;
- o resto fica. Um arquivo recém-enviado cuja carga ainda não foi aberta (entre os passos 1 e 3 do
  contrato — a URL assinada vale 2 h) nunca chega a 7 dias: não há corrida.

## 4. Travas (apagar é irreversível)

1. **Só o bucket `ingestao-cru`**, fixo no código e no filtro do inventário; nunca outro bucket.
2. **Só `path`s que o inventário devolveu** — nenhum `path` vem de entrada do usuário.
3. **Modo simulação** (`?simular=1`): devolve a lista do que SERIA apagado e não apaga nada — é o
   primeiro passo de qualquer diagnóstico e da prova.
4. **Teto por rodada** (500 objetos): se a decisão der mais que isso, algo está errado (relógio,
   inventário vazio de cargas) — a rodada **recusa apagar** e registra erro, em vez de esvaziar o bucket.
5. **Inventário de cargas vazio com objetos presentes** também recusa: sem ele, todo objeto antigo
   pareceria órfão.
6. Cada rodada grava uma linha em `ingestao.retencao` com os `path`s apagados (o "registra o que
   apagou" da decisão) — inclusive a rodada simulada e a que falhou.

## 5. Tela

O cartão do vigia em `/admin/ingestao` ganha a linha da limpeza: ligada/desligada, última rodada,
quantos apagou. O reprocesso de uma carga cujo cru já expirou diz **"o arquivo original expirou
(retenção de 3 meses)"**, em vez de erro genérico.

## 6. Prova da missão

1. Regra como função pura, com os casos de borda (7 dias exatos, 3 meses no fim do mês, citado ×
   não citado, recém-enviado, travas 4 e 5).
2. **Simulação contra produção**: a lista bate com o medido no §1 (hoje, nada a apagar — os órfãos
   têm menos de 7 dias).
3. **Apagar de verdade** um objeto de prova subido para isto, pelo mesmo executor da rota, e conferir
   que ele sumiu do bucket e que a linha em `ingestao.retencao` o cita.
4. `revisor-db` na migration, `revisor` na missão.

**O que foi provado de fato (24/09)** — o item 3 não pôde ser feito como escrito, e fica dito:
- A regra nunca escolhe um objeto recém-criado (é o ponto dela), e envelhecer um objeto exigiria
  escrever `created_at` direto em `storage.objects` de produção — não foi feito.
- Em troca: (a) o **contrato da API** que o executor usa foi provado ao vivo — `storage.remove([path])`
  devolve em `data[].name` o PATH COMPLETO, e um path inexistente não aparece nem dá erro (objeto de
  prova subido, removido, conferido fora do bucket por `storage.objects`); (b) a **rota real** rodou
  contra produção em simulação e de verdade (`ok`, nada a apagar), e um GET com credencial devolveu
  `simulado`; (c) o **inventário real** casa os paths citados com os objetos (2 COM carga, 2 SEM
  carga, zero citado sem objeto) — sem isso, todo arquivo de carga sairia no 8º dia; (d) o executor
  com vários lotes, falha no meio e registro só do confirmado está coberto por teste.
- **A primeira exclusão real pelo executor** serão as 2 cópias órfãs de 24/09, a partir de **01/10**,
  quando o cron estiver ligado (M9). Antes de ligar: `POST /api/ingestao/retencao?simular=1` e
  conferir que a lista traz só essas duas; depois da 1ª rodada, conferir a linha em
  `ingestao.retencao` e o bucket.

**Achados da revisão, corrigidos:** GET com sessão apagava de verdade (CSRF por navegação de topo e
robô de pré-visualização de link) — agora GET sempre simula e apagar exige POST (ALTO do `revisor`);
a "última rodada" da tela ignorava a diferença entre simulação e rodada real — agora mostra só a
real (BAIXO do `revisor-db`); o cartão usa o `Card` do DS; teste de vários lotes com falha no meio.
**Registrados, não corrigidos:** o corte de "3 meses" é calculado no calendário UTC (uma chamada
manual perto da meia-noite de São Paulo pode deslocar o corte em até ~3 h — o cron roda às 04:30 SP,
longe disso); o reprocesso copia arquivos dentro de um `useEffect` (em dev, o modo estrito duplica a
cópia; em produção roda uma vez — a limpeza recolhe o órfão); a rota do vigia também aceita GET com
sessão (lá o efeito é abrir/avisar alarme, não apagar — fica para o out-briefing); `abrirCarga` grava
o `path` declarado antes de `ehCaminhoDaCarga` validá-lo (inofensivo para a retenção — BAIXO do
`revisor-db`).
