// FONTE ÚNICA das RPCs que a credencial de máquina `ingestor` pode executar (v6.0.0/M2, M5).
//
// A allowlist de EXECUTE da role `ingestor` (migrations 0274 e seguintes) é DERIVADA deste
// arquivo por `scripts/credencial/derivar-allowlist.mjs ingestor` — nunca redigida à mão. A
// forma `rpc('<nome>')` é o que o script casa; cada entrada nova aqui exige o GRANT
// correspondente numa migration aditiva, senão a rota de ingestão recebe PERMISSAO_NEGADA
// (fail-closed desejado: RPC nova nasce inalcançável até alguém conceder).
//
// Regra do que ENTRA: só o pipeline staging → validação → promoção das cinco bases do
// contrato (`docs/contratos/ingestao-v1.md`). Nada de leitura de negócio, nada de `truncar_*`
// de base viva, nada de `inserir_lote_*` direto na tabela viva — o `ingestor` só toca STAGING e
// dispara a promoção atômica, que é quem faz o swap dentro de uma transação.
//
// Estado em 22/09/2026 (M5): as quatro bases que faltavam (Demonstrativo, Movimentação, Aberto,
// Operação) ganharam `*_staging` + `promover_carga_*` na migration 0278 e entram aqui no mesmo
// commit. `vendas-produto` continua listando só os NOMES de sempre — `promover_carga_vendas`
// também é o nome da sobrecarga NOVA `(jsonb, uuid)` que a 0278 criou (a versão zero-arg, 0116,
// fica intocada). O derivador resolve por ASSINATURA, não por nome (cabeçalho do script:
// "há sobrecargas em public e grant por nome cru é ambíguo... TODAS as assinaturas recebem o
// grant") — então rodar o derivador de novo, sem mudar nada aqui, passa a incluir a assinatura
// NOVA de `promover_carga_vendas` no GRANT à `ingestor`, além da zero-arg que ela já tinha desde
// a 0274. Isso é intencional (é a costura para o dia em que Vendas também aplicar por esta
// credencial, anexo v6.0.0/M5 item 9) — mas para `promover_carga_demonstrativo` é a PRIMEIRA vez
// que esta credencial alcançaria essa função, e o cabeçalho da 0278 já registra um risco de RBAC
// para esse momento (a chamada interna a `provisionar_dre_comp_par`, que exige `financeiro/dre`
// via `exigir_acesso`, hoje só passa porque `service_role` é o ramo TRUSTED — `ingestor` não tem
// essa área). Decidir isso é do orquestrador/Yan quando a migration do GRANT for escrita; aqui
// só se registra a allowlist-fonte.
//
// A credencial `ingestor` AINDA NÃO tem GRANT nas 16 RPCs novas desta missão (M5): aplicar.ts
// continua chamando com `service_role` (`getAdminClient`) até essa migration existir — ver o
// comentário de topo de `aplicar.ts`.

/** Marca de leitura para o derivador: devolve o próprio nome (sem chamar nada). */
const rpc = <T extends string>(nome: T): T => nome

export const RPCS_INGESTOR = {
  'vendas-produto': {
    limpar:   rpc('limpar_staging_vendas'),
    lote:     rpc('inserir_lote_staging'),
    validar:  rpc('validar_carga_staging'),
    promover: rpc('promover_carga_vendas'),
  },
  'demonstrativo-competencia': {
    limpar:   rpc('limpar_staging_demonstrativo'),
    lote:     rpc('inserir_lote_staging_demonstrativo'),
    validar:  rpc('validar_carga_demonstrativo'),
    promover: rpc('promover_carga_demonstrativo'),
  },
  'lancamentos-movimentacao': {
    limpar:   rpc('limpar_staging_movimentacao'),
    lote:     rpc('inserir_lote_staging_movimentacao'),
    validar:  rpc('validar_carga_movimentacao'),
    promover: rpc('promover_carga_movimentacao'),
  },
  'lancamentos-aberto': {
    limpar:   rpc('limpar_staging_aberto'),
    lote:     rpc('inserir_lote_staging_aberto'),
    validar:  rpc('validar_carga_aberto'),
    promover: rpc('promover_carga_aberto'),
  },
  'lancamentos-operacao': {
    limpar:   rpc('limpar_staging_operacao'),
    lote:     rpc('inserir_lote_staging_operacao'),
    validar:  rpc('validar_carga_operacao'),
    promover: rpc('promover_carga_operacao'),
  },
} as const

export type BaseComPipeline = keyof typeof RPCS_INGESTOR

/** Lista plana (única) — o que a role `ingestor` alcança. */
export const TODAS_RPCS_INGESTOR: readonly string[] = [
  ...new Set(Object.values(RPCS_INGESTOR).flatMap(b => Object.values(b))),
]
