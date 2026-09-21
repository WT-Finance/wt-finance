import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Sonda C1 (v6.0.0/M1): a credencial que VERIFICA não é a que ESCREVE ─────────────────
// O incidente de 10/09/2026 zerou 306.261 linhas porque uma varredura de verificação rodou
// com `SUPABASE_SERVICE_ROLE_KEY` — a chave que pode tudo. A migration 0273 criou a role
// `verificador` (EXECUTE só na allowlist derivada da suíte) e esta sonda fecha a volta pelo
// lado do código: `SUPABASE_SERVICE_ROLE_KEY` só pode ser LIDA nos pontos declarados abaixo.
// Teste de contrato, script de medição ou varredura que voltar a lê-la reprova aqui, com
// o nome do arquivo.
//
// Molde: `sonda-teste-escreve-banco.test.ts` — análise ESTÁTICA do código-fonte, nunca leitura
// de saída de runner (lição da v5.10.1: sonda estática atravessa major do runner ilesa). E
// ALLOWLIST, não blacklist: todo arquivo de `src/`, `scripts/` e `supabase/` que contenha a
// forma consumidora `process.env.SUPABASE_SERVICE_ROLE_KEY` tem de estar declarado com o
// motivo. Citar o NOME da variável em prosa/comentário não é consumir — o que se casa é a
// leitura do `process.env`.

const RAIZ_REPO = fileURLToPath(new URL('../../', import.meta.url))
const ESTE_ARQUIVO = 'src/lib/sonda-credencial.test.ts'
const RAIZES = ['src', 'scripts', 'supabase']
const EXTENSOES_CODIGO = /\.(ts|tsx|mjs|cjs|js)$/

/** A forma CONSUMIDORA. `process.env.` literal de propósito (menção em string/prosa não conta). */
const LE_SERVICE_ROLE = /process\.env\.SUPABASE_SERVICE_ROLE_KEY/
/** A credencial de verificação — o que a suíte e as medições passam a usar. */
const LE_VERIFICADOR = /process\.env\.SUPABASE_VERIFICADOR_KEY/

/**
 * PONTOS DECLARADOS — lista FECHADA. Acrescentar aqui é decisão consciente e vai para o ADR:
 * cada entrada diz POR QUE aquele arquivo precisa da chave que pode tudo.
 */
const PONTOS_DECLARADOS: Record<string, string> = {
  'src/lib/supabase/admin.ts':
    'o cliente admin da APLICAÇÃO (Server Actions, rotas, Storage, Auth Admin) — é o uso legítimo da chave: o app escreve',
  'src/lib/api-externa/contrato-api-externa.test.ts':
    'exceção conhecida (v5.4.0): fixture role/tipo/chave `ZZ_TESTE_API_V540` precisa estar COMMITADA para o PostgREST ver; ' +
    'criar/apagar fixture é escrita real → service_role, em beforeAll/afterAll',
  'scripts/credencial/bootstrap-usuario-maquina.mjs':
    'bootstrap (uma vez) do usuário de máquina: `auth.admin.createUser` só existe com service_role — é ato administrativo, ' +
    'igual à tela de acessos',
}

/** Quem tem de usar a credencial de VERIFICAÇÃO (exemplo positivo — se a regex parar de casar, a sonda vira decoração). */
const USAM_VERIFICADOR = [
  'src/lib/rpc-contrato.test.ts',
  'scripts/dre-oracle.mjs',
]

function arquivosDeCodigo(dir: string): string[] {
  const resultado: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue
      resultado.push(...arquivosDeCodigo(caminho))
    } else if (entrada.isFile() && EXTENSOES_CODIGO.test(caminho)) resultado.push(caminho)
  }
  return resultado
}

type Alvo = { arquivo: string; texto: string }
const TODOS: Alvo[] = RAIZES
  .flatMap(raiz => arquivosDeCodigo(join(RAIZ_REPO, raiz)))
  .map(abs => ({ arquivo: relative(RAIZ_REPO, abs).replace(/\\/g, '/'), texto: readFileSync(abs, 'utf8') }))
  .filter(a => a.arquivo !== ESTE_ARQUIVO)

const CONSOMEM_SERVICE_ROLE = TODOS.filter(a => LE_SERVICE_ROLE.test(a.texto)).map(a => a.arquivo).sort()

describe('sonda C1 — SUPABASE_SERVICE_ROLE_KEY só nos pontos declarados (v6.0.0/M1)', () => {
  it('a sonda ENXERGA o exemplo positivo (o cliente admin da aplicação)', () => {
    expect(CONSOMEM_SERVICE_ROLE).toContain('src/lib/supabase/admin.ts')
  })

  it('todo consumidor da chave de serviço está DECLARADO com motivo (arquivo novo reprova)', () => {
    const naoDeclarados = CONSOMEM_SERVICE_ROLE.filter(a => !(a in PONTOS_DECLARADOS))
    expect(
      naoDeclarados,
      `Lê SUPABASE_SERVICE_ROLE_KEY fora dos pontos declarados: ${naoDeclarados.join(', ')}. ` +
      'Verificação, medição e varredura usam SUPABASE_VERIFICADOR_KEY (role `verificador`, 0273). ' +
      'Se for um uso administrativo legítimo, declare-o em PONTOS_DECLARADOS com o motivo — e no ADR.',
    ).toEqual([])
  })

  it('todo ponto declarado AINDA consome a chave (lista não acumula entrada morta)', () => {
    const mortos = Object.keys(PONTOS_DECLARADOS).filter(a => !CONSOMEM_SERVICE_ROLE.includes(a))
    expect(mortos, `Declarado mas não lê mais a chave (ou foi removido): ${mortos.join(', ')}`).toEqual([])
  })

  it('a suíte de contrato e as medições usam a credencial de VERIFICAÇÃO, não a de serviço', () => {
    for (const arquivo of USAM_VERIFICADOR) {
      const texto = readFileSync(join(RAIZ_REPO, arquivo), 'utf8')
      expect(LE_VERIFICADOR.test(texto), `${arquivo}: não lê SUPABASE_VERIFICADOR_KEY`).toBe(true)
      expect(LE_SERVICE_ROLE.test(texto), `${arquivo}: ainda lê SUPABASE_SERVICE_ROLE_KEY`).toBe(false)
    }
  })

  it('nenhum teste de contrato REST (fora da exceção declarada) consome a chave de serviço', () => {
    const testesComServiceRole = CONSOMEM_SERVICE_ROLE.filter(a => a.endsWith('.test.ts') && !(a in PONTOS_DECLARADOS))
    expect(testesComServiceRole).toEqual([])
  })
})
