# Out-briefing — v6.5.1 "DRE de caixa por centro de custo"

**Branch:** `feat/v6-5-1-dre-caixa-centro-custo` · **Briefing:** `docs/briefings/briefing-v6-5-1-dre-caixa-centro-custo.md` ·
**Medição (GATE 0):** `docs/auditoria/v6-5-1-m0-dre-centro-custo.md` · **Contrato da base:**
`docs/specs/v6-5-1-m2-base-centro-custo.md` · **ADR:** `docs/adr/0184-dre-caixa-por-centro-de-custo.md` ·
**Migrations:** 0304 (aditiva, 06/11), 0305 (destrutiva por classificação, Yan em TTY, 09/11), 0306 (aditiva, 09/11) e 0308 (aditiva, rateio do CSC, 23/11) —
todas APLICADAS; a 0307 é da v6.5.2 (arquivo idêntico incluído aqui). Banco na **0308**, livre **0309**. ADR livre **0185**.

**Classificação:** PATCH por decisão do Yan (D7). Pelo critério das v6.3.0 e v6.4.0 (base nova no contrato de ingestão +
migration destrutiva) seria MINOR — divergência registrada.

## 1. O pedido e as decisões

A DRE de caixa passa a poder ser lida por centro de custo (Trips, Weddings, Corp, CSC, Sem centro), com as antecipações
de recebíveis atribuídas a quem precisou do caixa. Decisões do Yan:

- **GATE 0 (06/11, D1–D7):** a árvore por centro vai até o REX, rotulado "(=) Resultado operacional de caixa"; patch
  destrutivo dos CHECKs aceito; de-para fixo de contas (Asaas → ASAAS, Blimboo → Blimboo); fixture negativa sintética;
  oráculo ajustado pela Movimentação de Caixa excluída da árvore; lista fechada de colunas; PATCH mantido.
- **GATE 1 (06/11):** DRE por centro num **card separado** abaixo da tabela da Empresa (que fica intocada), com o
  seletor só no card; AV do CSC sobre a receita bruta da empresa (`AV*`); "Quem cobre quem" no Lado a lado; centro abre
  na visão Mensal; coluna "Total" com "?"; carimbo "Caixa" mantido (+ "Centro de custo" e "Antecipações"); memória em
  faixa própria; Exportar já nesta versão. Escolha do agente: o card abre em Lado a lado.

## 2. O que foi feito, por missão

- **M0** — medição (Q1–Q7) e decisões. `cc0c8d35`, `c2131689`.
- **M1 (GATE 1)** — mockup na rota real com componentes de produção e fixture fictícia derivada da carga da Empresa
  (snapshot da `TabelaDre` gravado ANTES de qualquer mudança: `ef10d0da`); conferência da fixture contra o payload vivo
  achou e corrigiu `PAG_H` fora do perfil de operação. `95251f46`, `ed5fd3c3`, `a66c3a83`.
- **M2** — base `lancamentos-centro-custo` (sétima do contrato v1): parser com checksum pelo outline por centro, "+"
  rejeita, lista fechada (sonda estática), dimensão fechada de centros, rateio regenerado na promoção (Σ = 1 exato);
  card de upload; contrato; grants do `ingestor` (28 assinaturas). Migration 0304. `93ad3cdb`, `da9a7d8f`.
- **0305** — destrutiva dos CHECKs de base: pré-voo do agente (patch movido para `migrations/`, teste de paridade
  reapontado, classificação, única pendente, ensaio revertido); Yan aplicou em TTY em 09/11. `abfcceef`, `010609da`.
- **M3** — `get_dre_caixa_centro(p_ano, p_ajuste)` (0306): árvores por centro com a mesma fonte e mapa de
  `get_dre_mensal`; identificação dos recebíveis antecipados (regra pinada por engenharia reversa do protótipo); de-para
  `financeiro.antecipacao_conta_monde`; schema Zod; casos de contrato. `15eae216`.
- **M4** — o card lê a RPC real (fim da fixture na página); estados vazio/erro reais; carimbos da RPC. `08302b14`.
- **M5** — contratos: shape, paridade linha a linha, Resultado de caixa ≡ REX, anon e usuário sem área negados.
  `f2b48c2b`.
- **M6** — fechamento (este documento, ADR-0184, CHANGELOGs, bump 6.5.1, skills).

### Oráculos e provas (contra o banco, em transação revertida, com as fixtures de 06/11)

| Prova | Resultado |
|---|---|
| Rateio × base por categoria do mesmo dia ≡ "Rateio sem ajuste" do protótipo | **ao centavo** nos 4 centros (Trips 1.542.938,57 · Weddings 667.566,96 · Corp 1.325.290,80 · CSC −4.114.235,80) |
| Checksum falso (1 centavo a menos no CSC) | `CHECKSUM_FALHOU` nomeando o centro; base e rateio intactos (medido fora da transação) |
| Identificação das antecipações | **16/16 eventos e 3.186/3.186 recebíveis** iguais ao protótipo |
| Por centro (jan–nov): operacional, C, D, taxa, Resultado de caixa, cedidos | Weddings, Corp, CSC **ao centavo**; Trips −9.540,17 (ver §6) |
| Pesos mensais (Weddings/CSC) | idênticos (52,06/47,94 · 27,42/72,58 · 8,56/91,44 · 100% CSC nos demais) |
| Sem ajuste: Σ centros ≡ `get_dre_mensal` | linha a linha nas 159 linhas e 11 meses (caso de contrato permanente) |
| Com ajuste: Σ Resultado de caixa ≡ REX | mês a mês (caso de contrato permanente) |
| Remapear categoria no editor | as duas visões mudam juntas (inv. 2) |
| Tempo da leitura | 2,6 s no ensaio; 1,2–2,1 s por REST (teto 8 s) |
| Visão Empresa | intocada: call-site idêntico ao `main`; snapshot verde |

## 3. Gates

`npx tsc --noEmit` e `npm run lint` limpos; `npm run build` OK; `npm test`: **2.711 testes verdes**. Cinco arquivos de
oráculo de ingestão das bases antigas falham no carregamento por `ENOENT` — as fixtures deles não estão nesta worktree
(git-ignoradas; ambiente, anterior à versão).

## 4. Parecer da revisão

**`revisor-db` — 0304 e patch dos CHECKs (M2):** aprovados. ALTO-1 (ensaio que executasse o SQL) — feito antes do parecer
chegar e repetido depois das correções. BAIXOs corrigidos antes de aplicar: B-1 (aviso quando uma linha com valor fica num
centro de % zero/vazio e é repartida entre os outros) e B-3 (`btrim` em Número/arquivo na chegada). B-4 (comentário) já
estava corrigido; B-5 (lock de `limpar_staging` herdado do molde 0295), B-6 (o "antes" do alarme de ano fechado fora da
RPC, sem risco para esta base por causa do replay) e B-7 (copiar o patch por movimentação de arquivo) registrados.

**`revisor` — app da M2:** aprovado com ressalvas. MÉDIOs corrigidos: outline negativo/com milhar coberto por teste
sintético; **sonda estática da lista fechada** (vista reprovar com mutante). BAIXOs corrigidos: aviso de linhas ignoradas,
mensagem do marcador de outline, teste de replay que afirmava o que o mock não prova, contagem da allowlist (28). Registrados:
grant das 4 RPCs × "só a promover" (§6.3) e skills (atualizadas neste fechamento).

**`revisor-db` — 0306 (M3):** aprovada com ressalvas, sem CRÍTICO/ALTO. Corrigidos antes de aplicar: M2 (só categoria
mapeada entra como candidato — senão uma categoria nova na bandeja quebraria Σ Resultado de caixa ≡ REX), M3 (desempate
total), B2 (caso anon 42501), B3 (NULL em comparação), B4 (Número nulo fora), B5 (ANALYZE das temp tables). M1 (cada ano
isolado) registrado como fronteira (§6.2). B6–B8 conferidos.

**`revisor` — revisão final (M1/M4, módulo `dre-centro`, testes):** dois ALTOs corrigidos antes dos gates finais:
1. **AV* do CSC no Consolidado** dividia o YTD de um ano fechado pela receita da empresa de 12 meses (janela errada no
   denominador; latente até jan/2027). Agora a página passa a receita bruta da empresa MÊS A MÊS e cada coluna soma a
   própria janela; teste novo com dois anos prova o número.
2. **Decisão 5 do GATE 1** (o "?" na coluna Total do Lado a lado) estava só em `title`, que não abre por teclado nem
   toque: agora `GatilhoAjuda` no Total e no AV*; a explicação da memória virou nota visível sob a tabela.

MÉDIOs corrigidos: ano com centro que falha deixa de sumir calado (o card mostra erro); a montagem roda sob `try/catch`
(exceção vira erro do card, não derruba a página); a nota da taxa pendente não mostra mais parênteses vazios e declara a
compensação. MÉDIO de testes: coberto o Consolidado com dois anos. BAIXOs corrigidos: "Realizado" deixou de ser botão
inerte; comentários e tipos sem uso do mockup removidos de `tipos.ts`. BAIXOs registrados (decisão de produto ou
cosmético): no Consolidado por centro as pills de ano parecem seleção mas só trocam o ano das notas; "Quem cobre quem" usa
o sinal "−" (padrão A) enquanto a DRE usa parênteses; "Sem centro" aparece em Usos sem poder tomar antecipação (identidade
preservada); o card marca "Nov · parcial"/"2026*" e a tabela da Empresa não marca mês parcial no caixa. Fora do escopo:
`current_date` do banco (UTC) × `hojeSP()` da página perto da virada do mês (mesmo padrão antigo de `get_dre_mensal`).

### 4.1 Ajustes pedidos pelo Yan no PR #311 (depois da revisão)

Decisões de produto do Yan ao ver o card, aplicadas no mesmo PR antes do merge:

1. **"Lado a lado" virou "Todos"**, com as duas visões (o id interno segue `lado`):
   - **Consolidado** (abre nele): um bloco por ano com os 5 centros e a AV de cada um — ano inteiro dos fechados, YTD de
     todos, Δ% por centro entre YTDs — e o "Total YTD" do ano de referência + AV presos à direita. Hoje (só 2026 coberto)
     é um bloco "YTD 26"; o Δ% aparece sozinho em 2027.
   - **Mensal**: os meses empilhados — um bloco por mês (jan até o mês corrente, este "· parcial") com os 5 centros, só
     valor — e o Total + AV presos à direita. O bloco "Acumulado" saiu (o Consolidado cumpre o papel). Memória: no bloco
     do mês, a de soma é a do mês e a de saldo é a do fim do mês.
   - Testes provam Σ centros do mês ≡ REX do mês, Total ≡ REX do ano, Total do Consolidado ≡ Σ centros, Δ% e a ordem dos
     blocos com dois anos. No Exportar, a coluna leva o bloco ("Jan · Trips", "YTD 26 · AV CSC").
   - A frase "Sem Δ% contra 2025" do Consolidado passa a aparecer na abertura do card (ela já existia no Consolidado por
     centro).
   - Os centros seguem abrindo em Mensal (decisão 4 do GATE 1): a visão do Todos e a dos centros são estados separados.
1b. **Pill "Sem centro" retirada** do seletor; "Sem centro" segue como coluna do Todos (é onde fecha a soma com a
   Empresa) e o texto do "?" do seletor diz isso.
1c. **Seleção cumulativa** de CSC/Trips/Weddings/Corporativo. Cada clique marca ou desmarca uma; a última marcada não sai. Com
   as quatro marcadas, ou com um clique em "Todos", acende "Todos" e as quatro ficam em `color-mix(--brand 30%,
   --brand-soft)`. É um cinza um degrau mais escuro que o da seleção normal (`--brand-soft`), com a mesma borda e tinta
   (≈ 4,9:1 no tema neutro).
   - Um centro só: a visão dele (abre em Mensal).
   - Dois ou três: as visões do Todos, só com as colunas deles. O Total é a soma deles, e o "?" avisa que não fecha
     com a Empresa.
   - Todos: os cinco, com "Sem centro" e o "Quem cobre quem". O Quem cobre quem fica só no Todos, porque usos e
     fontes são da empresa inteira.
   - Decidido pelo Yan: com o Todos aceso, clicar num centro marca SÓ ele e desmarca os outros. Fora do Todos, o
     clique segue cumulativo, e marcar o quarto acende o Todos de novo.
2. **Notas sob a tabela retiradas** (cobertura, antecipações identificadas/não identificadas, taxa pendente, tomado e não
   devolvido, explicação da memória e a nota "* ano em curso"). O cálculo (`montar.ts → notas`) ficou, coberto por teste,
   mas **nada mais o mostra na tela**. Ficou só a frase "Sem Δ% contra «ano−1»" do Consolidado, que não estava no print.
   Efeitos: a explicação da memória segue só no `title` das linhas (não abre por teclado/toque); o asterisco de "Total 2026*" (depois retirado, item 7)
   fica explicado só no `title` da coluna; no Consolidado as pills de ano já não mudam nada visível (antes trocavam o ano
   das notas).
3. **Linhas de antecipação (C, D, taxa) no âmbar do previsto** da DRE de caixa — a MESMA régua (`fundoPrevisto`, exportado
   de `tabela-dre.tsx`; a tabela da Empresa não mudou, snapshot verde), a linha inteira, Conta inclusive. O Resultado de
   caixa fica na banda escura.
4. **Pills "Realizado" e "Realizado + Previsto" retiradas** (por centro é sempre realizado), com o "?" delas.
5. **"(=) RESULTADO OPERACIONAL DE CAIXA" e "(=) RESULTADO DE CAIXA" em caixa alta**, como os demais totalizadores (o
   texto das linhas de resultado da árvore já vem em maiúsculas do mapa vivo).
6. **AV do CSC igual à das demais:** 100% na RECEITA BRUTA DE VENDAS do próprio CSC. Substitui a decisão 2 do GATE 1
   (o `AV*` sobre a receita da empresa). Saíram o `AV*`, o "?" dele e todo o caminho da receita da empresa até a AV
   (`rbEmpresaMeses` na página, em `montar.ts` e nas visões), incluindo a correção do ALTO da revisão final, que deixou de
   existir junto com a regra.
   - **Consequência medida no banco em 09/11:** a receita bruta do CSC em 2026 é **−R$ 12.336,29**, com meses entre
     −R$ 25,7 mil e +R$ 20,6 mil. Pela regra da tabela da Empresa (base ≤ 0 → travessão), a coluna AV do CSC mostra
     "—" em todas as linhas. Num recorte em que a receita do CSC for positiva e pequena, os percentuais ficam muito
     grandes.
   - Para comparar, Trips tem R$ 5,37 mi, Weddings R$ 5,00 mi, Corp R$ 3,57 mi e Sem centro R$ 57,9 mil.
7. **Sem asterisco de "ano em curso"** ("YTD 26", "Total 2026", "Total YTD 26"), como a tabela da Empresa. O mês em curso
   segue marcado só por "Nov · parcial" no Mensal. Teste novo garante que nenhuma visão volta a ter rótulo com asterisco.
8. **"Corp" virou "Corporativo".**
9. **Coluna "Sem centro" só onde houve lançamento sem centro**, bloco a bloco: no Mensal, por mês; no Consolidado, por
   ano inteiro e por YTD. No Δ%, ela aparece se qualquer um dos dois anos teve lançamento. O critério são as linhas da
   árvore, não a memória, porque o saldo acumulado carrega valor sem lançamento novo. O Total continua somando todos os
   centros, e a coluna escondida era zero, então a paridade com a Empresa se mantém. Teste com "Sem centro" só em
   outubro e zerado prova os spans e o Total.
10. **Sem o rótulo "Centro de custo ?"** ao lado das pills (o nome segue no `aria-label` do grupo).
11. **Rateio do CSC (0308)** — fora do briefing (§11 o deixava para depois), entrou a pedido do Yan, que decidiu (23/11):
    só o valor do CSC é repartido entre Trips, Weddings e Corporativo (Sem centro ignorado); % por grupo ou por
    categoria, grupo trava as categorias; chave "Com rateio" liga/desliga (abre desligada — escolha do agente, a
    confirmar); salvo no banco para todos; um conjunto para todos os períodos; quem vê a DRE edita; entregue DENTRO
    deste PR (a 0307 da v6.5.2 entrou como arquivo idêntico para o histórico local casar com o remoto).
    - **Banco:** tabela `financeiro.dre_rateio_csc`; o corpo de `get_dre_caixa_centro` virou o núcleo interno
      `financeiro.dre_caixa_centro_nucleo` (corpo vivo da 0306 — md5 conferido 79c355b2… — mais o rateio aplicado só em
      `_cc_parte`); RPCs `get_dre_caixa_centro_rateio`, `get_dre_rateio_csc` (com `ativo` por alvo) e
      `salvar_dre_rateio_csc` (substitui o conjunto, validação nomeada, lock contra salvamento concorrente).
    - **Ensaio em transação revertida contra produção:** JSON de `get_dre_caixa_centro` idêntico ao de antes (com e sem
      ajuste, fora a chave nova `rateio`); rateio vazio ≡ sem rateio; com RH 50/30/20 + uma categoria 100% Trips
      (R$ 1,94 mi movidos), Σ centros igual em toda linha, CSC zerado nas rateadas, % exato nas três, Sem centro e as
      demais categorias intactos; 5 validações recusam com a mensagem certa; grupo órfão vem `ativo: false`.
    - **Aplicada em 23/11** (backup-gate verde, 93/93). REST: 200 nas três leituras; ~1,3–1,5 s quente (a 1ª chamada
      depois da migration levou 5,9 s, plano frio). Contratos novos: shape, Σ centros com ≡ sem rateio linha a linha,
      Resultado de caixa ≡ REX com rateio, anon e usuário sem a área → 42501 nas três (a de salvar sem escrever:
      sessão READ ONLY e guard antes). `derivar-allowlist verificador` pede exatamente as duas leituras novas.
    - **revisor-db:** aprovou com ressalvas, sem CRÍTICO/ALTO. Corrigidos: MÉDIO (grupo sem FK deriva em silêncio →
      `ativo` + aviso no drawer), MÉDIO (contratos das RPCs novas), BAIXO (redeclarar REVOKE/GRANT do wrapper).
      Registrados: categoria movida de bloco herda o % do bloco novo sem aviso; categorias guardadas sob grupo
      preenchido ficam gravadas e voltam a valer se o grupo for limpo; sem histórico de quem mudou cada % (só a
      última gravação); a regex `ALTER TABLE…DROP` do classificador atravessa statements — manter sem DROP top-level
      depois do `ALTER TABLE` da 0308.
    - **Front:** botão "Rateio" depois de "Todos" (drawer com grupos e categorias, até 2 casas decimais — com 3+ a
      coerção canônica leria a vírgula como milhar); chave "Com rateio" só com rateio salvo e desabilitada se a
      leitura com rateio falhar; o drawer não salva por cima de uma leitura que falhou.
    - **revisor (front):** aprovou com ressalvas, sem CRÍTICO/ALTO. Corrigidos: MÉDIO (drawer invisível em tela cheia —
      o portal vai ao body, fora do card; agora sai da tela cheia ao abrir), MÉDIO (exceção da action dentro da
      transition derrubaria a página — o drawer captura e mostra a mensagem), MÉDIO (ids/rótulos acessíveis repetidos
      entre categorias de mesmo nome — agora pela chave do alvo e com o grupo no rótulo); BAIXOs: chave "Com rateio"
      volta a nascer desligada depois de apagar o rateio, `ativo` no schema (sem cast), número não finito recusado no
      schema, comentário de `montarItens`, `scope`/legenda na tabela, log do erro não traduzido. Registrado: item salvo
      cuja categoria não está na árvore da tela (ex.: taxa de antecipação, fora da árvore com ajuste) sai no próximo
      salvamento sem aviso — inalcançável pela UI hoje.
    - **Ajustes do Yan no drawer (23/11):** colunas com largura fixa (centros 104 px, Soma 84 px — a Soma estava
      espremida); cabeçalho só com o nome do centro e o "%" como sufixo dentro do campo; rodapé Cancelar/Salvar FORA
      da área rolável — o `ListDrawer` ganhou o slot opcional `rodape` (o sticky dentro da rolagem deixava as linhas
      vazarem por baixo por causa do padding do viewport; os outros 20 usos do `ListDrawer` não mudam); botão "Rateio"
      em âmbar (`--warning-bg`/`--warning`/`--warning-deep`, ≈ 5:1).
    - **Botões "Limpar" e "Preencher vazios"; "Salvar rateio" virou "Aplicar"** (pedido do Yan). Os dois só mexem no
      formulário (nada vai ao banco antes de Aplicar). "Preencher vazios" dá 33,33% / 33,33% / 33,34% (o último leva o
      resto) às CATEGORIAS vazias dos grupos sem % próprio — escolha do agente, a confirmar: a linha do grupo não é
      preenchida, porque travaria as categorias e passaria por cima das já definidas.
12. **Sem a chave "Com rateio"; o estado é a cor da pill "Rateio"** (decisão do Yan, 24/11): branca = sem rateio
    salvo (desligado); âmbar = rateio salvo (ligado), e a DRE vem com o CSC repartido para todos. Para desligar: abrir o
    drawer, Limpar e Aplicar. Rateio salvo cuja leitura falhou mostra o erro do card (nunca a DRE sem rateio com a pill
    acesa). Limite: nesse caso a pill some junto com o card; o caminho é recarregar a página.
13. **"Quem cobre quem" retirado** ("está confuso") — o componente e a conta (`quemCobreQuem` em `atribuicao.ts`, com o
    teste dela) saíram juntos, para não ficar código morto; recuperável pelo git. A atribuição das antecipações, que a
    DRE usa, não dependia dela.
14. **Frase "Sem Δ% contra 2025: o Monde não tem centro de custo antes de 2026." retirada.**
15. **Drawer (24/11):** subtítulo "Reparte o que foi alocado como CSC para os demais centros de custo (Trips, Weddings e
    Corporativo)."; tabela com contorno; coluna Soma mais larga (96 px) e afastada da borda. Pill "Rateio" desligada =
    fundo branco com contorno e letras âmbar (`--surface`/`--warning`/`--warning-deep`); ligada = toda âmbar.
16. **Com o rateio aplicado, a coluna CSC não aparece** (pedido do Yan, 24/11). (a) A pill CSC fica APAGADA (visível,
    desabilitada, com o "porquê" no texto de ajuda — decisão do Yan, 24/11) e "Todos" passa a ser Trips + Weddings +
    Corporativo; uma seleção que só tinha o CSC vira "Todos". Escolha do agente, a confirmar: (b) o Total do "Todos" SEGUE somando o CSC (o que ficou nele sem percentual), para continuar fechando
    com a DRE da empresa — o "?" do Total diz isso; com o "Preencher vazios" aplicado, o CSC zera e o Total é a soma
    das colunas. Um centro só (Trips, por exemplo) segue como antes.
17. **Carregamento ao aplicar** (pedido do Yan, 24/11): depois de gravar, a página inteira é remontada no servidor
    (todas as leituras da DRE) e leva alguns segundos. Agora o drawer fecha no clique em "Aplicar" e a DRE fica coberta
    por "Aplicando o rateio…" com um ícone girando (`aria-busy`/`role="status"`; sem animação com
    `prefers-reduced-motion`). O véu some quando a página nova chega — detectado pelo dado (o objeto `rateio` novo,
    `estadoAplicacao`), não por tempo; há um relógio de segurança de 30 s. Erro ao aplicar: o véu sai e a mensagem
    aparece acima da tabela (os valores digitados no drawer se perdem nesse caso raro — a validação é feita antes).
    - **Correção (24/11, o Yan viu a tabela parada sem o véu):** o drawer chamava a action dentro de
      `startTransition(async …)`, e o React 19 segura TODAS as atualizações de uma transição assíncrona até ela
      terminar — fechar o drawer e ligar o véu só aconteciam no fim, quando já não havia o que esperar. Agora o drawer
      usa um estado simples de "salvando" e a chamada fica fora de transição: o drawer fecha e o véu aparece no clique.
      Não verificado em tela pelo agente (login).
18. **Correção: "Não foi possível carregar a DRE por centro de custo" ao aplicar o rateio** (Yan, 24/11). Causa, pelos
    logs do preview na Vercel: `get_dre_caixa_centro` E `get_dre_caixa_centro_rateio` cancelados por `statement
    timeout` (8 s do `authenticated`) — as duas leituras pesadas por centro rodavam em paralelo com as outras ~10 da
    página (sozinhas, 1–2 s cada; a resposta com rateio passa no schema e na montagem — sonda descartável). Correção: a
    página faz UMA leitura por centro, a com rateio (sem rateio salvo ela é idêntica à sem rateio — ensaio e contrato);
    o card perdeu a propriedade `leituraRateio`. Carga da página simulada (todas as leituras em paralelo): antes, a 1ª
    rodada chegou a 6,9 s na leitura por centro; agora ~1,8 s (ressalva: as rodadas novas pegaram o banco já
    aquecido). Risco que fica: em pico de carga o banco ainda pode passar de 8 s — registrado; se voltar, o próximo
    passo é tirar a DRE por centro do carregamento inicial (busca sob demanda).

**`revisor` — revisão final do delta pós-5baf71d3 (24/11, antes do merge):** aprovado com ressalvas, sem CRÍTICO/ALTO.
Corrigidos: MÉDIO (seleção "só CSC" + rateio ligado: a tabela mostrava Todos e nenhuma pill acesa; desmarcar contava o CSC
oculto — o seletor recebe a seleção efetiva; teste novo), MÉDIO (`temRateio` contava item órfão como ligado — agora só
itens ativos; teste novo), MÉDIO (Excel com o CSC oculto: o Total não fecha com as colunas — a aba leva a nota do "?";
teste novo), MÉDIO (erro ao aplicar perde o rascunho do drawer, consequência de fechar no clique — a mensagem diz
"Abra o Rateio e refaça"); BAIXOs: botão Rateio travado durante o Aplicar, região `role="status"` sempre montada,
comentários obsoletos (Quem cobre quem, chave "Com rateio", "rateio é fronteira"). Registrados: o véu pode sumir
antes do dado novo se outro refresh da página chegar durante o Aplicar (aceitável — não fica preso); com a leitura única,
se ela estourar o timeout o card de erro não tem o botão Rateio (para limpar um rateio é preciso o card no ar);
`montarNotas` ainda calcula as notas que a tela não mostra (pré-existente, desde a retirada das notas); os caminhos de
erro dentro do drawer (`else`/`catch` após `onSalvar`) ficaram inalcançáveis no uso pelo card — inofensivos.

Gate desta rodada: dois testes que vão ao banco de produção falharam UMA vez e passaram na repetição. Foram a deriva
sintética do `schema-baseline` e o contrato de `get_marketing_gastos_resumo`, este com `57014 statement timeout`
(RPC de Marketing, não tocada nesta versão). É instabilidade do banco ao vivo, não regressão; fica registrada.

## 5. Advisor

- **Orquestrador:** 2 consultas na M1 (escolha de arquitetura e conferência antes de declarar o GATE 1), **contra a Carta**
  (o orquestrador não consulta sem pedido do usuário) — a segunda mudou o rumo: mandou conferir a fixture contra o
  payload vivo, o que achou o `PAG_H` fora do perfil (o CSC nascia com receita bruta de −R$ 24,8 mi). A partir da M2 o
  orquestrador seguiu a Carta.
- **implementador (plumbing, M2):** 1 consulta, momento 3 — mudou o rumo (refez a verificação de switches na worktree e
  tirou nomes de tabela supostos).
- **implementador (parser, M2), explorador, revisores:** nenhuma.
- **Custo:** pendência do Yan (o `/usage` só o humano roda).

## 6. Ressalvas e fronteiras registradas

1. **Trips × oráculo: −9.540,17** = 2 linhas de Trips com movimentação em 23/11 (data futura) que a Empresa trata como
   previsto. A visão por centro usa o MESMO predicado da Empresa (inv. 2) — o protótipo as somou.
2. **Cada ano é identificado isoladamente** (revisor-db M1, fronteira de produto): antecipação de fim de dezembro com
   movimentação em janeiro, e o D de antecipação de 2026 que vence em 2027, não aparecem na visão de 2027. Só tem efeito a
   partir de jan/2027.
3. **Grant do `ingestor`:** as 4 RPCs da base (o briefing inv. 6 dizia "só a promover"); o pipeline precisa das quatro,
   precedente 0295.
4. **Header da 0304** diz "29 assinaturas" do `ingestor`; o medido é **28** (a sobrecarga zero-arg de
   `promover_carga_vendas` saiu na 0286). Corrigido em `rpcs-ingestor.ts`; a migration aplicada fica como registro.
5. **Taxa pendente** segue o protótipo: Σ (registro − Monde); as datas nomeadas são as antecipações sem taxa no Monde.
6. **Conferência visual não feita pelo agente** (a página exige login; o card só mostra números depois da 1ª carga).
7. **Fixture negativa** de grupo recolhido é sintética (D4) — a de 20/10 se perdeu.

## 7. 🔴 Pendências do Yan

1. **O rateio salvo no teste está no banco de PRODUÇÃO** (o preview usa o mesmo banco): em 24/11 havia 131 categorias
   com 33,33/33,33/33,34 ("Preencher vazios"). Depois do merge, TODOS veem a DRE por centro com esse rateio ligado
   (pill âmbar). Se era só teste: abrir o drawer, **Limpar e Aplicar** (antes ou logo depois do merge).
2. Conferir no **preview do PR** o Rateio inteiro (pill, drawer, Aplicar com o "Aplicando o rateio…") e a tabela da
   Empresa igual à de produção.
3. **Mergear** o PR. Nada de banco a aplicar depois (0304–0306 e 0308 no ar; a 0307 é a do #312, idêntica). Se o #312
   for mergeado antes, este PR precisa de rebase (CHANGELOGs e versão) — pedir ao agente.
4. Base de centro de custo: já há carga de 2026; manter a carga **no mesmo dia** da de Lançamentos por Categoria
   (movimentação), relatório com todos os grupos abertos.
5. Conferir um centro contra o protótipo, a soma dos centros contra a visão Empresa em dois meses e as antecipações de
   2026 contra o registro (briefing §10).
6. Pedir ao Financeiro o lançamento das taxas de antecipação pendentes no Monde. Com as notas fora da tela, o valor não
   aparece mais no card. No print do Yan de 09/11 eram R$ 23.098, nas antecipações de 09/04, 24/09, 09/10, 13/10 e 30/10.
   No mesmo print, a de 30/10 (Asaas, R$ 519,6 k) estava sem recebíveis identificados. Se isso continuar depois da carga
   do mesmo dia, essa antecipação fica fora do bloco C/D dos centros.
7. **Mostrar à diretoria** e anotar o que ela pedir.

## 8. Arquivos

- **Banco:** `supabase/migrations/0304_centro_custo_base.sql`, `0305_centro_custo_checks_ingestao.sql`,
  `0306_dre_caixa_centro.sql`, `0307_cliente_corporativo_contrato.sql` (da v6.5.2, idêntico), `0308_dre_rateio_csc.sql`; `supabase/baseline/schema-v6.json`; `src/types/database.ts`.
- **Ingestão:** `src/lib/ingestao/parsers/lancamentos-centro-custo.ts` (+ teste), `oraculo-centro-custo.test.ts`,
  `lista-fechada-centro-custo.test.ts`, `bases.ts`, `rpcs-ingestor.ts`, `carga.ts`, `aplicar.ts`, `instrucoes-upload.ts`,
  `grafo.ts`, testes de carga/aplicar/paridade/alarme, `promover-carga-checksum.test.ts`; `src/app/admin/ingestao/upload/`;
  `src/components/admin/ingestao/modal-reprocesso.tsx`; `supabase/seed/seed.ts`; `scripts/ingestao/fixtures-manifest.json`;
  `docs/contratos/ingestao-v1.md`.
- **DRE por centro:** `src/lib/dre-centro/` (centros, tipos, atribuicao, visoes, montar, exportar, schemas, fixture só de
  teste, empresa-sintetica), `src/components/financeiro/dre/tabela-dre-centro.tsx`, `seletor-centro.tsx`,
  `quem-cobre-quem.tsx`, `tabela-dre.tsx` (só `export` + `tituloExportar`), `src/app/financeiro/dre/page.tsx`,
  `src/lib/dre/schemas.ts` (export do `dreLinhaSchema`), `src/lib/rpc-contrato.test.ts`.
- **Docs:** ADR-0184, este out-briefing, `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, skills `ingestao-planilhas` e
  `banco-e-rpc`, `docs/WORKING-CONTEXT.md`.

## 9. Aprendizado (régua de 5 destinos)

- **Afirmação sobre o arquivo se mede antes de virar asserção** (a delegação disse "nenhuma data rejeitada"; eram 31) →
  skill `ingestao-planilhas` (bullet da base).
- **Ensaio de migration com o dado do oráculo carregado pelas próprias RPCs de carga, e regra de protótipo pinada por
  engenharia reversa ANTES do SQL** → skill `banco-e-rpc` §6. Não muda convenção de RBAC/timeout/coalesce: o checklist do
  `revisor-db` fica como está (D-12).
- **Fixture que imita o dado vivo tem de ser conferida CONTRA o payload vivo** (o `PAG_H` não estava no perfil) — já
  coberto pela regra geral de conferir contra produção; nada novo no core.
- **Pré-voo da destrutiva pelo agente, humano só roda o comando** — já é a prática registrada na memória do projeto; o
  bullet da base o cita.
