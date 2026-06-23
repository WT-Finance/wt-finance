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
