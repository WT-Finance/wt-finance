import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { TipoAdmin, Destinatarios } from '@/lib/solicitacoes/schemas'
import { Card } from '@/components/ui/card'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import Badge from '@/components/ui/badge'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { PILL, PILL_GESTAO, PILL_GESTAO_STYLE } from '@/components/shared/botoes'

// v5.4.0/Round3 (2026-07-29) — conteúdo (RSC puro, sem interatividade) de
// /admin/chaves-api/documentacao: espelha docs/api-externa-solicitacoes.md
// DENTRO da plataforma (pedido do Yan — "deveria haver também uma forma de
// acessar a documentação pela própria plataforma"). Prosa/exemplos são texto
// estável do contrato; a seção 3 tem uma parte VIVA (tipos expostos + campos +
// equipes válidas), lida do cadastro real a cada carregamento da página — o
// mesmo dado que a page.tsx irmã (/admin/chaves-api) já consome.
//
// Não existe renderizador de markdown no projeto — a página é montada com
// primitivos reais do DS (Card, CardTabela, Badge), nunca dangerouslySetInnerHTML.

const SECOES = [
  { id: 'conceitos',    label: '1. Conceitos em 30 segundos' },
  { id: 'autenticacao', label: '2. Autenticação' },
  { id: 'descoberta',      label: '3. Descoberta — GET /api/externo/tipos' },
  { id: 'descoberta-viva', label: '↳ Tipos expostos agora (ao vivo)' },
  { id: 'criar',           label: '4. Criar — POST /api/externo/solicitacoes' },
  { id: 'idempotencia', label: '5. Idempotência e retry' },
  { id: 'callbacks',    label: '6. Callbacks' },
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
  "destinatario": { "id": 4, "nome": "Financeiro" }, "idempotente": false }`

const JSON_CALLBACK_PAYLOAD = `{ "evento": "solicitacao.concluida", "solicitacao_id": 123,
  "referencia_origem": "b1e2c3d4-…", "tipo": "abatimento_de_creditos",
  "status": "concluida", "destinatario": { "id": 4, "nome": "Financeiro" },
  "ocorrido_em": "2026-07-25T14:03:00-03:00" }`

const ERROS: ReadonlyArray<readonly [string, string, string]> = [
  ['AUTH_AUSENTE / AUTH_INVALIDA / CHAVE_INVALIDA', '401', 'Sem chave, chave errada ou revogada'],
  ['TIPO_NAO_AUTORIZADO', '403', 'Tipo existe mas não está na whitelist da sua chave'],
  ['NAO_ENCONTRADA', '404', 'Solicitação inexistente ou de outra chave'],
  ['CONFLITO_ESTADO', '409', 'Cancelamento de solicitação não-aberta'],
  ['PAYLOAD_EXCEDE_LIMITE', '413', 'Corpo acima de 64 KB'],
  ['JSON_INVALIDO / PAYLOAD_INVALIDO', '400/422', 'Corpo não é JSON válido / shape errado'],
  ['TIPO_INVALIDO', '422', 'Slug inexistente, arquivado ou não exposto'],
  ['IDEMPOTENCIA_OBRIGATORIA', '422', 'Falta chave_idempotencia'],
  ['DESTINATARIO_OBRIGATORIO / DESTINATARIO_INVALIDO', '422', 'Sem destinatário / equipe inexistente'],
  ['DATA_LIMITE_OBRIGATORIA', '422', 'Falta data_limite'],
  ['CAMPO_DESCONHECIDO', '422', 'Chave de campo que o tipo não tem'],
  ['CAMPO_OBRIGATORIO / VALOR_INVALIDO', '422', 'Validação de campo (mesmas regras da tela)'],
  ['TIPO_EXIGE_ANEXO', '422', 'Tipo tem anexo obrigatório (indisponível via API nesta versão)'],
  ['ERRO_INTERNO', '500', 'Falha inesperada (tente novamente com backoff)'],
]

const CALLBACKS: ReadonlyArray<readonly [string, string, string]> = [
  ['solicitacao.criada',    'criação via API confirmada',           '—'],
  ['solicitacao.concluida', 'equipe concluiu',                      '—'],
  ['solicitacao.rejeitada', 'equipe rejeitou',                      'justificativa'],
  ['solicitacao.cancelada', 'cancelada (pela origem ou no Janus)',  '—'],
]

export function DocumentacaoContent({
  tiposExpostos,
  equipes,
  erroCarga,
}: {
  tiposExpostos: TipoAdmin[]
  equipes:       Destinatarios['roles']
  erroCarga:     string | null
}) {
  return (
    <>
      <div className="mb-5">
        <Link href="/admin/chaves-api" className={`${PILL} ${PILL_GESTAO} whitespace-nowrap`} style={PILL_GESTAO_STYLE}>
          <ArrowLeft size={13} /> API externa
        </Link>
      </div>

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
            tipos autorizados</strong> (a whitelist da chave). As solicitações criadas por uma chave aparecem
            no Janus como abertas pela <strong>integração</strong> (ex.: &ldquo;Integração TARS&rdquo;) —
            proveniência clara para quem atende.
          </p>
          <p>Toda mudança de estado gera um <strong>callback</strong> HTTP para a URL cadastrada na chave (seção 6).</p>
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
            carregar esta página. Ligue/desligue a exposição de um tipo na tela «API externa».
          </p>

          {tiposExpostos.length === 0 ? (
            <div role="status" className="rounded-lg border border-warning bg-warning-bg px-3 py-2.5 text-sm text-warning-deep">
              Nenhum tipo exposto — ligue a exposição de um tipo na tela{' '}
              <Link href="/admin/chaves-api" className="font-medium underline">API externa</Link> para que ele
              apareça aqui e na descoberta.
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
          <p>Resposta (201 na criação; 200 quando idempotente — seção 5):</p>
          <Pre>{JSON_CRIAR_RESPOSTA}</Pre>
          <p className="font-medium text-zinc-800">Regras:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <code className="font-mono text-xs">destinatario</code> é <strong>obrigatório</strong> e é
              sempre uma equipe (role) — pelo <strong>nome exato</strong> (case-insensitive) ou pelo{' '}
              <strong>id</strong> numérico devolvido em <code className="font-mono text-xs">destinos</code>{' '}
              (o id é estável; o nome pode ser renomeado no Janus — prefira o id). Equipe inexistente → erro
              estruturado, nunca fallback. O destinatário resolvido é ecoado na resposta e nos callbacks —
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
              id do registro no sistema de origem; volta em todos os callbacks.
            </li>
          </ul>
        </Secao>

        <Secao id="idempotencia" titulo="5. Idempotência e retry">
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

        <Secao id="callbacks" titulo="6. Callbacks (mudanças de estado → sua URL)">
          <p>
            O Janus envia POST à URL de callback cadastrada na chave, com o header{' '}
            <code className="font-mono text-xs">x-callback-secret: &lt;segredo de saída&gt;</code> (valide-o).
            Quatro eventos:
          </p>
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-52" />
                <col />
                <col className="w-32" />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-100">
                  <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Evento</th>
                  <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Quando</th>
                  <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Campos extras</th>
                </tr>
              </thead>
              <tbody>
                {CALLBACKS.map(([evento, quando, extra]) => (
                  <tr key={evento} className="border-b border-zinc-50 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-zinc-600">{evento}</td>
                    <td className="px-3 py-2 text-zinc-700">{quando}</td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500">{extra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Payload:</p>
          <Pre>{JSON_CALLBACK_PAYLOAD}</Pre>
          <p className="text-xs text-zinc-500">
            O Janus não pede nem devolve uma referência do seu lado na conclusão — a conciliação entre a
            solicitação e o lançamento correspondente (ex.: no seu ERP/CRM) é responsabilidade da sua
            plataforma. Use <code className="font-mono text-xs">solicitacao_id</code> (ou o seu próprio{' '}
            <code className="font-mono text-xs">referencia_origem</code>, ecoado em todo callback) para casar
            os dois lados.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Entrega at-least-once:</strong> responda 2xx rápido (só enfileire do seu lado). Você
              pode receber o mesmo evento mais de uma vez — deduplique por evento + solicitacao_id.
            </li>
            <li>
              Sem 2xx, o Janus retenta com backoff exponencial (2, 4, 8… minutos, teto 4 h) até 8 tentativas;
              depois marca como esgotado (visível no log da chave, no admin do Janus).
            </li>
            <li>Não há callback de &ldquo;aprovado&rdquo; — não existe esse estado (seção 1).</li>
          </ul>
        </Secao>

        <Secao id="cancelar" titulo="7. Cancelar — POST /api/externo/solicitacoes/{id}/cancelar">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Só cancela solicitações criadas pela sua chave e ainda abertas.</li>
            <li>
              Já concluída/rejeitada/cancelada → 409 com{' '}
              <code className="font-mono text-xs">CONFLITO_ESTADO: &lt;status atual&gt;</code> — o conflito é
              reportado, não aplicado (o estado do Janus não muda; sincronize o seu lado pelo callback).
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
            Anexos via API · criação &ldquo;em nome de&rdquo; um usuário humano · estados/eventos de aprovação
            · assinatura HMAC de callbacks (hoje: segredo em header) · reatribuição de destinatário.
          </p>
        </Secao>
      </div>
    </>
  )
}
