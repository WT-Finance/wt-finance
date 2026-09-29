<#
entregar-ingestao.ps1 - cliente de entrega das RPAs ao Janus (contrato de ingestao v1).

Unica implementacao dos tres passos do contrato fora do card de /admin/uploads:
  (1) POST {url}/api/ingestao/{base}/upload-url   -> URLs assinadas
  (2) PUT  <signed_url>                           -> bytes crus no bucket
  (3) POST {url}/api/ingestao/{base}              -> a carga (conferencia ou aplicacao)
O Power Automate Desktop so chama este script e le o codigo de saida.

Windows PowerShell 5.1 (o que vem no Windows). ESTE ARQUIVO E ASCII PURO DE PROPOSITO: o 5.1 le
.ps1 sem BOM como ANSI, entao qualquer acento em comentario ou string vira lixo.

Parametros
  -Url         base da producao (https://...; sem barra final obrigatoria)
  -Base        demonstrativo-competencia | vendas-produto | lancamentos-movimentacao |
               lancamentos-aberto | lancamentos-operacao
  -Arquivos    1..N caminhos (so vendas-produto aceita mais de 1). Com powershell.exe -File a lista
               chega como UM texto: separe os caminhos por | (pipe) dentro de um unico par de aspas.
  -ChaveEnv    NOME da variavel de ambiente que guarda a chave (nunca a chave)
  -Log         (so lancamentos-operacao) o .log da RPA; as linhas PULADA viram "puladas"
  -ExtraidoEm  ISO-8601 com fuso (ex.: 2026-09-29T09:58:00-03:00); opcional
  -Aplicar     switch. SEM ele o script so CONFERE (confirmar=false) e nada e gravado.

Codigos de saida (o que o PAD le)
  0 - aplicada ou conferida (bateu com o modo pedido)
  1 - qualquer outra falha (validacao local, rede, 5xx, 429, log inconsistente, assert de modo)
  2 - rejeitada pelo servidor (HTTP 422)
  3 - chave invalida ou sem escopo (HTTP 401 ou 403)
  4 - grafo: 409 DEPENDENCIA_AUSENTE (a base anterior do dia nao foi carregada)
  5 - arquivo grande demais (HTTP 413)
Em todo codigo diferente de 0 ha UMA linha no stderr. A resposta do ultimo passo vai para
<primeiro-arquivo>.resposta.json. A chave nunca e impressa nem gravada.
#>
[CmdletBinding()]
param(
    [string]$Url,
    [string]$Base,
    [string[]]$Arquivos,
    [string]$ChaveEnv,
    [string]$Log,
    [string]$ExtraidoEm,
    [switch]$Aplicar
)

# Sem Set-StrictMode de proposito: corpo de erro sem "erro" precisa devolver $null, nao lancar.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# PowerShell 5.1 nao negocia TLS 1.2 sozinho em todo Windows.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::Expect100Continue = $false

$script:MaxTentativas = 3                 # por passo
$script:Esperas = @(5, 15, 45)            # segundos entre tentativas (crescente)
$script:TimeoutJsonSeg = 120              # passo 1
$script:TimeoutPutSeg = 900               # passo 2 (ate 50 MB)
$script:TimeoutCargaSeg = 900             # passo 3 (Vendas processa por minutos)
$script:Origem = 'rpa-pad'                # a origem e amarrada a credencial (errata 4(g))
$script:ChaveSecreta = ''
$script:PrimeiroArquivo = $null

$BASES_VALIDAS = @('demonstrativo-competencia', 'vendas-produto', 'lancamentos-movimentacao', 'lancamentos-aberto', 'lancamentos-operacao')

# ---------------------------------------------------------------- saida e mensagens

function Ocultar-Chave {
    param([string]$Texto)
    if ([string]::IsNullOrEmpty($Texto)) { return '' }
    if ($script:ChaveSecreta.Length -ge 4) { $Texto = $Texto.Replace($script:ChaveSecreta, '***') }
    return $Texto
}

# Uma linha no stderr (codigo diferente de 0) ou no stdout (0), e sai. Ponto unico de saida.
function Sair-Com {
    param([int]$Codigo, [string]$Mensagem)
    $linha = (Ocultar-Chave $Mensagem) -replace '[\r\n]+', ' '
    if ($Codigo -eq 0) { [Console]::Out.WriteLine($linha) } else { [Console]::Error.WriteLine($linha) }
    exit $Codigo
}

# ---------------------------------------------------------------- validacao local

function Obter-Chave {
    param([string]$NomeVariavel)
    if ([string]::IsNullOrWhiteSpace($NomeVariavel)) { Sair-Com 1 'ERRO: informe -ChaveEnv com o NOME da variavel de ambiente que guarda a chave.' }
    # Nunca ecoar o valor de -ChaveEnv se parecer a propria chave.
    if ($NomeVariavel -like 'jns_*') { Sair-Com 1 'ERRO: -ChaveEnv recebeu algo que parece uma chave; passe o NOME da variavel de ambiente, nunca a chave.' }
    if ($NomeVariavel -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { Sair-Com 1 'ERRO: -ChaveEnv precisa ser o NOME de uma variavel de ambiente (letras, digitos e _).' }
    $valor = [Environment]::GetEnvironmentVariable($NomeVariavel, 'User')
    if ([string]::IsNullOrWhiteSpace($valor)) { $valor = [Environment]::GetEnvironmentVariable($NomeVariavel, 'Process') }
    if ([string]::IsNullOrWhiteSpace($valor)) { Sair-Com 1 ('ERRO: a variavel de ambiente ' + $NomeVariavel + ' esta ausente ou vazia.') }
    $valor = $valor.Trim()
    if ($valor -match '\s') { Sair-Com 1 ('ERRO: a variavel de ambiente ' + $NomeVariavel + ' contem espaco ou quebra de linha.') }
    return $valor
}

function Existe-Arquivo {
    param([string]$Caminho)
    # Test-Path pode lancar em caminho com caractere invalido; aqui isso e apenas "nao existe".
    try { return [bool](Test-Path -LiteralPath $Caminho -PathType Leaf -ErrorAction Stop) } catch { return $false }
}

# Com powershell.exe -File a lista chega como UM texto. Separa SEMPRE por | (forma documentada:
# | nunca faz parte de um caminho valido do Windows, entao nao ha perda). Por tolerancia, o pedaco
# que nao existe e reaberto por ; e , (o texto inteiro, se existir, vale como um arquivo so).
function Expandir-Arquivos {
    param([string[]]$Itens)
    $lista = New-Object System.Collections.Generic.List[string]
    foreach ($item in $Itens) {
        if ([string]::IsNullOrWhiteSpace($item)) { continue }
        foreach ($parte in ($item -split '\|')) {
            $p = $parte.Trim().Trim('"')
            if ($p -eq '') { continue }
            if (Existe-Arquivo $p) { [void]$lista.Add($p); continue }
            foreach ($sub in ($p -split '[;,]')) {
                $s = $sub.Trim().Trim('"')
                if ($s -ne '') { [void]$lista.Add($s) }
            }
        }
    }
    return , $lista.ToArray()
}

# ---------------------------------------------------------------- log da RPA (Operacao)

function Ler-TextoDoLog {
    param([string]$Caminho)
    $bytes = [IO.File]::ReadAllBytes($Caminho)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        return [Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
    }
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        return [Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)
    }
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
        return [Text.Encoding]::BigEndianUnicode.GetString($bytes, 2, $bytes.Length - 2)
    }
    try {
        $estrito = New-Object System.Text.UTF8Encoding($false, $true)   # lanca em byte invalido
        return $estrito.GetString($bytes)
    }
    catch {
        return [Text.Encoding]::GetEncoding(1252).GetString($bytes)
    }
}

# Formato (uma linha por operacao): operacao;id;status;entradas;saidas;leituras
# status = OK | PULADA - <motivo>. Ultima linha: RESUMO;;puladas=N;;;
# Devolve @{ Puladas = object[] de @{Operacao;Ids;Motivo}; Resumo = N ou $null }.
function Ler-LogPuladas {
    param([string]$Caminho)
    $texto = Ler-TextoDoLog $Caminho
    $puladas = New-Object System.Collections.Generic.List[object]
    $resumo = $null
    foreach ($bruta in ($texto -split '\r?\n')) {
        $linha = $bruta.Trim()
        if ($linha -eq '') { continue }
        $campos = $linha -split ';'
        if ($campos[0].Trim() -ceq 'RESUMO') {
            $textoResumo = ''
            if ($campos.Count -ge 3) { $textoResumo = $campos[2].Trim() }
            if ($textoResumo -match '^puladas\s*=\s*(\d+)$') { $resumo = [int]$Matches[1] }
            else { Sair-Com 1 'ERRO: log inconsistente - a linha RESUMO nao traz puladas=N.' }
            continue
        }
        $n = $campos.Count
        if ($n -lt 3) { continue }
        # o motivo pode conter ; - os 3 ultimos campos sao entradas;saidas;leituras
        $fimStatus = $n - 1
        if ($n -ge 6) { $fimStatus = $n - 4 }
        $status = ($campos[2..$fimStatus] -join ';').Trim()
        if ($status -notmatch '^PULADA\b') { continue }
        $operacao = $campos[0].Trim()
        if ($operacao -eq '') { Sair-Com 1 'ERRO: log inconsistente - linha PULADA sem nome de operacao.' }
        $motivo = ($status -replace '^PULADA\s*-?\s*', '').Trim()
        $id = $campos[1].Trim()
        $ids = @()
        if ($id -ne '') { $ids = @($id) }
        [void]$puladas.Add(@{ Operacao = $operacao; Ids = [object[]]$ids; Motivo = $motivo })
    }
    if ($null -ne $resumo -and $resumo -ne $puladas.Count) {
        Sair-Com 1 ('ERRO: log inconsistente - o RESUMO diz puladas=' + $resumo + ' mas ha ' + $puladas.Count + ' linhas PULADA.')
    }
    return @{ Puladas = [object[]]$puladas.ToArray(); Resumo = $resumo }
}

# ---------------------------------------------------------------- HTTP (HttpWebRequest, nunca lanca)

function Converter-Json {
    param([string]$Texto)
    if ([string]::IsNullOrWhiteSpace($Texto)) { return $null }
    try { return ($Texto | ConvertFrom-Json) } catch { return $null }   # corpo 5xx pode ser HTML
}

# Devolve @{ Status; Texto; Json; ErroRede }. Status 0 = falha de rede/timeout (sem resposta).
# Corpo lido como UTF-8 (o servidor nao declara charset) tanto no sucesso quanto no erro.
function Invoke-Http {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        [byte[]]$BodyBytes,
        [string]$ArquivoBody,
        [string]$ContentType,
        [int]$TimeoutSeg
    )
    $resultado = @{ Status = 0; Texto = ''; Json = $null; ErroRede = $null }
    $resp = $null
    try {
        $req = [System.Net.HttpWebRequest]::Create($Uri)
        $req.Method = $Method
        $req.Timeout = $TimeoutSeg * 1000
        $req.ReadWriteTimeout = $TimeoutSeg * 1000
        $req.AllowAutoRedirect = $false
        $req.KeepAlive = $false
        $req.UserAgent = 'janus-entregar-ingestao/1.0'
        if ($ContentType) { $req.ContentType = $ContentType }
        if ($Headers) {
            foreach ($nome in $Headers.Keys) { $req.Headers.Add([string]$nome, [string]$Headers[$nome]) }
        }
        if ($ArquivoBody) {
            $fs = [IO.File]::OpenRead($ArquivoBody)
            try {
                $req.AllowWriteStreamBuffering = $false     # nao carrega 50 MB na memoria
                $req.ContentLength = $fs.Length
                $saida = $req.GetRequestStream()
                try {
                    $buf = New-Object byte[] 81920
                    while (($lidos = $fs.Read($buf, 0, $buf.Length)) -gt 0) { $saida.Write($buf, 0, $lidos) }
                }
                finally { $saida.Close() }
            }
            finally { $fs.Close() }
        }
        elseif ($null -ne $BodyBytes) {
            $req.ContentLength = $BodyBytes.Length
            $saida = $req.GetRequestStream()
            try { $saida.Write($BodyBytes, 0, $BodyBytes.Length) } finally { $saida.Close() }
        }
        $resp = $req.GetResponse()
    }
    catch {
        # O PowerShell pode embrulhar a WebException (MethodInvocationException): desembrulha ate achar
        # a System.Net.WebException, para nao perder o corpo de um 401/403/409/422.
        $ex = $_.Exception
        $msgErro = $ex.Message
        while ($null -ne $ex -and -not ($ex -is [System.Net.WebException])) { $ex = $ex.InnerException }
        if ($null -ne $ex -and $null -ne $ex.Response) { $resp = $ex.Response }   # non-2xx: le o corpo
        else { $resultado.ErroRede = $msgErro }                                     # rede/timeout: sem resposta
    }
    if ($null -ne $resp) {
        try {
            $resultado.Status = [int]$resp.StatusCode
            $leitor = New-Object System.IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
            try { $resultado.Texto = $leitor.ReadToEnd() } finally { $leitor.Close() }
            $resultado.Json = Converter-Json $resultado.Texto
        }
        catch {
            if ($resultado.Status -eq 0) { $resultado.ErroRede = $_.Exception.Message }
        }
        finally { $resp.Close() }
    }
    return $resultado
}

function Obter-ErroDoCorpo {
    param($Res)
    $erro = $null
    if ($null -ne $Res.Json) { $erro = $Res.Json.erro }
    $codigo = ''
    $mensagem = ''
    if ($null -ne $erro) {
        if ($null -ne $erro.codigo) { $codigo = [string]$erro.codigo }
        if ($null -ne $erro.mensagem) { $mensagem = [string]$erro.mensagem }
    }
    return @{ Codigo = $codigo; Mensagem = $mensagem }
}

# 'ok' | 'transitorio' (retenta) | 'terminal'
# Distingue os 409 pelo erro.codigo do corpo, nao pelo status.
function Classificar-Resposta {
    param([string]$Passo, $Res)
    $s = $Res.Status
    if ($s -ge 200 -and $s -lt 300) { return 'ok' }
    if ($s -eq 0) { return 'transitorio' }
    if ($Passo -eq 'put' -and ($s -eq 400 -or $s -eq 409) -and ($Res.Texto -match 'already exists|Duplicate')) {
        return 'ok'    # objeto ja no bucket: o passo 3 reconfere o sha256
    }
    if ($s -ge 500 -or $s -eq 429) { return 'transitorio' }
    if ($s -eq 409) {
        $e = Obter-ErroDoCorpo $Res
        if ($e.Codigo -eq 'CARGA_EM_ANDAMENTO') { return 'transitorio' }
    }
    return 'terminal'
}

# Decisao do codigo de saida para uma resposta que nao e sucesso (apos as retentativas).
function Obter-CodigoSaida {
    param([string]$Passo, $Res)
    $s = $Res.Status
    if ($Passo -eq 'put') {
        # 401/403 do Storage e token de URL, nao a chave da RPA: nunca vira 3.
        if ($s -eq 413) { return 5 }
        return 1
    }
    if ($s -eq 401 -or $s -eq 403) { return 3 }
    if ($s -eq 413) { return 5 }
    if ($s -eq 422) { return 2 }
    if ($s -eq 409) {
        $e = Obter-ErroDoCorpo $Res
        if ($e.Codigo -eq 'DEPENDENCIA_AUSENTE') { return 4 }
        return 1
    }
    return 1
}

function Invoke-ComRetentativa {
    param([string]$Passo, [hashtable]$ParamsHttp)
    $res = $null
    for ($tentativa = 1; $tentativa -le $script:MaxTentativas; $tentativa++) {
        $res = Invoke-Http @ParamsHttp
        if ((Classificar-Resposta $Passo $res) -ne 'transitorio') { break }
        if ($tentativa -lt $script:MaxTentativas) {
            $indice = [Math]::Min($tentativa - 1, $script:Esperas.Count - 1)
            $espera = $script:Esperas[$indice]
            Write-Verbose ('passo ' + $Passo + ': tentativa ' + $tentativa + ' falhou (HTTP ' + $res.Status + '); nova tentativa em ' + $espera + 's')
            Start-Sleep -Seconds $espera
        }
    }
    return $res
}

# ---------------------------------------------------------------- resposta em disco e falha

function Salvar-Resposta {
    param([string]$Passo, $Res)
    if (-not $script:PrimeiroArquivo) { return }
    try {
        $destino = $script:PrimeiroArquivo + '.resposta.json'
        if ($null -ne $Res.Json -and -not [string]::IsNullOrWhiteSpace($Res.Texto)) {
            $conteudo = $Res.Texto
        }
        else {
            $conteudo = [ordered]@{ ok = $false; passo = $Passo; http_status = $Res.Status; erro_rede = $Res.ErroRede; corpo = $Res.Texto } | ConvertTo-Json -Depth 10
        }
        [IO.File]::WriteAllText($destino, (Ocultar-Chave $conteudo), (New-Object System.Text.UTF8Encoding($false)))
    }
    catch {
        [Console]::Error.WriteLine('AVISO: nao foi possivel gravar o arquivo .resposta.json.')
    }
}

function Falhar-Http {
    param([string]$Passo, $Res)
    Salvar-Resposta $Passo $Res
    $codigo = Obter-CodigoSaida $Passo $Res
    if ($Res.Status -eq 0) {
        $msg = 'ERRO: passo ' + $Passo + ' - falha de rede ou timeout apos ' + $script:MaxTentativas + ' tentativas: ' + $Res.ErroRede
    }
    else {
        $e = Obter-ErroDoCorpo $Res
        if ($e.Codigo -ne '' -or $e.Mensagem -ne '') {
            $msg = 'ERRO: passo ' + $Passo + ' - HTTP ' + $Res.Status + ' ' + $e.Codigo + ' ' + $e.Mensagem
        }
        else {
            $trecho = [string]$Res.Texto
            if ($trecho.Length -gt 200) { $trecho = $trecho.Substring(0, 200) }
            $msg = 'ERRO: passo ' + $Passo + ' - HTTP ' + $Res.Status + ' ' + $trecho
        }
    }
    Sair-Com $codigo $msg
}

# ---------------------------------------------------------------- fluxo principal

function Invoke-Entrega {
    # ---- 1. validacao local, antes de qualquer rede
    if ([string]::IsNullOrWhiteSpace($Base) -or ($BASES_VALIDAS -notcontains $Base)) {
        Sair-Com 1 ('ERRO: -Base deve ser uma de: ' + ($BASES_VALIDAS -join ', ') + '.')
    }
    if ([string]::IsNullOrWhiteSpace($Url)) { Sair-Com 1 'ERRO: informe -Url (base da producao).' }
    $baseUrl = $Url.Trim().TrimEnd('/')
    if ($baseUrl -notmatch '^https://[^/]+' -and $baseUrl -notmatch '^http://(localhost|127\.0\.0\.1)(:\d+)?$') {
        Sair-Com 1 'ERRO: -Url precisa ser https:// (a chave viaja no cabecalho).'
    }
    if ($null -eq $Arquivos -or $Arquivos.Count -eq 0) { Sair-Com 1 'ERRO: informe -Arquivos (1 ou mais caminhos).' }
    $caminhos = Expandir-Arquivos $Arquivos
    if ($caminhos.Count -eq 0) { Sair-Com 1 'ERRO: informe -Arquivos (1 ou mais caminhos).' }
    $itens = New-Object System.Collections.Generic.List[object]
    foreach ($c in $caminhos) {
        if (-not (Test-Path -LiteralPath $c -PathType Leaf)) { Sair-Com 1 ('ERRO: arquivo nao encontrado: ' + $c) }
        $completo = (Resolve-Path -LiteralPath $c).ProviderPath
        [void]$itens.Add(@{ Caminho = $completo; Nome = [IO.Path]::GetFileName($completo); Bytes = (Get-Item -LiteralPath $completo).Length; Sha256 = '' })
    }
    if ($itens.Count -gt 1 -and $Base -ne 'vendas-produto') {
        Sair-Com 1 ('ERRO: a base ' + $Base + ' aceita exatamente 1 arquivo (recebidos: ' + $itens.Count + ').')
    }
    $extEsperada = '.xlsx'
    if ($Base -eq 'lancamentos-operacao') { $extEsperada = '.csv' }
    foreach ($it in $itens) {
        if ([IO.Path]::GetExtension($it.Nome).ToLowerInvariant() -ne $extEsperada) {
            Sair-Com 1 ('ERRO: a base ' + $Base + ' so aceita arquivo ' + $extEsperada + ' - ' + $it.Nome)
        }
        if ($it.Bytes -le 0) { Sair-Com 1 ('ERRO: arquivo vazio: ' + $it.Nome) }
    }
    if ($Log -and $Base -ne 'lancamentos-operacao') { Sair-Com 1 'ERRO: -Log so vale para a base lancamentos-operacao.' }
    if ($Log -and -not (Test-Path -LiteralPath $Log -PathType Leaf)) { Sair-Com 1 ('ERRO: log nao encontrado: ' + $Log) }
    if ($ExtraidoEm -and $ExtraidoEm.Trim() -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$') {
        Sair-Com 1 'ERRO: -ExtraidoEm precisa ser ISO-8601 com fuso, ex.: 2026-09-29T09:58:00-03:00.'
    }
    $chave = Obter-Chave $ChaveEnv
    $script:ChaveSecreta = $chave
    $script:PrimeiroArquivo = $itens[0].Caminho

    # puladas: lido e conferido ANTES de qualquer rede (log inconsistente => codigo 1)
    $puladas = $null
    if ($Log) { $puladas = (Ler-LogPuladas $Log).Puladas }

    # ---- 2. sha256 (minusculas)
    foreach ($it in $itens) {
        $it.Sha256 = (Get-FileHash -LiteralPath $it.Caminho -Algorithm SHA256).Hash.ToLowerInvariant()
    }

    # Um x-ingestao-idempotencia por execucao, reutilizado em toda retentativa (errata 4(e)).
    $idempotencia = [guid]::NewGuid().ToString()
    $cabecalhos = @{
        'x-api-key'               = $chave
        'x-ingestao-origem'       = $script:Origem
        'x-ingestao-idempotencia' = $idempotencia
    }
    $tipoJson = 'application/json; charset=utf-8'
    $utf8 = New-Object System.Text.UTF8Encoding($false)

    # ---- 3. passo 1: URLs assinadas (o carga_id nasce aqui e vale para a execucao inteira)
    $declarados = @()
    foreach ($it in $itens) { $declarados += , ([ordered]@{ nome = $it.Nome; bytes = [long]$it.Bytes; sha256 = $it.Sha256 }) }
    $corpo1 = $utf8.GetBytes(([ordered]@{ arquivos = [object[]]$declarados } | ConvertTo-Json -Depth 10 -Compress))
    $res1 = Invoke-ComRetentativa 'upload-url' @{
        Method = 'POST'; Uri = ($baseUrl + '/api/ingestao/' + $Base + '/upload-url'); Headers = $cabecalhos
        BodyBytes = $corpo1; ContentType = $tipoJson; TimeoutSeg = $script:TimeoutJsonSeg
    }
    if ((Classificar-Resposta 'upload-url' $res1) -ne 'ok') { Falhar-Http 'upload-url' $res1 }
    $j1 = $res1.Json
    $cargaId = $null
    $assinados = @()
    if ($null -ne $j1) { $cargaId = [string]$j1.carga_id; $assinados = @($j1.arquivos) }
    if ([string]::IsNullOrWhiteSpace($cargaId) -or $assinados.Count -ne $itens.Count) {
        Sair-Com 1 'ERRO: passo upload-url - resposta fora do contrato (sem carga_id ou com numero de arquivos diferente).'
    }
    for ($i = 0; $i -lt $itens.Count; $i++) {
        if ([string]::IsNullOrWhiteSpace([string]$assinados[$i].path) -or [string]::IsNullOrWhiteSpace([string]$assinados[$i].signed_url) -or ([string]$assinados[$i].nome -cne $itens[$i].Nome)) {
            Sair-Com 1 'ERRO: passo upload-url - resposta fora do contrato (arquivo sem path/signed_url ou fora de ordem).'
        }
    }

    # ---- 4. passo 2: PUT dos bytes crus (sem x-api-key: a autorizacao e o token da URL)
    for ($i = 0; $i -lt $itens.Count; $i++) {
        $tipoArquivo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        if ($itens[$i].Nome.ToLowerInvariant().EndsWith('.csv')) { $tipoArquivo = 'text/csv' }
        $resPut = Invoke-ComRetentativa 'put' @{
            Method = 'PUT'; Uri = [string]$assinados[$i].signed_url; ArquivoBody = $itens[$i].Caminho
            ContentType = $tipoArquivo; TimeoutSeg = $script:TimeoutPutSeg
        }
        if ((Classificar-Resposta 'put' $resPut) -ne 'ok') { Falhar-Http 'put' $resPut }
    }

    # ---- 5. passo 3: a carga. confirmar SEMPRE explicito (o default do servidor e true).
    $confirmar = $false                      # conferencia: nada e aplicado
    if ($Aplicar) { $confirmar = $true }     # so com -Aplicar
    $arqs = @()
    for ($i = 0; $i -lt $itens.Count; $i++) {
        $arqs += , ([ordered]@{ path = [string]$assinados[$i].path; nome = $itens[$i].Nome; sha256 = $itens[$i].Sha256 })
    }
    $corpo3 = [ordered]@{ carga_id = $cargaId; arquivos = [object[]]$arqs; confirmar = $confirmar }
    if ($ExtraidoEm) { $corpo3['extraido_em'] = $ExtraidoEm.Trim() }
    if ($null -ne $puladas) {
        # so Operacao com -Log; nas outras bases o campo (ate []) e 422
        $pj = @()
        foreach ($p in $puladas) { $pj += , ([ordered]@{ operacao = $p.Operacao; ids = [object[]]$p.Ids; motivo = $p.Motivo }) }
        $corpo3['puladas'] = [object[]]$pj
    }
    $bytes3 = $utf8.GetBytes(($corpo3 | ConvertTo-Json -Depth 10 -Compress))
    $res3 = Invoke-ComRetentativa 'carga' @{
        Method = 'POST'; Uri = ($baseUrl + '/api/ingestao/' + $Base); Headers = $cabecalhos
        BodyBytes = $bytes3; ContentType = $tipoJson; TimeoutSeg = $script:TimeoutCargaSeg
    }
    if ((Classificar-Resposta 'carga' $res3) -ne 'ok') { Falhar-Http 'carga' $res3 }
    Salvar-Resposta 'carga' $res3

    # ---- 6. assert de modo (licao da v6.0.1): o servidor tem de ter feito o que ESTE modo pediu
    $j3 = $res3.Json
    $status = ''
    if ($null -ne $j3 -and $null -ne $j3.status) { $status = [string]$j3.status }
    if ((-not $Aplicar) -and $status -eq 'aplicada') {
        Sair-Com 1 ('FATAL: modo CONFERENCIA (sem -Aplicar) mas o servidor respondeu status aplicada (carga_id ' + $cargaId + '). Confira ingestao.carga agora.')
    }
    if ($Aplicar -and $status -eq 'conferida') {
        Sair-Com 1 ('FATAL: modo APLICAR mas o servidor respondeu status conferida (carga_id ' + $cargaId + '); nada foi aplicado.')
    }
    if ($status -ne 'aplicada' -and $status -ne 'conferida') {
        Sair-Com 1 'ERRO: passo carga - resposta 200 sem status aplicada/conferida.'
    }

    $linhas = ''
    if ($null -ne $j3.parse -and $null -ne $j3.parse.linhas) { $linhas = [string]$j3.parse.linhas }
    $ok = 'OK: status=' + $status + ' carga_id=' + $cargaId + ' base=' + $Base + ' linhas=' + $linhas + ' idempotente=' + ([string]$j3.idempotente).ToLowerInvariant()
    if ($null -ne $puladas) { $ok = $ok + ' puladas=' + @($puladas).Count }
    Sair-Com 0 $ok
}

try {
    Invoke-Entrega
}
catch {
    Sair-Com 1 ('ERRO: falha inesperada - ' + $_.Exception.Message)
}
