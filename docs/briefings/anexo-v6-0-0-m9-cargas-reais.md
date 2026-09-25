# Anexo v6.0.0 / M9 — as cinco cargas reais

Briefing §7 (M9: "rodar uma carga manual real de cada base pelo card com o cru de hoje; comparar com a
produção pré-versão — 5 cargas aplicadas, diff ≈ 0 contra o estado anterior (exceto `Intermediário`)").
Executada em 25/09/2026 pela **preview da branch** (a sessão não deploya; o merge é do Yan), pelo Yan,
com a sessão conferindo cada carga contra produção.

## 1. O ponto de partida

Todas as bases de produção tinham sido carregadas em 21/09, 14:13–14:16 UTC, pelo caminho antigo, com
os arquivos TRATADOS pelo R. O Yan subiu os CRUS de 21/09 — confirmado por sha256 contra
`scripts/ingestao/fixtures-manifest.json` para Vendas (3 arquivos), Movimentação, Aberto e Operação.
**O Demonstrativo subido é outro export, mais novo** (sha256 `5be10777…` ≠ `e740cc54…` de 21/09).

Fotos "antes" (fora do repositório, `$CLAUDE_JOB_DIR/tmp`): impressão digital linha a linha de 14
tabelas (sem id, `*_id`, carimbos e origem de arquivo), totais por ano, hash das RPCs de DRE por
competência e Vendas em Aberto; DRE de caixa pelo `scripts/dre-oracle.mjs` (REST/service_role — a RPC
cria tabela temporária e não roda sob a trava READ ONLY). Backup-gate de 18:08 UTC usado para os diffs
coluna a coluna.

## 2. Resultado por base

| Base | Carga | Checksums | Resultado contra a produção anterior |
|---|---|---|---|
| Vendas | aplicada 18:16 UTC (2ª tentativa válida) | 12/12 no servidor · 6 reconferidos no banco | **fato_venda (29.458), fato_venda_item (48.652), dimensões, dim_operacao_weddings IGUAIS linha a linha.** No cru: +210 linhas Welcome (fora das telas), `situação` 411 Aberta/48.451 Fechada, `Intermediário` em 8.511 linhas, 10 `data_inicio_evento` < 2015 vazias (regra da faixa). Vendas em Aberto muda por causa da `situação` (decisão de 22/09). |
| Movimentação | aplicada 18:30 | 149/149 (banco também) | **DRE de caixa idêntica ao centavo, 2024–2026.** 56 datas corrompidas na origem (emissão 1900/1901/2000; 1 vencimento 1997) ficaram vazias; propagam ao `fato_fluxo` sem efeito em tela. |
| Aberto | aplicada 18:33 | 96/96 (banco também) | DRE de caixa idêntica. **5 títulos com vencimento 2049** (cartas de crédito e reembolsos, −16.762,62 a pagar / +15.861,04 a receber) ficaram sem vencimento e saíram do `fato_fluxo`; lá eram pós-corte e nenhuma tela os lia (conferidos os 16 leitores e as 5 views do `fato_fluxo`). |
| Operação | aplicada 19:04 (2ª tentativa) | cruzamento 1/1 | fato com 41.745 linhas, 5.371 `lancamento_n` nulos e as MESMAS somas de número e valor. 79 lançamentos mudam de status (futuro → realizado) em 41 operações de Weddings — **calendário** (data final 22–25/09): com "hoje = 21/09" o fato novo é idêntico exceto o 203048 (divergência conhecida). `dim_operacao_weddings` ficou com o hash EXATO do ensaio em transação revertida (`c11a073f…`); faturamento inalterado (48.411.737,07). `venda_n` passa a preenchido (leitor único é rota órfã). |
| Demonstrativo | aplicada 19:07 | 557/557 (banco também) | Export mais novo: Σ 516.605,00 contra 508.964,10 (+7.640,90 em 42 células, 2025 +5.382,31 e 2026 +2.258,59). **2024 idêntico** (o hash da DRE só muda pelo carimbo `carregado_em` — trocado pelo antigo, bate). Alarme `ano_fechado_alterado` de 2025 disparou, notificou (MODO TESTE) e resolveu. |

## 3. Os três defeitos que as cargas reais acharam (todos com a base anterior intacta)

1. **Vendas recusada** — a guarda de setor de `validar_carga_staging` cobrava as 210 linhas Welcome
   contra `dim_setor` (lia a STAGING, que nem a M5 nem a 0283 enumeraram). **0284**: a guarda olha só
   o que o transform lê. Provado sobre a staging real: `setor_fora` 210 → 0.
2. **Rótulo do modal de Vendas** dizia "29.458 → 29.599" — o "depois" contava as vendas Welcome.
   `vendasDistintasQueEntramNoFato()`; o oráculo prova 29.458.
3. **Operação recusada** — `invalid input syntax for type bigint: "NA"`. O CSV é saída do R (5.185 "NA"
   em Lançamento N°, 124 em Venda, 41 em Liquidação) e ainda traz 31 números de parcela ("197848-2").
   **0285**: o fato só converte inteiro puro (o que o `toNum` antigo fazia); parser: `semNaDoR`. Ensaio
   da promoção inteira em transação revertida antes de o Yan tentar de novo.

   ⚠️ A carga válida de Operação rodou na preview ANTERIOR ao parser corrigido (o deploy novo ainda não
   estava pronto): o fato está certo (a 0285 está no banco), mas `raw.lancamentos_operacao` guarda o
   texto "NA" em 5.185/124 linhas, e o modal ainda mostrou "41 datas fora da faixa" e o aviso
   "Exemplos: NA". Recarregar a Operação na preview nova (mesmo dia do Aberto) limpa o cru.

## 4. Para o Yan / out-briefing

- **Cartas de crédito com vencimento 2049:** parece convenção de "sem prazo" do financeiro, não sujeira;
  a regra da faixa de data os trata como sujeira. Conversar com a gerente.
- **Pipeline de Weddings** (`/api/dashboard/weddings/pipeline`, sem tela): com `venda_n` preenchido
  mostraria R$ 49,1 Mi contra R$ 48,4 Mi das outras telas — não reativar sem rever a regra.
- **Aviso do banco "86 lançamentos sem liquidação e sem vencimento"** (Operação) conta LINHAS e inclui
  as sem número; o do servidor conta NÚMEROS distintos. Dois números para a mesma pergunta — alinhar.
- Dívida (MÉDIO do `revisor-db`): a guarda de data de `validar_carga_staging`/`promover_carga_vendas`
  ainda cobra as linhas Welcome.
- Ativar vigia/crons: só depois do merge (as rotas só existem em produção); regenerar o baseline após.
