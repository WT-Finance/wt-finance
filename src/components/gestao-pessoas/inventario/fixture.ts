// Inventário de Ativos (v5.6.0) — dados de MOCKUP da M0.
//
// Existe só para a M0 (gate de aprovação visual): a M3/M4 trocam esta fonte pelas RPCs sem
// mudar o shape, porque `AtivoFicha`/`Movimentacao` já são o contrato da M1. O razão abaixo
// cobre os 8 tipos, uma movimentação RETROATIVA (registrada depois do fato), uma devolução ao
// estoque (ativo sem detentor) e um ativo baixado — os casos que a tela precisa saber desenhar.

import type { AreaPatrimonio, AtivoFicha, CategoriaPatrimonio, Detentor, Movimentacao } from './tipos'

export const CATEGORIAS: CategoriaPatrimonio[] = [
  { id: 1, nome: 'Informática' },
  { id: 2, nome: 'Mobiliário' },
  { id: 3, nome: 'Eletrônicos' },
  { id: 4, nome: 'Telefonia' },
  { id: 5, nome: 'Veículos' },
  { id: 6, nome: 'Outros' },
]

// Área = DEPARTAMENTO ADMINISTRATIVO. Não confundir com os setores de negócio
// (Trips/Weddings/Corporativo) — rótulo distinto de propósito. Lista a confirmar com o Yan.
export const AREAS_PATRIMONIO: AreaPatrimonio[] = [
  { id: 1, nome: 'Diretoria' },
  { id: 2, nome: 'Financeiro' },
  { id: 3, nome: 'Comercial' },
  { id: 4, nome: 'Operações' },
  { id: 5, nome: 'Marketing' },
  { id: 6, nome: 'Tecnologia' },
  { id: 7, nome: 'Gestão de Pessoas' },
]

export const DETENTORES: Detentor[] = [
  { id: 1, nome: 'Ana Beatriz Ramos',   ativo: true },
  { id: 2, nome: 'Carlos Eduardo Lima', ativo: true },
  { id: 3, nome: 'Mariana Alves',       ativo: true },
  { id: 4, nome: 'Rafael Monteiro',     ativo: true },
  { id: 5, nome: 'Juliana Prado',       ativo: true },
  { id: 6, nome: 'Thiago Barbosa',      ativo: true },
  { id: 7, nome: 'Patrícia Nogueira',   ativo: false },
]

export const LOCAIS_SUGERIDOS = [
  'TecnoService Assistência',
  'Dell Suporte Autorizado',
  'Sala de reuniões — 3º andar',
  'Depósito — subsolo',
]

export const FICHAS: AtivoFicha[] = [
  { id: 1,  codigo: 'WG-0001', categoria_id: 1, categoria_nome: 'Informática', descricao: 'Notebook Dell Latitude 5440', numero_serie: 'DL5440-8827', fornecedor: 'Dell Brasil',        data_aquisicao: '2025-03-12', valor_aquisicao: 7480.00,  nota_fiscal: 'NF 118234', estado_conservacao: 'bom',     obs: null },
  { id: 2,  codigo: 'WG-0002', categoria_id: 1, categoria_nome: 'Informática', descricao: 'Notebook Dell Latitude 5440', numero_serie: 'DL5440-8831', fornecedor: 'Dell Brasil',        data_aquisicao: '2025-03-12', valor_aquisicao: 7480.00,  nota_fiscal: 'NF 118234', estado_conservacao: 'bom',     obs: null },
  { id: 3,  codigo: 'WG-0003', categoria_id: 1, categoria_nome: 'Informática', descricao: 'MacBook Air M3 13"',          numero_serie: 'MBA13-4402',  fornecedor: 'iPlace',             data_aquisicao: '2025-07-01', valor_aquisicao: 11290.00, nota_fiscal: 'NF 004512', estado_conservacao: 'novo',    obs: null },
  { id: 4,  codigo: 'WG-0004', categoria_id: 1, categoria_nome: 'Informática', descricao: 'Monitor LG UltraWide 29"',    numero_serie: 'LG29-77120',  fornecedor: 'Kabum',              data_aquisicao: '2024-11-20', valor_aquisicao: 1899.90,  nota_fiscal: 'NF 552310', estado_conservacao: 'bom',     obs: null },
  { id: 5,  codigo: 'WG-0005', categoria_id: 1, categoria_nome: 'Informática', descricao: 'Monitor LG UltraWide 29"',    numero_serie: 'LG29-77124',  fornecedor: 'Kabum',              data_aquisicao: '2024-11-20', valor_aquisicao: 1899.90,  nota_fiscal: 'NF 552310', estado_conservacao: 'regular', obs: 'Pequeno risco na moldura inferior' },
  { id: 6,  codigo: 'WG-0006', categoria_id: 2, categoria_nome: 'Mobiliário',  descricao: 'Cadeira ergonômica Flexform', numero_serie: null,          fornecedor: 'Flexform Móveis',    data_aquisicao: '2024-09-05', valor_aquisicao: 2340.00,  nota_fiscal: 'NF 009871', estado_conservacao: 'bom',     obs: null },
  { id: 7,  codigo: 'WG-0007', categoria_id: 2, categoria_nome: 'Mobiliário',  descricao: 'Mesa de reunião 8 lugares',   numero_serie: null,          fornecedor: 'Flexform Móveis',    data_aquisicao: '2024-09-05', valor_aquisicao: 5600.00,  nota_fiscal: 'NF 009871', estado_conservacao: 'bom',     obs: null },
  { id: 8,  codigo: 'WG-0008', categoria_id: 4, categoria_nome: 'Telefonia',   descricao: 'iPhone 15 128GB',             numero_serie: 'IP15-99031',  fornecedor: 'Claro Empresas',     data_aquisicao: '2025-05-18', valor_aquisicao: 5199.00,  nota_fiscal: 'NF 771002', estado_conservacao: 'bom',     obs: 'Linha corporativa (11) 9xxxx-4402' },
  { id: 9,  codigo: 'WG-0009', categoria_id: 4, categoria_nome: 'Telefonia',   descricao: 'iPhone 13 128GB',             numero_serie: 'IP13-31088',  fornecedor: 'Claro Empresas',     data_aquisicao: '2023-08-14', valor_aquisicao: 4299.00,  nota_fiscal: 'NF 660145', estado_conservacao: 'ruim',    obs: null },
  { id: 10, codigo: 'WG-0010', categoria_id: 3, categoria_nome: 'Eletrônicos', descricao: 'Projetor Epson PowerLite',    numero_serie: 'EP-PL2210',   fornecedor: 'Epson do Brasil',    data_aquisicao: '2024-02-27', valor_aquisicao: 3450.00,  nota_fiscal: 'NF 220417', estado_conservacao: 'bom',     obs: null },
  { id: 11, codigo: 'WG-0011', categoria_id: 3, categoria_nome: 'Eletrônicos', descricao: 'Webcam Logitech Brio 4K',     numero_serie: 'LB4K-1180',   fornecedor: 'Kabum',              data_aquisicao: '2025-01-09', valor_aquisicao: 1120.00,  nota_fiscal: 'NF 601288', estado_conservacao: 'novo',    obs: null },
  { id: 12, codigo: 'WG-0012', categoria_id: 5, categoria_nome: 'Veículos',    descricao: 'Fiat Fiorino 1.4 Furgão',     numero_serie: 'PLACA GHT-2C41', fornecedor: 'Fiat Itavema',    data_aquisicao: '2023-04-03', valor_aquisicao: 89900.00, nota_fiscal: 'NF 100233', estado_conservacao: 'regular', obs: null },
  { id: 13, codigo: 'WG-0013', categoria_id: 1, categoria_nome: 'Informática', descricao: 'Notebook Lenovo ThinkPad E14', numero_serie: 'LT-E14-2207', fornecedor: 'Lenovo Brasil',     data_aquisicao: '2022-06-21', valor_aquisicao: 5890.00,  nota_fiscal: 'NF 331900', estado_conservacao: 'ruim',    obs: null },
  { id: 14, codigo: 'WG-0014', categoria_id: 6, categoria_nome: 'Outros',      descricao: 'Cafeteira Nespresso Gemini',  numero_serie: 'NG-4410',     fornecedor: 'Nespresso',          data_aquisicao: '2025-02-14', valor_aquisicao: 2890.00,  nota_fiscal: 'NF 887400', estado_conservacao: 'bom',     obs: null },
  { id: 15, codigo: 'WG-0015', categoria_id: 1, categoria_nome: 'Informática', descricao: 'Notebook Dell Latitude 5450', numero_serie: 'DL5450-1902', fornecedor: 'Dell Brasil',        data_aquisicao: '2026-08-04', valor_aquisicao: 7990.00,  nota_fiscal: 'NF 129877', estado_conservacao: 'novo',    obs: 'Reposição de estoque' },
]

// Atalhos para o razão ficar legível.
const A = (id: number) => AREAS_PATRIMONIO.find(a => a.id === id)!
const D = (id: number) => DETENTORES.find(d => d.id === id)!

interface Mov {
  id: number
  ativo: number
  tipo: Movimentacao['tipo']
  data: string
  area?: number
  detentor?: number
  texto?: string
  motivo?: Movimentacao['motivo_baixa']
  obs?: string
  por?: string
  /** timestamptz de gravação. Quando o dia > `data`, a timeline marca "registro retroativo". */
  criado: string
}

const POR_PADRAO = 'Yan Ribeiro'

const RAZAO: Mov[] = [
  // WG-0001 — cadastro → transferência (a transferência é RETROATIVA: gravada 9 dias depois)
  { id: 1,  ativo: 1,  tipo: 'cadastro',           data: '2025-03-12', area: 6, detentor: 2, criado: '2025-03-12T13:04:00Z' },
  { id: 2,  ativo: 1,  tipo: 'transferencia',      data: '2026-05-04', area: 3, detentor: 1, obs: 'Troca de equipe após promoção', criado: '2026-05-13T18:22:00Z' },

  // WG-0002 — cadastro → manutenção → retorno
  { id: 3,  ativo: 2,  tipo: 'cadastro',           data: '2025-03-12', area: 6, detentor: 4, criado: '2025-03-12T13:06:00Z' },
  { id: 4,  ativo: 2,  tipo: 'envio_manutencao',   data: '2026-06-18', texto: 'Dell Suporte Autorizado', obs: 'Teclado não responde na fileira superior', criado: '2026-06-18T12:40:00Z' },
  { id: 5,  ativo: 2,  tipo: 'retorno_manutencao', data: '2026-07-09', area: 6, detentor: 4, obs: 'Teclado substituído em garantia', criado: '2026-07-09T19:15:00Z' },

  // WG-0003 — cadastro (novo, direto na Diretoria)
  { id: 6,  ativo: 3,  tipo: 'cadastro',           data: '2025-07-01', area: 1, detentor: 3, criado: '2025-07-01T14:20:00Z' },

  // WG-0004 — cadastro → transferência
  { id: 7,  ativo: 4,  tipo: 'cadastro',           data: '2024-11-20', area: 2, detentor: 5, criado: '2024-11-20T16:45:00Z' },
  { id: 8,  ativo: 4,  tipo: 'transferencia',      data: '2026-02-02', area: 3, detentor: 6, criado: '2026-02-02T11:10:00Z' },

  // WG-0005 — cadastro → devolução ao estoque (fica SEM detentor: a lista mostra travessão)
  { id: 9,  ativo: 5,  tipo: 'cadastro',           data: '2024-11-20', area: 2, detentor: 7, criado: '2024-11-20T16:47:00Z' },
  { id: 10, ativo: 5,  tipo: 'devolucao_estoque',  data: '2026-04-30', area: 6, obs: 'Devolvido no desligamento', criado: '2026-04-30T20:05:00Z' },

  // WG-0006 / WG-0007 — mobiliário parado
  { id: 11, ativo: 6,  tipo: 'cadastro',           data: '2024-09-05', area: 2, detentor: 5, criado: '2024-09-05T10:30:00Z' },
  { id: 12, ativo: 7,  tipo: 'cadastro',           data: '2024-09-05', area: 1, detentor: 3, criado: '2024-09-05T10:33:00Z' },

  // WG-0008 — celular corporativo
  { id: 13, ativo: 8,  tipo: 'cadastro',           data: '2025-05-18', area: 3, detentor: 1, criado: '2025-05-18T09:12:00Z' },

  // WG-0009 — celular antigo: baixa por perda, depois REATIVAÇÃO (a baixa foi engano)
  { id: 14, ativo: 9,  tipo: 'cadastro',           data: '2023-08-14', area: 4, detentor: 6, criado: '2023-08-14T15:00:00Z' },
  { id: 15, ativo: 9,  tipo: 'baixa',              data: '2026-06-01', motivo: 'perda', obs: 'Relatado como extraviado', criado: '2026-06-01T17:30:00Z' },
  { id: 16, ativo: 9,  tipo: 'reativacao',         data: '2026-06-27', area: 4, detentor: 6, obs: 'Aparelho reapareceu — baixa registrada por engano', criado: '2026-06-27T13:55:00Z' },

  // WG-0010 — projetor emprestado (fora da empresa)
  { id: 17, ativo: 10, tipo: 'cadastro',           data: '2024-02-27', area: 5, detentor: 3, criado: '2024-02-27T11:20:00Z' },
  { id: 18, ativo: 10, tipo: 'emprestimo',         data: '2026-07-28', detentor: 3, texto: 'Feira de turismo — Expo Center Norte', obs: 'Previsão de retorno: 15/08/2026', criado: '2026-07-28T08:40:00Z' },

  // WG-0011 — webcam no estoque desde a devolução
  { id: 19, ativo: 11, tipo: 'cadastro',           data: '2025-01-09', area: 5, detentor: 3, criado: '2025-01-09T14:02:00Z' },
  { id: 20, ativo: 11, tipo: 'devolucao_estoque',  data: '2026-03-11', area: 6, criado: '2026-03-11T18:00:00Z' },

  // WG-0012 — veículo
  { id: 21, ativo: 12, tipo: 'cadastro',           data: '2023-04-03', area: 4, detentor: 6, criado: '2023-04-03T09:50:00Z' },
  { id: 22, ativo: 12, tipo: 'envio_manutencao',   data: '2026-08-03', texto: 'Fiat Itavema — revisão dos 60.000 km', criado: '2026-08-03T10:15:00Z' },

  // WG-0013 — notebook antigo: baixado por descarte (fica baixado)
  { id: 23, ativo: 13, tipo: 'cadastro',           data: '2022-06-21', area: 2, detentor: 5, criado: '2022-06-21T13:40:00Z' },
  { id: 24, ativo: 13, tipo: 'baixa',              data: '2026-01-30', motivo: 'descarte', obs: 'Fora de suporte; descarte com certificado', criado: '2026-01-30T16:20:00Z' },

  // WG-0014 — copa
  { id: 25, ativo: 14, tipo: 'cadastro',           data: '2025-02-14', area: 7, detentor: 5, criado: '2025-02-14T12:00:00Z' },

  // WG-0015 — NASCE EM ESTOQUE: cadastro com área e SEM detentor (decisão do Yan, 10/08).
  // É o caso que prova que a abertura tem dois desfechos; a lista deve mostrar travessão.
  { id: 26, ativo: 15, tipo: 'cadastro',           data: '2026-08-04', area: 6, obs: 'Comprado como reposição, sem destinatário definido', criado: '2026-08-04T14:30:00Z' },
]

export const MOVIMENTACOES: Movimentacao[] = RAZAO.map(m => ({
  id: m.id,
  ativo_id: m.ativo,
  tipo: m.tipo,
  data_movimentacao: m.data,
  area_destino_id: m.area ?? null,
  area_destino_nome: m.area ? A(m.area).nome : null,
  detentor_destino_id: m.detentor ?? null,
  detentor_destino_nome: m.detentor ? D(m.detentor).nome : null,
  destino_texto: m.texto ?? null,
  motivo_baixa: m.motivo ?? null,
  obs: m.obs ?? null,
  registrado_por_rotulo: m.por ?? POR_PADRAO,
  criado_em: m.criado,
}))

export const movimentacoesDoAtivo = (ativoId: number): Movimentacao[] =>
  MOVIMENTACOES.filter(m => m.ativo_id === ativoId)
