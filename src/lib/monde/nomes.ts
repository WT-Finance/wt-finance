// Nomes que a venda da API Monde v3 NÃO traz (v6.2.0). A v3 manda pagante, vendedor e fornecedor só
// como `{ id }` (nome em `/people/{id}`), o produto do catálogo só como `{ id }` (nome em
// `/products/{id}`) e os campos personalizados só como `{ id, value }` (nome em `/custom_fields`). A
// `monde-data` do TTARS resolvia tudo isso por nós; agora é este módulo, com cache no banco
// (`monde.pessoa`, `monde.produto_catalogo` — migration 0290) para não gastar o ritmo de 1 chamada
// por 1,3 s pedindo de novo o mesmo nome a cada venda.
//
// Política do cache de PESSOA:
//   • nome ausente do cache ⇒ busca na API. Se o orçamento acabar aqui, `OrcamentoEsgotado` SOBE: a
//     venda não pode ser gravada sem o nome (seria regressão de dado no espelho) — fica na fila;
//   • nome com mais de `TTL_PESSOA_DIAS` ⇒ re-busca SÓ se sobrar orçamento (`RESERVA_REBUSCA_MS`); sem
//     orçamento usa o velho (resíduo aceito: o TTARS resolvia ao vivo; nome de cadastro muda raramente).
//     Re-busca que volta VAZIA (404, nome em branco — cadastro mesclado no Monde) MANTÉM o nome velho:
//     nome desatualizado é resíduo aceito, nome apagado seria regressão de dado (MÉDIO do revisor);
//   • pessoa nunca vista com 404 ⇒ grava nome nulo, para não perguntar de novo a cada tick.
// Importa valores de `./client` (que é `server-only`): só roda no servidor; os testes mockam `server-only`.
import { OrcamentoEsgotado, ErroTransitorio, type ClienteMonde } from './client'
import type { Resolvedor } from './transform'
import type { VendaDetalhe } from './schemas'
import { TIPOS_PRODUTO } from './transform'

export interface NomesDb {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export const TTL_PESSOA_DIAS = 30
/** Re-buscar nome VELHO só se ainda sobrar este tanto de orçamento — a fila de leitura vem antes. */
export const RESERVA_REBUSCA_MS = 90_000
/** Nomes dos campos personalizados — a MESMA chave que a v5.x usava (o TTARS mandava o nome). */
export const CAMPO_SETOR = 'Setor'
export const CAMPO_VENDEDOR_WEDDINGS = 'Vendedor(a) Responsável - Grupo'

interface PessoaCache { nome: string | null; cpf_cnpj: string | null; atualizado_em: string }

async function rpc(db: NomesDb, fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(`RPC ${fn} falhou: ${JSON.stringify(error)}`)
  return data
}

/** Ids dos dois campos personalizados que o transform lê. Sem "Setor" ⇒ LANÇA (fail-closed). */
export async function carregarCampos(cliente: ClienteMonde): Promise<{ campoSetor: number; campoVendedorWeddings: number | null }> {
  const { data } = await cliente.camposPersonalizados()
  const porNome = (nome: string) => data.find((c) => c.name.trim() === nome)?.id ?? null
  const campoSetor = porNome(CAMPO_SETOR)
  // Sem o campo, TODA venda sairia como `sem_setor` — e a cura apagaria o espelho do mês (o teto de
  // 20 por rodada só limitaria o estrago). Melhor parar a ingestão inteira e acender o alarme.
  if (campoSetor === null) throw new Error(`[monde:custom_fields] campo "${CAMPO_SETOR}" não encontrado — ingestão abortada.`)
  return { campoSetor, campoVendedorWeddings: porNome(CAMPO_VENDEDOR_WEDDINGS) }
}

/** Ids de pessoa que uma venda precisa resolver: pagante, vendedor e o fornecedor de cada produto. */
export function idsDePessoa(venda: VendaDetalhe): string[] {
  const ids = [venda.payer?.id, venda.seller?.id]
  for (const tipo of TIPOS_PRODUTO) for (const p of venda[tipo] ?? []) ids.push(p.supplier?.id)
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/** Ids de produto do catálogo (só `others`/`operations` têm `product.id`). */
export function idsDeProduto(venda: VendaDetalhe): string[] {
  return [...venda.others, ...venda.operations]
    .map((p) => p.product?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

export class CacheNomes {
  private pessoas = new Map<string, PessoaCache>()
  private catalogo = new Map<string, string | null>()
  /** Chamadas à API feitas por este cache (para o log da rodada). */
  readonly metricas = { pessoas_api: 0, produtos_api: 0, catalogo_paginas: 0 }

  constructor(
    private readonly db: NomesDb,
    private readonly cliente: ClienteMonde,
    private readonly agora: () => number = () => Date.now(),
  ) {}

  /** Carrega o catálogo do banco; vazio (1ª execução) ⇒ baixa o catálogo inteiro da API (~17 páginas). */
  async iniciar(): Promise<void> {
    const mapa = ((await rpc(this.db, 'monde_catalogo_obter')) ?? {}) as Record<string, { nome: string | null }>
    for (const [id, v] of Object.entries(mapa)) this.catalogo.set(id, v.nome)
    if (this.catalogo.size > 0) return

    let cursor: string | null = null
    for (;;) {
      const pagina = await this.cliente.listarCatalogo(cursor)
      this.metricas.catalogo_paginas++
      const linhas = pagina.data.map((p) => ({ id: p.id, nome: p.name ?? null, kind: p.kind ?? null }))
      if (linhas.length) await rpc(this.db, 'monde_catalogo_registrar', { p_produtos: linhas })
      for (const l of linhas) this.catalogo.set(l.id, l.nome)
      if (!pagina.pagination.has_next_page || !pagina.pagination.next_cursor) break
      cursor = pagina.pagination.next_cursor
    }
  }

  /** Garante no cache em memória todos os nomes de que estas vendas precisam (ver política no topo). */
  async preparar(vendas: VendaDetalhe[]): Promise<void> {
    const idsPessoa = [...new Set(vendas.flatMap(idsDePessoa))].filter((id) => !this.pessoas.has(id))
    if (idsPessoa.length) {
      const mapa = ((await rpc(this.db, 'monde_pessoa_obter', { p_ids: idsPessoa })) ?? {}) as Record<string, PessoaCache>
      for (const [id, v] of Object.entries(mapa)) this.pessoas.set(id, v)
    }
    const limite = this.agora() - TTL_PESSOA_DIAS * 86_400_000
    const novas: { id: string; nome: string | null; cpf_cnpj: string | null }[] = []
    try {
      for (const id of idsPessoa) {
        const atual = this.pessoas.get(id)
        const velha = atual !== undefined && Date.parse(atual.atualizado_em) < limite
        if (atual !== undefined && !velha) continue
        if (velha && this.cliente.restaMs() < RESERVA_REBUSCA_MS) continue // sem sobra: fica o velho
        try {
          const p = await this.cliente.pessoa(id)
          this.metricas.pessoas_api++
          let linha = { id, nome: p?.name?.trim() || null, cpf_cnpj: p?.cpf_cnpj?.trim() || null }
          if (velha && atual && linha.nome === null) {
            // Re-busca vazia: mantém nome e documento antigos, só renova a data (não pergunta de novo amanhã).
            linha = { id, nome: atual.nome, cpf_cnpj: linha.cpf_cnpj ?? atual.cpf_cnpj }
          }
          novas.push(linha)
          this.pessoas.set(id, { nome: linha.nome, cpf_cnpj: linha.cpf_cnpj, atualizado_em: new Date(this.agora()).toISOString() })
        } catch (e) {
          // Só a RE-busca de nome velho tolera orçamento/instabilidade; nome ausente faz a venda esperar.
          if (velha && (e instanceof OrcamentoEsgotado || e instanceof ErroTransitorio)) continue
          throw e
        }
      }
    } finally {
      if (novas.length) await rpc(this.db, 'monde_pessoa_registrar', { p_pessoas: novas })
    }

    const idsProduto = [...new Set(vendas.flatMap(idsDeProduto))].filter((id) => !this.catalogo.has(id))
    const produtosNovos: { id: string; nome: string | null; kind: string | null }[] = []
    try {
      for (const id of idsProduto) {
        const p = await this.cliente.produto(id)
        this.metricas.produtos_api++
        const linha = { id, nome: p?.nome ?? null, kind: p?.kind ?? null }
        produtosNovos.push(linha)
        this.catalogo.set(id, linha.nome)
      }
    } finally {
      if (produtosNovos.length) await rpc(this.db, 'monde_catalogo_registrar', { p_produtos: produtosNovos })
    }
  }

  resolvedor(campos: { campoSetor: number; campoVendedorWeddings: number | null }): Resolvedor {
    return {
      campoSetor: campos.campoSetor,
      campoVendedorWeddings: campos.campoVendedorWeddings,
      pessoa: (id) => {
        if (!id) return null
        const p = this.pessoas.get(id)
        return p ? { nome: p.nome, cpf_cnpj: p.cpf_cnpj } : null
      },
      produtoCatalogo: (id) => (id ? this.catalogo.get(id) ?? null : null),
    }
  }
}
