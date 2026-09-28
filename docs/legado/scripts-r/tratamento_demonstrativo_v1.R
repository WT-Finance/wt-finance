# =============================================================================
# tratamento_demonstrativo_v1.R
# -----------------------------------------------------------------------------
# Transforma o export "Demonstrativo de Resultado" do Monde (pivot com TODOS os
# campos na area de LINHAS) para o formato tidy — uma linha por observacao:
#
#   Tipo | Grupo | Descricao | Ano | Mes | Mes N | Competencia | Valor
#
# -----------------------------------------------------------------------------
# COMO EXPORTAR NO MONDE (pre-requisito)
#   - Arraste Tipo, Grupo, Descricao, Ano e Mes para a area de LINHAS.
#   - Deixe a area de COLUNAS vazia ("Arraste Aqui Campos para Colunas").
#   - Expanda todos os niveis antes de exportar.
#   - Mantenha os subtotais LIGADOS: o script os usa como checksum e depois os
#     descarta. Sao a rede de seguranca da ingestao.
#   - Traga todos os anos num arquivo so (full-swap da base inteira).
#
# ANATOMIA DO ARQUIVO (nada disso e fixo — tudo e autodetectado)
#   - Uma linha de cabecalho com os nomes dos campos, na ordem do pivot.
#     ATENCAO: as COLUNAS desse cabecalho NAO coincidem com as colunas dos
#     dados. No arquivo de referencia o cabecalho esta em B,G,K,M,O e os dados
#     em A,C,D,H,I. Um parser que localizasse as colunas pelo cabecalho leria
#     colunas inteiramente vazias. Por isso nomes e posicoes sao descobertos
#     por caminhos separados.
#   - Uma coluna de valor: a ultima com conteudo (rotulo "Total Geral").
#   - Hierarquia indentada: cada linha traz o rotulo do SEU nivel na coluna
#     daquele nivel; os niveis acima ficam em branco ("" ou vazio) e sao
#     herdados da linha anterior (forward-fill).
#   - Linha de folha = tem rotulo no nivel MAIS PROFUNDO.
#   - Linha de nivel intermediario = subtotal (vira checksum).
#   - Ultima linha = Total Geral.
#
# FILOSOFIA DE ROBUSTEZ
#   1. Nada e localizado por letra de coluna nem por numero de linha. O script
#      descobre a linha de cabecalho, as colunas de rotulo, a coluna de valor e
#      a quantidade de niveis. Sobrevive a reordenacao de campos, linhas
#      inseridas no topo, mudanca no numero de niveis e troca do rotulo da
#      coluna de valor.
#   2. Zero dependencia de locale. Acentos sao tratados por escape Unicode, e
#      nao por iconv/chartr, que se comportam de forma diferente conforme o
#      locale da maquina (sob locale "C", iconv converte "Mes" com acento para
#      "m?s" e a deteccao do campo falharia EM SILENCIO). Ha um autoteste na
#      carga que aborta se essa premissa quebrar.
#   3. A validacao final e aritmetica: TODOS os subtotais tem que fechar com a
#      soma das folhas. Se qualquer premissa estrutural quebrar, o checksum
#      acusa e o script PARA. Nunca grava base silenciosamente errada.
#
# Dependencias: readxl, writexl (so)
# =============================================================================

# ==== 1. Pacotes =============================================================
.garantir_pacote <- function(pkg) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    install.packages(pkg, repos = "https://cloud.r-project.org")
  }
  suppressPackageStartupMessages(library(pkg, character.only = TRUE))
}
.garantir_pacote("readxl")
.garantir_pacote("writexl")

# ==== 2. Constantes ==========================================================
# Ajuste os caminhos conforme a execucao.
pasta <- "C:/Users/Usuario.WELLNB-24/Office 365/Welcome - Documentos/12. Dados Monde"

entrada_dre <- file.path(pasta, "demostrativo_de_resultado.xlsx")
saida_dre   <- file.path(pasta, "Demonstrativo_por_Competencia_tratado.xlsx")

# Tolerancia dos checksums, em reais. O pivot arredonda na exibicao; 0,005
# absorve centavo de arredondamento sem deixar passar erro de verdade.
TOLERANCIA <- 0.005

# Cabecalhos de saida das colunas DERIVADAS (as outras vem do proprio arquivo).
# Escape Unicode de proposito: independe do encoding com que o .R for lido.
ROTULO_MES_N       <- "M\u00eas N\u00ba"      # Mes No
ROTULO_COMPETENCIA <- "Compet\u00eancia"      # Competencia

# ==== 3. Utilitarios =========================================================

# Mapa de acentos por escape Unicode. NAO usar iconv/chartr com literais
# acentuados: ambos dependem do locale e falham em silencio.
.ACENTOS <- c(
  "\u00e1","\u00e0","\u00e2","\u00e3","\u00e4",              # a com acento
  "\u00e9","\u00e8","\u00ea","\u00eb",                       # e
  "\u00ed","\u00ec","\u00ee","\u00ef",                       # i
  "\u00f3","\u00f2","\u00f4","\u00f5","\u00f6",              # o
  "\u00fa","\u00f9","\u00fb","\u00fc",                       # u
  "\u00e7","\u00f1",                                         # c cedilha, n til
  "\u00c1","\u00c0","\u00c2","\u00c3","\u00c4",
  "\u00c9","\u00c8","\u00ca","\u00cb",
  "\u00cd","\u00cc","\u00ce","\u00cf",
  "\u00d3","\u00d2","\u00d4","\u00d5","\u00d6",
  "\u00da","\u00d9","\u00db","\u00dc",
  "\u00c7","\u00d1",
  "\u00ba","\u00aa"                                          # ordinais o/a
)
.SIMPLES <- c(rep("a",5), rep("e",4), rep("i",4), rep("o",5), rep("u",4),
              "c","n",
              rep("a",5), rep("e",4), rep("i",4), rep("o",5), rep("u",4),
              "c","n",
              "","")

# Minusculas, sem acento, espacos colapsados. Para COMPARAR rotulos.
# useBytes = TRUE e essencial: sem ele, sob um locale nao-UTF-8 o gsub tenta
# converter para o encoding nativo, nao casa o acento e devolve a string
# intacta — falha silenciosa. Em bytes, o casamento e sempre o mesmo.
.normalizar <- function(x) {
  s <- enc2utf8(as.character(x))
  for (i in seq_along(.ACENTOS)) {
    s <- gsub(.ACENTOS[i], .SIMPLES[i], s, fixed = TRUE, useBytes = TRUE)
  }
  s <- tolower(trimws(s))            # aqui a string ja e ASCII
  gsub("[[:space:]]+", " ", s)
}

# Autoteste: se o normalizador quebrar por encoding/locale, aborta AGORA em vez
# de deixar a deteccao de campos falhar sem aviso mais adiante.
# Cuidado: vetores PARALELOS, nunca um vetor nomeado. Sob locale nao-UTF-8 os
# NOMES de um vetor perdem a marca de encoding (Encoding() vira "unknown") e o
# proprio teste passaria a medir a coisa errada.
local({
  entrada <- c("M\u00eas", "mar\u00e7o", "Descri\u00e7\u00e3o", "ANO")
  casos   <- c("mes",      "marco",      "descricao",           "ano")
  obtido <- .normalizar(entrada)
  if (!identical(unname(obtido), unname(casos))) {
    stop("Autoteste do normalizador de acentos falhou (locale/encoding).\n",
         "  esperado: ", paste(casos, collapse = ", "), "\n",
         "  obtido:   ", paste(obtido, collapse = ", "), "\n",
         "  O script foi lido com encoding errado. Salve o .R como UTF-8 e/ou\n",
         "  rode em um locale UTF-8. Sem isso a deteccao de campos falha.")
  }
})

# Vazio = NA ou string so com espaco. O pivot usa os dois para "herda do pai".
.eh_vazio <- function(x) is.na(x) | !nzchar(trimws(as.character(x)))

# Indice de coluna -> letra do Excel (A..Z, AA..AZ, ...). Nao quebra apos Z.
.col_letra <- function(n) {
  vapply(n, function(i) {
    s <- ""
    while (i > 0L) {
      r <- (i - 1L) %% 26L
      s <- paste0(LETTERS[r + 1L], s)
      i <- (i - 1L) %/% 26L
    }
    s
  }, character(1), USE.NAMES = FALSE)
}

# Parser de numero tolerante. Usado APENAS quando o Excel entrega a coluna de
# valor como texto (ver 4f). Regra: havendo virgula, a virgula e o decimal e o
# ponto e milhar; sem virgula, o ponto e decimal.
# Recusa-se a adivinhar o caso ambiguo "1.903" (pode ser 1903 ou 1,903):
# devolve NA e deixa o checksum acusar, em vez de gravar numero errado.
.parse_valor_texto <- function(x, avisar = TRUE) {
  s <- as.character(x)
  s <- gsub("\u00a0", "", s, fixed = TRUE, useBytes = TRUE)  # espaco inquebravel
  s <- gsub("R\\$", "", s)
  s <- gsub("[[:space:]]", "", s)
  negativo <- grepl("^\\(.*\\)$", s)                # (1.234,56) = negativo
  s <- gsub("^\\(|\\)$", "", s)

  tem_virgula <- grepl(",", s, fixed = TRUE)
  s[tem_virgula] <- gsub(".", "", s[tem_virgula], fixed = TRUE)
  s[tem_virgula] <- gsub(",", ".", s[tem_virgula], fixed = TRUE)

  ambiguo <- !tem_virgula & grepl("^-?[0-9]{1,3}\\.[0-9]{3}$", s)
  ambiguo[is.na(ambiguo)] <- FALSE
  if (any(ambiguo)) {
    if (avisar) {
      warning(sprintf(paste("%d valor(es) ambiguo(s) (ex.: '%s'): nao da para",
                            "saber se o ponto e milhar ou decimal. NA."),
                      sum(ambiguo), s[which(ambiguo)[1]]), call. = FALSE)
    }
    s[ambiguo] <- NA_character_
  }

  v <- suppressWarnings(as.numeric(s))
  v[negativo & !is.na(v)] <- -abs(v[negativo & !is.na(v)])
  v
}

# Quantas celulas de um vetor de texto parecem numero. Para achar colunas.
.n_numericos <- function(x) {
  s <- as.character(x)
  s <- s[!.eh_vazio(s)]
  if (!length(s)) return(0L)
  sum(!is.na(.parse_valor_texto(s, avisar = FALSE)))
}

# Nome de mes pt-BR -> numero. Aceita nome cheio, abreviacao de 3 letras e o
# proprio numero. Devolve NA no que nao reconhecer (nunca derruba a execucao).
.mes_para_numero <- function(x) {
  cheios <- c("janeiro","fevereiro","marco","abril","maio","junho",
              "julho","agosto","setembro","outubro","novembro","dezembro")
  n <- .normalizar(x)
  out <- match(n, cheios)
  falta <- is.na(out)
  if (any(falta)) out[falta] <- match(substr(n[falta], 1, 3), substr(cheios, 1, 3))
  falta <- is.na(out)
  if (any(falta)) {
    num <- suppressWarnings(as.integer(n[falta]))
    out[falta] <- ifelse(!is.na(num) & num >= 1L & num <= 12L, num, NA_integer_)
  }
  as.integer(out)
}

.fmt <- function(v) format(round(v, 2), big.mark = ".", decimal.mark = ",",
                           nsmall = 2, scientific = FALSE, trim = TRUE)

# ==== 4. Leitura e tratamento ================================================
limpar_demonstrativo <- function(entrada, aba = 1, verbose = TRUE,
                                 tolerancia = TOLERANCIA) {

  if (!file.exists(entrada)) stop("Arquivo de entrada nao encontrado: ", entrada)

  # --- 4a. Le tudo como texto: a estrutura vem antes dos tipos --------------
  bruto <- readxl::read_excel(entrada, sheet = aba, col_names = FALSE,
                              col_types = "text", .name_repair = "minimal")
  bruto <- as.data.frame(bruto, stringsAsFactors = FALSE)
  if (!nrow(bruto) || !ncol(bruto)) stop("Planilha vazia: ", entrada)
  names(bruto) <- paste0("c", seq_len(ncol(bruto)))

  vazio <- vapply(bruto, .eh_vazio, logical(nrow(bruto)))
  dim(vazio) <- c(nrow(bruto), ncol(bruto))
  cheio <- !vazio

  # --- 4b. Coluna de valor: a ultima com qualquer conteudo ------------------
  cols_usadas <- which(colSums(cheio) > 0L)
  if (!length(cols_usadas)) stop("Nenhuma coluna com conteudo em: ", entrada)
  col_valor <- max(cols_usadas)
  if (col_valor == 1L) stop("So ha uma coluna com conteudo — o arquivo nao ",
                            "parece ser o export do Demonstrativo.")
  esq <- seq_len(col_valor - 1L)

  # --- 4c. Linha de cabecalho: a que tem mais rotulos NAO numericos ---------
  limite <- min(30L, nrow(bruto))
  cont <- integer(limite)
  for (i in seq_len(limite)) {
    val <- unlist(bruto[i, esq], use.names = FALSE)
    cont[i] <- sum(cheio[i, esq] & is.na(.parse_valor_texto(val, avisar = FALSE)))
  }
  lin_cabecalho <- which.max(cont)
  campos <- unlist(bruto[lin_cabecalho, esq], use.names = FALSE)
  campos <- trimws(campos[!.eh_vazio(campos)])
  if (length(campos) < 2L) {
    stop("Nao encontrei a linha de cabecalho dos campos do pivot.\n",
         "  Confira se o arquivo e o export do Demonstrativo de Resultado.")
  }

  # --- 4d. Guarda: campos deixados na area de COLUNAS do pivot --------------
  # No formato tidy so a coluna de valor concentra numeros (a de Ano tambem,
  # por serem anos). Muitas colunas numericas => export veio no formato largo.
  n_cols_num <- sum(vapply(seq_len(col_valor),
                           function(j) .n_numericos(bruto[[j]]) >= 5L,
                           logical(1)))
  if (n_cols_num > 3L) {
    stop(sprintf(paste0(
      "Este arquivo esta no formato LARGO (%d colunas com numeros).\n",
      "  Ha campos na area de COLUNAS do pivot.\n",
      "  Corrija no Monde: arraste TODOS os campos (Tipo, Grupo, Descricao,\n",
      "  Ano, Mes) para a area de LINHAS e deixe a area de COLUNAS vazia."),
      n_cols_num))
  }

  # --- 4e. Colunas de rotulo (em ordem) e conferencia com o cabecalho -------
  linhas_dados <- seq.int(lin_cabecalho + 1L, nrow(bruto))
  col_rotulos <- esq[vapply(esq, function(j) any(cheio[linhas_dados, j]),
                            logical(1))]
  if (length(col_rotulos) != length(campos)) {
    stop(sprintf(paste0(
      "Estrutura inesperada: o cabecalho tem %d campo(s) [%s] mas os dados\n",
      "  ocupam %d coluna(s) de rotulo [%s].\n",
      "  Confira se todos os niveis do pivot estao expandidos e se a area de\n",
      "  COLUNAS esta vazia."),
      length(campos), paste(campos, collapse = ", "),
      length(col_rotulos), paste(.col_letra(col_rotulos), collapse = ", ")))
  }
  n_niveis <- length(campos)

  # --- 4f. Coluna de valor tipada. Numerica de verdade e o caminho feliz. ---
  tipos <- rep("text", ncol(bruto)); tipos[col_valor] <- "numeric"
  num <- suppressWarnings(readxl::read_excel(
    entrada, sheet = aba, col_names = FALSE, col_types = tipos,
    .name_repair = "minimal"))
  valores <- as.numeric(num[[col_valor]])

  # Compara so o que PARECE numero no texto: o proprio rotulo da coluna de
  # valor ("Total Geral") mora nessa coluna e nao deve contar como falha.
  texto_val   <- bruto[[col_valor]][linhas_dados]
  parece_num  <- !is.na(.parse_valor_texto(texto_val, avisar = FALSE))
  esperados   <- sum(parece_num)
  obtidos     <- sum(!is.na(valores[linhas_dados]))
  valor_era_texto <- FALSE
  if (obtidos < esperados) {
    valor_era_texto <- TRUE
    warning(sprintf(paste("A coluna de valor veio como TEXTO (%d de %d celulas",
                          "nao leram como numero). Usando o parser pt-BR."),
                    esperados - obtidos, esperados), call. = FALSE)
    valores <- .parse_valor_texto(bruto[[col_valor]])
  }

  # Rotulo da coluna de valor, se houver (so para o diagnostico).
  rot_valor <- NA_character_
  for (i in seq_len(min(lin_cabecalho + 3L, nrow(bruto)))) {
    v <- bruto[i, col_valor]
    if (!.eh_vazio(v) && is.na(.parse_valor_texto(v, avisar = FALSE))) {
      rot_valor <- trimws(as.character(v))
    }
  }

  # --- 4g. Varredura: forward-fill, folhas e subtotais ----------------------
  atual <- rep(NA_character_, n_niveis)
  folhas <- vector("list", length(linhas_dados)); nf <- 0L
  subtotais <- vector("list", length(linhas_dados)); ns <- 0L
  total_geral <- NA_real_; n_ignoradas <- 0L

  for (i in linhas_dados) {
    # Nivel da linha = coluna de rotulo mais a DIREITA que esta preenchida.
    nivel <- 0L
    for (k in seq_len(n_niveis)) if (cheio[i, col_rotulos[k]]) nivel <- k
    v <- valores[i]

    if (nivel == 0L) {
      if (!is.na(v)) n_ignoradas <- n_ignoradas + 1L
      next
    }

    rotulo <- trimws(as.character(bruto[i, col_rotulos[nivel]]))

    # Total Geral: rotulo no primeiro nivel dizendo "total geral".
    if (nivel == 1L && grepl("^total geral", .normalizar(rotulo))) {
      total_geral <- v
      next
    }

    atual[nivel] <- rotulo
    if (nivel < n_niveis) atual[(nivel + 1L):n_niveis] <- NA_character_

    if (nivel == n_niveis) {
      nf <- nf + 1L
      folhas[[nf]] <- c(atual, v)
    } else if (!is.na(v)) {
      ns <- ns + 1L
      subtotais[[ns]] <- list(nivel = nivel, chave = atual[seq_len(nivel)],
                              valor = v)
    }
  }
  if (nf == 0L) {
    stop("Nenhuma linha de folha encontrada. Confira se todos os niveis do ",
         "pivot estao expandidos antes de exportar.")
  }
  folhas <- folhas[seq_len(nf)]; subtotais <- subtotais[seq_len(ns)]

  dados <- as.data.frame(do.call(rbind, folhas), stringsAsFactors = FALSE)
  names(dados) <- c(campos, "Valor")
  dados$Valor <- as.numeric(dados$Valor)

  # --- 4h. Checksums: todo subtotal fecha com a soma das folhas? ------------
  falhas <- character(0)
  for (s in subtotais) {
    m <- rep(TRUE, nrow(dados))
    for (k in seq_len(s$nivel)) m <- m & (dados[[k]] == s$chave[k])
    soma <- sum(dados$Valor[m], na.rm = TRUE)
    if (!is.finite(soma) || abs(soma - s$valor) > tolerancia) {
      falhas <- c(falhas, sprintf("  [%s] %s | subtotal %s | folhas %s | delta %s",
                                  campos[s$nivel],
                                  paste(s$chave, collapse = " > "),
                                  .fmt(s$valor), .fmt(soma),
                                  .fmt(soma - s$valor)))
    }
  }
  soma_folhas <- sum(dados$Valor, na.rm = TRUE)
  n_conf <- length(subtotais)
  if (!is.na(total_geral)) {
    n_conf <- n_conf + 1L
    if (abs(soma_folhas - total_geral) > tolerancia) {
      falhas <- c(falhas, sprintf("  [Total Geral] arquivo %s | folhas %s | delta %s",
                                  .fmt(total_geral), .fmt(soma_folhas),
                                  .fmt(soma_folhas - total_geral)))
    }
  }
  if (length(falhas)) {
    stop(sprintf(paste0(
      "CHECKSUM REPROVADO: %d de %d conferencias falharam. A base NAO foi\n",
      "gravada. Isto quase sempre significa que a estrutura do export mudou\n",
      "ou que algum nivel do pivot ficou colapsado.\n%s%s"),
      length(falhas), n_conf,
      paste(utils::head(falhas, 10), collapse = "\n"),
      if (length(falhas) > 10)
        sprintf("\n  ... e %d outra(s).", length(falhas) - 10) else ""))
  }

  # --- 4i. Colunas derivadas (degradam sem quebrar) ------------------------
  campos_norm <- .normalizar(campos)
  idx_ano <- which(campos_norm == "ano")
  idx_mes <- which(campos_norm == "mes")
  tem_derivadas <- FALSE

  if (length(idx_ano) == 1L && length(idx_mes) == 1L) {
    ano_num <- suppressWarnings(as.integer(dados[[idx_ano]]))
    mes_num <- .mes_para_numero(dados[[idx_mes]])
    prop_ok <- mean(!is.na(ano_num) & !is.na(mes_num))
    if (prop_ok >= 0.9) {
      tem_derivadas <- TRUE
      nao_map <- unique(dados[[idx_mes]][is.na(mes_num)])
      dados[[idx_ano]] <- ano_num
      comp <- rep(as.Date(NA), nrow(dados))
      ok <- !is.na(ano_num) & !is.na(mes_num)
      comp[ok] <- as.Date(sprintf("%04d-%02d-01", ano_num[ok], mes_num[ok]))
      dados[[ROTULO_MES_N]] <- mes_num
      dados[[ROTULO_COMPETENCIA]] <- comp
      dados <- dados[, c(campos, ROTULO_MES_N, ROTULO_COMPETENCIA, "Valor")]
      if (length(nao_map)) {
        warning("Mes(es) nao reconhecido(s): ",
                paste(nao_map, collapse = ", "), call. = FALSE)
      }
    } else {
      warning(sprintf(paste("Campos de ano/mes presentes, mas so %.0f%% dos",
                            "valores sao interpretaveis; colunas derivadas",
                            "nao criadas."), 100 * prop_ok), call. = FALSE)
    }
  } else if (verbose) {
    message("Aviso: nao identifiquei os campos 'Ano' e 'Mes' no cabecalho; ",
            "colunas derivadas nao criadas.")
  }
  rownames(dados) <- NULL

  # --- 4j. Diagnostico -----------------------------------------------------
  if (verbose) {
    message(sprintf("Cabecalho na linha %d | coluna de valor: %s%s",
                    lin_cabecalho, .col_letra(col_valor),
                    if (!is.na(rot_valor)) sprintf(" (\"%s\")", rot_valor) else ""))
    message(sprintf("Niveis (%d): %s", n_niveis, paste(campos, collapse = " > ")))
    message(sprintf("Colunas de rotulo nos dados: %s",
                    paste(.col_letra(col_rotulos), collapse = ", ")))
    message(sprintf("Valor lido como: %s",
                    if (valor_era_texto) "TEXTO (parser pt-BR)" else "numerico"))
    message(sprintf("Folhas: %d | subtotais conferidos: %d | linhas ignoradas: %d",
                    nrow(dados), length(subtotais), n_ignoradas))
    message(sprintf("CHECKSUM OK — %d conferencias, todas fechando.", n_conf))
    message(sprintf("Soma Valor: %s%s", .fmt(soma_folhas),
                    if (!is.na(total_geral)) " (= Total Geral do arquivo)" else ""))
    for (k in seq_len(n_niveis)) {
      message(sprintf("  %s: %d distinto(s)", campos[k],
                      length(unique(dados[[k]]))))
    }
    # Chave composta: nome repetido sob pais diferentes e NORMAL aqui.
    if (n_niveis >= 3L) {
      pares <- unique(dados[, c(2L, 3L)])
      cont_pais <- table(pares[[2L]])
      dup <- names(cont_pais)[cont_pais > 1L]
      message(sprintf("Categorias (chave composta %s + %s): %d",
                      campos[2], campos[3], nrow(pares)))
      if (length(dup)) {
        message(sprintf(paste("  %d nome(s) sob mais de um pai — a chave",
                              "composta e OBRIGATORIA: %s"),
                        length(dup), paste(dup, collapse = ", ")))
      }
    }
    if (tem_derivadas) {
      cob <- tapply(dados[[ROTULO_MES_N]], dados[[idx_ano]],
                    function(x) length(unique(x)))
      message("Cobertura (meses por ano): ",
              paste(sprintf("%s=%d", names(cob), cob), collapse = " | "))
      message(sprintf("Competencia: %s a %s",
                      min(dados[[ROTULO_COMPETENCIA]], na.rm = TRUE),
                      max(dados[[ROTULO_COMPETENCIA]], na.rm = TRUE)))
    }
  }

  dados
}

# ==== 5. Exportador ==========================================================
exportar <- function(dados, saida) {
  if (tolower(tools::file_ext(saida)) == "csv") {
    utils::write.csv2(dados, saida, row.names = FALSE, fileEncoding = "UTF-8")
  } else {
    writexl::write_xlsx(dados, saida)
  }
  message("Arquivo salvo em: ", normalizePath(saida, mustWork = FALSE))
}

# ==== 6. Rodar ===============================================================
message("\n--- Demonstrativo de Resultado (competencia) ---")
demonstrativo <- limpar_demonstrativo(entrada_dre)
exportar(demonstrativo, saida_dre)
