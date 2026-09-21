// FONTE ÚNICA das RPCs que a credencial de máquina `ingestor` pode executar (v6.0.0/M2).
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
// Estado em 21/09/2026 (M2): só Vendas tem pipeline atômico hoje (0116/0118/0135). As outras
// quatro bases ganham `*_staging` + `promover_carga_*` na M5 e entram aqui no mesmo commit.

/** Marca de leitura para o derivador: devolve o próprio nome (sem chamar nada). */
const rpc = <T extends string>(nome: T): T => nome

export const RPCS_INGESTOR = {
  'vendas-produto': {
    limpar:   rpc('limpar_staging_vendas'),
    lote:     rpc('inserir_lote_staging'),
    validar:  rpc('validar_carga_staging'),
    promover: rpc('promover_carga_vendas'),
  },
} as const

export type BaseComPipeline = keyof typeof RPCS_INGESTOR

/** Lista plana (única) — o que a role `ingestor` alcança. */
export const TODAS_RPCS_INGESTOR: readonly string[] = [
  ...new Set(Object.values(RPCS_INGESTOR).flatMap(b => Object.values(b))),
]
