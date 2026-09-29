import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Sonda ESTATICA do cliente de entrega das RPAs (v6.1.0/M4). Nao executa PowerShell (a sessao nao
// consegue, e o CI e Linux): e uma rede contra regressao obvia, nao um parser de PowerShell. A
// execucao real e o GATE do Yan, no Windows. Roda em `npm test` (vitest.config inclui
// scripts/**/*.test.mjs).

const DIR = dirname(fileURLToPath(import.meta.url))
const bytesPs1 = readFileSync(join(DIR, 'entregar-ingestao.ps1'))
const ps1 = bytesPs1.toString('latin1') // 1 byte = 1 char: nenhum byte alto some na decodificacao
const readme = readFileSync(join(DIR, 'README.md'), 'utf8')
const runbook = readFileSync(join(DIR, '../../docs/runbooks/chaves-rpa-runbook.md'), 'utf8')

/** Codigos de saida documentados (briefing 4-D) — 0 e sucesso, os demais sao falha. */
const CODIGOS = [0, 1, 2, 3, 4, 5]

/** Posicao de um marcador — falha com mensagem clara se sumiu (nunca `slice(-1, ...)`). */
function posicao(texto, marcador, aPartirDe = 0) {
  const i = texto.indexOf(marcador, aPartirDe)
  expect(i, `marcador ausente no texto: ${marcador}`).toBeGreaterThan(-1)
  return i
}

/** Trecho entre dois marcadores (o do fim e procurado DEPOIS do do inicio). */
function trecho(texto, inicio, fim) {
  const a = posicao(texto, inicio)
  const b = posicao(texto, fim, a + inicio.length)
  return texto.slice(a, b)
}

/** Codigo PowerShell sem comentarios e sem o conteudo de strings — para procurar OPERADORES. */
function codigoPuro(fonte) {
  return fonte
    .replace(/<#[\s\S]*?#>/g, '')
    .split(/\r?\n/)
    .map(l => l.replace(/'[^'\r\n]*'/g, "''").replace(/"[^"\r\n]*"/g, '""').replace(/#.*$/, ''))
    .join('\n')
}

/** Secao `## <titulo...>` do README, sem o cabecalho. */
function secaoReadme(titulo) {
  const i = readme.search(new RegExp(`^## ${titulo}`, 'm'))
  expect(i, `secao do README ausente: ${titulo}`).toBeGreaterThan(-1)
  const resto = readme.slice(i + 3)
  const prox = resto.search(/^## /m)
  return prox === -1 ? resto : resto.slice(0, prox)
}

const linhasPad = texto => texto.split(/\r?\n/).filter(l => /^powershell\.exe /.test(l))

describe('entregar-ingestao.ps1 — arquivo', () => {
  it('e ASCII puro (o PowerShell 5.1 le .ps1 sem BOM como ANSI: acento vira lixo)', () => {
    const altos = []
    bytesPs1.forEach((b, i) => { if (b >= 0x80) altos.push(i) })
    expect(altos.slice(0, 5)).toEqual([])
  })

  it('nao tem BOM nem CRLF misturado com LF (so LF ou so CRLF)', () => {
    expect(bytesPs1[0]).not.toBe(0xEF)
    const crlf = (ps1.match(/\r\n/g) ?? []).length
    const lf = (ps1.match(/\n/g) ?? []).length
    expect(crlf === 0 || crlf === lf).toBe(true)
  })
})

describe('entregar-ingestao.ps1 — so recursos do PowerShell 5.1', () => {
  const PROIBIDOS = [
    ['-SkipHttpErrorCheck', /-SkipHttpErrorCheck/i],
    ['-StatusCodeVariable', /-StatusCodeVariable/i],
    ['-AsHashtable', /-AsHashtable/i],
    ['ConvertFrom-Json -Depth', /ConvertFrom-Json[^\r\n|]*-Depth/i],
    ['operador ??', /\?\?/],
    ['ForEach-Object -Parallel', /-Parallel\b/i],
  ]
  for (const [nome, re] of PROIBIDOS) {
    it(`nao usa ${nome}`, () => { expect(re.test(ps1)).toBe(false) })
  }

  // Operadores do PowerShell 7 — procurados so no CODIGO (fora de comentario e de string, onde `?` e `|`
  // aparecem legitimamente em regex e mensagens).
  const puro = codigoPuro(ps1)
  it('nao usa o operador null-condicional ?. nem ?[ (PowerShell 7)', () => {
    expect(/\?\.\w|\?\[/.test(puro)).toBe(false)
  })
  it('nao usa o ternario `cond ? a : b` (PowerShell 7)', () => {
    expect(/\s\?\s[^\r\n]*\s:\s/.test(puro)).toBe(false)
  })
  it('nao usa && nem || de pipeline (PowerShell 7)', () => {
    expect(/&&|\|\|/.test(puro)).toBe(false)
  })
  it('a propria sonda enxerga o que procura (controle positivo do codigoPuro)', () => {
    expect(/\s\?\s[^\r\n]*\s:\s/.test(codigoPuro('$x = $a ? 1 : 2'))).toBe(true)
    expect(/&&|\|\|/.test(codigoPuro("Get-A && Get-B"))).toBe(true)
    expect(/&&|\|\|/.test(codigoPuro("$x = 'a || b' # c && d"))).toBe(false)
  })

  it('nao declara parametro Mandatory (em execucao sem console o PowerShell ficaria esperando prompt)', () => {
    expect(/Mandatory/i.test(ps1)).toBe(false)
  })

  it('nao liga Set-StrictMode (corpo de erro sem "erro" tem de devolver $null, nao lancar)', () => {
    expect(/^\s*Set-StrictMode/im.test(ps1)).toBe(false)
  })

  it('forca TLS 1.2, desembrulha a WebException e manda o corpo como bytes UTF-8', () => {
    expect(ps1).toMatch(/SecurityProtocol\s*=\s*\[Net\.SecurityProtocolType\]::Tls12/)
    expect(ps1).toMatch(/System\.Net\.WebException/)
    expect(ps1).toMatch(/\$ex\.Response/)
    expect(ps1).toMatch(/InnerException/) // desembrulha a WebException (MethodInvocationException)
    expect(ps1).toMatch(/GetBytes\(/)
    expect(ps1).toMatch(/ConvertTo-Json\s+-Depth\s+10/)
  })
})

describe('entregar-ingestao.ps1 — contrato', () => {
  it('cada codigo de saida documentado existe no script (return N / Sair-Com N) e na tabela do cabecalho', () => {
    for (const n of CODIGOS.filter(c => c !== 0)) {
      expect(ps1, `codigo ${n} sem "return ${n}"`).toMatch(new RegExp(`return\\s+${n}\\b`))
    }
    expect(ps1).toMatch(/Sair-Com\s+0\b/)
    for (const n of CODIGOS) {
      expect(ps1, `codigo ${n} fora da tabela do cabecalho`).toMatch(new RegExp(`^\\s+${n}\\s+-\\s`, 'm'))
    }
  })

  it('Obter-CodigoSaida mapeia status -> codigo: 401/403=3, 413=5, 422=2, 409+DEPENDENCIA_AUSENTE=4, resto=1', () => {
    const corpo = trecho(ps1, 'function Obter-CodigoSaida', 'function Invoke-ComRetentativa')
    expect(corpo).toMatch(/\$s -eq 401 -or \$s -eq 403\) \{ return 3 \}/)
    expect(corpo).toMatch(/if \(\$s -eq 413\) \{ return 5 \}/)
    expect(corpo).toMatch(/if \(\$s -eq 422\) \{ return 2 \}/)
    expect(corpo).toMatch(/if \(\$s -eq 409\) \{[\s\S]*?'DEPENDENCIA_AUSENTE'\) \{ return 4 \}\s*return 1\s*\}/)
    // o PUT nunca vira 3 (401/403 do Storage e token de URL, nao a chave)
    expect(corpo).toMatch(/if \(\$Passo -eq 'put'\) \{[\s\S]*?return 1\s*\}/)
    // o resto cai em 1
    expect(corpo.trimEnd()).toMatch(/return 1\s*\}$/)
  })

  it('manda "confirmar" com o valor falso EXPLICITO (o default do servidor e true) e so vira true por -Aplicar', () => {
    expect(ps1).toMatch(/\$confirmar\s*=\s*\$false/)
    expect(ps1).toMatch(/confirmar\s*=\s*\$confirmar/)
    expect(ps1).toMatch(/if\s*\(\$Aplicar\)\s*\{\s*\$confirmar\s*=\s*\$true\s*\}/)
  })

  it('assert de modo: a condicao testa aplicada SEM -Aplicar e conferida COM -Aplicar, e ambas saem FATAL (codigo 1)', () => {
    const corpo = trecho(ps1, '# ---- 6. assert de modo', "$linhas = ''")
    expect(corpo).toMatch(/if \(\(-not \$Aplicar\) -and \$status -eq 'aplicada'\) \{\s*Sair-Com 1 \('FATAL:[^\r\n]*CONFERENCIA[^\r\n]*aplicada/)
    expect(corpo).toMatch(/if \(\$Aplicar -and \$status -eq 'conferida'\) \{\s*Sair-Com 1 \('FATAL:[^\r\n]*APLICAR[^\r\n]*conferida/)
    // status fora dos dois valores tambem e falha (nunca "ok por omissao")
    expect(corpo).toMatch(/\$status -ne 'aplicada' -and \$status -ne 'conferida'\) \{\s*Sair-Com 1/)
  })

  it('cabecalhos do contrato: origem rpa-pad, um UUID de idempotencia por execucao e PUT sem cabecalhos', () => {
    expect(ps1).toMatch(/x-ingestao-origem/)
    expect(ps1).toMatch(/'rpa-pad'/)
    expect(ps1).toMatch(/x-ingestao-idempotencia/)
    expect(ps1).toMatch(/\[guid\]::NewGuid\(\)/)
    expect((ps1.match(/NewGuid\(\)/g) ?? []).length).toBe(1)
    const ini = posicao(ps1, "Invoke-ComRetentativa 'put'")
    const chamadaPut = ps1.slice(ini, posicao(ps1, '}', ini))
    expect(chamadaPut).not.toMatch(/Headers\s*=/)
  })

  it('sha256 por Get-FileHash em minusculas', () => {
    expect(ps1).toMatch(/Get-FileHash[^\r\n]*-Algorithm\s+SHA256/)
    expect(ps1).toMatch(/ToLowerInvariant\(\)/)
  })

  it('distingue os 409 pelo erro.codigo do corpo e nao retenta DEPENDENCIA_AUSENTE', () => {
    const classif = trecho(ps1, 'function Classificar-Resposta', 'function Obter-CodigoSaida')
    expect(classif).toMatch(/CARGA_EM_ANDAMENTO/)
    expect(classif).not.toMatch(/DEPENDENCIA_AUSENTE/)
    expect(classif).toMatch(/already exists\|Duplicate/)
  })

  it('retentativa: 4 tentativas, esperas 5/15/45 s', () => {
    expect(ps1).toMatch(/\$script:MaxTentativas = 4\b/)
    expect(ps1).toMatch(/\$script:Esperas = @\(5, 15, 45\)/)
  })

  it('-Log e obrigatorio em Operacao, e o log sem RESUMO e recusado', () => {
    expect(ps1).toMatch(/\$Base -eq 'lancamentos-operacao' -and -not \$Log\) \{ Sair-Com 1/)
    expect(ps1).toMatch(/\$null -eq \$resumo\) \{ Sair-Com 1 '[^']*sem linha RESUMO/)
  })

  it('falha do passo carga com -Aplicar avisa RESULTADO INCERTO e toda falha carrega o carga_id', () => {
    const falhar = trecho(ps1, 'function Falhar-Http', 'function Invoke-Entrega')
    expect(falhar).toMatch(/carga_id/)
    expect(falhar).toMatch(/\$Passo -eq 'carga' -and \$Aplicar -and \$codigo -eq 1/)
    expect(falhar).toMatch(/RESULTADO INCERTO/)
    expect(ps1).toMatch(/carga_id = \$script:CargaId/) // envelope do .resposta.json de erro de rede
    expect(ps1).toMatch(/\$script:CargaId = \$cargaId/)
  })

  it('apaga o .resposta.json antigo no inicio da execucao', () => {
    expect(ps1).toMatch(/Remove-Item -LiteralPath \(\$script:PrimeiroArquivo \+ '\.resposta\.json'\)/)
  })

  it('a chave so aparece na montagem do header e em Ocultar-Chave (nenhuma outra linha a referencia)', () => {
    const PERMITIDAS = [
      /^\s*\$script:ChaveSecreta = ''/,
      /\$script:ChaveSecreta\.Length -ge 4\) \{ \$Texto = \$Texto\.Replace\(\$script:ChaveSecreta, '\*\*\*'\) \}/,
      /^\s*\$chave = Obter-Chave \$ChaveEnv\s*$/,
      /^\s*\$script:ChaveSecreta = \$chave\s*$/,
      /^\s*'x-api-key'\s*=\s*\$chave\s*$/,
    ]
    const usos = ps1.split(/\r?\n/)
      .filter(l => !/^\s*#/.test(l))
      .filter(l => /\$chave\b|\$script:ChaveSecreta/i.test(l))
    expect(usos.length).toBeGreaterThanOrEqual(5) // controle: a sonda enxerga os usos legitimos
    for (const l of usos) {
      expect(PERMITIDAS.some(re => re.test(l)), `referencia a chave fora do permitido: ${l.trim()}`).toBe(true)
    }
  })

  it('nenhuma linha de escrita em saida/disco usa a chave ou os cabecalhos', () => {
    const linhas = ps1.split(/\r?\n/).filter(l => /Write-(Host|Output|Verbose|Warning|Error|Debug)|WriteLine|Out-File|Set-Content|Add-Content|WriteAllText/i.test(l))
    expect(linhas.length).toBeGreaterThan(0)
    for (const l of linhas) {
      expect(l, `linha escreve a chave: ${l.trim()}`).not.toMatch(/\$chave\b|\$script:ChaveSecreta|\$cabecalhos/i)
    }
  })
})

describe('entregar-ingestao.ps1 — ordem de execucao, log e resposta (o que se prova sem PowerShell)', () => {
  it('o .resposta.json antigo e apagado ANTES da primeira chamada de rede', () => {
    const remover = posicao(ps1, "Remove-Item -LiteralPath ($script:PrimeiroArquivo + '.resposta.json')")
    const primeiraChamada = ps1.search(/Invoke-ComRetentativa '/)
    expect(primeiraChamada, 'nenhuma chamada Invoke-ComRetentativa com passo literal').toBeGreaterThan(-1)
    expect(remover).toBeLessThan(primeiraChamada)
  })

  it('o log e lido e conferido ANTES da primeira chamada de rede (log inconsistente nunca chega ao servidor)', () => {
    const lerLog = posicao(ps1, 'Ler-LogPuladas $caminhoLog')
    expect(lerLog).toBeLessThan(ps1.search(/Invoke-ComRetentativa '/))
  })

  it('-Log passa por Resolve-Path como os arquivos', () => {
    expect(ps1).toMatch(/\$caminhoLog = \(Resolve-Path -LiteralPath \$Log\)\.ProviderPath/)
  })

  it('o parse do log corta nos tetos do Zod do servidor: motivo 500, operacao 300, 20 ids, id 100', () => {
    expect(ps1).toMatch(/\$script:LimiteMotivo = 500\b/)
    expect(ps1).toMatch(/\$script:LimiteOperacao = 300\b/)
    expect(ps1).toMatch(/\$script:LimiteIds = 20\b/)
    expect(ps1).toMatch(/\$script:LimiteIdChars = 100\b/)
    const parse = trecho(ps1, 'function Ler-LogPuladas', 'function Converter-Json')
    expect(parse).toMatch(/Cortar-Texto \$operacao \$script:LimiteOperacao/)
    expect(parse).toMatch(/Cortar-Texto \(\(\$status -replace [^\r\n]*\) \$script:LimiteMotivo/)
    expect(parse).toMatch(/Cortar-Texto \(\$campos\[\$k - 1\]\.Trim\(\)\) \$script:LimiteIdChars/)
    expect(parse).toMatch(/\$ids\.Count -gt \$script:LimiteIds/)
  })

  it('o parse reconhece status so com maiusculas (-cmatch) e ignora cabecalho pelo campo de status', () => {
    const parse = trecho(ps1, 'function Ler-LogPuladas', 'function Converter-Json')
    expect(parse).toMatch(/-cmatch '\^\(OK\|PULADA\)\\b'/)
    expect(parse).toMatch(/\$campos\[2\]\.Trim\(\) -ieq 'status'\) \{ continue \}/)
    expect(parse).not.toMatch(/-ieq 'operacao'/)
  })

  it('operacoes_removidas: ausente nao imprime, presente e null imprime NAO_MEDIDO (PSObject.Properties)', () => {
    expect(ps1).toMatch(/\$j3\.diff\.PSObject\.Properties\['operacoes_removidas'\]/)
    expect(ps1).toMatch(/\$null -eq \$propRemovidas\.Value\) \{ \$ok = \$ok \+ ' operacoes_removidas=NAO_MEDIDO' \}/)
  })

  it('500 da promocao (estado incerto) e 5xx: retenta e, esgotado, sai 1 (nunca 2)', () => {
    const classif = trecho(ps1, 'function Classificar-Resposta', 'function Obter-CodigoSaida')
    expect(classif).toMatch(/\$s -ge 500 -or \$s -eq 429\) \{ return 'transitorio' \}/)
    const saida = trecho(ps1, 'function Obter-CodigoSaida', 'function Invoke-ComRetentativa')
    expect(saida).not.toMatch(/-ge 500|-eq 500/) // 500 cai no "return 1" final, nao em 2
  })
})

describe('README.md e runbook — mesma tabela de codigos, conferencia x aplicacao', () => {
  it('README: NAO_MEDIDO pede conferencia manual e o codigo 2 e so 422', () => {
    expect(readme).toMatch(/NAO_MEDIDO/)
    expect(readme).toMatch(/manualmente/)
    expect(readme).toMatch(/\| `2` \|[^\n]*s[óo] HTTP 422/)
  })

  it('lista os 6 codigos de saida (tabela `| N |`)', () => {
    for (const n of CODIGOS) {
      expect(readme, `codigo ${n} fora da tabela do README`).toMatch(new RegExp(`\\|\\s*\`${n}\`\\s*\\|`))
    }
  })

  it('cita as 4 variaveis de ambiente e aponta para o runbook', () => {
    for (const v of ['JANUS_CHAVE_RPA_VENDAS', 'JANUS_CHAVE_RPA_LANCAMENTOS', 'JANUS_CHAVE_RPA_OPERACAO', 'JANUS_CHAVE_RPA_DEMONSTRATIVO']) {
      expect(readme).toContain(v)
    }
    expect(readme).toContain('chaves-rpa-runbook.md')
  })

  it('NENHUMA linha do bloco de conferencia termina em -Aplicar (nem a contem): o Yan copia e cola', () => {
    const conferencia = linhasPad(secaoReadme('A linha que o PAD executa'))
    expect(conferencia.length).toBeGreaterThanOrEqual(5) // vendas, movimentacao, aberto, operacao, demonstrativo
    for (const l of conferencia) {
      expect(l, `linha de conferencia com -Aplicar: ${l.slice(0, 120)}`).not.toMatch(/-Aplicar/)
    }
  })

  it('o -Aplicar tem bloco proprio, sinalizado, e a linha de Operacao carrega -Log e -ChaveEnv', () => {
    const aplicar = secaoReadme('Aplicar')
    expect(aplicar).toMatch(/s[óo] depois de conferir/i)
    const linhas = linhasPad(aplicar)
    expect(linhas.length).toBeGreaterThanOrEqual(1)
    expect(linhas.some(l => /-Log [^\n]*-ChaveEnv [^\n]*-Aplicar\s*$/.test(l))).toBe(true)
    // e o README so ensina -Aplicar em linha de comando nessa secao
    const todas = linhasPad(readme)
    expect(todas.filter(l => /-Aplicar\s*$/.test(l)).length).toBe(linhas.filter(l => /-Aplicar\s*$/.test(l)).length)
  })

  it('a linha de Operacao do PAD passa -Log e -ChaveEnv, e todo -ExtraidoEm dos exemplos e o marcador', () => {
    const todas = linhasPad(readme)
    expect(todas.some(l => /-Base lancamentos-operacao [^\n]*-Log [^\n]*-ChaveEnv /.test(l))).toBe(true)
    for (const l of todas) {
      expect(l, `exemplo sem o marcador de -ExtraidoEm: ${l.slice(0, 100)}`).toContain('-ExtraidoEm <AAAA-MM-DDTHH:MM:SS-03:00>')
    }
  })

  it('README documenta o resultado INCERTO do exit 1 com -Aplicar e a variavel ausente como exit 1', () => {
    expect(readme).toMatch(/INCERTO/)
    expect(readme).toMatch(/ausente ou vazia[^\n]*`1`|`1`[^\n]*ausente ou vazia/)
  })

  it('o runbook nao promete exit 3 / 401 para variavel de ambiente ausente (o cliente recusa antes da rede)', () => {
    expect(runbook).not.toMatch(/exit `3`, `401 AUTH_AUSENTE`/)
    expect(runbook).toMatch(/esta ausente ou vazia/)
  })
})
