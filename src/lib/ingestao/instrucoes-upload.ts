// Instruções de upload por base — o texto do painel "Ver instruções" de cada card de
// `/admin/ingestao/upload` (v6.1.3).
//
// Módulo de DADOS puro (sem React, sem import de parser): a página é client component e não deve
// carregar os parsers do servidor no bundle só para exibir rótulos. A fonte da verdade das
// colunas continua sendo o parser do SERVIDOR (`src/lib/ingestao/parsers/*`) — a sonda
// `instrucoes-upload.test.ts` passa estas listas pelo mesmo `mapearColunas`/`camposFaltando` que
// o parse usa e reprova se divergirem. Foi exatamente essa deriva que esta versão encontrou: o
// card ainda mostrava as colunas dos parsers ANTIGOS do navegador (ex.: "Movimentação, Valor"
// onde o servidor exige 12 colunas) desde a v6.0.0.
//
// Regra de conteúdo: só o que o código e a documentação do repositório sustentam. O caminho de
// menu no Monde não está documentado em lugar nenhum — `ondeNoMonde` fica AUSENTE até alguém que
// usa o Monde confirmar o texto, em vez de inventar um caminho que mande o usuário ao lugar errado.

import { PESSOAS_COLUNAS } from '@/lib/carga/parse-pessoas'

export type BaseUpload =
  | 'vendas' | 'lancamentos' | 'lancamentos_movimentacao' | 'titulos_em_aberto' | 'pessoas'
  | 'demonstrativo_competencia'

export interface InstrucoesUpload {
  /** De onde vem o arquivo — o nome do relatório como o repositório o conhece. */
  origem: string
  /** Caminho de menu / filtros / período no Monde. Só preencher com texto CONFIRMADO por quem
   *  usa o Monde (ver o cabeçalho do módulo). */
  ondeNoMonde?: string
  /** As armadilhas que não são óbvias — exibidas PRIMEIRO, antes do passo a passo. */
  atencao: readonly string[]
  /** Como preparar e enviar o arquivo. */
  passos: readonly string[]
  colunas: {
    /** Rótulo da lista — também usado na linha curta do card. */
    rotulo: string
    /** Exatamente o que o servidor confere (pinado pela sonda). */
    itens: readonly string[]
    nota?: string
  }
}

/** Vale para todas as bases — exibido ao fim de todo painel. */
export const INSTRUCOES_GERAIS: readonly string[] = [
  'Cada envio SUBSTITUI a base inteira (não acrescenta). Se algo der errado, a base anterior continua intacta.',
  'Antes de aplicar, a plataforma confere o arquivo e mostra quantos registros existem hoje e quantos vão ficar. Confira esse número: um arquivo incompleto (por exemplo, só um ano) passa em todas as conferências e só esse número o denuncia.',
  'Só a primeira aba da planilha é lida. Limite de 50 MB por arquivo.',
  'Os nomes das colunas não diferenciam maiúsculas, acentos nem espaços extras.',
]

const AVISO_NAO_TRATAR =
  'Envie o arquivo exatamente como o Monde exporta. Não apague linhas de total ou subtotal, não filtre linhas e não reformate colunas — a plataforma usa os totais do próprio arquivo para conferir que nada se perdeu.'

export const INSTRUCOES_UPLOAD: Record<BaseUpload, InstrucoesUpload> = {
  vendas: {
    origem: 'Relatório "Vendas por produto" do Monde, em Excel (.xlsx).',
    atencao: [
      AVISO_NAO_TRATAR,
      'Mantenha a linha de totais que o relatório traz — deve haver exatamente uma por arquivo. Sem ela o envio é recusado.',
      'Envie TODOS os anos juntos, de uma vez. Como o envio substitui a base inteira, mandar só um ano deixa a plataforma só com aquele ano.',
      'O relatório do Monde tem limite de 30 mil linhas por pesquisa — por isso exporte um arquivo por ano (ou por período) e selecione todos os arquivos juntos no card.',
      'Os períodos não podem se sobrepor: a mesma venda em dois arquivos faz o envio ser recusado.',
      'Não exclua as vendas da Welcome: a plataforma já as trata.',
    ],
    passos: [
      'Exporte o "Vendas por produto" em Excel, um arquivo por ano (ou período), cobrindo todo o histórico.',
      'O cabeçalho precisa estar na primeira linha da planilha.',
      'Arraste todos os arquivos juntos para o card (ou clique e selecione todos).',
      'Confira no aviso o total antes × depois e confirme.',
    ],
    colunas: {
      rotulo: 'Colunas obrigatórias',
      itens: [
        'Venda Nº', 'Data Venda', 'Data Início', 'Pagante', 'Vendedor', 'Intermediário', 'Setor',
        'Passageiros', 'Produto', 'Valor Total', 'Receitas', 'Total Produtos Moeda Origem',
        'Fornecedor', 'Contr./ Voucher', 'Situação', 'Reembolso ao Cliente', 'Operação Própria',
      ],
      nota: 'Outras colunas do relatório (e-mail, CPF, CNPJ etc.) podem vir no arquivo — são ignoradas.',
    },
  },

  lancamentos: {
    origem:
      'CSV gerado pelo robô (RPA) a partir da tela "Análise de Operações" do Monde, operação por operação. Não é um relatório que se exporta do Monde.',
    atencao: [
      'Carregue antes, no mesmo dia, os Lançamentos por Vencimento (em aberto) — sem eles o envio é recusado. O ideal é carregar também os Lançamentos por Movimentação antes: é deles que vem o vencimento de cada lançamento.',
      'Ordem recomendada do dia: Vendas → Movimentação e Em aberto → Operação.',
      'Envie o CSV como o robô gerou (codificação UTF-8). Evite abrir e salvar de novo no Excel: ele pode trocar a codificação, e aí os cabeçalhos com acento deixam de ser reconhecidos.',
      'Se uma operação que existe hoje na plataforma não estiver no arquivo, a conferência avisa antes de aplicar.',
    ],
    passos: [
      'Use o arquivo .csv entregue pelo robô (é um arquivo só, com todas as operações).',
      'O cabeçalho precisa estar na primeira linha.',
      'Arraste o arquivo para o card, confira o aviso e confirme.',
    ],
    colunas: {
      rotulo: 'Colunas obrigatórias',
      itens: ['Lançamento N°', 'Venda', 'Pessoa', 'Descrição', 'Liquidação', 'Valor', 'Operacao', 'Tipo'],
      nota: 'A coluna Operacao_Id (que o robô acrescenta) é opcional; se existir, não pode vir vazia.',
    },
  },

  lancamentos_movimentacao: {
    origem: 'Relatório "Lançamentos por Categoria" do Monde, na versão por movimentação, em Excel (.xlsx).',
    atencao: [
      AVISO_NAO_TRATAR,
      'Mantenha as linhas de agrupamento ("Grupo de Categoria : …" e "Categoria : …") e a linha de total do fim. São elas que conferem o arquivo: sem elas a conferência até passa, mas o envio é recusado na hora de aplicar.',
      'Use a versão POR MOVIMENTAÇÃO (com a coluna "Movimentação"). A plataforma não impede trocar pelo arquivo de vencimento em aberto — confira antes de enviar.',
      'Não exclua as movimentações futuras: a plataforma separa sozinha o realizado do previsto.',
    ],
    passos: [
      'Exporte o "Lançamentos por Categoria" por movimentação, cobrindo todo o período da base.',
      'O cabeçalho precisa estar na primeira linha (o recuo do agrupamento nas primeiras colunas é normal).',
      'Arraste o arquivo para o card, confira o aviso e confirme.',
    ],
    colunas: {
      rotulo: 'Colunas obrigatórias',
      itens: [
        'Número', 'Venda Nº', 'Emissão', 'Vencimento', 'Liquidação', 'Pessoa', 'Descrição',
        'Descrição Categoria', 'Valor', 'Categoria', 'Grupo de Categoria', 'Conta',
      ],
      nota: 'Mais a coluna "Movimentação", que é o que distingue este arquivo do de vencimento em aberto.',
    },
  },

  titulos_em_aberto: {
    origem: 'Relatório "Lançamentos por Categoria" do Monde, na versão por vencimento em aberto, em Excel (.xlsx).',
    atencao: [
      AVISO_NAO_TRATAR,
      'Mantenha as linhas de agrupamento ("Grupo de Categoria : …" e "Categoria : …") e a linha de total do fim. São elas que conferem o arquivo: sem elas a conferência até passa, mas o envio é recusado na hora de aplicar.',
      'Use a versão POR VENCIMENTO EM ABERTO (sem a coluna "Movimentação"). A plataforma não impede trocar pelo arquivo de movimentação — confira antes de enviar.',
      'Os Lançamentos por Operação só são aceitos se esta base tiver sido carregada no mesmo dia — carregue-a antes.',
    ],
    passos: [
      'Exporte o "Lançamentos por Categoria" por vencimento em aberto.',
      'O cabeçalho precisa estar na primeira linha (o recuo do agrupamento nas primeiras colunas é normal).',
      'Arraste o arquivo para o card, confira o aviso e confirme.',
    ],
    colunas: {
      rotulo: 'Colunas obrigatórias',
      itens: [
        'Número', 'Venda Nº', 'Emissão', 'Vencimento', 'Liquidação', 'Pessoa', 'Descrição',
        'Descrição Categoria', 'Valor', 'Categoria', 'Grupo de Categoria', 'Conta',
      ],
    },
  },

  pessoas: {
    origem: 'Cadastro de pessoas do Monde, em Excel (.xlsx) ou CSV.',
    atencao: [
      'O arquivo precisa trazer as 17 colunas abaixo, mesmo que algumas venham vazias.',
    ],
    passos: [
      'Exporte o cadastro completo de pessoas.',
      'O cabeçalho precisa estar na primeira linha.',
      'Arraste o arquivo para o card, confira o aviso e confirme.',
    ],
    colunas: {
      rotulo: 'Colunas obrigatórias',
      itens: PESSOAS_COLUNAS,
      nota: 'Células vazias são normais. Os valores são lidos como texto (zeros à esquerda de CEP e documentos se mantêm).',
    },
  },

  demonstrativo_competencia: {
    origem:
      'Relatório "Demonstrativo de Resultado" do Monde (tabela dinâmica), em Excel (.xlsx), exatamente como sai do sistema — sem tratamento.',
    atencao: [
      'Não envie a planilha "tratada" (uma linha por registro, com colunas como Mês Nº e Competência): a plataforma lê a tabela dinâmica original.',
      'Mantenha os subtotais LIGADOS e todos os níveis EXPANDIDOS. Os subtotais conferem o arquivo; um nível recolhido faz o envio ser recusado.',
      'Traga todos os anos num arquivo só — o envio substitui a base inteira.',
    ],
    passos: [
      'Na tabela dinâmica do Demonstrativo de Resultado, arraste Tipo, Grupo, Descrição, Ano e Mês para a área de LINHAS — o Mês precisa ser o último nível.',
      'Deixe a área de COLUNAS vazia ("Arraste Aqui Campos para Colunas").',
      'Expanda todos os níveis e mantenha os subtotais ligados.',
      'Exporte em Excel e arraste o arquivo para o card. Título ou linhas em branco antes do cabeçalho não atrapalham.',
      'Confira o aviso e confirme. Contas novas entram como "Não classificadas" — classifique-as depois em Editar estrutura, no DRE.',
    ],
    colunas: {
      rotulo: 'Campos da tabela dinâmica (área de linhas)',
      itens: ['Tipo', 'Grupo', 'Descrição', 'Ano', 'Mês'],
      nota: 'Mais a coluna de valor ("Total Geral"), a última com conteúdo.',
    },
  },
}
