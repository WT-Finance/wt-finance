// ─────────────────────────────────────────────────────────────────────────────
// CHANGELOG da DIRETORIA — histórico de versões em LINGUAGEM DE NEGÓCIO.
//
// Separado do CHANGELOG.md técnico: aqui descreve-se o EFEITO e a IMPLICAÇÃO de
// cada entrega, nunca o mecanismo. Público: diretoria e gestores. Lido pelo modal
// de histórico (clique no "version X.Y.Z" da sidebar).
//
// REGRA DE MANUTENÇÃO (CLAUDE.md): a cada versão/patch, adicionar UMA entrada no
// topo, com a data E HORA real da entrega, em linguagem de negócio. TODAS as
// entregas aparecem — patches puramente técnicos ganham descrição genérica
// honesta. Granular: cada versão/patch é uma entrada própria.
//
// `data`: datetime local 'YYYY-MM-DDTHH:MM' = momento real do merge (publicação) —
// extraído do git (`git log --merges`, fuso -03). É o controle de produção. Ordem:
// mais recente no topo. Marco zero: v4.0.
// ⚠️ NUNCA inventar hora redonda. A entrada nasce ANTES do merge → use o horário real
// de autoria e reconcilie ao tempo do merge depois. (v4.11.0–v4.22.2 saíram com horas
// aproximadas e foram corrigidas em massa na v4.22.3 a partir do git.)
// ─────────────────────────────────────────────────────────────────────────────

export type ChangelogTipo = 'novidade' | 'correcao' | 'melhoria'

export interface ChangelogItem {
  tipo:  ChangelogTipo
  texto: string
}

export interface ChangelogEntrada {
  /** Número de versão visível (ex.: "4.10.1"). */
  versao: string
  /** Data e hora reais da entrega (merge), local 'YYYY-MM-DDTHH:MM'. */
  data:   string
  itens:  ChangelogItem[]
}

export const CHANGELOG_DIRETORIA: ChangelogEntrada[] = [
  {
    versao: '5.8.1',
    data: '2026-08-26T16:43', // horário REAL do merge (bbcb29c, PR #248, 26/08 16h43 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'novidade',
        texto:
          'A página do Demonstrativo de Resultado ganhou uma seção nova no topo, "Visão ' +
          'Geral", com os dois resumos executivos lado a lado — um por competência, outro ' +
          'por caixa — e, logo abaixo deles, a ponte que explica a distância entre os dois. ' +
          'É a ordem em que a pergunta nasce: vê-se um resultado, vê-se o outro, e a ' +
          'pergunta seguinte é por que eles são diferentes. Cada regime continua com a sua ' +
          'seção completa abaixo, com o demonstrativo inteiro.',
      },
      {
        tipo: 'novidade',
        texto:
          'A "Ponte Competência ↔ Caixa" responde a pergunta que a versão anterior criou ao ' +
          'pôr os dois regimes na mesma tela: POR QUE os dois resultados são diferentes. Ela ' +
          'parte do resultado por emissão e chega ao resultado por movimentação mostrando, ' +
          'conta por conta, de onde vem cada pedaço da diferença — o que já foi recebido mas ' +
          'ainda não foi emitido, o que foi incorrido mas ainda não foi pago, o repasse (que ' +
          'só existe no caixa) e os reembolsos (que só existem na competência). No acumulado ' +
          'de janeiro a agosto de 2026 são R$ 79,4 mil NEGATIVOS por competência contra ' +
          'R$ 136,8 mil POSITIVOS no caixa: uma distância de R$ 216,2 mil que agora tem nome ' +
          'e explicação, em vez de virar a pergunta "qual dos dois está certo?" — que é a ' +
          'pergunta errada. Os dois estão certos.',
      },
      {
        tipo: 'novidade',
        texto:
          'O resumo executivo por competência traz as oito linhas principais, da Receita ' +
          'Bruta ao Resultado Gerencial — o mesmo card que o demonstrativo por fluxo de ' +
          'caixa já tinha, com os botões de ano para escolher o que comparar, os anos ' +
          'fechados, o acumulado de cada ano e a diferença em reais entre eles. Antes era ' +
          'preciso percorrer o demonstrativo inteiro para chegar a essa leitura.',
      },
      {
        tipo: 'novidade',
        texto:
          'Na seção do Regime de Competência, o card "Decomposição da Variação do Resultado" ' +
          'mostra o que moveu o resultado deste ano contra o mesmo período do ano passado, ' +
          'um degrau por grupo de contas, do que mais pesou para o que menos pesou. Passando ' +
          'o mouse em cada degrau, aparece a conta específica que puxou aquela variação.',
      },
      {
        tipo: 'melhoria',
        texto:
          'Os cards novos cortam o acumulado do ano até o último mês que a base de ' +
          'competência realmente cobre. É uma diferença que importa: como essa base é ' +
          'atualizada por um arquivo enviado periodicamente, contar até o mês do calendário ' +
          'faria os meses ainda não enviados entrarem como ZERO, e o acumulado apareceria ' +
          'menor do que é, sem nenhum aviso. Quando a base estiver em dia, esses cards e a ' +
          'tabela mostram exatamente o mesmo período.',
      },
    ],
  },
  {
    versao: '5.8.0',
    data: '2026-08-26T12:19', // horário REAL do merge (30b71a4, PR #246, 26/08 12h19 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'novidade',
        texto:
          'A página do Demonstrativo de Resultado passou a mostrar DOIS resultados para o ' +
          'mesmo mês, um por critério, em duas seções: "Regime de Competência" (nova, no ' +
          'topo) e "Regime de Caixa" (a que já existia, logo abaixo). Atenção ao ler: os ' +
          'dois números são certos e vão ser diferentes, porque respondem a perguntas ' +
          'diferentes. CAIXA é o que efetivamente andou na conta no mês — dinheiro que ' +
          'entrou e saiu. COMPETÊNCIA é o que foi reconhecido pela EMISSÃO no mês, ' +
          'independentemente de quando o dinheiro se move. Uma venda emitida em julho e ' +
          'recebida em setembro aparece em julho na competência e em setembro no caixa.',
      },
      {
        tipo: 'novidade',
        texto:
          'A leitura por competência era mantida fora do sistema, numa planilha alimentada à ' +
          'mão. Agora ela vive no Janus, com a mesma estrutura de linhas, a mesma navegação ' +
          'por ano e a mesma coluna de Análise Vertical (% da Receita Bruta) da outra seção. ' +
          'A base é atualizada por um arquivo próprio, e a seção mostra no cabeçalho quando ' +
          'foi carregada e que período ela cobre — as duas seções podem estar em datas ' +
          'diferentes, e é para isso que a informação está ali.',
      },
      {
        tipo: 'novidade',
        texto:
          'A última linha do demonstrativo por competência é o RESULTADO GERENCIAL: é o ' +
          'Resultado do Exercício sem os reembolsos, porque reembolso é dinheiro que passa ' +
          'pela empresa e volta, não resultado dela. A diferença entre os dois é grande e é ' +
          'proposital — em 2024, R$ 208,7 mil de Resultado do Exercício contra R$ 1,32 ' +
          'milhão de Resultado Gerencial.',
      },
      {
        tipo: 'novidade',
        texto:
          'A estrutura do demonstrativo por competência agora é EDITÁVEL na própria tela, ' +
          'pelo botão "Editar estrutura" — do mesmo jeito que já era no demonstrativo por ' +
          'fluxo de caixa: arrastar uma linha para outro bloco, mudar a ordem, tirar uma ' +
          'linha do demonstrativo, e um histórico que mostra quem alterou o quê e permite ' +
          'desfazer. Antes essa organização só podia ser mudada por quem mexe no sistema. ' +
          'E quando o arquivo importado traz uma linha nova que ninguém classificou ainda, ' +
          'ela aparece como "Não classificadas" — visível no demonstrativo e disponível no ' +
          'editor para ser colocada no lugar certo, sem nunca desaparecer da conta.',
      },
      {
        tipo: 'melhoria',
        texto:
          'A atualização das bases de dados ganhou uma conferência automática: ao importar o ' +
          'arquivo do demonstrativo, o sistema compara a quantidade de linhas E a soma dos ' +
          'valores do arquivo com o que foi efetivamente gravado, e recusa a importação se ' +
          'os dois não fecharem ao centavo. Antes uma importação podia terminar "com ' +
          'sucesso" tendo gravado um valor diferente do arquivo, e isso só apareceria ' +
          'semanas depois, num relatório.',
      },
    ],
  },
  {
    versao: '5.7.2',
    data: '2026-08-25T14:10', // horário REAL do merge (a807c7d, PR #243, 14h10 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'melhoria',
        texto:
          'A Análise Vertical do Demonstrativo passou a ser calculada sobre a RECEITA ' +
          'BRUTA DE VENDAS, e não mais sobre a Receita Operacional Líquida. A Receita ' +
          'Líquida já é descontada de impostos e deduções, então usá-la como referência ' +
          'fazia as linhas de cima passarem de 100% e comparava tudo contra um número que ' +
          'já tinha subtrações dentro. Agora "% da receita" significa o que se espera. As ' +
          'linhas ACIMA da Receita Bruta (Entrada de Clientes, Pagamento ao Fornecedor, ' +
          'Saldo de Repasse e Receita de Vendas) deixam de mostrar percentual: elas são as ' +
          'parcelas que formam a receita, não uma parte dela.',
      },
      {
        tipo: 'melhoria',
        texto:
          'A página do Demonstrativo agora abre já no formato mais usado: a tabela em ' +
          '"Consolidado" com o realizado dos dois últimos anos, e o Resumo Executivo ' +
          'também com dois anos. Antes abria na visão mês a mês com a projeção misturada, ' +
          'que é a leitura mais densa e raramente a primeira pergunta de quem entra.',
      },
      {
        tipo: 'novidade',
        texto:
          'A tela de Solicitações ganhou um campo de BUSCA: dá para procurar pelo número ' +
          'da solicitação (com ou sem "#", e parcial) ou pelo e-mail de quem abriu. Além ' +
          'disso, as solicitações agora aparecem sempre da mais recente para a mais ' +
          'antiga, em todas as listas.',
      },
      {
        tipo: 'novidade',
        texto:
          'Na base de dados do Fluxo de Caixa Gerencial, as colunas passaram a ser ' +
          'ordenáveis: um clique no título ordena, outro inverte. Vale para Tipo, Pessoa, ' +
          'Valor, Descrição, Conta, Vencimento e Originador. A tabela já abre ordenada por ' +
          'vencimento, do mais recente para o mais antigo.',
      },
    ],
  },
  {
    versao: '5.7.1',
    data: '2026-08-24T17:02', // horário REAL do merge (bfb3daf, PR #241, 17h02 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'correcao',
        texto:
          'O card "Maiores variações" mostrava, para o ano anterior, um valor diferente do ' +
          'que o Demonstrativo mostrava para a mesma categoria — os dois lado a lado na ' +
          'mesma tela. O motivo: o card comparava o ano passado até o mesmo DIA do ano, e o ' +
          'Demonstrativo compara até o fim do MÊS corrente. Em "Pagamento ao Fornecedor" a ' +
          'diferença era de R$ 638.959,48. Os dois agora usam a mesma janela e batem ao ' +
          'centavo em todas as categorias. As colunas passaram a se chamar "YTD 2025" e ' +
          '"YTD 2026" para deixar explícito que são o acumulado do ano, não o ano inteiro.',
      },
      {
        tipo: 'melhoria',
        texto:
          'No Demonstrativo, a "Receita de Vendas" passou a aparecer ANTES da "Receita ' +
          'Bruta de Vendas", e a Receita Bruta ganhou o destaque das linhas de resultado. ' +
          'Ela é a soma do Saldo de Repasse com a Receita de Vendas — antes aparecia acima ' +
          'de uma das duas parcelas que ela soma, o que atrapalhava a leitura de cima para ' +
          'baixo. Nenhum valor muda.',
      },
      {
        tipo: 'melhoria',
        texto:
          'O bloco "Decomposição dos Lançamentos" saiu da página do Demonstrativo. Ele pode ' +
          'voltar a qualquer momento — nada foi descartado.',
      },
    ],
  },
  {
    versao: '5.7.0',
    data: '2026-08-19T17:45', // horário REAL do merge (d8c56a9, PR #239, 17h45 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'melhoria',
        texto:
          'MUDANÇA DE CRITÉRIO no Demonstrativo de Resultado, decidida com a controladoria. ' +
          'Duas coisas saíram do lugar: (1) as receitas financeiras passaram a ser lidas ' +
          'JUNTO das despesas financeiras, numa linha só, "Resultado Financeiro" — antes ' +
          'era preciso somar duas linhas de cabeça para saber quanto o financeiro custou ' +
          'líquido; (2) os gastos com IMOBILIZADO (máquinas, móveis, reforma) saíram das ' +
          'despesas operacionais e passaram para o grupo de investimentos. Comprar uma mesa ' +
          'deixou de piorar a margem operacional do mês do mesmo jeito que pagar aluguel — ' +
          'são decisões de natureza diferente. ' +
          'IMPORTANTE: o RESULTADO DO EXERCÍCIO não mudou um centavo em nenhum ano — o ' +
          'imobilizado apenas trocou de lugar dentro da mesma conta. O que muda é o LUCRO ' +
          'OPERACIONAL, que sobe exatamente o valor do imobilizado do período (2024: de ' +
          'R$ 1.345.435,68 para R$ 1.366.348,32; 2025: de R$ 692.722,91 para R$ 792.065,47). ' +
          'A mudança vale para TODOS os anos exibidos, inclusive os já encerrados — então ' +
          'relatórios impressos antes desta data mostram o critério antigo.',
      },
      {
        tipo: 'novidade',
        texto:
          'O Demonstrativo passou a mostrar a ANÁLISE VERTICAL: ao lado de cada valor, ' +
          'quanto aquela linha representa da Receita Operacional Líquida do mesmo período. ' +
          'É o que permite comparar anos de tamanhos diferentes — em 2025 o Lucro ' +
          'Operacional foi 7,9% da receita líquida contra 16,2% em 2024, uma leitura que os ' +
          'valores absolutos sozinhos não entregam.',
      },
      {
        tipo: 'melhoria',
        texto:
          'A página do Demonstrativo foi reorganizada para a leitura ir do resumo ao ' +
          'detalhe: o Resumo Executivo subiu para o topo (antes era preciso rolar a tabela ' +
          'inteira para chegar ao resumo dela) e agora tem seleção de anos própria; o card ' +
          '"Maiores variações" veio da página de Fluxo de Caixa e ficou logo abaixo do ' +
          'demonstrativo, que é onde ele responde "o que explica a variação"; e o ' +
          'demonstrativo ganhou um botão para ser exibido em tela cheia.',
      },
      {
        tipo: 'correcao',
        texto:
          'Os nomes das linhas do Demonstrativo foram padronizados: os grupos e os ' +
          'resultados passaram a indicar sempre o seu papel na conta — (+), (-), (+/-) ou ' +
          '(=) — e as categorias deixaram de trazer esse sinal no nome. O sinal de uma ' +
          'categoria é o do valor do período, e trazê-lo no nome dava informação errada nos ' +
          'meses em que o valor virava (um reembolso que num mês entra em vez de sair).',
      },
    ],
  },
  {
    versao: '5.6.4',
    data: '2026-08-14T15:18', // horário REAL do merge (869193e, PR #237, 15h18 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'novidade',
        texto:
          'O telão de metas (modo de exibição) agora alterna sozinho entre a meta do mês, a do ' +
          'trimestre e a do ano, em rotação contínua — a parede do comercial mostra os três ' +
          'horizontes sem ninguém precisar tocar na tela.',
      },
      {
        tipo: 'melhoria',
        texto:
          'No comparativo de metas, o período personalizado deixou de ser limitado a um único mês: ' +
          'agora dá para escolher um intervalo de meses seguidos (por exemplo, janeiro a abril) e ' +
          'comparar o mesmo intervalo com os dois anos anteriores.',
      },
    ],
  },
  {
    versao: '5.6.3',
    data: '2026-08-13T15:07', // horário REAL do merge (f0e0676, PR #235, 15h07 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'correcao',
        texto:
          'Venda que muda de classificação no Monde depois de importada (por exemplo, corrigida ' +
          'para emissão interna) deixava um resíduo que inflava o faturamento do mês. A ' +
          'sincronização diária agora detecta e remove esses resíduos sozinha, com registro de ' +
          'auditoria — os números dos painéis passam a refletir sempre a classificação vigente.',
      },
    ],
  },
  {
    versao: '5.6.2',
    data: '2026-08-13T13:43', // horário REAL do merge (6dc9567, PR #233, 13h43 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'novidade',
        texto:
          'No Comparativo da página de Metas, ao selecionar Weddings, um novo indicador mostra o ' +
          'progresso da "Meta de Assessorias": quantos contratos de casamento foram vendidos no ' +
          'mês em análise contra a meta mensal de 14. O número vem direto do Monde, atualizado ' +
          'a cada 15 minutos.',
      },
    ],
  },
  {
    versao: '5.6.1',
    data: '2026-08-11T17:25', // horário REAL do merge (f8f929d, PR #231, 17h25 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'novidade',
        texto:
          'A página de Metas ganhou a seção "Comparativo": escolha o setor e compare a meta e o ' +
          'faturamento do mês atual (ou do mês passado) com o mesmo mês dos dois anos anteriores — ' +
          'ou escolha qualquer mês desde 2024 para ser o mês em análise.',
      },
      {
        tipo: 'novidade',
        texto:
          'Um destaque ao lado dos gráficos realça a meta do mês em análise — o mesmo número dos ' +
          'cartões de acompanhamento, sem divergência.',
      },
    ],
  },
  {
    versao: '5.6.0',
    data: '2026-08-10T15:59', // horário REAL do merge (22418b1, PR #229, 15h59 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'novidade',
        texto:
          'A empresa passou a ter registro de quem está com cada equipamento. Entrou no menu uma ' +
          'seção nova, "Gestão de Pessoas", com o Inventário de Ativos: cada máquina, móvel ou ' +
          'aparelho tem uma ficha (categoria, número de série, fornecedor, data e valor de compra, ' +
          'nota fiscal, estado de conservação) e um histórico completo de movimentações — onde ' +
          'esteve, com quem, desde quando e por quê.',
      },
      {
        tipo: 'novidade',
        texto:
          'O histórico não se apaga nem se corrige por cima: cada mudança de mão é um registro ' +
          'novo (transferência, devolução ao estoque, envio e retorno de manutenção, empréstimo, ' +
          'baixa). Se uma baixa foi registrada por engano, ela se desfaz por uma reativação — que ' +
          'também fica no histórico. Nada desaparece do rastro.',
      },
      {
        tipo: 'novidade',
        texto:
          'É possível lançar uma movimentação com data anterior à última, para quando alguém só ' +
          'informar depois: o inventário se reorganiza sozinho e continua mostrando corretamente ' +
          'quem está com o item hoje.',
      },
      {
        tipo: 'novidade',
        texto:
          'A visão geral mostra quantos equipamentos existem e em que situação estão (em uso, em ' +
          'estoque, em manutenção, emprestados, baixados), a distribuição por categoria e por ' +
          'departamento, e o custo histórico de aquisição dos equipamentos ativos. Esse valor é ' +
          'só a soma do que foi pago na compra: não há depreciação e ele não entra na DRE nem no ' +
          'Fluxo de Caixa. Equipamento sem valor informado fica de fora da soma, não conta como zero.',
      },
      {
        tipo: 'novidade',
        texto:
          'As duas listas — equipamentos e movimentações — exportam para Excel, com os filtros ' +
          'que estiverem aplicados na tela.',
      },
    ],
  },
  {
    versao: '5.5.2',
    data: '2026-08-10T14:29', // horário REAL do merge (8e30f25, 14:29 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'correcao',
        texto:
          'Corrigida uma falha na leitura das planilhas do Monde que multiplicava por mil ' +
          'certos lançamentos — sempre aqueles cujo valor tinha três casas decimais, o que ' +
          'acontece quando um título é dividido em parcelas. Eram poucas linhas, mas de valor ' +
          'alto e repetidas mês a mês (cobranças recorrentes no cartão), então distorciam a DRE ' +
          'e o Fluxo de Caixa de forma silenciosa: um gasto de R$ 659,53 aparecia como ' +
          'R$ 659.532,00.',
      },
      {
        tipo: 'correcao',
        texto:
          'O efeito era grande o bastante para inverter o sinal do resultado: 2024 e 2025 ' +
          'apareciam como PREJUÍZO e, corrigidos, são LUCRO. O Endomarketing de 2025, que ' +
          'motivou a investigação, cai de R$ 924,7 mil para R$ 171,0 mil.',
      },
      {
        tipo: 'melhoria',
        texto:
          'Os números da tela só passam a refletir a correção depois que as duas planilhas ' +
          'forem carregadas de novo em Administração › Uploads — a correção vale para a ' +
          'próxima carga, não reescreve o que já está gravado.',
      },
    ],
  },
  {
    versao: '5.5.1',
    data: '2026-08-10T12:17', // horário REAL do merge (e12b03d, 12:17 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'novidade',
        texto:
          'A Lista de Operações de Weddings ganhou a "Margem Teórica (a.a.)": a margem anualizada ' +
          'somando ao resultado o rendimento que o caixa recebido antecipadamente teria se ' +
          'aplicado. Lida ao lado da margem contábil, a diferença entre as duas mostra quanto o ' +
          'nosso modelo de recebimento pesa no retorno de cada casamento.',
      },
      {
        tipo: 'melhoria',
        texto:
          'Ajustes de leitura pedidos depois de a versão anterior entrar no ar: o gráfico passou a ' +
          'se chamar "Rendimento Potencial do Caixa Livre" e ficou mais limpo, e as duas colunas ' +
          'teóricas foram para o fim da tabela — assim as margens contábeis ficam juntas e o que é ' +
          'teórico fica claramente separado, no fim da linha.',
      },
    ],
  },
  {
    versao: '5.5.0',
    // horário REAL do merge (291ce6c, 10:49 −03) — reconciliado no /pos-merge.
    // ⚠️ A versão foi ESCRITA em 07/08 e só entrou em produção em 10/08: este campo é
    // controle de PRODUÇÃO, não de autoria, então vale a data em que a diretoria
    // efetivamente passou a ver o indicador na tela.
    data: '2026-08-10T10:49',
    itens: [
      {
        tipo: 'novidade',
        texto:
          'Weddings passou a medir quanto o caixa recebido antecipadamente renderia se aplicado — ' +
          'o valor financeiro do nosso modelo de recebimento, que até agora não aparecia em lugar ' +
          'nenhum. O número usa a taxa CDI atualizada automaticamente do Banco Central, sem ninguém ' +
          'precisar alimentar planilha.',
      },
      {
        tipo: 'novidade',
        texto:
          'O indicador aparece em três lugares: uma coluna na Lista de Operações (dá para ordenar e ' +
          'sai no Exportar), um bloco no detalhe de cada operação e um gráfico no Fluxo de Caixa ' +
          'comparando o caixa real com o que ele renderia. Operação que ficou no vermelho durante o ' +
          'caminho aparece com custo, não com ganho — a conta funciona nos dois sentidos.',
      },
      {
        tipo: 'melhoria',
        texto:
          'É um valor TEÓRICO e a tela diz isso em todos os pontos: ele nunca é somado a resultado, ' +
          'margem ou faturamento, e usa cor própria justamente para não ser confundido com dinheiro ' +
          'que entrou. Serve para dimensionar o valor do float, não para lançar em lugar nenhum.',
      },
    ],
  },
  {
    versao: '5.4.5',
    data: '2026-08-05T21:09', // horário REAL do merge (206d2d8, 21:09 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'correcao',
        texto:
          'Venda cancelada no Monde continuava contando nos totais da plataforma. Quando todos os ' +
          'produtos de uma venda eram cancelados depois de ela já ter sido sincronizada, a ' +
          'plataforma nunca ficava sabendo — o valor antigo permanecia somando, indefinidamente. ' +
          'Foram encontradas 24 vendas nessa situação em 8 dos últimos 12 meses. Todas já foram ' +
          'corrigidas, e a sincronização passou a acompanhar cancelamentos automaticamente. ' +
          'ATENÇÃO: alguns totais MUDARAM. Julho de 2026 é o mais afetado — a receita do mês cai ' +
          'cerca de R$ 296 mil, quase toda de uma única venda que havia sido cancelada e continuava ' +
          'contando. Mas não é só para baixo: em dezembro de 2025 e fevereiro de 2026 a receita ' +
          'SOBE (a venda cancelada de lá tinha valor negativo). Em todos os casos o número passou a ' +
          'refletir o que o Monde tem hoje.',
      },
      {
        tipo: 'melhoria',
        texto:
          'A venda cancelada não é apagada da plataforma: ela fica guardada, marcada como cancelada, ' +
          'e apenas deixa de somar. Assim continua sendo possível auditar o que aconteceu. O quadro ' +
          '"Sincronização Monde", na tela de Atualização de Dados, passou a mostrar quantas vendas ' +
          'efetivamente contam e quantas estão preservadas nessa condição.',
      },
    ],
  },
  {
    versao: '5.4.4',
    data: '2026-08-04T16:31', // horário REAL do merge (d97bf50, 16:31 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'correcao',
        texto:
          'A sincronização com o Monde deixava de fora vendas lançadas no sistema com atraso. Quando ' +
          'uma venda era cadastrada dias depois da data em que aconteceu, ela não entrava mais na ' +
          'plataforma — e não entrava nunca mais. O efeito era faturamento a MENOS em Metas e em ' +
          'Performance, sem nenhum sinal de erro. Foram encontradas 42 vendas nessa situação, R$ 392 ' +
          'mil de faturamento, quase todas de julho; o atraso típico de lançamento é de 4 dias e o ' +
          'maior encontrado foi de 32. Todas já foram recuperadas, e a sincronização passou a fazer ' +
          'uma varredura diária dos últimos três meses para que isso não volte a acontecer. ' +
          'ATENÇÃO: alguns totais recentes SOBEM com a correção — é o número ficando certo, não uma ' +
          'venda nova. Julho de 2026 é o mês mais afetado.',
      },
      {
        tipo: 'melhoria',
        texto:
          'A tela de Atualização de Dados ganhou um quadro "Sincronização Monde", que mostra quando ' +
          'foi a última sincronização, quando foi a última varredura e se algum mês está divergindo ' +
          'do que o Monde tem. Antes não havia onde conferir se a integração estava saudável — a ' +
          'falha acima só apareceu porque foi procurada de propósito.',
      },
    ],
  },
  {
    versao: '5.4.3',
    data: '2026-08-04T13:08', // horário REAL do merge (977c97a, 13:08:15 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'correcao',
        texto:
          'Anexar arquivo na abertura de uma solicitação voltava a falhar quando o nome do arquivo ' +
          'tinha acento — "Nota Fiscal - Bruna e João.pdf", por exemplo. O comportamento confundia ' +
          'porque dependia só do nome: a mesma pessoa anexava dois arquivos sem acento com sucesso e ' +
          'falhava no terceiro, o que parecia instabilidade do sistema mas não era. Nomes com "ç", ' +
          '"#", "%" e com o travessão que o Word coloca no lugar do hífen tinham o mesmo problema. ' +
          'Corrigido para todos: o arquivo sobe com qualquer nome, e o nome que aparece na tela e no ' +
          'download continua sendo o original, com acento e tudo. Nenhum anexo já enviado foi afetado.',
      },
      {
        tipo: 'melhoria',
        texto:
          'No modal de nova solicitação, a mensagem de erro (por exemplo, um campo obrigatório em ' +
          'branco) aparecia no alto da janela, longe do botão "Enviar solicitação", que fica no pé. ' +
          'Quem clicava no botão não via o aviso e tinha a impressão de que o sistema havia travado. ' +
          'Agora o aviso aparece logo acima do botão, e o botão passou a ficar sempre visível no pé do ' +
          'modal, sem precisar rolar para encontrá-lo.',
      },
    ],
  },
  {
    versao: '5.4.2',
    data: '2026-08-03T17:22', // horário REAL do merge (9c8ae33, 17:22:13 −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'novidade',
        texto:
          'A lista de operações de Weddings passou a mostrar a margem anualizada, ao lado da margem. ' +
          'A margem sozinha comparava mal operações de durações diferentes: 17,5% em dois anos e meio ' +
          'e 17,5% em um ano apareciam como iguais, quando a primeira ocupou duas vezes e meia mais ' +
          'tempo de operação para entregar o mesmo. A coluna nova mostra a margem por ano de operação ' +
          'ocupada — no exemplo, 6,9% ao ano — e é ordenável, o que permite ranquear as operações por ' +
          'rentabilidade no tempo. Em contratos muito curtos o número fica naturalmente alto e deve ser ' +
          'lido com cuidado; o "?" ao lado do título da coluna explica. A exportação para Excel já ' +
          'inclui a coluna.',
      },
      {
        tipo: 'melhoria',
        texto:
          'O fluxo de caixa do Financeiro também ganhou a janela ajustável, no mesmo controle: ' +
          'dá para escolher quantos meses olhar para trás e para frente (até 36 de cada lado) e o ' +
          'gráfico mensal acompanha na hora. As saídas passaram a ser desenhadas para cima, ao lado ' +
          'das entradas, o que facilita comparar mês a mês o que entra com o que sai.',
      },
      {
        tipo: 'melhoria',
        texto:
          'O fluxo de caixa de Weddings ganhou janela ajustável. Os dois gráficos que ficavam em ' +
          'quadros separados agora vivem num quadro único, com um controle de horizonte entre eles: ' +
          'arrastando, escolhe-se quantos meses olhar para trás e para frente (até 36 de cada lado) e ' +
          'os dois gráficos acompanham juntos, na hora, sem recarregar a página. O acumulado passa a ' +
          'começar do zero na borda escolhida, então o que se vê é o movimento daquele período e não a ' +
          'soma de toda a história — e a linha de referência de saídas acompanha a mesma janela. ' +
          '"Total a receber" e "Total a pagar" saíram do canto do gráfico para um quadro próprio, ' +
          'porque são o compromisso total já assumido nas operações filtradas e não mudam com o ' +
          'horizonte escolhido. O filtro por operação subiu para o topo da seção e vale para tudo ' +
          'dentro dela.',
      },
    ],
  },
  {
    versao: '5.4.1',
    data: '2026-08-03T14:50', // horário REAL do merge (4801574, 17:50:48Z −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'melhoria',
        texto:
          'O Resumo Executivo do Demonstrativo virou um quadro próprio e passou a ter a mesma leitura ' +
          'da tabela: mesmo cabeçalho, valores em formato contábil e verde/vermelho conforme o sinal. ' +
          'Antes os dois blocos mostravam os mesmos números com aparências diferentes, o que dava a ' +
          'impressão de virem de fontes distintas. As colunas de variação agora dizem quais anos ' +
          'comparam, no Resumo e na visão Consolidado.',
      },
      {
        tipo: 'melhoria',
        texto:
          'A Decomposição dos Lançamentos ficou mais direta: ao clicar numa barra, a abertura acontece ' +
          'logo abaixo dela — antes o detalhamento aparecia no rodapé do painel, longe do que havia sido ' +
          'clicado. As cores das barras deixaram de variar por tamanho, que não significava nada, e o ' +
          'total de Entradas e o de Saídas agora ficam lado a lado na mesma altura, fixos, com cada ' +
          'lado rolando por conta própria quando tem muitas linhas.',
      },
      {
        tipo: 'novidade',
        texto:
          'O Demonstrativo passou a exibir, no alto do quadro, a data e a hora da última atualização da ' +
          'base de lançamentos que o alimenta — dá para saber, sem perguntar a ninguém, se o que está na ' +
          'tela já inclui o último envio da controladoria.',
      },
      {
        tipo: 'melhoria',
        texto:
          'O botão "Editar estrutura" passou a ficar logo abaixo da tabela, junto do que ele altera, ' +
          'em vez de no fim do quadro.',
      },
    ],
  },
  {
    versao: '5.4.0',
    data: '2026-07-31T17:14', // horário REAL do merge (6e481a0, 20:14:58Z −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'novidade',
        texto:
          'As Solicitações agora podem ser abertas por outros sistemas da empresa, com segurança e rastreabilidade: cada sistema recebe uma credencial própria, só abre os tipos autorizados, e a equipe responsável recebe e trata normalmente pela plataforma — o sistema de origem é avisado automaticamente quando a solicitação é concluída, rejeitada ou cancelada. Primeira integração: os pedidos de uso do dinheiro do casal, disparados do CRM pelas consultoras de Weddings, chegam direto como solicitações para o Financeiro.',
      },
      {
        tipo: 'novidade',
        texto:
          'Um pedido aberto por outro sistema fica no nome de quem realmente pediu: o disparo só é aceito com o e-mail de alguém já cadastrado na plataforma, e essa pessoa passa a ver o pedido em "Minhas solicitações", recebe os avisos por e-mail e pode cancelá-lo pela própria tela — com um selo indicando que ele chegou por integração. Consequência prática: para disparar pelo outro sistema, a pessoa precisa ter cadastro ativo aqui.',
      },
      {
        tipo: 'novidade',
        texto:
          'A documentação da integração passou a ficar dentro da plataforma, com acesso próprio: o botão está na tela inicial de Solicitações e a lista de tipos e campos é gerada do cadastro real, então ela nunca fica desatualizada em relação ao que a integração aceita. Quem só precisa integrar não precisa mais de acesso de gestão das Solicitações.',
      },
      {
        tipo: 'melhoria',
        texto:
          'Com a abertura da plataforma para toda a empresa, o histórico de teste das Solicitações foi apagado para começar limpo — pedidos, anexos e registros das provas de integração. Os dois tipos de solicitação que existiam apenas para teste também saíram; os tipos em uso, as pessoas, as equipes e os documentos do Acervo não foram tocados.',
      },
    ],
  },
  {
    versao: '5.3.5',
    data: '2026-07-31T10:56', // horário REAL do merge (89ee732, 13:56:07Z −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'correcao',
        texto:
          'O pedido de acesso feito pela tela de login voltou a chegar para aprovação. Desde 13 de julho, quem solicitava acesso recebia a mensagem de confirmação na tela, mas o pedido não era registrado em lugar nenhum — nenhuma solicitação aparecia em Usuários & Acessos para aprovar. Foram 18 dias em que qualquer pedido novo foi perdido em silêncio. Quem tentou nesse período precisa solicitar novamente: não é possível recuperar pedidos que nunca foram gravados. A partir de agora, uma falha nesse caminho fica registrada para diagnóstico em vez de passar despercebida.',
      },
    ],
  },
  {
    versao: '5.3.4',
    data: '2026-07-30T12:46', // horário REAL do merge (75798bd, 15:46:16Z −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'correcao',
        texto:
          'Os avisos por e-mail das Solicitações voltaram a chegar a todos os envolvidos. Quando uma solicitação era criada, concluída, rejeitada ou cancelada, parte das pessoas simplesmente não recebia o aviso — e quem ficava de fora mudava a cada vez, porque o servidor de e-mail da Microsoft recusa disparos em excesso feitos no mesmo instante. Agora os avisos saem em ritmo controlado, com nova tentativa automática quando o servidor recusa por sobrecarga momentânea. Nenhuma solicitação chegou a se perder: o aviso por e-mail é uma camada extra, e a solicitação sempre ficou registrada e visível na plataforma.',
      },
    ],
  },
  {
    versao: '5.3.3',
    data: '2026-07-28T17:18', // horário REAL do merge (e3677a5, 20:18:02Z −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'correcao',
        texto:
          'As telas de entrada da plataforma (login, solicitação de acesso e confirmação de link) voltaram a usar a tipografia oficial do Welcome Group. Elas estavam sendo exibidas com uma fonte genérica do computador do usuário, o que quebrava a identidade visual justamente na primeira tela que qualquer pessoa vê. As telas internas nunca foram afetadas.',
      },
    ],
  },
  {
    versao: '5.3.2',
    data: '2026-07-28T16:26', // horário REAL do merge (8a456f3, 19:26:29Z −03) — reconciliado no /pos-merge
    itens: [
      {
        tipo: 'melhoria',
        texto:
          'Melhorias internas de engenharia: reorganização da bancada de trabalho que constrói e revisa a plataforma. Nada muda nas telas — o efeito esperado é entregas futuras mais rápidas e com menos idas e vindas, e uma etapa nova de conferência visual automática das telas antes de cada entrega chegar à diretoria.',
      },
    ],
  },
  {
    versao: '5.3.1',
    data: '2026-07-28T14:33', // horário REAL do merge (a3b524a, 17:33:42Z −03) — reconciliado
    itens: [
      {
        tipo: 'novidade',
        texto:
          'O Demonstrativo de Resultado ganhou um Resumo Executivo, logo abaixo da tabela. São as seis linhas que se olha primeiro — Saldo Repasse, Receita Bruta, Receita Operacional Líquida, Lucro Bruto, Lucro Operacional e Resultado do Exercício — comparadas em seis colunas: os dois últimos anos fechados, a variação entre eles, o acumulado do ano anterior até este mês, o acumulado deste ano até este mês, e a variação entre os dois acumulados. As variações vêm em reais, para se ver o tamanho do movimento. Uma observação importante para não parecer erro: o Resumo é sempre o retrato de HOJE. Ele não muda quando se navega para outro ano na tabela acima — a comparação continua sendo a dos anos mais recentes, de propósito.',
      },
      {
        tipo: 'melhoria',
        texto:
          'A Decomposição dos Lançamentos (as barras de Entradas e Saídas do período) passou a seguir a estrutura oficial do demonstrativo, e não mais o agrupamento que vem do sistema de origem. Na prática: as barras agora FECHAM com os subtotais da tabela logo acima, no mesmo período. Antes isso não acontecia por dois motivos — cerca de vinte categorias estão posicionadas na nossa estrutura de forma diferente de como chegam do sistema de origem, e a decomposição vinha somando ao realizado alguns títulos ainda em aberto vencidos em meses anteriores. Agora ela considera apenas o que efetivamente se movimentou, e as transferências internas entre contas ficam de fora dos dois lados. Clicar numa barra continua abrindo o detalhe por categoria.',
      },
      {
        tipo: 'melhoria',
        texto:
          'A Decomposição também mudou de lugar e de formato: saiu da seção separada e recolhida em que vivia e passou a ficar junto do demonstrativo, na mesma seção "Regime de Caixa", com os valores em barras horizontais em vez dos gráficos de rosca. O filtro de período agora fica dentro do próprio quadro (começando em "Este ano"), e é independente do ano escolhido na tabela — dá para ler o demonstrativo de um ano e, ao lado, decompor os últimos três meses. Categorias que ainda não foram posicionadas na estrutura continuam aparecendo à parte, sinalizadas, para nada passar em branco.',
      },
    ],
  },
  {
    versao: '5.3.0',
    data: '2026-07-27T16:50', // autoria real (último commit da versão); reconciliar ao horário do merge
    itens: [
      {
        tipo: 'novidade',
        texto:
          'O Demonstrativo de Resultado chegou à plataforma, na aba Financeiro. É o mesmo demonstrativo que a controladoria mantinha em ferramenta separada — a estrutura oficial completa (entradas de clientes, repasse, receita, custos, despesas por área e as linhas de resultado até o Resultado do Exercício), mês a mês, com o ano navegável. O mês corrente aparece dividido em duas colunas: o que já se realizou até hoje e o que ainda está previsto para o restante do mês; os meses futuros mostram o previsto por vencimento, em tom âmbar, e o que venceu sem ser pago aparece à parte, em vermelho. Valores em verde são receitas e em vermelho gastos. A coluna de total do ano fica sempre à vista, presa à direita, enquanto os meses rolam.',
      },
      {
        tipo: 'novidade',
        texto:
          'A estrutura desse demonstrativo agora é viva e editável pela própria plataforma (botão "Editar estrutura"): dá para reordenar categorias dentro de um bloco, mover uma categoria de um bloco para outro (vendo o efeito nos subtotais antes de confirmar), e excluir ou reincluir categorias que não devem compor o resultado (como transferências internas entre contas). Categorias novas que surgirem no Monde nunca somem: aparecem automaticamente numa bandeja "Não classificadas" até alguém as posicionar. Toda alteração fica registrada num histórico com autor e data, e pode ser desfeita — o mesmo mecanismo de segurança que estreou na Base de Dados do Gerencial.',
      },
      {
        tipo: 'melhoria',
        texto:
          'Duas maneiras de ler o mesmo demonstrativo. Em "Mensal", os doze meses do ano escolhido. Em "Consolidado", a comparação ano a ano: marque quantos anos quiser e cada um entra com o ano fechado, o acumulado até o mês atual e a variação percentual para o ano seguinte — sempre no mesmo recorte de calendário nos dois lados, para a comparação ser honesta. Em ambas dá para escolher se o total considera apenas o realizado ou o realizado somado ao previsto, e abrir os dois anos seguintes para ver o que já está lançado à frente. Os valores seguem o formato contábil de sempre: R$ discreto à esquerda, centavos, e gastos entre parênteses.',
      },
      {
        tipo: 'melhoria',
        texto:
          'Os números do Demonstrativo saem da mesma base de lançamentos do Fluxo de Caixa (eixo da movimentação bancária) e foram conferidos, mês fechado a mês fechado, contra o dashboard que a controladoria usava — as linhas de resultado batem ao centavo, descontadas apenas re-edições feitas no próprio Monde depois da data de referência.',
      },
      {
        tipo: 'correcao',
        texto:
          'Na comparação entre anos, o acumulado do ano ("YTD") passou a ser sempre contado de janeiro até o mês atual do calendário. Antes, ao consultar um ano já encerrado, esse acumulado era calculado sobre os doze meses e acabava idêntico ao total do ano — o que tornava a comparação entre períodos sem sentido, ainda que os números parecessem plausíveis.',
      },
    ],
  },
  {
    versao: '5.2.1',
    data: '2026-07-24T13:34',
    itens: [
      {
        tipo: 'novidade',
        texto:
          'As edições da Base de Dados do Fluxo de Caixa Gerencial agora têm histórico e desfazer. Toda alteração (criar, editar ou excluir uma linha) fica registrada — quem fez, quando e quantas linhas — num painel "Histórico de alterações" logo abaixo da base. Dá para reverter uma ação inteira ou uma linha específica em um clique. Isso responde ao episódio em que a base foi apagada por engano sem volta: agora uma exclusão em massa pode ser revertida pelo histórico. Reverter suas próprias edições unitárias é livre; reverter a ação de outra pessoa ou uma reversão em massa exige perfil de administrador.',
      },
      {
        tipo: 'novidade',
        texto:
          'Trabalho simultâneo ficou seguro. Quando outra pessoa altera a base, você vê um aviso discreto ("Fulano alterou N linhas") e a lista se atualiza sozinha em segundos. E se duas pessoas editarem a mesma linha ao mesmo tempo, ao salvar o sistema avisa que a linha mudou e recarrega — nunca sobrescreve em silêncio o trabalho do outro.',
      },
      {
        tipo: 'melhoria',
        texto:
          'Ao digitar valores de saldo (nos cartões de conta do Gerencial e na janela "Editar saldos" do Fluxo de Caixa), o campo agora formata o dinheiro em tempo real no padrão brasileiro (R$, milhar com ponto, vírgula nos centavos), inclusive ao colar. E o rótulo "sem data" saiu: quando um saldo não tem data de referência, o campo fica neutro e discreto, em vez de sinalizar alerta.',
      },
    ],
  },
  {
    versao: '5.2.0',
    data: '2026-07-17T14:48',
    itens: [
      {
        tipo: 'novidade',
        texto:
          'Fluxo de Caixa reformulado (1ª onda do modelo da controladoria). O "realizado" passa a ser medido pela data em que o dinheiro DE FATO entrou ou saiu da conta (antes era pela data de baixa) — os valores da visão geral mudam de definição, é esperado, não é erro. A página foi reorganizada em duas partes: "Projetado" (saldo de caixa por conta, o que há a receber e a pagar nos próximos dias, calendário, projeção de liquidez das próximas 13 semanas e o horizonte de compromissos já lançados) e "Realizado" (entradas, saídas, resultado, margem do repasse e um ranking do que mais melhorou ou piorou o caixa no ano). A conferência contra o painel da controladoria bate ao centavo nos meses fechados.',
      },
      {
        tipo: 'melhoria',
        texto:
          'O saldo de cada conta agora guarda a data a que se refere e mostra há quanto tempo não é atualizado, para dar confiança na leitura de caixa. A tela de importação recebe as duas novas bases do fluxo de caixa; a área "Gerencial" saiu da página de Fluxo de Caixa (deixou de aparecer duplicada) e continua no seu próprio menu.',
      },
      {
        tipo: 'novidade',
        texto:
          'O Projetado ganhou um "Runway de Caixa": em quantos meses os recebíveis já lançados cobrem a saída média mensal, com faixa de confiança e um cenário considerando a antecipação de recebíveis. O horizonte de "a receber / a pagar / necessidade de caixa" virou ajustável (por dias, meses ou tudo o que está lançado). Criada também a nova aba "DRE", que começa com a composição dos lançamentos por categoria e será a base do demonstrativo por fluxo de caixa nas próximas ondas.',
      },
    ],
  },
  {
    versao: '5.1.11',
    data: '2026-07-15T21:16',
    itens: [
      {
        tipo: 'melhoria',
        texto:
          'O aviso de "Última atualização" nas telas de Metas (incluindo a exibição na TV) agora fica vermelho quando os dados param de chegar da integração com o Monde por mais de 45 minutos — assim dá para perceber na hora se a atualização automática parou, sem precisar conferir o horário.',
      },
    ],
  },
  {
    versao: '5.1.10',
    data: '2026-07-15T16:52',
    itens: [
      {
        tipo: 'correcao',
        texto:
          'Acabamento visual: a sombra dos cartões que ficam nas bordas das seções recolhíveis não é mais cortada ao abrir ou passar o mouse — o efeito agora fica uniforme em todas as telas.',
      },
    ],
  },
  {
    versao: '5.1.9',
    data: '2026-07-15T13:25',
    itens: [
      {
        tipo: 'melhoria',
        texto:
          'Ajustes visuais e de organização: a tela de Metas ganhou um botão "Modo de Comparação" (para quem administra as metas) e a comparação com o Monde passou a se atualizar sozinha; a lista de clientes do Faturamento ficou mais legível em telas menores; o menu lateral foi reordenado, com Metas em destaque acima do Financeiro; as telas administrativas passaram a exibir um selo "Administração" no canto superior direito; valores em Weddings adotaram o formato contábil; e as seções recolhíveis das telas ganharam uma animação suave de abrir e fechar.',
      },
    ],
  },
  {
    versao: '5.1.8',
    data: '2026-07-15T12:17',
    itens: [
      {
        tipo: 'melhoria',
        texto:
          'O "Última atualização" das Metas (e do Modo de Exibição/TV) passa a mostrar a hora da última sincronização automática com o Monde, avançando a cada ciclo — antes só mudava quando entrava venda nova, o que fazia a hora parecer "parada" em períodos sem movimento.',
      },
    ],
  },
  {
    versao: '5.1.7',
    data: '2026-07-15T11:18',
    itens: [
      {
        tipo: 'correcao',
        texto:
          'Correção que restabelece a atualização automática das vendas a partir do Monde: a sincronização periódica estava sendo barrada por uma camada de segurança do sistema e não se completava; com o ajuste, os dados de vendas voltam a ser atualizados sozinhos ao longo do dia — refletindo nas Metas e no Modo de Exibição (TV).',
      },
    ],
  },
  {
    versao: '5.1.6',
    data: '2026-07-15T10:49',
    itens: [
      {
        tipo: 'melhoria',
        texto:
          'A tela de Metas e o Modo de Exibição (TV) passam a se atualizar sozinhos: os números e a "Última atualização" avançam periodicamente sem precisar recarregar a página — a TV da sala comercial reflete o andamento das metas ao longo do dia sem ninguém intervir.',
      },
    ],
  },
  {
    versao: '5.1.5',
    data: '2026-07-15T10:40',
    itens: [
      {
        tipo: 'correcao',
        texto:
          'Nas Metas — inclusive no Modo de Exibição (TV) — a informação "Última atualização" passa a mostrar a data e a hora da última sincronização automática com o Monde, refletindo o quão recentes são os números que estão na tela (antes exibia a data do último envio manual de planilha, que podia ficar defasada).',
      },
    ],
  },
  {
    versao: '5.1.4',
    data: '2026-07-14T20:30',
    itens: [
      { tipo: 'melhoria', texto: 'A base de vendas passou a ser alimentada diretamente pela integração com o Monde (o ERP), no lugar da planilha importada à mão — dado mais completo e atualizado ao longo do dia. A metodologia é a MESMA: faturamento, receita e margem calculados igual, e as metas de 14% seguem valendo. Os meses já fechados continuam idênticos; os mais recentes ficam um pouco mais completos e atuais. A troca é reversível e a planilha manual permanece como reserva.' },
    ],
  },
  {
    versao: '5.1.3',
    data: '2026-07-14T19:50',
    itens: [
      { tipo: 'melhoria', texto: 'Melhorias internas no processo de desenvolvimento e na confiabilidade da plataforma: cada entrega passa por uma revisão independente do código e por verificações automáticas de qualidade antes de ir ao ar, reduzindo a chance de um erro chegar às telas. Sem mudança visível para quem usa.' },
    ],
  },
  {
    versao: '5.1.2',
    data: '2026-07-14T12:15',
    itens: [
      { tipo: 'novidade', texto: 'O Janus passou a ler as vendas diretamente do sistema do Monde e a mantê-las numa base paralela, atualizada sozinha ao longo do dia. Por ora isso alimenta apenas uma tela de conferência — as Metas e a Performance seguem exatamente como antes; a troca da fonte oficial virá numa etapa seguinte, só depois de validada.' },
      { tipo: 'novidade', texto: 'Nova tela interna de comparação (dentro de Metas): mostra, mês a mês, o faturamento, a receita e o número de vendas da base atual (planilha) lado a lado com o que veio do Monde, para conferir as diferenças antes de qualquer mudança. É só leitura.' },
    ],
  },
  {
    versao: '5.1.1',
    data: '2026-07-14T10:15',
    itens: [
      { tipo: 'correcao', texto: 'A janela de Nova Solicitação voltou a rolar corretamente — o formulário estava transbordando para fora da janela em pedidos com muitos campos. Ela também passou a ter tamanho fixo, sem mudar de altura conforme o tipo escolhido.' },
      { tipo: 'melhoria', texto: 'Nas Solicitações, cada coluna do painel agora rola separadamente, com o título sempre visível — listas longas não empurram mais as demais colunas. Um pequeno "?" ao lado da Data limite explica o prazo padrão de 3 dias.' },
      { tipo: 'melhoria', texto: 'No Acervo de Documentos, os botões de baixar e excluir ganharam um respiro da barra de rolagem, evitando cliques acidentais.' },
      { tipo: 'melhoria', texto: 'Todas as telas passaram a usar a largura total da página — o conteúdo, que antes ficava centralizado com muito espaço vazio nas laterais, agora aproveita todo o espaço disponível.' },
      { tipo: 'melhoria', texto: 'Na Nova Solicitação, o destinatário ficou mais claro: o subtítulo explica que o pedido pode ir para um usuário ou para um grupo de usuários, e a opção antes chamada «Permissão» passou a se chamar «Grupo».' },
      { tipo: 'correcao', texto: 'Nas colunas de Solicitações, a borda de destaque do primeiro card ao passar o mouse não é mais cortada e a barra de rolagem ganhou um respiro das laterais dos cards.' },
      { tipo: 'melhoria', texto: 'As telas ganharam mais respiro entre o conteúdo e o menu lateral — o conteúdo não fica mais colado na barra da esquerda.' },
      { tipo: 'melhoria', texto: 'O painel de Solicitações passou a ocupar toda a altura da tela: as colunas ficam mais altas e mostram mais pedidos antes de precisar rolar, sem aquele espaço vazio embaixo.' },
    ],
  },
  {
    versao: '5.1.0',
    data: '2026-07-13T16:31',
    itens: [
      { tipo: 'novidade', texto: 'As metas do comercial agora podem ficar na TV da sala. Uma nova tela em modo apresentação mostra, em tela cheia e sem distrações, quanto Trips, Weddings, Corporativo e o Grupo já faturaram frente à meta do mês — com o mesmo indicador de ritmo (verde/amarelo/vermelho) do Acompanhamento. Abre pelo botão "Modo de Exibição" no topo do Acompanhamento e se atualiza sozinha ao longo do dia.' },
    ],
  },
  {
    versao: '5.0.1',
    data: '2026-07-13T14:01',
    itens: [
      { tipo: 'novidade', texto: 'Quando alguém pede acesso à plataforma pela tela de entrada, os responsáveis por Usuários & Acessos agora recebem um e-mail avisando, com os dados de quem solicitou e um atalho para aprovar ou recusar. Antes, o pedido só aparecia dentro da plataforma e podia passar despercebido. O aviso é enviado uma única vez por pedido novo.' },
    ],
  },
  {
    versao: '5.0.0',
    data: '2026-07-08T16:24',
    itens: [
      { tipo: 'novidade', texto: 'As metas comerciais de faturamento por setor entram na plataforma. Uma nova tela de Acompanhamento mostra, em tempo real, quanto Trips, Weddings, Corporativo e o Grupo já faturaram frente à meta do período — com o "ritmo" em relação ao esperado até a data e a comparação com o mesmo período do ano anterior. Uma tela de Cadastro permite definir as metas mês a mês. Substitui o painel de metas provisório.' },
    ],
  },
  {
    versao: '4.40.1',
    data: '2026-07-08T10:19',
    itens: [
      { tipo: 'melhoria', texto: 'A tela de boas-vindas do Janus ganhou o título na tipografia oficial da marca, alinhada ao restante da identidade visual.' },
    ],
  },
  {
    versao: '4.40.0',
    data: '2026-07-08T09:30',
    itens: [
      { tipo: 'novidade', texto: 'A plataforma ganha a identidade Janus — novo nome e novo logotipo (o deus de duas faces: uma olha os dados do passado, a outra as projeções à frente), criados pelo time Financeiro para a plataforma que reúne performance, faturamento e fluxo de caixa. A marca aparece na barra lateral, nos cabeçalhos, no título da aba do navegador e nos comunicados internos, sempre acompanhada da assinatura Welcome Group. Nada muda para o cliente externo: boletos, notas e e-mails de fatura continuam 100% com a marca Welcome.' },
      { tipo: 'novidade', texto: 'No primeiro acesso após a novidade, uma tela de boas-vindas apresenta o Janus a cada usuário — aparece uma única vez, em qualquer dispositivo.' },
      { tipo: 'melhoria', texto: 'O histórico de versões (aberto pelo número de versão na barra lateral) ficou mais organizado: as versões mais antigas se agrupam automaticamente, mantendo o histórico completo acessível sem uma lista interminável.' },
    ],
  },
  {
    versao: '4.39.0',
    data: '2026-07-07T14:50',
    itens: [
      { tipo: 'melhoria', texto: 'A plataforma responde imediatamente ao navegar. Antes, ao abrir uma tela, ela parecia travada até tudo carregar; agora aparece na hora um esqueleto da página (cabeçalho, filtros, cards e tabela em cinza) e o conteúdo real entra por cima assim que fica pronto — a barra lateral permanece sempre no lugar. Trocar o período ou o setor nos filtros também passa a mostrar que o clique foi registrado, em vez de parecer que nada aconteceu.' },
      { tipo: 'melhoria', texto: 'Telas mais leves e rápidas para começar a usar: o contador de solicitações da barra lateral deixou de atrasar a abertura de qualquer página (ele aparece sozinho, logo depois), o Fluxo de Caixa busca seus dados de uma vez só (antes eram duas etapas em sequência), e recursos pesados — como os gráficos de detalhe e a exportação para Excel — só são carregados quando você realmente os usa, deixando o carregamento inicial mais enxuto.' },
    ],
  },
  {
    versao: '4.38.0',
    data: '2026-07-06T19:21',
    itens: [
      { tipo: 'melhoria', texto: 'O Faturamento Corporativo ganhou uma revisão de interface. O resultado de cada emissão deixa de ficar espalhado na tela e passa a abrir em um painel próprio: um para os boletos (com pessoa, valor e os percentuais de juros e multa efetivamente aplicados a cada um) e outro para as notas fiscais (com o status e a opção de atualizá-lo ali mesmo). Os botões de ação passam a ter dois momentos — "Emitir" antes e "Ver resultado" depois — sem mudar de tamanho.' },
      { tipo: 'melhoria', texto: 'A tela agora lembra o que já foi feito: ao recarregar a página ou subir a planilha de novo, ela consulta o sistema e mostra o que já foi emitido e enviado, sem reemitir nada. Notas emitidas antes voltam a permitir a atualização de status mesmo depois de recarregar.' },
      { tipo: 'melhoria', texto: 'A tela de revisão de envio de e-mails ficou mais clara: o status de cada fatura vira uma mensagem direta em cores (Pronto, Sem destinatário, Nota fiscal pendente, Já enviado), os anexos viram atalhos clicáveis para abrir o boleto e a nota, e uma coluna de seleção deixa marcar exatamente o que enviar — inclusive optar por mandar só o boleto quando a nota ainda não saiu, ou reenviar uma fatura já enviada. O total de selecionados aparece junto ao botão de envio.' },
      { tipo: 'correcao', texto: 'Notas fiscais que a prefeitura recusa agora aparecem claramente como "falhou", com o motivo, em vez de ficarem indicando "processando" indefinidamente. As que estão de fato em andamento continuam sinalizadas como tal, e uma nota que se autoriza numa atualização de status passa a aparecer como autorizada.' },
      { tipo: 'novidade', texto: 'Na revisão de envio de e-mails, agora é possível anexar documentos adicionais a cada fatura, além do boleto e da nota fiscal — útil quando o cliente pede um comprovante ou documento extra junto.' },
      { tipo: 'melhoria', texto: 'Outros acertos de apresentação no Faturamento: dicas de ajuda ("?") nos títulos das colunas, botão de atualizar status das notas sempre à mão, valores em formato contábil, nomes de clientes que não quebram linha e painéis com tamanho estável (não "saltam" conforme o número de linhas).' },
      { tipo: 'melhoria', texto: 'No Acervo de Documentos, o título e a busca agora ficam fixos no topo e só a lista de documentos rola — mais fácil pesquisar em acervos grandes. O download passa a ser só pelo botão de download (a linha inteira não é mais clicável, evitando downloads acidentais).' },
      { tipo: 'melhoria', texto: 'As telas de importação de planilhas (Upload de Arquivos e Calculadora de Rateio) passam a usar a largura cheia da tela, padronizadas com o Faturamento Corporativo. No Upload de Arquivos, um botão sem função ("Selecione um arquivo para importar") foi removido.' },
    ],
  },
  {
    versao: '4.37.2',
    data: '2026-07-06T17:13',
    itens: [
      { tipo: 'correcao', texto: 'Ajuste visual no editor de tipos de Solicitação: o seletor do aviso de data ("a mais de / a menos de") agora cabe corretamente na janela, sem cortar o campo de dias.' },
      { tipo: 'melhoria', texto: 'Descrições revisadas: o Acervo de Documentos ("Biblioteca de documentos, modelos, manuais e referências") e o Faturamento Corporativo ("Emita boletos e notas fiscais, dispare e-mails e gerencie o cadastro dos clientes corporativos") passam a descrever melhor o que cada tela faz.' },
    ],
  },
  {
    versao: '4.37.1',
    data: '2026-07-06T16:49',
    itens: [
      { tipo: 'melhoria', texto: 'No cadastro de tipos de Solicitação, o aviso do campo de data agora tem direção: dá para escolher avisar quando a data está longe demais ("a mais de" X dias) ou perto demais ("a menos de" X dias, prazo curto). Antes só avisava quando estava muito no futuro. Os tipos já existentes continuam exatamente como estavam.' },
    ],
  },
  {
    versao: '4.37.0',
    data: '2026-07-06T13:25',
    itens: [
      { tipo: 'melhoria', texto: 'Ao emitir boletos, o sistema passa a aplicar os percentuais de juros e multa definidos por cliente no Cadastro de Clientes. Quem não tiver um valor definido segue com o padrão de 2%. Antes, todos os boletos saíam com 2% fixo.' },
      { tipo: 'correcao', texto: 'Ao emitir notas fiscais, quando o cliente não tem e-mail no sistema de cobrança, o sistema agora aproveita o e-mail cadastrado no Cadastro de Clientes — resolvendo notas que antes eram recusadas por "e-mail do cliente incompleto". O e-mail só completa quando falta; nunca substitui um já existente.' },
    ],
  },
  {
    versao: '4.36.0',
    data: '2026-07-03T19:03',
    itens: [
      { tipo: 'novidade', texto: 'O envio dos e-mails de fatura agora tem uma tela de revisão em lote: dá para conferir e ajustar os destinatários de cada fatura (só para aquele envio), ver de relance o que está pronto e o que precisa de atenção, e disparar todos de uma vez com acompanhamento do progresso. Também é possível reenviar uma fatura ou enviar só o boleto quando a nota ainda não saiu.' },
      { tipo: 'novidade', texto: 'Com isso o Faturamento Corporativo fica completo — da planilha ao e-mail ao cliente. O envio continua em MODO TESTE (tudo vai para a caixa de teste, nunca para o cliente); a virada para o envio real é uma decisão consciente, protegida por dupla confirmação, a ser feita junto com a ativação da cobrança.' },
    ],
  },
  {
    versao: '4.35.0',
    data: '2026-07-03T13:38',
    itens: [
      { tipo: 'novidade', texto: 'O Faturamento Corporativo agora envia, por e-mail, a fatura ao cliente com o boleto — e a nota fiscal, quando autorizada — já anexados, direto da tela de Emissão (uma fatura por vez). É a preparação do envio que fecha o ciclo do faturamento na plataforma.' },
      { tipo: 'novidade', texto: 'Como um e-mail enviado não volta atrás, esta etapa roda em MODO TESTE: todos os e-mails vão para uma caixa de teste (nunca para o cliente), com o destinatário real indicado no assunto — para validar o conteúdo e os anexos com segurança. O envio de verdade será liberado na próxima etapa, com confirmação reforçada.' },
    ],
  },
  {
    versao: '4.34.1',
    data: '2026-07-02T15:44',
    itens: [
      { tipo: 'correcao', texto: 'Correção visual nas tabelas do Cadastro de Clientes (Faturamento) e da Base de Dados do Fluxo de Caixa Gerencial: ao rolar a lista, o cabeçalho fixo agora fica sólido, sem deixar linhas “vazarem” por trás dele; as duas tabelas também ganharam um cartão de fundo branco, destacando-as do fundo da página.' },
      { tipo: 'melhoria', texto: 'Refinos nas mesmas tabelas: o cabeçalho ganhou um tom próprio, cantos arredondados e uma sombra sutil ao rolar; a barra de rolagem lateral foi eliminada (as colunas se ajustam à tela, com os textos longos abreviados com “…” — o conteúdo completo aparece ao passar o mouse ou ao editar); e o Faturamento Corporativo ficou mais largo (as duas abas com a mesma largura, sem salto ao alternar entre Emissão e Cadastro), aproveitando o espaço lateral da tela para as colunas respirarem.' },
      { tipo: 'melhoria', texto: 'O selo de ambiente do Faturamento Corporativo agora fica âmbar quando você está no ambiente de testes (destacando que nada é real) e volta ao neutro em produção — a confirmação obrigatória antes de emitir de verdade continua a mesma.' },
    ],
  },
  {
    versao: '4.34.0',
    data: '2026-07-01T23:05',
    itens: [
      { tipo: 'novidade', texto: 'Novo Acervo de Documentos na área Financeiro: uma biblioteca organizada de A a Z onde a equipe encontra modelos, manuais e documentos de referência, com busca por título, descrição ou nome do arquivo.' },
      { tipo: 'novidade', texto: 'O acesso ao Acervo tem dois níveis de permissão — visualizar a biblioteca e adicionar/excluir documentos (com confirmação antes de excluir) — concedidos individualmente na tela de Usuários e Acessos, para que cada pessoa tenha só o acesso necessário.' },
    ],
  },
  {
    versao: '4.33.2',
    data: '2026-07-02T09:41',
    itens: [
      { tipo: 'melhoria', texto: 'Padronização visual das tabelas em toda a plataforma: os cabeçalhos de coluna passam a ter o mesmo estilo (sem caixa alta e mais leves), deixando as telas mais uniformes e fáceis de ler.' },
      { tipo: 'melhoria', texto: 'No Faturamento Corporativo, os botões de emitir ficaram alinhados à direita junto do resumo e a tabela de revisão não tem mais barra de rolagem lateral. Nas tabelas maiores (Cadastro de Clientes e Base de Dados do Fluxo de Caixa Gerencial), a rolagem agora é interna à tabela, mantendo o cabeçalho sempre visível.' },
      { tipo: 'melhoria', texto: 'Na tela de Usuários e Acessos, os nomes das permissões ficaram mais curtos e consistentes com o menu (“Performance/Trips”, “Gerencial”).' },
    ],
  },
  {
    versao: '4.33.1',
    data: '2026-07-01T18:52',
    itens: [
      { tipo: 'melhoria', texto: 'A tela de emissão do Faturamento Corporativo ficou mais clara e fácil de ler. Agora a ordem segue o fluxo natural (importar → revisar → ver o resultado depois de emitir), o resultado de cada boleto e de cada nota aparece na sua própria coluna (o erro fica ao lado do que falhou), o valor da nota avulsa fica na mesma linha (sem a tabela “pulando”), e as faturas não identificadas de valor alto ganham destaque para não passarem despercebidas.' },
      { tipo: 'melhoria', texto: 'Ao emitir, o resumo do resultado ficou enxuto: contadores em destaque e os erros agrupados por motivo (ex.: “Endereço do cliente incompleto · 6 faturas”), cada um com um “Ver detalhes” que abre a lista das faturas afetadas. Nada mudou na forma de emitir — só a apresentação, agora toda em português.' },
      { tipo: 'melhoria', texto: 'Ajustes finos de usabilidade: na revisão, o boleto virou um seletor “Emitir / Não emitir” e a nota fiscal já vem marcada como “Normal” por padrão nas faturas prontas; os botões de emitir ficam lado a lado; e o botão de atualizar o status das notas foi para junto da própria coluna de notas. No Cadastro de Clientes, a tela abre já mostrando os clientes ativos.' },
    ],
  },
  {
    versao: '4.33.0',
    data: '2026-07-01T13:43',
    itens: [
      { tipo: 'novidade', texto: 'O Faturamento Corporativo agora tem uma aba de Cadastro de Clientes: os dados dos clientes corporativos (situação, dias de faturamento, regras, juros/multa e os e-mails de destino) passam a viver na plataforma, importados da planilha e editáveis na tela — a planilha paralela deixa de ser necessária. É mais um passo rumo a ter, na própria plataforma, a base central de clientes da empresa.' },
      { tipo: 'novidade', texto: 'A importação substitui os clientes vindos da planilha e preserva os que você cadastrou à mão; nomes duplicados são impedidos e avisados. Por ora o cadastro serve de referência (guarda e organiza as regras); aplicá-las automaticamente na emissão será um passo futuro. A parte de Emissão de boletos e notas continua funcionando exatamente como antes.' },
    ],
  },
  {
    versao: '4.32.0',
    data: '2026-07-01T10:11',
    itens: [
      { tipo: 'novidade', texto: 'O Faturamento Corporativo agora também emite notas fiscais (NFS-e), direto da tela de revisão, junto com os boletos. Por fatura, escolhe-se se a nota sai: Normal (mesmo valor do boleto), Avulsa (com um valor próprio, quando a nota precisa ser de valor diferente da cobrança) ou não emitir. Como a nota fiscal depende dos dados de endereço do cliente, a tela mostra claramente quais faturas estão prontas para nota. Assim como os boletos, tudo roda em ambiente de testes (sandbox) nesta etapa.' },
      { tipo: 'novidade', texto: 'A nota fiscal, por natureza, não fica pronta na hora — a prefeitura leva alguns minutos para autorizar. A plataforma acompanha isso: a nota aparece como “processando” e, com um clique em “Atualizar status”, mostra quando foi autorizada, com o número e um link para abrir a nota. Emitir duas vezes não duplica, e cada nota é independente — se uma falha, as demais seguem, e você vê exatamente o que aconteceu com cada uma.' },
    ],
  },
  {
    versao: '4.31.0',
    data: '2026-06-30T15:25',
    itens: [
      { tipo: 'novidade', texto: 'O Faturamento Corporativo agora emite boletos direto da plataforma. A partir da tela de revisão, marca-se as faturas prontas e, com uma confirmação, os boletos são gerados para os clientes — sem planilhas e scripts manuais. Nesta etapa tudo roda em ambiente de testes (sandbox), para validar com calma antes de ligar a emissão real; a tela mostra sempre, com destaque, em qual ambiente você está.' },
      { tipo: 'novidade', texto: 'Segurança em primeiro lugar para uma ação que mexe com dinheiro: emitir duas vezes a mesma planilha não gera boletos duplicados (o sistema reconhece o que já foi emitido e pula), se um boleto falha os demais seguem normalmente (e você vê exatamente quais falharam e por quê), e toda emissão fica registrada — quem emitiu, quando, em qual ambiente e com qual resultado.' },
    ],
  },
  {
    versao: '4.30.0',
    data: '2026-06-30T13:10',
    itens: [
      { tipo: 'novidade', texto: 'Primeiro passo do Faturamento Corporativo na plataforma: agora dá para importar a planilha de faturamento e ver, em uma tela de revisão, cada fatura já cruzada com o cadastro de clientes — quais estão prontas, quais estão com o cliente cadastrado mas faltando dados fiscais (CNPJ/endereço), e quais não foram encontradas. Por enquanto é só conferência: nada é emitido. A emissão dos boletos vem na próxima etapa, com toda a segurança.' },
    ],
  },
  {
    versao: '4.29.0',
    data: '2026-06-26T18:12',
    itens: [
      { tipo: 'novidade', texto: 'A plataforma passa a ter a Base de Pessoas: o cadastro de clientes (com dados fiscais como CNPJ, CPF, endereço e inscrições, vindos do Monde) agora pode ser importado na Atualização de Dados, como já acontece com as outras bases. É um passo preparatório importante para a automação do faturamento.' },
      { tipo: 'melhoria', texto: 'Todas as importações da Atualização de Dados agora avisam claramente quais colunas a planilha precisa ter — se faltar alguma, a mensagem é direta e aparece antes de processar, em vez de um erro técnico. Não muda o que cada importação aceita; só deixa a exigência explícita e mais amigável.' },
    ],
  },
  {
    versao: '4.28.0',
    data: '2026-06-24T17:47',
    itens: [
      { tipo: 'novidade', texto: 'Nova Calculadora de Rateio no Financeiro. Você importa a fatura de um fornecedor e o sistema distribui automaticamente o valor entre os setores (Corporativo, Trips e Weddings), a partir do número de cada venda na nossa base. Na hora, mostra quanto cabe a cada setor (em valor e em %), destacando separadamente o que não foi identificado — e a soma sempre fecha com o total da fatura. É só um cálculo de apoio: nada é gravado.' },
    ],
  },
  {
    versao: '4.27.4',
    data: '2026-06-25T13:30',
    itens: [
      { tipo: 'correcao', texto: 'O botão "Acessar a plataforma" dos e-mails de acesso (senha provisória e redefinição de senha) voltou a aparecer como um botão retangular de verdade no Outlook — antes saía como um texto com um fundo preto apertado. Agora fica igual ao botão dos e-mails de Solicitações.' },
    ],
  },
  {
    versao: '4.27.3',
    data: '2026-06-24T15:00',
    itens: [
      { tipo: 'melhoria', texto: 'O detalhamento do indicador principal de Weddings (o card que abre a análise ao clicar em "Ver mais") passou a abrir de forma mais ágil e responsiva ao clique. Não há mudança no que aparece — apenas mais fluidez na abertura.' },
    ],
  },
  {
    versao: '4.27.2',
    data: '2026-06-24T09:46',
    itens: [
      { tipo: 'melhoria', texto: 'Limpeza técnica interna do código de algumas telas (Weddings, Fluxo de Caixa e filtros de período), deixando-o mais alinhado às boas práticas atuais. Não há mudança no que aparece ou no comportamento das telas — é manutenção de qualidade nos bastidores.' },
    ],
  },
  {
    versao: '4.27.1',
    data: '2026-06-23T23:27',
    itens: [
      { tipo: 'melhoria', texto: 'Reforço de segurança no processo interno de atualização do banco de dados: mudanças que apagam ou reescrevem dados agora exigem sempre uma confirmação humana explícita e param automaticamente se forem disparadas sem essa confirmação, evitando qualquer alteração acidental. É um ganho de proteção nos bastidores — sem efeito visível no uso da plataforma.' },
    ],
  },
  {
    versao: '4.27.0',
    data: '2026-06-23T19:31',
    itens: [
      { tipo: 'melhoria', texto: 'Reforço de robustez na leitura dos valores importados das planilhas: a forma de interpretar números (inclusive os com separador de milhar e os valores negativos) passou a vir de um único método confiável, eliminando uma duplicação interna que, no futuro, poderia levar a divergências silenciosas. Nada muda no que aparece na tela e nenhum número já existente foi alterado.' },
      { tipo: 'melhoria', texto: 'Criamos também uma trava automática que impede a reintrodução desse tipo de erro de conversão daqui pra frente — no mesmo espírito das travas de padronização visual da versão anterior.' },
    ],
  },
  {
    versao: '4.26.0',
    data: '2026-06-23T14:58',
    itens: [
      { tipo: 'melhoria', texto: 'Padronização visual ampla da plataforma: cores, botões, campos e etiquetas passaram a seguir um padrão único (a identidade Welcome), corrigindo pequenas inconsistências que apareciam de uma tela para outra. Não muda nada no comportamento nem nos números — é consistência visual.' },
      { tipo: 'melhoria', texto: 'Criamos também mecanismos internos que mantêm essa consistência daqui pra frente: telas novas já nascem no padrão e desvios de cor são barrados automaticamente. É a base que prepara a plataforma para a próxima grande evolução (a visão Geral das três áreas).' },
    ],
  },
  {
    versao: '4.25.1',
    data: '2026-06-23T10:40',
    itens: [
      { tipo: 'melhoria', texto: 'O e-mail que avisa sobre as Solicitações ficou mais claro e fácil de ler: agora mostra o nome das pessoas (em vez do endereço de e-mail), a data e a hora do que aconteceu, e traz um botão de verdade para acessar a plataforma. Cada situação tem sua cor — criada (dourado), concluída (verde), rejeitada (vermelho) e cancelada (cinza) — e essas mesmas cores passam a valer também na tela de Movimentações das Solicitações, para tudo combinar.' },
      { tipo: 'melhoria', texto: 'Nas telas de Administração, a faixa do título no topo passou a encostar no limite superior da página, eliminando um espaço em branco estranho que havia acima dela.' },
    ],
  },
  {
    versao: '4.25.0',
    data: '2026-06-22T23:16',
    itens: [
      { tipo: 'novidade', texto: 'As Solicitações agora avisam por e-mail a cada movimentação: ao criar, concluir, rejeitar ou cancelar, todos os envolvidos (quem abriu e quem recebeu — ou todos os membros da permissão, quando a solicitação é atribuída a uma permissão) recebem um e-mail com o que aconteceu. A rejeição inclui a justificativa, e o e-mail traz um botão para acessar a plataforma.' },
      { tipo: 'melhoria', texto: 'O aviso por e-mail é um complemento seguro: se o e-mail falhar ou o servidor de e-mail estiver indisponível, a movimentação acontece normalmente — nada trava por causa do e-mail.' },
    ],
  },
  {
    versao: '4.24.2',
    data: '2026-06-22T18:51',
    itens: [
      { tipo: 'melhoria', texto: 'O e-mail de senha de acesso foi reformulado visualmente: logo do Welcome Group centralizado e sem fundo, o botão "Acessar a plataforma" agora aparece como botão de verdade (inclusive no Outlook), espaçamento e hierarquia mais limpos, e o layout se adapta a telas de celular.' },
    ],
  },
  {
    versao: '4.24.1',
    data: '2026-06-22T17:16',
    itens: [
      { tipo: 'melhoria', texto: 'O e-mail de senha de acesso agora traz o logo do Welcome Group no topo e um botão "Acessar a plataforma" que leva direto ao sistema.' },
      { tipo: 'melhoria', texto: 'Refinos visuais no Fluxo de Caixa Gerencial e nas telas de acesso: os valores positivos (verde) e negativos (vermelho) da projeção ficaram mais fáceis de distinguir, as barras de seção ganharam cantos mais arredondados, e os tons de verde (avisos de sucesso e o marcador de concluir) foram alinhados à identidade visual.' },
    ],
  },
  {
    versao: '4.24.0',
    data: '2026-06-22T13:58',
    itens: [
      { tipo: 'novidade', texto: 'Ao criar um usuário ou redefinir a senha de alguém em Acessos, o sistema agora envia a senha provisória por e-mail automaticamente para a pessoa — não é mais preciso repassá-la apenas à mão.' },
      { tipo: 'melhoria', texto: 'A senha provisória continua aparecendo na tela (copiável) em todos os casos: se o e-mail não puder ser enviado, um aviso indica isso e você repassa manualmente, como antes. O envio é um complemento e nunca impede criar ou redefinir o acesso.' },
    ],
  },
  {
    versao: '4.23.3',
    data: '2026-06-19T17:32',
    itens: [
      { tipo: 'melhoria', texto: 'Na janela de importação de lançamentos, quando o sistema detecta linhas duplicadas agora dá para abrir e ver exatamente quais são as linhas repetidas, em formato de lista — facilitando decidir se mantém ou não as duplicatas.' },
      { tipo: 'melhoria', texto: 'Pequenos acertos visuais na janela de importação: textos em negrito padronizados e os números dos grupos (a adicionar, a remover, etc.) com tamanho mais equilibrado.' },
      { tipo: 'melhoria', texto: 'Na base de dados do Fluxo de Caixa Gerencial, os filtros aplicados (de coluna e os botões de origem) agora permanecem ao alternar para a Visualização Agregada e voltar, sem precisar refazê-los.' },
    ],
  },
  {
    versao: '4.23.2',
    data: '2026-06-19T13:15',
    itens: [
      { tipo: 'melhoria', texto: 'No Fluxo de Caixa Gerencial, o box "Contas" agora pode ser recolhido (basta clicar na setinha ao lado do título), dando mais espaço para a projeção quando você não precisa ver os saldos.' },
      { tipo: 'correcao', texto: 'Corrigimos um pequeno "salto" do conteúdo para o lado que acontecia ao recolher/expandir as seções (no Gerencial, em Weddings e em outras telas). Agora a página fica firme no lugar.' },
      { tipo: 'correcao', texto: 'O seletor de período "Personalizado" (filtro de vencimento da base do Gerencial) não escapa mais das bordas da tela.' },
    ],
  },
  {
    versao: '4.23.1',
    data: '2026-06-18T16:42',
    itens: [
      { tipo: 'correcao', texto: 'Corrigimos um erro no Fluxo de Caixa Gerencial: os saldos das contas não mostravam os centavos e, ao editar, o valor podia ser corrompido (um saldo de R$ 105.993,35 chegava a virar R$ 10.599.335). Agora os saldos sempre exibem os centavos e a edição preserva o valor corretamente.' },
      { tipo: 'novidade', texto: 'A projeção diária ganhou uma linha "Saldo inicial" no topo, mostrando o saldo de abertura de cada conta antes dos lançamentos do período. As colunas de saldo passaram a indicar "(Final)" e a coluna de resultado virou "Resultado do Dia".' },
      { tipo: 'melhoria', texto: 'Na base de dados do Fluxo de Caixa Gerencial, a barra de filtros ficou mais limpa (os filtros de tipo e a busca por pessoa agora vivem nas próprias colunas), as etiquetas de tipo ganharam cor (A pagar em vermelho, A receber em verde), e o botão de exclusão alterna entre "Apagar selecionados" e "Apagar todos" — sendo que "Apagar todos" respeita o filtro de origem (Planilha/Manual) selecionado.' },
      { tipo: 'melhoria', texto: 'A janela de importação de lançamentos ficou mais clara: os valores não são mais cortados, as instruções aparecem desde o início, o aviso de linhas duplicadas só surge quando elas existem, e lançamentos criados manualmente já vêm destacados.' },
    ],
  },
  {
    versao: '4.23.0',
    data: '2026-06-18T14:34',
    itens: [
      { tipo: 'novidade', texto: 'A importação da planilha do Fluxo de Caixa Gerencial agora é individual: cada pessoa sincroniza apenas os lançamentos que ela mesma importou ou criou. Antes, quando duas pessoas importavam suas planilhas, uma acabava apagando os lançamentos da outra. Agora a planilha de cada um é intocável pela importação de outro.' },
      { tipo: 'novidade', texto: 'Os lançamentos passaram a mostrar quem os trouxe: uma nova coluna "Originador" identifica o responsável por cada linha (importada ou criada à mão), com filtro por nome. Lançamentos anteriores a esta versão aparecem sem responsável ("—").' },
      { tipo: 'novidade', texto: 'Antes de confirmar uma importação, dá para conferir tudo num preview navegável: os lançamentos a adicionar, atualizar, manter e remover ficam em listas que abrem e fecham. Os "a remover" já vêm abertos, e é possível proteger linha por linha — desmarcar uma linha evita removê-la desta vez.' },
      { tipo: 'melhoria', texto: 'A importação reconhece linhas idênticas de forma mais inteligente (ignora diferenças de espaço/maiúsculas) e oferece um interruptor "Manter duplicadas" para quem realmente precisa de lançamentos repetidos.' },
    ],
  },
  {
    versao: '4.22.4',
    data: '2026-06-18T09:41',
    itens: [
      { tipo: 'novidade', texto: 'Em "Gerenciar contas" (Fluxo de Caixa Gerencial), agora dá para reordenar as contas arrastando pelo ícone à esquerda de cada linha — a ordem escolhida passa a valer também para os cartões de saldo.' },
      { tipo: 'melhoria', texto: 'Ao adicionar uma conta nova, os botões de salvar e cancelar ficaram mais claros, abaixo da tabela, sem sobreposição.' },
    ],
  },
  {
    versao: '4.22.3',
    data: '2026-06-18T08:54',
    itens: [
      { tipo: 'melhoria', texto: 'No Fluxo de Caixa Gerencial, os selos dos cartões de conta foram reorganizados (Principal/Rendimento e Consolidado agora juntos, no rodapé do cartão) e ganharam cor: âmbar para a conta Principal e verde para a de Rendimento.' },
      { tipo: 'correcao', texto: 'Corrigimos as datas e horários exibidos neste histórico de versões — algumas entregas recentes apareciam com horário aproximado; agora refletem o horário real de publicação.' },
    ],
  },
  {
    versao: '4.22.2',
    data: '2026-06-18T08:36',
    itens: [
      { tipo: 'correcao', texto: 'Corrigimos o fuso horário em toda a plataforma: o "hoje" (e o "mês atual") agora seguem o horário de São Paulo. Antes, no fim da tarde/noite, alguns indicadores que dependem da data de hoje — como o calendário de liquidez, os próximos vencimentos e os recortes do mês corrente — adiantavam um dia. Agora batem com o calendário daqui.' },
    ],
  },
  {
    versao: '4.22.1',
    data: '2026-06-17T22:45',
    itens: [
      { tipo: 'melhoria', texto: 'No Fluxo de Caixa Gerencial, os cartões de saldo das contas ficaram mais organizados: o título e o botão de gerenciar contas agora ficam dentro do próprio quadro, e cada cartão mostra a etiqueta "Saldo" junto do valor.' },
      { tipo: 'novidade', texto: 'A projeção diária agora deixa escolher a partir de qual data começar (já vem em "hoje" automaticamente) e se a tabela mostra 15 ou 30 dias.' },
      { tipo: 'melhoria', texto: 'Todos os valores da projeção diária ficam coloridos pelo sinal — verde quando positivo, vermelho quando negativo — facilitando a leitura rápida da situação de caixa.' },
      { tipo: 'correcao', texto: 'A projeção diária agora começa corretamente no dia de hoje — antes, no fim da tarde, ela adiantava um dia por causa do fuso horário do servidor.' },
    ],
  },
  {
    versao: '4.22.0',
    data: '2026-06-17T21:45',
    itens: [
      { tipo: 'melhoria', texto: 'No Fluxo de Caixa Gerencial, os saldos iniciais das contas agora aparecem como cartões — dá para ajustar o saldo de cada conta direto ali; a configuração estrutural (limite, consolidado, papel) ficou num painel próprio em "Gerenciar contas".' },
      { tipo: 'melhoria', texto: 'As contas passaram a ser chamadas de "Principal" e "Rendimento", nomes mais claros do que os anteriores.' },
      { tipo: 'melhoria', texto: 'Os valores em dinheiro nas tabelas do gerencial ganharam formato contábil — "R$" à esquerda e o número alinhado à direita, com centavos — ficando mais fáceis de ler e de comparar entre as linhas.' },
      { tipo: 'melhoria', texto: 'Os saldos projetados agora têm a cor da faixa preenchendo a célula inteira (verde, amarelo ou vermelho), tornando imediato enxergar quando uma conta entra no vermelho.' },
      { tipo: 'melhoria', texto: 'A base de dados do gerencial ficou mais limpa e larga: colunas sem quebra de linha, filtros por coluna (pessoa, valor, conta, vencimento) e rolagem lateral em telas estreitas.' },
      { tipo: 'melhoria', texto: 'A conta de cada lançamento virou uma seleção padronizada (Itaú, Asaas, Blimboo e "Outras"), e a importação reconhece variações de escrita automaticamente — fim dos nomes de conta digitados de formas diferentes.' },
      { tipo: 'novidade', texto: 'Na base de dados do gerencial, agora é possível destacar um lançamento (ícone de lata de tinta), pintando a linha de amarelo — o destaque fica salvo e ajuda a marcar lançamentos importantes.' },
      { tipo: 'melhoria', texto: 'Os filtros da base de dados ficaram mais práticos: filtrar por tipo direto na coluna e escolher um período de vencimento pelo botão "Personalizado"; e os valores aparecem coloridos (vermelho para a pagar, verde para a receber).' },
    ],
  },
  {
    versao: '4.21.0',
    data: '2026-06-17T15:01',
    itens: [
      { tipo: 'novidade', texto: 'No Fluxo de Caixa Gerencial agora dá para gerenciar as contas: adicionar, remover, editar saldo inicial e limite de crédito de cada uma, e escolher quais entram no saldo consolidado.' },
      { tipo: 'novidade', texto: 'A visão agregada passou a ler dessas contas configuráveis — o saldo consolidado e as colunas se ajustam automaticamente às contas e papéis que você definir, sem depender de nomes fixos.' },
      { tipo: 'melhoria', texto: 'Os saldos projetados agora aparecem coloridos por faixa: verde (positivo), amarelo (dentro do limite de crédito) e vermelho (abaixo do limite) — fica imediato ver quando uma conta entra no vermelho.' },
      { tipo: 'melhoria', texto: 'Na base de dados do gerencial, é possível selecionar várias linhas e apagá-las de uma vez (com aviso quando as linhas vêm da planilha importada).' },
    ],
  },
  {
    versao: '4.20.2',
    data: '2026-06-16T12:07',
    itens: [
      { tipo: 'melhoria', texto: 'A importação de planilhas ficou mais fluida: a tela não trava mais (aquele "a página não está respondendo" sumiu) e agora mostra uma barra com o progresso do envio.' },
    ],
  },
  {
    versao: '4.20.1',
    data: '2026-06-16T12:03',
    itens: [
      { tipo: 'correcao', texto: 'A importação de "Vendas por Produto", que vinha falhando (a tela travava e dava erro de tempo esgotado), voltou a funcionar normalmente.' },
      { tipo: 'correcao', texto: 'Na tela de Atualização de Dados, a "última atualização" (data e hora da última importação) agora aparece corretamente em todas as bases — antes só Vendas mostrava.' },
    ],
  },
  {
    versao: '4.20.0',
    data: '2026-06-16T08:35',
    itens: [
      { tipo: 'novidade', texto: 'Cada solicitação agora tem um número de referência, mostrado na caixa de entrada, em "Minhas solicitações" e no detalhe — para identificar e conversar sobre um pedido específico com clareza.' },
      { tipo: 'melhoria', texto: 'A visão de "Movimentações" (auditoria) ficou mais fácil de usar: ganhou um campo de busca e ordenação por coluna, e agora é possível clicar em qualquer linha para abrir o detalhe completo da solicitação — inclusive a justificativa de uma rejeição.' },
      { tipo: 'novidade', texto: 'A área de Solicitações agora tem duas permissões separadas: uma básica (abrir pedidos, ver a caixa de entrada e as próprias solicitações) e uma de gestão (que inclui a básica e mais a supervisão — ver todas as solicitações, gerenciar os tipos e auditar as movimentações). Isso permite controlar com precisão quem apenas usa e quem também supervisiona.' },
    ],
  },
  {
    versao: '4.19.1',
    data: '2026-06-15T16:34',
    itens: [
      { tipo: 'novidade', texto: 'Na página de Solicitações, os gestores ganharam uma visão de "Movimentações": uma lista única que mostra quem abriu, concluiu, rejeitou ou cancelou cada solicitação e quando — para acompanhar e auditar o que foi feito.' },
    ],
  },
  {
    versao: '4.19.0',
    data: '2026-06-14T22:37',
    itens: [
      { tipo: 'novidade', texto: 'Ao montar um tipo de solicitação, os campos de data agora podem exigir uma data válida: dá para impedir que o solicitante escolha uma data já passada e avisá-lo quando a data estiver muito longe no futuro.' },
      { tipo: 'melhoria', texto: 'A tela de detalhe de uma solicitação ficou mais clara e organizada — informações principais, dados do pedido e anexos em blocos bem separados, com data e hora no horário de Brasília.' },
      { tipo: 'melhoria', texto: 'Na administração de tipos de solicitação, as ações da lista ficaram mais enxutas (ícones) e a exclusão de um tipo que já tem pedidos fica claramente bloqueada, evitando erro depois do clique.' },
      { tipo: 'novidade', texto: 'Na análise de Weddings, o filtro por operação passou a permitir selecionar várias operações ao mesmo tempo — os gráficos de fluxo de caixa passam a mostrar o total somado das operações escolhidas.' },
    ],
  },
  {
    versao: '4.18.0',
    data: '2026-06-14T19:15',
    itens: [
      { tipo: 'melhoria', texto: 'A administração de usuários ficou mais clara: o status de cada pessoa aparece em destaque (Ativo/Pendente), passou a ser possível editar o nome de um usuário, e o último acesso agora mostra data e hora.' },
      { tipo: 'melhoria', texto: 'O acompanhamento de solicitações foi reorganizado: a Caixa de entrada agrupa os pedidos por tipo (com filtro Abertas/Concluídas), e Minhas solicitações organiza por situação (Abertas/Concluídas/Rejeitadas). Pedidos cancelados ficam preservados e identificados.' },
      { tipo: 'novidade', texto: 'O histórico passou a registrar quem concluiu/decidiu cada pedido e quando — base para relatórios futuros de solicitações. Administradores ganharam uma visão de supervisão ("Ver todas") para acompanhar tudo.' },
    ],
  },
  {
    versao: '4.17.1',
    data: '2026-06-14T11:32',
    itens: [
      { tipo: 'melhoria', texto: 'Limpeza técnica interna: remoção de rotas e código em desuso da importação de Vendas e da administração de acessos, agora que o novo fluxo de importação foi confirmado em uso real. Nenhuma mudança visível nas telas.' },
    ],
  },
  {
    versao: '4.17.0',
    data: '2026-06-13T15:49',
    itens: [
      { tipo: 'melhoria', texto: 'Reforços internos de segurança e de confiabilidade dos dados financeiros, sem mudança visível nas telas: o acesso de leitura passou a exigir login em todos os pontos, a importação de Vendas ficou mais robusta (sem cruzar duas cargas simultâneas, sem cortar linhas no export e avisando se a planilha vier degradada), os valores monetários e datas são interpretados de forma única e correta, e os anexos das solicitações passaram a ser arquivados de forma definitiva.' },
    ],
  },
  {
    versao: '4.16.2',
    data: '2026-06-13T11:24',
    itens: [
      { tipo: 'melhoria', texto: 'Reforços de segurança e robustez nos bastidores: atualização da base tecnológica para corrigir vulnerabilidades conhecidas e uma proteção a mais na importação de Vendas, que agora bloqueia o carregamento se algum setor/subsetor vier fora do padrão — evitando que vendas sumam dos relatórios sem aviso.' },
      { tipo: 'melhoria', texto: 'O menu lateral agora rola suavemente quando há muitas abas (com barra discreta que aparece só ao usar) e os grupos Performance e Financeiro abrem recolhidos, deixando a navegação mais limpa.' },
    ],
  },
  {
    versao: '4.16.1',
    data: '2026-06-13T09:40',
    itens: [
      { tipo: 'melhoria', texto: 'Padronização visual e de usabilidade das telas internas (Solicitações, Usuários e Acessos, Design System): aparência mais consistente entre as telas, mais respiro no topo das páginas, e melhor leitura em telas menores.' },
      { tipo: 'melhoria', texto: 'Confirmações e mensagens mais claras: ações que apagam algo passaram a pedir confirmação numa janela padrão (em vez do aviso simples do navegador), e os avisos de erro/sucesso ficaram uniformes.' },
      { tipo: 'correcao', texto: 'Correção de um detalhe técnico que fazia algumas cores de texto não serem aplicadas, deixando telas com aparência desalinhada.' },
    ],
  },
  {
    versao: '4.16.0',
    data: '2026-06-12T17:29',
    itens: [
      { tipo: 'novidade', texto: 'A plataforma passou a receber solicitações internas ao financeiro — como lançamentos de contas a pagar e pagamentos de emergência — com formulário próprio por tipo de pedido, anexos e acompanhamento de status, substituindo gradualmente o formulário externo e o Planner.' },
      { tipo: 'novidade', texto: 'Qualquer pessoa abre uma solicitação e escolhe o destinatário (uma pessoa ou um setor/permissão); quem recebe acompanha tudo numa caixa de entrada organizada por tipo, conclui ou rejeita (com justificativa), e o solicitante pode cancelar. Um aviso na barra lateral mostra quantos pedidos estão pendentes para você.' },
      { tipo: 'novidade', texto: 'O administrador cria e ajusta os tipos de solicitação e seus campos (texto, valor, data, lista de opções, anexo), sem precisar de desenvolvimento.' },
    ],
  },
  {
    versao: '4.15.0',
    data: '2026-06-12T11:02',
    itens: [
      { tipo: 'melhoria', texto: 'O carregamento de planilhas de Vendas passou a validar o arquivo inteiro antes de gravar: cargas com erro não entram pela metade nem deixam os painéis vazios — ou tudo entra, ou nada muda e o sistema avisa o problema.' },
    ],
  },
  {
    versao: '4.14.3',
    data: '2026-06-12T09:57',
    itens: [
      { tipo: 'melhoria', texto: 'A documentação interna do padrão visual da plataforma foi atualizada e ampliada — referência de desenvolvimento mais completa e fiel ao que está no ar.' },
    ],
  },
  {
    versao: '4.14.2',
    data: '2026-06-11T17:24',
    itens: [
      { tipo: 'melhoria', texto: 'Nomenclatura mais clara na administração: "Usuários e Acessos" e a aba "Permissões" (antes "Roles").' },
      { tipo: 'melhoria', texto: 'Botões da área de administração padronizados, com a mesma aparência dos filtros do Financeiro — visual mais consistente.' },
    ],
  },
  {
    versao: '4.14.1',
    data: '2026-06-11T13:38',
    itens: [
      { tipo: 'melhoria', texto: 'As telas de acesso e administração (entrada, troca de senha, solicitação de acesso e gestão de usuários) ganharam a identidade visual do Welcome Group e ficaram mais limpas e simples de usar.' },
      { tipo: 'melhoria', texto: 'Na tela de entrada, o pedido de acesso e a orientação de "esqueci a senha" ficaram mais claros e organizados.' },
      { tipo: 'melhoria', texto: 'Na gestão de usuários, excluir alguém agora pede uma confirmação e encerra o acesso da pessoa na hora — evitando exclusões acidentais.' },
    ],
  },
  {
    versao: '4.14.0',
    data: '2026-06-11T09:31',
    itens: [
      { tipo: 'novidade', texto: 'Login mais simples: agora a entrada é com e-mail e senha (não é mais preciso abrir o e-mail e clicar num link a cada acesso).' },
      { tipo: 'novidade', texto: 'O administrador cria usuários com uma senha provisória mostrada na hora (para repassar à pessoa), e cada um define a própria senha no primeiro acesso. O administrador também pode redefinir a senha de alguém que esqueceu.' },
      { tipo: 'novidade', texto: 'Quem ainda não tem conta pode pedir acesso pela própria tela de entrada ("Ainda não tenho uma conta"); o time Financeiro recebe a solicitação e aprova ou recusa numa nova tela de Solicitações.' },
    ],
  },
  {
    versao: '4.13.1',
    data: '2026-06-10T17:38',
    itens: [
      { tipo: 'correcao', texto: 'Convites de acesso confiáveis: corrigido o caso em que o link de acesso chegava "inválido" ao ser aberto. O link agora vale 24 horas e só é consumido quando a pessoa clica em "Entrar" — não mais ao ser pré-visualizado pelo WhatsApp ou e-mail.' },
      { tipo: 'novidade', texto: 'Na tela de Usuários & Acessos, cada pessoa agora tem um botão para gerar e copiar um novo link de acesso na hora (útil quando o convite anterior expirou), e a opção de excluir um usuário em definitivo — além de apenas desativar.' },
    ],
  },
  {
    versao: '4.13.0',
    data: '2026-06-10T16:34',
    itens: [
      { tipo: 'novidade', texto: 'O WT Finance agora pede login: o acesso deixa de ser por link aberto e passa a exigir entrada por e-mail (um link de acesso enviado a cada pessoa), com cadastro somente por convite. Fecha a porta para qualquer pessoa com o endereço do site abrir os dados da empresa.' },
      { tipo: 'novidade', texto: 'Controle de acessos por perfil: é possível criar perfis com permissões sob medida — por área do sistema e, em Performance, por setor (Trips, Weddings, Corporativo) — e definir o que cada pessoa enxerga. Uma nova tela de Usuários & Acessos permite convidar pessoas, atribuir perfis e ativar/desativar contas.' },
      { tipo: 'melhoria', texto: 'Proteção dos dados em todas as camadas: cada tela, relatório e informação só é entregue a quem tem permissão — inclusive as rotas administrativas de importação, que antes não exigiam identificação.' },
    ],
  },
  {
    versao: '4.12.1',
    data: '2026-06-09T23:09',
    itens: [
      { tipo: 'correcao', texto: 'Reforços internos na importação de planilhas de Vendas: a leitura das colunas ficou mais tolerante a variações de cabeçalho (acentos, maiúsculas) e passou a preencher de forma consistente o vínculo de cada operação — evitando que uma reimportação volte a zerar convidados ou apagar datas de eventos.' },
      { tipo: 'melhoria', texto: 'Verificação automática ampliada sobre os principais indicadores e listas: se a forma de um dado vindo da base divergir do esperado, a tela passa a sinalizar em vez de exibir um número silenciosamente errado.' },
    ],
  },
  {
    versao: '4.12.0',
    data: '2026-06-09T19:17',
    itens: [
      { tipo: 'correcao', texto: 'Atualização de dados mais segura: se uma carga de Vendas falhar (ex.: planilha com datas fora do calendário), a base anterior é totalmente preservada — antes uma falha podia deixar os números zerados até a carga seguinte.' },
      { tipo: 'melhoria', texto: 'Ranking de Top Vendedores mais rápido (uma única consulta ao banco no lugar de várias).' },
      { tipo: 'melhoria', texto: 'Nova rede de testes automáticos que protege os cálculos (margem, períodos, formatação) e os principais relatórios contra erros introduzidos em mudanças futuras.' },
      { tipo: 'correcao', texto: 'Mais confiabilidade no que aparece na tela: datas de eventos sem desvio de um dia e, quando um dado não carrega, a tela avisa claramente em vez de parecer "sem dados".' },
    ],
  },
  {
    versao: '4.11.0',
    data: '2026-06-07T16:39',
    itens: [
      { tipo: 'novidade', texto: 'Novo histórico de versões: clicando no número da versão (rodapé da barra lateral) abre-se um resumo das melhorias da plataforma em linguagem de negócio — um canal de acompanhamento da evolução para a diretoria.' },
      { tipo: 'melhoria', texto: 'Padronização visual das tabelas-resumo (Próximos Casamentos, Mix por Produto, Top Vendedores, Vendas em Aberto e Receita Negativa) nas três áreas, para leitura mais consistente entre as abas.' },
    ],
  },
  {
    versao: '4.10.1',
    data: '2026-06-05T15:13',
    itens: [
      { tipo: 'melhoria', texto: 'As abas Trips e Corporativo passam a ter o mesmo visual de Weddings: um único cartão de indicadores principais (Faturamento, Receita Bruta e Margem) clicável, reunido numa seção "Visão Geral", no lugar dos indicadores soltos.' },
      { tipo: 'novidade', texto: 'Trips e Corporativo agora exibem o cartão de "Vendas com Receita Negativa" (vendas que entraram com receita abaixo de zero), útil para sinalizar lançamentos a investigar.' },
      { tipo: 'melhoria', texto: 'Filtros de período padronizados e alinhados à esquerda; o selo de "vendas em aberto" passa a usar a cor da própria aba.' },
    ],
  },
  {
    versao: '4.10.0',
    data: '2026-06-05T09:46',
    itens: [
      { tipo: 'novidade', texto: 'Abas Trips (lazer) e Corporativo entram no ar, com a mesma visão de indicadores de Weddings: faturamento, receita e margem, com detalhamento ao clicar.' },
      { tipo: 'novidade', texto: 'Trips e Corporativo ganham ranking de Top Vendedores (faturamento e receita por vendedor no período) e o cartão de Vendas em Aberto por área.' },
      { tipo: 'melhoria', texto: 'Padronização do sistema de cores de toda a plataforma: cada cor passa a ter um significado consistente entre telas (por exemplo, margem sempre na mesma cor).' },
    ],
  },
  {
    versao: '4.9.2',
    data: '2026-06-04T16:55',
    itens: [
      { tipo: 'correcao', texto: 'Corrigida uma contaminação de dados que inflava o faturamento, a receita e o hotel de algumas operações de Weddings — o sistema cruzava informações de casamentos diferentes. Agora cada operação usa apenas os seus próprios dados de venda.' },
      { tipo: 'correcao', texto: 'Das operações de Weddings, a grande maioria permanece idêntica; apenas as poucas contaminadas mudam, e o total da área ajusta de R$ 44,38 Mi para R$ 44,14 Mi (remoção de duplas contagens). Nenhuma operação ficou subcontada.' },
    ],
  },
  {
    versao: '4.9.1',
    data: '2026-06-04T15:22',
    itens: [
      { tipo: 'correcao', texto: 'Corrigida a leitura da coluna "Operação Própria" na importação de Vendas, que vinha sendo descartada por uma diferença de acentuação no arquivo do ERP. A leitura agora tolera variações de acento e maiúsculas, e avisa quando uma coluna não é reconhecida.' },
      { tipo: 'correcao', texto: 'Três casamentos apareciam no ano errado na Carteira por usarem a data de outro contrato de nome parecido. Agora a data do evento vem sempre do contrato correto.' },
    ],
  },
  {
    versao: '4.9.0',
    data: '2026-06-03T17:14',
    itens: [
      { tipo: 'correcao', texto: 'A Carteira deixou de "adivinhar" o ano do evento a partir do nome da operação: agora usa apenas a data real do contrato e, quando ela falta, mostra "sem data" — sinalizando cadastro incompleto em vez de exibir um ano incorreto.' },
      { tipo: 'correcao', texto: 'Corrigida a importação do Fluxo de Caixa Gerencial, que invertia dia e mês de algumas datas (cerca de 143 registros acertados); o mês passa a aparecer corretamente.' },
      { tipo: 'novidade', texto: 'Novos indicadores no gráfico de Fluxo de Caixa Mensal de Weddings: total a receber e total a pagar ainda pendentes.' },
      { tipo: 'melhoria', texto: 'Valores de operações individuais (Lista de Operações e detalhamento) passam a exibir 2 casas decimais; agregados seguem em formato abreviado (ex.: "R$ 1,8 Mi").' },
    ],
  },
  {
    versao: '4.8.2',
    data: '2026-06-02T17:13',
    itens: [
      { tipo: 'melhoria', texto: 'Ajustes visuais e de formatação em vários cartões de Weddings: "Próximos Casamentos" com data em formato amigável e sem rolagem lateral; detalhamento da operação com o Fluxo de Caixa reorganizado; Carteira simplificada para Casamentos.' },
      { tipo: 'correcao', texto: 'Corrigido um erro ao ordenar a Lista de Operações por Duração, Contrato ou Convidados.' },
    ],
  },
  {
    versao: '4.8.1',
    data: '2026-06-01T17:41',
    itens: [
      { tipo: 'novidade', texto: 'Cartões clicáveis ganham um indicador visual: ao passar o mouse, a borda e o "Ver mais" assumem a cor da aba, deixando claro que o cartão abre um detalhamento.' },
      { tipo: 'melhoria', texto: 'Refinos nos detalhamentos de Weddings: comparação com o ano anterior num único gráfico (faturamento e receita) e caixa acumulado com entradas e saídas separadas, marcando o dia de hoje.' },
    ],
  },
  {
    versao: '4.8.0',
    data: '2026-06-01T16:38',
    itens: [
      { tipo: 'melhoria', texto: 'Área de importação de dados unificada e mais segura: as quatro bases passam a ficar numa única tela, cada uma avisando que a importação substitui toda a base e mostrando a contagem de registros antes e depois.' },
      { tipo: 'melhoria', texto: 'Padronização visual de todos os gráficos da plataforma (eixos, grades, legendas e linhas), base para uma aparência consistente.' },
      { tipo: 'melhoria', texto: 'Detalhamento da operação de Weddings reformulado; removidos blocos baseados em dados pouco confiáveis (Equação Financeira/Custos Internos).' },
    ],
  },
  {
    versao: '4.7.1',
    data: '2026-05-31T19:31',
    itens: [
      { tipo: 'melhoria', texto: 'Lista de Operações de Weddings enxugada a pedido da diretoria: removidas colunas de custo intermediário; "Receita Líquida" renomeada para "Resultado Previsto" e "Margem Líquida" para "Margem" (refletido também na exportação para Excel).' },
      { tipo: 'melhoria', texto: 'O cartão comercial de Weddings passa a destacar o número de contratos de casamento vendidos no período (com comparação ao ano anterior), em vez do faturamento.' },
    ],
  },
  {
    versao: '4.7.0',
    data: '2026-05-29T11:34',
    itens: [
      { tipo: 'correcao', texto: 'Reativada a importação da planilha do Fluxo de Caixa Gerencial, que estava indisponível — agora funciona de ponta a ponta, aceitando formatos brasileiro e americano de valores e datas.' },
      { tipo: 'novidade', texto: 'Novo detalhamento "Análise Histórica" no cartão principal de Weddings, com a evolução de faturamento e receita por subsetor.' },
      { tipo: 'correcao', texto: 'Corrigido um erro de soma na Composição dos Lançamentos que duplicava grupos de categoria e gerava totais incorretos.' },
    ],
  },
  {
    versao: '4.6.1',
    data: '2026-05-29T07:12',
    itens: [
      { tipo: 'melhoria', texto: 'Logos do Welcome Group e Welcome Weddings em alta resolução e novos ícones do aplicativo no navegador; corrigido o corte do logo na barra lateral.' },
    ],
  },
  {
    versao: '4.6.0',
    data: '2026-05-29T07:12',
    itens: [
      { tipo: 'novidade', texto: 'Nova seção Fluxo de Caixa Gerencial, baseada na planilha de previsão curada manualmente, com projeção diária de saldo e base editável na própria tela.' },
      { tipo: 'novidade', texto: 'Importação da planilha de curadoria com prévia das diferenças (o que será adicionado, removido ou alterado) antes de confirmar; saldos iniciais por conta ajustáveis.' },
    ],
  },
  {
    versao: '4.5.0',
    data: '2026-05-28T15:12',
    itens: [
      { tipo: 'melhoria', texto: 'Cartões de subsetor de Weddings passam a exibir comparação com o ano anterior em Faturamento, Receita e Margem.' },
      { tipo: 'melhoria', texto: 'Lista "Próximos Lançamentos" reformulada em tabela com filtros (Todos / A receber / A pagar) e ordenação por coluna.' },
      { tipo: 'correcao', texto: 'Corrigido o cálculo de duração de operações de Weddings, que podia exibir valores negativos.' },
    ],
  },
  {
    versao: '4.4.0',
    data: '2026-05-28T11:01',
    itens: [
      { tipo: 'novidade', texto: 'Indicadores de Weddings reformulados: um cartão principal (Faturamento, Receita e Margem) clicável que abre um detalhamento rico — evolução, comparação com o ano anterior, tendência de margem e composição por subsetor — mais cinco cartões por subsetor.' },
      { tipo: 'novidade', texto: 'Calendário de Liquidez redesenhado como mapa de calor, com a intensidade da cor proporcional ao saldo do dia.' },
      { tipo: 'melhoria', texto: 'A versão completa da plataforma passa a aparecer na barra lateral, com histórico de versões registrado.' },
    ],
  },
  {
    versao: '4.3.0',
    data: '2026-05-27T17:41',
    itens: [
      { tipo: 'melhoria', texto: 'Fluxo de Caixa reorganizado em duas seções recolhíveis (visão geral do período e visão diária), com indicadores de Entradas, Saídas e Resultado de caixa reposicionados.' },
      { tipo: 'novidade', texto: 'Novo Calendário de Liquidez: entradas, saídas e saldo por dia, navegável por mês e com detalhamento ao clicar em um dia, ao lado de uma lista de "Próximos Lançamentos".' },
    ],
  },
  {
    versao: '4.2.0',
    data: '2026-05-27T08:55',
    itens: [
      { tipo: 'novidade', texto: 'A pedido da gestão de Weddings, a tabela "Próximos Casamentos a Entregar" passa a mostrar o Resultado Previsto de cada operação.' },
      { tipo: 'novidade', texto: 'Lista de Operações enriquecida com novas colunas (Tipo de Contrato, Passageiros e Convidados), filtro de período, duração, paginação e exportação para Excel.' },
      { tipo: 'correcao', texto: 'Corrigido um erro na Composição por Subsetor que exibia percentuais acima de 100%, mais ajustes solicitados na revisão com a gestão.' },
    ],
  },
  {
    versao: '4.1.0',
    data: '2026-05-27T08:55',
    itens: [
      { tipo: 'melhoria', texto: 'Fluxo de Caixa reformulado para refletir melhor o caixa bancário: gastos no cartão passam a ser contabilizados quando a fatura é efetivamente paga, respondendo com mais precisão a "quanto saiu da conta neste mês?".' },
      { tipo: 'correcao', texto: 'Corrigido o cadastro de contas bancárias que estava incompleto e deixava cerca de R$ 512 mil em entradas de fora dos cálculos; novas contas vindas do ERP passam a ser incorporadas automaticamente.' },
      { tipo: 'novidade', texto: 'Tela "Próximos Vencimentos" reconstruída a partir das Contas a Pagar/Receber, com tipo e faixa de atraso corretos.' },
    ],
  },
  {
    versao: '4.0.0',
    data: '2026-05-23T15:42',
    itens: [
      { tipo: 'novidade', texto: 'Marco inicial da área Financeiro: primeira versão do Fluxo de Caixa, com Entradas e Saídas realizadas, Saldo líquido e valores a receber em aberto.' },
      { tipo: 'novidade', texto: 'Novas visões no Fluxo de Caixa: fluxo mensal, composição do período por categoria, posição por conta bancária e títulos em aberto por faixa de atraso.' },
      { tipo: 'correcao', texto: 'Em Weddings, operações de Diárias/Pacote passam a exibir corretamente o hotel, que antes ficava em branco.' },
    ],
  },
]
