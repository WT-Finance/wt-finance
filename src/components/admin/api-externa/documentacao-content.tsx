import type { ReactNode } from 'react'
import Link from 'next/link'
import type { TipoAdmin, Destinatarios } from '@/lib/solicitacoes/schemas'
import { Card } from '@/components/ui/card'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import Badge from '@/components/ui/badge'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'

// v5.4.0/Round3 (2026-07-29) — conteúdo (RSC puro, sem interatividade) de
// /admin/api-externa/documentacao: espelha docs/api-externa-solicitacoes.md
// DENTRO da plataforma (pedido do Yan — "deveria haver também uma forma de
// acessar a documentação pela própria plataforma"). Prosa/exemplos são texto
// estável do contrato; a seção 3 tem uma parte VIVA (tipos expostos + campos +
// equipes válidas), lida do cadastro real a cada carregamento da página — o
// mesmo dado que a page.tsx irmã (/admin/api-externa) já consome.
//
// Não existe renderizador de markdown no projeto — a página é montada com
// primitivos reais do DS (Card, CardTabela, Badge), nunca dangerouslySetInnerHTML.

const SECOES = [
  { id: 'conceitos',    label: '1. Conceitos em 30 segundos' },
  { id: 'autenticacao', label: '2. Autenticação' },
  { id: 'descoberta',      label: '3. Descoberta — GET /api/externo/tipos' },
  { id: 'descoberta-viva', label: '↳ Tipos expostos agora (ao vivo)' },
  { id: 'criar',           label: '4. Criar — POST /api/externo/solicitacoes' },
  { id: 'consultar',    label: '5. Consultar' },
  { id: 'idempotencia', label: '6. Idempotência e retry' },
  { id: 'cancelar',     label: '7. Cancelar' },
  { id: 'erros',        label: '8. Erros' },
  { id: 'fora',         label: '9. Fora desta versão' },
] as const

function Pre({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed font-mono text-zinc-700">
      {children}
    </pre>
  )
}

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-8">
      <Card>
        <h2 className="mb-3 text-base font-semibold text-zinc-900">{titulo}</h2>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-700">{children}</div>
      </Card>
    </div>
  )
}

const JSON_TIPOS_EXEMPLO = `{
  "ok": true,
  "tipos": [
    {
      "slug": "abatimento_de_creditos",
      "nome": "Abatimento de créditos",
      "destinos": [
        { "id": 3, "nome": "Comercial" },
        { "id": 4, "nome": "Financeiro" },
        { "id": 7, "nome": "Operações" }
      ],
      "campos": [
        { "chave": "valor", "rotulo": "Valor", "tipo_campo": "moeda", "obrigatorio": true, "opcoes": null, "data_permite_passado": true },
        { "chave": "categoria", "rotulo": "Categoria", "tipo_campo": "selecao", "obrigatorio": true,
          "opcoes": ["fornecedor","reembolso","adiantamento","taxa","outro"], "data_permite_passado": true }
      ]
    }
  ]
}`

const JSON_CRIAR_PAYLOAD = `{
  "tipo": "abatimento_de_creditos",
  "chave_idempotencia": "pedido-b1e2c3d4",
  "solicitante_email": "camila@welcometrips.com.br",
  "titulo": "DW | Ana & Bruno — decoração, sinal de 30%",
  "destinatario": "Financeiro",
  "data_limite": "2026-07-25",
  "campos": {
    "valor": "1500,00",
    "categoria": "fornecedor"
  },
  "referencia_origem": "b1e2c3d4-…"
}`

const JSON_CRIAR_RESPOSTA = `{ "ok": true, "id": 123, "status": "aberta",
  "destinatario": { "id": 4, "nome": "Financeiro" },
  "solicitante": { "email": "camila@welcometrips.com.br", "nome": "Camila Souza" },
  "idempotente": false }`

const JSON_CONSULTAR_POR_ID = `{ "ok": true,
  "solicitacao": {
    "id": 123,
    "status": "concluida",
    "tipo": "abatimento_de_creditos",
    "titulo": "DW | Ana & Bruno — abatimento de crédito",
    "destinatario": { "id": 3, "nome": "Financeiro" },
    "solicitante": { "email": "camila@welcometrips.com.br", "nome": "Camila Souza" },
    "data_limite": "2026-08-15",
    "criado_em": "2026-07-31T14:03:00-03:00",
    "decidido_em": "2026-08-02T09:12:00-03:00",
    "justificativa": null,
    "referencia_origem": "b1e2c3d4-…",
    "chave_idempotencia": "pedido-b1e2c3d4"
  } }`

const JSON_CONSULTAR_POR_REFERENCIA = `{ "ok": true,
  "solicitacoes": [
    {
      "id": 123, "status": "concluida", "tipo": "abatimento_de_creditos",
      "titulo": "DW | Ana & Bruno — abatimento de crédito",
      "destinatario": { "id": 3, "nome": "Financeiro" },
      "solicitante": { "email": "camila@welcometrips.com.br", "nome": "Camila Souza" },
      "data_limite": "2026-08-15", "criado_em": "2026-07-31T14:03:00-03:00",
      "decidido_em": "2026-08-02T09:12:00-03:00", "justificativa": null,
      "referencia_origem": "b1e2c3d4-…", "chave_idempotencia": "pedido-b1e2c3d4"
    }
  ] }`

const ERROS: ReadonlyArray<readonly [string, string, string]> = [
  ['AUTH_AUSENTE / AUTH_INVALIDA / CHAVE_INVALIDA', '401', 'Sem chave, chave errada ou revogada'],
  ['TIPO_NAO_AUTORIZADO', '403', 'Tipo existe mas não está na whitelist da sua chave'],
  ['NAO_ENCONTRADA', '404', 'Solicitação inexistente, de outra chave, ou aberta na tela por um humano — vale para a consulta e para o cancelamento'],
  ['CONFLITO_ESTADO', '409', 'Cancelamento de solicitação não-aberta'],
  ['PAYLOAD_EXCEDE_LIMITE', '413', 'Corpo acima de 64 KB'],
  ['JSON_INVALIDO / PAYLOAD_INVALIDO', '400/422', 'Corpo não é JSON válido / shape errado'],
  ['TIPO_INVALIDO', '422', 'Slug inexistente, arquivado ou não exposto'],
  ['IDEMPOTENCIA_OBRIGATORIA', '422', 'Falta chave_idempotencia'],
  ['DESTINATARIO_OBRIGATORIO / DESTINATARIO_INVALIDO', '422', 'Sem destinatário / equipe inexistente'],
  ['SOLICITANTE_OBRIGATORIO / SOLICITANTE_INVALIDO', '422', 'Sem solicitante_email / e-mail sem cadastro ativo no Janus'],
  ['DATA_LIMITE_OBRIGATORIA', '422', 'Falta data_limite'],
  ['CAMPO_DESCONHECIDO', '422', 'Chave de campo que o tipo não tem'],
  ['CAMPO_OBRIGATORIO / VALOR_INVALIDO', '422', 'Validação de campo (mesmas regras da tela)'],
  ['TIPO_EXIGE_ANEXO', '422', 'Tipo tem anexo obrigatório (indisponível via API nesta versão)'],
  ['CONSULTA_INVALIDA', '422', 'Consulta por referencia_origem sem o parâmetro na query'],
  ['ERRO_INTERNO', '500', 'Falha inesperada (tente novamente com backoff)'],
]

export function DocumentacaoContent({
  tiposExpostos,
  equipes,
  erroCarga,
  podeGestao,
}: {
  tiposExpostos: TipoAdmin[]
  equipes:       Destinatarios['roles']
  erroCarga:     string | null
  // v5.4.0/Round4: quem tem SÓ 'solicitacoes/documentacao' não alcança a tela de
  // administração (ela exige a gestão), então nenhum texto daqui manda essa pessoa
  // para lá — seria um beco sem saída (clique → /sem-acesso). Único uso restante do
  // flag: a redação do aviso "nenhum tipo exposto". A pill de VOLTA foi removida a
  // pedido do Yan (31/07): esta página existe por conta própria.
  podeGestao:    boolean
}) {
  return (
    <>
      {erroCarga && <FaixaMensagem tipo="erro" texto={erroCarga} />}

      <Card className="mb-6">
        <p className="mb-2 text-xs font-medium text-zinc-500">Nesta página</p>
        <nav aria-label="Sumário do contrato" className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {SECOES.map(s => (
            <a key={s.id} href={`#${s.id}`} className="text-sm text-action-primary hover:underline">
              {s.label}
            </a>
          ))}
        </nav>
      </Card>

      <div className="space-y-6">
        <Secao id="conceitos" titulo="1. Conceitos em 30 segundos">
          <p>
            Uma <strong>solicitação</strong> é uma tarefa aberta para uma <strong>equipe</strong> (role) do
            Janus, com campos definidos pelo <strong>tipo</strong> (cadastro do Janus). Estados possíveis:
            <code className="mx-1 font-mono text-xs">aberta</code> →
            <code className="mx-1 font-mono text-xs">concluida</code> |
            <code className="mx-1 font-mono text-xs">rejeitada</code> |
            <code className="mx-1 font-mono text-xs">cancelada</code>. Não existe estado &ldquo;aprovado&rdquo;
            nem estados intermediários — se a plataforma integradora tem um conceito próprio de aprovação, ele
            vive do lado dela; para o Janus a solicitação fica aberta até alguém concluí-la, rejeitá-la ou
            cancelá-la.
          </p>
          <p>
            Cada plataforma integradora recebe uma <strong>chave de API</strong> com uma <strong>lista de
            tipos autorizados</strong> (a whitelist da chave).
          </p>
          <p>
            <strong>Toda solicitação tem um solicitante humano:</strong> o{' '}
            <code className="font-mono text-xs">solicitante_email</code> do disparo (seção 4) precisa ser de
            alguém já cadastrado e ativo no Janus, e é essa pessoa que fica como solicitante — ela acompanha
            o pedido em &ldquo;Minhas solicitações&rdquo;, recebe os e-mails e pode cancelá-lo pela tela. A
            procedência não se perde: para quem atende, o pedido aparece com o selo{' '}
            <strong>&ldquo;via integração X&rdquo;</strong> (ex.: &ldquo;via integração TARS&rdquo;) ao lado
            do solicitante.
          </p>
          <p>
            O Janus <strong>não notifica ninguém</strong> quando o estado muda — não existe callback nem
            qualquer chamada de saída. Quem quiser saber o desfecho <strong>consulta</strong> (seção 5).
          </p>
        </Secao>

        <Secao id="autenticacao" titulo="2. Autenticação">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Toda chamada leva o header <code className="font-mono text-xs">x-api-key: &lt;segredo&gt;</code>.
              O segredo é entregue <strong>uma única vez</strong> na criação da chave (o Janus guarda apenas o
              hash — não há como recuperá-lo; perdeu, revoga e gera outra).
            </li>
            <li>Chave revogada recusa <strong>imediatamente</strong> (401). Todas as chamadas são registradas em log.</li>
            <li>Limite de payload: <strong>64 KB</strong> por requisição (413 acima disso).</li>
          </ul>
        </Secao>

        <Secao id="descoberta" titulo="3. Descoberta — GET /api/externo/tipos">
          <p>Devolve os tipos que a chave pode abrir, com o formulário de cada um:</p>
          <Pre>{JSON_TIPOS_EXEMPLO}</Pre>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <code className="font-mono text-xs">slug</code> identifica o tipo e{' '}
              <code className="font-mono text-xs">chave</code> identifica cada campo — ambos{' '}
              <strong>estáveis</strong>: edições no cadastro (renomear rótulos, reordenar, adicionar campos)
              não mudam slugs/chaves existentes. Programe contra eles, nunca contra rótulos.
            </li>
            <li>
              <code className="font-mono text-xs">destinos</code> lista <strong>todas as equipes do Janus</strong>
              {' '}— são os valores válidos para o campo <code className="font-mono text-xs">destinatario</code>{' '}
              (seção 4). Qualquer equipe cadastrada no Janus pode receber solicitações via API, desde que o
              disparo a nomeie corretamente; não há mais lista restrita por tipo.
            </li>
            <li>
              <code className="font-mono text-xs">tipo_campo</code> ∈ texto_curto · texto_longo · numero ·
              moeda · data · selecao. Campo <code className="font-mono text-xs">data</code> com{' '}
              <code className="font-mono text-xs">data_permite_passado: false</code> recusa datas anteriores a
              hoje (fuso São Paulo). Campos de anexo não são expostos via API nesta versão.
            </li>
          </ul>
        </Secao>

        <Secao id="descoberta-viva" titulo="Tipos expostos agora (ao vivo)">
          <p className="text-xs text-zinc-400">
            Esta seção não é um exemplo — ela lê o cadastro real de tipos e equipes do Janus AGORA, ao
            carregar esta página.{' '}
            {podeGestao
              ? 'Ligue/desligue a exposição de um tipo na tela «API externa».'
              : 'Quem administra liga/desliga a exposição de um tipo na tela «API externa».'}
          </p>

          {tiposExpostos.length === 0 ? (
            <div role="status" className="rounded-lg border border-warning bg-warning-bg px-3 py-2.5 text-sm text-warning-deep">
              {podeGestao ? (
                <>
                  Nenhum tipo exposto — ligue a exposição de um tipo na tela{' '}
                  <Link href="/admin/api-externa" className="font-medium underline">API externa</Link> para que ele
                  apareça aqui e na descoberta.
                </>
              ) : (
                // Sem gestão, mandar a pessoa para uma tela que ela não abre é pior que
                // não mandar: a instrução vira o que ela pede a quem administra.
                <>Nenhum tipo exposto ainda — peça a quem administra as Solicitações para ligar a exposição do tipo que você vai integrar.</>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {tiposExpostos.map(tipo => {
                const campos = tipo.campos.filter(c => c.tipo_campo !== 'anexo')
                return (
                  <div key={tipo.id} className="overflow-hidden rounded-lg border border-zinc-200">
                    <div className="flex items-baseline justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2">
                      <p className="text-sm font-medium text-zinc-800">{tipo.nome}</p>
                      <span className="font-mono text-xs text-zinc-400">{tipo.slug ?? '—'}</span>
                    </div>
                    {campos.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-zinc-400">
                        Nenhum campo exposto — este tipo só tem campo de anexo, que não é exposto via API.
                      </p>
                    ) : (
                      <table className="w-full table-fixed text-sm">
                        <colgroup>
                          <col className="w-32" />
                          <col />
                          <col className="w-24" />
                          <col className="w-24" />
                          <col className="w-48" />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-zinc-100">
                            <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Chave</th>
                            <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Rótulo</th>
                            <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Tipo</th>
                            <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Obrigatório</th>
                            <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Opções</th>
                          </tr>
                        </thead>
                        <tbody>
                          {campos.map(c => (
                            <tr key={c.chave ?? c.id ?? c.rotulo} className="border-b border-zinc-50 last:border-0">
                              <td className="break-words px-3 py-2 font-mono text-xs text-zinc-600">{c.chave ?? '—'}</td>
                              <td className="break-words px-3 py-2 text-zinc-700">{c.rotulo}</td>
                              <td className="px-3 py-2 font-mono text-xs text-zinc-500">{c.tipo_campo}</td>
                              <td className="px-3 py-2 text-zinc-600">{c.obrigatorio ? 'Sim' : 'Não'}</td>
                              <td className="break-words px-3 py-2 text-xs text-zinc-500">
                                {c.opcoes && c.opcoes.length > 0 ? c.opcoes.join(' · ') : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-zinc-600">
              Equipes válidas para «destinatario» (todas — sem restrição por tipo)
            </p>
            {equipes.length === 0 ? (
              <p className="text-xs text-zinc-400">Nenhuma equipe (permissão) cadastrada ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {equipes.map(e => <Badge key={e.id} variant="neutro">{e.nome}</Badge>)}
              </div>
            )}
          </div>
        </Secao>

        <Secao id="criar" titulo="4. Criar — POST /api/externo/solicitacoes">
          <Pre>{JSON_CRIAR_PAYLOAD}</Pre>
          <p>Resposta (201 na criação; 200 quando idempotente — seção 6):</p>
          <Pre>{JSON_CRIAR_RESPOSTA}</Pre>
          <p className="font-medium text-zinc-800">Regras:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <code className="font-mono text-xs">solicitante_email</code> é <strong>obrigatório</strong> e
              precisa ser o e-mail de uma pessoa <strong>já cadastrada e ativa</strong> no Janus (comparação
              sem diferenciar maiúsculas/minúsculas e sem espaços nas pontas). Essa pessoa vira a{' '}
              <strong>solicitante de verdade</strong> do pedido: ela vê a solicitação em &ldquo;Minhas
              solicitações&rdquo;, recebe os e-mails de movimentação (criada, concluída, rejeitada,
              cancelada) e pode cancelá-la pela própria tela do Janus. A procedência não se perde — a tela
              mostra um selo &ldquo;via integração &lt;PLATAFORMA&gt;&rdquo; ao lado do solicitante. E-mail
              sem cadastro ativo → <code className="font-mono text-xs">SOLICITANTE_INVALIDO</code>; ausente
              → <code className="font-mono text-xs">SOLICITANTE_OBRIGATORIO</code> (422 nos dois casos) —
              não há fallback: cadastre a pessoa no Janus antes de disparar pela API.
            </li>
            <li>
              <code className="font-mono text-xs">destinatario</code> é <strong>obrigatório</strong> e é
              sempre uma equipe (role) — pelo <strong>nome exato</strong> (case-insensitive) ou pelo{' '}
              <strong>id</strong> numérico devolvido em <code className="font-mono text-xs">destinos</code>{' '}
              (o id é estável; o nome pode ser renomeado no Janus — prefira o id). Equipe inexistente → erro
              estruturado, nunca fallback. O destinatário resolvido é ecoado na resposta e na consulta —
              exiba-o (&ldquo;aberto para a equipe X&rdquo;) e detecte erro de fila no primeiro disparo. Errou
              a fila? Cancele e recrie — não existe reatribuição via API.
            </li>
            <li>
              <code className="font-mono text-xs">data_limite</code> (AAAA-MM-DD) é obrigatória — é o prazo
              da tarefa.
            </li>
            <li>
              <code className="font-mono text-xs">campos</code> é um objeto <code className="font-mono text-xs">{'{chave: valor}'}</code>{' '}
              com valores string. Números/moeda aceitam vírgula ou ponto decimal (&ldquo;1500,00&rdquo; ou
              &ldquo;1500.00&rdquo;). Chave desconhecida → erro CAMPO_DESCONHECIDO (nada é ignorado
              silenciosamente). A validação é idêntica à do formulário humano do Janus: o que a tela recusa, a
              API recusa.
            </li>
            <li>
              <code className="font-mono text-xs">titulo</code> (recomendado): o texto curto que identifica a
              solicitação nas listas do Janus. <code className="font-mono text-xs">referencia_origem</code>: o
              id do registro no sistema de origem; volta na consulta (seção 5).
            </li>
          </ul>
        </Secao>

        <Secao id="consultar" titulo="5. Consultar">
          <p>
            Estes dois endpoints tornam o contrato autossuficiente: <strong>criar → consultar → cancelar</strong>,
            tudo por chamada sua. <strong>O Janus não faz chamadas de saída</strong> — não há webhook, não há
            segredo de saída, não há nada seu a expor na sua rede. Quem quiser saber o desfecho, consulta.
          </p>
          <p>
            Na prática, você consulta os pedidos que <strong>você mesmo abriu</strong> e que ainda estão{' '}
            <code className="font-mono text-xs">aberta</code>: o id de cada um vem na resposta da criação
            (seção 4), e você também pode buscar pelo seu próprio{' '}
            <code className="font-mono text-xs">referencia_origem</code> (5.2), sem precisar guardar o nosso
            id. A cadência é escolha sua — consulte quando quiser, quantas vezes quiser.{' '}
            <strong>Enquanto você não consultar, ninguém do seu lado fica sabendo do desfecho</strong> — a
            pontualidade é responsabilidade da sua plataforma, não do Janus.
          </p>
          <p className="text-xs text-zinc-500">
            Nenhuma das duas rotas abaixo devolve os <strong>valores dos campos</strong> (
            <code className="font-mono text-xs">campos</code>) preenchidos na criação — você acabou de
            enviá-los, então eles não voltam na consulta.
          </p>

          <p className="font-medium text-zinc-800">5.1 — GET /api/externo/solicitacoes/{'{id}'}</p>
          <p>
            Consulta <strong>uma</strong> solicitação criada por <strong>esta chave</strong>. Header{' '}
            <code className="font-mono text-xs">x-api-key</code> como nas demais chamadas.
          </p>
          <Pre>{JSON_CONSULTAR_POR_ID}</Pre>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <code className="font-mono text-xs">status</code> ∈ aberta · concluida · rejeitada · cancelada.{' '}
              <code className="font-mono text-xs">decidido_em</code> e{' '}
              <code className="font-mono text-xs">justificativa</code> ficam nulos enquanto a solicitação está
              aberta; <code className="font-mono text-xs">justificativa</code> só vem preenchida em rejeição.
            </li>
            <li>
              <strong>404 NAO_ENCONTRADA</strong> quando o id não existe, quando pertence a{' '}
              <strong>outra chave</strong>, ou quando é uma solicitação aberta na tela por um humano (essas não
              têm origem de integração). Os três casos respondem <strong>igual, de propósito</strong> — a
              resposta não pode servir de oráculo para descobrir se um id alheio existe.
            </li>
          </ul>

          <p className="font-medium text-zinc-800">
            5.2 — GET /api/externo/solicitacoes?referencia_origem=&lt;sua-referência&gt;
          </p>
          <p>
            Busca pelo id <strong>do seu lado</strong> (o que você mandou na criação — seção 4), para não
            precisar guardar o nosso id.
          </p>
          <Pre>{JSON_CONSULTAR_POR_REFERENCIA}</Pre>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Devolve <strong>coleção</strong>, mesmo com um único resultado —{' '}
              <code className="font-mono text-xs">referencia_origem</code> <strong>não é única</strong> no
              Janus (só o par chave + <code className="font-mono text-xs">chave_idempotencia</code> é): a mesma
              referência pode ter sido reusada em pedidos diferentes, e devolver &ldquo;o primeiro&rdquo;
              faria conciliar contra o pedido errado.
            </li>
            <li>
              <strong>Sem resultado é 200 com</strong>{' '}
              <code className="font-mono text-xs">{'"solicitacoes": []'}</code>, não 404 — é busca sem retorno,
              não recurso inexistente.
            </li>
            <li>Sem o parâmetro → <strong>422 CONSULTA_INVALIDA</strong>.</li>
            <li>Só enxerga solicitações <strong>desta chave</strong>.</li>
          </ul>
        </Secao>

        <Secao id="idempotencia" titulo="6. Idempotência e retry">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <code className="font-mono text-xs">chave_idempotencia</code> é obrigatória e única por chave de
              API. Recomendação: use o id do registro de origem (ex.: pedido_id).
            </li>
            <li>
              Reenviar com a mesma <code className="font-mono text-xs">chave_idempotencia</code> não duplica:
              devolve 200 com o mesmo id e <code className="font-mono text-xs">idempotente: true</code> (e não
              reenvia e-mails). Retry com backoff é seguro e bem-vindo.
            </li>
          </ul>
        </Secao>

        <Secao id="cancelar" titulo="7. Cancelar — POST /api/externo/solicitacoes/{id}/cancelar">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Só cancela solicitações criadas pela sua chave e ainda abertas.</li>
            <li>
              Já concluída/rejeitada/cancelada → 409 com{' '}
              <code className="font-mono text-xs">CONFLITO_ESTADO: &lt;status atual&gt;</code> — o conflito é
              reportado, não aplicado (o estado do Janus não muda; consulte para confirmar o estado atual —
              seção 5).
            </li>
          </ul>
        </Secao>

        <div id="erros" className="scroll-mt-8">
          <CardTabela titulo="8. Erros">
            <p className="mb-2 text-xs text-zinc-500">
              Formato de todo erro: <code className="font-mono text-xs">{'{ ok: false, erro: { codigo, mensagem } }'}</code>
            </p>
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-72" />
                <col className="w-20" />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-100">
                  <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Código</th>
                  <th scope="col" className={`${CARD_TABELA_TH} text-left`}>HTTP</th>
                  <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Significado</th>
                </tr>
              </thead>
              <tbody>
                {ERROS.map(([codigo, http, significado]) => (
                  <tr key={codigo} className="border-b border-zinc-50 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-zinc-600">{codigo}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-500">{http}</td>
                    <td className="px-3 py-2 text-zinc-700">{significado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardTabela>
        </div>

        <Secao id="fora" titulo="9. Fora desta versão (não peça, ainda)">
          <p>
            Anexos via API · estados/eventos de aprovação · notificação ativa (webhook): o Janus não faz
            chamadas de saída — o desfecho é consultado (seção 5) · reatribuição de destinatário ·{' '}
            <strong>criar em nome de quem ainda não tem cadastro no Janus</strong> (o{' '}
            <code className="font-mono text-xs">solicitante_email</code> precisa existir e estar ativo;
            cadastrar a pessoa antes é pré-condição deliberada da integração).
          </p>
        </Secao>
      </div>
    </>
  )
}
